import '@testing-library/jest-dom/vitest'

// jsdom has no layout, so Radix's size tracking only needs an observer that never reports.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Radix Select captures the pointer and scrolls the chosen item into view, which jsdom lacks.
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
}
