// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '../../test/dom'
import { ReadinessAside } from './ReadinessAside'

const editor = (over: Record<string, any> = {}) =>
  ({ page: { name: 'Acme', versions: [{}, {}] }, trustEvents: [], score: 73, ...over }) as any

describe('ReadinessAside', () => {
  it('renders the heading, version count, trust score, and readiness percent', () => {
    render(<ReadinessAside e={editor()} />)
    expect(screen.getByRole('heading', { name: /edit agent page/i })).toBeInTheDocument()
    expect(screen.getByText('2 versions')).toBeInTheDocument()
    expect(screen.getByText(/Trust \d+\/100/)).toBeInTheDocument()
    expect(screen.getByText('73%')).toBeInTheDocument()
  })

  it('omits the version badge when there are no versions', () => {
    render(<ReadinessAside e={editor({ page: { name: 'Acme', versions: [] }, score: 10 })} />)
    expect(screen.queryByText(/versions$/)).toBeNull()
    expect(screen.getByText('10%')).toBeInTheDocument()
  })
})
