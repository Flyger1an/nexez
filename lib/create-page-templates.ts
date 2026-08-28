import type { OfferItem } from './agent-page'

export type CreateTemplateId = 'consulting' | 'local-service' | 'productized-package'

export type CreatePageTemplate = {
  id: CreateTemplateId
  label: string
  notice: string
  name: string
  slug: string
  description: string
  audience: string
  industry: string
  ctaLabel: string
  servicesOffers: OfferItem[]
  faqs: Array<{ question: string; answer: string }>
}

export const createPageTemplates: CreatePageTemplate[] = [
  {
    id: 'consulting',
    label: 'Consulting session',
    notice: 'Consulting template loaded. Replace the sample business details before publishing.',
    name: 'Your Consulting Offer',
    slug: 'consulting-offer',
    description:
      'A focused advisory listing for buyers who need expert help, clear scope, pricing context, and a safe next step.',
    audience: 'Founders, operators, and teams evaluating expert advisory support',
    industry: 'Consulting & Strategy',
    ctaLabel: 'Book a strategy session',
    servicesOffers: [
      {
        name: 'Strategy Session',
        description: 'A focused 60-minute advisory call with a clear agenda, recommendations, and follow-up notes.',
        price: '$450',
        duration: '60 minutes',
        url: '',
        availability: 'available',
      },
      {
        name: 'Fixed-Scope Audit',
        description: 'A structured review of one business area with findings, prioritized fixes, and a written action plan.',
        price: 'From $1,200',
        duration: '2 weeks',
        url: '',
        availability: 'available',
      },
      {
        name: 'Monthly Advisory Retainer',
        description: 'Ongoing strategic support with recurring sessions, async guidance, and monthly priorities.',
        price: 'From $3,000/mo',
        duration: 'Monthly',
        url: '',
        offerType: 'negotiable',
        availability: 'limited',
      },
    ],
    faqs: [
      {
        question: 'Who is this best for?',
        answer: 'Teams that need expert guidance but want a clear scope before committing to a larger engagement.',
      },
      {
        question: 'Can an agent book directly?',
        answer: 'Yes. Attach your booking link or Nexez checkout to the specific offer you want agents to use.',
      },
    ],
  },
  {
    id: 'local-service',
    label: 'Local service booking',
    notice: 'Local service template loaded. Add your service area, availability, and booking link before publishing.',
    name: 'Your Local Service',
    slug: 'local-service',
    description:
      'A practical bookable service listing for buyers who need to know service area, availability, price signal, and next step fast.',
    audience: 'Local buyers looking for a trusted provider with clear availability',
    industry: 'Home Services (Plumbing, Electrical, Cleaning, etc.)',
    ctaLabel: 'Request service',
    servicesOffers: [
      {
        name: 'Standard Service Visit',
        description: 'A scheduled appointment for common jobs inside the listed service area.',
        price: 'From $150',
        duration: '60-90 minutes',
        serviceArea: 'Add your city or service radius',
        url: '',
        availability: 'available',
      },
      {
        name: 'Emergency Visit',
        description: 'Priority support for urgent issues when same-day availability is open.',
        price: 'Custom',
        duration: 'Same day when available',
        serviceArea: 'Add emergency coverage area',
        url: '',
        availability: 'limited',
      },
      {
        name: 'Quote Request',
        description: 'Send photos, notes, or job details for work that needs a custom estimate.',
        price: 'Quote required',
        duration: 'Response time varies',
        url: '',
        offerType: 'negotiable',
        availability: 'available',
      },
    ],
    faqs: [
      {
        question: 'What area do you serve?',
        answer: 'Add your cities, neighborhoods, radius, or mobile-service rules here.',
      },
      {
        question: 'Can a buyer request a custom quote?',
        answer: 'Yes. Use the quote request offer for jobs that need human review before booking.',
      },
    ],
  },
  {
    id: 'productized-package',
    label: 'Productized package',
    notice: 'Productized package template loaded. Tune the packages, price points, and checkout actions before publishing.',
    name: 'Your Productized Offer',
    slug: 'productized-offer',
    description:
      'A clean offer listing for packages buyers can compare by scope, price, delivery timeline, and purchase path.',
    audience: 'Buyers comparing clear packages before purchase or implementation',
    industry: 'Marketing & Sales',
    ctaLabel: 'Choose a package',
    servicesOffers: [
      {
        name: 'Starter Package',
        description: 'A focused entry package with defined deliverables, clear timeline, and direct purchase path.',
        price: '$999',
        duration: '1 week',
        url: '',
        availability: 'available',
      },
      {
        name: 'Implementation Package',
        description: 'A larger setup or delivery package for buyers who need done-for-you execution.',
        price: 'From $2,500',
        duration: '2-4 weeks',
        url: '',
        availability: 'available',
      },
      {
        name: 'Custom Scope',
        description: 'A flexible package for buyers whose needs exceed the standard tiers.',
        price: 'Quote required',
        duration: 'Custom',
        url: '',
        offerType: 'negotiable',
        availability: 'limited',
      },
    ],
    faqs: [
      {
        question: 'What is included?',
        answer: 'List the exact deliverables, revision limits, timelines, and support terms for each package.',
      },
      {
        question: 'Can buyers upgrade later?',
        answer: 'Explain whether buyers can move from a smaller package into implementation or custom scope.',
      },
    ],
  },
]

export function getCreatePageTemplate(id: string | null | undefined): CreatePageTemplate | undefined {
  if (!id) return undefined
  return createPageTemplates.find((template) => template.id === id)
}
