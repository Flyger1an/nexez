// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../test/dom'
import { VisualOfferBuilder } from './VisualOfferBuilder'
import type { OfferItem } from '../lib/agent-page'

const offer = (o: Partial<OfferItem> & { name: string }): OfferItem => ({ description: '', price: '', url: '', ...o })

describe('VisualOfferBuilder', () => {
  it('renders existing offers as editable fields', () => {
    render(
      <VisualOfferBuilder offers={[offer({ name: 'Consulting Call', price: '$100' })]} kind="services" onChange={() => {}} pageId="p1" />,
    )
    expect(screen.getByDisplayValue('Consulting Call')).toBeInTheDocument()
  })

  it('removing an offer fires onChange without it', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder offers={[offer({ name: 'Alpha' }), offer({ name: 'Beta' })]} kind="services" onChange={onChange} pageId="p1" />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /remove offer/i })[0])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0][0] as OfferItem[]).map((o) => o.name)).toEqual(['Beta'])
  })

  it('editing an offer name fires onChange with the updated value', () => {
    const onChange = vi.fn()
    render(<VisualOfferBuilder offers={[offer({ name: 'Old name' })]} kind="services" onChange={onChange} pageId="p1" />)
    fireEvent.change(screen.getByDisplayValue('Old name'), { target: { value: 'New name' } })
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].name).toBe('New name')
  })
})
