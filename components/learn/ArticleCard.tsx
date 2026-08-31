import { ArrowRight } from 'lucide-react'
import { cardSummaryOf, type LearnArticle } from '../../lib/learn-content'

// One card, three sizes. Every /learn surface renders through this, so a change
// to how an article presents itself lands everywhere at once. Built on `.nx-tile`,
// the glass primitive the rest of the marketing site uses, rather than the
// one-off card /learn carried before.

type Variant = 'featured' | 'shelf' | 'related'

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function ArticleCard({
  article,
  variant = 'shelf',
  showCategory = true,
}: {
  article: LearnArticle
  variant?: Variant
  showCategory?: boolean
}) {
  const href = `/learn/${article.slug}`
  const summary = cardSummaryOf(article)

  if (variant === 'featured') {
    return (
      <a
        href={href}
        className="nx-tile group grid gap-6 p-6 transition md:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center"
      >
        <div>
          <span
            className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em]"
            style={{ borderColor: 'color-mix(in srgb, var(--signal) 40%, transparent)', color: 'var(--signal)' }}
          >
            Original research
          </span>
          <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.035em] md:text-3xl" style={{ textWrap: 'balance' }}>
            {article.title}
          </h3>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{summary}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--signal)' }}>
            Read the study
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-white/[0.02] p-4 lg:grid-cols-1 lg:gap-3">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Category</dt>
            <dd className="mt-1 text-sm font-medium">{article.category}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Read time</dt>
            <dd className="mt-1 text-sm font-medium">{article.readMinutes} min</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Updated</dt>
            <dd className="mt-1 text-sm font-medium">{formatDate(article.updatedAt)}</dd>
          </div>
        </dl>
      </a>
    )
  }

  if (variant === 'related') {
    return (
      <a href={href} className="nx-tile group flex flex-col gap-2 p-4 transition">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--signal)' }}>
          {article.category}
        </span>
        <h3 className="text-base font-semibold leading-snug tracking-[-0.02em]">{article.title}</h3>
        <p className="flex-1 text-sm leading-6 text-muted-foreground">{summary}</p>
        <span className="text-xs text-muted-foreground">{article.readMinutes} min read</span>
      </a>
    )
  }

  return (
    <a href={href} className="nx-tile group flex flex-col p-5 transition">
      {showCategory ? (
        <span className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--signal)' }}>
          {article.category}
        </span>
      ) : null}
      <h3 className={`text-lg font-semibold leading-snug tracking-[-0.02em] ${showCategory ? 'mt-2.5' : ''}`}>
        {article.title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{summary}</p>
      <span className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {formatDate(article.updatedAt)}
          {' · '}
          {article.readMinutes} min
        </span>
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" style={{ color: 'var(--signal)' }} />
      </span>
    </a>
  )
}
