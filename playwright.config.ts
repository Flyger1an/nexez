import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'

// The authed specs read E2E_EMAIL/E2E_PASSWORD from the environment. Locally
// those live in the gitignored .env.local (the standing "E2E Runner" test
// seller) — load the E2E_* keys from there when the shell doesn't provide
// them, so `npx playwright test` just works without exporting anything.
// Shell/CI env always wins; no secrets are ever committed.
try {
  // cwd-relative like testDir below — playwright runs from the repo root.
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^(E2E_[A-Z_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
  }
} catch {
  // no .env.local (CI) — the authed specs self-skip without creds
}

// Support live deployed testing via TEST_LIVE=1 (skips the local webServer).
// Under the 3-host split (nexez.ai marketing · app.nexez.ai app · nexez.app agent
// runtime) the proxy 308-canonicalizes each route to its host, so a single base
// still reaches every surface via redirects. Default to the agent runtime
// (nexez.app) since the [slug]/agent-page specs are the core; override with
// E2E_BASE_URL to target a specific host (e.g. app.nexez.ai for authed flows).
const isLiveTest = !!process.env.TEST_LIVE
const baseURL = process.env.E2E_BASE_URL || (isLiveTest ? 'https://nexez.app' : 'http://127.0.0.1:3000')

// LLM config for the local dev server is sourced from the environment — never
// committed. Locally it comes from your shell or .env.local; in CI from a GitHub
// Actions secret. LLM_BASE_URL/LLM_MODEL carry non-secret defaults so the server
// still boots; LLM_API_KEY is only forwarded when set (the seeded llm_opt_in E2E
// self-skips when it's absent), so no secret value ever lives in this file.
const devServerEnv: Record<string, string> = {
  LLM_BASE_URL: process.env.LLM_BASE_URL || 'https://api.x.ai/v1',
  LLM_MODEL: process.env.LLM_MODEL || 'grok-4.3',
}
if (process.env.LLM_API_KEY) devServerEnv.LLM_API_KEY = process.env.LLM_API_KEY

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
  // For live tests (TEST_LIVE=1), skip starting local dev server and use the deployed baseURL.
  // For local: reuses a running dev server if one is already up, otherwise boots `npm run dev`.
  ...(isLiveTest ? {} : {
    webServer: {
      command: 'npm run dev',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 180_000,
      env: devServerEnv,
    },
  }),
})
