import { computed, shallowRef, watch } from 'vue'
import { cameraLibrary, selectionOrDefault, validChoice } from '@/presets/library'
import type { Camera, CameraChoice } from '@/presets/types'
import { useStoredJSON, useStoredString } from './usePreferences'

/** What the user picked on each camera, shared by the camera and the editor. */
const choicesKey = 'pocket-film.camera-choices'

/**
 * The selected camera, what is picked on it, and the look that gives. Each camera remembers
 * its own profile and options.
 *
 * @param storageKey Where to remember the selected camera, if anywhere.
 * @param fallbackId The camera to start with when nothing is remembered.
 * @param requestedId A camera, "camera/profile" or old preset id to start with instead.
 */
export function useCameraSelection(
  storageKey: string | null,
  fallbackId: string,
  requestedId?: string | null,
) {
  const stored = storageKey ? useStoredString(storageKey, fallbackId) : null
  const choices = useStoredJSON<Record<string, unknown>>(choicesKey, {})

  const start = selectionOrDefault(requestedId ?? stored?.value, fallbackId)
  const choiceFor = (camera: Camera): CameraChoice => validChoice(camera, choices.value[camera.id])

  const camera = shallowRef<Camera>(start.camera)
  const initial = choiceFor(start.camera)
  // A requested or old preset id names a profile; keep the camera's other options.
  const named = requestedId ?? stored?.value
  if (named && cameraLibrary.find(named) && named !== start.camera.id) {
    initial.profile = start.choice.profile
  }
  const choice = shallowRef<CameraChoice>(initial)

  watch(
    camera,
    (c) => {
      choice.value = choiceFor(c)
      if (stored) stored.value = c.id
    },
    { flush: 'sync' },
  )
  watch(choice, (c) => {
    choices.value = { ...choices.value, [camera.value.id]: c }
  })
  if (stored && stored.value !== camera.value.id) stored.value = camera.value.id
  choices.value = { ...choices.value, [camera.value.id]: choice.value }

  const look = computed(() => cameraLibrary.resolve(camera.value, choice.value))
  return { camera, choice, look }
}
