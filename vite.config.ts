import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/. Override with BASE_PATH for other hosts.
const base = process.env.BASE_PATH ?? '/pocket-film-camera-pwa/'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `--mode test` also builds the renderer test harness used by the Playwright tests.
  const isTest = mode === 'test'
  return {
    base,
    plugins: [
      vue(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg', 'icons/icon.svg'],
        manifest: {
          name: 'Pocket Film',
          short_name: 'Pocket Film',
          description:
            'Take photos that look like film, early digital cameras or disposable cameras.',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#000000',
          theme_color: '#000000',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          globIgnores: ['test-harness.html'],
          navigateFallbackDenylist: [/test-harness/],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      outDir: isTest ? 'dist-test' : 'dist',
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          ...(isTest
            ? { harness: fileURLToPath(new URL('./test-harness.html', import.meta.url)) }
            : {}),
        },
      },
    },
  }
})
