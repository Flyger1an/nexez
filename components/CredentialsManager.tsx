'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import type { CredentialRecord } from '../lib/agent-page'

type Doc = string | CredentialRecord

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  verified: { label: 'Reviewed ✓', cls: 'bg-[var(--ready)]/15 text-[var(--ready)]' },
  pending: { label: 'Pending review', cls: 'bg-[var(--amber)]/15 text-[var(--amber)]' },
  rejected: { label: 'Not accepted', cls: 'bg-red-500/15 text-red-400' },
}

// Owner-facing credential manager: upload a document → it's LLM-reviewed →
// only 'verified' docs boost the trust score. Owners can optionally expose a
// reviewed document publicly (per credential).
export function CredentialsManager({
  pageId,
  docs,
  onChange,
}: {
  pageId: string
  docs: Doc[]
  onChange: (docs: Doc[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('pageId', pageId)
      body.append('file', file)
      const res = await fetch('/api/credentials', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Upload failed.')
        return
      }
      onChange([...docs, data.credential as CredentialRecord])
    } catch {
      setError('Network error uploading the credential.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function togglePublic(rec: CredentialRecord, next: boolean) {
    onChange(docs.map((d) => (typeof d === 'object' && d.id === rec.id ? { ...d, public: next } : d)))
    await fetch('/api/credentials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, id: rec.id, public: next }),
    }).catch(() => {})
  }

  async function remove(doc: Doc) {
    if (typeof doc === 'string') {
      onChange(docs.filter((d) => d !== doc))
      return
    }
    onChange(docs.filter((d) => !(typeof d === 'object' && d.id === doc.id)))
    await fetch(`/api/credentials?pageId=${encodeURIComponent(pageId)}&id=${encodeURIComponent(doc.id)}`, {
      method: 'DELETE',
    }).catch(() => {})
  }

  return (
    <div>
      <div className="text-xs mb-1">Credentials / licenses (uploaded &amp; reviewed)</div>

      <div className="space-y-2">
        {docs.length === 0 && <span className="text-[10px] text-[var(--fg-muted-2)]">None uploaded yet</span>}
        {docs.map((doc, i) => {
          const isRec = typeof doc === 'object'
          const status = isRec ? doc.status : 'self-reported'
          const style = isRec ? STATUS_STYLE[doc.status] : null
          return (
            <div key={isRec ? doc.id : `s-${i}`} className="rounded-lg border border-[var(--bd-10)] bg-[var(--panel)]/50 p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{isRec ? doc.name : doc}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${style?.cls ?? 'bg-white/10 text-[var(--fg-muted)]'}`}>
                  {style?.label ?? 'Self-reported'}
                </span>
                <button type="button" onClick={() => remove(doc)} className="shrink-0 text-[var(--fg-muted-2)] hover:text-red-400" aria-label="Remove credential" title="Remove credential">
                  <X className="size-3.5" />
                </button>
              </div>
              {isRec && doc.verdict?.reason ? (
                <p className="mt-1 text-[10px] text-[var(--fg-muted-2)]">{doc.verdict.reason}</p>
              ) : null}
              {isRec && doc.status === 'verified' ? (
                <label className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--fg-muted)]">
                  <input type="checkbox" checked={!!doc.public} onChange={(e) => togglePublic(doc, e.target.checked)} />
                  Show this document publicly (a view link appears on your agent listing)
                </label>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {busy ? 'Reviewing…' : 'Upload credential'}
        </button>
        <span className="text-[10px] text-[var(--fg-muted-2)]">PNG/JPEG/WebP or PDF, max 8MB</span>
      </div>
      {error ? <p className="mt-1 text-[10px] text-red-400">{error}</p> : null}
      <p className="mt-1.5 text-[10px] text-[var(--fg-muted-2)]">
        Each upload is reviewed by an LLM (type, issuer, holder match, expiry). Only <span className="text-[var(--ready)]">reviewed</span> credentials
        add to your Trust Score - a self-typed name never does. Documents stay private unless you tick “show publicly.”
      </p>
    </div>
  )
}
