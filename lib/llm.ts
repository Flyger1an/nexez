// Real LLM assist — OpenAI-compatible chat completions, gated behind env so it
// stays dormant (deterministic fallback) until a key is configured.
// Works with OpenAI, xAI, Together, etc. via LLM_BASE_URL.

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

export function llmModel(): string {
  return process.env.LLM_MODEL || 'gpt-4o-mini'
}

/**
 * Returns the model completion, or null when not configured / on any error
 * (callers fall back to the deterministic rewriter).
 */
export async function llmComplete(
  prompt: string,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string | null> {
  if (!isLlmConfigured()) return null

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
        model: llmModel(),
        messages,
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    return typeof text === 'string' && text.trim() ? text.trim() : null
  } catch {
    return null
  }
}
