import { describe, expect, it } from 'vitest'
import { buildOpenApiSpec } from '../agent-capabilities'

describe('buildOpenApiSpec - programmatic API (G21)', () => {
  const spec = buildOpenApiSpec() as {
    info: Record<string, unknown>
    paths: Record<string, Record<string, { security?: unknown[]; operationId?: string }>>
    components: { securitySchemes?: Record<string, { type: string; scheme?: string }> }
  }

  it('documents the v1 page endpoints', () => {
    expect(spec.paths['/api/v1/pages']).toBeDefined()
    expect(spec.paths['/api/v1/pages'].get?.operationId).toBe('listOwnerPages')
    expect(spec.paths['/api/v1/pages'].post?.operationId).toBe('createOwnerPage')
    expect(spec.paths['/api/v1/pages/{id}'].get?.operationId).toBe('getOwnerPage')
    expect(spec.paths['/api/v1/pages/{id}'].patch?.operationId).toBe('updateOwnerPage')
  })

  it('declares a bearerAuth security scheme and requires it on v1 endpoints', () => {
    expect(spec.components.securitySchemes?.bearerAuth?.type).toBe('http')
    expect(spec.components.securitySchemes?.bearerAuth?.scheme).toBe('bearer')
    expect(spec.paths['/api/v1/pages'].get?.security).toEqual([{ bearerAuth: [] }])
    expect(spec.paths['/api/v1/pages/{id}'].patch?.security).toEqual([{ bearerAuth: [] }])
  })

  it('keeps the existing public endpoints', () => {
    expect(spec.paths['/api/agent-search']).toBeDefined()
    expect(spec.paths['/api/checkout']).toBeDefined()
  })

  it('documents structured discovery filters and action retry safety', () => {
    const search = spec.paths['/api/agent-search'].get as { parameters?: Array<{ name: string }> }
    expect(search.parameters?.map((parameter) => parameter.name)).toEqual(expect.arrayContaining([
      'industry',
      'min_readiness',
      'min_trust',
      'verified',
      'nexez_checkout_ready',
      'supports_checkout',
      'supports_negotiation',
      'price_band',
    ]))

    const checkout = spec.paths['/api/checkout'].post as { parameters?: Array<{ name: string; in: string }> }
    expect(checkout.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header' }))
  })

  it('advertises OpenClaw distribution metadata', () => {
    const distribution = spec.info['x-nexez-agent-distribution'] as {
      docs_url: string
      openclaw: {
        plugin: { name: string }
        skill: { slug: string }
      }
      sdks: {
        typescript: { name: string; version: string }
        python: { name: string; version: string }
      }
      examples: { sourcePath: string }
    }

    expect(distribution.docs_url).toBe('https://nexez.ai/agents')
    expect(distribution.openclaw.plugin.name).toBe('@nexez/openclaw-nexez')
    expect(distribution.openclaw.skill.slug).toBe('nexez-agent-discovery')
    expect(distribution.sdks.typescript.name).toBe('@nexez/agent-sdk')
    expect(distribution.sdks.typescript.version).toBe('0.3.1')
    expect(distribution.sdks.python.name).toBe('nexez-agent-sdk')
    expect(distribution.sdks.python.version).toBe('0.3.1')
    expect(distribution.examples.sourcePath).toBe('examples/agents')
  })
})
