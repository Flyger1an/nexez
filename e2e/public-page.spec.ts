import { test, expect } from '@playwright/test'

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

function hasRealPublicSupabaseConfig() {
  if (!publicSupabaseUrl || !publicSupabaseKey || publicSupabaseKey.length < 20) return false
  try {
    const url = new URL(publicSupabaseUrl)
    const candidate = `${url.hostname} ${publicSupabaseKey}`.toLowerCase()
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !/(?:placeholder|example|your[-_. ]?project|change[-_. ]?me|dummy)/.test(candidate)
  } catch {
    return false
  }
}

// Public surface - no auth. Always runs (CI-safe).
test.describe('public surface', () => {
  test('homepage renders with no uncaught errors', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/Nexez/)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    // primary CTA is reachable
    await expect(page.getByRole('link', { name: /list your offers/i }).first()).toBeVisible()

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('pricing comparison is keyboard reachable with semantic headings and accessible signal contrast', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })

    for (const plan of ['Free', 'Launch', 'Pro', 'Scale', 'Enterprise']) {
      await expect(page.getByRole('heading', { name: plan, level: 2, exact: true })).toBeVisible()
    }

    const comparison = page.getByRole('region', { name: 'Complete plan comparison table' })
    await expect(comparison).toHaveAttribute('tabindex', '0')
    await comparison.focus()
    await expect(comparison).toBeFocused()

    const signalContrast = await page.evaluate(() => {
      const probe = document.createElement('span')
      probe.style.backgroundColor = 'var(--signal-solid)'
      document.body.append(probe)
      const channels = getComputedStyle(probe).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? []
      probe.remove()
      const luminance = (values: number[]) => values
        .map((value) => value / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
      const background = luminance(channels)
      const white = 1
      return (white + 0.05) / (background + 0.05)
    })
    expect(signalContrast).toBeGreaterThanOrEqual(4.5)
  })

  test('Agent Lab uses the expanded responsive workspace without desktop or mobile overflow', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto('/simulator', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Test, simulate & compare')).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Agent Lab modes' })).toBeVisible()
    const testMode = page.getByRole('tab', { name: 'Test a listing' })
    const urlMode = page.getByRole('tab', { name: 'Any URL' })
    await expect(testMode).toHaveAttribute('aria-selected', 'true')
    await expect(testMode).toHaveAttribute('tabindex', '0')
    await expect(urlMode).toHaveAttribute('tabindex', '-1')

    await testMode.focus()
    await testMode.press('ArrowRight')
    await expect(urlMode).toBeFocused()
    await expect(urlMode).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\?mode=url$/)
    await urlMode.press('Home')
    await expect(testMode).toBeFocused()
    await expect(testMode).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\?mode=test$/)

    await page.setViewportSize({ width: 1440, height: 900 })
    const wideLayout = await page.getByTestId('agent-lab-screen').evaluate((element) => ({
      width: element.firstElementChild?.getBoundingClientRect().width ?? 0,
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }))
    expect(wideLayout.width).toBeGreaterThan(1280)
    expect(wideLayout.documentWidth).toBeLessThanOrEqual(wideLayout.viewport)

    // Responsive shell coverage is public and data-independent: it must keep
    // running even when CI intentionally supplies placeholder Supabase values.
    await page.setViewportSize({ width: 390, height: 844 })
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(mobileOverflow).toBeLessThanOrEqual(1)

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('Agent Lab analyzes the seeded certification listing when real public Supabase config is available', async ({ page }) => {
    // This assertion is deliberately data-backed. Placeholder/missing public
    // connection values must skip it before navigation while the layout test
    // above continues to certify the public workspace on every run.
    test.skip(
      !hasRealPublicSupabaseConfig(),
      'set a real non-placeholder NEXT_PUBLIC_SUPABASE_URL and publishable key to run the seeded listing simulation',
    )

    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto('/simulator', { waitUntil: 'domcontentloaded' })

    // The certification merchant is the stable target: it is owned by us, always
    // published (the release gauntlet depends on it), and listed in
    // INTERNAL_SEED_SLUGS so it never pollutes discovery. The previous fixture,
    // lakehouse-spa-packages-specials, was a real merchant page that later got
    // unpublished and has been 404ing here ever since, unnoticed because this suite
    // only ever ran on workflow_dispatch.
    await page.waitForSelector('input[placeholder*="my-offers"]', { timeout: 10000 })
    await page.getByPlaceholder('my-offers or https://nexez.com/my-offers').fill('nexez-agent-negotiation-lab')
    await page.getByRole('button', { name: /analyze/i }).click()

    // Deterministic agents always render. LLM-Enhanced only renders when the
    // server explicitly confirms that a provider produced the response.
    await expect(page.getByRole('tablist', { name: 'Simulated agents' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('tab', { name: 'ChatGPT', exact: true })).toBeVisible()

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })
})

