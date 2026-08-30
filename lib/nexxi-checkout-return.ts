const NEXXI_AGENT = 'nexxi'
const CHECKOUT_RETURN_PATH = '/nexxi/checkout/return'

export type NexxiCheckoutReturnContext = {
  kind?: 'order' | 'negotiation'
  token?: string | null
}

export function isNexxiBuyerAgent(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === NEXXI_AGENT
}

export function buildNexxiCheckoutReturnUrl(
  baseUrl: string,
  status: 'success' | 'cancelled',
  context: NexxiCheckoutReturnContext = {},
): string {
  const url = new URL(CHECKOUT_RETURN_PATH, `${baseUrl.replace(/\/$/, '')}/`)
  url.searchParams.set('status', status)
  if (context.kind) url.searchParams.set('kind', context.kind)
  const token = cleanToken(context.token)
  if (token) url.searchParams.set('token', token)
  if (status === 'success' && context.kind !== 'negotiation') {
    url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}')
  }
  return url.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}')
}

export function checkoutReturnUrls(input: {
  baseUrl: string
  buyerAgent: unknown
  webSuccessUrl: string
  webCancelUrl: string
  context?: NexxiCheckoutReturnContext
}): { successUrl: string; cancelUrl: string; mobile: boolean } {
  if (!isNexxiBuyerAgent(input.buyerAgent)) {
    return { successUrl: input.webSuccessUrl, cancelUrl: input.webCancelUrl, mobile: false }
  }
  return {
    successUrl: buildNexxiCheckoutReturnUrl(input.baseUrl, 'success', input.context),
    cancelUrl: buildNexxiCheckoutReturnUrl(input.baseUrl, 'cancelled', input.context),
    mobile: true,
  }
}

function cleanToken(value: unknown): string {
  if (typeof value !== 'string') return ''
  const token = value.trim()
  return /^[A-Za-z0-9._~-]{8,512}$/.test(token) ? token : ''
}
