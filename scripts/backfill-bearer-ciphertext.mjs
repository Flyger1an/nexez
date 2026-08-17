#!/usr/bin/env node

// Backfill AES-256-GCM ciphertext for the two buyer bearer tokens.
//
// Rows created before the encryption columns existed hold only plaintext. Their
// blind index was backfilled in SQL by migration 20260817130715, so LOOKUPS already
// work; what is missing is the recovery copy that lets the receipt email,
// find-my-orders and the owner resume form rebuild a link once the plaintext column
// is dropped.
//
// This must run somewhere INTEGRATION_SECRET_KEY is set (the deployment env), which
// is why it is a script rather than a migration: the key is deliberately never in
// the database.
//
// Idempotent: it only touches rows whose ciphertext is null, so re-running is safe
// and a partial run can simply be repeated.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INTEGRATION_SECRET_KEY=... \
//     node scripts/backfill-bearer-ciphertext.mjs [--dry-run]

import crypto from 'node:crypto'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const DRY_RUN = process.argv.includes('--dry-run')
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH = 200

const TABLES = [
  { table: 'checkout_orders', plain: 'access_token', cipher: 'access_token_encrypted' },
  { table: 'agent_negotiations', plain: 'status_token', cipher: 'status_token_encrypted' },
]

function loadKey() {
  const raw = process.env.INTEGRATION_SECRET_KEY
  if (!raw) return null
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}

// Byte-identical to lib/server/secret-crypto.ts encryptSecret. Duplicated rather
// than imported because that module is `server-only` and cannot load in a plain
// node script; if the payload format there ever changes, change it here too.
function encryptSecret(plaintext, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64')}.${enc.toString('base64')}.${tag.toString('base64')}`
}

async function rest(path, init = {}) {
  const response = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response.status === 204 ? null : response.json()
}

const key = loadKey()
if (!key) {
  console.error('INTEGRATION_SECRET_KEY is missing or not a 32-byte key. Refusing to run:')
  console.error('without it every row would be written as null, which looks like success.')
  process.exit(1)
}
if (!URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

let totalScanned = 0
let totalWritten = 0

for (const { table, plain, cipher } of TABLES) {
  const rows = await rest(
    `${table}?select=id,${plain}&${cipher}=is.null&${plain}=not.is.null&limit=${BATCH}`,
  )
  totalScanned += rows.length
  console.log(`${table}: ${rows.length} row(s) need ciphertext`)

  for (const row of rows) {
    const value = (row[plain] || '').trim()
    if (!value) continue
    if (DRY_RUN) {
      totalWritten += 1
      continue
    }
    await rest(`${table}?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ [cipher]: encryptSecret(value, key) }),
    })
    totalWritten += 1
  }
}

console.log('')
console.log(`${DRY_RUN ? 'Would write' : 'Wrote'} ${totalWritten} of ${totalScanned} scanned row(s).`)
console.log('Re-run until both tables report 0; only then is dropping the plaintext columns safe.')
