import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BUYER_DATA_CONTRACT,
  BUYER_USER_ID_TABLES,
  DIRECT_BUYER_IDENTITY_COLUMNS,
  buyerAnonymizationPatch,
} from './privacy-contract'

function directBuyerTablesInMigrations(): Set<string> {
  const directory = join(process.cwd(), 'supabase/migrations')
  const tables = new Set<string>()
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql'))) {
    const sql = readFileSync(join(directory, file), 'utf8')
    for (const match of sql.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi)) {
      if (DIRECT_BUYER_IDENTITY_COLUMNS.some((column) => new RegExp(`\\b${column}\\b`, 'i').test(match[2]))) {
        tables.add(match[1])
      }
    }
    for (const match of sql.matchAll(/alter table public\.([a-z0-9_]+)([\s\S]*?);/gi)) {
      if (DIRECT_BUYER_IDENTITY_COLUMNS.some((column) => new RegExp(`\\b${column}\\b`, 'i').test(match[2]))) {
        tables.add(match[1])
      }
    }
  }
  return tables
}

describe('buyer data privacy contract', () => {
  it('declares every direct buyer identity table introduced by the schema', () => {
    const declared = new Set([
      ...BUYER_DATA_CONTRACT.map((entry) => entry.table),
      ...BUYER_USER_ID_TABLES,
    ])
    expect([...directBuyerTablesInMigrations()].sort()).toEqual(
      [...directBuyerTablesInMigrations()].filter((table) => declared.has(table)).sort(),
    )
    expect([...directBuyerTablesInMigrations()].sort()).toEqual([
      'agent_negotiations',
      'checkout_orders',
      'order_requests',
      'service_agreements',
      'staged_settlement_agreements',
      'user_push_tokens',
    ])
  })

  it('declares lookup, export, and anonymization policy for every dataset', () => {
    for (const entry of BUYER_DATA_CONTRACT) {
      expect(entry.dataset).toMatch(/_as_buyer$/)
      expect(entry.exportProjection.length).toBeGreaterThan(0)
      expect(entry.referenceColumn || entry.emailColumns.length).toBeTruthy()
      expect(entry.anonymizeColumns.length > 0 || entry.jsonColumn).toBeTruthy()
      expect(entry.exportProjection).not.toMatch(/(?:access|status)_token_(?:sha256|encrypted)/)
    }
  })

  it('removes only checkout-session identity keys and preserves unrelated JSON', () => {
    const contract = BUYER_DATA_CONTRACT.find((entry) => entry.table === 'checkout_sessions')!
    expect(buyerAnonymizationPatch(contract, {
      buyer: {
        email: 'buyer@example.com',
        name: 'Buyer',
        reference: 'user-1',
        agent: 'nexxi',
        locale: 'en-US',
      },
    })).toEqual({ buyer: { locale: 'en-US' } })
  })

  it('scrubs buyer-entered agreement configuration while preserving business terms', () => {
    const recurring = BUYER_DATA_CONTRACT.find((entry) => entry.table === 'service_agreements')!
    expect(buyerAnonymizationPatch(recurring, {
      contract_snapshot: {
        schemaVersion: 1,
        terms: { paymentModel: 'fixed-per-period' },
        configuration: { address: '1 Private Way', seats: 4 },
        resolvedSchedule: { interval: 'month', inputKey: 'cadence', inputValue: 'monthly' },
        pricing: {
          finalAmount: 5000,
          adjustments: [{ fieldKey: 'seats', value: 4, amount: 1000 }],
        },
      },
    })).toEqual({
      buyer_email: null,
      buyer_name: null,
      buyer_reference: null,
      buyer_agent: null,
      contract_snapshot: {
        schemaVersion: 1,
        terms: { paymentModel: 'fixed-per-period' },
        configuration: {},
        resolvedSchedule: { interval: 'month', inputKey: 'cadence' },
        pricing: {
          finalAmount: 5000,
          adjustments: [{ fieldKey: 'seats', amount: 1000 }],
        },
      },
    })

    const staged = BUYER_DATA_CONTRACT.find((entry) => entry.table === 'staged_settlement_agreements')!
    expect(buyerAnonymizationPatch(staged, {
      contract_snapshot: {
        schemaVersion: 1,
        settlement: { totalAmount: 5000 },
        offerConfiguration: { address: '1 Private Way' },
      },
    }).contract_snapshot).toEqual({
      schemaVersion: 1,
      settlement: { totalAmount: 5000 },
      offerConfiguration: {},
    })
  })
})
