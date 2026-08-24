#!/usr/bin/env node

import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const BASE_URL = trimBase(process.env.NEXEZ_COMMERCE_CERT_BASE || 'https://nexez.app')
const SLUG = process.env.NEXEZ_COMMERCE_CERT_SLUG || 'nexez-agent-negotiation-lab'
const OFFER = process.env.NEXEZ_COMMERCE_CERT_OFFER || 'services-0'
const TIMEOUT_MS = positiveNumber(process.env.NEXEZ_COMMERCE_CERT_TIMEOUT_MS, 15_000)
const results = []

const checkoutPayload = {
  slug: SLUG,
  offer: OFFER,
  query: 'Nexez commerce certification: checkout approval safety',
  buyerAgent: 'Nexez Commerce Certification',
}
const negotiationPayload = {
  slug: SLUG,
  offer: OFFER,
  buyerAgent: 'Nexez Commerce Certification',
  query: 'Nexez commerce certification: negotiation approval safety',
  budget: 'USD 2100',
  timeline: 'next week',
}

await check('API health responds', async () => {
  const response = await fetchJson(`${BASE_URL}/api/v1/health`)
  assert(response.ok === true, 'health response did not report ok=true')
})

await check('certification listing exposes the target offer', async () => {
  const manifest = await fetchJson(`${BASE_URL}/${SLUG}/agent.json`)
  const offer = manifest.offers?.find((item) => item.key === OFFER)
  assert(Boolean(offer), `offer ${OFFER} is missing from /${SLUG}/agent.json`)
})

await check('checkout dry run issues a required approval token', async () => {
  const response = await postJson('/api/checkout', { ...checkoutPayload, dryRun: true })
  assert(response.ok === true, 'checkout dry run did not report ok=true')
  assert(response.approvalTokenRequired === true, 'checkout approval is not mandatory')
  assertToken(response.approvalToken, 'checkout')
})

await check('tokenless live checkout fails closed', async () => {
  const response = await postJsonRaw('/api/checkout', { ...checkoutPayload, dryRun: false })
  assert(response.status === 403, `expected HTTP 403, received ${response.status}`)
  assert(response.body.code === 'approval_required', `expected approval_required, received ${response.body.code || 'no code'}`)
})

await check('negotiation dry run issues a required approval token', async () => {
  const response = await postJson('/api/negotiations', { ...negotiationPayload, dryRun: true })
  assert(response.ok === true, 'negotiation dry run did not report ok=true')
  assert(response.approvalTokenRequired === true, 'negotiation approval is not mandatory')
  assertToken(response.approvalToken, 'negotiation')
})

await check('tokenless live negotiation fails closed', async () => {
  const response = await postJsonRaw('/api/negotiations', { ...negotiationPayload, dryRun: false })
  assert(response.status === 403, `expected HTTP 403, received ${response.status}`)
  assert(response.body.code === 'approval_required', `expected approval_required, received ${response.body.code || 'no code'}`)
})

await checkStripeCatalog()
printSummary()
printManualChecks()

if (results.some((result) => result.status === 'fail')) process.exitCode = 1

