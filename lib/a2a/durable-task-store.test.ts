import { describe, expect, it } from 'vitest'
import { taskFromRow, type A2ATaskRow } from './durable-task-store'

const row: A2ATaskRow = {
  id: '11111111-1111-4111-8111-111111111111',
  owner_id: '22222222-2222-4222-8222-222222222222',
  api_key_id: null,
  context_id: '33333333-3333-4333-8333-333333333333',
  nexie_thread_id: null,
  state: 'completed',
  status_message: null,
  artifacts: [],
  history: [
    { kind: 'message', role: 'user', messageId: 'one', parts: [{ kind: 'text', text: 'one' }] },
    { kind: 'message', role: 'agent', messageId: 'two', parts: [{ kind: 'text', text: 'two' }] },
  ],
  metadata: {},
  safe_error_code: null,
  safe_error_message: null,
  execution_token: null,
  execution_attempts: 1,
  claimed_at: null,
  lease_expires_at: null,
  completed_at: '2026-08-31T00:00:00.000Z',
  created_at: '2026-08-31T00:00:00.000Z',
  updated_at: '2026-08-31T00:00:00.000Z',
  last_event_sequence: 3,
}

describe('taskFromRow history projection', () => {
  it('omits history by default and returns none for historyLength zero', () => {
    expect(taskFromRow(row).history).toBeUndefined()
    expect(taskFromRow(row, 0).history).toEqual([])
  })

  it('returns only the requested tail of task history', () => {
    expect(taskFromRow(row, 1).history?.map((message) => message.messageId)).toEqual(['two'])
  })
})
