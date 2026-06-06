import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Keep the default excludes (node_modules, dist, …) and also keep Playwright
    // E2E specs out of the vitest run — they live in e2e/ and use *.spec.ts,
    // which the default include would otherwise pick up.
    exclude: [...configDefaults.exclude, 'e2e/**', 'playwright/**'],
  },
})
