import {
  CATALOG_IMPORT_LIMITS,
  CatalogImportDocument,
  CatalogImportFormat,
  CatalogImportSheet,
  parseCatalogImportJson,
  parseCatalogImportText,
  validateImportRows,
} from './catalog-import'

export const CATALOG_IMPORT_ACCEPT = [
  '.csv',
  '.tsv',
  '.txt',
  '.json',
  '.xls',
  '.xlsx',
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
  'application/json',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',')

export async function parseCatalogImportFile(file: File): Promise<CatalogImportDocument> {
  if (file.size === 0) throw new Error('That file is empty.')
  if (file.size > CATALOG_IMPORT_LIMITS.maxBytes) {
    throw new Error(`Files must be ${formatBytes(CATALOG_IMPORT_LIMITS.maxBytes)} or smaller.`)
  }

  const format = importFormat(file.name)
  const buffer = await file.arrayBuffer()

  if (format === 'xls' || format === 'xlsx') {
    return parseWorkbook(buffer, file.name, format)
  }

  const value = decodeTextBuffer(buffer)
  const sheet = format === 'json'
    ? parseCatalogImportJson(value)
    : parseCatalogImportText(value, format)

  if (!sheet.rows.length) throw new Error('That file does not contain any importable rows.')

  return {
    fileName: file.name,
    format,
    sheets: [sheet],
    warnings: [],
  }
}

export function formatCatalogImportType(format: CatalogImportFormat) {
  if (format === 'xls' || format === 'xlsx') return format.toUpperCase()
  return format.toUpperCase()
}

async function parseWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  format: Extract<CatalogImportFormat, 'xls' | 'xlsx'>,
): Promise<CatalogImportDocument> {
  let workbookModule: typeof import('xlsx')

  try {
    workbookModule = await import('xlsx')
  } catch {
    throw new Error('The spreadsheet reader could not load. Refresh and try again.')
  }

  let workbook: ReturnType<typeof workbookModule.read>
  try {
    workbook = workbookModule.read(buffer, {
      type: 'array',
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      sheetRows: CATALOG_IMPORT_LIMITS.maxRows + 2,
    })
  } catch {
    throw new Error('That workbook could not be read. Encrypted and damaged spreadsheets are not supported.')
  }

  if (workbook.SheetNames.length > CATALOG_IMPORT_LIMITS.maxSheets) {
    throw new Error(`Workbooks may contain at most ${CATALOG_IMPORT_LIMITS.maxSheets} sheets.`)
  }

  const sheets: CatalogImportSheet[] = []

  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name]
    if (!worksheet) continue

    const rows = workbookModule.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    })
    const checkedRows = validateImportRows(rows)
    if (!checkedRows.length) continue

    sheets.push({ name, rows: checkedRows, suggestedHeader: true })
  }

  if (!sheets.length) throw new Error('That workbook does not contain any non-empty sheets.')

  return {
    fileName,
    format,
    sheets,
    warnings: ['Workbook formulas are imported as their last saved values. Macros are never executed.'],
  }
}

function importFormat(fileName: string): CatalogImportFormat {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension && ['csv', 'tsv', 'txt', 'json', 'xls', 'xlsx'].includes(extension)) {
    return extension as CatalogImportFormat
  }
  throw new Error('Unsupported file type. Choose CSV, TSV, TXT, JSON, XLS, or XLSX.')
}

function decodeTextBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let encoding = 'utf-8'
  let offset = 0

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    offset = 3
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le'
    offset = 2
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be'
    offset = 2
  } else if (looksLikeUtf16(bytes)) {
    encoding = bytes[0] === 0 ? 'utf-16be' : 'utf-16le'
  }

  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset))
  } catch {
    throw new Error('This text file encoding is not supported. Save it as UTF-8 or UTF-16 and try again.')
  }
}

function looksLikeUtf16(bytes: Uint8Array) {
  const sampleSize = Math.min(bytes.length, 100)
  if (sampleSize < 4) return false

  let evenNulls = 0
  let oddNulls = 0
  for (let index = 0; index < sampleSize; index += 1) {
    if (bytes[index] !== 0) continue
    if (index % 2 === 0) evenNulls += 1
    else oddNulls += 1
  }

  return evenNulls > sampleSize / 8 || oddNulls > sampleSize / 8
}

function formatBytes(value: number) {
  return `${Math.round(value / (1024 * 1024))} MB`
}
