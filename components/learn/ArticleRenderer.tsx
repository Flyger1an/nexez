import type { ReactNode } from 'react'
import type { ArticleBlock, LearnArticle } from '../../lib/learn-content'

// Server-only renderer for the typed /learn article blocks — one place owns the
// prose styling so every article stays consistent.

// The ONLY inline syntax articles may use: markdown links `[label](href)`.
// Everything else in text is rendered verbatim (no HTML — content is data).
function withLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const external = /^https?:\/\//.test(m[2])
    parts.push(
      <a
        key={m.index}
        href={m[2]}
        className="underline decoration-[var(--signal)]/50 underline-offset-2 transition hover:decoration-[var(--signal)]"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {m[1]}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const toneColor: Record<'signal' | 'ready' | 'amber', string> = {
  signal: 'var(--signal)',
  ready: 'var(--ready)',
  amber: 'var(--amber)',
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="mt-12 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">{block.text}</h2>
    case 'h3':
      return <h3 className="mt-8 text-xl font-semibold tracking-[-0.02em]">{block.text}</h3>
    case 'p':
      return <p className="mt-4 leading-7 text-muted-foreground">{withLinks(block.text)}</p>
    case 'ul':
      return (
        <ul className="mt-4 list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
          {block.items.map((item) => (
            <li key={item}>{withLinks(item)}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="mt-4 list-decimal space-y-2 pl-6 leading-7 text-muted-foreground">
          {block.items.map((item) => (
            <li key={item}>{withLinks(item)}</li>
          ))}
        </ol>
      )
    case 'table':
      return (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-white/[0.03] text-left">
                {block.headers.map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 text-muted-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'code':
      return (
        <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-black/40 p-4 font-mono text-[13px] leading-6">
          {block.content}
        </pre>
      )
    case 'callout':
      return (
        <div
          className="mt-5 rounded-lg border p-4"
          style={{ borderColor: `color-mix(in srgb, ${toneColor[block.tone]} 35%, transparent)`, background: `color-mix(in srgb, ${toneColor[block.tone]} 7%, transparent)` }}
        >
          {block.title ? <p className="text-sm font-semibold">{block.title}</p> : null}
          <p className={`text-sm leading-6 text-muted-foreground ${block.title ? 'mt-1' : ''}`}>{withLinks(block.text)}</p>
        </div>
      )
    case 'cta':
      return (
        <div className="mt-8 rounded-xl border border-[var(--signal)]/25 bg-[var(--signal)]/[0.06] p-5">
          <p className="font-semibold">{block.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{block.text}</p>
          <a href={block.href} className="btn-primary btn-sm mt-4 inline-flex">
            {block.label}
          </a>
        </div>
      )
  }
}

export function ArticleRenderer({ article }: { article: LearnArticle }) {
  return (
    <>
      {article.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
      {article.faqs.length ? (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Frequently asked questions</h2>
          <div className="mt-5 space-y-4">
            {article.faqs.map((faq) => (
              <div key={faq.question} className="rounded-lg border border-border bg-white/[0.02] p-4">
                <h3 className="font-medium">{faq.question}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{withLinks(faq.answer)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
