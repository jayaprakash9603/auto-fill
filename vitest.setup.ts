import '@testing-library/jest-dom/vitest'

// jsdom has no layout, so Radix's size tracking only needs an observer that never reports.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
