'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import {
  buildImportedCatalog,
  CATALOG_IMPORT_FIELD_OPTIONS,
  CATALOG_IMPORT_LIMITS,
  CatalogColumnMapping,
  CatalogImportDocument,
  CatalogImportField,
  getCatalogImportTable,
  ImportedAgentCatalog,
  suggestCatalogMapping,
} from '../../lib/catalog-import'
import {
  CATALOG_IMPORT_ACCEPT,
  formatCatalogImportType,
  parseCatalogImportFile,
} from '../../lib/catalog-import-file'

type CatalogImportDialogProps = {
  open: boolean
  onClose: () => void
  onImport: (catalog: ImportedAgentCatalog, fileName: string) => void
}

export function CatalogImportDialog({ open, onClose, onImport }: CatalogImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const [importDocument, setImportDocument] = useState<CatalogImportDocument | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<CatalogColumnMapping>({})
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const sheet = importDocument?.sheets[sheetIndex]
  const table = useMemo(() => sheet ? getCatalogImportTable(sheet, hasHeader) : null, [hasHeader, sheet])
  const preview = useMemo(
    () => sheet ? buildImportedCatalog(sheet, hasHeader, mapping) : null,
    [hasHeader, mapping, sheet],
  )
  const mappedColumnCount = Object.values(mapping).filter(Boolean).length
  const importableCount = preview
    ? preview.services.length + preview.products.length + preview.faqs.length
    : 0
  const hasBusinessData = preview ? Object.values(preview.page).some(Boolean) : false
  const hasImportableData = importableCount > 0 || hasBusinessData

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previousOverflow = window.document.body.style.overflow
    const previouslyFocused = window.document.activeElement instanceof HTMLElement
      ? window.document.activeElement
      : null
    window.document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      previouslyFocused?.focus()
    }
  }, [open])

  if (!open) return null

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setImportDocument(null)

    try {
      const parsed = await parseCatalogImportFile(file)
      setImportDocument(parsed)
      configureSheet(parsed, 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be imported.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function configureSheet(nextDocument: CatalogImportDocument, index: number, nextHasHeader?: boolean) {
    const nextSheet = nextDocument.sheets[index]
    if (!nextSheet) return
    const header = nextHasHeader ?? nextSheet.suggestedHeader
    setSheetIndex(index)
    setHasHeader(header)
    setMapping(suggestCatalogMapping(nextSheet, header))
  }

  function changeMapping(columnIndex: number, field: CatalogImportField | '') {
    setMapping((current) => {
      const next = { ...current }
      if (field) {
        Object.entries(next).forEach(([index, assigned]) => {
          if (assigned === field && Number(index) !== columnIndex) next[Number(index)] = ''
        })
      }
      next[columnIndex] = field
      return next
    })
  }

  function applyImport() {
    if (!preview || !importDocument || !mappedColumnCount || !hasImportableData) return
    onImport(preview, importDocument.fileName)
    setImportDocument(null)
    setMapping({})
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-import-title"
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--signal)]">Catalog importer</p>
            <h2 id="catalog-import-title" className="mt-1 text-xl font-semibold sm:text-2xl">Review the file before applying it</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--fg-muted)]">
              CSV, TSV, TXT, JSON, XLS, and XLSX stay in your browser. Map each source column to a Nexez field, then import only what you reviewed.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close catalog importer"
            className="rounded-lg border border-[var(--border)] p-2 text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <input
            ref={inputRef}
            type="file"
            accept={CATALOG_IMPORT_ACCEPT}
            onChange={(event) => void handleFile(event.target.files?.[0])}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false) }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void handleFile(event.dataTransfer.files?.[0])
            }}
            className={`flex w-full items-center justify-center rounded-xl border border-dashed px-5 text-center transition ${importDocument ? 'min-h-16' : 'min-h-32'} ${dragging ? 'border-[var(--signal)] bg-[var(--signal)]/10' : 'border-[var(--border)] bg-[var(--fill-1)] hover:border-[var(--signal)]/60'}`}
          >
            <span className={`flex items-center gap-2 ${importDocument ? 'flex-row' : 'flex-col'}`}>
              {busy ? <Loader2 className="size-7 animate-spin text-[var(--signal)]" /> : <Upload className={`${importDocument ? 'size-5' : 'size-7'} text-[var(--signal)]`} />}
              <span className="font-medium">{busy ? 'Reading file...' : importDocument ? 'Choose another file' : 'Choose a file or drop it here'}</span>
              {!importDocument ? (
                <span className="text-xs text-[var(--fg-muted-2)]">
                  Up to {Math.round(CATALOG_IMPORT_LIMITS.maxBytes / (1024 * 1024))} MB and {CATALOG_IMPORT_LIMITS.maxRows.toLocaleString()} data rows
                </span>
              ) : null}
            </span>
          </button>

          {error ? (
            <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-300">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {importDocument && sheet && table ? (
            <div className="mt-5 space-y-5">
              <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--fill-1)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="rounded-lg border border-[var(--signal)]/30 bg-[var(--signal)]/10 p-2 text-[var(--signal)]">
                    <FileSpreadsheet className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{importDocument.fileName}</p>
                    <p className="text-xs text-[var(--fg-muted-2)]">
                      {formatCatalogImportType(importDocument.format)} · {table.rows.length.toLocaleString()} data rows · {table.headers.length} columns
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {importDocument.sheets.length > 1 ? (
                    <label className="text-xs text-[var(--fg-muted)]">
                      <span className="mr-2">Sheet</span>
                      <select
                        value={sheetIndex}
                        onChange={(event) => configureSheet(importDocument, Number(event.target.value))}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
                      >
                        {importDocument.sheets.map((option, index) => <option key={option.name} value={index}>{option.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(event) => configureSheet(importDocument, sheetIndex, event.target.checked)}
                      className="accent-[var(--signal)]"
                    />
                    First row is a header
                  </label>
                </div>
              </div>

              {importDocument.warnings.map((warning) => (
                <p key={warning} className="rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-3 py-2 text-xs text-[var(--amber)]">{warning}</p>
              ))}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--fill-1)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Column mapping</p>
                      <p className="text-xs text-[var(--fg-muted-2)]">Assign each source column once. Unmapped columns are ignored.</p>
                    </div>
                    <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--fg-muted)]">{mappedColumnCount} mapped</span>
                  </div>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {table.headers.map((header, index) => (
                      <label key={`${header}-${index}`} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
                        <span className="truncate text-sm" title={header}>{header}</span>
                        <select
                          aria-label={`Map ${header}`}
                          value={mapping[index] ?? ''}
                          onChange={(event) => changeMapping(index, event.target.value as CatalogImportField | '')}
                          className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--fill-1)] px-3 text-sm text-[var(--fg)]"
                        >
                          <option value="">Ignore column</option>
                          {(['Offer or FAQ', 'Business'] as const).map((group) => (
                            <optgroup key={group} label={group}>
                              {CATALOG_IMPORT_FIELD_OPTIONS.filter((option) => option.group === group).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--fill-1)] p-4">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="font-medium">Data preview</p>
                      <p className="text-xs text-[var(--fg-muted-2)]">Showing up to five rows. Nothing is applied until you confirm.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <ResultPill label="Services" value={preview?.services.length ?? 0} />
                      <ResultPill label="Products" value={preview?.products.length ?? 0} />
                      <ResultPill label="FAQs" value={preview?.faqs.length ?? 0} />
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead className="bg-[var(--fill-2)] text-[var(--fg-muted)]">
                        <tr>
                          {table.headers.map((header, index) => <th key={`${header}-${index}`} className="max-w-52 border-b border-r border-[var(--border)] px-3 py-2 font-medium last:border-r-0">{header}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-[var(--border)] last:border-b-0">
                            {table.headers.map((_, columnIndex) => (
                              <td key={columnIndex} className="max-w-52 truncate border-r border-[var(--border)] px-3 py-2 text-[var(--fg-muted)] last:border-r-0" title={row[columnIndex] ?? ''}>
                                {row[columnIndex] || <span className="text-[var(--fg-muted-2)]">“”</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview?.skippedRowCount ? (
                    <p className="mt-3 text-xs text-[var(--amber)]">{preview.skippedRowCount} row(s) have no mapped offer, FAQ, or business data and will be skipped.</p>
                  ) : null}
                </div>
              </div>

              {hasImportableData ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--ready)]/25 bg-[var(--ready)]/10 p-4 text-sm text-[var(--ready)]">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{importableCount} catalog item(s) are ready{hasBusinessData ? ', plus mapped business fields' : ''}.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--amber)]/30 bg-[var(--amber)]/10 p-4 text-sm text-[var(--amber)]">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>Map at least one offer, FAQ, or business field before applying this file.</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[var(--border)] px-5 text-sm font-medium hover:bg-[var(--fill-1)]">Cancel</button>
          <button
            type="button"
            onClick={applyImport}
            disabled={!importDocument || !mappedColumnCount || !hasImportableData || busy}
            className="min-h-11 rounded-lg border border-[var(--signal)] bg-[var(--signal)]/10 px-5 text-sm font-semibold text-[var(--signal)] hover:bg-[var(--signal)]/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply reviewed import
          </button>
        </footer>
      </section>
    </div>
  )
}

function ResultPill({ label, value }: { label: string; value: number }) {
  return <span className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[var(--fg-muted)]">{label} {value}</span>
}
