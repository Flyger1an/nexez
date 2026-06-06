// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test/dom'
import { EditorToolbar } from './EditorToolbar'

const editor = (over: Record<string, any> = {}) =>
  ({
    page: { id: 'p1', slug: 'demo' },
    syncing: false,
    websiteUrl: 'https://acme.com',
    startReanalysis: vi.fn(),
    duplicateThisPage: vi.fn(),
    ...over,
  }) as any

describe('EditorToolbar', () => {
  it('renders the actions and links to the right places', () => {
    render(<EditorToolbar e={editor()} />)
    expect(screen.getByRole('button', { name: /re-analyze from website/i })).toBeEnabled()
    expect(screen.getByRole('link', { name: /view public page/i })).toHaveAttribute('href', '/demo')
    expect(screen.getByRole('link', { name: /test with agents/i })).toHaveAttribute('href', '/dashboard/p1/test')
    expect(screen.getByRole('link', { name: /versions & history/i })).toHaveAttribute('href', '/dashboard/p1/settings')
  })

  it('fires the re-analyze and duplicate callbacks', () => {
    const e = editor()
    render(<EditorToolbar e={e} />)
    fireEvent.click(screen.getByRole('button', { name: /re-analyze from website/i }))
    expect(e.startReanalysis).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /^duplicate$/i }))
    expect(e.duplicateThisPage).toHaveBeenCalledTimes(1)
  })

  it('disables re-analyze while syncing or when there is no website', () => {
    render(<EditorToolbar e={editor({ syncing: true })} />)
    expect(screen.getByRole('button', { name: /analyzing/i })).toBeDisabled()
    render(<EditorToolbar e={editor({ websiteUrl: '' })} />)
    expect(screen.getByRole('button', { name: /re-analyze from website/i })).toBeDisabled()
  })
})
