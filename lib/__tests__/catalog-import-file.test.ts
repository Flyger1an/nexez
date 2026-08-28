import { describe, expect, it } from 'vitest'
import { utils, write } from 'xlsx'
import { buildImportedCatalog, suggestCatalogMapping } from '../catalog-import'
import { parseCatalogImportFile } from '../catalog-import-file'

describe('catalog import files', () => {
  it('reads UTF-8 CSV files with a byte-order mark', async () => {
    const file = new File(['\uFEFFtype,name,price\nservice,Audit,$120'], 'offers.csv', { type: 'text/csv' })
    const document = await parseCatalogImportFile(file)
    const sheet = document.sheets[0]
    const imported = buildImportedCatalog(sheet, true, suggestCatalogMapping(sheet, true))

    expect(document.format).toBe('csv')
    expect(imported.services[0]).toContain('Audit | $120')
  })

  it('reads UTF-16 little-endian TXT files', async () => {
    const text = 'Consultation\nImplementation'
    const file = new File([new Uint8Array([0xff, 0xfe]), Buffer.from(text, 'utf16le')], 'offers.txt', { type: 'text/plain' })
    const document = await parseCatalogImportFile(file)
    const sheet = document.sheets[0]
    const imported = buildImportedCatalog(sheet, false, suggestCatalogMapping(sheet, false))

    expect(imported.services).toHaveLength(2)
    expect(imported.services[0]).toContain('Consultation')
  })

  it('reads every non-empty XLSX sheet and preserves sheet selection data', async () => {
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ['type', 'name', 'price'],
      ['service', 'Consultation', '$100'],
    ]), 'Services')
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ['type', 'name', 'price'],
      ['product', 'Playbook', '$30'],
    ]), 'Products')
    const bytes = write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const document = await parseCatalogImportFile(new File([bytes], 'catalog.xlsx'))

    expect(document.format).toBe('xlsx')
    expect(document.sheets.map((sheet) => sheet.name)).toEqual(['Services', 'Products'])
    expect(document.warnings[0]).toMatch(/formulas.+saved values/i)

    const productSheet = document.sheets[1]
    const imported = buildImportedCatalog(productSheet, true, suggestCatalogMapping(productSheet, true))
    expect(imported.products[0]).toContain('Playbook')
  })

  it('reads legacy XLS workbooks without executing workbook code', async () => {
    const workbook = utils.book_new()
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ['type', 'name'],
      ['service', 'Legacy import'],
    ]), 'Catalog')
    const bytes = write(workbook, { type: 'array', bookType: 'xls' }) as ArrayBuffer
    const document = await parseCatalogImportFile(new File([bytes], 'catalog.xls'))

    expect(document.format).toBe('xls')
    expect(document.sheets[0].rows[1]).toEqual(['service', 'Legacy import'])
  })

  it('rejects unsupported extensions before parsing their contents', async () => {
    await expect(parseCatalogImportFile(new File(['name\nAudit'], 'catalog.xml'))).rejects.toThrow(/unsupported file type/i)
  })
})
