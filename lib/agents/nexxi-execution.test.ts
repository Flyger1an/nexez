import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NexxiTurnResult } from './nexxi'

const { turnRef } = vi.hoisted(() => ({
  turnRef: { impl: null as any },
}))

vi.mock('./nexxi', () => ({
  handleNexxiTurn: vi.fn((input: any) => turnRef.impl(input)),
}))

import { chunkNexxiText, runNexxiExecution, type NexxiExecutionEvent } from './nexxi-stream'

const result: NexxiTurnResult = {
  threadId: 'thread-1',
  agentId: 'agent-1',
  message: 'Found one.',
  cards: [],
  suggestions: [],
  toolsUsed: ['search_pages'],
  memory: {},
  model: { configured: true, provider: 'test', name: 'test-model' },
}

beforeEach(() => {
  turnRef.impl = async () => result
})

describe('chunkNexxiText', () => {
  it('preserves whitespace while splitting a completed message', () => {
    expect(chunkNexxiText('Two words here')).toEqual(['Two ', 'words ', 'here'])
  })
})

describe('runNexxiExecution', () => {
  it('forwards live model deltas in order and emits one authoritative completion', async () => {
    turnRef.impl = async (input: any) => {
      input.onToken?.('Found ')
      input.onToken?.('one.')
      return result
    }
    const events: NexxiExecutionEvent[] = []

    const returned = await runNexxiExecution(
      { db: {} as any, userId: 'user-1', message: 'find one' },
      (event) => events.push(event),
    )

    expect(returned).toBe(result)
    expect(events).toEqual([
      { type: 'text-delta', delta: 'Found ', source: 'model' },
      { type: 'text-delta', delta: 'one.', source: 'model' },
      { type: 'completed', result },
    ])
  })

  it('replays deterministic and approval responses when no model delta was emitted', async () => {
    const events: NexxiExecutionEvent[] = []

    await runNexxiExecution(
      { db: {} as any, userId: 'user-1', message: 'find one' },
      (event) => events.push(event),
    )

    expect(events).toEqual([
      { type: 'text-delta', delta: 'Found ', source: 'replay' },
      { type: 'text-delta', delta: 'one.', source: 'replay' },
      { type: 'completed', result },
    ])
  })

  it('ignores empty provider deltas before deciding whether replay is needed', async () => {
    turnRef.impl = async (input: any) => {
      input.onToken?.('')
      return result
    }
    const events: NexxiExecutionEvent[] = []

    await runNexxiExecution(
      { db: {} as any, userId: 'user-1', message: 'find one' },
      (event) => events.push(event),
    )

    expect(events[0]).toEqual({ type: 'text-delta', delta: 'Found ', source: 'replay' })
    expect(events[events.length - 1]).toEqual({ type: 'completed', result })
  })
})
