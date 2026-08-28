import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./merchant-connectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./merchant-connectors')>()
  return {
    ...actual,
    resolvedWooCommerceSiteError: vi.fn(async () => null),
    squareApiBaseUrl: vi.fn(() => 'https://connect.squareup.com'),
  }
})

import {
  importServiceM8Offers,
  importSquareOffers,
  importWooCommerceOffers,
} from './integration-importers'
import { SQUARE_API_VERSION } from './merchant-connectors'

afterEach(() => vi.unstubAllGlobals())

describe('merchant provider importers', () => {
  it('enriches Square catalog items with the canonical Appointments booking path', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/v2/catalog/list')) {
        return Response.json({
          objects: [{
            type: 'ITEM',
            id: 'item-1',
            item_data: {
              name: 'Home consultation',
              description: 'On-site consultation',
              variations: [{ item_variation_data: { name: 'Standard', price_money: { amount: 12500 } } }],
            },
          }],
        })
      }
      if (url.includes('business-booking-profile')) {
        return Response.json({ business_booking_profile: { booking_site_url: 'https://squareup.com/appointments/book/acme' } })
      }
      if (url.includes('/v2/bookings?')) {
        return Response.json({ bookings: [{ id: 'booking-1', customer_note: 'private note' }] })
      }
      return Response.json({ team_member_booking_profiles: [{ is_bookable: true }, { is_bookable: false }] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await importSquareOffers('square-oauth-token')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]).toMatchObject({
      name: 'Home consultation',
      price: '$125',
      url: 'https://squareup.com/appointments/book/acme',
      metadata: {
        square_item_id: 'item-1',
        square_bookable_team_members: 1,
        commerce_provider: 'square',
      },
    })
    expect(result.connectionMetadata).toMatchObject({
      bookingApiReadable: true,
      bookingsReadable: true,
      bookingCount: 1,
      bookableTeamMembers: 1,
    })
    expect(JSON.stringify(result.offers)).not.toContain('private note')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer square-oauth-token', 'Square-Version': SQUARE_API_VERSION })
      expect(init?.redirect).toBe('error')
    }
  })

  it('keeps Square catalog useful when Appointments is unavailable without inventing a booking URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => String(input).includes('/v2/catalog/list')
      ? Response.json({ objects: [{ type: 'ITEM', id: 'i', item_data: { name: 'Repair', variations: [] } }] })
      : new Response(null, { status: 403 })))
    const result = await importSquareOffers('token')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.offers[0]?.url).toBe('')
    expect(result.note).toContain('not enabled or was not granted')
    expect(result.connectionMetadata).toMatchObject({ bookingApiReadable: false, bookingsReadable: false, bookingCount: 0 })
  })

  it('reads WooCommerce products and orders with a read-only Basic credential', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/products')) {
        return new Response(JSON.stringify([{
          id: 42,
          name: 'Filter replacement',
          short_description: '<p>Annual HVAC filter service</p>',
          price: '89.50',
          permalink: 'https://shop.example.com.evil.test/product/filter-replacement',
          sku: 'HVAC-42',
          stock_status: 'instock',
          stock_quantity: 7,
          variations: [],
        }]), { status: 200, headers: { 'content-type': 'application/json', 'x-wp-total': '1' } })
      }
      if (url.pathname.endsWith('/woocommerce_currency')) return Response.json({ value: 'CAD' })
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json', 'x-wp-total': '12' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await importWooCommerceOffers({
      siteUrl: 'https://shop.example.com',
      consumerKey: 'ck_read',
      consumerSecret: 'cs_read',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.offers[0]).toMatchObject({
      name: 'Filter replacement',
      description: 'Annual HVAC filter service',
      price: 'CA$89.50',
      url: 'https://shop.example.com',
      availability: 'available',
      source: 'woocommerce',
      metadata: { woocommerce_product_id: 42, woocommerce_sku: 'HVAC-42', woocommerce_stock_quantity: 7 },
    })
    expect(result.connectionMetadata).toEqual({
      siteUrl: 'https://shop.example.com',
      totalProducts: 1,
      totalOrders: 12,
      ordersReadable: true,
      currency: 'CAD',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from('ck_read:cs_read').toString('base64')}` })
      expect(init?.redirect).toBe('error')
    }
  })

  it('does not call WooCommerce connected when order access is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/products')) return Response.json([])
      if (url.includes('/woocommerce_currency')) return Response.json({ value: 'USD' })
      return new Response(null, { status: 403 })
    }))
    const result = await importWooCommerceOffers({
      siteUrl: 'https://shop.example.com',
      consumerKey: 'ck',
      consumerSecret: 'cs',
    })
    expect(result).toMatchObject({ ok: false, upstreamStatus: 403 })
  })

  it('maps ServiceM8 job templates without importing customer job details as offers', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => String(input).includes('jobtemplate.json')
      ? Response.json([
          { uuid: 'template-1', name: 'Emergency plumbing', job_description: 'Urgent callout', active: 1 },
          { uuid: 'template-2', job_description: 'Drain inspection', active: 1 },
        ])
      : Response.json([{ uuid: 'customer-job-1', job_description: 'Private customer details' }]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await importServiceM8Offers('servicem8-access')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.offers).toEqual([
      expect.objectContaining({
        name: 'Emergency plumbing',
        description: 'Urgent callout',
        price: 'Quote required',
        source: 'servicem8',
        metadata: expect.objectContaining({ servicem8_job_template_uuid: 'template-1', servicem8_create_from_template: true }),
      }),
      expect.objectContaining({ name: 'Drain inspection', description: 'Drain inspection' }),
    ])
    expect(JSON.stringify(result.offers)).not.toContain('Private customer details')
    expect(result.connectionMetadata).toEqual({ activeJobs: 1, jobTemplates: 2, jobsReadable: true })
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer servicem8-access' })
      expect(init?.redirect).toBe('error')
    }
  })

  it('identifies the rejected ServiceM8 endpoint without exposing response data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => String(input).includes('jobtemplate.json')
      ? new Response(null, { status: 403 })
      : Response.json([])))

    const result = await importServiceM8Offers('servicem8-access')

    expect(result).toMatchObject({
      ok: false,
      upstreamStatus: 403,
      error: expect.stringMatching(/job templates \(403\)/i),
    })
    expect(JSON.stringify(result)).not.toContain('servicem8-access')
  })
})
