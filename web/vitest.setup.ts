import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; the dashboard rail (OverflowRailNav) observes its
// own height. A no-op stub is enough for render/interaction tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
