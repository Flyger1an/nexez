import assert from 'node:assert/strict'

import plugin from '../dist/index.js'

if (!process.argv.includes('--production')) {
  throw new Error('Production gauntlet requires the explicit --production flag.')
}

const baseUrl = process.env.NEXEZ_BASE_URL || 'https://nexez.app'
const registered = new Map()
let checkoutFixture
let negotiationFixture
let passed = 0

plugin.register({
  pluginConfig: {
    baseUrl,
    userAgent: 'Nexez OpenClaw Production Gauntlet/1.0',
  },
  registerTool(tool, options) {
    registered.set(tool.name, { tool, options: options || {} })
  },
})

await check('search discovers a checkout-ready public fixture', async () => {
  const result = await invoke('nexez_search', {
    query: 'Shopify Review Catalog',
    limit: 20,
  })
  assert.equal(result.schema_version, 'nexez.agent-search.v1')
  const rows = requireArray(result.results, 'search results')
  const match = rows.find((row) =>
    row?.page?.slug === 'shopify-review-catalog' &&
    typeof row?.offer?.key === 'string' &&
    row?.marketplace?.supports_checkout === true,
  )
  assert.ok(match, 'No checkout-ready Shopify review fixture was found.')
  checkoutFixture = { slug: match.page.slug, offer: match.offer.key }
})

await check('get-page resolves the selected agent manifest', async () => {
  const result = await invoke('nexez_get_page', { slug: checkoutFixture.slug })
  assert.ok(result && typeof result === 'object')
  assert.ok(
    result.slug === checkoutFixture.slug ||
      result.business?.slug === checkoutFixture.slug ||
      result.page?.slug === checkoutFixture.slug,
    'Agent manifest did not identify the requested slug.',
  )
})

await check('directory accepts category and location filters', async () => {
  const result = await invoke('nexez_directory', {
    query: 'consulting',
    category: 'professional',
    minReadiness: 20,
    location: 'Austin, Texas',
    lat: 30.2672,
    lng: -97.7431,
  })
  assert.ok(result && typeof result === 'object')
  assert.ok(
    Array.isArray(result.results) || Array.isArray(result.pages) || Number.isFinite(result.result_count),
    'Directory response had no recognizable result collection.',
  )
})

await check('location-aware search reports an active location filter', async () => {
  const result = await invoke('nexez_search', {
    query: 'consulting',
    location: 'Austin, Texas',
    lat: 30.2672,
    lng: -97.7431,
    limit: 5,
  })
  assert.equal(result.location_filter?.active, true)
})

await check('checkout validation stays non-mutating and resolves a purchase path', async () => {
  const result = await invoke('nexez_validate_checkout', {
    ...checkoutFixture,
    query: 'OpenClaw production gauntlet dry run',
  })
  assert.equal(result.ok, true)
  assert.ok(typeof result.actionUrl === 'string' || typeof result.checkoutUrl === 'string')
})

await check('fixed-price negotiation normalizes to a checkout branch', async () => {
  const result = await invoke('nexez_validate_negotiation', {
    ...checkoutFixture,
    query: 'OpenClaw production gauntlet dry run',
    budget: '$8',
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /use checkout/i)
  assert.ok(result.rulesEvaluation?.reasons?.includes('offer_not_negotiable'))
})

await check('search discovers a negotiation-ready public fixture', async () => {
  const result = await invoke('nexez_search', {
    query: 'negotiation gauntlet',
    limit: 50,
  })
  const rows = requireArray(result.results, 'negotiation search results')
  const match = rows.find((row) =>
    row?.marketplace?.supports_negotiation === true &&
    typeof row?.page?.slug === 'string' &&
    typeof row?.offer?.key === 'string',
  )
  assert.ok(match, 'No negotiation-ready fixture was found.')
  negotiationFixture = { slug: match.page.slug, offer: match.offer.key }
})

await check('negotiation validation parses budget without writing a proposal', async () => {
  const result = await invoke('nexez_validate_negotiation', {
    ...negotiationFixture,
    query: 'OpenClaw production gauntlet dry run',
    budget: '$2,000',
    timeline: 'Q4 2026',
    requestedTerms: { scope: 'Production gauntlet validation only' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.dryRun, true)
  const reasons = result.rulesEvaluation?.reasons || []
  assert.ok(!reasons.includes('offer_not_negotiable'))
  assert.ok(!reasons.includes('no_proposed_price'))
})

await check('checkout action rejects approval bypass values locally', async () => {
  await assertApprovalGate('nexez_start_checkout', {
    slug: 'openclaw-gauntlet-must-not-reach-network',
    offer: 'services-0',
  })
})

await check('negotiation action rejects approval bypass values locally', async () => {
  await assertApprovalGate('nexez_submit_negotiation', {
    slug: 'openclaw-gauntlet-must-not-reach-network',
    offer: 'services-0',
    budget: '$1',
  })
})

await check('missing agent pages fail with a typed 404', async () => {
  await assert.rejects(
    invoke('nexez_get_page', { slug: 'openclaw-gauntlet-page-does-not-exist' }),
    (error) => error?.name === 'NexezApiError' && error.status === 404,
  )
})

await check('bounded concurrent discovery remains healthy', async () => {
  const responses = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      invoke('nexez_search', {
        query: `OpenClaw gauntlet discovery ${index + 1}`,
        limit: 3,
      }),
    ),
  )
  assert.equal(responses.length, 6)
  assert.ok(responses.every((result) => result?.schema_version === 'nexez.agent-search.v1'))
})

console.log(`\nOpenClaw production gauntlet passed: ${passed} checks, 7 tools, 0 mutations.`)
console.log(`Base URL: ${baseUrl}`)
console.log(`Checkout fixture: ${checkoutFixture.slug}/${checkoutFixture.offer}`)
console.log(`Negotiation fixture: ${negotiationFixture.slug}/${negotiationFixture.offer}`)

async function check(label, run) {
  await run()
  passed += 1
  console.log(`PASS ${label}`)
}

async function invoke(name, params) {
  const registeredTool = registered.get(name)
  assert.ok(registeredTool, `Tool ${name} was not registered.`)
  const result = await registeredTool.tool.execute(`production-gauntlet-${name}`, params)
  assert.ok(result && typeof result === 'object')
  return result.details
}

async function assertApprovalGate(name, baseParams) {
  for (const value of [undefined, false, 'true', 1, null, {}]) {
    const params = { ...baseParams }
    if (value !== undefined) params.userApproved = value
    await assert.rejects(
      invoke(name, params),
      (error) =>
        error?.name === 'ToolAuthorizationError' &&
        error.status === 403 &&
        /^Refusing to start/.test(error.message),
    )
  }
}

function requireArray(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array.`)
  return value
}
