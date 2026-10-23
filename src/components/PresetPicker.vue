<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { cameraLibrary } from '@/presets/library'
import {
  cameraToggles,
  presetCategories,
  type Camera,
  type CameraChoice,
  type CameraToggle,
  type PresetCategory,
} from '@/presets/types'

/**
 * Category tabs, a horizontal row of cameras, and the selected camera's profiles and options.
 * Shared by the camera and the editor.
 */
const camera = defineModel<Camera>('camera', { required: true })
const choice = defineModel<CameraChoice>('choice', { required: true })

const category = ref<PresetCategory>(camera.value.category)
const row = ref<HTMLElement | null>(null)

const categoryTitle = computed(() => presetCategories.find((c) => c.id === category.value)!.title)
const toggles = computed(() =>
  cameraToggles.filter(
    (t) => camera.value.options[t.id] !== undefined && (t.id !== 'jitter' || choice.value.frame),
  ),
)
const showColors = computed(() => choice.value.frame && camera.value.frameColors.length > 1)

function scrollToSelection(behavior: ScrollBehavior) {
  const chip = row.value?.querySelector<HTMLElement>(`[data-camera="${camera.value.id}"]`)
  if (!chip || !row.value) return
  const left = chip.offsetLeft - (row.value.clientWidth - chip.offsetWidth) / 2
  row.value.scrollTo({ left, behavior })
}

function update(change: Partial<CameraChoice>) {
  choice.value = { ...choice.value, ...change }
}

function toggle(id: CameraToggle) {
  update({ [id]: !choice.value[id] })
}

onMounted(() => scrollToSelection('instant'))
watch(camera, () => nextTick(() => scrollToSelection('smooth')))
watch(category, () =>
  nextTick(() => {
    if (camera.value.category === category.value) scrollToSelection('instant')
    else row.value?.scrollTo({ left: 0 })
  }),
)
</script>

<template>
  <div class="picker">
    <div class="tabs" role="tablist" aria-label="Category">
      <button
        v-for="c in presetCategories"
        :key="c.id"
        type="button"
        role="tab"
        :aria-selected="category === c.id"
        :class="{ active: category === c.id }"
        @click="category = c.id"
      >
        {{ c.title }}
      </button>
    </div>
    <div ref="row" class="chips" role="listbox" :aria-label="`${categoryTitle} cameras`">
      <button
        v-for="c in cameraLibrary.camerasIn(category)"
        :key="c.id"
        type="button"
        role="option"
        class="chip"
        :data-camera="c.id"
        :aria-selected="c.id === camera.id"
        :class="{ selected: c.id === camera.id }"
        @click="camera = c"
      >
        <span class="name">{{ c.name }}</span>
        <span v-if="c.inspiredBy" class="subtitle">{{ c.inspiredBy }}</span>
      </button>
    </div>
    <div v-if="camera.profiles.length > 1 || toggles.length" class="options">
      <div
        v-if="camera.profiles.length > 1"
        class="group"
        role="radiogroup"
        :aria-label="`${camera.name} profile`"
      >
        <button
          v-for="p in camera.profiles"
          :key="p.id"
          type="button"
          role="radio"
          class="pill"
          :aria-checked="p.id === choice.profile"
          :title="p.inspiredBy"
          @click="update({ profile: p.id })"
        >
          {{ p.name }}
        </button>
      </div>
      <button
        v-for="t in toggles"
        :key="t.id"
        type="button"
        class="pill toggle"
        :aria-pressed="choice[t.id]"
        @click="toggle(t.id)"
      >
        {{ t.title }}
      </button>
      <div v-if="showColors" class="group" role="radiogroup" aria-label="Frame color">
        <button
          v-for="c in camera.frameColors"
          :key="c.name"
          type="button"
          role="radio"
          class="swatch"
          :aria-checked="c.name === choice.frameColor"
          :aria-label="c.name"
          :style="{ background: c.color }"
          @click="update({ frameColor: c.name })"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin: 0 16px;
  padding: 2px;
  border-radius: 9px;
  background: var(--fill);
}

.tabs button {
  padding: 6px 0;
  border-radius: 7px;
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 600;
}

.tabs button.active {
  background: var(--fill-strong);
}

.chips,
.options {
  display: flex;
  gap: 8px;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;
  scroll-padding: 0 16px;
}

.chips::-webkit-scrollbar,
.options::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--fill);
  color: var(--text);
  white-space: nowrap;
  text-align: left;
}

.chip.selected {
  background: var(--text);
  color: var(--background);
}

.name {
  font-size: 0.875rem;
  font-weight: 600;
}

.subtitle {
  font-size: 0.7rem;
  opacity: 0.6;
}

.options {
  align-items: center;
}

.group {
  flex: none;
  display: flex;
  gap: 6px;
}

.pill {
  flex: none;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 16px;
  border: 1px solid var(--fill-strong);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

.pill[aria-checked='true'],
.pill[aria-pressed='true'] {
  background: var(--text);
  border-color: var(--text);
  color: var(--background);
}

.toggle[aria-pressed='false'] {
  color: var(--text-secondary);
}

.swatch {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--fill-strong);
}

.swatch[aria-checked='true'] {
  border-color: var(--text);
  box-shadow: 0 0 0 2px var(--background) inset;
}
</style>
