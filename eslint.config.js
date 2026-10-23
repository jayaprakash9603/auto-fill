import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '**/dist-*',
    'release',
    'coverage',
    'playwright-report',
    'test-results',
    '.tmp',
    'apps/*/public/content-script.js',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'chrome',
          message: 'Only extension-bridge and apps may touch Chrome APIs; inject them instead.',
        },
      ],
      'no-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['e2e/**'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['packages/extension-bridge/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, prettier],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.config.{ts,js}', 'scripts/**', 'e2e/**', '**/scripts/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // Playwright fixtures must destructure their (possibly empty) dependencies.
    files: ['e2e/**'],
    rules: { 'no-empty-pattern': 'off' },
  },
])
