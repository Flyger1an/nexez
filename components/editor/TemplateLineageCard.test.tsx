// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '../../test/dom'
import { TemplateLineageCard } from './TemplateLineageCard'

describe('TemplateLineageCard', () => {
  it('explains current guidance without treating the template as merchant truth', () => {
    render(<TemplateLineageCard lineage={{
      templateId: 'events.party-rentals',
      templateVersion: 1,
      title: 'Party Rentals',
      adoptedAt: '2026-08-25T22:30:00.000Z',
      referenceAvailable: true,
    }} />)

    expect(screen.getByRole('complementary', { name: 'Commerce Template guidance' })).toBeInTheDocument()
    expect(screen.getByText('Guided by Party Rentals')).toBeInTheDocument()
    expect(screen.getByText(/Nexxi used version 1/)).toBeInTheDocument()
    expect(screen.getByText(/listing details always remain yours/)).toBeInTheDocument()
    expect(screen.getByText('Selected Aug 25, 2026')).toBeInTheDocument()
  })

  it('does not present a missing registry version as current guidance', () => {
    render(<TemplateLineageCard lineage={{
      templateId: 'events.archived-reference',
      templateVersion: 3,
      title: 'Previous setup guide',
      adoptedAt: '2026-08-25T22:30:00.000Z',
      referenceAvailable: false,
    }} />)

    expect(screen.getByText('Previous setup guide')).toBeInTheDocument()
    expect(screen.queryByText(/^Guided by/)).toBeNull()
    expect(screen.getByText(/guide is no longer available/)).toBeInTheDocument()
  })
})
