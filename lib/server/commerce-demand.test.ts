import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock, type QueryContext } from '../../test/supabase-mock'
import type { CommerceDemandSignalRow } from '../commerce-demand'

const refs = vi.hoisted(() => ({
  hasAdmin: true,
  operations: [] as QueryContext[],
  rows: [] as CommerceDemandSignalRow[],
}))

vi.mock('../../utils/supabase/admin', () => ({
  hasSupabaseAdminEnv: () => refs.hasAdmin,
  createAdminClient: () => createSupabaseMock((context) => {
    refs.operations.push(context)
    if (context.table === 'commerce_demand_signals' && context.op === 'select') {
      return { data: refs.rows, error: null }
    }
    return { data: null, error: null }
  }),
}))
vi.mock('../observability', () => ({ captureError: vi.fn() }))
vi.mock('next/server', () => ({ after: (callback: () => unknown) => callback() }))

import {
  getCommerceDemandSnapshot,
  persistCommerceDemandSignal,
  scheduleCommerceDemandSignal,
} from './commerce-demand'

describe('server Commerce demand signals', () => {
  beforeEach(() => {
    refs.hasAdmin = true
    refs.operations = []
    refs.rows = []
  })

  it('appends only the privacy-safe row through the service client', async () => {
    await persistCommerceDemandSignal({
      mode: 'simulation',
      intent: 'booking',
      reference: { id: 'events.private-chef', domain: 'events-hospitality' },
    })

    const insert = refs.operations.find((operation) => operation.op === 'insert')
    expect(insert?.table).toBe('commerce_demand_signals')
    expect(insert?.payload).toEqual({
      surface: 'homepage_simulator',
      mode: 'simulation',
      intent: 'booking',
      reference_id: 'events.private-chef',
      reference_domain: 'events-hospitality',
    })
  })

  it('schedules persistence after the response boundary', async () => {
    scheduleCommerceDemandSignal({
      mode: 'coverage_gap',
      intent: 'overview',
      reference: null,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refs.operations.some((operation) => operation.op === 'insert')).toBe(true)
  })

  it('returns an unavailable snapshot when the admin environment is absent', async () => {
    refs.hasAdmin = false
    await expect(getCommerceDemandSnapshot()).resolves.toMatchObject({
      available: false,
      totalSignals: 0,
      categories: [],
    })
    expect(refs.operations).toEqual([])
  })

  it('marks bounded snapshots as truncated instead of presenting partial totals as complete', async () => {
    refs.rows = Array.from({ length: 5_001 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      created_at: '2026-08-21T15:00:00.000Z',
      surface: 'homepage_simulator',
      mode: 'simulation',
      intent: 'booking',
      reference_id: 'events.private-chef',
      reference_domain: 'events-hospitality',
    }))

    await expect(getCommerceDemandSnapshot()).resolves.toMatchObject({
      available: true,
      truncated: true,
      totalSignals: 5_000,
    })
    const select = refs.operations.find((operation) => operation.op === 'select')
    expect(select?.calls).toContainEqual(['limit', 5_001])
  })
})
