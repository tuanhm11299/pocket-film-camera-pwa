<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { presetLibrary } from '@/presets/library'
import { presetCategories, type FilmPreset, type PresetCategory } from '@/presets/types'

/** Category tabs and a horizontal row of preset chips. Shared by the camera and the editor. */
const selection = defineModel<FilmPreset>({ required: true })

const category = ref<PresetCategory>(selection.value.category)
const row = ref<HTMLElement | null>(null)

function scrollToSelection(behavior: ScrollBehavior) {
  const chip = row.value?.querySelector<HTMLElement>(`[data-preset="${selection.value.id}"]`)
  if (!chip || !row.value) return
  const left = chip.offsetLeft - (row.value.clientWidth - chip.offsetWidth) / 2
  row.value.scrollTo({ left, behavior })
}

onMounted(() => scrollToSelection('instant'))
watch(selection, () => nextTick(() => scrollToSelection('smooth')))
watch(category, () =>
  nextTick(() => {
    if (selection.value.category === category.value) scrollToSelection('instant')
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
    <div ref="row" class="chips" role="listbox" :aria-label="`${category} looks`">
      <button
        v-for="preset in presetLibrary.presetsIn(category)"
        :key="preset.id"
        type="button"
        role="option"
        class="chip"
        :data-preset="preset.id"
        :aria-selected="preset.id === selection.id"
        :class="{ selected: preset.id === selection.id }"
        @click="selection = preset"
      >
        <span class="name">{{ preset.name }}</span>
        <span v-if="preset.inspiredBy" class="subtitle">{{ preset.inspiredBy }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 16px;
  padding: 2px;
  border-radius: 9px;
  background: var(--fill);
}

.tabs button {
  padding: 6px 0;
  border-radius: 7px;
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 600;
}

.tabs button.active {
  background: var(--fill-strong);
}

.chips {
  display: flex;
  gap: 8px;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;
  scroll-padding: 0 16px;
}

.chips::-webkit-scrollbar {
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
</style>
