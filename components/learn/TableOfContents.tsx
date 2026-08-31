import type { ArticleHeading } from '../../lib/learn-headings'

// Contents for a /learn article, derived from its h2 blocks rather than hand
// maintained, so it cannot drift from the page. Two presentations of the same
// list: a sticky rail from xl up, where there is column to spare, and a closed
// <details> above the article on smaller screens, which costs one line of height
// until someone wants it. No JavaScript in either.

export function TableOfContentsRail({ headings }: { headings: ArticleHeading[] }) {
  if (headings.length < 3) return null
  return (
    <nav aria-labelledby="toc-rail-heading" className="sticky top-24">
      <p
        id="toc-rail-heading"
        className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
      >
        On this page
      </p>
      <ol className="mt-3 space-y-2 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className="-ml-px block border-l border-transparent py-0.5 pl-3 text-sm leading-snug text-muted-foreground transition hover:border-l-[var(--signal)] hover:text-[var(--fg)]"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function TableOfContentsInline({ headings }: { headings: ArticleHeading[] }) {
  if (headings.length < 3) return null
  return (
    <details className="mt-8 rounded-lg border border-border bg-white/[0.02] p-4 xl:hidden">
      <summary className="cursor-pointer text-sm font-medium">
        On this page
        <span className="ml-2 text-xs font-normal text-muted-foreground">{headings.length} sections</span>
      </summary>
      <ol className="mt-3 space-y-2">
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className="text-sm leading-snug text-muted-foreground transition hover:text-[var(--fg)]">
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </details>
  )
}
