'use client'

import { useState } from 'react'
import { Check, Copy, Download, FileText, Loader2 } from 'lucide-react'

// The interactive half of /tools/llms-txt-generator: URL in → generated llms.txt out,
// with copy + download. The page shell (metadata, schema, explainer copy) is server-side.
export function GeneratorClient() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || busy) return
    setBusy(true)
    setError('')
    setOutput('')
    try {
      const res = await fetch('/api/tools/llms-txt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || 'Generation failed. Try again.')
        return
      }
      setOutput(json.llmsTxt)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setError('Copy failed — select and copy manually.')
    }
  }

  function download() {
    const blob = new Blob([output], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'llms.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <form onSubmit={generate} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yoursite.com"
          className="min-w-0 flex-1 rounded-lg border border-border bg-white/[0.03] px-4 py-3 text-sm outline-none transition focus:border-[var(--signal)]/60"
          aria-label="Your website URL"
        />
        <button type="submit" disabled={busy} className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          {busy ? 'Reading your site…' : 'Generate llms.txt'}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm" style={{ color: 'var(--amber)' }}>{error}</p> : null}

      {output ? (
        <div className="mt-6 rounded-xl border border-border bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="font-mono text-xs text-muted-foreground">llms.txt</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition hover:border-[var(--signal)]/50"
              >
                {copied ? <Check className="size-3.5" style={{ color: 'var(--ready)' }} /> : <Copy className="size-3.5" />} Copy
              </button>
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition hover:border-[var(--signal)]/50"
              >
                <Download className="size-3.5" /> Download
              </button>
            </span>
          </div>
          <pre className="max-h-96 overflow-auto p-4 font-mono text-[13px] leading-6 text-muted-foreground">{output}</pre>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Review the placeholders, then upload it to your site root as <span className="font-mono">/llms.txt</span>. Want the
            artifacts agents weight more heavily — JSON-LD, agent.json, a live feed?{' '}
            <a href="/scan" className="underline decoration-[var(--signal)]/50 underline-offset-2">Scan your site free</a>.
          </p>
        </div>
      ) : null}
    </div>
  )
}
