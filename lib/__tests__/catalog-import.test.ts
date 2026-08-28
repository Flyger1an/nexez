import { describe, expect, it } from 'vitest'
import {
  buildImportedCatalog,
  CATALOG_IMPORT_LIMITS,
  getCatalogImportTable,
  parseCatalogImportJson,
  parseCatalogImportText,
  suggestCatalogMapping,
  validateImportRows,
} from '../catalog-import'

describe('catalog import parsing', () => {
  it('parses quoted CSV cells, escaped quotes, embedded commas, multiline values, and CRLF rows', () => {
    const sheet = parseCatalogImportText([
      'type,name,price,description,url',
      'service,"Strategy, planning",$450,"Line one',
      'Line two with ""proof""",https://example.com/book',
      'product,Widget,$20,"Small, durable widget",https://example.com/widget',
    ].join('\r\n'), 'csv')
    const imported = buildImportedCatalog(sheet, true, suggestCatalogMapping(sheet, true))

    expect(imported.rowCount).toBe(2)
    expect(imported.services[0]).toContain('Strategy, planning')
    expect(imported.services[0]).toContain('Line one\r\nLine two with "proof"')
    expect(imported.products[0]).toContain('Small, durable widget')
  })

  it('rejects an unclosed quoted cell instead of silently corrupting rows', () => {
    expect(() => parseCatalogImportText('name,description\nOffer,"unfinished', 'csv')).toThrow(/unclosed quoted cell/i)
  })

  it('parses TSV and auto-detects semicolon-delimited TXT', () => {
    const tsv = parseCatalogImportText('type\tname\tprice\nservice\tAudit\t$90', 'tsv')
    const txt = parseCatalogImportText('type;name;price\nproduct;Kit;$50', 'txt')

    expect(buildImportedCatalog(tsv, true, suggestCatalogMapping(tsv, true)).services[0]).toContain('Audit')
    expect(txt.suggestedHeader).toBe(true)
    expect(buildImportedCatalog(txt, true, suggestCatalogMapping(txt, true)).products[0]).toContain('Kit')
  })

  it('treats plain one-line-per-offer TXT as headerless service names', () => {
    const sheet = parseCatalogImportText('Consultation\nImplementation\nSupport', 'txt')
    const mapping = suggestCatalogMapping(sheet, false)
    const imported = buildImportedCatalog(sheet, false, mapping)

    expect(sheet.suggestedHeader).toBe(false)
    expect(getCatalogImportTable(sheet, false).headers).toEqual(['Column 1'])
    expect(imported.services).toHaveLength(3)
    expect(imported.services[1]).toContain('Implementation')
  })

  it('imports arrays of JSON objects with camelCase headers', () => {
    const sheet = parseCatalogImportJson(JSON.stringify([
      { type: 'service', name: 'Advisory', price: '$200', checkoutUrl: 'https://example.com/pay' },
      { type: 'faq', question: 'Remote?', answer: 'Yes' },
    ]))
    const imported = buildImportedCatalog(sheet, true, suggestCatalogMapping(sheet, true))

    expect(imported.services[0]).toContain('https://example.com/pay')
    expect(imported.faqs).toEqual(['Remote? | Yes'])
  })

  it('imports structured catalog JSON with page, services, products, and FAQs', () => {
    const sheet = parseCatalogImportJson(JSON.stringify({
      page: {
        name: 'Acme Studio',
        description: 'Agent-ready commerce services.',
        websiteUrl: 'https://example.com',
        contactEmail: 'hello@example.com',
      },
      services: [{ name: 'Consultation', price: '$100', bookingUrl: 'https://example.com/book' }],
      products: ['Playbook'],
      faqs: [{ question: 'Available worldwide?', answer: 'Yes' }],
    }))
    const imported = buildImportedCatalog(sheet, true, suggestCatalogMapping(sheet, true))

    expect(imported.page).toMatchObject({
      name: 'Acme Studio',
      slug: 'acme-studio',
      description: 'Agent-ready commerce services.',
      websiteUrl: 'https://example.com',
      contactEmail: 'hello@example.com',
    })
    expect(imported.services).toHaveLength(1)
    expect(imported.products[0]).toContain('Playbook')
    expect(imported.faqs).toEqual(['Available worldwide? | Yes'])
  })

  it('rejects invalid JSON with an actionable error', () => {
    expect(() => parseCatalogImportJson('{bad json')).toThrow(/not valid/i)
  })

  it('maps aliases once and supports explicit remapping', () => {
    const sheet = parseCatalogImportText('kind,title,amount,details,booking_url,company\nservice,Audit,$80,Fast,https://example.com,Acme', 'csv')
    const mapping = suggestCatalogMapping(sheet, true)

    expect(mapping).toEqual({
      0: 'type',
      1: 'name',
      2: 'price',
      3: 'description',
      4: 'url',
      5: 'business_name',
    })
  })

  it('deduplicates repeated catalog items', () => {
    const sheet = parseCatalogImportText('type,name\nservice,Audit\nservice,Audit', 'csv')
    const imported = buildImportedCatalog(sheet, true, suggestCatalogMapping(sheet, true))

    expect(imported.services).toHaveLength(1)
  })

  it('preserves business-only rows without manufacturing an offer', () => {
    const sheet = parseCatalogImportText('business_name,website_url\nAcme,https://acme.example', 'csv')
    const imported = buildImportedCatalog(sheet, true, suggestCatalogMapping(sheet, true))

    expect(imported.page).toMatchObject({ name: 'Acme', slug: 'acme', websiteUrl: 'https://acme.example' })
    expect(imported.services).toEqual([])
    expect(imported.products).toEqual([])
    expect(imported.skippedRowCount).toBe(0)
  })

  it('enforces row, column, and cell safety limits', () => {
    expect(() => validateImportRows([
      Array.from({ length: CATALOG_IMPORT_LIMITS.maxColumns + 1 }, () => 'value'),
    ])).toThrow(/column import limit/i)

    expect(() => validateImportRows([
      ['x'.repeat(CATALOG_IMPORT_LIMITS.maxCellCharacters + 1)],
    ])).toThrow(/character import limit/i)

    expect(() => validateImportRows(
      Array.from({ length: CATALOG_IMPORT_LIMITS.maxRows + 2 }, () => ['row']),
    )).toThrow(/row import limit/i)
  })
})
