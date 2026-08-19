import { test, expect } from '@playwright/test'

// Public surface — no auth. Always runs (CI-safe).
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

  test('simulator has LLM-Enhanced tab (added for deeper LLM responses via /api/simulate-llm)', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto('/simulator', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Test, simulate & compare')).toBeVisible()

    // The certification merchant is the stable target: it is owned by us, always
    // published (the release gauntlet depends on it), and listed in
    // INTERNAL_SEED_SLUGS so it never pollutes discovery. The previous fixture,
    // lakehouse-spa-packages-specials, was a real merchant page that later got
    // unpublished and has been 404ing here ever since, unnoticed because this suite
    // only ever ran on workflow_dispatch.
    await page.waitForSelector('input[placeholder*="my-offers"]', { timeout: 10000 })
    await page.getByPlaceholder('my-offers or https://nexez.com/my-offers').fill('nexez-agent-negotiation-lab')
    await page.getByRole('button', { name: /analyze/i }).click()

    // Wait for results + tabs (tabs container only mounts after simulationResults are populated)
    const llmTab = page.getByRole('button', { name: 'LLM-Enhanced', exact: true })
    await expect(llmTab).toBeVisible({ timeout: 30000 })

    // Click to switch to the LLM tab
    await llmTab.click()

    // Expect LLM-specific content (unique heading only present for the active LLM tab view)
    await expect(page.getByRole('heading', { name: "LLM-Enhanced's view" })).toBeVisible()

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })
})

// Dedicated E2E for simulator LLM-Enhanced tab exercising the real /api/simulate-llm route.
// Seeds llm_opt_in=true on a test-owned published page via the settings toggle (authed),
// then runs the paste flow which (because of llm_opt_in) triggers the deeper LLM call and
// naturalLanguage enrichment. Uses the LLM_API_KEY the dev server reads from the environment
// (forwarded by playwright.config.ts; model e.g. grok-4.3). Skips gracefully (CI-safe) when
// E2E_EMAIL/E2E_PASSWORD aren't provided, or when LLM_API_KEY is unset (no real LLM call possible).
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const llmApiKey = process.env.LLM_API_KEY

test.describe('simulator LLM-Enhanced (seeded llm_opt_in page)', () => {
  test('simulator LLM tab hits /api/simulate-llm + gets naturalLanguage when page llm_opt_in is seeded via settings', async ({ page }) => {
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

    // Capture the response from the deeper LLM route (only fires because we seeded llm_opt_in=true on the page)
    const simulateLlmResponse = page.waitForResponse(
      (r) => /\/api\/simulate-llm/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 35000 },
    )

    await page.getByPlaceholder('my-offers or https://nexez.com/my-offers').fill(pageSlug)
    await page.getByRole('button', { name: /analyze/i }).click()

    // Results + tabs render only after the simulation sets data (LLM-Enhanced tab is a reliable signal)
    const llmTab = page.getByRole('button', { name: 'LLM-Enhanced', exact: true })
    await expect(llmTab).toBeVisible({ timeout: 30000 })

    // Await + assert the LLM call happened and returned the advanced payload (platform-configured LLM naturalLanguage)
    const llmData = await (await simulateLlmResponse).json()
    expect(llmData?.success, 'simulate-llm should succeed when key configured').toBe(true)
    expect(llmData?.llmEnhanced, 'llm_opt_in + key must produce llmEnhanced result').toBe(true)
    expect(typeof llmData?.naturalLanguage, 'deeper LLM response must include naturalLanguage text').toBe('string')
    expect((llmData?.naturalLanguage || '').length, 'naturalLanguage should be substantial agent-style output').toBeGreaterThan(20)
    expect(llmData?.agent || '', 'agent label should indicate LLM-Enhanced + model').toMatch(/LLM-Enhanced/)

    // UI: tab present (always) + switchable after results from seeded page
    await expect(llmTab).toBeVisible()
    await llmTab.click()
    await expect(page.getByRole('heading', { name: "LLM-Enhanced's view" })).toBeVisible()

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
