import { describe, expect, it } from 'vitest'
import {
  CONNECTOR_MANIFEST,
  CONNECTOR_PROVIDERS,
  connectorCapabilities,
  isConnectorProvider,
} from './integration-capabilities'

describe('connector capability manifest', () => {
  it('has one complete, self-identifying entry for every provider', () => {
    expect(Object.keys(CONNECTOR_MANIFEST).sort()).toEqual([...CONNECTOR_PROVIDERS].sort())
    for (const provider of CONNECTOR_PROVIDERS) {
      const entry = CONNECTOR_MANIFEST[provider]
      expect(entry.provider).toBe(provider)
      expect(entry.label).not.toBe('')
      expect(entry.capabilities.length).toBeGreaterThan(0)
      expect(new Set(entry.capabilities).size).toBe(entry.capabilities.length)
    }
  })

  it('declares the merchant connector contracts requested in this pass', () => {
    expect(connectorCapabilities('square')).toEqual(['catalog', 'booking_profiles', 'bookings'])
    expect(connectorCapabilities('woocommerce')).toEqual(expect.arrayContaining(['catalog', 'inventory', 'orders']))
    expect(connectorCapabilities('servicem8')).toEqual(['job_templates', 'jobs'])
    expect(connectorCapabilities('google_calendar')).toEqual(['availability'])
  })

  it('rejects unknown providers instead of creating phantom status rows', () => {
    expect(isConnectorProvider('square')).toBe(true)
    expect(isConnectorProvider('vagaro')).toBe(false)
    expect(isConnectorProvider('__proto__')).toBe(false)
  })
})
