import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let fixtureClient: SupabaseClient | null = null
let fixtureOwnerId: string | null = null
let fixturePageId: string | null = null
let fixturePageName = ''
let fixturePageSlug = ''
let fixtureTargetHost = ''
let fixtureResearchIds: string[] = []
let originalPlanMetadata: unknown = null
let planMetadataAdjusted = false

function competitorResult(score: number, analyzedAt: string) {
  const targetUrl = `https://${fixtureTargetHost}/pricing`
  return {
    url: targetUrl,
    normalizedUrl: targetUrl,
    analyzedAt,
    scores: {
      overall: score,
      parseability: score + 3,
      structuredDataQuality: score - 4,
      clarityAndIntent: score + 1,
    },
    missing: ['No agent-native offer document detected'],
    strengths: ['Clear public service description'],
    weaknesses: ['Pricing is not machine-readable'],
    recommendations: ['Publish structured offers and an agent.json document'],
    provenance: {
      analysis: 'deterministic' as const,
      cache: { hit: false, scope: 'process' as const, ttlHours: 48 as const },
      fetch: 'respectful_public_web' as const,
    },
    signals: {
      hasJsonLd: true,
      jsonLdCount: 1,
      hasLlmsTxt: false,
      hasAgentJson: false,
      offerCount: 2,
      headingCount: 5,
      hasContact: true,
      textLength: 2400,
      priceMentions: 1,
    },
    userComparison: {
      slug: fixturePageSlug,
      readiness: 82,
      trust: 76,
      offerCount: 1,
      summary: 'The Nexez listing exposes a clearer machine-readable buying path.',
      winSuggestions: ['Keep structured pricing and direct actions current.'],
    },
  }
}

function researchEvidence() {
  return {
    execution: { boundary: 'server', method: 'deterministic', llmExecuted: false },
    source: { fetch: 'respectful_public_web', rawHtmlStored: false, cache: 'fresh' },
    storage: { scope: 'private_owner_workspace', immutable: true, savedByExplicitChoice: true },
    commerce: {
      transactionsExecuted: 0,
      notice: 'This fixture inspected summarized public information only. No transaction was executed.',
    },
  }
}

async function prepareFixtures() {
  if (fixturePageId) return
  if (!email || !password || !supabaseUrl || !supabaseKey) {
    throw new Error('Golden-path E2E requires test credentials and public Supabase connection keys')
  }

  fixtureClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await fixtureClient.auth.signInWithPassword({ email, password })
  if (authError || !authData.user) {
    throw new Error(`Could not authenticate the golden-path fixture owner: ${authError?.message || 'no user returned'}`)
  }
  fixtureOwnerId = authData.user.id

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  fixturePageName = `Agent Lab golden path ${unique}`
  fixturePageSlug = `agent-lab-golden-path-${unique}`
  fixtureTargetHost = `benchmark-${unique}.example`

  const { data: pageData, error: pageError } = await fixtureClient
    .from('pages')
    .insert({
      owner_id: fixtureOwnerId,
      name: fixturePageName,
      slug: fixturePageSlug,
      description: 'A disposable published listing that certifies the complete Settings and Agent Lab journey.',
      website_url: 'https://example.com',
      cta_url: 'https://example.com/contact',
      cta_label: 'Request a consultation',
      is_published: true,
      branding: {},
      products: [],
      services: [{
        name: 'Agent readiness consultation',
        description: 'A structured diagnostic with a concrete action plan.',
        price: '$250',
        cta_url: 'https://example.com/contact',
      }],
      faqs: [{ question: 'What is included?', answer: 'A diagnostic, evidence review, and prioritized recommendations.' }],
    })
    .select('id')
    .single<{ id: string }>()
  if (pageError || !pageData?.id) {
    throw new Error(`Could not create the golden-path listing: ${pageError?.message || 'no id returned'}`)
  }
  fixturePageId = pageData.id

  const selectedPlan = authData.user.user_metadata?.plan
  if (!['free', 'launch', 'pro', 'scale'].includes(selectedPlan)) {
    originalPlanMetadata = selectedPlan ?? null
    const { error } = await fixtureClient.auth.updateUser({ data: { plan: 'free' } })
    if (error) throw new Error(`Could not prepare the golden-path workspace plan: ${error.message}`)
    planMetadataAdjusted = true
  }

  const now = Date.now()
  const targetUrl = `https://${fixtureTargetHost}/pricing`
  const researchRows = [
    { score: 52, createdAt: new Date(now - 60_000).toISOString() },
    { score: 67, createdAt: new Date(now).toISOString() },
  ].map(({ score, createdAt }) => ({
    owner_id: fixtureOwnerId,
    kind: 'competitor_benchmark',
    target_url: targetUrl,
    target_host: fixtureTargetHost,
    compared_page_id: fixturePageId,
    compared_page_slug: fixturePageSlug,
    result: competitorResult(score, createdAt),
    evidence: researchEvidence(),
    created_at: createdAt,
  }))
  const { data: researchData, error: researchError } = await fixtureClient
    .from('agent_lab_research_runs')
    .insert(researchRows)
    .select('id')
  if (researchError || researchData?.length !== 2) {
    throw new Error(`Could not create the golden-path research history: ${researchError?.message || 'unexpected row count'}`)
  }
  fixtureResearchIds = researchData.map((row) => row.id)
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email!)
  await page.locator('input[type="password"]').fill(password!)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

