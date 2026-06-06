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
})
