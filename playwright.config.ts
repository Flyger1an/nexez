import { defineConfig } from '@playwright/test'

// Dev canonicalizes on 127.0.0.1 (next.config.ts redirects localhost → 127.0.0.1).
const baseURL = 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
  },
  // Reuses a running dev server if one is already up (e.g. the preview MCP),
  // otherwise boots `npm run dev`. First cold compile can be slow.
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