test.describe('Settings and Agent Lab five-pass golden path', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!email || !password || !supabaseUrl || !supabaseKey, 'set E2E credentials and Supabase public keys')

  test.beforeAll(async () => {
    await prepareFixtures()
  })

  test.afterAll(async () => {
    if (!fixtureClient) return
    const cleanupErrors: string[] = []

    if (fixturePageId) {
      const { error } = await fixtureClient.from('agent_lab_simulation_runs').delete().eq('page_id', fixturePageId)
      if (error) cleanupErrors.push(`simulation runs: ${error.message}`)
    }
    if (fixtureResearchIds.length) {
      const { error } = await fixtureClient.from('agent_lab_research_runs').delete().in('id', fixtureResearchIds)
      if (error) cleanupErrors.push(`research runs: ${error.message}`)
    }
    if (fixturePageId) {
      const { data, error } = await fixtureClient.from('pages').delete().eq('id', fixturePageId).select('id').maybeSingle()
      if (error || data?.id !== fixturePageId) cleanupErrors.push(`listing: ${error?.message || 'fixture row was not deleted'}`)
    }
    if (planMetadataAdjusted) {
      const { error } = await fixtureClient.auth.updateUser({ data: { plan: originalPlanMetadata } })
      if (error) cleanupErrors.push(`plan metadata: ${error.message}`)
    }
    await fixtureClient.auth.signOut()
    if (cleanupErrors.length) throw new Error(`Golden-path cleanup failed: ${cleanupErrors.join('; ')}`)
  })

  test('carries attributable evidence and research from Agent Lab back into Settings operations', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))

    await login(page)
    await page.goto('/dashboard/settings#agent-surfaces', { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('account-settings-screen')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Agent operations', exact: true })).toBeVisible()
    await expect(page.getByText(fixtureTargetHost, { exact: false })).toBeVisible()
    await expect(page.getByText(fixturePageName, { exact: true }).first()).toBeVisible()

    await page.goto('/simulator?mode=test', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('agent-lab-screen')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('tab', { name: 'Test a listing' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Test a listing' })).toHaveClass(/platform-tab/)

    await page.getByRole('button', { name: fixturePageName, exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'immutable Agent Lab run' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'What this run actually verified' })).toBeVisible()
    await expect(page.getByText('No transaction executed', { exact: true })).toBeVisible()
    await expect(page.getByText(/1 saved runs? for this listing/)).toBeVisible()

    const { count: persistedRuns, error: persistedError } = await fixtureClient!
      .from('agent_lab_simulation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('page_id', fixturePageId!)
      .eq('owner_id', fixtureOwnerId!)
    expect(persistedError).toBeNull()
    expect(persistedRuns).toBe(1)

    const testTab = page.getByRole('tab', { name: 'Test a listing' })
    await testTab.focus()
    await testTab.press('End')
    await expect(page).toHaveURL(/\?mode=compare$/)
    await expect(page.getByRole('tab', { name: 'Compare a competitor' })).toHaveAttribute('aria-selected', 'true')

    const archive = page.getByLabel('Saved competitor benchmarks')
    await expect(archive).toBeVisible()
    await expect(archive.getByLabel('Research trend summary')).toContainText('With trend1')
    await expect(archive.getByText('+15 score since prior snapshot')).toBeVisible()
    await archive.getByRole('button', { name: `Open report` }).first().click()
    await expect(page.getByRole('status').filter({ hasText: 'Loaded saved benchmark' })).toBeVisible()
    await expect(page.getByText(`Analysis for`, { exact: false })).toBeVisible()
    await expect(page.getByText('67', { exact: true }).first()).toBeVisible()

    await page.goto('/dashboard/settings#agent-surfaces', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Evidence runs', { exact: true })).toBeVisible()
    await expect(page.getByText(fixtureTargetHost, { exact: false })).toBeVisible()
    await expect(page.getByText(/\+15 vs prior snapshot/)).toBeVisible()

    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
  })

  test('runs the per-listing simulator against an owner-only draft and stays responsive', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))

    const { error: draftError } = await fixtureClient!
      .from('pages')
      .update({ is_published: false })
      .eq('id', fixturePageId!)
    expect(draftError).toBeNull()

    try {
      await login(page)
      await page.goto(`/dashboard/${fixturePageId}/test`, { waitUntil: 'domcontentloaded' })

      const simulator = page.getByTestId('listing-agent-simulator')
      await expect(simulator).toBeVisible({ timeout: 15_000 })
      await expect(simulator).toHaveClass(/nx-platform-surface/)
      await expect(page.getByText('Owner draft', { exact: true })).toBeVisible()
      await expect(page.getByTestId('draft-embed-preview')).toBeVisible()
      await expect(page.locator('iframe[title="Live embed preview"]')).toHaveCount(0)

      const query = page.getByLabel('Simulate this query from an agent')
      await query.fill('Review this draft for a buyer who needs a consultation')
      await page.getByRole('button', { name: 'Run Analysis' }).click()

      await expect(page.getByRole('status').filter({ hasText: 'Analysis complete and saved' })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('Saved to history', { exact: true })).toBeVisible()
      await expect(page.getByText('Checkout path responded', { exact: false })).toHaveCount(0)

      await page.getByRole('tab', { name: 'Natural Language' }).click()
      await expect(page.getByText(/Would recommend|Needs information|Would skip/).first()).toBeVisible()

      const { data: latestRun, error: runError } = await fixtureClient!
        .from('agent_lab_simulation_runs')
        .select('evidence')
        .eq('page_id', fixturePageId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .single<{ evidence: { commerce: { scope: string } } }>()
      expect(runError).toBeNull()
      expect(latestRun?.evidence.commerce.scope).toBe('owner_draft')

      await page.setViewportSize({ width: 390, height: 844 })
      const mobileOverflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - window.innerWidth,
        body: document.body.scrollWidth - window.innerWidth,
      }))
      expect(mobileOverflow.document).toBeLessThanOrEqual(0)
      expect(mobileOverflow.body).toBeLessThanOrEqual(0)
      expect(pageErrors, `Uncaught page errors:\n${pageErrors.join('\n')}`).toEqual([])
    } finally {
      const { error } = await fixtureClient!
        .from('pages')
        .update({ is_published: true })
        .eq('id', fixturePageId!)
      expect(error).toBeNull()
    }
  })
})
