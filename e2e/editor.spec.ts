import { test, expect } from '@playwright/test'

// Authed smoke. Self-contained login (runs after webServer is up). Skipped when
// credentials aren't provided — no secrets in the repo. NON-DESTRUCTIVE: it only
// reads the editor (the save path is covered by lib/editor-merge unit tests), so
// it never mutates the shared prod DB.
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

const UUID_LINK = /^\/dashboard\/[0-9a-f-]{36}$/

test.describe('authed editor', () => {
  test('editor loads and hydrates from server props', async ({ page }) => {
    test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD to run the authed E2E')

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(password!)
    await page.locator('button[type="submit"]').first().click()
    // Leave the login page (destination can vary), then land on the dashboard.
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Wait for the overview's page cards (links to /dashboard/<uuid>) to render.
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
    test.skip(!href, 'test account has no pages to open')
    expect(href).toMatch(UUID_LINK)

    await page.goto(href!, { waitUntil: 'domcontentloaded' })

    // Server component hydrated with real data (no "Loading editor…" flash).
    await expect(page.getByRole('heading', { name: 'Edit agent page' })).toBeVisible()
    const nameValue = await page.locator('input[required]').first().inputValue()
    expect(nameValue.length).toBeGreaterThan(0)
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible()
  })
})
