import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts}'],
  },

  globalIgnores(['**/dist/**', '**/dist-test/**', '**/coverage/**', 'playwright-report/**']),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['tests/e2e/**/*.ts'],
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['tests/unit/**/*.ts'],
    rules: {
      ...pluginVitest.configs.recommended.rules,
      // Vitest takes a failure message as the second argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },

  skipFormatting,
)
