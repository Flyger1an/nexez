import { expect, test } from '@playwright/test'

test.describe('commerce reference examples', () => {
  test('canonical example is visibly reference-only and non-transactional', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))

    await page.goto('/examples', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Commerce example library')).toBeVisible()

    const detailing = page.locator('a[href="/examples/automotive.mobile-auto-detailing"]')
    await expect(detailing).toBeVisible()
    await detailing.click()

    await expect(page).toHaveURL(/\/examples\/automotive\.mobile-auto-detailing$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Mobile Auto Detailing' })).toBeVisible()
    await expect(page.getByText('Reference template — not live supply')).toBeVisible()
    await expect(page.getByText(/not a real provider listing/i)).toBeVisible()
    await expect(page.getByText('What Nexie would clarify before publishing')).toBeVisible()

    // Reference templates can teach commerce structure, but they are never live
    // marketplace supply and therefore must not expose transaction entrypoints.
    await expect(page.locator('a[href^="/checkout"], a[href^="/negotiate"]')).toHaveCount(0)

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })
})
