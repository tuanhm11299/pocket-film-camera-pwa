export type Facing = 'environment' | 'user'
export type FlashMode = 'off' | 'auto' | 'on'

export class CameraDeniedError extends Error {}
export class CameraUnavailableError extends Error {}

/** A photo from the camera: either a full-resolution still or the current video frame. */
export interface CapturedFrame {
  image: ImageBitmap | HTMLVideoElement
  width: number
  height: number
}

// Not in TypeScript's DOM library yet: https://w3c.github.io/mediacapture-image/
interface PhotoCapabilities {
  fillLightMode?: string[]
}
interface ImageCaptureLike {
  takePhoto(settings?: { fillLightMode?: string }): Promise<Blob>
  getPhotoCapabilities(): Promise<PhotoCapabilities>
}
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike } | undefined

export function cameraSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia
}

/**
 * The camera stream. Shows in a hidden <video>, which the viewfinder draws from.
 *
 * Photos come from `ImageCapture.takePhoto` where the browser has it (Chrome on Android:
 * full resolution and the real flash) and from the current video frame elsewhere (Safari).
 */
export class CameraService {
  readonly video: HTMLVideoElement
  private stream: MediaStream | null = null
  private imageCapture: ImageCaptureLike | null = null
  private flashModes: string[] = []

  constructor() {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    this.video = video
  }

  get isRunning(): boolean {
    return !!this.stream?.active
  }

  get supportsFlash(): boolean {
    return this.flashModes.includes('flash')
  }

  /** Starts the camera facing `facing`. */
  async start(facing: Facing): Promise<void> {
    this.stop()
    if (!cameraSupported()) throw new CameraUnavailableError('No camera')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          // 4:3 like a phone's still camera. Bigger frames cost more to draw 30 times a second.
          width: { ideal: 2560 },
          height: { ideal: 1920 },
        },
      })
    } catch (error) {
      const name = (error as Error).name
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraDeniedError(name)
      throw new CameraUnavailableError(name)
    }
    this.stream = stream
    this.video.srcObject = stream
    await this.video.play().catch(() => undefined)
    await this.waitForFrames()

    const track = stream.getVideoTracks()[0]
    this.imageCapture = null
    this.flashModes = []
    if (track && typeof ImageCapture !== 'undefined') {
      try {
        this.imageCapture = new ImageCapture(track)
        this.flashModes = (await this.imageCapture.getPhotoCapabilities()).fillLightMode ?? []
      } catch {
        this.imageCapture = null
      }
    }
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.imageCapture = null
    this.video.srcObject = null
  }

  async capture(flash: FlashMode): Promise<CapturedFrame> {
    if (this.imageCapture) {
      try {
        const mode = this.supportsFlash ? flash : 'off'
        const blob = await this.imageCapture.takePhoto(
          this.flashModes.includes(mode) ? { fillLightMode: mode } : {},
        )
        const image = await createImageBitmap(blob, { imageOrientation: 'from-image' })
        return { image, width: image.width, height: image.height }
      } catch {
        // Some cameras can't take stills; use the video frame instead.
      }
    }
    if (!this.video.videoWidth) throw new CameraUnavailableError('No frame')
    return { image: this.video, width: this.video.videoWidth, height: this.video.videoHeight }
  }

  private waitForFrames(): Promise<void> {
    if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.videoWidth) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const done = () => {
        this.video.removeEventListener('loadeddata', done)
        resolve()
      }
      this.video.addEventListener('loadeddata', done)
      setTimeout(done, 3000)
    })
  }
}
