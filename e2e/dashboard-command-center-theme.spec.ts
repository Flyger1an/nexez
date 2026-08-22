import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let fixtureClient: SupabaseClient | null = null
let originalPlanMetadata: unknown = null
let planMetadataAdjusted = false

test.beforeAll(async () => {
  if (!email || !password || !supabaseUrl || !supabaseKey) return
  fixtureClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await fixtureClient.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Could not authenticate dashboard fixture: ${error?.message || 'no user returned'}`)

  const selectedPlan = data.user.user_metadata?.plan
  if (!['free', 'launch', 'pro', 'scale'].includes(selectedPlan)) {
    originalPlanMetadata = selectedPlan ?? null
    const { error: metadataError } = await fixtureClient.auth.updateUser({ data: { plan: 'free' } })
    if (metadataError) throw new Error(`Could not prepare dashboard fixture plan: ${metadataError.message}`)
    planMetadataAdjusted = true
  }
})

test.afterAll(async () => {
  if (!fixtureClient) return
  if (planMetadataAdjusted) {
    const { error } = await fixtureClient.auth.updateUser({ data: { plan: originalPlanMetadata } })
    if (error) throw new Error(`Could not restore dashboard fixture plan: ${error.message}`)
  }
  await fixtureClient.auth.signOut()
})

async function login(page: Page) {
  test.skip(
    !email || !password || !supabaseUrl || !supabaseKey,
    'set E2E credentials and Supabase keys to run the dashboard theme E2E',
  )

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email!)
  await page.locator('input[type="password"]').fill(password!)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
}

function rgbChannels(color: string): [number, number, number] {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!channels || channels.length !== 3) throw new Error(`Unsupported computed color: ${color}`)
  return channels as [number, number, number]
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const [red, green, blue] = rgbChannels(color).map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

test('commercial command cards remain readable in light and dark platform themes', async ({ page }) => {
  await login(page)

  const surface = page.locator('[data-theme-surface="dark"]')
  await expect(surface).toBeVisible()
  const demandCard = surface.locator('a[href="/dashboard/analytics?range=today"]')
  await expect(demandCard).toBeVisible()

  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('radio', { name: theme, exact: true }).click()
    await expect(page.locator('html')).toHaveClass(new RegExp(theme.toLowerCase()))

    const styles = await demandCard.evaluate((card) => {
      const value = card.querySelector('span')
      const paragraphs = card.querySelectorAll('p')
      if (!value || paragraphs.length < 2) throw new Error('Command card typography is incomplete')
      return {
        background: getComputedStyle(card).backgroundColor,
        value: getComputedStyle(value).color,
        label: getComputedStyle(paragraphs[0]).color,
        detail: getComputedStyle(paragraphs[1]).color,
        colorScheme: getComputedStyle(card).colorScheme,
      }
    })

    expect(styles.colorScheme).toBe('dark')
    expect(contrastRatio(styles.value, styles.background)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(styles.label, styles.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(styles.detail, styles.background)).toBeGreaterThanOrEqual(4.5)

    await demandCard.hover()
    const hoverStyles = await demandCard.evaluate((card) => {
      const value = card.querySelector('span')
      if (!value) throw new Error('Command card value is missing')
      return {
        background: getComputedStyle(card).backgroundColor,
        value: getComputedStyle(value).color,
      }
    })
    expect(contrastRatio(hoverStyles.value, hoverStyles.background)).toBeGreaterThanOrEqual(7)
  }
})
