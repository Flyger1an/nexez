import { describe, expect, it } from 'vitest'
import { parseAgentCsv, sampleAgentCsv } from '../csv-import'

describe('parseAgentCsv', () => {
  it('parses the bundled sample into page + offers', () => {
    const out = parseAgentCsv(sampleAgentCsv)
    expect(out.rowCount).toBeGreaterThan(0)
    expect(out.services.length + out.products.length).toBeGreaterThan(0)
  })
  it('classifies services, products, and faqs by type', () => {
    const csv = [
      'type,name,price,description,question,answer,business_name',
      'service,Consult,$100,Initial consult,,,Acme',
      'product,Widget,$20,A widget,,,Acme',
      'faq,,,,Do you ship?,Yes worldwide,Acme',
    ].join('\n')
    const out = parseAgentCsv(csv)
    expect(out.services.some((l) => l.includes('Consult'))).toBe(true)
    expect(out.products.some((l) => l.includes('Widget'))).toBe(true)
    expect(out.faqs.some((l) => l.toLowerCase().includes('ship'))).toBe(true)
    expect(out.page.name).toBe('Acme')
  })
  it('handles empty input safely', () => {
    const out = parseAgentCsv('')
    expect(out.services).toEqual([])
    expect(out.products).toEqual([])
  })
})
