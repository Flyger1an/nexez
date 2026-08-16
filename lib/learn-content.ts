// The /learn content model. Articles are TYPED DATA (not freeform TSX): a single
// renderer (components/learn/ArticleRenderer) turns blocks into consistently-styled
// prose, and the same data drives metadata, Article JSON-LD, and FAQPage schema,
// so on-page copy and structured data can never diverge.

export type ArticleBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | {
      type: 'table'
      headers: string[]
      rows: string[][]
    }
  | { type: 'code'; language?: string; content: string }
  | {
      /** Highlighted aside; tone maps to the brand palette (signal=persimmon, ready=teal, amber=caution). */
      type: 'callout'
      tone: 'signal' | 'ready' | 'amber'
      title?: string
      text: string
    }
  | {
      /** Inline CTA panel linking into the product. */
      type: 'cta'
      title: string
      text: string
      href: string
      label: string
    }

export type LearnArticle = {
  slug: string
  /** ≤60 chars incl. the layout's ' · Nexez' template. */
  metaTitle: string
  /** ≤160 chars. */
  metaDescription: string
  /** On-page H1 (may differ from metaTitle). */
  title: string
  /** One-paragraph dek under the H1, also the hub-card blurb. */
  dek: string
  category: 'Agentic commerce' | 'Agent readiness' | 'Guides'
  /** ISO date surfaced on-page and in Article JSON-LD (recency is a ranking signal here). */
  publishedAt: string
  updatedAt: string
  /** ~minutes to read, shown on the hub card. */
  readMinutes: number
  blocks: ArticleBlock[]
  /** Rendered as an FAQ section AND emitted as FAQPage JSON-LD. */
  faqs: { question: string; answer: string }[]
}

// Registry: hub + [slug] routes + sitemap all read this one list.
import { agentReadinessStudy2026 } from './learn-articles/agent-readiness-study-2026'
import { sellOnChatgptWithoutShopify } from './learn-articles/sell-on-chatgpt-without-shopify'
import { aiAgentsBookServiceBusinesses } from './learn-articles/ai-agents-book-service-businesses'
import { acpEnrollmentGuide } from './learn-articles/acp-enrollment-guide'
import { ucpVsAcpVsMcp } from './learn-articles/ucp-vs-acp-vs-mcp'
import { whatIsLlmsTxt } from './learn-articles/what-is-llms-txt'
import { whatIsAgenticCommerce } from './learn-articles/what-is-agentic-commerce'
import { generativeEngineOptimization } from './learn-articles/generative-engine-optimization'
import { whatIsAnMcpServer } from './learn-articles/what-is-an-mcp-server'
import { getRecommendedByChatgpt } from './learn-articles/get-recommended-by-chatgpt'
import { jsonLdForAiAgents } from './learn-articles/json-ld-for-ai-agents'
import { whatIsAgentJson } from './learn-articles/what-is-agent-json'
import { whatIsGoogleUcp } from './learn-articles/what-is-google-ucp'
import { measureAiAgentTraffic } from './learn-articles/measure-ai-agent-traffic'

export const learnArticles: LearnArticle[] = [
  measureAiAgentTraffic,
  whatIsGoogleUcp,
  whatIsAgentJson,
  agentReadinessStudy2026,
  aiAgentsBookServiceBusinesses,
  sellOnChatgptWithoutShopify,
  acpEnrollmentGuide,
  ucpVsAcpVsMcp,
  whatIsLlmsTxt,
  whatIsAgenticCommerce,
  generativeEngineOptimization,
  whatIsAnMcpServer,
  getRecommendedByChatgpt,
  jsonLdForAiAgents,
]

export function getLearnArticle(slug: string): LearnArticle | undefined {
  return learnArticles.find((a) => a.slug === slug)
}
