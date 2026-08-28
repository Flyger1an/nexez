import { normalizeSlug } from './agent-page'

export const CATALOG_IMPORT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxRows: 5_000,
  maxColumns: 80,
  maxCellCharacters: 20_000,
  maxSheets: 20,
} as const

export type CatalogImportFormat = 'csv' | 'tsv' | 'txt' | 'json' | 'xls' | 'xlsx'

export type CatalogImportField =
  | 'type'
  | 'name'
  | 'price'
  | 'description'
  | 'url'
  | 'question'
  | 'answer'
  | 'business_name'
  | 'business_description'
  | 'website_url'
  | 'cta_url'
  | 'cta_label'
  | 'audience'
  | 'location'
  | 'contact_email'

export type CatalogColumnMapping = Record<number, CatalogImportField | ''>

export type CatalogImportSheet = {
  name: string
  rows: string[][]
  suggestedHeader: boolean
}

export type CatalogImportDocument = {
  fileName: string
  format: CatalogImportFormat
  sheets: CatalogImportSheet[]
  warnings: string[]
}

export type ImportedAgentCatalog = {
  page: {
    name?: string
    slug?: string
    description?: string
    websiteUrl?: string
    ctaUrl?: string
    ctaLabel?: string
    audience?: string
    location?: string
    contactEmail?: string
  }
  services: string[]
  products: string[]
  faqs: string[]
  rowCount: number
  skippedRowCount: number
}

export const CATALOG_IMPORT_FIELD_OPTIONS: ReadonlyArray<{
  value: CatalogImportField
  label: string
  group: 'Offer or FAQ' | 'Business'
}> = [
  { value: 'type', label: 'Type', group: 'Offer or FAQ' },
  { value: 'name', label: 'Name', group: 'Offer or FAQ' },
  { value: 'price', label: 'Price', group: 'Offer or FAQ' },
  { value: 'description', label: 'Description', group: 'Offer or FAQ' },
  { value: 'url', label: 'Booking or checkout URL', group: 'Offer or FAQ' },
  { value: 'question', label: 'FAQ question', group: 'Offer or FAQ' },
  { value: 'answer', label: 'FAQ answer', group: 'Offer or FAQ' },
  { value: 'business_name', label: 'Business name', group: 'Business' },
  { value: 'business_description', label: 'Business description', group: 'Business' },
  { value: 'website_url', label: 'Website URL', group: 'Business' },
  { value: 'cta_url', label: 'Primary action URL', group: 'Business' },
  { value: 'cta_label', label: 'Primary action label', group: 'Business' },
  { value: 'audience', label: 'Best-fit buyer', group: 'Business' },
  { value: 'location', label: 'Location or service area', group: 'Business' },
  { value: 'contact_email', label: 'Contact email', group: 'Business' },
]

const FIELD_ALIASES: Record<CatalogImportField, string[]> = {
  type: ['type', 'kind', 'category', 'offer_type', 'item_type'],
  name: ['name', 'title', 'offer', 'item', 'service_name', 'product_name'],
  price: ['price', 'amount', 'cost', 'rate'],
  description: ['description', 'summary', 'details', 'offer_description', 'item_description'],
  url: ['url', 'checkout_url', 'booking_url', 'link', 'action_url'],
  question: ['question', 'faq_question'],
  answer: ['answer', 'faq_answer'],
  business_name: ['business_name', 'business', 'company', 'company_name'],
  business_description: ['business_description', 'page_description', 'company_description'],
  website_url: ['website_url', 'website', 'site_url'],
  cta_url: ['cta_url', 'primary_url', 'primary_action_url'],
  cta_label: ['cta_label', 'primary_action', 'primary_action_label'],
  audience: ['audience', 'buyer', 'best_fit_buyer', 'ideal_customer'],
  location: ['location', 'service_area', 'region'],
  contact_email: ['contact_email', 'email', 'business_email'],
}

