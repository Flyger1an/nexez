// Real LLM assist — OpenAI-compatible chat completions, gated behind env so it
// stays dormant (deterministic fallback) until a key is configured.
// Works with OpenAI, xAI/Grok, Google Gemini (via https://generativelanguage.googleapis.com/v1beta/openai/),
// Together, Groq, etc. via LLM_BASE_URL + LLM_MODEL.

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

export function llmModel(): string {
  return process.env.LLM_MODEL || 'gpt-4o-mini'
}

export function llmProviderName(): string {
  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  try {
    const host = new URL(base).hostname
    return host.replace(/^api\./, '') || 'OpenAI-compatible'
  } catch {
    return 'OpenAI-compatible'
  }
}

export type LlmCompletionStatus =
  | 'not_configured'
  | 'ok'
  | 'empty_response'
  | 'http_error'
  | 'network_error'

export type LlmCompletionResult = {
  text: string | null
  status: LlmCompletionStatus
  configured: boolean
  attempted: boolean
  ok: boolean
  model: string
  provider: string
  latencyMs: number
  error?: string
  httpStatus?: number
}

/**
 * Returns structured completion telemetry so callers can tell the difference
 * between "no key", "model failed", and "model returned usable text".
 */
export async function llmCompleteDetailed(
  prompt: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {},
): Promise<LlmCompletionResult> {
  const model = llmModel()
  const provider = llmProviderName()
  const startedAt = Date.now()

  if (!isLlmConfigured()) {
    return {
      text: null,
      status: 'not_configured',
      configured: false,
      attempted: false,
      ok: false,
      model,
      provider,
      latencyMs: 0,
      error: 'LLM_API_KEY is not configured.',
    }
  }

  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const messages = [
    ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
    { role: 'user', content: prompt },
  ]

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      return {
        text: null,
        status: 'http_error',
        configured: true,
        attempted: true,
        ok: false,
        model,
        provider,
        latencyMs: Date.now() - startedAt,
        httpStatus: res.status,
        error: `LLM request failed with HTTP ${res.status}.`,
      }
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) {
      return {
        text: null,
        status: 'empty_response',
        configured: true,
        attempted: true,
        ok: false,
        model,
        provider,
        latencyMs: Date.now() - startedAt,
        error: 'LLM response did not include text.',
      }
    }

    return {
      text: text.trim(),
      status: 'ok',
      configured: true,
      attempted: true,
      ok: true,
      model,
      provider,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      text: null,
      status: 'network_error',
      configured: true,
      attempted: true,
      ok: false,
      model,
      provider,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message.slice(0, 180) : 'LLM request failed.',
    }
  }
}

/**
 * Returns the model completion, or null when not configured / on any error
 * (callers fall back to the deterministic rewriter).
 */
export async function llmComplete(
  prompt: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string | null> {
  const result = await llmCompleteDetailed(prompt, opts)
  return result.text
}

/**
 * Vision variant: sends one or more images alongside the prompt using the
 * OpenAI-compatible multimodal message shape (content parts with image_url).
 * Works with vision-capable OpenAI-compatible models (gpt-4o / gpt-4o-mini,
 * etc.). `images` are data URLs (data:image/png;base64,…) or https URLs.
 * Same fail-safe telemetry as llmCompleteDetailed — callers treat a non-ok
 * result as "could not review" (never as a pass).
 */
export async function llmVisionCompleteDetailed(
  prompt: string,
  images: string[],
  opts: { system?: string; maxTokens?: number; temperature?: number } = {},
): Promise<LlmCompletionResult> {
  const model = llmModel()
  const provider = llmProviderName()
  const startedAt = Date.now()

  if (!isLlmConfigured()) {
    return { text: null, status: 'not_configured', configured: false, attempted: false, ok: false, model, provider, latencyMs: 0, error: 'LLM_API_KEY is not configured.' }
  }
  if (!images.length) {
    return { text: null, status: 'empty_response', configured: true, attempted: false, ok: false, model, provider, latencyMs: 0, error: 'No image supplied for vision review.' }
  }

  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const userContent = [
    { type: 'text', text: prompt },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
  const messages = [
    ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
    { role: 'user', content: userContent },
  ]

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 600, temperature: opts.temperature ?? 0.2 }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      return { text: null, status: 'http_error', configured: true, attempted: true, ok: false, model, provider, latencyMs: Date.now() - startedAt, httpStatus: res.status, error: `LLM vision request failed with HTTP ${res.status}.` }
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) {
      return { text: null, status: 'empty_response', configured: true, attempted: true, ok: false, model, provider, latencyMs: Date.now() - startedAt, error: 'LLM vision response did not include text.' }
    }
    return { text: text.trim(), status: 'ok', configured: true, attempted: true, ok: true, model, provider, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return { text: null, status: 'network_error', configured: true, attempted: true, ok: false, model, provider, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message.slice(0, 180) : 'LLM vision request failed.' }
  }
}
