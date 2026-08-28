// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { CatalogImportDialog } from './CatalogImportDialog'

describe('CatalogImportDialog', () => {
  it('moves focus into the dialog, closes on Escape, and releases the page scroll lock', () => {
    const onClose = vi.fn()
    const { rerender } = render(<CatalogImportDialog open onClose={onClose} onImport={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Close catalog importer' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    rerender(<CatalogImportDialog open={false} onClose={onClose} onImport={vi.fn()} />)
    expect(document.body.style.overflow).toBe('')
  })

  it('previews, auto-maps, and applies a reviewed CSV import', async () => {
    const onImport = vi.fn()
    const onClose = vi.fn()
    const { container } = render(<CatalogImportDialog open onClose={onClose} onImport={onImport} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, {
      target: {
        files: [new File([
          'type,name,price,description,business_name\nservice,Audit,$120,Fast review,Acme Studio',
        ], 'offers.csv', { type: 'text/csv' })],
      },
    })

    expect(await screen.findByText('offers.csv')).toBeInTheDocument()
    expect(screen.getByLabelText('Map name')).toHaveValue('name')
    expect(screen.getByLabelText('Map business_name')).toHaveValue('business_name')
    expect(screen.getByText('Audit')).toBeInTheDocument()
    expect(screen.getByText('Services 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed import' }))

    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
      page: expect.objectContaining({ name: 'Acme Studio', slug: 'acme-studio' }),
      services: [expect.stringContaining('Audit | $120 | Fast review')],
    }), 'offers.csv')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('defaults plain TXT lines to headerless service names', async () => {
    const onImport = vi.fn()
    const { container } = render(<CatalogImportDialog open onClose={vi.fn()} onImport={onImport} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(['Consultation\nImplementation'], 'offers.txt', { type: 'text/plain' })] },
    })

    expect(await screen.findByText('offers.txt')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'First row is a header' })).not.toBeChecked()
    expect(screen.getByLabelText('Map Column 1')).toHaveValue('name')
    expect(screen.getByText('Services 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed import' }))
    expect(onImport.mock.calls[0][0].services).toHaveLength(2)
  })

  it('keeps target field assignments unique when a user remaps a column', async () => {
    const { container } = render(<CatalogImportDialog open onClose={vi.fn()} onImport={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(['name,title\nAudit,Backup'], 'offers.csv')] },
    })

    await screen.findByText('offers.csv')
    expect(screen.getByLabelText('Map name')).toHaveValue('name')
    expect(screen.getByLabelText('Map title')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('Map title'), { target: { value: 'name' } })
    expect(screen.getByLabelText('Map name')).toHaveValue('')
    expect(screen.getByLabelText('Map title')).toHaveValue('name')
  })

  it('does not apply a mapped file that contains no importable data', async () => {
    const { container } = render(<CatalogImportDialog open onClose={vi.fn()} onImport={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(['name\n'], 'empty-catalog.csv', { type: 'text/csv' })] },
    })

    expect(await screen.findByText('empty-catalog.csv')).toBeInTheDocument()
    expect(screen.getByText(/Map at least one offer, FAQ, or business field/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply reviewed import' })).toBeDisabled()
  })

  it('shows an actionable error for unsupported files', async () => {
    const { container } = render(<CatalogImportDialog open onClose={vi.fn()} onImport={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, {
      target: { files: [new File(['<catalog />'], 'catalog.xml', { type: 'application/xml' })] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose CSV, TSV, TXT, JSON, XLS, or XLSX/i)
    await waitFor(() => expect(screen.getByRole('button', { name: /choose a file/i })).toBeEnabled())
  })
})