const ALIAS_TO_FIELD = new Map<string, CatalogImportField>(
  Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) => (
    aliases.map((alias) => [normalizeHeader(alias), field as CatalogImportField])
  )),
)

const sampleRows = [
  ['type', 'name', 'price', 'description', 'url', 'question', 'answer', 'audience', 'location'],
  [
    'service',
    'Strategy Session',
    '$450',
    '60-minute advisory session with buyer context and next-step plan',
    'https://example.com/book',
    '',
    '',
    'Founders evaluating growth strategy',
    'Remote',
  ],
  [
    'faq',
    '',
    '',
    '',
    '',
    'Can an AI agent book directly?',
    'Yes. Use the checkout URL attached to the selected offer.',
    '',
    '',
  ],
]

export const sampleAgentCsv = sampleRows.map((row) => row.map(escapeDelimitedValue).join(',')).join('\n')

export function parseAgentCsv(value: string): ImportedAgentCatalog {
  const sheet = parseCatalogImportText(value, 'csv', 'CSV import')
  return buildImportedCatalog(sheet, true, suggestCatalogMapping(sheet, true))
}

export function parseCatalogImportText(
  value: string,
  format: Extract<CatalogImportFormat, 'csv' | 'tsv' | 'txt'>,
  sheetName = 'Imported data',
): CatalogImportSheet {
  if (!value.trim()) return { name: sheetName, rows: [], suggestedHeader: format !== 'txt' }

  const delimiter = format === 'csv' ? ',' : format === 'tsv' ? '\t' : detectDelimiter(value)
  const rows = delimiter
    ? parseDelimitedRecords(value, delimiter)
    : value.split(/\r?\n/).map((line) => [line])

  const checkedRows = validateImportRows(rows)
  const recognizedHeader = checkedRows[0]?.some((cell) => ALIAS_TO_FIELD.has(normalizeHeader(cell))) ?? false

  return {
    name: sheetName,
    rows: checkedRows,
    suggestedHeader: format === 'csv' || format === 'tsv' || recognizedHeader,
  }
}

export function parseCatalogImportJson(value: string, sheetName = 'JSON data'): CatalogImportSheet {
  let parsed: unknown

  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('That JSON file is not valid. Correct its syntax and try again.')
  }

  const rows = jsonToRows(parsed)
  if (!rows.length) throw new Error('That JSON file does not contain any importable rows.')

  return {
    name: sheetName,
    rows: validateImportRows(rows),
    suggestedHeader: true,
  }
}

export function getCatalogImportTable(sheet: CatalogImportSheet, hasHeader: boolean) {
  const columnCount = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
  const headers = Array.from({ length: columnCount }, (_, index) => (
    hasHeader ? sheet.rows[0]?.[index]?.trim() || `Column ${index + 1}` : `Column ${index + 1}`
  ))

  return {
    headers,
    rows: (hasHeader ? sheet.rows.slice(1) : sheet.rows).filter((row) => row.some((cell) => cell.trim())),
  }
}

export function suggestCatalogMapping(sheet: CatalogImportSheet, hasHeader: boolean): CatalogColumnMapping {
  const { headers } = getCatalogImportTable(sheet, hasHeader)
  const mapping: CatalogColumnMapping = {}
  const assigned = new Set<CatalogImportField>()

  if (!hasHeader) {
    const positionalFields: CatalogImportField[] = headers.length === 1
      ? ['name']
      : ['name', 'price', 'description', 'url']

    positionalFields.slice(0, headers.length).forEach((field, index) => {
      mapping[index] = field
    })
    return mapping
  }

  headers.forEach((header, index) => {
    const field = ALIAS_TO_FIELD.get(normalizeHeader(header))
    if (field && !assigned.has(field)) {
      mapping[index] = field
      assigned.add(field)
    }
  })

  return mapping
}

