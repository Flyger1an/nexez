'use client'

import { useState } from 'react'
import { planAllows, type PlanId } from '../../lib/billing'
import { ProBadge } from '../billing/PlanGate'
import { createClient } from '../../utils/supabase/client'
import { SettingRow, SettingsSwitch } from './SettingsPrimitives'

/**
 * C10 white-label branding: brand name, accent colour, logo, and the Nexez
 * attribution toggle, applied to the public listing (most visibly on a custom
 * domain).
 *
 * The four values are OWNED BY THE PARENT because saveSettings persists them
 * alongside the rest of the listing, and a stray edit here must stay staged
 * until the owner saves. Everything transient (the in-flight upload) and every
 * side effect (Storage upload, logo detection) belongs to this panel.
 *
 * Extracted from the settings page, where this card sat physically between the
 * custom-domain input and the DNS record block that belongs to it.
 */

export type BrandingValues = {
  brandName: string
  accentColor: string
  logoUrl: string
  hideNexezBadge: boolean
}

export function BrandingPanel({
  pageId,
  plan,
  websiteUrl,
  values,
  onChange,
  onMessage,
}: {
  /** Used only to namespace the uploaded object; 'new' before the listing exists. */
  pageId: string
  plan: PlanId
  /** Source for one-click logo detection; the button is disabled without it. */
  websiteUrl: string
  values: BrandingValues
  onChange: (patch: Partial<BrandingValues>) => void
  onMessage: (message: string) => void
}) {
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const { brandName, accentColor, logoUrl, hideNexezBadge } = values

  async function handleLogoFileUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      onMessage('Please choose an image file (PNG, JPG, SVG, etc).')
      return
    }
    setUploadingLogo(true)
    onMessage('')
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const uid = user?.id || 'anon'
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `logos/${uid}/${pageId || 'new'}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const { data: pub } = supabase.storage.from('logos').getPublicUrl(path)
      if (pub?.publicUrl) {
        onChange({ logoUrl: pub.publicUrl })
        onMessage('Logo file uploaded. Click Save Settings to persist branding.')
      }
    } catch (err: any) {
      console.error(err)
      onMessage(
        `Logo upload failed: ${err?.message || err}. Check that logo uploads are enabled for your account, or paste a public image URL.`,
      )
    } finally {
      setUploadingLogo(false)
    }
  }

  async function oneClickDetectLogo() {
    if (!websiteUrl) {
      onMessage('Add a Website URL above first (in the General section) to auto-detect logo.')
      return
    }
    setUploadingLogo(true)
    onMessage('')
    try {
      const res = await fetch('/api/tools/import-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Import failed')
      const logo = data.suggestedPage?.logo_url
      if (logo) {
        onChange({ logoUrl: logo })
        onMessage('Logo detected from your website. Save settings to apply it.')
      } else {
        onMessage('No logo found on that site. Upload a file or paste an image URL instead.')
      }
    } catch (err: any) {
      onMessage(`Logo detection failed: ${err?.message || err}`)
    } finally {
      setUploadingLogo(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3" data-testid="branding-panel">
      <p className="flex items-center gap-2 text-[11px] font-medium text-zinc-200">
        Branding / White-label
        {!planAllows(plan, 'whiteLabel') && <ProBadge feature="whiteLabel" />}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">
        Applied to the public listing (especially on your custom domain).
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-[11px]">
          <span className="text-zinc-400">Brand name</span>
          <input
            value={brandName}
            onChange={(e) => onChange({ brandName: e.target.value })}
            placeholder="Apex Plumbing Co."
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-[11px]">
          <span className="text-zinc-400">Accent color (hex)</span>
          <input
            value={accentColor}
            onChange={(e) => onChange({ accentColor: e.target.value })}
            placeholder="#7C3AED"
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-[11px] sm:col-span-2">
          <span className="text-zinc-400">Logo URL (https)</span>
          <input
            value={logoUrl}
            onChange={(e) => onChange({ logoUrl: e.target.value })}
            placeholder="https://apexplumbing.com/logo.svg"
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[10px] hover:bg-white/5">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingLogo}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleLogoFileUpload(f)
                  // reset input so same file can be re-chosen
                  e.target.value = ''
                }}
              />
              {uploadingLogo ? 'Uploading…' : '📁 Upload logo file'}
            </label>
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo preview" className="h-6 w-auto rounded border border-white/10" />
            )}
            {logoUrl && (
              <button
                type="button"
                onClick={() => {
                  onChange({ logoUrl: '' })
                  onMessage('Logo removed - Save Settings to apply the change.')
                }}
                className="rounded border border-red-400/40 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-400/10"
              >
                Remove logo
              </button>
            )}
          </div>
          <div className="mt-1">
            <button
              type="button"
              onClick={oneClickDetectLogo}
              disabled={!websiteUrl || uploadingLogo}
              className="text-[10px] rounded border border-[var(--signal)]/40 px-2 py-0.5 text-[var(--signal)] hover:bg-[var(--signal)]/10 disabled:opacity-50"
            >
              ✨ One-click: detect logo from my website
            </button>
          </div>
          <p className="mt-0.5 text-[9px] text-zinc-500">
            Upload a logo, detect one from your website, or paste any public https image URL. Remove clears it.
          </p>
        </label>
      </div>
      <SettingRow
        label="Nexez attribution"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Hide the Nexez header link for a fully white-label listing. Saves with the listing settings.
            {!planAllows(plan, 'removeBadge') ? <ProBadge feature="removeBadge" /> : null}
          </span>
        }
        htmlFor="hide-nexez-attribution"
        className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--glass)]"
      >
        <SettingsSwitch
          id="hide-nexez-attribution"
          checked={hideNexezBadge}
          onCheckedChange={(checked) => onChange({ hideNexezBadge: checked })}
          label="Nexez attribution"
          checkedLabel="Hidden"
          uncheckedLabel="Shown"
        />
      </SettingRow>
      <p className="mt-1 text-[10px] text-zinc-500">
        Invalid colors/URLs are ignored on render (hex + http(s) only). Save to apply.
      </p>
    </div>
  )
}
