import { describe, expect, it } from 'vitest'
import type { AgentPage } from '../agent-page'
import { handleMcpRequest, handleStorefrontMcpRequest } from '../mcp-server'

const configuredPage = {
  id: 'configured',
  name: 'Configured Detailer',
  slug: 'configured-detailer',
  is_published: true,
  services: [{
    name: 'Mobile Detail',
    description: 'A mobile vehicle detail.',
    price: '$150',
    url: '',
    customerInputs: [{
      key: 'vehicle_class',
      label: 'Vehicle class',
      valueType: 'single-select',
      required: true,
      options: [
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV' },
      ],
      askBuyer: 'What kind of vehicle is this?',
      affects: ['eligibility'],
    }],
    attributes: [{
      key: 'water_required',
      label: 'Customer water required',
      valueType: 'boolean',
      value: true,
    }],
  }],
  products: [],
  faqs: [],
} as unknown as AgentPage

const base = 'https://nexez.app'

describe('MCP configured offer disclosure', () => {
  it('returns sanitized configuration requirements with a listing book_offer result', () => {
    const result = handleMcpRequest(configuredPage, base, {
      id: 1,
      method: 'tools/call',
      params: { name: 'book_offer', arguments: { offer: 'services-0' } },
    })

    const content = (result.result as any).content
    expect(content[0].text).toContain('/checkout/configured-detailer')
    expect(content[1].text).toContain('Offer configuration contract:')
    expect(content[1].text).toContain('vehicle_class')
    expect(content[1].text).toContain('water_required')
  })

  it('returns the same configuration contract through storefront book_offer', () => {
    const result = handleStorefrontMcpRequest('detail-store', [configuredPage], base, {
      id: 2,
      method: 'tools/call',
      params: {
        name: 'book_offer',
        arguments: { slug: 'configured-detailer', offer: 'services-0' },
      },
    })

    const content = (result.result as any).content
    expect(content[0].text).toContain('(Configured Detailer)')
    expect(content[1].text).toContain('vehicle_class')
  })

  it('keeps unconfigured MCP book_offer responses to the legacy single text item', () => {
    const legacy = {
      ...configuredPage,
      services: [{ name: 'Simple Detail', description: '', price: '$75', url: '' }],
    } as AgentPage

    const result = handleMcpRequest(legacy, base, {
      id: 3,
      method: 'tools/call',
      params: { name: 'book_offer', arguments: { offer: 'services-0' } },
    })

    expect((result.result as any).content).toHaveLength(1)
  })
})
