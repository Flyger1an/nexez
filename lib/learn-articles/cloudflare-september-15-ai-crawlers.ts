import type { LearnArticle } from '../learn-content'

export const cloudflareSeptember15Crawlers: LearnArticle = {
  slug: 'cloudflare-september-15-ai-crawlers',
  metaTitle: 'Cloudflare\u2019s Sept 15 AI Crawler Deadline',
  metaDescription:
    'Cloudflare changes AI crawler defaults on September 15. What actually changes, who inherits it, and the setting that can quietly remove you from Google.',
  title: 'Cloudflare\u2019s September 15 deadline: what it actually changes for your business',
  dek: 'On September 15, Cloudflare flips its AI crawler defaults. Most of the coverage is written for publishers, and if you run a business site the honest answer is that the new default probably does not fire on you. The part that should worry you is a setting you might turn on yourself.',
  category: 'Agent readiness',
  publishedAt: '2026-09-02',
  updatedAt: '2026-09-02',
  readMinutes: 10,
  blocks: [
    {
      type: 'p',
      text: 'On September 15, 2026, Cloudflare changes the default treatment of AI crawlers. Bots classified as Training or Agent get blocked on pages that display ads, while Search crawlers stay allowed. Cloudflare sits in front of roughly a fifth of the web, so when it changes a default, a large slice of the internet changes behaviour without anyone touching a dashboard.',
    },
    {
      type: 'p',
      text: 'Nearly all the coverage of this is written for publishers, and it reads as alarming. For most businesses it should not. The new default is conditional on one thing: whether the page displays ads. A plumber, a clinic, a spa, or a small retailer typically has no ad inventory at all, so the default has nothing to fire on. If you have been putting off reading about this because it sounded like an emergency, that instinct was roughly correct.',
    },
    {
      type: 'p',
      text: 'The part that deserves your attention is different, and it points the opposite way from the panic. The riskiest thing here is not Cloudflare\u2019s default. It is a setting you might turn on yourself, in a reasonable attempt to protect your content, that quietly removes you from Google.',
    },
    { type: 'h2', text: 'What actually changes' },
    {
      type: 'p',
      text: 'Cloudflare replaced its single AI-bot on/off switch with three categories, defined by what the crawler is doing rather than who operates it:',
    },
    {
      type: 'table',
      headers: ['Category', 'What it covers', 'Default from Sept 15'],
      rows: [
        ['Search', 'Crawlers indexing your content to answer questions about it later', 'Allowed'],
        ['Agent', 'Automated activity acting in real time for a person: chat fetch bots, browser-use agents', 'Blocked on ad-displaying pages'],
        ['Training', 'Crawlers taking your content to train or fine-tune a model', 'Blocked on ad-displaying pages'],
      ],
    },
    {
      type: 'p',
      text: 'For each category you can choose to block on all pages, block only on pages displaying ads, or not block at all. Cloudflare\u2019s reasoning for the ad condition is worth understanding because it explains the whole design: an ad on a page is a signal that the owner expected a human to see it. Where a human was expected and a machine arrived instead, Cloudflare treats that as the case for compensation rather than free access.',
    },
    {
      type: 'p',
      text: 'Who inherits the new defaults: new domains onboarding to Cloudflare, new sites added by existing customers, and all existing customers on the Free plan. Paid customers with an existing configuration keep what they have. If your zone has an explicit AI bot preference saved before September 15, Cloudflare respects it.',
    },
    { type: 'h2', text: 'The trap: blocking Training can block Google' },
    {
      type: 'p',
      text: 'This is the part to actually absorb. Some crawlers do more than one job. Googlebot indexes for Search and also collects data that trains models. Cloudflare evaluates these multi-purpose crawlers under every policy that applies to them, and the strictest applicable rule wins.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'Block Training, and you can block Googlebot, Bingbot, and Applebot',
      text: 'Cloudflare names these three explicitly. If you set Training to blocked on your zone, a multi-purpose crawler caught by that rule is blocked entirely, even though you left Search allowed. The intent was to keep your content out of model training. The outcome can be leaving Google\u2019s index. This is a self-inflicted wound, it is easy to inflict, and it is the single most expensive mistake available in this dashboard.',
    },
    {
      type: 'p',
      text: 'The tension is real rather than a configuration quirk, and Cloudflare cannot resolve it: Google bundles search indexing and training data collection into one crawler, so there is no setting that separates them from your side. Cloudflare\u2019s three-category taxonomy names the problem clearly but the choice it leaves you is still binary for Googlebot specifically.',
    },
    {
      type: 'p',
      text: 'For a business that wants customers, the answer is usually straightforward. Publishers whose content is the product may reasonably trade search visibility for training protection. A business whose content exists to sell a service almost never should.',
    },
    { type: 'h2', text: 'The category merchants should actually care about' },
    {
      type: 'p',
      text: 'Agent is the quiet one. It covers automated activity acting in real time on a person\u2019s behalf, which is the exact traffic that arrives when a customer asks an assistant about your business and it goes and fetches your page. Blocking Agent does not protect anything from training. It removes you from the moment a real person is being helped to decide.',
    },
    {
      type: 'p',
      text: 'That is the whole thesis of [agentic commerce](/learn/what-is-agentic-commerce) running in reverse. The [crawler guide](/learn/which-ai-crawlers-to-allow) covers the full roster of which named bots fall into which category, and the short version for a business is: allow Search, allow Agent, and make Training a deliberate decision rather than a default you inherited or a box you ticked in a hurry.',
    },
    { type: 'h2', text: 'The bug this deadline will expose' },
    {
      type: 'p',
      text: 'Site audits keep turning up the same failure, and September 15 will create more of it: robots.txt says one thing while the edge does another. Robots.txt is a sign on the door that well-behaved crawlers read and honour, and that some user-triggered fetchers openly say may not apply to them. Cloudflare\u2019s bot rules are not a sign, they are a bouncer. The request gets a 403 whether the bot likes it or not.',
    },
    {
      type: 'p',
      text: 'The result is an owner who is confident they are visible to AI assistants while every fetch has been dying at the edge for months. Nothing in your analytics reveals this, because blocked crawlers never reach the page and never fire a tag. It shows up only in logs, which is one more reason to instrument them; the [measurement guide](/learn/measure-ai-agent-traffic) covers how, including the query that surfaces exactly this by counting status codes served to AI crawlers.',
    },
    {
      type: 'cta',
      title: 'Check what agents can actually reach today',
      text: 'The free Nexez scanner fetches your site the way an AI crawler does, so a block at the edge shows up as a failure rather than a silent absence. Crawler access, structured data, and machine-readable offers, in about a minute. No signup.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'What to do before September 15' },
    {
      type: 'ol',
      items: [
        'Find out whether you are on Cloudflare at all. Many businesses are, through a host or agency, without the owner knowing. If nobody on your team has a Cloudflare login, this deadline is not yours.',
        'If you are, open Security, then Settings, then the AI bot policy controls, and record a deliberate choice rather than inheriting one. An explicit preference saved before September 15 is respected.',
        'For a normal business site: allow Search, allow Agent. Decide Training on its merits, understanding that blocking it can take Googlebot, Bingbot, and Applebot with it.',
        'Prefer explicit allow rules for the crawlers your business depends on over relying on category defaults, since defaults change and yours just did.',
        'Check your logs after September 15 for 403s served to AI crawlers. That is the only place a misconfiguration will surface.',
        'Make robots.txt and your edge rules tell the same story. Two layers disagreeing is how sites end up invisible while looking fine.',
      ],
    },
    { type: 'h2', text: 'The bigger pattern' },
    {
      type: 'p',
      text: 'Cloudflare also replaced its per-fetch Pay Per Crawl experiment with Pay Per Use, which pays publishers when their content actually surfaces in an AI answer rather than when it is merely crawled. Read that alongside the rest of what Cloudflare shipped this year and a strategy comes into focus: it is not trying to keep agents off the web, it is building the place where agents pay to come in.',
    },
    {
      type: 'p',
      text: 'That is worth knowing because it tells you which way this is heading. The long-run equilibrium being built is not blocked or unblocked; it is metered. For a business selling something, that is a better world than it sounds, because the thing being metered is content, while what you actually want from an agent is a customer. Staying readable and reachable is how you end up on the receiving end of that traffic rather than behind the toll booth.',
    },
    {
      type: 'p',
      text: 'The deadline itself is a small task with a real downside if ignored. Ten minutes in a dashboard, one deliberate decision recorded, and a log check afterwards. The businesses that get hurt on September 15 will overwhelmingly be the ones that blocked something on purpose without knowing what else it took with it.',
    },
    {
      type: 'cta',
      title: 'Be readable everywhere agents look',
      text: 'Nexez publishes your business as agent-legible, agent-transactable listings from one source of truth: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP plus UCP feeds, with real Stripe checkout and Calendly-backed scheduling. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'What exactly changes on September 15, 2026?',
      answer:
        'Cloudflare updates its default AI crawler settings so that bots classified as Training or Agent are blocked on pages that display ads, while Search crawlers remain allowed. The change applies to new domains onboarding to Cloudflare, new sites added by existing customers, and all existing Free plan customers. Paid customers with an existing configuration keep it, and any zone with an explicit AI bot preference saved before the deadline is respected.',
    },
    {
      question: 'Does this affect my business site if I do not run ads?',
      answer:
        'Largely no. The new default is conditional on a page displaying ads, which Cloudflare treats as a signal that a human audience was expected. A typical service or small retail site has no ad inventory, so the default has nothing to trigger on. The reason to still open the dashboard is to record a deliberate choice rather than inherit a default, and to make sure nobody has previously set a block that is costing you traffic.',
    },
    {
      question: 'Can blocking AI training crawlers hurt my Google rankings?',
      answer:
        'Yes, and this is the most important thing to understand. Cloudflare evaluates multi-purpose crawlers under every policy that applies to them, and the strictest rule wins. Googlebot, Bingbot, and Applebot handle both Search and Training, so setting Training to blocked can block them entirely even with Search allowed. Google bundles indexing and training in one crawler, so there is no setting that separates them from your side.',
    },
    {
      question: 'What is the difference between Search, Agent, and Training crawlers?',
      answer:
        'Search crawlers index your content so an engine can answer questions about it later. Agent crawlers act in real time on a person\u2019s behalf, such as a chat assistant fetching your page because a customer asked about you. Training crawlers take content to train or fine-tune models. For a business that wants customers, Search and Agent are the two you almost certainly want allowed, since both represent someone actively trying to find you.',
    },
    {
      question: 'How is this different from robots.txt?',
      answer:
        'Robots.txt is a request that well-behaved crawlers honour voluntarily, and some user-triggered fetchers state that it may not apply to them because a human asked for the page. Cloudflare bot rules are enforcement at the edge: a blocked request receives a 403 regardless. The common failure is the two disagreeing, so robots.txt welcomes a crawler that the edge has been blocking for months, invisibly, since blocked crawlers never reach your analytics.',
    },
    {
      question: 'How do I tell whether my site is already blocking AI crawlers?',
      answer:
        'Check server or CDN logs for status codes served to known AI user agents; 403s are the signal. Analytics will not show this because blocked crawlers never execute your tracking script. You can also fetch your own pages while presenting an AI crawler user agent and see what comes back. A [free scan](/scan) surfaces the same thing by fetching your site the way an agent does.',
    },
  ],
}
