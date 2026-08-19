import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const UUID_DASHBOARD_LINK = /^\/dashboard\/[0-9a-f-]{36}$/

let disposablePageId: string | null = null
let fixtureClient: SupabaseClient | null = null
let originalPlanMetadata: unknown = null
let planMetadataAdjusted = false

async function createDisposableListing(): Promise<string> {
  if (disposablePageId) return disposablePageId
  if (!email || !password || !supabaseUrl || !supabaseKey) {
    throw new Error('E2E fixture creation requires the test credentials and public Supabase connection keys')
  }

  fixtureClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await fixtureClient.auth.signInWithPassword({ email, password })
  if (authError || !authData.user) {
    throw new Error(`Could not authenticate the E2E fixture owner: ${authError?.message || 'no user returned'}`)
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await fixtureClient
    .from('pages')
    .insert({
      owner_id: authData.user.id,
      name: 'Nexez settings E2E',
      slug: `nexez-settings-e2e-${unique}`,
      description: 'Disposable private listing used to verify the settings experience.',
      website_url: 'https://example.com',
      cta_url: 'https://example.com/contact',
      cta_label: 'Contact us',
      is_published: false,
      branding: {},
      products: [],
      services: [],
      faqs: [],
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(`Could not create the disposable settings listing: ${error?.message || 'no id returned'}`)
  }
  disposablePageId = data.id

  // A plan-less test owner is intentionally redirected through onboarding by the
  // dashboard layout. Prepare a temporary Free selection only after the disposable
  // row exists; afterAll restores the prior value even when a UI assertion fails.
  const selectedPlan = authData.user.user_metadata?.plan
  if (!['free', 'launch', 'pro', 'scale'].includes(selectedPlan)) {
    originalPlanMetadata = selectedPlan ?? null
    const { error: metadataError } = await fixtureClient.auth.updateUser({ data: { plan: 'free' } })
    if (metadataError) {
      await fixtureClient.from('pages').delete().eq('id', disposablePageId)
      disposablePageId = null
      await fixtureClient.auth.signOut()
      throw new Error(`Could not prepare the E2E workspace plan: ${metadataError.message}`)
    }
    planMetadataAdjusted = true
  }

  return data.id
}

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
  const resolvedHref = href || `/dashboard/${await createDisposableListing()}`
  expect(resolvedHref).toMatch(UUID_DASHBOARD_LINK)

  const id = resolvedHref.split('/').pop()
  await page.goto(`/dashboard/${id}/settings`, { waitUntil: 'domcontentloaded' })
}

test.describe('page settings', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterAll(async () => {
    if (!fixtureClient) return
    const cleanupErrors: string[] = []
    if (disposablePageId) {
      const id = disposablePageId
      const { data, error } = await fixtureClient.from('pages').delete().eq('id', id).select('id').single()
      if (error || data?.id !== id) cleanupErrors.push(error?.message || 'fixture row was not deleted')
    }
    if (planMetadataAdjusted) {
      const { error: metadataError } = await fixtureClient.auth.updateUser({ data: { plan: originalPlanMetadata } })
      if (metadataError) cleanupErrors.push(`plan metadata was not restored: ${metadataError.message}`)
    }
    await fixtureClient.auth.signOut()
    if (cleanupErrors.length) {
      throw new Error(`Could not fully clean up disposable settings listing ${disposablePageId}: ${cleanupErrors.join('; ')}`)
    }
  })

  test('loads implemented settings without stale roadmap notes or machine markers', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await loginAndOpenFirstPageSettings(page)

    await expect(page.getByTestId('page-settings-screen')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Listing settings', { exact: false }).first()).toBeVisible()
    for (const section of [
      'General',
      'Brand & domain',
      'Agent experience',
      'Commerce & integrations',
      'Trust & verification',
      'Team & history',
      'Developer',
    ]) {
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible()
    }
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

  test('keeps every section mounted, preserves drafts, and exposes distinct switch states', async ({ page }) => {
    await loginAndOpenFirstPageSettings(page)
    await expect(page.getByTestId('page-settings-screen')).toBeVisible({ timeout: 15_000 })

    const sectionNav = page.getByRole('navigation', { name: 'Listing settings sections' })
    const listingName = page.locator('#listing-name')
    const originalName = await listingName.inputValue()
    await listingName.fill(`${originalName} — unsaved E2E draft`)

    await sectionNav.getByRole('link', { name: 'Developer' }).click()
    await expect(page).toHaveURL(/#developer$/)
    await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeAttached()
    await expect(listingName).toHaveValue(`${originalName} — unsaved E2E draft`)
    const developerSection = page.locator('#developer')
    await expect(developerSection).toHaveAttribute('aria-current', 'location')
    const developerStateId = await developerSection.getAttribute('aria-describedby')
    expect(developerStateId).toBeTruthy()
    await expect(page.locator(`#${developerStateId}`)).toHaveText('Current section')
    await expect(developerSection.locator('header > span[aria-hidden="true"]')).toBeVisible()

    await page.goBack()
    await expect(listingName).toHaveValue(`${originalName} — unsaved E2E draft`)
    await expect(sectionNav.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'location')
    await expect(page.locator('#general')).toHaveAttribute('aria-current', 'location')
    await listingName.fill(originalName)

    const customDomainInput = page.getByPlaceholder('agents.yourcompany.com')
    const originalCustomDomain = await customDomainInput.inputValue()
    await customDomainInput.fill('agents.e2e-example.test')
    const domainSetup = page.getByRole('group', { name: 'Recommended next step: attach and detect DNS' })
    await expect(domainSetup).toHaveClass(/\bsettings-priority-card\b/)
    await expect(domainSetup.getByRole('button', { name: 'Attach & detect DNS' })).toHaveClass(/\bsettings-emphasis-action\b/)
    await customDomainInput.fill(originalCustomDomain)

    const apacheRecipe = page.getByRole('button', { name: 'Apache (.htaccess)', exact: true })
    await expect(apacheRecipe).toHaveAttribute('aria-pressed', 'true')
    await expect(apacheRecipe).toHaveClass(/\bsettings-choice-active\b/)

    const visibility = page.getByRole('switch', { name: 'Listing visibility' })
    const initialChecked = (await visibility.getAttribute('aria-checked')) === 'true'
    if (initialChecked) await visibility.click()

    const offVisual = await visibility.evaluate((control) => {
      const track = control.firstElementChild as HTMLElement
      const thumb = track.firstElementChild as HTMLElement
      return {
        background: getComputedStyle(track).backgroundColor,
        border: getComputedStyle(track).borderColor,
        thumbLeft: thumb.getBoundingClientRect().left,
      }
    })

    await visibility.click()
    await expect(visibility).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => visibility.evaluate((control) => getComputedStyle(control.firstElementChild as HTMLElement).backgroundColor))
      .not.toBe(offVisual.background)
    await expect
      .poll(async () => visibility.evaluate((control) => (control.firstElementChild?.firstElementChild as HTMLElement).getBoundingClientRect().left))
      .toBeGreaterThan(offVisual.thumbLeft + 10)
    const onVisual = await visibility.evaluate((control) => {
      const track = control.firstElementChild as HTMLElement
      const thumb = track.firstElementChild as HTMLElement
      return {
        background: getComputedStyle(track).backgroundColor,
        border: getComputedStyle(track).borderColor,
        thumbLeft: thumb.getBoundingClientRect().left,
      }
    })

    expect(onVisual.background).not.toBe(offVisual.background)
    expect(onVisual.thumbLeft).toBeGreaterThan(offVisual.thumbLeft + 10)

    if (!initialChecked) await visibility.click()

    for (const viewport of [
      { width: 375, height: 760 },
      { width: 768, height: 900 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport)
      const metrics = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        shell: (() => {
          const aside = document.querySelector<HTMLElement>('.dashboard-sidebar')
          const nav = aside?.querySelector<HTMLElement>('nav')
          const describe = (element: HTMLElement | null | undefined) => element ? {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            rect: element.getBoundingClientRect().toJSON(),
            overflowX: getComputedStyle(element).overflowX,
            contain: getComputedStyle(element).contain,
            position: getComputedStyle(element).position,
          } : null
          return { aside: describe(aside), nav: describe(nav) }
        })(),
        overflow: [...document.querySelectorAll<HTMLElement>('body *')]
          .map((element) => {
            const rect = element.getBoundingClientRect()
            return {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === 'string' ? element.className : '',
              text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            }
          })
          .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
          .sort((a, b) => Math.max(b.right - window.innerWidth, -b.left) - Math.max(a.right - window.innerWidth, -a.left))
          .slice(0, 12),
      }))
      const horizontalScroll = await page.evaluate(() => {
        window.scrollTo({ left: document.documentElement.scrollWidth, top: window.scrollY, behavior: 'instant' })
        const x = window.scrollX
        window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' })
        return x
      })
      expect(
        horizontalScroll,
        `Page can drift horizontally at ${viewport.width}px (${metrics.documentWidth}px document): ${JSON.stringify({ shell: metrics.shell, overflow: metrics.overflow })}`,
      ).toBe(0)
    }

  })

  test('uses webhook colors only for observed test outcomes', async ({ page }) => {
    let releaseSuccessResponse = () => {}
    const successResponseGate = new Promise<void>((resolve) => {
      releaseSuccessResponse = () => resolve()
    })

    await page.route('**/api/test-outbound', async (route) => {
      const body = route.request().postDataJSON() as { endpoint?: string }
      const failed = body.endpoint?.includes('failure')
      if (!failed) {
        // Keep the successful request pending until the test has observed the
        // intermediate UI state. A timeout fallback prevents a failed assertion
        // from leaving the mocked request unresolved until the whole spec times out.
        await Promise.race([
          successResponseGate,
          new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
        ])
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          failed
            ? { success: false, status: 502, error: 'E2E delivery rejected' }
            : { success: true, status: 204, error: null },
        ),
      })
    })

    await loginAndOpenFirstPageSettings(page)
    await expect(page.getByTestId('page-settings-screen')).toBeVisible({ timeout: 15_000 })

    const panel = page.getByTestId('outbound-webhooks-panel')
    const summary = page.getByTestId('outbound-webhook-summary')
    const urlInput = panel.getByPlaceholder(/hooks\.zapier/i)
    const addButton = panel.getByRole('button', { name: 'Add' })
    const unique = Date.now()

    const successUrl = `https://hooks.example.com/nexez-e2e-success-${unique}`
    await urlInput.fill(successUrl)
    await addButton.click()
    const successRow = panel.getByTestId('outbound-webhook-row').filter({ hasText: successUrl })
    await expect(successRow).toBeVisible()
    await expect(summary).toHaveAttribute('data-tone', 'neutral')
    await expect(summary).toContainText(/webhooks? configured/)

    await successRow.getByRole('button', { name: 'Send Test' }).click()
    const successResult = successRow.getByTestId('outbound-test-result')
    await expect(successResult).toHaveAttribute('data-state', 'testing')
    await expect(successResult).toHaveClass(/text-\[var\(--fg-muted\)\]/)
    await expect(summary).toHaveAttribute('data-tone', 'neutral')
    releaseSuccessResponse()
    await expect(successResult).toHaveAttribute('data-state', 'success')
    await expect(successResult).toHaveClass(/text-\[var\(--ready\)\]/)
    await expect(summary).toHaveAttribute('data-tone', 'ready')
    await expect(summary).toContainText('1 webhook test passed')

    await successRow.getByRole('button', { name: 'remove' }).click()
    await expect(successRow).toHaveCount(0)
    await expect(summary).toHaveAttribute('data-tone', 'neutral')

    const failureUrl = `https://hooks.example.com/nexez-e2e-failure-${unique}`
    await urlInput.fill(failureUrl)
    await addButton.click()
    const failureRow = panel.getByTestId('outbound-webhook-row').filter({ hasText: failureUrl })
    await failureRow.getByRole('button', { name: 'Send Test' }).click()
    const failureResult = failureRow.getByRole('alert')
    await expect(failureResult).toHaveAttribute('data-state', 'failure')
    await expect(failureResult).toHaveClass(/text-\[var\(--danger\)\]/)
    await expect(summary).toHaveAttribute('data-tone', 'danger')
    await expect(summary).toContainText('1 webhook test failed')

    await failureRow.getByRole('button', { name: 'remove' }).click()
    await expect(failureRow).toHaveCount(0)
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
