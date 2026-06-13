const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const MARKDOWN_SPECIALS = /([\\`*_{}\[\]()#+\-.!>|])/g

export function plainAgentText(value: unknown, fallback = '', maxLength = 280): string {
  const text = String(value ?? fallback)
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return fallback
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, Math.max(0, maxLength - 3))
  const wordBreak = clipped.lastIndexOf(' ')
  const end = wordBreak > 40 ? wordBreak : clipped.length
  return `${clipped.slice(0, end).trim()}...`
}

export function markdownText(value: unknown, fallback = '', maxLength = 280): string {
  return plainAgentText(value, fallback, maxLength).replace(MARKDOWN_SPECIALS, '\\$1')
}

export function markdownLinkLabel(value: unknown, fallback = 'Untitled', maxLength = 120): string {
  return plainAgentText(value, fallback, maxLength).replace(/[[\]\\]/g, '\\$&')
}
