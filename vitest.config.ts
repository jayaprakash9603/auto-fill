import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
    ],
    setupFiles: ['./vitest.setup.ts'],
    // Testing Library registers its automatic DOM cleanup only when `afterEach` is global. Tests still import from 'vitest'.
    globals: true,
    css: false,
    restoreMocks: true,
    // jsdom suites walk through whole dialogs and scans; on a busy machine they exceed the 5 s default.
    testTimeout: 15_000,
  },
})