// Dedicated E2E for the Agent Lab's server-side LLM execution boundary.
// Seeds llm_opt_in=true on a test-owned published page via the settings toggle (authed),
// then runs the paste flow which (because of llm_opt_in) requests LLM enrichment inside
// the attributable /api/simulator/runs response. Uses the LLM_API_KEY the dev server reads from the environment
// (forwarded by playwright.config.ts; model e.g. grok-4.3). Skips gracefully (CI-safe) when
// E2E_EMAIL/E2E_PASSWORD aren't provided, or when LLM_API_KEY is unset (no real LLM call possible).
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const llmApiKey = process.env.LLM_API_KEY

test.describe('simulator LLM-Enhanced (seeded llm_opt_in page)', () => {
  test('simulator reports the real server-side LLM outcome when page llm_opt_in is seeded via settings', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD to run the seeded llm_opt_in simulator E2E')
    test.skip(!llmApiKey, 'set LLM_API_KEY to run the seeded llm_opt_in simulator E2E (it makes a real LLM call)')

    // Login (same pattern as editor.spec.ts)
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(password!)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Pick a genuinely PUBLISHED owned listing. The previous selector grabbed
    // the first owned listing regardless of status, so a newer draft could be
    // fed into the public simulator and never resolve.
    const publishedCard = page.locator('article').filter({ has: page.getByRole('button', { name: 'Published' }) }).first()
    const editLink = publishedCard.getByRole('link', { name: 'Edit listing' })
    await editLink.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
    const href = await editLink.getAttribute('href').catch(() => null)
    test.skip(!href, 'test account has no published pages to seed llm_opt_in on')

    // Go to its settings to seed the opt-in flag (this is the "seeded llm_opt_in page")
    const idMatch = href!.match(/([0-9a-f-]{36})$/)
    const settingsPath = `/dashboard/${idMatch ? idMatch[1] : ''}/settings`
    await page.goto(settingsPath, { waitUntil: 'domcontentloaded' })

    // Wait for the accessible settings switch to be interactive.
    const aiAssistSwitch = page.getByRole('switch', { name: /advanced ai assist/i })
    await expect(aiAssistSwitch).toBeVisible({ timeout: 15000 })

    // Seed: ensure llm_opt_in is true for this page (direct update, no extra save)
    const wasEnabled = (await aiAssistSwitch.getAttribute('aria-checked')) === 'true'
    if (!wasEnabled) {
      await aiAssistSwitch.click()
      await expect(aiAssistSwitch).toHaveAttribute('aria-checked', 'true')
      // Handler awaits the pages.update then sets the confirmation message
      await page.getByText(/Advanced AI assist enabled|LLM opt-in enabled/i).waitFor({ timeout: 10000 }).catch(() => {})
    }

    // Capture the slug from the rendered "Public Listing" link. The link is an
    // absolute runtime URL, so parse its pathname instead of treating the whole
    // href as a relative slug.
    const publicLink = page.locator('a:has-text("Public Listing")')
    await expect(publicLink).toBeVisible({ timeout: 5000 })
    const publicHref = await publicLink.getAttribute('href')
    const pageSlug = publicHref ? new URL(publicHref, page.url()).pathname.replace(/^\/+|\/+$/g, '') : ''
    test.skip(!pageSlug, 'could not resolve slug for the seeded page')

    // Now go to simulator (same auth context) and exercise the paste + analyze path
    await page.goto('/simulator', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Test, simulate & compare')).toBeVisible()
    await page.waitForSelector('input[placeholder*="my-offers"]', { timeout: 10000 })

    // Pass 2 moved provider execution behind the attributable Agent Lab run.
    // Assert that contract instead of waiting for the retired client-side route.
    const simulatorRunResponse = page.waitForResponse(
      (response) => /\/api\/simulator\/runs/.test(response.url()) && response.request().method() === 'POST',
      { timeout: 45_000 },
    )

    await page.getByPlaceholder('my-offers or https://nexez.com/my-offers').fill(pageSlug)
    await page.getByRole('button', { name: /analyze/i }).click()

    const runResponse = await simulatorRunResponse
    expect(runResponse.ok(), 'the attributable Agent Lab run should complete').toBe(true)
    const runData = await runResponse.json()
    const llmEvidence = runData?.run?.evidence?.execution?.llm
    expect(llmEvidence?.requested, 'an opted-in listing should request the configured provider').toBe(true)

    // The UI must only expose LLM-Enhanced when the provider actually returned
    // usable text. Provider outages remain explicit evidence, never false claims.
    const llmTab = page.getByRole('tab', { name: 'LLM-Enhanced', exact: true })
    if (llmEvidence?.executed) {
      const llmResult = runData.run.result.results.find((result: { agent?: string }) => result.agent === 'LLM-Enhanced')
      expect(typeof llmResult?.naturalLanguage, 'provider-confirmed results must include naturalLanguage text').toBe('string')
      expect((llmResult?.naturalLanguage || '').length, 'naturalLanguage should be substantial agent-style output').toBeGreaterThan(20)
      await expect(llmTab).toBeVisible({ timeout: 30_000 })
      await llmTab.click()
      await expect(page.getByRole('heading', { name: "LLM-Enhanced's view" })).toBeVisible()
    } else {
      expect(llmEvidence?.reason, 'a skipped provider must retain an explicit evidence reason').toMatch(/^[a-z_]+$/)
      await expect(llmTab).toHaveCount(0)
      await expect(page.getByText(new RegExp(`LLM skipped: ${String(llmEvidence.reason).replaceAll('_', ' ')}`, 'i'))).toBeVisible()
    }

    // Additional authed feature coverage (non-destructive page loads for main dashboard sections + flows).
    // Anchor each page on one unique semantic landmark so the smoke remains
    // stable as cards/KPIs add more text that happens to share broad keywords.
    await page.goto('/dashboard/analytics', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible({ timeout: 15000 })

    await page.goto('/dashboard/billing', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Your plan & payouts', exact: true })).toBeVisible({ timeout: 15000 })

    await page.goto('/dashboard/negotiations', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Negotiation Inbox', exact: true })).toBeVisible({ timeout: 15000 })

    await page.goto('/dashboard/tools', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Tools', exact: true })).toBeVisible({ timeout: 15000 })

    await page.goto('/create', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Talk your listing into existence', exact: true })).toBeVisible({ timeout: 10000 })

    // Quick re-visit to dashboard overview and a settings page for llm_opt_in coverage (already toggled earlier)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({ timeout: 10000 })

    // Additional E2E coverage for the /negotiate persistent page (the core of long-lived resumable negotiations).
    // After visiting negotiations inbox (which now links to persistent threads), exercise /negotiate/{id}:
    // - Load full history from dedicated table
    // - Display of turns, status, continuation form
    // - Submit a follow-up (appends to history via API + service, LLM would see full context on next step)
    await page.goto('/dashboard/negotiations', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Negotiation Inbox', exact: true })).toBeVisible({ timeout: 10000 })

    const negotiateLink = page.locator('a[href*="/negotiate/"]').first()
    if (await negotiateLink.count() > 0) {
      const href = await negotiateLink.getAttribute('href')
      if (href) {
        await page.goto(href, { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { name: 'Negotiation', exact: true })).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('Full Conversation History')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('Continue this negotiation')).toBeVisible()

        // Submit a follow-up via the persistent page form (tests end-to-end flow for agents returning later)
        const continueForm = page.locator('form[action="/api/negotiations"]').first()
        if (await continueForm.count() > 0) {
          await continueForm.locator('textarea[name="query"]').fill('E2E follow-up: updated scope from persistent link')
          await continueForm.locator('input[name="budget"]').fill('950')
          await continueForm.getByRole('button', { name: /Submit follow-up/i }).click()

          // Wait for the submission to process and page to reflect (or redirect/re-render with new turn)
          await page.waitForTimeout(3000)
          await expect(page.getByText(/E2E follow-up|updated scope/i)).toBeVisible({ timeout: 15000 })
        }
      }
    }

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })
})
