import { fileURLToPath } from 'node:url'

/** The fake camera video, written by globalSetup. Git-ignored. */
export const fakeCameraPath = fileURLToPath(
  new URL('../../.playwright/fake-camera.y4m', import.meta.url),
)
