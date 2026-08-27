import type {
  GrowthCohortBatchCandidate,
  GrowthCohortVerificationStatus,
} from './growth-control'

const EMAIL_HEADERS = ['email', 'business_email', 'contact_email', 'owner_email']
const LABEL_HEADERS = ['label', 'business', 'business_name', 'company', 'company_name', 'name']
const WAVE_HEADERS = ['wave', 'cohort_wave', 'batch', 'release_wave']
const STATUS_HEADERS = [
  'verification_status',
  'email_verification_status',
  'verification',
  'email_status',
  'result',
  'status',
]
const PROVIDER_HEADERS = ['verification_provider', 'email_verification_provider', 'provider', 'source']

export type GrowthCohortCsvResult = {
  candidates: GrowthCohortBatchCandidate[]
  errors: string[]
  duplicateEmails: string[]
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(field.trim())
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted field.')
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function headerIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header))
}

export function normalizeVerificationStatus(value: string): GrowthCohortVerificationStatus {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return 'unverified'
  if (['valid', 'verified', 'ok', 'good', 'deliverable', 'safe_to_send'].includes(normalized)) {
    return 'valid'
  }
  if (['risky', 'risk', 'catch_all', 'catchall', 'accept_all', 'guessed'].includes(normalized)) {
    return 'risky'
  }
  if (['invalid', 'bad', 'undeliverable', 'bounced', 'bounce', 'disposable', 'do_not_send'].includes(normalized)) {
    return 'invalid'
  }
  if (['unknown', 'unavailable', 'unverifiable', 'greylisted'].includes(normalized)) {
    return 'unknown'
  }
  return 'unverified'
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeProvider(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (normalized === 'millionverifier') return 'millionverifier'
  if (normalized === 'apollo' || normalized === 'apollo.io') return 'apollo'
  return value.trim().toLowerCase()
}

export function parseGrowthCohortCsv(
  input: string,
  options: { waveSize: number; defaultProvider: string },
): GrowthCohortCsvResult {
  const errors: string[] = []
  let rows: string[][]
  try {
    rows = parseCsvRows(input.trim())
  } catch (error) {
    return {
      candidates: [],
      errors: [error instanceof Error ? error.message : 'The CSV could not be parsed.'],
      duplicateEmails: [],
    }
  }
  if (!rows.length) return { candidates: [], errors: [], duplicateEmails: [] }

  const first = rows[0].map(normalizeHeader)
  const hasHeader = !looksLikeEmail(rows[0][0] || '')
  const headers = hasHeader ? first : ['email', 'label', 'wave', 'verification_status', 'verification_provider']
  const dataRows = hasHeader ? rows.slice(1) : rows
  const emailIndex = headerIndex(headers, EMAIL_HEADERS)
  const labelIndex = headerIndex(headers, LABEL_HEADERS)
  const waveIndex = headerIndex(headers, WAVE_HEADERS)
  const statusIndex = headerIndex(headers, STATUS_HEADERS)
  const providerIndex = headerIndex(headers, PROVIDER_HEADERS)

  if (emailIndex < 0) {
    return {
      candidates: [],
      errors: ['The CSV needs an email column.'],
      duplicateEmails: [],
    }
  }

  const waveSize = Math.max(1, Math.min(25, Math.trunc(options.waveSize) || 20))
  const candidates: GrowthCohortBatchCandidate[] = []
  const seen = new Set<string>()
  const duplicateEmails = new Set<string>()

  dataRows.forEach((row, rowIndex) => {
    const line = rowIndex + (hasHeader ? 2 : 1)
    const email = (row[emailIndex] || '').trim().toLowerCase()
    if (!looksLikeEmail(email)) {
      errors.push(`Row ${line} has an invalid email.`)
      return
    }
    if (seen.has(email)) {
      duplicateEmails.add(email)
      return
    }
    seen.add(email)

    const rawWave = waveIndex >= 0 ? (row[waveIndex] || '').trim() : ''
    const wave = rawWave ? Number(rawWave) : Math.floor(candidates.length / waveSize) + 1
    if (!Number.isInteger(wave) || wave < 1 || wave > 20) {
      errors.push(`Row ${line} has a wave outside 1 through 20.`)
      return
    }

    const verificationStatus = normalizeVerificationStatus(statusIndex >= 0 ? row[statusIndex] || '' : '')
    const rawProvider = providerIndex >= 0 ? (row[providerIndex] || '').trim() : ''
    const verificationProvider = verificationStatus === 'unverified'
      ? null
      : normalizeProvider(rawProvider || options.defaultProvider)
    if (verificationStatus !== 'unverified' && !verificationProvider) {
      errors.push(`Row ${line} has a verification result but no provider.`)
      return
    }

    candidates.push({
      email,
      label: labelIndex >= 0 ? (row[labelIndex] || '').trim().slice(0, 120) || null : null,
      wave,
      verificationStatus,
      verificationProvider,
    })
  })

  if (candidates.length > 100) errors.push('A batch can contain at most 100 candidates.')
  return {
    candidates: candidates.slice(0, 100),
    errors,
    duplicateEmails: Array.from(duplicateEmails).sort(),
  }
}
