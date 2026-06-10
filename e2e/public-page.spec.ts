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
    await expect(page.getByRole('link', { name: /create page/i }).first()).toBeVisible()

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('simulator has LLM-Enhanced tab (added for deeper LLM responses via /api/simulate-llm)', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto('/simulator', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Global Agent Simulator')).toBeVisible()

    // Use a public example slug to run simulation (renders tabs including LLM-Enhanced)
    await page.waitForSelector('input[placeholder*="my-offers"]', { timeout: 10000 })
    await page.getByPlaceholder('my-offers or https://nexez.com/my-offers').fill('lakehouse-spa-packages-specials')
    await page.getByRole('button', { name: /analyze/i }).click()

    // Wait for results + tabs (tabs container only mounts after simulationResults are populated)
    await expect(page.getByText('LLM-Enhanced')).toBeVisible({ timeout: 30000 })

    // Click to switch to the LLM tab
    await page.getByText('LLM-Enhanced').click()

    // Expect LLM-specific content (unique heading only present for the active LLM tab view)
    await expect(page.getByText("LLM-Enhanced's view")).toBeVisible()

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })
})

// Dedicated E2E for simulator LLM-Enhanced tab exercising the real /api/simulate-llm route.
// Seeds llm_opt_in=true on a test-owned published page via the settings toggle (authed),
// then runs the paste flow which (because of llm_opt_in) triggers the deeper LLM call and
// naturalLanguage enrichment. Uses playwright webServer-injected LLM_API_KEY (model e.g. grok-4.3).
// Skips gracefully (CI-safe) if E2E_EMAIL/E2E_PASSWORD not provided for the test account.
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.describe('simulator LLM-Enhanced (seeded llm_opt_in page)', () => {
  test('simulator LLM tab hits /api/simulate-llm + gets naturalLanguage when page llm_opt_in is seeded via settings', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD to run the seeded llm_opt_in simulator E2E')

    // Login (same pattern as editor.spec.ts)
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(password!)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Find first owned page (must have at least one published page for this test account)
    await page
      .waitForFunction(
        () => [...document.querySelectorAll('a[href]')].some((a) => /^\/dashboard\/[0-9a-f-]{36}$/.test(a.getAttribute('href') || '')),
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => {})
    const href = await page.evaluate(
      () => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => !!h && /^\/dashboard\/[0-9a-f-]{36}$/.test(h)) || null,
    )
    test.skip(!href, 'test account has no published pages to seed llm_opt_in on')

    // Go to its settings to seed the opt-in flag (this is the "seeded llm_opt_in page")
    const idMatch = href!.match(/([0-9a-f-]{36})$/)
    const settingsPath = `/dashboard/${idMatch ? idMatch[1] : ''}/settings`
    await page.goto(settingsPath, { waitUntil: 'domcontentloaded' })

    // Wait for settings LLM section + checkbox to be interactive
    const llmLabel = page.locator('label', { hasText: /Enable advanced AI/ })
    const checkbox = llmLabel.locator('input[type="checkbox"]')
    await expect(checkbox).toBeVisible({ timeout: 15000 })

    // Seed: ensure llm_opt_in is true for this page (direct update, no extra save)
    const wasChecked = await checkbox.isChecked()
    if (!wasChecked) {
      await checkbox.check()
      // Handler awaits the pages.update then sets the confirmation message
      await page.getByText(/LLM opt-in enabled/i).waitFor({ timeout: 10000 }).catch(() => {})
    }

    // Capture the slug from the rendered "Public Page" link (reliable, uses the live slug)
    const publicLink = page.locator('a:has-text("Public Page")')
    await expect(publicLink).toBeVisible({ timeout: 5000 })
    const publicHref = await publicLink.getAttribute('href')
    const pageSlug = (publicHref || '').replace(/^\//, '').trim()
    test.skip(!pageSlug, 'could not resolve slug for the seeded page')

    // Now go to simulator (same auth context) and exercise the paste + analyze path
    await page.goto('/simulator', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Global Agent Simulator')).toBeVisible()
    await page.waitForSelector('input[placeholder*="my-offers"]', { timeout: 10000 })

    // Capture the response from the deeper LLM route (only fires because we seeded llm_opt_in=true on the page)
    const simulateLlmResponse = page.waitForResponse(
      (r) => /\/api\/simulate-llm/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 35000 },
    )

    await page.getByPlaceholder('my-offers or https://nexez.com/my-offers').fill(pageSlug)
    await page.getByRole('button', { name: /analyze/i }).click()

    // Results + tabs render only after the simulation sets data (LLM-Enhanced tab is a reliable signal)
    await expect(page.getByText('LLM-Enhanced')).toBeVisible({ timeout: 30000 })

    // Await + assert the LLM call happened and returned the advanced payload (platform-configured LLM naturalLanguage)
    const llmData = await (await simulateLlmResponse).json()
    expect(llmData?.success, 'simulate-llm should succeed when key configured').toBe(true)
    expect(llmData?.llmEnhanced, 'llm_opt_in + key must produce llmEnhanced result').toBe(true)
    expect(typeof llmData?.naturalLanguage, 'deeper LLM response must include naturalLanguage text').toBe('string')
    expect((llmData?.naturalLanguage || '').length, 'naturalLanguage should be substantial agent-style output').toBeGreaterThan(20)
    expect(llmData?.agent || '', 'agent label should indicate LLM-Enhanced + model').toMatch(/LLM-Enhanced/)

    // UI: tab present (always) + switchable after results from seeded page
    await expect(page.getByText('LLM-Enhanced')).toBeVisible()
    await page.getByText('LLM-Enhanced').click()
    await expect(page.getByText("LLM-Enhanced's view")).toBeVisible()

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })
})
