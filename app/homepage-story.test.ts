import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const readinessSource = readFileSync(new URL('../components/home/ReadinessLab.tsx', import.meta.url), 'utf8')
const heroScanSource = readFileSync(new URL('../components/home/HeroScan.tsx', import.meta.url), 'utf8')
const hero = source.split('{/* HERO - text + CTAs on the left, the live agent-readiness scanner on the right */}')[1]
  ?.split('{/* AGENT LOGO MARQUEE */}')[0] ?? ''

const retiredHomepageClaims = [
  'Transacts with every major agent',
  'schema agents trust',
  'JSON-LD, llms.txt, agent.json, and MCP',
  'no upkeep required',
  'Your listing never goes stale',
  'No agent ever sees an old price',
  'every major buyer agent',
  'structured version they need to act',
  'Zero ambiguity',
]

describe('homepage commerce story', () => {
  it('preserves the approved homepage hero', () => {
    expect(hero).toContain('Turn AI assistants into')
    expect(hero).toContain('a sales channel.')
    expect(hero).toContain('AI assistants are already shopping for your customers.')
    expect(hero).toContain('so the sale happens on your terms.')
    expect(hero).toContain('List your offers')
    expect(hero).toContain('See how it works')
    expect(hero).toContain('stats.map')
    expect(source).toContain("{ value: '<200ms', label: 'Fast pages' }")
    expect(source).toContain("{ value: '19+', label: 'AI assistants' }")
    expect(source).toContain("{ value: '10+', label: 'Connections' }")
    expect(source).toContain("{ value: 'Live', label: 'Sales insights' }")
  })

  it('puts the live scanner in the hero, not a mockup', () => {
    expect(hero).toContain('<HeroScan />')
    // The hero scanner must hit the real public endpoint, never a simulated score.
    expect(heroScanSource).toContain("fetch('/api/scan'")
    expect(heroScanSource).toContain('No account needed')
    expect(heroScanSource).toContain('Scan my site')
    expect(heroScanSource).toContain('Turn these on next')
    // Signup is offered after the visitor has a result, not before: the create
    // link is built from result.url, so it cannot render until a scan returns.
    expect(heroScanSource).toContain('appUrl(`/create?url=')
  })

  it('never dead-ends the hero scanner on a rate limit', () => {
    // /api/scan is 6/60s. On the homepage that trips routinely, so a 429 must
    // read as a busy signal with a wait, never the raw API string.
    expect(heroScanSource).toContain('response.status === 429')
    expect(heroScanSource).toContain('The scanner is busy right now.')
    expect(heroScanSource).toContain('Retry-After')
    expect(heroScanSource).not.toContain('Rate limit exceeded. Please slow down.')
  })

  it('makes hero scans measurable and carries the url into signup', () => {
    expect(heroScanSource).toContain("source: 'hero'")
    expect(heroScanSource).toContain('appUrl(`/create?url=${encodeURIComponent(result.url)}`)')
  })

  it('leaves the scan field empty rather than prefilling a scheme', () => {
    expect(heroScanSource).toContain("const [url, setUrl] = useState('')")
    expect(heroScanSource).toContain('placeholder="https://yourwebsite.com"')
    // A scheme with no host after it still must not enable submit.
    expect(heroScanSource).toContain('disabled={loading || !hostPart(url)}')
    expect(heroScanSource).toContain('!loading && hostPart(url)')
  })

  it('offers a one-click example for visitors who will not type a url', () => {
    expect(heroScanSource).toContain('Or try an example')
    // IANA-reserved, so the homepage never publishes a real business's low score.
    expect(heroScanSource).toContain("const EXAMPLE_URL = 'https://example.com'")
  })

  it('keeps the x-ray on the page by moving it into the problem band', () => {
    expect(source).toContain('<AgentXray />')
    expect(source).toContain('nx-home-problem-xray')
    expect(source).toContain('Your site was built for eyes.')
    expect(source).toContain('AI assistants read it differently.')
  })

  it('ties the readiness section back to the hero score', () => {
    expect(source).toContain('Six signals.')
    expect(source).toContain('Each one turns on something an AI assistant can do.')
    expect(source).toContain('the number the scan at the top of this page')
  })

  it('frames the readiness score as progress, not a grade', () => {
    // A merchant scanning for the first time must never be told their site is
    // bad. Tones describe distance travelled; red is reserved for real errors.
    expect(heroScanSource).toContain("label: 'Almost ready'")
    expect(heroScanSource).toContain("label: 'Ready to set up'")
    expect(heroScanSource).not.toContain('Hard for agents')
    expect(heroScanSource).not.toContain('Needs a few fixes')
    expect(heroScanSource).not.toContain('#ef4444')
    // Leads with what already passes, not with what is missing.
    expect(heroScanSource).toContain('evidence checks already pass')
  })

  it('keeps merchant-facing words out of the jargon bucket', () => {
    // "Transactability" ships in the /api/scan payload; the panel must never
    // render it. Same for the hero's own vocabulary: the page says "AI
    // assistant", so it must not drift back to "agent demand".
    expect(heroScanSource).toContain("transactability: 'Ways to buy'")
    expect(heroScanSource).not.toContain("'Transactability'")
    expect(source).not.toContain('agent demand')
    expect(source).toContain('Sell through AI assistants.')
    expect(source).toContain('Keep control of how you sell.')
  })

  it('gives mobile the same simulator as desktop', () => {
    // One SimulatorTeaser at every width. The compact "Open the simulator" tile
    // that used to replace it below 767px is gone.
    expect(source).toContain('<SimulatorTeaser />')
    expect(source).not.toContain('nx-home-simulator-compact')
    expect(source).not.toContain('nx-home-simulator-full')
  })

  it('keeps the simulator visible independently of human Discovery', () => {
    expect(source).toContain('The simulator demonstrates platform capability without exposing Discovery.')
    expect(source).not.toContain('MARKETPLACE_DISCOVERY_ENABLED')
  })

  it('keeps the agent simulator section at the bottom of the page', () => {
    const simulatorIndex = source.indexOf('Run a buying scenario before a real buyer does.')
    const heroScanIndex = source.indexOf('<HeroScan />')
    expect(simulatorIndex).toBeGreaterThan(-1)
    expect(heroScanIndex).toBeGreaterThan(-1)
    expect(simulatorIndex).toBeGreaterThan(heroScanIndex)
    expect(source).toContain('<SimulatorTeaser />')
  })

  it('retires the old publishing-first and absolute-claim story', () => {
    for (const phrase of retiredHomepageClaims) {
      expect(source).not.toContain(phrase)
    }
  })

  it('centers merchant control and the real commerce rails', () => {
    expect(source).toContain('Your prices stay yours.')
    expect(source).toContain('Bad-fit orders can stop before payment.')
    expect(source).toContain('Repeat work can stay repeatable.')
    expect(source).toContain("title: 'Review each sale'")
    expect(source).toContain('Run a buying scenario before a real buyer does.')
    expect(source).toContain('AI gets a buying path, not control of your business.')
  })

  it('keeps broader platform capabilities visible', () => {
    expect(source).toContain("title: 'Copilot'")
    expect(source).toContain("title: 'Your brand, your domain'")
    expect(source).toContain("title: 'Trust context'")
  })

  it('makes supported merchant integrations visible without changing the hero promise', () => {
    expect(source).toContain('Connects with the tools your business already uses')
    expect(source).toContain("const integrationRail = ['Stripe', 'Shopify', 'Square', 'Calendly', 'Acuity', 'Google Calendar']")
    expect(source).toContain('Your existing tools become')
    expect(source).toContain('one clear buying path.')
    expect(source).toContain('Review every offer before it goes live.')
    expect(source).toContain('Explore integrations')
    expect(source).toContain('Plus your website, CSV, Excel, and Zapier.')
  })

  it('keeps the mobile homepage compact without sideways content rails', () => {
    expect(source).toContain('nx-home-proof-grid')
    expect(source).toContain('nx-home-flow-mobile')
    expect(source).toContain('nx-home-story-disclosure')
    expect(source).toContain('nx-home-capabilities-disclosure')
    expect(source).toContain('nx-home-integration-mobile')
    expect(source).toContain('nx-home-workflow-mobile')
    expect(readinessSource).toContain('nx-home-readiness-grid')
    expect(styles).not.toContain('scroll-snap-type: x mandatory')
  })

  it('gives the homepage modern merchant-facing metadata', () => {
    expect(source).toContain("const metaTitle = 'Nexez - Commerce for AI agents'")
    expect(source).toContain(
      "'Help customers and AI assistants buy from your business while your prices, requirements, and rules stay under your control.'",
    )
  })
})
