<script setup lang="ts">
// Simple line icons, drawn for this app.
export type IconName =
  | 'flash-off'
  | 'flash-auto'
  | 'flash-on'
  | 'flip'
  | 'photo'
  | 'gallery'
  | 'close'
  | 'back'
  | 'share'
  | 'download'
  | 'trash'
  | 'camera'

defineProps<{ name: IconName }>()

const bolt = 'M13 2 4.5 13.5H11L10 22l8.5-11.5H12z'
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'flash-on'">
      <path :d="bolt" fill="currentColor" />
    </template>
    <template v-else-if="name === 'flash-off'">
      <path :d="bolt" />
      <path d="M3 3l18 18" />
    </template>
    <template v-else-if="name === 'flash-auto'">
      <path :d="bolt" fill="currentColor" transform="translate(-3 0)" />
      <path d="M17 21l2.5-7 2.5 7M17.8 19h3.4" stroke-width="1.5" />
    </template>
    <template v-else-if="name === 'flip'">
      <path d="M4 10a8 8 0 0 1 14.5-3.5L20 8" />
      <path d="M20 3.5V8h-4.5" />
      <path d="M20 14a8 8 0 0 1-14.5 3.5L4 16" />
      <path d="M4 20.5V16h4.5" />
    </template>
    <template v-else-if="name === 'photo'">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="M21 16l-5-5-9 9" />
    </template>
    <template v-else-if="name === 'gallery'">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M6 6l12 12M18 6L6 18" />
    </template>
    <template v-else-if="name === 'back'">
      <path d="M15 5l-7 7 7 7" />
    </template>
    <template v-else-if="name === 'share'">
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
      <path d="M8 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 3v12M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </template>
    <template v-else-if="name === 'camera'">
      <path
        d="M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      />
      <circle cx="12" cy="13" r="3.5" />
    </template>
  </svg>
</template>

<style scoped>
.icon {
  width: 1.5rem;
  height: 1.5rem;
  display: block;
}
</style>
