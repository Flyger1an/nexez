import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  UserRoundCheck,
} from 'lucide-react'
import { appUrl } from '../../lib/site'
import { safeJsonScript } from '../../lib/safe-json'

export const HOW_IT_WORKS_COPY = {
  hero: {
    eyebrow: 'How it works',
    title: 'Set up your business once.',
    accent: 'Let Nexez handle the details.',
    description:
      'Tell Nexez what you sell and how you want to sell it. Customers and AI assistants can then choose the right service, answer the questions you need, and place an order within the rules you set.',
  },
  steps: [
    {
      eyebrow: 'Step 1',
      title: 'Tell Nexez what you sell.',
      copy:
        'Start with your website, connect tools you already use, or enter your services yourself. Nexez helps turn what you already have into clear offers buyers can understand.',
      cards: [
        {
          title: 'Start with what you have',
          copy: 'Bring in your existing services instead of rebuilding your business from a blank page.',
        },
        {
          title: 'Keep your offers clear',
          copy: 'Show what each service includes, what it costs, and what a buyer needs to choose.',
        },
        {
          title: 'Ask for the details you need',
          copy: 'Collect things like size, quantity, service type, preferences, or other details before an order moves forward.',
        },
      ],
    },
    {
      eyebrow: 'Step 2',
      title: 'Set how you want to do business.',
      copy:
        'You decide the prices, choices, limits, and requirements Nexez should follow. These are your business rules - Nexez does not make them up for you.',
      cards: [
        {
          title: 'Set prices and options',
          copy: 'Choose your starting price and how common options or add-ons change what the buyer pays.',
        },
        {
          title: 'Decide what fits',
          copy: 'Set requirements for the work you will accept. If a request falls outside your rules, Nexez can stop instead of guessing.',
        },
        {
          title: 'Support repeat business',
          copy: 'Offer repeat services when it makes sense, and decide which purchases can move forward automatically.',
        },
      ],
    },
    {
      eyebrow: 'Step 3',
      title: 'Let people and AI shop your services.',
      copy:
        'A customer or AI assistant can choose a service, provide the needed details, and see the right next step without digging through pages of your website.',
      cards: [
        {
          title: 'They choose what they need',
          copy: 'Buyers see the services and choices you actually offer, not a made-up version of your business.',
        },
        {
          title: 'Nexez checks the details',
          copy: 'Before money moves, Nexez checks the buyer’s answers against your pricing and business rules.',
        },
        {
          title: 'The right next step follows',
          copy: 'A fitting request can move toward payment. A request that needs more attention can stop instead of slipping through.',
        },
      ],
    },
    {
      eyebrow: 'Step 4',
      title: 'Stay in control after the sale.',
      copy:
        'Nexez keeps the important order details together so you know what was chosen, what was approved, and what the customer paid for.',
      cards: [
        {
          title: 'Get paid',
          copy: 'When an offer is ready for direct purchase, Nexez gives the buyer a clear path to checkout.',
        },
        {
          title: 'Keep the order clear',
          copy: 'The service, buyer choices, price, and other important details stay tied to the order.',
        },
        {
          title: 'Change your rules anytime',
          copy: 'Update your offers as your business changes. New buyers see the latest choices and limits you have set.',
        },
      ],
    },
  ],
  faq: [
    {
      title: 'Do I need to be technical?',
      copy: 'No. Nexez is designed so you can set up and manage your offers in plain language. Technical tools are available for teams that want them, but they are not required to get started.',
    },
    {
      title: 'Does Nexez replace my website?',
      copy: 'No. Your website can keep doing what it does best. Nexez gives buyers and AI assistants a clearer way to understand your offers and take the next step.',
    },
    {
      title: 'Can an AI change my prices or rules?',
      copy: 'No. Nexez uses the prices, choices, and limits you set. When a request does not fit those rules, Nexez can stop instead of inventing an answer.',
    },
    {
      title: 'What if I do not want every order to happen automatically?',
      copy: 'That is fine. You choose what can move forward. Requests that do not meet your rules can be stopped before payment rather than being pushed through.',
    },
  ],
} as const

const primaryHref = appUrl('/create')