export function buildImportedCatalog(
  sheet: CatalogImportSheet,
  hasHeader: boolean,
  mapping: CatalogColumnMapping,
): ImportedAgentCatalog {
  const { rows } = getCatalogImportTable(sheet, hasHeader)
  const imported: ImportedAgentCatalog = {
    page: {},
    services: [],
    products: [],
    faqs: [],
    rowCount: rows.length,
    skippedRowCount: 0,
  }

  for (const cells of rows) {
    const row = mappedRow(cells, mapping)
    const type = row.type.toLowerCase()
    const name = row.name
    const description = row.description
    const question = row.question
    const answer = row.answer

    imported.page.name ||= row.business_name
    imported.page.description ||= row.business_description
    imported.page.websiteUrl ||= row.website_url
    imported.page.ctaUrl ||= row.cta_url
    imported.page.ctaLabel ||= row.cta_label
    imported.page.audience ||= row.audience
    imported.page.location ||= row.location
    imported.page.contactEmail ||= row.contact_email

    if (imported.page.name && !imported.page.slug) {
      imported.page.slug = normalizeSlug(imported.page.name)
    }

    if (type.includes('faq') || question || answer) {
      if (question || answer) imported.faqs.push(`${question || 'Question'} | ${answer || 'Answer'}`)
      else imported.skippedRowCount += 1
      continue
    }

    if (!name && !description) {
      const hasBusinessData = Object.entries(row).some(([field, cell]) => (
        field.startsWith('business_') || ['website_url', 'cta_url', 'cta_label', 'audience', 'location', 'contact_email'].includes(field)
      ) && cell)
      if (!hasBusinessData) imported.skippedRowCount += 1
      continue
    }

    const offerLine = `${name || 'Untitled offer'} | ${row.price || 'Custom quote'} | ${description || 'Imported offer'} | ${row.url}`
    if (type.includes('product')) imported.products.push(offerLine)
    else imported.services.push(offerLine)
  }

  imported.services = Array.from(new Set(imported.services))
  imported.products = Array.from(new Set(imported.products))
  imported.faqs = Array.from(new Set(imported.faqs))

  return imported
}

export function validateImportRows(rows: unknown[][]): string[][] {
  const normalizedRows = rows
    .map((row) => row.map(toCellString))
    .filter((row) => row.some((cell) => cell.trim()))

  if (normalizedRows.length > CATALOG_IMPORT_LIMITS.maxRows + 1) {
    throw new Error(`This file exceeds the ${CATALOG_IMPORT_LIMITS.maxRows.toLocaleString()} row import limit. Split it into smaller files.`)
  }

  for (const row of normalizedRows) {
    if (row.length > CATALOG_IMPORT_LIMITS.maxColumns) {
      throw new Error(`This file exceeds the ${CATALOG_IMPORT_LIMITS.maxColumns} column import limit.`)
    }
    if (row.some((cell) => cell.length > CATALOG_IMPORT_LIMITS.maxCellCharacters)) {
      throw new Error(`A cell exceeds the ${CATALOG_IMPORT_LIMITS.maxCellCharacters.toLocaleString()} character import limit.`)
    }
  }

  return normalizedRows
}

function mappedRow(cells: string[], mapping: CatalogColumnMapping): Record<CatalogImportField, string> {
  const row = Object.fromEntries(CATALOG_IMPORT_FIELD_OPTIONS.map(({ value }) => [value, ''])) as Record<CatalogImportField, string>

  Object.entries(mapping).forEach(([index, field]) => {
    if (field) row[field] = cells[Number(index)]?.trim() ?? ''
  })

  return row
}

