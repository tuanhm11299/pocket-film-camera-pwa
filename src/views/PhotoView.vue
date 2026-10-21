<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useAlert } from '@/composables/useAlert'
import { useObjectURL } from '@/composables/useObjectURL'
import { deletePhoto, getPhoto, type GalleryPhoto } from '@/gallery/db'
import { downloadPhoto, photoFileName, sharePhoto } from '@/photo/share'

/** One photo from the gallery, to share, download or delete. */
const props = defineProps<{ id: string }>()
const router = useRouter()
const alerts = useAlert()

const photo = shallowRef<GalleryPhoto | null>(null)
const url = useObjectURL(computed(() => photo.value?.blob))
const fileName = computed(() => photoFileName(new Date(photo.value?.createdAt ?? Date.now())))
const takenAt = computed(() =>
  photo.value
    ? new Date(photo.value.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '',
)

onMounted(async () => {
  photo.value = (await getPhoto(props.id)) ?? null
  if (!photo.value) void router.replace({ name: 'gallery' })
})

function back() {
  if (window.history.state?.back) router.back()
  else void router.replace({ name: 'gallery' })
}

async function remove() {
  if (!photo.value || !window.confirm('Delete this photo? This can’t be undone.')) return
  try {
    await deletePhoto(photo.value.id)
    back()
  } catch {
    alerts.failed("The photo couldn't be deleted.")
  }
}
</script>

<template>
  <main class="screen viewer">
    <div class="toolbar">
      <button type="button" class="icon-button" aria-label="Back to Photos" @click="back">
        <AppIcon name="back" />
      </button>
      <div v-if="photo" class="caption">
        <span class="title">{{ photo.presetName }}</span>
        <span class="date">{{ takenAt }}</span>
      </div>
      <span class="icon-button" />
    </div>

    <div class="image-area">
      <img v-if="url && photo" :src="url" :alt="`Photo with the ${photo.presetName} look`" />
    </div>

    <div v-if="photo" class="toolbar actions">
      <button
        type="button"
        class="icon-button"
        aria-label="Share"
        @click="sharePhoto(photo.blob, fileName)"
      >
        <AppIcon name="share" />
      </button>
      <button
        type="button"
        class="icon-button"
        aria-label="Download"
        @click="downloadPhoto(photo.blob, fileName)"
      >
        <AppIcon name="download" />
      </button>
      <button type="button" class="icon-button danger" aria-label="Delete" @click="remove">
        <AppIcon name="trash" />
      </button>
    </div>
  </main>
</template>

<style scoped>
.caption {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.date {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.image-area {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
}

.image-area img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.actions {
  justify-content: space-around;
  padding-bottom: 8px;
}

.danger {
  color: var(--danger);
}
</style>
