import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { captureEvent } from '../../../../../lib/observability'
import {
  inspectA2AAgentCard,
  MAX_A2A_AGENT_CARD_BYTES,
} from '../../../../../lib/a2a/agent-card-conformance'

export const maxDuration = 5

const ACCEPTED_CONTENT_TYPES = [
  'application/json',
  'application/a2a+json',
]

function contentTypeSupported(request: Request): boolean {
  const mediaType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  return Boolean(mediaType && ACCEPTED_CONTENT_TYPES.includes(mediaType))
}

function payloadTooLarge(request: Request): boolean {
  const header = request.headers.get('content-length')
  if (!header) return false
  const declaredBytes = Number(header)
  return Number.isFinite(declaredBytes) && declaredBytes > MAX_A2A_AGENT_CARD_BYTES
}

class AgentCardPayloadTooLarge extends Error {}

async function readPayload(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_A2A_AGENT_CARD_BYTES) {
      await reader.cancel()
      throw new AgentCardPayloadTooLarge()
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

function cardFromPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(record, 'card')) return value
  // A raw Agent Card must win over an ambiguous wrapper-shaped custom field.
  if (
    Object.prototype.hasOwnProperty.call(record, 'name')
    || Object.prototype.hasOwnProperty.call(record, 'supportedInterfaces')
  ) {
    return value
  }
  return record.card
}

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * Public, deterministic A2A Agent Card conformance gate.
 *
 * Callers may POST either a raw Agent Card or { card }. The validator never
 * fetches a remote URL, executes a skill, stores the submitted card, verifies a
 * claimed identity, or echoes the raw payload. It reports bounded structural
 * and Nexez-compatibility findings for the stable A2A 1.0 profile.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'a2a-agent-card-validate', 12, 60_000)
  if (limited) return limited

  if (!contentTypeSupported(request)) {
    return json(
      { error: 'Content-Type must be application/json or application/a2a+json.' },
      415,
    )
  }
  if (payloadTooLarge(request)) {
    return json({ error: 'Agent Card payload is too large.' }, 413)
  }

  let raw: string
  try {
    raw = await readPayload(request)
  } catch (error) {
    if (error instanceof AgentCardPayloadTooLarge) {
      return json({ error: 'Agent Card payload is too large.' }, 413)
    }
    return json({ error: 'Could not read Agent Card payload.' }, 400)
  }

  if (!raw.trim()) {
    return json({ error: 'Agent Card payload is required.' }, 400)
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON.' }, 400)
  }

  const report = inspectA2AAgentCard(cardFromPayload(payload))
  captureEvent('a2a.agent_card.validate', {
    profile: report.profile,
    specRelease: report.specRelease,
    valid: report.valid,
    compatible: report.compatible,
    interfaceCount: report.interfaces.length,
    protocolVersions: report.protocolVersions.join(','),
    skillCount: report.skillCount,
    compatibleSkillCount: report.compatibleSkillCount,
    issueCount: report.issues.length,
    authenticated: report.security.authenticated,
    allowsAnonymous: report.security.allowsAnonymous,
    streaming: report.capabilities.streaming,
    requiredExtensionCount: report.capabilities.requiredExtensions.length,
    signatureCount: report.signatures.count,
  })

  return json(
    { ok: true, ...report },
    report.valid ? 200 : 422,
  )
}
