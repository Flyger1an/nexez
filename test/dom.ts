// Shared helpers for jsdom component tests. Import from here (instead of
// @testing-library/react directly) so every component test gets the jest-dom
// matchers and automatic DOM cleanup between tests.
//
// Each component test file must declare the environment at the top:
//   // @vitest-environment jsdom
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => cleanup())

// jsdom doesn't implement matchMedia; several components call it (theme, etc.).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// jsdom lacks ResizeObserver; dnd-kit / chart libs reference it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

export * from '@testing-library/react'
