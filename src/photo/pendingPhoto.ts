import { shallowRef } from 'vue'

/** The library photo picked on the camera screen, handed to the editor. */
export const pendingPhoto = shallowRef<File | null>(null)

export function takePendingPhoto(): File | null {
  const file = pendingPhoto.value
  pendingPhoto.value = null
  return file
}
