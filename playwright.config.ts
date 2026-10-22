import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import { fakeCameraPath } from './tests/e2e/paths'

const port = 4173
const base = '/pocket-film-camera-pwa/'

/**
 * The tests run against a production build (`--mode test` adds the renderer harness page),
 * so the service worker and offline behavior are tested too.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/globalSetup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}${base}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 7'],
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            // A small video file instead of the generated 2560×1920 stream; see tests/e2e/fakeCamera.ts.
            `--use-file-for-fake-video-capture=${fakeCameraPath}`,
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite build --mode test && npx vite preview --mode test --port ${port} --strictPort`,
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
