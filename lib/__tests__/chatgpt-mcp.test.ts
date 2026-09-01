import { describe, expect, it } from 'vitest'
import {
  sanitizeChatGptToolArguments,
  sanitizeChatGptToolResult,
} from '../chatgpt-mcp'

describe('ChatGPT MCP policy boundary', () => {
  it('removes purchase, contact, approval, and execution routes from nested results', () => {
    const result = sanitizeChatGptToolResult('nexez_get_page', {
      page: {
        name: 'Kismet Pros',
        slug: 'kismetpros',
        url: 'https://nexez.app/kismetpros',
        contact_email: 'service@example.com',
        description: 'Public facts at https://example.com, example.org/help, or call 214-555-0123. Never use /api/checkout.',
      },
      offers: [{
        key: 'services-0',
        name: 'Routine Cleaning',
        price: 'Custom quote',
        provider_url: 'https://example.com/book',
        checkout_url: 'https://example.com/pay',
        voice_summary: 'Book this offer now.',
        action: {
          method: 'POST',
          endpoint: 'https://nexez.app/api/checkout',
          body: { slug: 'kismetpros', offer: 'services-0' },
        },
      }],
      approvalToken: 'approval-secret',
      approvalExpiresAt: '2026-09-01T12:00:00.000Z',
      mcpHandoff: {
        actionUrl: 'https://nexez.app/api/checkout',
        method: 'POST',
      },
      plain_text: 'Visit https://example.com to buy.',
      recommended_actions: ['Contact the seller.'],
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/https?:\/\//)
    expect(serialized).not.toContain('service@example.com')
    expect(serialized).not.toContain('214-555-0123')
    expect(serialized).not.toContain('example.org/help')
    expect(serialized).not.toContain('/api/checkout')
    expect(serialized).not.toContain('approval-secret')
    expect(serialized).not.toContain('mcpHandoff')
    expect(serialized).not.toContain('provider_url')
    expect(serialized).not.toContain('checkout_url')
    expect(serialized).not.toContain('endpoint')
    expect(result).toMatchObject({
      page: {
        name: 'Kismet Pros',
        slug: 'kismetpros',
      },
      offers: [{
        key: 'services-0',
        name: 'Routine Cleaning',
        price: 'Custom quote',
      }],
      nexez_policy: {
        mode: 'discovery_and_validation_only',
        purchase_routes_returned: false,
        approval_credentials_returned: false,
        action_execution_available: false,
      },
    })
  })

  it('whitelists dry-run inputs and removes contact or live-action fields', () => {
    const result = sanitizeChatGptToolArguments('nexez_validate_checkout', {
      slug: 'kismetpros',
      offer: 'services-0',
      query: 'Check current requirements',
      offerConfiguration: {
        guest_count: 4,
        contact_email: 'buyer@example.com',
        buyerEmail: 'buyer@example.com',
        callback: 'https://buyer.example/callback',
      },
      buyerEmail: 'buyer@example.com',
      buyerReference: 'buyer-order-1',
      approvalToken: 'approval-secret',
      dryRun: false,
      actionUrl: 'https://nexez.app/api/checkout',
    })

    expect(result).toEqual({
      slug: 'kismetpros',
      offer: 'services-0',
      query: 'Check current requirements',
      offerConfiguration: { guest_count: 4 },
    })
  })

  it('does not forward negotiation contact details', () => {
    expect(sanitizeChatGptToolArguments('nexez_validate_negotiation', {
      slug: 'nexez-agent-negotiation-lab',
      offer: 'services-0',
      budget: '$500',
      timeline: 'September',
      contact: 'buyer@example.com',
      requestedTerms: { scope: 'Published package only' },
    })).toEqual({
      slug: 'nexez-agent-negotiation-lab',
      offer: 'services-0',
      budget: '$500',
      timeline: 'September',
      requestedTerms: { scope: 'Published package only' },
    })
  })
})
