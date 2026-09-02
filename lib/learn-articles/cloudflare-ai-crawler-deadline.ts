import type { LearnArticle } from '../learn-content'

export const cloudflareAiCrawlerDeadline: LearnArticle = {
  slug: 'cloudflare-ai-crawler-deadline',
  metaTitle: 'Cloudflare AI Crawler Deadline: Sept 15',
  metaDescription:
    'On September 15 Cloudflare changes its AI crawler defaults. Who inherits them, the setting that can block Googlebot by accident, and what to do first.',
  title: 'Cloudflare\u2019s September 15 AI crawler deadline: what merchants should do',
  dek: 'On September 15, 2026, Cloudflare changes what AI crawlers are allowed to do on sites behind its network by default. Most coverage of this is written for publishers protecting content. If you are a business that wants to be found, the calculation runs the other way, and one setting can quietly cost you Google.',
  cardSummary:
    'Cloudflare changes its AI crawler defaults on September 15. What it means for businesses that want to be found, not publishers protecting content.',
  category: 'Agent readiness',
  publishedAt: '2026-09-02',
  updatedAt: '2026-09-02',
  readMinutes: 8,
  blocks: [
    {
      type: 'p',
      text: 'On September 15, 2026, Cloudflare\u2019s default settings for AI crawlers change. Bots classified as Training or Agent get blocked on pages that display ads, while Search crawlers stay allowed. The change applies to new domains onboarding to Cloudflare, new sites added by existing customers, and all existing free-tier customers. Paid customers with a saved configuration keep it.',
    },
    {
      type: 'p',
      text: 'Almost everything written about this is aimed at publishers, whose content is the product and for whom blocking is a way to protect an asset. If you sell something other than content, your position is close to the opposite. Being crawled is how you get recommended, and the most expensive mistake available here is blocking a category that feels protective and losing search visibility as a side effect.',
    },
    {
      type: 'p',
      text: 'This is the short version: find out whether the new defaults apply to you, make a deliberate choice and save it before the 15th, and do not block Training unless you have thought carefully about what else goes with it. The rest of this explains why.',
    },
    { type: 'h2', text: 'What actually changes' },
    {
      type: 'p',
      text: 'Cloudflare replaced its single AI-bot toggle with three categories, each mapped to a real behaviour rather than to a vendor.',
    },
    {
      type: 'table',
      headers: ['Category', 'What it covers', 'Default from Sept 15'],
      rows: [
        [
          'Search',
          'Crawlers that index your content to answer questions about it later',
          'Allowed',
        ],
        [
          'Agent',
          'Automated activity acting in real time for a person, like chat fetch bots and browser-use agents',
          'Blocked on pages that display ads',
        ],
        [
          'Training',
          'Crawlers taking your content to train or fine-tune a model',
          'Blocked on pages that display ads',
        ],
      ],
    },
    {
      type: 'p',
      text: 'For each category you can block on all pages, block only on pages that display ads, or not block at all. The ad condition is Cloudflare\u2019s proxy for intent: an ad on a page signals that a human audience was expected there. In practice this means many small business sites, which carry no ad inventory at all, will see the new default fire on nothing. That is worth checking rather than assuming, but it does mean the panic in some coverage is misplaced for a large share of merchants.',
    },
    {
      type: 'p',
      text: 'The scale is why it matters anyway. Cloudflare sits in front of roughly a fifth of the web, so when it changes a default, a large slice of the internet changes behaviour without anyone touching a dashboard.',
    },
    { type: 'h2', text: 'The trap: blocking Training can block Googlebot' },
    {
      type: 'p',
      text: 'This is the part to read twice. Some crawlers do more than one job. Googlebot indexes for Search and also collects for training. Cloudflare evaluates these multi-purpose crawlers against every category their behaviour touches, and applies the strictest rule you have set.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Block Training, and you can block Googlebot, Bingbot, and Applebot',
      text: 'Cloudflare names these three explicitly. If you set Training to blocked, a crawler that does both Search and Training is caught by the Training rule even though you left Search allowed. For a publisher that may be an acceptable price. For a business that depends on being found in Google, it is a self-inflicted deindexing, and the symptom is silent: nothing breaks on your site, your rankings just decay.',
    },
    {
      type: 'p',
      text: 'Cloudflare has been candid that its taxonomy names this tension without resolving it. The industry asks site owners to distinguish search from training, while the largest crawler bundles both. Until that changes, the practical instruction for a merchant is narrow and firm: set explicit allow rules for the crawlers your business actually depends on, rather than relying on category defaults to do the right thing on your behalf.',
    },
    { type: 'h2', text: 'The other failure mode: two doors telling different stories' },
    {
      type: 'p',
      text: 'Cloudflare\u2019s settings and your robots.txt are not the same kind of thing. Robots.txt is a request that well-behaved crawlers honour voluntarily, and some user-triggered fetchers, including OpenAI\u2019s ChatGPT-User and Perplexity\u2019s Perplexity-User, state openly that it may not apply to them because a human asked for the page. Cloudflare\u2019s bot rules are enforcement: the request gets a 403 whether the bot agrees or not.',
    },
    {
      type: 'p',
      text: 'The failure that turns up repeatedly in site audits is the two disagreeing. Robots.txt waves a crawler through the front door while the edge blocks it, and the owner is convinced they are visible to AI search while every fetch has been dying with a 403 for months. Nothing surfaces this in a dashboard. You find it in logs, or you never find it. The [measurement guide](/learn/measure-ai-agent-traffic) covers reading crawler status codes, and the status-code query in it is the fastest way to catch exactly this.',
    },
    { type: 'h2', text: 'Do this before September 15' },
    {
      type: 'ol',
      items: [
        'Check whether you are affected. New domain, new site under an existing account, or free tier means the new defaults apply to you. Paid with a saved AI-bot preference means you keep what you have.',
        'Open Security, then Settings, then the AI bot policy controls, and save a deliberate choice. A preference recorded before the 15th is respected, and the act of recording it means the setting reflects a decision rather than whatever the default happened to be.',
        'Leave Search allowed. For a business that wants customers, this is not a close call.',
        'Think hard before blocking Training, and understand that on a multi-purpose crawler it takes Search with it. If you have no content-licensing strategy, blocking Training buys you very little and can cost you a lot.',
        'Decide Agent deliberately. Agent covers the fetches that happen when someone asks an assistant about you in real time. Blocking it removes you from exactly the moment a buyer is asking. The [crawler guide](/learn/which-ai-crawlers-to-allow) covers what each named bot does.',
        'Verify from outside afterwards. Check your logs for 403s to legitimate crawlers, and confirm your robots.txt and your edge rules tell the same story.',
      ],
    },
    {
      type: 'cta',
      title: 'Check what agents can actually fetch from you',
      text: 'The free Nexez scanner requests your site the way an AI crawler does and reports what comes back: crawler access, server-rendered content, structured data, and machine-readable offers. About a minute, no signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'The bigger shift underneath' },
    {
      type: 'p',
      text: 'Cloudflare is also replacing Pay Per Crawl with Pay Per Use, which pays publishers when their content actually surfaces in an AI answer rather than per fetch, launching with Ceramic.ai and You.com and with publishers including beehiiv, Cond\u00e9 Nast, and Patreon. Read alongside the crawler categories, the direction is clear enough: Cloudflare is not trying to keep agents off the web, it is building the toll booth they pass through.',
    },
    {
      type: 'p',
      text: 'For merchants that is mostly good news, because a metered web still needs somewhere for buyers to be sent, and a business selling a product or a service is the destination rather than the toll. The thing worth protecting is not your content. It is your findability, and the deadline is a prompt to check that nobody has quietly switched it off for you.',
    },
    {
      type: 'p',
      text: 'One last piece of context for the decision. Google AI Overviews appeared in roughly 43% of searches as of May 2026, up from about 15% a year earlier, and AI Mode visits more than doubled year over year. The traffic reaching you through AI surfaces is growing while classic click-through shrinks. September 15 is a small administrative task, but it sits directly on top of the channel that is growing.',
    },
    {
      type: 'cta',
      title: 'Be readable to every crawler you let in',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings from one source of truth: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, with real Stripe checkout and Calendly-backed scheduling. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'What exactly changes on September 15, 2026?',
      answer:
        'Cloudflare\u2019s default AI crawler settings change. Bots classified as Training or as Agent are blocked on pages that display ads, while Search crawlers remain allowed. The defaults apply to new domains onboarding to Cloudflare, new sites added by existing customers, and all existing free-tier customers. Paid customers with a saved AI-bot configuration keep their existing settings.',
    },
    {
      question: 'Does this affect my site if I do not run ads?',
      answer:
        'Largely no, since the new default only fires on pages Cloudflare classifies as displaying ads, and many business sites carry no ad inventory. That said, the safe move is still to open the AI bot policy settings and record a deliberate preference before the deadline, so your configuration reflects a decision rather than whatever default happens to apply.',
    },
    {
      question: 'Can blocking AI training crawlers hurt my Google rankings?',
      answer:
        'Yes, and this is the most important trap in the change. Cloudflare evaluates multi-purpose crawlers against every category their behaviour touches and applies the strictest rule you have set. Googlebot, Bingbot, and Applebot all perform Search and Training functions, so blocking Training can block them entirely even when Search is allowed. For a business that depends on being found, that is usually the wrong trade.',
    },
    {
      question: 'How do I opt out of the new defaults?',
      answer:
        'In your Cloudflare dashboard, open Security, then Settings, then the AI bot policy controls, and set each of the three categories explicitly. A preference saved before September 15 is respected. Setting explicit allow rules for the crawlers your business depends on is safer than relying on category defaults, because defaults change and explicit rules do not.',
    },
    {
      question: 'Is robots.txt enough to control this?',
      answer:
        'No. Robots.txt is a request that well-behaved crawlers honour voluntarily, and some user-triggered fetchers such as ChatGPT-User and Perplexity-User state that it may not apply to them. Cloudflare\u2019s bot rules are enforcement at the edge, returning a 403 regardless. You want both layers, and you want them saying the same thing, because the common audit finding is robots.txt allowing a crawler that the edge has been blocking for months.',
    },
    {
      question: 'Should merchants block AI crawlers at all?',
      answer:
        'Usually not the ones that matter for visibility. Publishers block to protect content that is itself the product. A business selling goods or services depends on being crawled to be recommended, so blocking Search is almost always wrong, and blocking Agent removes you from the live fetches that happen when a buyer asks an assistant about you. Training is the only category where a genuine content-rights argument applies, and even there the multi-purpose crawler problem makes it costly.',
    },
  ],
}
