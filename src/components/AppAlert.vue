<script setup lang="ts">
import { useAlert } from '@/composables/useAlert'

const { alert, dismiss } = useAlert()

function runAction() {
  const action = alert.value?.action
  dismiss()
  // Runs inside this tap, so the browser allows things like the share sheet.
  action?.run()
}
</script>

<template>
  <Transition name="fade">
    <div v-if="alert" class="backdrop" @click.self="dismiss">
      <div class="alert" role="alertdialog" aria-modal="true" :aria-label="alert.title">
        <h2>{{ alert.title }}</h2>
        <p v-if="alert.message">{{ alert.message }}</p>
        <div v-if="alert.action" class="buttons">
          <button type="button" class="cancel" @click="dismiss">Cancel</button>
          <button type="button" class="ok" autofocus @click="runAction">
            {{ alert.action.label }}
          </button>
        </div>
        <button v-else type="button" class="ok" autofocus @click="dismiss">OK</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.5);
}

.alert {
  width: min(300px, 100%);
  padding: 20px 16px 8px;
  border-radius: 14px;
  background: var(--surface);
  text-align: center;
}

h2 {
  margin: 0 0 6px;
  font-size: 1.05rem;
}

p {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.ok,
.cancel {
  width: 100%;
  padding: 12px;
  border-top: 1px solid var(--separator);
  color: var(--accent);
  font-weight: 600;
}

.cancel {
  font-weight: 400;
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.buttons .ok {
  border-left: 1px solid var(--separator);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
