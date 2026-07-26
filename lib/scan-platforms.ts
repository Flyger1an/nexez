// Content for the programmatic /scan/[platform] landing pages ("Is my {platform}
// site AI-agent ready?"). One typed record per platform: the page copy, the
// platform-specific fix path (grounded in real Nexez capabilities — WordPress
// plugin, Wix/Squarespace head-injection snippets, redirect recipes), and FAQs
// (rendered + emitted as FAQPage schema by the route).

export type ScanPlatform = {
  slug: string
  name: string
  metaTitle: string
  metaDescription: string
  /** How agents experience a typical site on this platform — honest, not FUD. */
  reality: string[]
  /** What this platform can/can't do natively for agent artifacts. */
  constraint: string
  /** Ordered, platform-specific fix path. */
  fixSteps: string[]
  faqs: { question: string; answer: string }[]
}

export const scanPlatforms: ScanPlatform[] = [
  {
    slug: 'wordpress',
    name: 'WordPress',
    metaTitle: 'Is your WordPress site AI-agent ready? Free scan',
    metaDescription:
      'Scan your WordPress site for AI-agent legibility free, then fix what fails with a plugin — JSON-LD, llms.txt, agent.json, and live artifact redirects.',
    reality: [
      'WordPress renders server-side HTML, which is the good news: agents can read your pages without executing JavaScript.',
      'The gap is usually structure, not access. Most themes ship no offer-level JSON-LD, no machine-readable price or booking action, and none of the agent artifacts (agent.json, llms.txt) agents probe for.',
      'SEO plugins help with Organization and Article schema, but almost none emit the Offer/BuyAction structures a shopping agent needs to quote your services.',
    ],
    constraint:
      'WordPress is the easiest platform to fix: plugins can inject head markup AND handle URL routing server-side, so both structured data and artifact paths are automatable.',
    fixSteps: [
      'Run the free scan below to see exactly which checks your site passes and fails today.',
      'Create your structured listing on the Nexez Free plan, with no card required. It becomes the single source of truth for your offers.',
      'Install the Nexez Agent-Ready plugin, paste your listing slug, and it injects your live JSON-LD into every page head and 301-redirects the artifact paths (/.well-known/agent.json, /llms.txt, /openapi.json) to your always-current listing.',
      'Verify your domain from Nexez Settings (the plugin serves the file-method proof — no DNS edits needed).',
      'Re-run the scan to confirm the score.',
    ],
    faqs: [
      {
        question: 'Do I need to edit my theme or functions.php?',
        answer: 'No. The plugin handles head injection and artifact routing on its own — no theme edits, no server config, and deactivating it removes everything cleanly.',
      },
      {
        question: 'Will it conflict with my SEO plugin?',
        answer:
          'No. Yoast/Rank Math emit page-level schema (Organization, Article). The Nexez plugin adds offer-level commerce structures they do not produce, and both can coexist in the same head.',
      },
      {
        question: 'Does my WordPress content stay where it is?',
        answer: 'Yes. Your site stays exactly as-is for human visitors — the plugin only adds machine-readable layers on top of it.',
      },
    ],
  },
  {
    slug: 'wix',
    name: 'Wix',
    metaTitle: 'Is your Wix site AI-agent ready? Free scan',
    metaDescription:
      'Scan your Wix site for AI-agent legibility free. Wix blocks redirect rules and root files — here is the code-injection path that works instead.',
    reality: [
      'Wix pages render heavily client-side, and agents that read raw HTML can miss content that only appears after JavaScript runs.',
      'Wix does not let you upload root files (so no /llms.txt or /.well-known/agent.json) and does not support custom redirect rules to serve them from elsewhere.',
      'Structured data support exists but is limited to what Wix generates for its own commerce objects — service businesses usually end up with none of the offer-level markup agents need.',
    ],
    constraint:
      'The one lever Wix gives you is head code injection (Settings → Custom Code). That is enough to carry structured offers and an agent-manifest link — the artifacts themselves live on your listing instead of your Wix site.',
    fixSteps: [
      'Run the free scan below to see what agents can currently read on your Wix site.',
      'Create your structured listing on Nexez — it hosts the artifacts Wix cannot serve (agent.json, llms.txt, OpenAPI, MCP).',
      'Copy the Wix head snippet from your Nexez settings (your offers as JSON-LD plus a manifest link) and paste it into Settings → Custom Code, applied to all pages.',
      'Verify your domain with the meta-tag method (also part of the snippet).',
      'Re-run the scan to confirm agents now see structured offers in your head.',
    ],
    faqs: [
      {
        question: 'Why can’t I just upload llms.txt to Wix?',
        answer: 'Wix does not expose the site root for arbitrary files and does not support redirect rules to proxy them. The workable pattern is head-injected structured data plus a manifest link pointing at your hosted listing.',
      },
      {
        question: 'Does the snippet slow my site down?',
        answer: 'No. It is static markup — a script tag of JSON-LD and a link tag. Nothing executes and no external requests are made from your visitors’ browsers.',
      },
      {
        question: 'Does this work with Wix Bookings?',
        answer: 'Yes alongside it. Wix Bookings stays your human booking flow; the injected offer markup is what lets agents understand and quote those same services.',
      },
    ],
  },
  {
    slug: 'squarespace',
    name: 'Squarespace',
    metaTitle: 'Is your Squarespace site AI-agent ready? Free scan',
    metaDescription:
      'Scan your Squarespace site for AI-agent legibility free. No root files or redirects on Squarespace — use the code-injection path that works instead.',
    reality: [
      'Squarespace ships reasonably clean HTML, but its built-in structured data stops at basics — business name, maybe products on Commerce plans.',
      'Like Wix, you cannot upload root files (/llms.txt, /.well-known/agent.json) and URL mappings cannot target them, so agents probing artifact paths get 404s.',
      'Service offerings described in free-text pages are readable but not machine-quotable: no price fields, no booking action an agent can follow.',
    ],
    constraint:
      'Squarespace’s lever is Settings → Advanced → Code Injection (header). That carries your offer JSON-LD and a manifest link; the artifact files themselves are hosted on your listing.',
    fixSteps: [
      'Run the free scan below for the current picture.',
      'Create your structured listing on Nexez with your real offers and prices.',
      'Copy the Squarespace header snippet from your Nexez settings and paste it into Settings → Advanced → Code Injection.',
      'Verify your domain with the meta-tag method.',
      'Re-run the scan to confirm.',
    ],
    faqs: [
      {
        question: 'Code injection requires a Business plan — is there another way?',
        answer: 'On Personal plans, per-page header injection is not available; your listing still works as a standalone agent-readable surface that you link from your site, but in-head markup needs the Business plan.',
      },
      {
        question: 'Will this interfere with Squarespace Commerce schema?',
        answer: 'No. Squarespace emits its own product schema for Commerce items; the injected markup covers the service offers it does not model. Agents merge both.',
      },
    ],
  },
  {
    slug: 'webflow',
    name: 'Webflow',
    metaTitle: 'Is your Webflow site AI-agent ready? Free scan',
    metaDescription:
      'Scan your Webflow site for AI-agent legibility free. Webflow gives you custom code and clean HTML — here is what to add so agents can quote and book you.',
    reality: [
      'Webflow publishes fast, semantic, server-rendered HTML — one of the better starting points for agent legibility.',
      'But designers rarely add offer-level structured data, and Webflow has no native concept of a bookable service with a price an agent can act on.',
      'Root artifact files are not supported on Webflow hosting, and 301 rules only map paths within your site.',
    ],
    constraint:
      'Webflow’s Custom Code (site-wide head) takes your offer JSON-LD and manifest link directly, and its clean markup means the rest of your content is already readable.',
    fixSteps: [
      'Run the free scan below — Webflow sites often pass crawlability and fail everything offer-related.',
      'Create your structured listing on Nexez with offers, prices, and booking behavior.',
      'Paste the generic head snippet from your Nexez settings into Project Settings → Custom Code → Head.',
      'Verify your domain with the meta-tag method.',
      'Re-run the scan.',
    ],
    faqs: [
      {
        question: 'I have CMS collections for services — does that help agents?',
        answer: 'Visually yes, machine-wise no: CMS collections render as HTML, not as structured offers. Binding your collection content into JSON-LD is exactly what the injected snippet does for you.',
      },
      {
        question: 'Does this affect my Webflow SEO settings?',
        answer: 'No. Your titles, descriptions, and Open Graph settings stay in Webflow. The snippet adds commerce structures alongside them.',
      },
    ],
  },
  {
    slug: 'woocommerce',
    name: 'WooCommerce',
    metaTitle: 'Is your WooCommerce store AI-agent ready? Free scan',
    metaDescription:
      'Scan your WooCommerce store for AI-agent legibility free — product schema is not enough for agentic checkout. Here is the full path, plugin included.',
    reality: [
      'WooCommerce emits Product schema out of the box, so agents can usually read your catalog — that puts you ahead of most platforms.',
      'What is missing is the transaction layer: agent artifacts (agent.json, llms.txt), a feed agents can subscribe to, and any way for an agent to complete checkout rather than just recommend you.',
      'Bookable services sold through Woo extensions rarely carry machine-readable availability at all.',
    ],
    constraint:
      'Because WooCommerce runs on WordPress, the same plugin path applies — head injection plus artifact routing — and your listing adds the ChatGPT (ACP) and Google (UCP) product feeds Woo does not produce.',
    fixSteps: [
      'Run the free scan below; note which artifact probes 404.',
      'Create your Nexez listing and import your products (a Woo store URL import is supported).',
      'Install the Nexez Agent-Ready plugin and paste your listing slug — JSON-LD injection plus artifact redirects, zero template edits.',
      'Your listing is automatically included in the ChatGPT and Google agent product feeds; checkout through agents is a plan upgrade when you want it.',
      'Re-run the scan.',
    ],
    faqs: [
      {
        question: 'I already have Product schema — why do I fail agent checks?',
        answer: 'Product schema makes items readable; it does not give agents a feed to index, artifacts to probe, or a checkout they can drive. Those are separate layers on top of schema.',
      },
      {
        question: 'Does this replace my WooCommerce checkout?',
        answer: 'No. Your human checkout stays untouched. Agentic checkout is an additional rail — agents transact through your listing while your store keeps working exactly as it does today.',
      },
    ],
  },
]

export function getScanPlatform(slug: string): ScanPlatform | undefined {
  return scanPlatforms.find((p) => p.slug === slug)
}
