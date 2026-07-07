import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Intake interview smoke (spec §10). Three layers:
//   1. The /create fork renders and switches (always runs, unauthenticated).
//   2. The intake API's auth gate surfaces the sign-in path (always runs).
//   3. The full interview loop — scratch start → skip the blocking batch via
//      quick answers → draft summary → commit → land in the builder — gated on
//      E2E_EMAIL/E2E_PASSWORD like the rest of the authed suite. Deterministic
//      mode (no LLM) drives it, so the loop is stable; LLM-mapped stated fields
//      are covered by the lib/route suites and the live-verify pass.
// Cleanup: when SUPABASE_SERVICE_ROLE_KEY is present, the created draft page +
// intake session are deleted afterward (never leaves test data behind).

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.describe('create fork (talk vs form)', () => {
  test('/create defaults to Talk it through and switches to the wizard', async ({ page }) => {
    await page.goto('/create', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('create-talk-mode')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Talk your listing into existence' })).toBeVisible()
    await expect(page.getByText('Start with my site')).toBeVisible()
    await expect(page.getByText('Start from scratch')).toBeVisible()

    // the wizard is one click away and fully intact
    await page.getByTestId('switch-to-form').click()
    await expect(page.getByText('Turn an existing site into a Nexez draft')).toBeVisible()
  })

  test('?mode=form deep-links straight to the wizard (import/template entries preserved)', async ({ page }) => {
    await page.goto('/create?mode=form', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Turn an existing site into a Nexez draft')).toBeVisible()
    await expect(page.getByTestId('create-talk-mode')).not.toBeVisible()
  })

  test('?reinterview deep-links into re-interview mode (editor entry)', async ({ page }) => {
    await page.goto('/create?reinterview=some-page-id', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Give this listing another pass' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Re-interview this listing' })).toBeVisible()
    await expect(page.getByText('Start the re-interview')).toBeVisible()
    // create-only entries are gone in this mode
    await expect(page.getByText('Start from scratch')).not.toBeVisible()
    await expect(page.getByTestId('switch-to-form')).not.toBeVisible()
  })

  test('unauthenticated interview start routes to sign-in (real API 401)', async ({ page }) => {
    // The resume-check GET fires from a mount effect, so its response is a
    // reliable "hydration complete" signal — clicking before hydration would
    // hit an inert SSR button.
    const hydrated = page.waitForResponse((r) => r.url().includes('/api/agents/intake/threads'))
    await page.goto('/create', { waitUntil: 'domcontentloaded' })
    await hydrated
    await page.getByText('Start from scratch').click()
    await expect(page.getByText(/Sign in to start your interview/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start your free trial' })).toHaveAttribute('href', '/onboard?next=/create')
  })
})

test.describe('authed interview loop', () => {
  test('scratch interview → skip blocking gaps → draft summary → commit → builder', async ({ page }) => {
    test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD to run the authed intake E2E')
    // Commit needs the SERVER's admin env (SUPABASE_SERVICE_ROLE_KEY) — absent
    // on a local dev server by design (prod-only secret), so this leg only runs
    // against a deployment: TEST_LIVE=1 E2E_BASE_URL=https://app.nexez.ai.
    // Prod turns ride the real LLM (~25s each), hence the generous budget.
    test.skip(!process.env.TEST_LIVE, 'commit needs the deployed server — run with TEST_LIVE=1 E2E_BASE_URL=https://app.nexez.ai')
    test.setTimeout(300_000)

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(password!)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })

    const hydrated = page.waitForResponse((r) => r.url().includes('/api/agents/intake/threads'))
    await page.goto('/create', { waitUntil: 'domcontentloaded' })
    await hydrated
    await page.getByText('Start from scratch').click()

    // The deterministic interviewer asks the machine's first blocking batch.
    await expect(page.getByRole('heading', { name: 'Nexez intake' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('What is the name of your business?')).toBeVisible()

    // Skip through blocking gaps (quick answers post STRUCTURED answers through
    // the reducer — the no-LLM path). The summary card appears once no blocking
    // gap remains askable. Earlier cards keep their (idempotent) Skip chips as
    // the transcript grows, so always act on the NEWEST batch (.last()), and
    // key each round on the real turn response, not a fixed wait.
    for (let round = 0; round < 8; round++) {
      const summaryVisible = await page
        .getByRole('button', { name: /Review in the builder/ })
        .first()
        .isVisible()
        .catch(() => false)
      if (summaryVisible) break
      // Newest batch card, FIRST chip — blocking gaps sort to the top of each
      // batch, so this works through them before any quality gap.
      const newestBatch = page.locator('article').filter({ has: page.getByRole('button', { name: 'Skip' }) }).last()
      const skip = newestBatch.getByRole('button', { name: 'Skip' }).first()
      if (!(await skip.isVisible().catch(() => false))) break
      const turnDone = page.waitForResponse(
        (r) => r.url().includes('/messages') && r.request().method() === 'POST',
        { timeout: 30_000 },
      )
      await skip.click()
      await turnDone
      await page.waitForTimeout(250) // render settle
    }

    await expect(page.getByRole('button', { name: /Review in the builder/ }).first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /Review in the builder/ }).first().click()

    // Commit materializes a DRAFT page and routes to the builder.
    await page.waitForURL(/\/dashboard\/[0-9a-f-]{36}/, { timeout: 30_000 })
    const pageId = page.url().match(/\/dashboard\/([0-9a-f-]{36})/)?.[1]
    expect(pageId).toBeTruthy()
    await expect(page.getByRole('heading', { name: 'Edit listing' })).toBeVisible({ timeout: 20_000 })

    // Cleanup (service-role env only): the draft page + its interview session.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && serviceKey && pageId) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      await admin.from('intake_sessions').delete().eq('page_id', pageId)
      await admin.from('pages').delete().eq('id', pageId)
    } else {
      console.warn(`[intake e2e] no SUPABASE_SERVICE_ROLE_KEY — leaving draft page ${pageId} for manual cleanup`)
    }
  })
})
