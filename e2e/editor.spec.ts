import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Authed smoke. Self-contained login (runs after webServer is up). Skipped when
// credentials aren't provided — no secrets in the repo. It creates one precisely
// named disposable draft and removes that exact row after the read-only UI checks;
// the editor save path remains covered by lib/editor-merge unit tests.
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let fixtureClient: SupabaseClient | null = null
let fixturePageId: string | null = null
let originalPlanMetadata: unknown = null
let planMetadataAdjusted = false

test.describe('authed editor', () => {
  test.beforeAll(async () => {
    if (!email || !password || !supabaseUrl || !supabaseKey) return
    fixtureClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: authData, error: authError } = await fixtureClient.auth.signInWithPassword({ email, password })
    if (authError || !authData.user) throw new Error(`Could not authenticate editor fixture: ${authError?.message || 'no user returned'}`)

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { data, error } = await fixtureClient
      .from('pages')
      .insert({
        owner_id: authData.user.id,
        name: 'Nexez editor E2E',
        slug: `nexez-editor-e2e-${unique}`,
        description: 'Disposable listing used to verify the structured listing editor.',
        website_url: 'https://example.com',
        cta_url: 'https://example.com/contact',
        cta_label: 'Contact us',
        is_published: false,
        branding: {},
        products: [],
        services: [{
          name: 'Structured consultation',
          description: 'A disposable offer that exposes the editor Co-Pilot tabs for visual verification.',
          price: '$250',
          cta_url: 'https://example.com/contact',
        }],
        faqs: [],
      })
      .select('id')
      .single<{ id: string }>()
    if (error || !data?.id) throw new Error(`Could not create editor fixture: ${error?.message || 'no id returned'}`)
    fixturePageId = data.id

    const selectedPlan = authData.user.user_metadata?.plan
    if (!['free', 'launch', 'pro', 'scale'].includes(selectedPlan)) {
      originalPlanMetadata = selectedPlan ?? null
      const { error: metadataError } = await fixtureClient.auth.updateUser({
        data: { plan: 'free' },
      })
      if (metadataError) {
        await fixtureClient.from('pages').delete().eq('id', fixturePageId)
        fixturePageId = null
        throw new Error(`Could not prepare editor fixture plan: ${metadataError.message}`)
      }
      planMetadataAdjusted = true
    }
  })

  test.afterAll(async () => {
    if (!fixtureClient) return
    const cleanupErrors: string[] = []
    if (fixturePageId) {
      const { data, error } = await fixtureClient.from('pages').delete().eq('id', fixturePageId).select('id').single<{ id: string }>()
      if (error || data?.id !== fixturePageId) cleanupErrors.push(`listing: ${error?.message || 'row not returned'}`)
    }
    if (planMetadataAdjusted) {
      const { error } = await fixtureClient.auth.updateUser({
        data: { plan: originalPlanMetadata },
      })
      if (error) cleanupErrors.push(`plan: ${error.message}`)
    }
    await fixtureClient.auth.signOut()
    if (cleanupErrors.length) throw new Error(`Could not fully clean up editor fixture: ${cleanupErrors.join('; ')}`)
  })

  test('editor loads and hydrates from server props', async ({ page }) => {
    test.skip(!email || !password || !fixturePageId, 'set E2E credentials and Supabase keys to run the authed E2E')
    const hydrationWarnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrated|hydration mismatch/i.test(message.text())) hydrationWarnings.push(message.text())
    })

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type="email"]').fill(email!)
    await page.locator('input[type="password"]').fill(password!)
    await page.locator('button[type="submit"]').first().click()
    // Leave the login page (destination can vary), then open the disposable listing directly.
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), {
      timeout: 30_000,
    })
    await page.goto(`/dashboard/${fixturePageId}`, {
      waitUntil: 'domcontentloaded',
    })

    // Server component hydrated with real data (no "Loading editor…" flash).
    const editor = page.getByTestId('listing-editor-screen')
    await expect(editor).toBeVisible()
    const nameValue = await page.locator('input[required]').first().inputValue()
    expect(nameValue.length).toBeGreaterThan(0)
    await expect(editor.getByRole('heading', { name: nameValue, exact: true })).toBeVisible()

    const sectionNav = editor.getByRole('navigation', {
      name: 'Edit listing sections',
    })
    for (const section of ['Listing basics', 'Offers & pricing', 'Operations', 'Agent readiness', 'Publishing']) {
      await expect(sectionNav.getByRole('link', { name: section, exact: true })).toBeVisible()
    }

    await sectionNav.getByRole('link', { name: 'Offers & pricing' }).click()
    await expect(page).toHaveURL(/#offers$/)
    await expect(page.locator('#offers')).toHaveAttribute('aria-current', 'location')

    const activeNavLink = sectionNav.getByRole('link', {
      name: 'Offers & pricing',
    })
    await expect(activeNavLink).toHaveClass(/settings-choice-active/)
    await expect.poll(() => activeNavLink.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe('rgba(0, 0, 0, 0)')
    const activeNavStyle = await activeNavLink.evaluate((element) => ({
      backgroundImage: getComputedStyle(element).backgroundImage,
    }))
    expect(activeNavStyle.backgroundImage).toBe('none')

    const copilotTab = editor.getByRole('tab', { name: 'Descriptions' })
    await expect(copilotTab).toHaveAttribute('aria-selected', 'true')
    await expect(copilotTab).toHaveClass(/platform-tab/)

    const saveButton = editor.getByRole('button', { name: /save changes/i })
    await expect(saveButton).toBeVisible()
    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('radio', { name: theme, exact: true }).click()
      await page.waitForTimeout(500)
      const buttonStyle = await saveButton.evaluate((element) => ({
        backgroundImage: getComputedStyle(element).backgroundImage,
        borderColor: getComputedStyle(element).borderColor,
        borderRadius: getComputedStyle(element).borderRadius,
      }))
      expect(buttonStyle.backgroundImage).toBe('none')
      expect(buttonStyle.borderColor).not.toBe('rgba(0, 0, 0, 0)')
      expect(parseFloat(buttonStyle.borderRadius)).toBeGreaterThan(0)
    }

    await page.goto('/dashboard/listings', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Listings', exact: true })).toBeVisible()
    const allListingsTab = page.getByRole('link', { name: /^All\s+\d+$/ })
    await expect(allListingsTab).toHaveAttribute('aria-current', 'page')
    await expect(allListingsTab).toHaveClass(/platform-tab/)
    const newListing = page.getByRole('link', { name: 'New listing', exact: true })
    const newListingStyle = await newListing.evaluate((element) => ({
      backgroundImage: getComputedStyle(element).backgroundImage,
      borderColor: getComputedStyle(element).borderColor,
    }))
    expect(newListingStyle.backgroundImage).toBe('none')
    expect(newListingStyle.borderColor).not.toBe('rgba(0, 0, 0, 0)')

    await page.goto('/dashboard/finance', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Live mode only', { exact: true })).toHaveCount(0)
    const financeWindow = page.getByRole('navigation', { name: 'Finance window' })
    await expect(financeWindow).toBeVisible()
    await expect(financeWindow.getByRole('link', { name: '30d', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(financeWindow.getByRole('link', { name: '30d', exact: true })).toHaveClass(/platform-tab/)
    expect(hydrationWarnings).toEqual([])
  })
})
