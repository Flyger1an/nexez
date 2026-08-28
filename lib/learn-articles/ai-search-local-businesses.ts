import type { LearnArticle } from '../learn-content'

export const aiSearchLocalBusinesses: LearnArticle = {
  slug: 'ai-search-local-businesses',
  metaTitle: 'AI Search for Restaurants and Local Business',
  metaDescription:
    'For local queries your website is only one of four sources AI draws from. Here is where recommendations actually come from and how to win the shortlist.',
  title: 'AI search for restaurants and local businesses: where the recommendation actually comes from',
  dek: 'Ask an assistant for the best taco place nearby and it names one to three, not ten. Winning that shortlist works differently than every other kind of AI visibility, because for local questions your own website is not the primary source. Here is what is, and what to do about it.',
  category: 'Guides',
  publishedAt: '2026-08-17',
  updatedAt: '2026-08-17',
  readMinutes: 11,
  blocks: [
    {
      type: 'p',
      text: 'When someone asks an AI assistant for the best restaurant, plumber, or salon near them, the answer names one to three businesses with a reason for each. It does not return a list of ten links. And here is the part that catches local owners off guard: to build that answer, the assistant leans mostly on sources that are not your website. Your Google Business Profile, third-party review platforms, and best-of lists and directories carry most of the weight, with your site and its structured data filling in the rest.',
    },
    {
      type: 'p',
      text: 'That inverts the usual advice. For most AI visibility work, the website is the whole game, and the [GEO playbook](/learn/generative-engine-optimization) applies directly. For local intent, a business with a mediocre website and an immaculate Google Business Profile routinely beats a business with the opposite. If you have been pouring effort into your site and wondering why assistants still recommend the place down the street, this is usually why.',
    },
    {
      type: 'p',
      text: 'This guide covers how assistants actually assemble local answers, the four sources they draw from and how to fix each, what changed about the queries themselves, the honest limits of AI on local data right now, and where restaurants specifically have leverage nobody else does.',
    },
    { type: 'h2', text: 'Two things changed at once' },
    {
      type: 'p',
      text: 'The first change is compression. The old local pack showed three businesses and organic results showed ten, so being fourth or seventh still meant existing. An AI answer typically names one to three with a short justification, and most people never ask for more. The shortlist got dramatically shorter, which makes local AI visibility closer to winner-take-most than the ranked list it replaced.',
    },
    {
      type: 'p',
      text: 'The second change is the shape of the question. People used to type "italian restaurant near me" because that was all a search box could usefully handle. Now they say "find me a romantic Italian place near downtown with good pasta and a quiet atmosphere for a date night." That is four constraints at once, and the assistant has to verify each one against something. Proximity and star rating no longer decide it. Whether your data actually says "outdoor seating," "quiet," "reservations," or "open Sunday" decides it.',
    },
    {
      type: 'p',
      text: 'On volume, the research is directionally consistent and worth treating as approximate rather than precise, since methodologies vary by study and market: 2026 local-search research puts AI use for local search at roughly 45%, up from around 6% a year earlier, with AI Overviews appearing on a majority of local queries. Whatever the exact figure in your market, the direction has not been ambiguous for two years.',
    },
    { type: 'h2', text: 'The four sources, and what to do about each' },
    {
      type: 'table',
      headers: ['Source', 'Why it carries weight', 'Your move'],
      rows: [
        ['Google Business Profile', 'Structured, verified, frequently updated, and directly wired into Google\u2019s AI surfaces', 'Complete every field, especially attributes and menu'],
        ['Review platforms', 'Independent corroboration; assistants read sentiment themes, not just star counts', 'Steady genuine review flow, and reply to them'],
        ['Best-of lists and directories', 'Third-party editorial judgment the model can lean on', 'Concentrate on the few that matter locally'],
        ['Your website and structured data', 'The canonical source for specifics nothing else carries', 'Machine-readable hours, services, prices, and FAQs'],
      ],
    },
    { type: 'h3', text: 'Google Business Profile: the highest-leverage hour' },
    {
      type: 'p',
      text: 'Treat every GBP field as an input to a machine, not a brochure. Attributes are the clearest example: an assistant answering "quiet Italian with outdoor seating" is matching attribute flags, and an unchecked box is an invisible business. Same for hours (including holiday hours), service area, categories, and the Q&A section. Write the description to answer what customers actually ask rather than to sound polished. "Downtown Austin date-night Italian, reservations recommended, patio seating, open until 11pm Friday and Saturday" is answerable; "an authentic culinary journey since 2012" is not.',
    },
    { type: 'h3', text: 'Reviews: the corroboration layer' },
    {
      type: 'p',
      text: 'Assistants weigh what independent sources say about you more heavily than what you say about yourself, and modern systems read review text for themes rather than just averaging stars. A restaurant whose reviews repeatedly mention "quiet," "great for a date," and "fast service" becomes matchable for exactly those queries, which is why review volume, recency, and consistency across platforms all matter. Fabricated reviews are counterproductive here for the same reason genuine ones work: cross-source consensus is precisely what the system is checking.',
    },
    { type: 'h3', text: 'Directories: concentrate, do not spray' },
    {
      type: 'p',
      text: 'The old citation-building instinct (get listed everywhere) actively hurts now, because inconsistent name, address, and phone data across dozens of stale listings gives assistants conflicting facts to reconcile. Birdeye documented one restaurant group that dropped 60 low-value directories to focus on Google and Apple Maps and saw web traffic climb 1048% in a month. Treat that specific number as one case study rather than a promise, but the principle behind it is sound and cheap to apply: a few accurate listings beat many contradictory ones.',
    },
    { type: 'h3', text: 'Your website: the specifics nothing else carries' },
    {
      type: 'p',
      text: 'Your site still matters, just for a narrower job than owners expect. It is where an assistant verifies the things a profile cannot hold: full service menus with prices, policies, booking terms, specialisms, service areas. Publish those as machine-readable structured data (LocalBusiness with the most specific subtype, Service or Product with Offer blocks, FAQPage) so they can be read as facts rather than inferred from prose. The [JSON-LD guide](/learn/json-ld-for-ai-agents) has copy-paste templates for exactly this.',
    },
    {
      type: 'cta',
      title: 'See what agents can verify about your business',
      text: 'The free Nexez scanner fetches your site the way an AI assistant does and scores what it can actually confirm: crawler access, structured data, machine-readable hours and prices, and callable actions. No signup, about a minute.',
      href: '/scan',
      label: 'Scan your site free',
    },
    { type: 'h2', text: 'The restaurant advantage: your menu is structured data' },
    {
      type: 'p',
      text: 'Restaurants have one input other local businesses do not, and most treat it as an afterthought. Menu data (dish names, dietary tags, price ranges) is a direct AI input, and it is what makes a restaurant matchable for the food-specific queries that now dominate: gluten free, vegan options, good pasta, under $20 a head.',
    },
    {
      type: 'p',
      text: 'Google will even extract menu items and pricing from an uploaded photo or PDF into a structured digital menu, so the effort barrier is genuinely low. An empty or two-year-old menu section is a structural disadvantage against a competitor with a current one, independent of how good the food is.',
    },
    {
      type: 'callout',
      tone: 'amber',
      title: 'The honest limit right now',
      text: 'AI assistants are still noticeably weaker at local than they are at general questions. Most do not have real-time access to Google Business Profiles or live map data, so answers about hours, availability, and whether somewhere is open right now can be confidently wrong. That cuts both ways. It means an assistant may misreport your Saturday hours from a stale third-party listing you forgot existed, and it means the practical defence is being correct and identical everywhere at once, rather than optimising any single surface.',
    },
    { type: 'h2', text: 'Getting recommended is only half of it' },
    {
      type: 'p',
      text: 'Local intent converts faster than almost any other kind, because "near me" usually means "now." That makes the gap between being recommended and being actionable especially expensive. If the assistant names you but cannot check whether 7pm Thursday is free, the customer is handed a phone number and a competitor with online availability is one sentence away.',
    },
    {
      type: 'p',
      text: 'That is the transactable layer, and it is a different piece of work from everything above: live availability, bookable actions, and callable endpoints an agent can actually use. For appointment-driven businesses the mechanics are covered in [AI agents booking service businesses](/learn/ai-agents-book-service-businesses), and the live-connection version is [an MCP server](/learn/what-is-an-mcp-server). The short version is that assistants preferentially route to places where the journey completes, because a dead end reflects badly on the assistant.',
    },
    { type: 'h2', text: 'The order to do this in' },
    {
      type: 'ol',
      items: [
        'Audit your Google Business Profile end to end: categories, every applicable attribute, hours including holidays, photos, Q&A, and menu if you have one. This is the single highest-return hour available to a local business.',
        'Fix conflicting listings. Find where your name, address, phone, and hours disagree across the web and either correct or remove them. Fewer accurate listings beat more contradictory ones.',
        'Build a genuine review habit, ask consistently, respond publicly, and let the language customers use become the language assistants match on.',
        'Ship structured data on your site for the specifics a profile cannot hold: services, prices, policies, and FAQs.',
        'Add callable availability or booking so a recommendation can become a reservation without a phone call.',
        'Test it. Ask ChatGPT, Gemini, and Perplexity the questions your customers ask, in your city, and see who gets named and why. That is your baseline, and it is free.',
      ],
    },
    {
      type: 'p',
      text: 'That last step is worth doing before anything else, because it usually reveals which of the four sources is failing you. If assistants describe your business inaccurately, it is a data consistency problem. If they do not mention you at all, it is usually a profile completeness or review corroboration problem. If they recommend you but cannot say what you charge or when you are open, that is your website. Different symptom, different fix, and guessing wastes the effort.',
    },
    {
      type: 'cta',
      title: 'Make the website half machine-readable in one setup',
      text: 'Nexez turns your existing site into an agent-legible, agent-transactable listing: JSON-LD, llms.txt, agent.json, OpenAPI, a per-merchant MCP server, and ACP/UCP feeds, with real Stripe checkout and Calendly-backed scheduling behind them. It handles the website and structured-data layer, so your profile and review work compounds against something solid. Start on Free with no card; paid plans include a 7-day trial.',
      href: '/how-it-works',
      label: 'See how it works',
    },
  ],
  faqs: [
    {
      question: 'How do AI assistants pick which local business to recommend?',
      answer:
        'They work out intent and location, then synthesise an answer from several sources they trust: your Google Business Profile and equivalent listings, third-party review platforms, best-of lists and directories, and structured data on business websites. The result usually names one to three businesses with a reason for each rather than returning a ranked list of links.',
    },
    {
      question: 'Is my website or my Google Business Profile more important for AI local search?',
      answer:
        'For local queries specifically, the profile generally carries more weight, because it is structured, verified, frequently updated, and wired directly into Google\u2019s AI surfaces. Your website matters for the specifics a profile cannot hold, such as full service menus, prices, policies, and FAQs, ideally published as structured data. The two do different jobs, and a complete profile plus a machine-readable site beats either alone.',
    },
    {
      question: 'Why does ChatGPT get my opening hours wrong?',
      answer:
        'Most assistants do not have real-time access to Google Business Profiles or live map data, so they answer from whatever they have crawled or been trained on, including stale third-party listings you may have forgotten about. The fix is consistency rather than optimisation of any one surface: find every listing that disagrees with your actual hours and correct or remove it, and publish hours as structured data on your own site so there is an authoritative machine-readable source.',
    },
    {
      question: 'Do I still need to build local citations and directory listings?',
      answer:
        'Far fewer than the old playbook suggested, and accuracy now matters much more than volume. Inconsistent name, address, and phone data across many stale listings gives assistants conflicting facts and can actively work against you. Birdeye documented one restaurant group that dropped 60 low-value directories to concentrate on Google and Apple Maps and saw a large traffic increase. Treat the specific figure as a single case study, but the principle of concentrating on the few authoritative platforms is sound.',
    },
    {
      question: 'What should a restaurant do first?',
      answer:
        'Fill in the menu section of your Google Business Profile and keep it current. Dish names, dietary tags, and price ranges are direct inputs that let assistants match you to food-specific queries like gluten free options or good vegetarian pasta, and Google can extract menu data from an uploaded photo or PDF so the effort is small. After that, complete your attributes (outdoor seating, reservations, atmosphere) since multi-constraint queries are matched against exactly those flags.',
    },
    {
      question: 'How do I know if any of this is working?',
      answer:
        'Build a small prompt panel and run it monthly: ask ChatGPT, Gemini, Perplexity, and Google AI Mode the questions your customers actually ask, phrased naturally and with your city included, and log who gets named and how you are described. Pair that with your server logs and referral data so you can see crawler activity and AI referrals alongside the citations themselves. The [measurement guide](/learn/measure-ai-agent-traffic) covers that instrumentation in detail.',
    },
  ],
}
