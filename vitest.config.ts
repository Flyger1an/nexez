import { defineConfig, configDefaults } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Mirror the tsconfig "@/*" path alias (only matches "@/", so it won't clash
  // with scoped packages like @playwright/test or @testing-library/react).
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./', import.meta.url)) }],
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Keep the default excludes (node_modules, dist, …) and also keep Playwright
    // E2E specs out of the vitest run — they live in e2e/ and use *.spec.ts,
    // which the default include would otherwise pick up.
    exclude: [...configDefaults.exclude, 'e2e/**', 'playwright/**'],
  },
})
