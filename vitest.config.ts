import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        include: ['tests/unit/**/*.test.ts'],
        environment: 'node',
        root: fileURLToPath(new URL('./', import.meta.url)),
      },
    }),
  ),
)
