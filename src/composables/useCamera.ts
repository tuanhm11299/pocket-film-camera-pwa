import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { addPhoto, latestPhoto, type GalleryPhoto } from '@/gallery/db'
import type { FilmPreset } from '@/presets/types'
import { encodePhoto } from '@/render/encode'
import { FilmRenderer } from '@/render/FilmRenderer'
import { framedAspect } from '@/render/geometry'
import { newRenderOptions, type RenderOptions } from '@/render/renderOptions'
import {
  CameraDeniedError,
  CameraService,
  cameraSupported,
  type Facing,
  type FlashMode,
} from '@/camera/cameraService'
import { useAlert } from './useAlert'

export type CameraStatus = 'unavailable' | 'starting' | 'denied' | 'running' | 'paused'

/** Looks without a shape of their own shoot 3:4 portrait, like the iOS app. */
export const defaultCameraAspect = [3, 4] as const

const maxPixelRatio = 2

/**
 * The camera screen's state: stream, viewfinder, flash, capture and saving.
 * Draws the live, filtered viewfinder into `canvas`.
 */
export function useCamera(canvas: Ref<HTMLCanvasElement | null>, look: Ref<FilmPreset>) {
  const alerts = useAlert()
  const preset = computed(() =>
    look.value.aspect ? look.value : { ...look.value, aspect: defaultCameraAspect },
  )
  /** Width over height of the viewfinder and photos, frame included. */
  const viewfinderAspect = computed(() => framedAspect(preset.value.aspect!, preset.value.frame))
  const status = ref<CameraStatus>('starting')
  const flashMode = ref<FlashMode>('off')
  const supportsFlash = ref(false)
  const facing = ref<Facing>('environment')
  const isCapturing = ref(false)
  /** Briefly true when the shutter fires, to blink the viewfinder. */
  const isBlinking = ref(false)
  const lastShot = shallowRef<GalleryPhoto | null>(null)

  const service = cameraSupported() ? new CameraService() : null
  let renderer: FilmRenderer | null = null
  /**
   * The seed and date the next photo will use. The viewfinder uses it too, so its grain
   * and light leak match the photo; it changes after every shot.
   */
  let nextOptions: RenderOptions = newRenderOptions()
  let frameHandle = 0
  let disposed = false

  async function start() {
    if (!service || !renderer) {
      status.value = 'unavailable'
      return
    }
    if (document.visibilityState === 'hidden' || disposed) return
    status.value = 'starting'
    try {
      await service.start(facing.value)
      if (disposed) {
        service.stop()
        return
      }
      supportsFlash.value = service.supportsFlash
      status.value = 'running'
      scheduleFrame()
    } catch (error) {
      status.value = error instanceof CameraDeniedError ? 'denied' : 'unavailable'
    }
  }

  function stop() {
    cancelFrame()
    service?.stop()
    if (status.value === 'running') status.value = 'paused'
  }

  function scheduleFrame() {
    cancelFrame()
    const video = service?.video
    if (!video) return
    if ('requestVideoFrameCallback' in video) {
      frameHandle = video.requestVideoFrameCallback(drawFrame)
    } else {
      frameHandle = requestAnimationFrame(drawFrame)
    }
  }

  function cancelFrame() {
    const video = service?.video
    if (!frameHandle || !video) return
    if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(frameHandle)
    else cancelAnimationFrame(frameHandle)
    frameHandle = 0
  }

  function drawFrame() {
    frameHandle = 0
    if (status.value !== 'running' || !service || !renderer || !canvas.value) return
    const video = service.video
    const element = canvas.value
    const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio)
    const width = Math.round(element.clientWidth * ratio)
    const height = Math.round(element.clientHeight * ratio)
    if (video.videoWidth && width > 0 && height > 0) {
      const source = {
        image: video,
        width: video.videoWidth,
        height: video.videoHeight,
        live: true,
      }
      renderer.render(preset.value, source, nextOptions, width, height)
    }
    scheduleFrame()
  }

  function cycleFlash() {
    flashMode.value = flashMode.value === 'off' ? 'auto' : flashMode.value === 'auto' ? 'on' : 'off'
  }

  async function switchCamera() {
    if (status.value !== 'running') return
    facing.value = facing.value === 'environment' ? 'user' : 'environment'
    cancelFrame()
    await start()
  }

  function blink() {
    isBlinking.value = true
    setTimeout(() => (isBlinking.value = false), 120)
  }

  async function capture() {
    if (!service || status.value !== 'running' || isCapturing.value) return
    isCapturing.value = true
    blink()
    navigator.vibrate?.(15)
    const shotPreset = preset.value
    const options = { ...nextOptions, date: new Date() }
    // The viewfinder pauses while the photo is rendered, so the two don't compete for the GPU.
    cancelFrame()

    let encoded
    try {
      const frame = await service.capture(flashMode.value)
      // Ready for the next shot while this one is processed and saved.
      nextOptions = newRenderOptions()
      encoded = await encodePhoto(shotPreset, frame, options)
      if (frame.image instanceof ImageBitmap) frame.image.close()
    } catch {
      alerts.failed("The photo couldn't be taken.")
      return
    } finally {
      isCapturing.value = false
      if (status.value === 'running') scheduleFrame()
    }

    try {
      lastShot.value = await addPhoto({
        blob: encoded.blob,
        thumbnail: encoded.thumbnail,
        presetId: shotPreset.id,
        presetName: shotPreset.name,
        width: encoded.width,
        height: encoded.height,
      })
    } catch {
      alerts.failed("The photo couldn't be saved. Your browser may be out of storage.")
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') stop()
    else if (status.value === 'paused' || status.value === 'starting') void start()
  }

  onMounted(async () => {
    if (service && canvas.value && FilmRenderer.isSupported()) {
      try {
        renderer = new FilmRenderer(canvas.value)
      } catch {
        renderer = null
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    latestPhoto()
      .then((photo) => (lastShot.value ??= photo ?? null))
      .catch(() => undefined)
    await start()
  })

  onBeforeUnmount(() => {
    disposed = true
    document.removeEventListener('visibilitychange', onVisibilityChange)
    stop()
    renderer?.dispose()
    renderer = null
  })

  // Draw at least once when the look changes, even if the video is paused.
  watch(preset, () => {
    if (status.value === 'running' && !frameHandle) scheduleFrame()
  })

  return {
    viewfinderAspect,
    status,
    flashMode,
    supportsFlash,
    facing,
    isCapturing,
    isBlinking,
    lastShot,
    start,
    cycleFlash,
    switchCamera,
    capture,
  }
}
