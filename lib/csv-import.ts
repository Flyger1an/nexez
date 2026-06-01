import { normalizeSlug } from './agent-page'

export type ImportedAgentCsv = {
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
}

type CsvRow = Record<string, string>

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

export const sampleAgentCsv = sampleRows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')

export function parseAgentCsv(value: string): ImportedAgentCsv {
  const rows = parseCsvRows(value)
  const imported: ImportedAgentCsv = {
    page: {},
    services: [],
    products: [],
    faqs: [],
    rowCount: rows.length,
  }

  for (const row of rows) {
    const type = getValue(row, 'type', 'kind', 'category').toLowerCase()
    const name = getValue(row, 'name', 'title', 'offer')
    const price = getValue(row, 'price', 'amount')
    const description = getValue(row, 'description', 'summary', 'details')
    const url = getValue(row, 'url', 'checkout_url', 'booking_url', 'link')
    const question = getValue(row, 'question', 'faq_question')
    const answer = getValue(row, 'answer', 'faq_answer')

    imported.page.name ||= getValue(row, 'business_name', 'business', 'company')
    imported.page.description ||= getValue(row, 'business_description', 'page_description')
    imported.page.websiteUrl ||= getValue(row, 'website_url', 'website')
    imported.page.ctaUrl ||= getValue(row, 'cta_url', 'primary_url')
    imported.page.ctaLabel ||= getValue(row, 'cta_label', 'primary_action')
    imported.page.audience ||= getValue(row, 'audience', 'buyer', 'best_fit_buyer')
    imported.page.location ||= getValue(row, 'location', 'service_area')
    imported.page.contactEmail ||= getValue(row, 'contact_email', 'email')

    if (imported.page.name && !imported.page.slug) {
      imported.page.slug = normalizeSlug(imported.page.name)
    }

    if (type.includes('faq') || question || answer) {
      if (question || answer) {
        imported.faqs.push(`${question || 'Question'} | ${answer || 'Answer'}`)
      }
      continue
    }

    if (!name && !description) continue

    const offerLine = `${name || 'Untitled offer'} | ${price || 'Custom quote'} | ${description || 'Imported offer'} | ${url}`

    if (type.includes('product')) {
      imported.products.push(offerLine)
    } else {
      imported.services.push(offerLine)
    }
  }

  return imported
}

function parseCsvRows(value: string): CsvRow[] {
  const records = parseRecords(value)
  const [headers = [], ...rows] = records
  const normalizedHeaders = headers.map((header) => normalizeHeader(header))

  return rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) =>
      normalizedHeaders.reduce<CsvRow>((record, header, index) => {
        if (header) record[header] = row[index]?.trim() ?? ''
        return record
      }, {}),
    )
}

function parseRecords(value: string) {
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

    if (character === ',' && !inQuotes) {
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

  if (cell || record.length) {
    record.push(cell)
    records.push(record)
  }

  return records
}

function getValue(row: CsvRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)]
    if (value) return value.trim()
  }

  return ''
}

function normalizeHeader(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)+/g, '')
}

function escapeCsvValue(value: string) {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}
