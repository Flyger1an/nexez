'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Globe2, Puzzle, Rocket, ShieldCheck } from 'lucide-react'
import type { AgentPage } from '../../lib/agent-page'
import { buildAgentReadyKit, buildRedirectRecipes, buildCodeInjectionRecipes, type RecipeBlock, type InjectionRecipe } from '../../lib/agent-ready-kit'
import {
  generateWebsiteVerificationToken,
  verificationMetaTag,
  verificationTxtHost,
  websiteHostOf,
  WELL_KNOWN_VERIFY_PATH,
} from '../../lib/website-verification'

/**
 * "Your website" — prove you own your EXISTING site (DNS TXT / meta tag / well-known
 * file, no DNS pointing required) and get the copy-paste Agent-Ready Kit. Self-loads
 * the pending token from settings-context; all writes go through the collaborator-safe
 * secrets + verify routes. The kit is always visible/copyable (public-data-derived);
 * verification only flips the ✓ state + the onboarding step.
 */

type Method = 'dns' | 'meta' | 'file'

export function WebsitePanel({
  pageId,
  page,
  onMessage,
  onVerified,
}: {
  pageId: string
  page: AgentPage
  onMessage: (msg: string) => void
  onVerified: (verifiedAt: string, method: Method) => void
}) {
  const [token, setToken] = useState('')
  const [method, setMethod] = useState<Method>('dns')
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const host = websiteHostOf(page.website_url)
  const verifiedAt = page.website_verified_at ?? null
  const verifiedMethod = page.website_verified_method ?? null
  const kit = useMemo(() => buildAgentReadyKit(page), [page])
  const recipes = useMemo(() => buildRedirectRecipes(page), [page])
  const [recipeTab, setRecipeTab] = useState<RecipeBlock['id']>('apache')
  const recipe = recipes.find((r) => r.id === recipeTab) ?? recipes[0]

  // Hosted site builders (Wix/Squarespace) can't add redirects or /.well-known —
  // they inject a <head> snippet instead.
  const injectionRecipes = useMemo(() => buildCodeInjectionRecipes(page), [page])
  const [injectionTab, setInjectionTab] = useState<InjectionRecipe['id']>('wix')
  const injectionRecipe = injectionRecipes.find((r) => r.id === injectionTab) ?? injectionRecipes[0]

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pages/${pageId}/settings-context`)
      if (!res.ok) return
      const json = await res.json()
      if (typeof json?.secrets?.website_verification_token === 'string') {
        setToken(json.secrets.website_verification_token)
      }
    } catch {
      /* non-fatal */
    }
  }, [pageId])

  useEffect(() => {
    load()
  }, [load])

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200)
    } catch {
      onMessage('Copy failed — select and copy manually.')
    }
  }

  async function generateToken() {
    if (!host) {
      onMessage('Add your website URL in the General section above first.')
      return
    }
    setBusy(true)
    try {
      const t = generateWebsiteVerificationToken()
      const res = await fetch(`/api/pages/${pageId}/secrets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ website_verification_token: t }),
      })
      if (!res.ok) {
        onMessage('Could not save the verification token. Try again.')
        return
      }
      setToken(t)
      onMessage('Token ready. Add it to your site with one of the methods below, then Verify.')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    try {
      const res = await fetch(`/api/pages/${pageId}/verify-website`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.verified) {
        setToken('')
        onVerified(data.verifiedAt, method)
        onMessage(`Verified — ${data.host} is confirmed as yours.`)
      } else if (res.ok) {
        onMessage(data?.message || 'Not verified yet — give DNS/CDN a minute and retry.')
      } else {
        onMessage(data?.error || 'Verification failed. Check the record and retry.')
      }
    } finally {
      setBusy(false)
    }
  }

  const metaTag = token ? verificationMetaTag(token) : ''
  const txtRecord = token && host ? `${verificationTxtHost(host)}  TXT  "${token}"` : ''

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Globe2 className="size-4 text-[var(--fg-muted)]" />
        <span className="font-semibold">Your website</span>
      </div>

      {/* Status */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
        {!host ? (
          <p className="text-[var(--fg-muted)]">Add your website URL in the General section above to verify it and generate your Agent-Ready Kit.</p>
        ) : verifiedAt ? (
          <p className="flex items-center gap-2" style={{ color: 'var(--ready)' }}>
            <ShieldCheck className="size-4" />
            <span className="text-[var(--fg)]">
              <span className="font-medium">{host}</span> verified
              {verifiedMethod ? ` via ${verifiedMethod.toUpperCase()}` : ''} on {new Date(verifiedAt).toLocaleDateString()}
            </span>
          </p>
        ) : (
          <p className="text-[var(--fg-muted)]">
            <span className="font-medium text-[var(--fg)]">{host}</span> — not verified yet. Verify to mark it as yours (changing your website URL clears verification).
          </p>
        )}
      </div>

      {/* Verify flow (hidden once verified) */}
      {host && !verifiedAt ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          {!token ? (
            <button type="button" onClick={generateToken} disabled={busy} className="btn-secondary px-4 py-2 text-sm disabled:opacity-60">
              Generate verification token
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(['dns', 'meta', 'file'] as Method[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${method === m ? 'bg-[var(--signal)] text-black' : 'border border-white/15 text-[var(--fg-muted)]'}`}
                  >
                    {m === 'dns' ? 'DNS TXT' : m === 'meta' ? 'Meta tag' : 'File'}
                  </button>
                ))}
              </div>

              {method === 'dns' ? (
                <Artifact id="v-dns" label="Add this DNS TXT record at your domain provider:" value={txtRecord} copiedId={copiedId} onCopy={copy} />
              ) : method === 'meta' ? (
                <Artifact id="v-meta" label="Add this tag inside your site’s <head>:" value={metaTag} copiedId={copiedId} onCopy={copy} />
              ) : (
                <Artifact id="v-file" label={`Upload a file at ${WELL_KNOWN_VERIFY_PATH} containing only:`} value={token} copiedId={copiedId} onCopy={copy} />
              )}

              <button type="button" onClick={verify} disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
                {busy ? 'Verifying…' : 'Verify now'}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Serve LIVE artifacts on the merchant's own domain (the Phase-2 upgrade) */}
      <div>
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Rocket className="size-4" style={{ color: 'var(--signal)' }} /> Serve live artifacts on your own domain
        </p>
        <p className="mb-3 text-xs text-[var(--fg-muted)]">
          Add one redirect rule and agents hitting <span className="font-mono">{host || 'yoursite.com'}/.well-known/agent.json</span>,{' '}
          <span className="font-mono">/llms.txt</span> and more get your <span className="font-medium text-[var(--fg)]">live</span> listing —
          auto-updating whenever your offers change (no stale copy to maintain). Pick your stack:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRecipeTab(r.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${recipeTab === r.id ? 'bg-[var(--signal)] text-black' : 'border border-white/15 text-[var(--fg-muted)]'}`}
            >
              {r.title}
            </button>
          ))}
        </div>
        {recipe ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {recipe.title}
                  <span className="ml-2 font-mono text-xs text-[var(--fg-muted)]">{recipe.filename}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{recipe.description}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(`recipe-${recipe.id}`, recipe.content)}
                className="shrink-0 rounded-md border border-white/15 p-1.5 text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
                aria-label={`Copy ${recipe.title} recipe`}
                title="Copy"
              >
                {copiedId === `recipe-${recipe.id}` ? <Check className="size-4" style={{ color: 'var(--ready)' }} /> : <Copy className="size-4" />}
              </button>
            </div>
            <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-black/40 p-2 font-mono text-[11px] leading-5 text-[var(--fg-muted)]">
              {recipe.content}
            </pre>
          </div>
        ) : null}

        {/* WordPress: the plugin automates the redirects + JSON-LD injection server-side. */}
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Puzzle className="size-4 text-[var(--fg-muted)]" /> Using WordPress?
          </p>
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
            Install the <span className="font-medium text-[var(--fg)]">Nexez Agent-Ready</span> plugin — it injects your JSON-LD and serves
            these redirects automatically, no server config. Paste this listing slug into the plugin settings:
          </p>
          <div className="mt-2">
            <Artifact id="wp-slug" label="Your listing slug" value={page.slug} copiedId={copiedId} onCopy={copy} />
          </div>
          {token ? (
            <div className="mt-2">
              <Artifact id="wp-token" label="Verification token (optional — the plugin can serve the file-method proof)" value={token} copiedId={copiedId} onCopy={copy} />
            </div>
          ) : null}
        </div>

        {/* Hosted builders (Wix, Squarespace): no server config — inject a <head> snippet. */}
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Puzzle className="size-4 text-[var(--fg-muted)]" /> On Wix or Squarespace?
          </p>
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
            These builders don’t allow redirect rules, so paste this <span className="font-mono">&lt;head&gt;</span> snippet (your
            structured offers + manifest link) into their code-injection box instead. Pick your platform:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {injectionRecipes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setInjectionTab(r.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${injectionTab === r.id ? 'bg-[var(--signal)] text-black' : 'border border-white/15 text-[var(--fg-muted)]'}`}
              >
                {r.title}
              </button>
            ))}
          </div>
          {injectionRecipe ? (
            <div className="mt-2">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-xs text-[var(--fg-muted)]">{injectionRecipe.instructions}</p>
                <button
                  type="button"
                  onClick={() => copy(`inject-${injectionRecipe.id}`, injectionRecipe.content)}
                  className="shrink-0 rounded-md border border-white/15 p-1.5 text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
                  aria-label={`Copy ${injectionRecipe.title} snippet`}
                  title="Copy"
                >
                  {copiedId === `inject-${injectionRecipe.id}` ? <Check className="size-4" style={{ color: 'var(--ready)' }} /> : <Copy className="size-4" />}
                </button>
              </div>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-black/40 p-2 font-mono text-[11px] leading-5 text-[var(--fg-muted)]">
                {injectionRecipe.content}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      {/* Agent-Ready Kit */}
      <div>
        <p className="mb-2 text-sm font-semibold">Agent-Ready Kit</p>
        {!verifiedAt ? (
          <p className="mb-3 text-xs text-[var(--fg-muted)]">Copy these onto your site now — verifying {host || 'your site'} just adds the confirmed badge.</p>
        ) : null}
        <div className="space-y-3">
          {kit.map((block) => (
            <div key={block.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {block.title}
                    {block.filename ? <span className="ml-2 font-mono text-xs text-[var(--fg-muted)]">{block.filename}</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{block.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(block.id, block.content)}
                  className="shrink-0 rounded-md border border-white/15 p-1.5 text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
                  aria-label={`Copy ${block.title}`}
                  title="Copy"
                >
                  {copiedId === block.id ? <Check className="size-4" style={{ color: 'var(--ready)' }} /> : <Copy className="size-4" />}
                </button>
              </div>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-black/40 p-2 font-mono text-[11px] leading-5 text-[var(--fg-muted)]">
                {block.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Artifact({
  id,
  label,
  value,
  copiedId,
  onCopy,
}: {
  id: string
  label: string
  value: string
  copiedId: string | null
  onCopy: (id: string, value: string) => void
}) {
  return (
    <div>
      <p className="text-xs text-[var(--fg-muted)]">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-black/40 px-2 py-1.5 font-mono text-xs">{value}</code>
        <button
          type="button"
          onClick={() => onCopy(id, value)}
          className="shrink-0 rounded-md border border-white/15 p-1.5 text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          aria-label="Copy"
          title="Copy"
        >
          {copiedId === id ? <Check className="size-4" style={{ color: 'var(--ready)' }} /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  )
}
