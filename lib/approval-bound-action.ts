export type ApprovalActionPayload = Record<string, unknown>

export type ApprovalActionResponse = Record<string, unknown> & {
  ok?: boolean
  error?: string
  code?: string
  approvalToken?: string
  approvalTokenRequired?: boolean
}

export class ApprovalBoundActionError extends Error {
  readonly status: number
  readonly response: ApprovalActionResponse

  constructor(message: string, status: number, response: ApprovalActionResponse = {}) {
    super(message)
    this.name = 'ApprovalBoundActionError'
    this.status = status
    this.response = response
  }
}

type ExecuteApprovalBoundActionOptions = {
  url: string
  input: ApprovalActionPayload
  fetchImpl?: typeof fetch
  headers?: HeadersInit
  idempotencyKey?: string
  signal?: AbortSignal
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._~:-]{16,255}$/

/**
 * Validate a commercial action, receive its short-lived payload-bound approval
 * token, then submit the exact same action with duplicate protection.
 */
export async function executeApprovalBoundAction({
  url,
  input,
  fetchImpl = fetch,
  headers,
  idempotencyKey = createActionIdempotencyKey(),
  signal,
}: ExecuteApprovalBoundActionOptions) {
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    throw new ApprovalBoundActionError('The action idempotency key is invalid.', 0, {
      code: 'invalid_idempotency_key',
    })
  }

  const payload = commercialActionPayload(input)
  const validationHeaders = new Headers(headers)
  validationHeaders.set('idempotency-key', idempotencyKey)
  const validation = await postAction(fetchImpl, url, { ...payload, dryRun: true }, validationHeaders, signal)
  const approvalToken = stringValue(validation.approvalToken)

  if (validation.approvalTokenRequired === true && !approvalToken) {
    throw new ApprovalBoundActionError(
      'The action could not be approved because the server did not issue an approval token.',
      502,
      { ...validation, code: stringValue(validation.code) || 'approval_token_missing' },
    )
  }

  const liveHeaders = new Headers(headers)
  liveHeaders.set('idempotency-key', idempotencyKey)
  const result = await postAction(
    fetchImpl,
    url,
    {
      ...payload,
      dryRun: false,
      ...(approvalToken ? { approvalToken } : {}),
    },
    liveHeaders,
    signal,
  )

  return { validation, result, idempotencyKey }
}

export function createActionIdempotencyKey(scope = 'nexez-action') {
  const safeScope = scope.replace(/[^A-Za-z0-9._~:-]/g, '-').slice(0, 80) || 'nexez-action'
  const nonce = randomNonce()
  return `${safeScope}:${nonce}`.slice(0, 255)
}

function commercialActionPayload(input: ApprovalActionPayload) {
  const {
    approvalToken: _approvalToken,
    dryRun: _dryRun,
    userApproved: _userApproved,
    ...payload
  } = input
  return payload
}

async function postAction(
  fetchImpl: typeof fetch,
  url: string,
  body: ApprovalActionPayload,
  suppliedHeaders?: HeadersInit,
  signal?: AbortSignal,
) {
  const headers = new Headers(suppliedHeaders)
  headers.set('accept', 'application/json')
  headers.set('content-type', 'application/json')

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    throw new ApprovalBoundActionError(
      error instanceof Error ? error.message : 'The action service could not be reached.',
      0,
    )
  }

  const result = await readResponse(response)
  if (!response.ok || result.ok === false) {
    throw new ApprovalBoundActionError(
      stringValue(result.error) || `The action failed with HTTP ${response.status}.`,
      response.status,
      result,
    )
  }
  return result
}

async function readResponse(response: Response): Promise<ApprovalActionResponse> {
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as ApprovalActionResponse
      : {}
  } catch {
    return { error: text.slice(0, 500) }
  }
}

function randomNonce() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
