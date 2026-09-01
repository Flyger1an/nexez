type JsonObject = Record<string, unknown>

const OMIT = Symbol('omit-chatgpt-mcp-value')

const BLOCKED_KEYS = new Set([
  'action',
  'actionpath',
  'actions',
  'actionurl',
  'agentjsonurl',
  'apikey',
  'approvalexpiresat',
  'approvaltoken',
  'approvaltokenrequired',
  'body',
  'bookingpath',
  'callback',
  'callbackurl',
  'checkout',
  'checkoutpath',
  'checkouturl',
  'contact',
  'contactemail',
  'contenttype',
  'ctalabel',
  'ctaurl',
  'dryrunbody',
  'email',
  'endpoint',
  'headers',
  'href',
  'httpmethod',
  'idempotencykey',
  'instructions',
  'link',
  'links',
  'llmsurl',
  'mcphandoff',
  'method',
  'negotiationaction',
  'nextstep',
  'nextsteps',
  'openapiurl',
  'optionalfields',
  'payload',
  'phone',
  'phonenumber',
  'plaintext',
  'providerurl',
  'publicpageurl',
  'recommendedactions',
  'redirect',
  'request',
  'requestbody',
  'statuscheck',
  'statustoken',
  'statusurl',
  'voicesummary',
  'website',
  'websiteurl',
])

const ACTION_TEXT_KEYS = new Set([
  'instruction',
  'instructions',
  'message',
  'nextstep',
  'nextsteps',
  'note',
  'recommendation',
  'recommendedaction',
  'recommendedactions',
])

const TOOL_ARGUMENT_KEYS: Record<string, readonly string[]> = {
  nexez_search: [
    'q',
    'location',
    'limit',
    'lat',
    'lng',
    'category',
    'industry',
    'min_readiness',
    'min_trust',
    'verified',
    'supports_negotiation',
    'price_band',
  ],
  nexez_directory: ['category', 'q', 'min_readiness', 'location', 'lat', 'lng'],
  nexez_get_page: ['slug'],
  nexez_validate_checkout: ['slug', 'offer', 'query', 'offerConfiguration'],
  nexez_validate_negotiation: ['slug', 'offer', 'query', 'budget', 'timeline', 'requestedTerms'],
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.|mailto:|tel:)[^\s<>{}\[\]"']+/gi
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+(?:ai|app|co|com|dev|io|net|org|shop|store)(?:\/[^\s<>{}\[\]"']*)?/gi
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]\d{4}\b/g
const ACTION_ROUTE_PATTERN = /\/(?:api\/(?:checkout|negotiations?)|checkout\/)[^\s<>{}\[\]"']*/gi
const ACTION_TEXT_PATTERN = /\b(?:buy|book|checkout|check out|contact|email|call|open|pay|purchase|reserve|submit|visit)\b/i

export const CHATGPT_DISCOVERY_POLICY = Object.freeze({
  mode: 'discovery_and_validation_only',
  purchase_routes_returned: false,
  approval_credentials_returned: false,
  action_execution_available: false,
  note: 'Use this result only to compare published facts or evaluate a dry run. This surface cannot purchase, book, reserve, contact a seller, or submit terms.',
})

/**
 * Keep the ChatGPT surface bounded to the declared read and dry-run inputs.
 * Unknown fields, contact details, approval credentials, and live-action flags
 * are removed before a request reaches the existing public validation APIs.
 */
export function sanitizeChatGptToolArguments(
  toolName: string,
  args: JsonObject,
): JsonObject {
  const allowed = TOOL_ARGUMENT_KEYS[toolName] || []
  const result: JsonObject = {}

  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue
    const sanitized = sanitizeValue(args[key], key)
    if (sanitized !== OMIT) result[key] = sanitized
  }

  return result
}

/**
 * Remove purchase, contact, and execution routes from one tool result while
 * preserving the commercial facts needed for discovery and dry-run review.
 */
export function sanitizeChatGptToolResult(toolName: string, value: unknown): JsonObject {
  const sanitized = sanitizeValue(value, '')
  const data = sanitized === OMIT ? null : sanitized
  const policy = { ...CHATGPT_DISCOVERY_POLICY, tool: toolName }

  if (isRecord(data)) {
    return { ...data, nexez_policy: policy }
  }

  return { data, nexez_policy: policy }
}

function sanitizeValue(value: unknown, key: string): unknown | typeof OMIT {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value

  if (typeof value === 'string') {
    const sanitized = value
      .replace(URL_PATTERN, '[link removed]')
      .replace(EMAIL_PATTERN, '[contact removed]')
      .replace(DOMAIN_PATTERN, '[link removed]')
      .replace(PHONE_PATTERN, '[contact removed]')
      .replace(ACTION_ROUTE_PATTERN, '[route removed]')
      .trim()
    if (!sanitized) return OMIT
    if (ACTION_TEXT_KEYS.has(normalizeKey(key)) && ACTION_TEXT_PATTERN.test(sanitized)) return OMIT
    return sanitized
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item, key))
      .filter((item): item is Exclude<typeof item, typeof OMIT> => item !== OMIT)
  }

  if (!isRecord(value)) return OMIT

  const result: JsonObject = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    if (shouldBlockKey(childKey)) continue
    const sanitized = sanitizeValue(childValue, childKey)
    if (sanitized !== OMIT) result[childKey] = sanitized
  }
  return result
}

function shouldBlockKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return BLOCKED_KEYS.has(normalized)
    || normalized.startsWith('approval')
    || normalized.startsWith('contact')
    || normalized.endsWith('body')
    || normalized.endsWith('email')
    || normalized.endsWith('phone')
    || normalized.endsWith('secret')
    || normalized.endsWith('url')
    || normalized.endsWith('uri')
    || normalized.endsWith('token')
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