function Hero() {
  const journey = [
    {
      title: 'Your business',
      copy: 'Services, prices, choices, and preferences',
      icon: Store,
      tone: 'var(--fg-muted)',
    },
    {
      title: 'Nexez',
      copy: 'Checks the details, price, and fit',
      icon: Sparkles,
      tone: 'var(--signal)',
    },
    {
      title: 'Customer or AI',
      copy: 'Chooses, pays, or gets the right next step',
      icon: Bot,
      tone: 'var(--ready)',
    },
  ]

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="nx-grid" />
        <div
          className="nx-orb !opacity-25"
          style={{
            width: '34rem',
            height: '34rem',
            top: '-12rem',
            left: '-6rem',
            background: 'radial-gradient(circle at 30% 30%, var(--signal), transparent 62%)',
          }}
        />
        <div
          className="nx-orb !opacity-20"
          style={{
            width: '26rem',
            height: '26rem',
            top: '-4rem',
            right: '-6rem',
            background: 'radial-gradient(circle at 60% 40%, var(--ready), transparent 60%)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.8fr)] lg:items-center lg:py-24">
        <div>
          <div className="eyebrow">{HOW_IT_WORKS_COPY.hero.eyebrow}</div>
          <h1 className="mt-5 text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-7xl">
            {HOW_IT_WORKS_COPY.hero.title}{' '}
            <span className="nx-accent-text">{HOW_IT_WORKS_COPY.hero.accent}</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            {HOW_IT_WORKS_COPY.hero.description}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={primaryHref} className="btn-primary h-11 px-5">
              Get listed
              <ArrowRight className="size-4" />
            </a>
            <a href="/simulator" className="btn-secondary h-11 px-5">
              See what AI sees
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {['No coding required', 'You set the rules', 'Start with what you already have'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[var(--ready)]" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="nx-glass-panel p-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <p className="text-sm font-medium">From your offers to an order</p>
            <span className="text-xs text-muted-foreground">You stay in control</span>
          </div>
          <div className="mt-5 space-y-3">
            {journey.map((item, index) => {
              const Icon = item.icon
              return (
                <div key={item.title}>
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-white/[0.03] p-4">
                    <div
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg border"
                      style={{
                        borderColor: `color-mix(in srgb, ${item.tone} 40%, transparent)`,
                        background: `color-mix(in srgb, ${item.tone} 12%, transparent)`,
                      }}
                    >
                      <Icon className="size-5" style={{ color: item.tone }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: item.tone }}>{item.title}</p>
                      <p className="text-xs leading-5 text-muted-foreground">{item.copy}</p>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">0{index + 1}</span>
                  </div>
                  {index < journey.length - 1 ? (
                    <div className="ml-[2.05rem] h-6 border-l border-[var(--signal)]/35" />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function OrderExample() {
  return (
    <section className="border-b border-border bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.76fr_1.24fr] lg:items-start">
          <div>
            <p className="text-sm font-medium text-[var(--signal)]">A simple example</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              A buyer asks. Nexez checks. Your rules decide what happens next.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              Imagine you offer home cleaning. You decide which home sizes you serve, how options change the price,
              whether pets are okay, and whether buyers can book repeat service. Nexez uses those choices when someone
              wants to buy.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <ExampleCard
              icon={UserRoundCheck}
              title="1. Buyer gives the details"
              copy="Four bedrooms, two dogs, and cleaning every other week. Nexez collects the answers your offer asks for."
            />
            <ExampleCard
              icon={ClipboardCheck}
              title="2. Nexez checks your rules"
              copy="It uses your prices and requirements to work out whether the request fits and what the buyer should pay."
            />
            <ExampleCard
              icon={CreditCard}
              title="3. The right action follows"
              copy="If the request fits, the buyer can move forward. If it does not, Nexez stops instead of guessing or changing your rules."
            />
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-[var(--ready)]/25 bg-[var(--ready)]/10 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <ShieldCheck className="size-6 shrink-0 text-[var(--ready)]" />
            <div>
              <p className="font-medium text-[var(--ready)]">The important part: Nexez follows your business.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                AI can help a buyer shop, but it does not get permission to invent your price, ignore your requirements,
                or promise work you did not agree to do.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ExampleCard({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof UserRoundCheck
  title: string
  copy: string
}) {
  return (
    <div className="nx-tile p-5">
      <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--signal)]/30 bg-[var(--signal)]/10">
        <Icon className="size-5 text-[var(--signal)]" />
      </div>
      <h3 className="mt-4 text-lg font-medium tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
    </div>
  )
}

const stepIcons = [Settings2, ShieldCheck, Bot, CircleDollarSign] as const

function Steps() {
  return (
    <>
      {HOW_IT_WORKS_COPY.steps.map((step, index) => {
        const Icon = stepIcons[index]
        return (
          <section key={step.title} className={`border-b border-border ${index % 2 === 1 ? 'bg-white/[0.015]' : ''}`}>
            <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
              <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
                <div>
                  <div className="flex items-center gap-2 text-[var(--signal)]">
                    <Icon className="size-5" />
                    <p className="text-sm font-medium">{step.eyebrow}</p>
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">{step.title}</h2>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">{step.copy}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {step.cards.map((card) => (
                    <div key={card.title} className="nx-tile p-5">
                      <CheckCircle2 className="size-5 text-[var(--ready)]" />
                      <h3 className="mt-4 text-lg font-medium tracking-tight">{card.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.copy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )
      })}
    </>
  )
}

function SimulatorCallout() {
  return (
    <section className="border-b border-border bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="nx-glass-panel grid gap-8 p-6 md:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-[var(--signal)]">
              <Bot className="size-5" />
              <p className="text-sm font-medium">See it before a real buyer does</p>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">
              See how an AI assistant understands your business.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              The simulator lets you see what an AI assistant can understand about your offers and what it still needs
              to know. If something is unclear, you can improve it before relying on a real order.
            </p>
            <a href="/simulator" className="btn-primary mt-7 h-11 px-5">
              Try the simulator
              <ArrowRight className="size-4" />
            </a>
          </div>

          <div className="rounded-xl border border-border bg-white/[0.03] p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What the simulator can show</p>
            <div className="mt-4 space-y-3">
              {[
                ['What you sell', 'Can the buyer find the right service?'],
                ['What it costs', 'Can Nexez work out the price from the choices you set?'],
                ['Whether it fits', 'Does the request meet the requirements you set?'],
                ['What happens next', 'Can the buyer move forward, or should the request stop?'],
              ].map(([title, copy]) => (
                <div key={title} className="flex gap-3 rounded-lg border border-border bg-black/10 p-4">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--ready)]" />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section className="border-b border-border">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonScript({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: HOW_IT_WORKS_COPY.faq.map((item) => ({
              '@type': 'Question',
              name: item.title,
              acceptedAnswer: { '@type': 'Answer', text: item.copy },
            })),
          }),
        }}
      />
      <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-medium text-[var(--signal)]">Questions</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] md:text-5xl">The simple answers.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {HOW_IT_WORKS_COPY.faq.map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-white/[0.03] p-5">
              <h3 className="text-base font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="nx-orb !opacity-20"
          style={{
            width: '34rem',
            height: '34rem',
            bottom: '-22rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'radial-gradient(circle at 50% 50%, var(--signal), transparent 62%)',
          }}
        />
      </div>
      <div className="relative z-10 mx-auto max-w-3xl px-5 py-20 text-center md:py-24">
        <RefreshCw className="mx-auto size-7 text-[var(--signal)]" />
        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.055em] md:text-6xl">Make your business easier to buy.</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
          Set up your offers, choose the rules Nexez should follow, and be ready when the next buyer is a person or an AI assistant.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={primaryHref} className="btn-primary h-11 px-5">
            Get listed
            <ArrowRight className="size-4" />
          </a>
          <a href="/simulator" className="btn-secondary h-11 px-5">
            Try the simulator
          </a>
        </div>
      </div>
    </section>
  )
}

export function HowItWorksExperience() {
  return (
    <main className="min-h-screen">
      <Hero />
      <OrderExample />
      <Steps />
      <SimulatorCallout />
      <Faq />
      <FinalCta />
    </main>
  )
}
