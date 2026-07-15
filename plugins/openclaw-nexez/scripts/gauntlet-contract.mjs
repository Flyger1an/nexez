import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import plugin from '../dist/index.js'

const EXPECTED_TOOLS = [
  'nexez_search',
  'nexez_get_page',
  'nexez_directory',
  'nexez_validate_checkout',
  'nexez_validate_negotiation',
  'nexez_start_checkout',
  'nexez_submit_negotiation',
]

const OPTIONAL_TOOLS = new Set([
  'nexez_validate_checkout',
  'nexez_validate_negotiation',
  'nexez_start_checkout',
  'nexez_submit_negotiation',
])

const observed = []
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const body = await readJsonBody(request)
    observed.push({
      method: request.method,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      userAgent: request.headers['user-agent'],
      body,
    })

    if (url.pathname === '/api/agent-search') {
      return json(response, 200, {
        schema_version: 'nexez.agent-search.v1',
        result_count: 1,
        received: Object.fromEntries(url.searchParams),
      })
    }

    if (url.pathname === '/api/directory') {
      return json(response, 200, {
        schema_version: 'nexez.directory.v1',
        result_count: 0,
        received: Object.fromEntries(url.searchParams),
      })
    }

    if (url.pathname.endsWith('/agent.json')) {
      return json(response, 200, { schema_version: 'nexez.agent-page.v1', path: url.pathname })
    }

    if (url.pathname === '/api/checkout') {
      if (body.offer === 'http-reject') {
        return json(response, 422, { error: 'Checkout fixture rejected.' })
      }
      return json(response, 200, { ok: true, kind: 'checkout', received: body })
    }

    if (url.pathname === '/api/negotiations') {
      if (body.offer === 'fixed') {
        return json(response, 200, {
          ok: true,
          dryRun: true,
          rulesEvaluation: { decision: 'review', reasons: ['offer_not_negotiable'] },
        })
      }
      if (body.offer === 'http-reject') {
        return json(response, 409, { error: 'Negotiation fixture rejected.' })
      }
      return json(response, 200, {
        ok: true,
        kind: 'negotiation',
        dryRun: body.dryRun,
        received: body,
        rulesEvaluation: { decision: 'review', reasons: ['within_rules'] },
      })
    }

    return json(response, 404, { error: 'Unknown gauntlet route.' })
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})

const address = server.address()
assert.ok(address && typeof address === 'object')
const baseUrl = `http://127.0.0.1:${address.port}`
const registered = new Map()

plugin.register({
  pluginConfig: {
    baseUrl,
    userAgent: 'Nexez OpenClaw Contract Gauntlet/1.0',
  },
  registerTool(tool, options) {
    registered.set(tool.name, { tool, options: options || {} })
  },
})

let passed = 0

