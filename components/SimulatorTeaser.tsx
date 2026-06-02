'use client'

import { useState } from 'react'

type SimulationResult = {
  schema: {
    page: {
      name: string
      summary: string
      audience: string
      offers: Array<{
        name: string
        price: string | null
        description: string | null
        checkoutUrl: string
      }>
    }
    suggestedActions: string[]
  }
  recommendations: string[]
  naturalLanguage: string
}

export function SimulatorTeaser() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'natural' | 'structured'>('natural')

  const presetQueries = [
    "Can an AI agent book a 60-minute session next week?",
    "What does this company actually offer?",
    "Is this good for scaling startups?",
    "How much does strategy work cost here?",
  ]

  const handleSimulate = async (customQuery?: string) => {
    const q = (customQuery || query).trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/public-simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Simulation failed')
      }

      setResult({
        schema: data.schema,
        recommendations: data.recommendations,
        naturalLanguage: data.naturalLanguage,
      })
      if (!customQuery) setQuery(q) // keep user query if they typed it
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-wrap gap-2 mb-3">
        {presetQueries.map((q, index) => (
          <button
            key={index}
            onClick={() => handleSimulate(q)}
            disabled={loading}
            className="text-xs px-3 py-1 rounded-full border border-white/15 hover:bg-white/5 text-[#9CA3AF] disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask an AI-style question..."
          className="flex-1 input text-base"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSimulate()
          }}
          disabled={loading}
        />
        <button 
          onClick={() => handleSimulate()}
          disabled={loading || !query.trim()}
          className="btn-primary px-8 disabled:opacity-60"
        >
          {loading ? 'Analyzing...' : 'Simulate'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-left">
          {/* Tabs for realistic agent experience */}
          <div className="flex gap-1 mb-4 border-b border-white/10">
            <button
              onClick={() => setActiveTab('natural')}
              className={`px-4 py-1.5 text-sm font-medium transition ${activeTab === 'natural' ? 'text-white border-b-2 border-[#7C3AED]' : 'text-[#9CA3AF] hover:text-white'}`}
            >
              How an agent would think
            </button>
            <button
              onClick={() => setActiveTab('structured')}
              className={`px-4 py-1.5 text-sm font-medium transition ${activeTab === 'structured' ? 'text-white border-b-2 border-[#7C3AED]' : 'text-[#9CA3AF] hover:text-white'}`}
            >
              Structured (what agents parse)
            </button>
          </div>

          {activeTab === 'natural' && (
            <>
              <p className="text-[#9CA3AF] leading-relaxed mb-4">{result.naturalLanguage}</p>
              <div className="text-sm text-[#C4B5FD] mb-2">Recommended next steps for the agent:</div>
              <ul className="text-sm space-y-1 text-[#9CA3AF]">
                {result.schema.suggestedActions.map((action, i) => (
                  <li key={i}>→ {action}</li>
                ))}
              </ul>
            </>
          )}

          {activeTab === 'structured' && (
            <>
              <h4 className="text-xl font-semibold tracking-tight mb-1">
                {result.schema.page.name}
              </h4>
              <p className="text-[#9CA3AF] text-sm mb-4">{result.schema.page.summary}</p>

              <div className="text-sm text-[#C4B5FD] mb-2">Best fit for:</div>
              <p className="text-sm mb-4">{result.schema.page.audience}</p>

              <div className="text-sm text-[#C4B5FD] mb-2">Offers the agent can immediately act on:</div>
              <div className="space-y-1.5 mb-4">
                {result.schema.page.offers.map((offer, i) => (
                  <div key={i} className="flex justify-between items-center text-sm border-b border-white/10 pb-1.5 last:border-0">
                    <span className="font-medium">{offer.name}</span>
                    <span className="text-[#00F5FF] font-mono text-xs">{offer.price || 'Custom'}</span>
                  </div>
                ))}
              </div>

              <div className="text-sm text-[#C4B5FD] mb-2">Recommended Agent Actions:</div>
              <ul className="text-sm space-y-1 text-[#9CA3AF]">
                {result.schema.suggestedActions.map((action, i) => (
                  <li key={i}>→ {action}</li>
                ))}
              </ul>
            </>
          )}

          {result.recommendations.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/10">
              <div className="text-xs uppercase tracking-widest text-amber-300 mb-2">Quick wins to improve this page for agents</div>
              <ul className="text-xs text-[#9CA3AF] space-y-1">
                {result.recommendations.slice(0, 3).map((rec, i) => (
                  <li key={i}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Strong conversion hook */}
          <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3 items-center">
            <a href="/create" className="btn-primary text-sm px-6 py-2 flex-1 sm:flex-none text-center">
              Create a page like this
            </a>
            <a href="/dashboard/[id]/test" className="text-sm text-[#00F5FF] hover:underline">
              Open full simulator →
            </a>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-[#9CA3AF]">
        Powered by the same deterministic simulation engine used in the full Agent Simulator. <a href="/simulator" className="underline">Open full global simulator →</a>
      </p>
    </div>
  )
}

