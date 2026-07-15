import 'server-only'
import crypto from 'node:crypto'

export type AgentActionKind = 'checkout' | 'negotiation'

type ApprovalClaims = {
  v: 1
  action: AgentActionKind
  digest: string
  exp: number
}

type ApprovalOptions = {
  secret?: string
  nowMs?: number
  ttlMs?: number
}

export type ApprovalVerification =
  | { ok: true; expiresAt: string }
  | { ok: false; reason: 'malformed' | 'invalid_signature' | 'expired' | 'action_mismatch' | 'payload_mismatch' }

export const ACTION_APPROVAL_TTL_MS = 10 * 60_000

const ACTION_TOKEN_VERSION = 'v1'
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._~:-]{16,255}$/

export function actionApprovalSecret() {
  return validApprovalSecret(process.env.NEXEZ_ACTION_APPROVAL_SECRET)
}

export function actionApprovalRequired() {
  return process.env.NEXEZ_REQUIRE_ACTION_APPROVAL_TOKEN === 'true'
}

export function issueActionApprovalToken(
  action: AgentActionKind,
  input: Record<string, unknown>,
  options: ApprovalOptions = {},
) {
  const secret = options.secret !== undefined ? validApprovalSecret(options.secret) : actionApprovalSecret()
  if (!secret) return null

  const nowMs = options.nowMs ?? Date.now()
  const ttlMs = options.ttlMs ?? ACTION_APPROVAL_TTL_MS
  const claims: ApprovalClaims = {
    v: 1,
    action,
    digest: actionDigest(action, input),
    exp: Math.floor((nowMs + ttlMs) / 1000),
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signed = `${ACTION_TOKEN_VERSION}.${payload}`
  const signature = crypto.createHmac('sha256', secret).update(signed).digest('base64url')

  return {
    approvalToken: `${signed}.${signature}`,
    approvalExpiresAt: new Date(claims.exp * 1000).toISOString(),
  }
}

export function verifyActionApprovalToken(
  token: string,
  action: AgentActionKind,
  input: Record<string, unknown>,
  options: ApprovalOptions = {},
): ApprovalVerification {
  const secret = options.secret !== undefined ? validApprovalSecret(options.secret) : actionApprovalSecret()
  if (!secret) return { ok: false, reason: 'invalid_signature' }

  if (token.length > 4_096) return { ok: false, reason: 'malformed' }

  const [version, payload, signature, extra] = token.split('.')
  if (version !== ACTION_TOKEN_VERSION || !payload || !signature || extra) {
    return { ok: false, reason: 'malformed' }
  }

  const expected = crypto.createHmac('sha256', secret).update(`${version}.${payload}`).digest()
  let supplied: Buffer
  try {
    supplied = Buffer.from(signature, 'base64url')
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  let claims: ApprovalClaims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ApprovalClaims
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (claims?.v !== 1 || typeof claims.exp !== 'number' || typeof claims.digest !== 'string') {
    return { ok: false, reason: 'malformed' }
  }
  if (claims.exp <= Math.floor((options.nowMs ?? Date.now()) / 1000)) {
    return { ok: false, reason: 'expired' }
  }
  if (claims.action !== action) return { ok: false, reason: 'action_mismatch' }
  if (claims.digest !== actionDigest(action, input)) return { ok: false, reason: 'payload_mismatch' }

  return { ok: true, expiresAt: new Date(claims.exp * 1000).toISOString() }
}

export function approvalInput(input: Record<string, unknown>) {
  const {
    approvalToken: _approvalToken,
    dryRun: _dryRun,
    userApproved: _userApproved,
    buyerEmail: _buyerEmail,
    buyerName: _buyerName,
    buyerReference: _buyerReference,
    buyerAgent: _buyerAgent,
    contact: _contact,
    ...bound
  } = input
  return bound
}

export function parsePublicActionIdempotencyKey(request: Request):
  | { ok: true; key: string | null }
  | { ok: false; error: string } {
  const raw = request.headers.get('idempotency-key')
  if (raw === null) return { ok: true, key: null }
  const key = raw.trim()
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    return {
      ok: false,
      error: 'Idempotency-Key must contain 16 to 255 letters, numbers, dots, underscores, tildes, colons, or hyphens.',
    }
  }
  return { ok: true, key }
}

export function scopedIdempotencyHash(action: AgentActionKind, slug: string, key: string) {
  return crypto.createHash('sha256').update(`${action}\0${slug}\0${key}`).digest('hex')
}

export function actionRequestHash(action: AgentActionKind, input: Record<string, unknown>) {
  const {
    approvalToken: _approvalToken,
    dryRun: _dryRun,
    userApproved: _userApproved,
    ...requestInput
  } = input
  return crypto.createHash('sha256').update(`${action}\0${canonicalJson(requestInput)}`).digest('hex')
}

function actionDigest(action: AgentActionKind, input: Record<string, unknown>) {
  return crypto.createHash('sha256').update(`${action}\0${canonicalJson(approvalInput(input))}`).digest('hex')
}

function validApprovalSecret(value: string | undefined) {
  const secret = value?.trim() || ''
  return Buffer.byteLength(secret, 'utf8') >= 32 ? secret : null
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return 'null'
}
