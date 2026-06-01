'use client'

import { useState } from 'react'
import { ArrowLeft, Bot, Loader2, ExternalLink } from 'lucide-react'

export default function ToolsPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function handleImport() {
    if (!url) return
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ error: 'Failed to analyze site' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <a href="/dashboard" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
          <ArrowLeft className="size-4" /> Back to Dashboard
        </a>

        <div className="flex items-center gap-3 mb-4">
          <Bot className="size-8 text-[#7C3AED]" />
          <h1 className="text-4xl font-semibold tracking-tight">Tools</h1>
        </div>
        <p className="text-xl text-[#9CA3AF]">Powerful tools to create agent pages faster.</p>

        {/* Site Importer */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Site Importer</h2>
            <p className="text-[#9CA3AF] mt-1">Paste any website URL and we’ll automatically extract services and generate a draft Nexez agent page.</p>
          </div>

          <div className="flex gap-4">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourbusiness.com"
              className="flex-1 input"
            />
            <button
              onClick={handleImport}
              disabled={loading || !url}
              className="btn-primary"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : 'Analyze & Generate'}
            </button>
          </div>

          {result && (
            <div className="mt-8 rounded-xl border border-white/10 bg-black/30 p-6">
              {result.error ? (
                <p className="text-red-400">{result.error}</p>
              ) : (
                <>
                  <p className="text-emerald-400 font-medium mb-2">Analysis complete</p>
                  <p className="text-sm text-zinc-400 mb-4">{result.message}</p>

                  <div className="flex gap-3">
                    <a href="/create" className="btn-primary">
                      Open in Page Builder
                    </a>
                    <a 
                      href={result.suggestedPage?.website_url} 
                      target="_blank" 
                      className="btn-secondary"
                    >
                      View Original Site <ExternalLink className="size-4" />
                    </a>
                  </div>

                  {result.structuredOffers && (
                    <div className="mt-6">
                      <p className="text-xs uppercase tracking-widest text-[#9CA3AF] mb-2">Detected Services</p>
                      <div className="space-y-2">
                        {result.structuredOffers.slice(0, 6).map((offer: any, i: number) => (
                          <div key={i} className="text-sm bg-white/[0.03] p-3 rounded">
                            <span className="font-medium">{offer.name}</span> — {offer.price}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 p-5">
            <div className="font-semibold mb-2">Future Tools (Coming Soon)</div>
            <ul className="text-sm text-[#9CA3AF] space-y-1">
              <li>• Bulk Calendly / Acuity import</li>
              <li>• CSV + Website hybrid import</li>
              <li>• AI-powered full site summarization</li>
              <li>• Competitor page analysis</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  )
}
