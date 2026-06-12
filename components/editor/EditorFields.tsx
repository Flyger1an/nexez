import { normalizeSlug } from '../../lib/agent-page'
import { Field, inputClass, textareaClass } from './Field'
import { PageEditor } from './usePageEditor'

const industries = [
  'Consulting & Strategy', 'Coaching & Training', 'Creative & Design', 'Legal & Professional Services', 'Marketing & Sales',
  'Home Services (Plumbing, Electrical, Cleaning, etc.)', 'Wellness & Fitness (Massage, Personal Training, Yoga, etc.)',
  'Beauty & Personal Care', 'Automotive Services', 'Pet Care & Services', 'Health & Medical', 'Events & Experiences', 'Other Local Services',
]

export function EditorFields({ e }: { e: PageEditor }) {
  const industry = e.industry
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Business or offer name">
          <input value={e.name} onChange={(event) => e.setName(event.target.value)} className={inputClass} required />
        </Field>
        <Field label="Public slug">
          <input value={e.slug} onChange={(event) => e.setSlug(normalizeSlug(event.target.value))} className={inputClass} required />
        </Field>
      </div>

      <Field label="Short AI summary">
        <textarea value={e.description} onChange={(event) => e.setDescription(event.target.value)} className={textareaClass} required />
        <button
          type="button"
          onClick={e.enhanceDescriptionWithAI}
          className="mt-2 rounded-lg border border-[var(--signal)]/40 px-3 py-1 text-xs text-[var(--signal)] hover:bg-[var(--signal)]/10"
        >
          Enhance for AI agents
        </button>
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Main website">
          <input type="url" value={e.websiteUrl} onChange={(event) => e.setWebsiteUrl(event.target.value)} className={inputClass} required />
        </Field>
        <Field label="Purchase or booking URL">
          <input type="url" value={e.ctaUrl} onChange={(event) => e.setCtaUrl(event.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="CTA label">
          <input value={e.ctaLabel} onChange={(event) => e.setCtaLabel(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Best-fit buyer">
          <input value={e.audience} onChange={(event) => e.setAudience(event.target.value)} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Location or service area">
          <input value={e.location} onChange={(event) => e.setLocation(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Contact email">
          <input type="email" value={e.contactEmail} onChange={(event) => e.setContactEmail(event.target.value)} className={inputClass} />
        </Field>

        <Field label="Next available (for AI agents)">
          <input value={e.nextAvailable} onChange={(event) => e.setNextAvailable(event.target.value)} className={inputClass} placeholder="e.g. This week, or specific date" />
        </Field>

        <Field label="Industry / Category">
          <select value={industry} onChange={(event) => e.setIndustry(event.target.value)} className={inputClass}>
            <option value="">Select industry...</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={e.preferOriginalSite}
            onChange={(event) => e.setPreferOriginalSite(event.target.checked)}
            className="size-4 accent-[var(--signal)]"
          />
          <span>Prefer linking bookings to my original website</span>
        </label>
        <p className="mt-1.5 text-xs text-[#9CA3AF]">
          When enabled, "Book Now" buttons will direct agents and customers to your main site instead of Nexez checkout.
        </p>
      </div>

      {industry &&
        (industry.toLowerCase().includes('home') ||
          industry.toLowerCase().includes('fitness') ||
          industry.toLowerCase().includes('wellness') ||
          industry.toLowerCase().includes('beauty') ||
          industry.toLowerCase().includes('pet') ||
          industry.toLowerCase().includes('automotive')) && (
          <div className="rounded-xl border border-[var(--signal)]/20 bg-[#1A1625] p-4">
            <div className="text-sm font-medium text-[var(--signal)] mb-2">Consumer / Local Services</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>Duration, Service Area, Mobile, Travel Fee fields are available in each offer card below.</div>
            </div>
          </div>
        )}
    </>
  )
}
