import { expect, test } from '@playwright/test'

const DETAILING_ID = 'automotive.mobile-auto-detailing'

test.describe('commerce reference examples', () => {
  test('canonical example is visibly reference-only and non-transactional', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))

    await page.goto('/examples', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Commerce example library')).toBeVisible()

    const detailing = page.locator(`a[href="/examples/${DETAILING_ID}"]`)
    await expect(detailing).toBeVisible()
    await detailing.click()

    await expect(page).toHaveURL(new RegExp(`/examples/${DETAILING_ID.replaceAll('.', '\\.')}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Mobile Auto Detailing' })).toBeVisible()
    await expect(page.getByText('Reference template - not live supply')).toBeVisible()
    await expect(page.getByText(/not a real provider listing/i)).toBeVisible()
    await expect(page.getByText('What Nexxi would clarify before publishing')).toBeVisible()

    const buildLink = page.getByRole('link', { name: 'Build your version' }).first()
    await expect(buildLink).toHaveAttribute('href', new RegExp(`/create\\?commerceTemplate=${DETAILING_ID.replaceAll('.', '\\.')}$`))

    // Reference templates can teach commerce structure, but they are never live
    // marketplace supply and therefore must not expose transaction entrypoints.
    await expect(page.locator('a[href^="/checkout"], a[href^="/negotiate"]')).toHaveCount(0)

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('selected template is posted as context and survives an unauthenticated sign-in handoff', async ({ page }) => {
    await page.goto(`/create?commerceTemplate=${DETAILING_ID}`, { waitUntil: 'domcontentloaded' })
    // Template selection intentionally suppresses the normal resume-check GET so
    // an unrelated interview is never offered. The setup control stays disabled
    // until hydration attaches its click handler, which is the readiness signal
    // this interaction actually needs. Background shell requests may stay active.
    const startButton = page.getByRole('button', { name: 'Start from scratch' })
    await expect(startButton).toBeEnabled()

    const startRequest = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().endsWith('/api/agents/intake/threads'),
    )
    await startButton.click()

    const request = await startRequest
    expect(request.postDataJSON()).toMatchObject({ template_id: DETAILING_ID })

    await expect(page.getByText(/Sign in to start your interview/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create Free account' })).toHaveAttribute(
      'href',
      `/onboard?next=%2Fcreate%3FcommerceTemplate%3D${DETAILING_ID}`,
    )
    await expect(page.getByRole('link', { name: 'I already have an account' })).toHaveAttribute(
      'href',
      `/login?next=%2Fcreate%3FcommerceTemplate%3D${DETAILING_ID}`,
    )
  })
})
