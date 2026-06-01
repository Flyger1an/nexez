'use client'

import { useState } from 'react'
import { createClient } from '../../../utils/supabase/client'

export default function TestCreatePage() {
  const [form, setForm] = useState({
    name: 'Test Business',
    slug: 'test-business-' + Date.now().toString(36).slice(-6),
    description: 'This is a test page created from the debug tool.',
    website_url: 'https://example.com',
    industry: 'Consulting & Strategy',
    prefer_original_site: false,
  })
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<any>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('Creating...')
    setResult(null)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setStatus('Error: You must be logged in')
      return
    }

    const payload = {
      owner_id: user.id,
      name: form.name,
      slug: form.slug,
      description: form.description,
      website_url: form.website_url || null,
      industry: form.industry || null,
      prefer_original_site: form.prefer_original_site,
      is_published: true,
      products: [],
      services: [],
      faqs: [],
    }

    const { data, error } = await supabase
      .from('pages')
      .insert(payload)
      .select()
      .single()

    if (error) {
      setStatus('Error: ' + error.message)
      setResult(error)
    } else {
      setStatus('Success!')
      setResult(data)
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold mb-2">Test Page Creator</h1>
        <p className="text-zinc-400 mb-8">
          Minimal form to debug page creation (especially the <code>industry</code> column).
        </p>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/10">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-black/30 border border-white/10 p-3"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Slug</label>
            <input
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
              className="w-full rounded-lg bg-black/30 border border-white/10 p-3 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Industry</label>
            <input
              value={form.industry}
              onChange={e => setForm({ ...form, industry: e.target.value })}
              className="w-full rounded-lg bg-black/30 border border-white/10 p-3"
              placeholder="Consulting & Strategy"
            />
            <p className="text-xs text-zinc-500 mt-1">This was the missing column causing the error.</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.prefer_original_site}
              onChange={e => setForm({ ...form, prefer_original_site: e.target.checked })}
              id="prefer"
            />
            <label htmlFor="prefer">Prefer original site for bookings</label>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-white text-black font-semibold py-3 hover:bg-zinc-200 transition"
          >
            Create Test Page
          </button>
        </form>

        {status && (
          <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="font-medium">{status}</p>
            {result && (
              <pre className="mt-3 text-xs overflow-auto bg-black/40 p-3 rounded">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}

        <div className="mt-8 text-xs text-zinc-500">
          After creating a page here, you can visit <code>/dashboard</code> or <code>/[slug]</code> to inspect it.
        </div>
      </div>
    </main>
  )
}