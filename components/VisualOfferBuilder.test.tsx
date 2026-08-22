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
    expect(screen.getByRole('button', { name: 'Drag to reorder offer' })).toHaveAttribute('aria-describedby', 'offer-builder-p1-services')
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

  it('uses the original offer index when editing through a source filter', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({ name: 'Calendly offer', source: 'calendly' as any }), offer({ name: 'Stripe offer', source: 'stripe' as any })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'stripe' } })
    fireEvent.click(screen.getByRole('button', { name: /remove offer/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0][0] as OfferItem[]).map((o) => o.name)).toEqual(['Calendly offer'])
  })

  it('switching an offer to Negotiable fires onChange with offerType (Smart Rules)', () => {
    const onChange = vi.fn()
    render(<VisualOfferBuilder offers={[offer({ name: 'Custom Build' })]} kind="services" onChange={onChange} pageId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Negotiable' }))
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].offerType).toBe('negotiable')
  })

  it('rule inputs write a pruned rules object (empty values dropped)', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({ name: 'Custom Build', offerType: 'negotiable' })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('e.g. $800'), { target: { value: '$1,200' } })
    let next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].rules).toEqual({ minPrice: '$1,200' })

    fireEvent.change(screen.getByPlaceholderText('48'), { target: { value: '24' } })
    next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].rules).toEqual({ minNoticeHours: 24 }) // controlled parent not re-rendered; patch is pruned-merge of original (no rules)
  })

  it('clearing the only rule removes the rules object entirely', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({ name: 'Custom Build', offerType: 'negotiable', rules: { minPrice: '$800' } })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )
    fireEvent.change(screen.getByDisplayValue('$800'), { target: { value: '' } })
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].rules).toBeUndefined()
  })
})
