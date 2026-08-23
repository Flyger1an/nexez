export const CERTIFICATION_SOURCE_SLUG = 'nexez-agent-negotiation-lab'
export const CERTIFICATION_SLUG = 'nexez-party-rentals-certification'
export const CERTIFICATION_MARKER = 'Nexez internal certification fixture: party-rentals-v1'
export const CERTIFICATION_POOL_KEY = 'certification-chairs'
export const CERTIFICATION_WINDOW_PREFIX = 'certification-window-'

const HOUR_MS = 60 * 60 * 1_000
const DAY_MS = 24 * HOUR_MS

export function buildCertificationPage(ownerId) {
  return {
    owner_id: ownerId,
    name: 'Nexez Party Rentals Certification',
    slug: CERTIFICATION_SLUG,
    description: 'Controlled Nexez fixture for proving authoritative rental inventory and buyer-approved staged payments.',
    audience: 'Nexez commerce certification operators',
    location: 'Austin, Texas',
    industry: 'Event Services',
    cta_label: 'Run certification',
    products: [],
    services: [],
    faqs: [],
    currency: 'usd',
    is_published: false,
    mcp_enabled: true,
    llm_opt_in: true,
    agent_memory: { notes: CERTIFICATION_MARKER },
  }
}

export function buildCertificationPool(pageId, ownerId) {
  return {
    owner_id: ownerId,
    page_id: pageId,
    resource_key: CERTIFICATION_POOL_KEY,
    label: 'Certification chairs',
    unit_label: 'chair',
    kind: 'reusable',
    total_quantity: 4,
    status: 'active',
  }
}

export function buildCertificationWindow(poolId, now = new Date()) {
  const starts = new Date(now.getTime() + 7 * DAY_MS)
  starts.setUTCHours(16, 0, 0, 0)
  const ends = new Date(starts.getTime() + 4 * HOUR_MS)
  return {
    pool_id: poolId,
    window_key: `${CERTIFICATION_WINDOW_PREFIX}${starts.toISOString().slice(0, 10).replaceAll('-', '')}`,
    label: `Certification event ${starts.toISOString().slice(0, 10)}`,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    total_quantity: 4,
    status: 'active',
  }
}

export function selectReusableCertificationWindow(windows, now = new Date()) {
  const minimumEnd = now.getTime() + HOUR_MS
  const minimumStart = now.getTime() + HOUR_MS
  return [...windows]
    .filter((window) => (
      window.window_key?.startsWith(CERTIFICATION_WINDOW_PREFIX)
      && window.status === 'active'
      && Date.parse(window.starts_at) > minimumStart
      && Date.parse(window.ends_at) > minimumEnd
    ))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null
}

export function buildCertificationOffers(poolId, windowId) {
  return [
    {
      name: 'Certification Chair Reservation',
      description: 'Reserve one to three chairs from an authoritative Nexez inventory window.',
      price: '$1.00',
      url: '',
      offerType: 'fixed',
      source: 'nexez',
      customerInputs: [
        {
          key: 'chair-count',
          label: 'Chair count',
          description: 'Choose the exact quantity to hold for this certification run.',
          valueType: 'quantity',
          required: true,
          askBuyer: 'How many chairs should Nexez reserve? Choose between one and three.',
          affects: ['availability', 'scope'],
        },
      ],
      reservableResourceTerms: {
        schemaVersion: 1,
        requirements: [
          {
            poolId,
            windowId,
            quantity: { source: 'input', inputKey: 'chair-count' },
          },
        ],
      },
    },
    {
      name: 'Certification Staged Event Package',
      description: 'A two-dollar fixed total split into two separately approved one-dollar payments.',
      price: '$2.00',
      url: '',
      offerType: 'fixed',
      source: 'nexez',
      stagedSettlementTerms: {
        schemaVersion: 1,
        paymentModel: 'staged-fixed-total',
        approvalPolicy: 'buyer-approves-each-stage',
        mutationPolicy: 'immutable-after-first-payment',
        stages: [
          { id: 'commitment', label: 'Reservation commitment', kind: 'commitment', allocationBps: 5000 },
          { id: 'completion', label: 'Fulfillment completion', kind: 'completion', allocationBps: 5000 },
        ],
      },
    },
  ]
}

export function assertCertificationOwnerReady(sourcePage, billing) {
  if (!sourcePage?.id || !sourcePage?.owner_id) {
    throw new Error('The source certification listing is missing or has no owner.')
  }
  if (
    !billing?.stripe_connect_account_id
    || billing.stripe_connect_charges_enabled !== true
    || billing.stripe_connect_payouts_enabled !== true
  ) {
    throw new Error('The certification owner is not ready for both Connect charges and payouts.')
  }
}

export function assertSafeTargetPage(targetPage, ownerId) {
  if (!targetPage) return
  if (targetPage.owner_id !== ownerId) {
    throw new Error('The certification slug belongs to a different owner.')
  }
  if (targetPage.is_published === true) {
    throw new Error('The certification page is published. Unpublish it before setup can reconcile state.')
  }
  if (targetPage.agent_memory?.notes !== CERTIFICATION_MARKER) {
    throw new Error('The certification slug exists without the expected private fixture marker.')
  }
  if (!Array.isArray(targetPage.products) || targetPage.products.length !== 0) {
    throw new Error('The certification page contains unmanaged products.')
  }
}

export function assertSafePool(pool, pageId, ownerId) {
  if (!pool) return
  const expected = buildCertificationPool(pageId, ownerId)
  for (const field of Object.keys(expected)) {
    if (pool[field] !== expected[field]) {
      throw new Error(`Certification pool drift detected in ${field}.`)
    }
  }
}

export function assertSafePools(pools, pageId, ownerId) {
  if (pools.length === 0) return
  if (pools.length > 1) throw new Error('The certification page contains an unmanaged resource pool.')
  if (pools[0]?.resource_key !== CERTIFICATION_POOL_KEY) {
    throw new Error('The certification page contains an unmanaged resource pool.')
  }
  assertSafePool(pools[0] ?? null, pageId, ownerId)
}

export function assertSafeWindows(windows, poolId) {
  for (const window of windows) {
    const starts = Date.parse(window.starts_at)
    const ends = Date.parse(window.ends_at)
    const date = Number.isFinite(starts) ? new Date(starts).toISOString().slice(0, 10) : ''
    if (
      window.pool_id !== poolId
      || window.window_key !== `${CERTIFICATION_WINDOW_PREFIX}${date.replaceAll('-', '')}`
      || window.label !== `Certification event ${date}`
      || !Number.isFinite(starts)
      || ends - starts !== 4 * HOUR_MS
      || window.total_quantity !== 4
      || !['active', 'paused', 'retired'].includes(window.status)
    ) {
      throw new Error('The certification pool contains an unmanaged resource window.')
    }
  }
}

export function assertSafeExistingServices(services, poolId, knownWindowIds) {
  if (!Array.isArray(services) || services.length === 0) return
  if (services.length !== 2) throw new Error('The certification page contains an unmanaged offer set.')

  const [resourceOffer] = services
  const requirement = resourceOffer?.reservableResourceTerms?.requirements?.[0]
  if (
    requirement?.poolId !== poolId
    || !knownWindowIds.has(requirement?.windowId)
    || !sameJson(services, buildCertificationOffers(poolId, requirement.windowId))
  ) {
    throw new Error('The certification page offer contract has unmanaged drift.')
  }
}

export function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    )
  }
  return value
}
