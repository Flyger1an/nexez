#!/usr/bin/env node

import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import {
  CERTIFICATION_MARKER,
  CERTIFICATION_POOL_KEY,
  CERTIFICATION_SLUG,
  CERTIFICATION_SOURCE_SLUG,
  assertCertificationOwnerReady,
  assertSafeExistingServices,
  assertSafePools,
  assertSafeTargetPage,
  assertSafeWindows,
  buildCertificationOffers,
  buildCertificationPage,
  buildCertificationPool,
  buildCertificationWindow,
  sameJson,
  selectReusableCertificationWindow,
} from './party-rentals-certification.mjs'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const apply = process.argv.includes('--apply')
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--apply')
if (unknownArgs.length) fail(`Unknown argument: ${unknownArgs.join(', ')}`)
if (apply && process.env.NEXEZ_CERTIFICATION_ALLOW_PRODUCTION_WRITE !== '1') {
  fail('Set NEXEZ_CERTIFICATION_ALLOW_PRODUCTION_WRITE=1 together with --apply to mutate the unpublished fixture.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const actions = []
const now = new Date()
const dryRunIds = {
  page: '00000000-0000-4000-8000-000000000001',
  pool: '00000000-0000-4000-8000-000000000002',
  window: '00000000-0000-4000-8000-000000000003',
}

const sourcePage = await one(
  admin.from('pages').select('id, owner_id').eq('slug', CERTIFICATION_SOURCE_SLUG).maybeSingle(),
  'read the source certification listing',
)
const billing = sourcePage?.owner_id
  ? await one(
    admin
      .from('billing_subscriptions')
      .select('stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
      .eq('owner_id', sourcePage.owner_id)
      .maybeSingle(),
    'read certification owner settlement readiness',
  )
  : null
assertCertificationOwnerReady(sourcePage, billing)

let targetPage = await one(
  admin
    .from('pages')
    .select('id, owner_id, slug, is_published, services, products, agent_memory')
    .eq('slug', CERTIFICATION_SLUG)
    .maybeSingle(),
  'read the Party Rentals certification listing',
)
assertSafeTargetPage(targetPage, sourcePage.owner_id)

if (!targetPage) {
  actions.push('create unpublished certification page')
  if (apply) {
    targetPage = await one(
      admin
        .from('pages')
        .insert(buildCertificationPage(sourcePage.owner_id))
        .select('id, owner_id, slug, is_published, services, products, agent_memory')
        .single(),
      'create the Party Rentals certification listing',
    )
  } else {
    targetPage = {
      id: dryRunIds.page,
      owner_id: sourcePage.owner_id,
      slug: CERTIFICATION_SLUG,
      is_published: false,
      services: [],
      products: [],
      agent_memory: { notes: CERTIFICATION_MARKER },
    }
  }
}

let pool = null
let windows = []
if (targetPage) {
  const pools = await many(
    admin
      .from('resource_pools')
      .select('id, owner_id, page_id, resource_key, label, unit_label, kind, total_quantity, status, version')
      .eq('page_id', targetPage.id)
      .order('created_at', { ascending: true }),
    'read certification resource pools',
  )
  assertSafePools(pools, targetPage.id, sourcePage.owner_id)
  pool = pools[0] ?? null
  if (pool) {
    windows = await many(
      admin
        .from('resource_pool_windows')
        .select('id, pool_id, window_key, label, starts_at, ends_at, total_quantity, status, version')
        .eq('pool_id', pool.id)
        .order('starts_at', { ascending: true }),
      'read certification resource windows',
    )
    assertSafeWindows(windows, pool.id)
  }
}

if (!pool) {
  actions.push('create reusable chair pool with four units')
  if (apply) {
    pool = await one(
      admin
        .from('resource_pools')
        .insert(buildCertificationPool(targetPage.id, sourcePage.owner_id))
        .select('id, owner_id, page_id, resource_key, label, unit_label, kind, total_quantity, status, version')
        .single(),
      'create the certification resource pool',
    )
  } else {
    pool = { id: dryRunIds.pool, ...buildCertificationPool(targetPage.id, sourcePage.owner_id) }
  }
}

let window = pool ? selectReusableCertificationWindow(windows, now) : null
if (!window) {
  const windowDraft = buildCertificationWindow(pool.id, now)
  if (windows.some((candidate) => candidate.window_key === windowDraft.window_key)) {
    throw new Error('The next certification window key already exists but is not safely reusable.')
  }
  actions.push('create a four-hour certification inventory window')
  if (apply) {
    window = await one(
      admin
        .from('resource_pool_windows')
        .insert(windowDraft)
        .select('id, pool_id, window_key, label, starts_at, ends_at, total_quantity, status, version')
        .single(),
      'create the certification resource window',
    )
    windows = [...windows, window]
  } else {
    window = { id: dryRunIds.window, ...windowDraft }
    windows = [...windows, window]
  }
}

if (targetPage && pool) {
  assertSafeExistingServices(
    targetPage.services,
    pool.id,
    new Set(windows.map((candidate) => candidate.id)),
  )
}

if (targetPage && pool && window) {
  const offers = buildCertificationOffers(pool.id, window.id)
  if (!sameJson(targetPage.services, offers)) {
    actions.push('write separate $1 reservable and $2 staged offers')
    if (apply) {
      const managedPageFields = buildCertificationPage(sourcePage.owner_id)
      delete managedPageFields.owner_id
      delete managedPageFields.slug
      targetPage = await one(
        admin
          .from('pages')
          .update({
            ...managedPageFields,
            services: offers,
          })
          .eq('id', targetPage.id)
          .eq('owner_id', sourcePage.owner_id)
          .eq('is_published', false)
          .contains('agent_memory', { notes: CERTIFICATION_MARKER })
          .select('id, owner_id, slug, is_published, services, products, agent_memory')
          .single(),
        'write the certification offer contracts',
      )
    }
  }
}

console.log(`${apply ? 'APPLY' : 'DRY RUN'} Party Rentals certification setup`)
console.log(`Source owner settlement ready: yes`)
console.log(`Target listing: /${CERTIFICATION_SLUG} (unpublished)`)
console.log(`Fixture marker: ${CERTIFICATION_MARKER}`)
if (actions.length === 0) console.log('No changes required.')
else for (const action of actions) console.log(`${apply ? 'DONE' : 'WOULD'} ${action}`)
console.log('Safety: no listing was published, no hold was acquired, and no payment or order was created.')

async function one(query, action) {
  const { data, error } = await query
  if (error) throw new Error(`Could not ${action}: ${error.message}`)
  return data ?? null
}

async function many(query, action) {
  const { data, error } = await query
  if (error) throw new Error(`Could not ${action}: ${error.message}`)
  return data ?? []
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
