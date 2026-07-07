import { describe, it, expect } from 'vitest'
import { sendPushToTokens } from '../push'

// Pure behavior: a malformed/non-Expo token must never reach the network. (No fetch
// is mocked here - if the filter let one through, this would attempt a real request.)
describe('sendPushToTokens token filtering', () => {
  it('sends nothing for an empty list', async () => {
    expect(await sendPushToTokens([], { title: 't', body: 'b' })).toEqual({ sent: 0 })
  })

  it('skips invalid (non-Expo) tokens without sending', async () => {
    expect(await sendPushToTokens(['nope', 'fcm:abc', '', 'ExpoPushToken'], { title: 't', body: 'b' })).toEqual({
      sent: 0,
    })
  })
})
