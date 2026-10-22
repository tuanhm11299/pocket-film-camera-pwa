<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PresetPicker from '@/components/PresetPicker.vue'
import { useAlert } from '@/composables/useAlert'
import { addPhoto } from '@/gallery/db'
import { defaultEditorPresetId, presetLibrary, presetOrDefault } from '@/presets/library'
import type { FilmPreset } from '@/presets/types'
import { encodePhoto, type EncodedPhoto } from '@/render/encode'
import { FilmRenderer } from '@/render/FilmRenderer'
import { newRenderOptions, type RenderOptions } from '@/render/renderOptions'
import { takePendingPhoto } from '@/photo/pendingPhoto'
import { useSharePhoto } from '@/composables/useSharePhoto'
import { photoFileName } from '@/photo/share'
import { loadSourcePhoto, UnreadablePhotoError, type SourcePhoto } from '@/photo/sourcePhoto'

/** Applies presets to one photo from the library, then saves or shares it. */
const route = useRoute()
const router = useRouter()
const alerts = useAlert()
const sharePhoto = useSharePhoto()

const preset = shallowRef<FilmPreset>(
  presetOrDefault(
    typeof route.query.preset === 'string' ? route.query.preset : null,
    defaultEditorPresetId,
  ),
)
const photo = shallowRef<SourcePhoto | null>(null)
const isLoading = ref(true)
const isWorking = ref(false)
/** True while the photo is held, to compare with the original. */
const showOriginal = ref(false)
const canvas = ref<HTMLCanvasElement | null>(null)

let renderer: FilmRenderer | null = null
/** Picked once per photo, so grain and light leaks match between preview and saved photo. */
let options: RenderOptions = newRenderOptions()
/** The last full-resolution render, reused when the same look is saved and shared. */
let encoded: { presetId: string; photo: EncodedPhoto } | null = null
let savedPresetId: string | null = null

const clean = presetLibrary.preset('clean')!

function close() {
  if (window.history.state?.back) router.back()
  else void router.replace({ name: 'camera' })
}

function draw() {
  const p = photo.value
  if (!p || !renderer) return
  const source = { image: p.preview, width: p.preview.width, height: p.preview.height }
  renderer.render(
    showOriginal.value ? clean : preset.value,
    source,
    options,
    source.width,
    source.height,
  )
}

async function fullResolution(): Promise<EncodedPhoto> {
  const p = photo.value!
  if (encoded?.presetId !== preset.value.id) {
    const result = await encodePhoto(
      preset.value,
      { image: p.full, width: p.width, height: p.height },
      options,
    )
    encoded = { presetId: preset.value.id, photo: result }
  }
  return encoded.photo
}

async function save() {
  if (!photo.value || isWorking.value) return
  isWorking.value = true
  try {
    const result = await fullResolution()
    if (savedPresetId !== preset.value.id) {
      await addPhoto({
        blob: result.blob,
        thumbnail: result.thumbnail,
        presetId: preset.value.id,
        presetName: preset.value.name,
        width: result.width,
        height: result.height,
      })
      savedPresetId = preset.value.id
    }
    alerts.saved()
  } catch {
    alerts.failed("The photo couldn't be saved.")
  } finally {
    isWorking.value = false
  }
}

async function share() {
  if (!photo.value || isWorking.value) return
  isWorking.value = true
  try {
    const result = await fullResolution()
    await sharePhoto(result.blob, photoFileName(options.date))
  } catch {
    alerts.failed("The photo couldn't be shared.")
  } finally {
    isWorking.value = false
  }
}

onMounted(async () => {
  const file = takePendingPhoto()
  if (!file) {
    void router.replace({ name: 'camera' })
    return
  }
  try {
    renderer = new FilmRenderer(canvas.value!)
  } catch {
    isLoading.value = false
    alerts.failed('This browser can’t apply film looks, because WebGL 2 is turned off or missing.')
    return
  }
  try {
    const loaded = await loadSourcePhoto(file)
    options = newRenderOptions(loaded.captureDate ?? new Date())
    photo.value = loaded
    draw()
  } catch (error) {
    alerts.failed(
      error instanceof UnreadablePhotoError ? error.message : "This photo couldn't be opened.",
    )
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  renderer?.dispose()
  photo.value?.full.close()
  if (photo.value?.preview !== photo.value?.full) photo.value?.preview.close()
})

watch([preset, showOriginal], draw)
</script>

<template>
  <main class="screen editor">
    <div class="toolbar">
      <button type="button" class="icon-button" aria-label="Close" @click="close">
        <AppIcon name="close" />
      </button>
      <div class="actions">
        <button
          type="button"
          class="icon-button"
          aria-label="Share"
          :disabled="!photo || isWorking"
          @click="share"
        >
          <AppIcon name="share" />
        </button>
        <button type="button" class="pill-button" :disabled="!photo || isWorking" @click="save">
          {{ isWorking ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <div
      class="photo-area"
      @pointerdown="showOriginal = true"
      @pointerup="showOriginal = false"
      @pointercancel="showOriginal = false"
      @pointerleave="showOriginal = false"
      @contextmenu.prevent
    >
      <canvas
        ref="canvas"
        role="img"
        :aria-label="photo ? `Photo with the ${preset.name} look` : 'Loading photo'"
        :class="{ hidden: !photo }"
      />
      <div v-if="isLoading" class="status">Opening photo…</div>
      <div v-if="showOriginal && photo" class="badge">Original</div>
    </div>
    <p class="hint">Touch and hold the photo to see the original.</p>

    <PresetPicker v-model="preset" />
  </main>
</template>

<style scoped>
.editor {
  gap: 12px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 16px);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.photo-area {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 0 16px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

canvas.hidden {
  visibility: hidden;
}

.status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
}

.badge {
  position: absolute;
  top: 8px;
  left: 50%;
  translate: -50% 0;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgb(0 0 0 / 0.6);
  font-size: 0.8rem;
  font-weight: 600;
}

.hint {
  margin: 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
</style>
