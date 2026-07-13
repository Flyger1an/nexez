import { test, expect, type Page } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

const UUID_DASHBOARD_LINK = /^\/dashboard\/[0-9a-f-]{36}$/

async function loginAndOpenFirstPageSettings(page: Page) {
  test.skip(!email || !password, 'set E2E_EMAIL and E2E_PASSWORD to run the page settings E2E')

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email!)
  await page.locator('input[type="password"]').fill(password!)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
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
  expect(href).toMatch(UUID_DASHBOARD_LINK)

  const id = href!.split('/').pop()
  await page.goto(`/dashboard/${id}/settings`, { waitUntil: 'domcontentloaded' })
}

test.describe('page settings', () => {
  test('loads implemented settings without stale roadmap notes or machine markers', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await loginAndOpenFirstPageSettings(page)

    await expect(page.getByTestId('page-settings-screen')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Page Settings')).toBeVisible()
    await expect(page.getByText('Agent links')).toBeVisible()
    await expect(page.getByText('Agent Manifest Preview')).toBeVisible()
    await expect(page.getByTestId('availability-panel')).toBeVisible()
    await expect(page.getByTestId('outbound-webhooks-panel')).toBeVisible()

    await expect(page.getByText(/future automated sync/i)).toHaveCount(0)
    await expect(page.getByText(/Phase 3 stub/i)).toHaveCount(0)

    const availabilityNote = page.getByTestId('availability-note-input')
    await expect(availabilityNote).toBeVisible()
    await expect(async () => {
      expect(await availabilityNote.inputValue()).not.toContain('||WINDOWS||')
    }).toPass()

    const calendarId = page.getByTestId('google-calendar-id-input')
    const originalCalendarId = await calendarId.inputValue()
    await calendarId.fill('')
    await expect(page.getByTestId('availability-save-button')).toHaveText(/Save Manual Availability/)
    await calendarId.fill('e2e-calendar@example.com')
    await expect(page.getByTestId('availability-save-button')).toHaveText(/Import Availability from Google Calendar/)
    await calendarId.fill(originalCalendarId)

    const webhookPanel = page.getByTestId('outbound-webhooks-panel')
    const webhookUrl = 'https://example.com/nexez-e2e-webhook'
    await webhookPanel.getByPlaceholder(/hooks\.zapier/i).fill(webhookUrl)
    await webhookPanel.getByPlaceholder(/Optional signing secret/i).fill('e2e-secret')
    await webhookPanel.getByRole('button', { name: 'Add' }).click()
    await expect(webhookPanel.getByText(webhookUrl)).toBeVisible()
    await expect(webhookPanel.getByTestId('outbound-secret-chip-0')).toBeVisible()
    await webhookPanel.getByRole('button', { name: 'remove' }).click()
    await expect(webhookPanel.getByText(webhookUrl)).toHaveCount(0)

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('calendar availability API blocks anonymous requests', async ({ request }) => {
    const res = await request.post('/api/integrations/google-calendar/availability', {
      data: { calendarId: 'e2e-calendar@example.com' },
    })
    expect(res.status()).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Authentication required')
  })
})
