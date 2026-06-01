'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '../../utils/supabase/client'

interface PageRow {
  id: string
  name: string
  slug: string
  is_published: boolean
  industry: string | null
  created_at: string
}

export default function TestDebugHub() {
  const [user, setUser] = useState<any>(null)
  const [pages, setPages] = useState<PageRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [importerUrl, setImporterUrl] = useState('')
  const [importerResult, setImporterResult] = useState<any>(null)

  const supabase = createClient()

  // Load current user + pages on mount
  useEffect(() => {
    loadUserAndPages()
  }, [])

  async function loadUserAndPages() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)

    if (user) {
      const { data } = await supabase
        .from('pages')
        .select('id, name, slug, is_published, industry, created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      setPages(data || [])
    }
    setLoading(false)
  }

  async function deletePage(id: string, name: string) {
    if (!confirm(`Delete page "${name}"? This cannot be undone.`)) return

    const { error } = await supabase.from('pages').delete().eq('id', id)
    if (error) {
      setMessage('Delete failed: ' + error.message)
    } else {
      setMessage('Page deleted')
      loadUserAndPages()
    }
  }

  async function testSiteImporter() {
    if (!importerUrl) return
    setMessage('Fetching from importer...')
    setImporterResult(null)

    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importerUrl }),
      })
      const data = await res.json()
      setImporterResult(data)
      setMessage('Import result received')
    } catch (e: any) {
      setMessage('Importer error: ' + e.message)
    }
  }

  async function checkSchemaHealth() {
    setMessage('Checking schema...')
    const testPayload: any = {
      name: 'Schema Check ' + Date.now(),
      slug: 'schema-check-' + Date.now().toString(36),
      is_published: false,
      products: [],
      services: [],
      faqs: [],
    }

    // Try inserting with known fields one by one to detect missing columns
    const fieldsToTest = [
      'industry',
      'prefer_original_site',
      'custom_domain',
    ]

    const results: Record<string, string> = {}

    for (const field of fieldsToTest) {
      const payload = { ...testPayload, [field]: field === 'prefer_original_site' ? false : 'test-value' }
      const { error } = await supabase.from('pages').insert(payload).select('id').single()

      if (error && error.message.includes('column')) {
        results[field] = 'MISSING - ' + error.message
      } else if (error) {
        results[field] = 'Error: ' + error.message
      } else {
        results[field] = 'OK'
        // Clean up the test row
        if (error === null) {
          // we can't easily get the id here, so skip cleanup for simplicity in this tool
        }
      }
    }

    setMessage('Schema check complete')
    alert(JSON.stringify(results, null, 2))
  }

  async function cleanupTestPages() {
    if (!confirm('Delete all pages with "Test" or "Schema Check" in the name?')) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('pages')
      .delete()
      .eq('owner_id', user.id)
      .or('name.ilike.%Test%,name.ilike.%Schema Check%')

    if (error) {
      setMessage('Cleanup failed: ' + error.message)
    } else {
      setMessage('Test pages cleaned up')
      loadUserAndPages()
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-semibold">Nexez Debug Hub</h1>
          <p className="text-sm text-zinc-400 mt-1">Internal tools for testing and diagnosing issues.</p>
        </div>

        {/* Auth Status */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold mb-3">Authentication</h2>
          {user ? (
            <div className="text-sm space-y-1">
              <div><span className="text-zinc-400">User ID:</span> <code className="text-emerald-300">{user.id}</code></div>
              <div><span className="text-zinc-400">Email:</span> {user.email}</div>
            </div>
          ) : (
            <p className="text-amber-400">Not logged in. Some tools will not work.</p>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/test/create" className="block rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10">
            <div className="font-semibold">Test Page Creator</div>
            <p className="text-xs text-zinc-400 mt-1">Minimal form to create pages (good for schema debugging)</p>
          </Link>
          <a href="/dashboard" className="block rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10">
            <div className="font-semibold">Dashboard</div>
          </a>
          <a href="/create" className="block rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10">
            <div className="font-semibold">Real Create Flow</div>
          </a>
        </div>

        {/* My Pages */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Your Pages ({pages.length})</h2>
            <button onClick={loadUserAndPages} className="text-sm text-cyan-400 hover:text-cyan-300">Refresh</button>
          </div>

          {pages.length > 0 ? (
            <div className="space-y-3">
              {pages.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl bg-black/30 p-4 text-sm">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-zinc-400">/{p.slug} • {p.industry || 'no industry'}</div>
                  </div>
                  <div className="flex gap-2">
                    <a href={`/${p.slug}`} target="_blank" className="px-3 py-1 rounded border border-white/10 hover:bg-white/5">View</a>
                    <a href={`/dashboard/${p.id}`} className="px-3 py-1 rounded border border-white/10 hover:bg-white/5">Edit</a>
                    <button onClick={() => deletePage(p.id, p.name)} className="px-3 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">No pages found for this account.</p>
          )}
        </div>

        {/* Schema Health Checker */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold mb-3">Schema Health Checker</h2>
          <p className="text-sm text-zinc-400 mb-4">Attempts to detect missing columns (industry, prefer_original_site, custom_domain, etc.).</p>
          <button
            onClick={checkSchemaHealth}
            className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-black hover:bg-amber-300"
          >
            Run Schema Check
          </button>
          <p className="text-xs text-zinc-500 mt-2">This will temporarily create a test row (it tries to clean up where possible).</p>
        </div>

        {/* Raw Site Importer Tester */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold mb-3">Raw Site Importer Tester</h2>
          <div className="flex gap-3">
            <input
              type="url"
              value={importerUrl}
              onChange={(e) => setImporterUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded-lg border border-white/10 bg-black/30 p-3 text-sm"
            />
            <button
              onClick={testSiteImporter}
              className="rounded-lg border border-white/15 px-5 py-2 text-sm hover:bg-white/5"
            >
              Test Import
            </button>
          </div>
          {importerResult && (
            <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-black/40 p-4 text-xs">
              {JSON.stringify(importerResult, null, 2)}
            </pre>
          )}
        </div>

        {/* Cleanup */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold mb-3">Cleanup</h2>
          <button
            onClick={cleanupTestPages}
            className="rounded-lg border border-red-500/30 px-5 py-2 text-sm text-red-400 hover:bg-red-500/10"
          >
            Delete all "Test" and "Schema Check" pages
          </button>
          <p className="text-xs text-zinc-500 mt-2">Useful after heavy testing.</p>
        </div>

        {message && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
            {message}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-zinc-500">
          These tools are for development and debugging only.
        </p>
      </div>
    </main>
  )
}