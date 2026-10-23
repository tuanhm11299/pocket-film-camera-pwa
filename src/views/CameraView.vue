<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import PresetPicker from '@/components/PresetPicker.vue'
import ShotReviewSheet from '@/components/ShotReviewSheet.vue'
import { useCamera } from '@/composables/useCamera'
import { useObjectURL } from '@/composables/useObjectURL'
import { useCameraSelection } from '@/composables/useCameraSelection'
import { defaultCameraId } from '@/presets/library'
import { pendingPhoto } from '@/photo/pendingPhoto'

/**
 * The app's home screen: a live viewfinder with the selected look, the shutter, and a
 * library button that opens photos in the editor.
 */
const router = useRouter()
const {
  camera: selectedCamera,
  choice,
  look,
} = useCameraSelection('pocket-film.camera-preset', defaultCameraId)

const canvas = ref<HTMLCanvasElement | null>(null)
const camera = useCamera(canvas, look)
const { status, flashMode, supportsFlash, facing, isCapturing, isBlinking, lastShot } = camera
const viewfinderStyle = computed(() => {
  const aspect = camera.viewfinderAspect.value
  // As large as fits, at the photo's shape.
  return { aspectRatio: `${aspect}`, width: `min(100cqw, ${aspect * 100}cqh)` }
})

const thumbnailURL = useObjectURL(computed(() => lastShot.value?.thumbnail))
const reviewing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const canCapture = computed(() => status.value === 'running' && !isCapturing.value)
const flashLabel = computed(() => ({ off: 'Off', auto: 'Auto', on: 'On' })[flashMode.value])

function openLibrary() {
  fileInput.value?.click()
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  pendingPhoto.value = file
  void router.push({ name: 'edit', query: { preset: look.value.id } })
}
</script>

<template>
  <main class="screen camera">
    <div class="toolbar top">
      <template v-if="status === 'running' || status === 'paused'">
        <button
          v-if="supportsFlash"
          type="button"
          class="icon-button"
          :class="{ lit: flashMode !== 'off' }"
          aria-label="Flash"
          :aria-description="flashLabel"
          @click="camera.cycleFlash"
        >
          <AppIcon :name="`flash-${flashMode}`" />
        </button>
        <span v-else />
        <button
          type="button"
          class="icon-button"
          :disabled="status !== 'running'"
          :aria-label="
            facing === 'environment' ? 'Switch to Front Camera' : 'Switch to Back Camera'
          "
          @click="camera.switchCamera"
        >
          <AppIcon name="flip" />
        </button>
      </template>
    </div>

    <div class="viewfinder-area">
      <div
        class="viewfinder"
        :style="viewfinderStyle"
        :aria-label="`Viewfinder, ${look.name}`"
        role="img"
      >
        <canvas ref="canvas" :class="{ hidden: status !== 'running' }" />
        <div v-if="status === 'unavailable'" class="message">
          <AppIcon name="camera" class="message-icon" />
          <strong>Camera Not Available</strong>
          <span>You can still give photos from your library a film look.</span>
        </div>
        <div v-else-if="status === 'denied'" class="message">
          <AppIcon name="camera" class="message-icon" />
          <strong>Camera Access Needed</strong>
          <span>
            Allow Pocket Film to use the camera in your browser's site settings, then try again.
          </span>
          <button type="button" class="pill-button" @click="camera.start">Try Again</button>
        </div>
        <div v-else-if="status === 'paused'" class="message">
          <strong>Camera Paused</strong>
          <button type="button" class="pill-button" @click="camera.start">Resume</button>
        </div>
        <div class="blink" :class="{ on: isBlinking }" />
      </div>
    </div>

    <PresetPicker v-model:camera="selectedCamera" v-model:choice="choice" />

    <div class="bottom-bar">
      <div class="side">
        <button
          v-if="lastShot && thumbnailURL"
          type="button"
          class="thumbnail"
          aria-label="Last Photo"
          @click="reviewing = true"
        >
          <img :src="thumbnailURL" alt="" />
        </button>
        <RouterLink v-else class="round-button" :to="{ name: 'gallery' }" aria-label="Gallery">
          <AppIcon name="gallery" />
        </RouterLink>
      </div>
      <button
        type="button"
        class="shutter"
        :disabled="!canCapture"
        aria-label="Take Photo"
        @click="camera.capture"
      >
        <span />
      </button>
      <div class="side">
        <button
          type="button"
          class="round-button"
          aria-label="Edit a Photo from Your Library"
          @click="openLibrary"
        >
          <AppIcon name="photo" />
        </button>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept="image/*"
          tabindex="-1"
          aria-hidden="true"
          @change="onFilePicked"
        />
      </div>
    </div>

    <ShotReviewSheet v-if="reviewing && lastShot" :photo="lastShot" @close="reviewing = false" />
  </main>
</template>

<style scoped>
.camera {
  gap: 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 12px);
}

.top {
  padding: 0 8px;
}

.lit {
  color: var(--flash);
}

.viewfinder-area {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 0 0;
  container-type: size;
}

.viewfinder {
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

canvas.hidden {
  visibility: hidden;
}

.message {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 32px;
  text-align: center;
  background: rgb(0 0 0 / 0.7);
}

.message span {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.message .pill-button {
  margin-top: 8px;
}

.message-icon {
  width: 40px;
  height: 40px;
}

.blink {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease-out;
}

.blink.on {
  opacity: 1;
  transition: none;
}

.bottom-bar {
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.side {
  flex: 1;
  display: flex;
  justify-content: center;
}

.round-button,
.thumbnail {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  color: var(--text);
}

.round-button {
  border-radius: 50%;
  background: var(--fill);
}

.thumbnail img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid rgb(255 255 255 / 0.6);
}

.shutter {
  width: 78px;
  height: 78px;
  padding: 5px;
  border-radius: 50%;
  border: 3px solid #fff;
}

.shutter span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.1s;
}

.shutter:active:not(:disabled) span {
  transform: scale(0.9);
}
</style>
