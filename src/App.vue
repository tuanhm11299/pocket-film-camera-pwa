<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'
import AppAlert from '@/components/AppAlert.vue'

// The service worker keeps the app working offline. A new version waits until the user agrees.
const { needRefresh, updateServiceWorker } = useRegisterSW()
</script>

<template>
  <RouterView />
  <AppAlert />
  <div v-if="needRefresh" class="update" role="status">
    <span>A new version is available.</span>
    <button type="button" class="text-button" @click="updateServiceWorker(true)">Update</button>
    <button type="button" class="text-button dismiss" @click="needRefresh = false">Later</button>
  </div>
</template>

<style scoped>
.update {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(env(safe-area-inset-bottom) + 12px);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 16px;
  border-radius: 12px;
  background: var(--surface);
  font-size: 0.9rem;
}

.update span {
  flex: 1;
}

.dismiss {
  color: var(--text-secondary);
}
</style>
