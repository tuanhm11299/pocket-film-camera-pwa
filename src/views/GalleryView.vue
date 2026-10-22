<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { listPhotos, type GalleryPhoto } from '@/gallery/db'

/** Every photo taken or saved in the app, newest first. */
const router = useRouter()
const photos = ref<{ photo: GalleryPhoto; url: string }[]>([])
const isLoading = ref(true)

onMounted(async () => {
  try {
    photos.value = (await listPhotos()).map((photo) => ({
      photo,
      url: URL.createObjectURL(photo.thumbnail),
    }))
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => photos.value.forEach(({ url }) => URL.revokeObjectURL(url)))

function back() {
  if (window.history.state?.back) router.back()
  else void router.replace({ name: 'camera' })
}
</script>

<template>
  <main class="screen gallery">
    <div class="toolbar">
      <button type="button" class="icon-button" aria-label="Back to Camera" @click="back">
        <AppIcon name="back" />
      </button>
      <h1 class="title">Photos</h1>
      <span class="icon-button" />
    </div>

    <p v-if="!isLoading && photos.length === 0" class="empty">
      Photos you take or save show up here. Open one to share it or save it to your photo library.
      <br /><br />
      On iPhone, Safari and the Home Screen app keep separate photos, so photos taken in one don't
      show up in the other.
    </p>
    <ul v-else class="grid">
      <li v-for="{ photo, url } in photos" :key="photo.id">
        <RouterLink
          :to="{ name: 'photo', params: { id: photo.id } }"
          :aria-label="`${photo.presetName} photo`"
        >
          <img :src="url" alt="" loading="lazy" />
        </RouterLink>
      </li>
    </ul>
    <p v-if="photos.length > 0" class="note">
      Photos are stored in this browser, and on iPhone, Safari and the Home Screen app keep separate
      photos. Share them to keep a copy in your photo library.
    </p>
  </main>
</template>

<style scoped>
.title {
  margin: 0;
  font-size: 1.05rem;
}

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  grid-auto-rows: min-content;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.grid a {
  display: block;
  aspect-ratio: 3 / 4;
}

.grid img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.empty,
.note {
  margin: 0;
  padding: 24px 32px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.note {
  padding: 12px 24px;
  font-size: 0.75rem;
}
</style>