async function check(name, fn) {
  const startedAt = Date.now()
  try {
    await fn()
    results.push({ name, status: 'pass', ms: Date.now() - startedAt })
    console.log(`PASS ${name}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ name, status: 'fail', ms: Date.now() - startedAt, message })
    console.error(`FAIL ${name}: ${message}`)
  }
}

async function checkStripeCatalog() {
  const secretKey = process.env.STRIPE_SECRET_KEY || ''
  const priceEntries = [
    ['Launch', process.env.STRIPE_PRICE_LAUNCH || process.env.NEXT_PUBLIC_STRIPE_PRICE_LAUNCH],
    ['Pro', process.env.STRIPE_PRICE_PRO || process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO],
    ['Scale', process.env.STRIPE_PRICE_SCALE || process.env.NEXT_PUBLIC_STRIPE_PRICE_SCALE],
  ]
  if (!secretKey) {
    results.push({ name: 'Stripe Price catalog matches key mode', status: 'skip', ms: 0, message: 'STRIPE_SECRET_KEY is not available locally.' })
    console.log('SKIP Stripe Price catalog matches key mode: STRIPE_SECRET_KEY is not available locally.')
    return
  }

  await check('Stripe Price catalog matches key mode', async () => {
    const expectedLive = secretKey.startsWith('sk_live_')
    assert(expectedLive || secretKey.startsWith('sk_test_'), 'Stripe secret key mode is not recognizable')
    for (const [plan, priceId] of priceEntries) {
      assert(typeof priceId === 'string' && priceId.startsWith('price_'), `${plan} is missing a valid price_ identifier`)
      const response = await fetchWithTimeout(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      })
      const text = await response.text()
      let body = {}
      try { body = text ? JSON.parse(text) : {} } catch {}
      assert(response.ok, `${plan} Price could not be read from Stripe (${response.status})`)
      assert(body.livemode === expectedLive, `${plan} Price belongs to the other Stripe mode`)
      assert(body.active === true, `${plan} Price is inactive`)
      assert(body.type === 'recurring', `${plan} Price is not recurring`)
    }
  })
}

async function postJson(path, body) {
  const response = await postJsonRaw(path, body)
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(response.body).slice(0, 240)}`)
  }
  return response.body
}

async function postJsonRaw(path, body) {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-nexez-client': 'commerce-certification/1.0',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = {}
  try { parsed = text ? JSON.parse(text) : {} } catch { parsed = { error: text.slice(0, 240) } }
  return { status: response.status, body: parsed }
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, { headers: { accept: 'application/json' } })
  const text = await response.text()
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 240)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${url} did not return JSON`)
  }
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': 'Nexez-Commerce-Certification/1.0',
        ...(init.headers || {}),
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

function assertToken(value, action) {
  assert(typeof value === 'string' && value.split('.').length === 3, `${action} approval token is missing or malformed`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function trimBase(value) {
  return value.replace(/\/+$/, '')
}

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function printSummary() {
  const passed = results.filter((result) => result.status === 'pass').length
  const failed = results.filter((result) => result.status === 'fail').length
  const skipped = results.filter((result) => result.status === 'skip').length
  console.log('')
  console.log(`Commerce certification: ${passed} passed, ${failed} failed, ${skipped} skipped`)
  for (const result of results) {
    const suffix = result.message ? ` - ${result.message}` : ''
    console.log(`${result.status.toUpperCase().padEnd(4)} ${String(result.ms).padStart(5)}ms ${result.name}${suffix}`)
  }
}

function printManualChecks() {
  console.log('')
  console.log('OWNER-RUN LIFECYCLE CHECKS (never automated against live money)')
  console.log('1. Subscription: subscribe, confirm entitlement webhook, open portal, then cancel.')
  console.log('2. Direct order: complete a low-value Connect checkout and verify fee, receipt, portal, and seller ledger.')
  console.log('3. Order operations: fulfill that order, submit and resolve one buyer problem report, and confirm one linked activity timeline.')
  console.log('4. Refund: partially refund the same order, verify the remainder, then finish the refund and verify fee reversal plus buyer/seller notices.')
  console.log('5. Negotiation: propose, approve, fund, capture, reconcile, and confirm buyer/seller notifications.')
  console.log('6. Price sync: update a certification Price and verify exactly one listing update plus audit event.')
  console.log('7. Protocol checkout: complete one ACP and one UCP session, replay each request, and verify one order per idempotency key.')
  console.log('8. Reservable resource: expire one unpurchased hold, settle one fresh hold, and verify the live order, committed hold, and reservation linkage.')
  console.log('9. Staged settlement: approve and pay each obligation separately, then verify every live order link and the completed agreement.')
}
