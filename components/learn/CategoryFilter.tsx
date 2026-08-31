import { LEARN_CATEGORIES, learnArticles, type LearnArticle } from '../../lib/learn-content'

// Category filter for the hub.
//
// Links, not buttons: the state lives in the URL the way /discovery already does
// it, so every filtered view is a real crawlable page, works with JavaScript off,
// and survives a back button. Styling comes from `.platform-tablist` /
// `.platform-tab`, which already key their selected state off aria-current="page",
// so this needs no CSS of its own. The `-grid` variant wraps instead of scrolling
// sideways, which keeps it inside the no-horizontal-scroller rule.

export function CategoryFilter({ active }: { active?: LearnArticle['category'] }) {
  const counts = new Map<string, number>()
  for (const a of learnArticles) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)

  const tabs: { label: string; href: string; count: number; on: boolean }[] = [
    { label: 'All guides', href: '/learn', count: learnArticles.length, on: !active },
    ...LEARN_CATEGORIES.map((c) => ({
      label: c,
      href: `/learn?category=${encodeURIComponent(c)}`,
      count: counts.get(c) ?? 0,
      on: active === c,
    })),
  ]

  return (
    <nav aria-label="Filter guides by category">
      <div className="platform-tablist platform-tab-grid">
        {tabs.map((t) => (
          <a key={t.href} href={t.href} className="platform-tab" aria-current={t.on ? 'page' : undefined}>
            {t.label}
            <span className="ml-1.5 text-[11px] opacity-60">{t.count}</span>
          </a>
        ))}
      </div>
    </nav>
  )
}
