// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../../test/dom'
import { PageCard } from './PageCard'
import type { AgentPage } from '../../lib/agent-page'

const page = {
  id: 'p1',
  name: 'Acme Pro',
  slug: 'acme-pro',
  description: 'desc',
  is_published: true,
  services: [{ name: 's', description: '', price: '', url: '' }],
  products: [],
  faqs: [],
} as unknown as AgentPage

const handlers = () => ({ onCopy: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onToggle: vi.fn() })

describe('PageCard', () => {
  it('renders the page name, slug, and published badge', () => {
    render(<PageCard page={page} eventCount={3} {...handlers()} />)
    expect(screen.getByText('Acme Pro')).toBeInTheDocument()
    expect(screen.getByText('/acme-pro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /published/i })).toBeInTheDocument()
  })

  it('fires onToggle when the publish badge is clicked', () => {
    const h = handlers()
    render(<PageCard page={page} eventCount={0} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: /published/i }))
    expect(h.onToggle).toHaveBeenCalledTimes(1)
  })

  it('exposes a bulk-select checkbox only when onSelectToggle is provided', () => {
    const onSelectToggle = vi.fn()
    const { rerender } = render(<PageCard page={page} eventCount={0} {...handlers()} />)
    expect(screen.queryByRole('checkbox', { name: /select page/i })).toBeNull()

    rerender(<PageCard page={page} eventCount={0} {...handlers()} onSelectToggle={onSelectToggle} selected={false} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select page/i }))
    expect(onSelectToggle).toHaveBeenCalledTimes(1)
  })
})