function parseDelimitedRecords(value: string, delimiter: string) {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const nextCharacter = value[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (character === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (character === delimiter && !inQuotes) {
      record.push(cell)
      cell = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') index += 1
      record.push(cell)
      records.push(record)
      record = []
      cell = ''
      continue
    }

    cell += character
  }

  if (inQuotes) throw new Error('This delimited file has an unclosed quoted cell.')

  if (cell || record.length) {
    record.push(cell)
    records.push(record)
  }

  return records
}

function detectDelimiter(value: string) {
  const candidates = [',', '\t', ';', '|']
  let best: { delimiter: string; score: number } | null = null

  for (const delimiter of candidates) {
    let records: string[][]
    try {
      records = parseDelimitedRecords(value, delimiter).slice(0, 20)
    } catch {
      continue
    }

    const columnCounts = records.filter((row) => row.some((cell) => cell.trim())).map((row) => row.length)
    const commonCount = mode(columnCounts)
    if (commonCount < 2) continue

    const consistentRows = columnCounts.filter((count) => count === commonCount).length
    const score = consistentRows * commonCount
    if (!best || score > best.score) best = { delimiter, score }
  }

  return best?.delimiter ?? null
}

function jsonToRows(value: unknown): unknown[][] {
  if (Array.isArray(value)) return arrayToRows(value)
  if (!isRecord(value)) return []

  if (Array.isArray(value.rows)) return arrayToRows(value.rows)

  const services = Array.isArray(value.services) ? value.services : []
  const products = Array.isArray(value.products) ? value.products : []
  const faqs = Array.isArray(value.faqs) ? value.faqs : []

  if (services.length || products.length || faqs.length) {
    const page = isRecord(value.page) ? value.page : isRecord(value.business) ? value.business : value
    const records = [
      ...services.map((item) => catalogJsonItem(item, 'service')),
      ...products.map((item) => catalogJsonItem(item, 'product')),
      ...faqs.map((item) => catalogJsonItem(item, 'faq')),
    ]
    if (!records.length) return []

    Object.assign(records[0], {
      business_name: firstJsonValue(page, 'business_name', 'businessName', 'name'),
      business_description: firstJsonValue(page, 'business_description', 'businessDescription', 'description'),
      website_url: firstJsonValue(page, 'website_url', 'websiteUrl', 'website'),
      cta_url: firstJsonValue(page, 'cta_url', 'ctaUrl'),
      cta_label: firstJsonValue(page, 'cta_label', 'ctaLabel'),
      audience: firstJsonValue(page, 'audience', 'best_fit_buyer', 'bestFitBuyer'),
      location: firstJsonValue(page, 'location', 'service_area', 'serviceArea'),
      contact_email: firstJsonValue(page, 'contact_email', 'contactEmail', 'email'),
    })

    return objectRows(records)
  }

  return objectRows([value])
}

function arrayToRows(value: unknown[]): unknown[][] {
  if (!value.length) return []
  if (value.every(Array.isArray)) return value as unknown[][]
  const records = value.filter(isRecord)
  return records.length ? objectRows(records) : value.map((item) => [item])
}

function objectRows(records: Array<Record<string, unknown>>): unknown[][] {
  const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))))
  return [headers, ...records.map((record) => headers.map((header) => record[header]))]
}

function catalogJsonItem(value: unknown, type: 'service' | 'product' | 'faq'): Record<string, unknown> {
  if (!isRecord(value)) {
    return type === 'faq' ? { type, question: value } : { type, name: value }
  }

  return {
    type,
    name: firstJsonValue(value, 'name', 'title'),
    price: firstJsonValue(value, 'price', 'amount'),
    description: firstJsonValue(value, 'description', 'summary', 'details'),
    url: firstJsonValue(value, 'url', 'checkout_url', 'checkoutUrl', 'booking_url', 'bookingUrl'),
    question: firstJsonValue(value, 'question'),
    answer: firstJsonValue(value, 'answer'),
  }
}

function firstJsonValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

function toCellString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)+/g, '')
}

function escapeDelimitedValue(value: string) {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function mode(values: number[]) {
  const frequencies = new Map<number, number>()
  let selected = 0
  let selectedFrequency = 0

  values.forEach((value) => {
    const frequency = (frequencies.get(value) ?? 0) + 1
    frequencies.set(value, frequency)
    if (frequency > selectedFrequency) {
      selected = value
      selectedFrequency = frequency
    }
  })

  return selected
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
