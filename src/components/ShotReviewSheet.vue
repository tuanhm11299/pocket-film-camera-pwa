<script setup lang="ts">
import { computed } from 'vue'
import type { GalleryPhoto } from '@/gallery/db'
import { useObjectURL } from '@/composables/useObjectURL'
import { photoFileName, sharePhoto } from '@/photo/share'
import AppIcon from './AppIcon.vue'

/** The photo just taken, to look at or share. */
const props = defineProps<{ photo: GalleryPhoto }>()
const emit = defineEmits<{ close: [] }>()

const url = useObjectURL(computed(() => props.photo.blob))

function share() {
  void sharePhoto(props.photo.blob, photoFileName(new Date(props.photo.createdAt)))
}
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Last photo">
      <header>
        <button type="button" class="text-button" @click="emit('close')">Done</button>
        <span class="title">{{ photo.presetName }}</span>
        <button type="button" class="icon-button" aria-label="Share" @click="share">
          <AppIcon name="share" />
        </button>
      </header>
      <img v-if="url" :src="url" :alt="`Photo with the ${photo.presetName} look`" />
      <RouterLink class="all" :to="{ name: 'gallery' }">All Photos</RouterLink>
    </section>
  </div>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 0.6);
}

.sheet {
  width: 100%;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
  background: var(--surface);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-weight: 600;
}

img {
  min-height: 0;
  max-width: 100%;
  object-fit: contain;
  border-radius: 6px;
}

.all {
  align-self: center;
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
  padding: 6px;
}
</style>
