#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
/**
 * Opt-in load test for POST /api/negotiations (Burst 3b).
 *
 * Fires N proposals at a bounded concurrency against a TARGET (default nexez.app),
 * measuring approval-bound action latency (p50/p95/max) and the 429 rate, then polls a sample of
 * statusUrls to confirm the async decisions land. Because the LLM decision is now
 * async, POST latency should stay low and flat regardless of provider latency.
 *
 * ⚠️ NOT part of CI. It hits the REAL LLM (costs tokens) and creates real
 * negotiations on the target page — use a THROWAWAY published page and clean up
 * afterwards (delete its agent_negotiations + negotiation_messages + the page).
 *
 * Usage:
 *   node scripts/loadtest-negotiations.mjs --url https://nexez.app --slug <throwaway> \
 *       --offer services-0 --n 50 --concurrency 10 --budget '$900' [--poll 8]
 */

function parseArgs(argv) {
  const args = { url: 'https://nexez.app', offer: 'services-0', n: 50, concurrency: 10, budget: '$900', poll: 8 }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') return { help: true }
    const m = a.match(/^--([a-zA-Z]+)$/)
    if (m) {
      const key = m[1]
      const val = argv[++i]
      args[key] = ['n', 'concurrency', 'poll'].includes(key) ? Number(val) : val
    }
  }
  return args
}

function pct(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = next++
        if (i >= items.length) break
        results[i] = await worker(items[i], i)
      }
    }),
  )
  return results
}

async function postProposal(args, i) {
  const started = Date.now()
  try {
    const url = `${args.url}/api/negotiations`
    const payload = {
      slug: args.slug,
      offer: args.offer,
      buyerAgent: `loadtest-${i}`,
      query: `load test proposal ${i}`,
      budget: args.budget,
    }
    const validation = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ...payload, dryRun: true }),
    })
    const validationBody = await readJson(validation)
    if (!validation.ok) {
      return { ok: false, status: validation.status, ms: Date.now() - started, error: validationBody.error }
    }
    if (validationBody.approvalTokenRequired === true && !validationBody.approvalToken) {
      return { ok: false, status: 502, ms: Date.now() - started, error: 'Approval token was required but not issued.' }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'idempotency-key': `loadtest:${args.runId}:${i}`,
      },
      body: JSON.stringify({
        ...payload,
        dryRun: false,
        ...(validationBody.approvalToken ? { approvalToken: validationBody.approvalToken } : {}),
      }),
    })
    const ms = Date.now() - started
    const body = await readJson(res)
    return { ok: res.ok, status: res.status, ms, id: body.negotiationId, token: body.statusToken }
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, error: String(err?.message || err) }
  }
}

async function readJson(response) {
  try { return await response.json() } catch { return {} }
}

async function pollDecision(args, r) {
  if (!r.id || !r.token) return null
  const url = `${args.url}/api/negotiations/status?id=${r.id}&token=${r.token}`
  const deadline = Date.now() + args.poll * 1000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        if (d.decisionPending === false) return { landedMs: Date.now(), action: d.decision?.action, status: d.status }
      }
    } catch {}
    await new Promise((res) => setTimeout(res, 1000))
  }
  return { timedOut: true }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.slug) {
    console.log('Usage: node scripts/loadtest-negotiations.mjs --url https://nexez.app --slug <throwaway> [--offer services-0] [--n 50] [--concurrency 10] [--budget "$900"] [--poll 8]')
    console.log('⚠️  Hits the real LLM (costs tokens) + creates negotiations. Use a throwaway page and clean up after.')
    process.exit(args.help ? 0 : 1)
  }

  args.runId = randomUUID()

  console.log(`Load test → ${args.url} slug=${args.slug} offer=${args.offer} n=${args.n} concurrency=${args.concurrency}`)
  const t0 = Date.now()
  const results = await runPool(Array.from({ length: args.n }, (_, i) => i), args.concurrency, (i) => postProposal(args, i))
  const wallMs = Date.now() - t0

  const ok = results.filter((r) => r.ok)
  const rate429 = results.filter((r) => r.status === 429).length
  const errors = results.filter((r) => !r.ok && r.status !== 429).length
  const latencies = ok.map((r) => r.ms).sort((a, b) => a - b)

  console.log('\n=== POST results ===')
  console.log(`total=${results.length}  ok=${ok.length}  429=${rate429}  errors=${errors}  wall=${wallMs}ms  throughput=${(results.length / (wallMs / 1000)).toFixed(1)}/s`)
  console.log(`Approval + POST latency ms: p50=${pct(latencies, 50)}  p95=${pct(latencies, 95)}  max=${latencies.at(-1) ?? 0}`)

  // Poll a sample of the successful negotiations to confirm async decisions land.
  const sample = ok.filter((r) => r.id && r.token).slice(0, 5)
  if (sample.length) {
    console.log(`\n=== decision landing (sample of ${sample.length}) ===`)
    const decisions = await runPool(sample, sample.length, (r) => pollDecision(args, r))
    for (let i = 0; i < sample.length; i++) {
      const d = decisions[i]
      console.log(`  ${sample[i].id?.slice(0, 8)}… → ${d?.timedOut ? 'still pending (timeout)' : `${d?.status} / ${d?.action}`}`)
    }
  }

  const ids = ok.map((r) => r.id).filter(Boolean)
  console.log(`\n⚠️  Created ${ids.length} negotiations — clean them up (delete negotiation_messages + agent_negotiations for slug=${args.slug}, then the page).`)
}

main()
