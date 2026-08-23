// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../test/dom'
import { VisualOfferBuilder } from './VisualOfferBuilder'
import type { OfferItem } from '../lib/agent-page'

const offer = (o: Partial<OfferItem> & { name: string }): OfferItem => ({ description: '', price: '', url: '', ...o })

describe('VisualOfferBuilder', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

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
        negotiationEnabled
      />,
    )

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'stripe' } })
    fireEvent.click(screen.getByRole('button', { name: /remove offer/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0][0] as OfferItem[]).map((o) => o.name)).toEqual(['Calendly offer'])
  })

  it('switching an offer to Negotiable fires onChange with offerType (Smart Rules)', () => {
    const onChange = vi.fn()
    render(<VisualOfferBuilder offers={[offer({ name: 'Custom Build' })]} kind="services" onChange={onChange} pageId="p1" negotiationEnabled />)
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
        negotiationEnabled
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
        negotiationEnabled
      />,
    )
    fireEvent.change(screen.getByDisplayValue('$800'), { target: { value: '' } })
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].rules).toBeUndefined()
  })

  it('fails closed for new negotiation configuration until Pro is authoritatively resolved', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({ name: 'Fixed offer' })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )

    const negotiable = screen.getByRole('button', { name: 'Negotiable' })
    expect(negotiable).toBeDisabled()
    fireEvent.click(negotiable)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Pro/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/dashboard\/billing\?plan=pro$/),
    )
  })

  it('labels retained negotiation paused and blocks new paid-rule values after downgrade', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({
          name: 'Retained negotiation',
          offerType: 'negotiable',
          rules: { minPrice: '$800' },
        })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )

    expect(screen.getByText(/configured but paused/i)).toBeInTheDocument()
    const minimumPrice = screen.getByDisplayValue('$800')
    expect(minimumPrice).toHaveAttribute('readonly')
    fireEvent.change(minimumPrice, { target: { value: '$900' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: /Auto-accept proposals/ })).toBeDisabled()
  })

  it('keeps downgrade cleanup available by switching to Fixed and pruning only paid rules', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({
          name: 'Retained negotiation',
          offerType: 'negotiable',
          rules: {
            minPrice: '$800',
            maxDiscountPercent: 10,
            autoAccept: true,
            autoAcceptWithinPercent: 5,
            autoCounter: true,
            autoSettleMax: '$900',
            minNoticeHours: 24,
            includedScope: 'Setup',
            futureCoreRule: 'keep',
          } as any,
        })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )

    const autoAccept = screen.getByRole('checkbox', { name: /Auto-accept proposals/ })
    expect(autoAccept).toBeChecked()
    expect(autoAccept).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Clear minimum price' })).not.toBeInTheDocument()
    expect(screen.getByText(/atomically remove its paid posture and rules/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fixed' }))
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].offerType).toBeUndefined()
    expect(next[0].rules).toEqual({ minNoticeHours: 24, includedScope: 'Setup', futureCoreRule: 'keep' })
  })

  it('does not advertise a partial minimum-price cleanup that the database rejects', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({
          name: 'Retained minimum',
          offerType: 'negotiable',
          rules: { minPrice: '$800' },
        })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Clear minimum price' })).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('$800')).toHaveAttribute('readonly')
    fireEvent.click(screen.getByRole('button', { name: 'Fixed' }))
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].offerType).toBeUndefined()
    expect(next[0].rules).toBeUndefined()
  })

  it('surfaces and clears legacy paid rules retained on a Fixed offer', () => {
    const onChange = vi.fn()
    render(
      <VisualOfferBuilder
        offers={[offer({
          name: 'Fixed with stale paid rules',
          rules: {
            minPrice: '$800',
            maxDiscountPercent: 10,
            autoAccept: true,
            autoAcceptWithinPercent: 5,
            autoCounter: true,
            autoSettleMax: '$900',
            maxBookingsPerWeek: 5,
            futureCoreRule: 'keep',
          } as any,
        })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
      />,
    )

    expect(screen.getByText(/configured but paused/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear paid negotiation rules' }))
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].rules).toEqual({ maxBookingsPerWeek: 5, futureCoreRule: 'keep' })
  })

  it('fails closed before an authoritative AI entitlement is provided', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(
      <VisualOfferBuilder
        offers={[offer({ name: 'Free offer', description: 'Original copy' })]}
        kind="services"
        onChange={() => {}}
        pageId="p1"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Enhance' })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applies only the server-authorized enhancement for an entitled owner', async () => {
    const onChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      enhanced: 'Server-authorized rewrite',
      source: 'deterministic',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(
      <VisualOfferBuilder
        offers={[offer({ name: 'Launch offer', description: 'Original copy' })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
        aiFeaturesEnabled
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Enhance' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = onChange.mock.calls.at(-1)![0] as OfferItem[]
    expect(next[0].description).toBe('Server-authorized rewrite')
  })

  it('does not apply a local rewrite when the server rejects a stale entitlement', async () => {
    const onChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'plan_upgrade_required',
    }), { status: 402, headers: { 'content-type': 'application/json' } })))
    render(
      <VisualOfferBuilder
        offers={[offer({ name: 'Downgraded offer', description: 'Original copy' })]}
        kind="services"
        onChange={onChange}
        pageId="p1"
        aiFeaturesEnabled
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Enhance' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enhance' })).not.toBeDisabled())
    expect(onChange).not.toHaveBeenCalled()
  })
})
