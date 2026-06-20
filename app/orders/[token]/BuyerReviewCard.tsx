'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Star } from 'lucide-react'
import type { BuyerOrderReview } from '../../../lib/buyer-portal'
import { REVIEW_TAG_OPTIONS } from '../../../lib/reviews'

type ReviewResponse = {
  ok?: boolean
  error?: string
  review?: BuyerOrderReview
}

export function BuyerReviewCard({
  token,
  canReview,
  review,
  sellerName,
}: {
  token: string
  canReview: boolean
  review: BuyerOrderReview | null
  sellerName: string | null
}) {
  const [savedReview, setSavedReview] = useState<BuyerOrderReview | null>(review)
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (savedReview) {
    return (
      <section className="mt-6 card !p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <CheckCircle2 className="size-4 text-[var(--ready)]" />
              Your verified review
            </p>
            <p className="mt-1 text-sm text-zinc-400">Thanks for helping future buyers evaluate this seller.</p>
          </div>
          <RatingStars value={savedReview.rating} />
        </div>
        {savedReview.title ? <h3 className="mt-5 text-lg font-semibold text-white">{savedReview.title}</h3> : null}
        {savedReview.body ? <p className="mt-2 text-sm leading-6 text-zinc-300">{savedReview.body}</p> : null}
        {savedReview.tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {savedReview.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    )
  }

  if (!canReview) return null

  async function submit() {
    if (rating <= 2 && !body.trim()) {
      setError('Please add a short note for low ratings.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/order-portal/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          rating,
          title: title.trim(),
          body: body.trim(),
          tags,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as ReviewResponse
      if (!res.ok || !data.review) {
        setError(data.error || 'Could not save your review. Please try again.')
        return
      }
      setSavedReview(data.review)
    } catch {
      setError('Could not save your review. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mt-6 card !p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Rate your experience</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-400">
            Verified reviews help buyers and agents understand whether {sellerName || 'this seller'} delivers clearly and reliably.
          </p>
        </div>
        <RatingInput value={rating} onChange={setRating} />
      </div>

      <div className="mt-5 grid gap-4">
        <label className="block text-sm">
          <span className="text-zinc-300">Short headline</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="e.g. Clear scope and fast handoff"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--signal)]/50 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-zinc-300">What should future buyers know?</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Optional, but helpful for trust and ranking."
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[var(--signal)]/50 focus:outline-none"
          />
        </label>

        <div>
          <p className="text-sm text-zinc-300">Tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REVIEW_TAG_OPTIONS.map((tag) => {
              const active = tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags((current) => (active ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 6)))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'border-[var(--signal)]/40 bg-[var(--signal)]/15 text-[var(--signal)]'
                      : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[var(--signal)] px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Publish verified review
      </button>
    </section>
  )
}

function RatingInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onClick={() => onChange(star)}
          className="rounded-md p-1 text-[var(--amber)] transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/40"
        >
          <Star className="size-6" fill={star <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}

function RatingStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1 text-[var(--amber)]" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className="size-4" fill={star <= Math.round(value) ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}