try {
  await check('registers the exact seven-tool contract', async () => {
    assert.deepEqual([...registered.keys()], EXPECTED_TOOLS)
    for (const name of EXPECTED_TOOLS) {
      assert.equal(Boolean(registered.get(name)?.options.optional), OPTIONAL_TOOLS.has(name))
    }
  })

  await check('search clamps limits and preserves location context', async () => {
    const result = await invoke('nexez_search', {
      query: 'strategy',
      location: 'Austin, Texas',
      limit: 999,
      lat: 30.2672,
      lng: -97.7431,
    })
    assert.equal(result.received.limit, '50')
    assert.equal(result.received.location, 'Austin, Texas')
    assert.equal(result.received.lat, '30.2672')
  })

  await check('directory clamps readiness and sends supported filters', async () => {
    const result = await invoke('nexez_directory', {
      query: 'consulting',
      category: 'professional',
      minReadiness: 140,
    })
    assert.equal(result.received.category, 'professional')
    assert.equal(result.received.min_readiness, '100')
  })

  await check('agent-page slugs cannot escape their URL segment', async () => {
    const result = await invoke('nexez_get_page', { slug: 'gauntlet page/../../private' })
    assert.match(result.path, /gauntlet%20page%2F..%2F..%2Fprivate\/agent\.json$/)
  })

  await check('checkout validation always forces a dry run', async () => {
    const result = await invoke('nexez_validate_checkout', {
      slug: 'fixture',
      offer: 'services-0',
      dryRun: false,
    })
    assert.equal(result.received.dryRun, true)
    assert.equal(result.received.buyerAgent, 'openclaw')
    assert.equal(lastRequest().userAgent, 'Nexez OpenClaw Contract Gauntlet/1.0')
  })

  await check('HTTP validation failures become structured branch results', async () => {
    const result = await invoke('nexez_validate_checkout', {
      slug: 'fixture',
      offer: 'http-reject',
    })
    assert.deepEqual(result, {
      ok: false,
      status: 422,
      reason: 'Checkout fixture rejected.',
    })
  })

  await check('non-negotiable validation explicitly redirects agents to checkout', async () => {
    const result = await invoke('nexez_validate_negotiation', {
      slug: 'fixture',
      offer: 'fixed',
      budget: '$500',
    })
    assert.equal(result.ok, false)
    assert.match(result.reason, /does not accept negotiation/i)
    assert.deepEqual(result.rulesEvaluation.reasons, ['offer_not_negotiable'])
  })

  await check('negotiation validation always forces a dry run', async () => {
    const result = await invoke('nexez_validate_negotiation', {
      slug: 'fixture',
      offer: 'negotiable',
      budget: '$500',
      dryRun: false,
    })
    assert.equal(result.received.dryRun, true)
    assert.equal(result.received.buyerAgent, 'openclaw')
  })

  await check('checkout action rejects every non-boolean approval bypass before fetch', async () => {
    await assertApprovalGate('nexez_start_checkout', {
      slug: 'fixture',
      offer: 'services-0',
    })
  })

  await check('negotiation action rejects every non-boolean approval bypass before fetch', async () => {
    await assertApprovalGate('nexez_submit_negotiation', {
      slug: 'fixture',
      offer: 'services-0',
      budget: '$500',
    })
  })

  await check('approved checkout posts a mutation without forwarding the approval flag', async () => {
    const result = await invoke('nexez_start_checkout', {
      slug: 'fixture',
      offer: 'services-0',
      dryRun: true,
      userApproved: true,
    })
    assert.equal(result.received.dryRun, false)
    assert.equal(result.received.userApproved, undefined)
    assert.equal(result.received.buyerAgent, 'openclaw')
  })

  await check('approved negotiation posts a mutation without forwarding the approval flag', async () => {
    const result = await invoke('nexez_submit_negotiation', {
      slug: 'fixture',
      offer: 'negotiable',
      budget: '$500',
      dryRun: true,
      userApproved: true,
    })
    assert.equal(result.received.dryRun, false)
    assert.equal(result.received.userApproved, undefined)
    assert.equal(result.received.buyerAgent, 'openclaw')
  })

  await check('action HTTP failures remain hard tool errors', async () => {
    await assert.rejects(
      invoke('nexez_start_checkout', {
        slug: 'fixture',
        offer: 'http-reject',
        userApproved: true,
      }),
      (error) => error?.name === 'NexezApiError' && error.status === 422,
    )
  })

  console.log(`\nOpenClaw contract gauntlet passed: ${passed} checks, 7 tools, 0 production mutations.`)
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

async function check(label, run) {
  await run()
  passed += 1
  console.log(`PASS ${label}`)
}

async function invoke(name, params, signal) {
  const registeredTool = registered.get(name)
  assert.ok(registeredTool, `Tool ${name} was not registered.`)
  const result = await registeredTool.tool.execute(`gauntlet-${name}`, params, signal)
  assert.ok(result && typeof result === 'object')
  return result.details
}

async function assertApprovalGate(name, baseParams) {
  const values = [undefined, false, 'true', 1, null, {}]
  const before = observed.length
  for (const value of values) {
    const params = { ...baseParams }
    if (value !== undefined) params.userApproved = value
    await assert.rejects(
      invoke(name, params),
      (error) =>
        error?.name === 'ToolAuthorizationError' &&
        error.status === 403 &&
        /userApproved: true/.test(error.message),
    )
  }
  assert.equal(observed.length, before, `${name} reached the network without strict approval.`)
}

function lastRequest() {
  assert.ok(observed.length > 0)
  return observed[observed.length - 1]
}

async function readJsonBody(request) {
  if (request.method !== 'POST') return {}
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
