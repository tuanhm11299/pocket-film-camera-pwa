import { shallowRef } from 'vue'

export interface AppAlert {
  title: string
  message?: string
}

const current = shallowRef<AppAlert | null>(null)

/** One app-wide alert, like `PhotoAlert` in the iOS app. */
export function useAlert() {
  return {
    alert: current,
    show(alert: AppAlert) {
      current.value = alert
    },
    saved() {
      current.value = { title: 'Saved', message: 'The photo is in your gallery.' }
    },
    failed(message: string) {
      current.value = { title: 'Something Went Wrong', message }
    },
    dismiss() {
      current.value = null
    },
  }
}
