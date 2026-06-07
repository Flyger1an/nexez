import type { OfferItem } from './agent-page'

export const NEXEZ_INDUSTRIES = [
  'Accounting',
  'Acupuncture',
  'Advertising Agency',
  'AI Automation',
  'AI Consulting',
  'Appliance Repair',
  'Architecture',
  'Art Classes',
  'Attorney',
  'Auto Detailing',
  'Auto Repair',
  'Aviation Services',
  'Barber Shop',
  'Beauty Salon',
  'Bookkeeping',
  'Brand Strategy',
  'Business Coaching',
  'Business Consulting',
  'Career Coaching',
  'Carpet Cleaning',
  'Catering',
  'Child Care',
  'Chiropractic',
  'Cleaning Services',
  'Commercial Cleaning',
  'Construction',
  'Content Marketing',
  'Copywriting',
  'Counseling',
  'Creative Agency',
  'Cybersecurity',
  'Dance Instruction',
  'Dental Clinic',
  'Digital Marketing',
  'Dog Training',
  'E-commerce',
  'Electrical Services',
  'Engineering Services',
  'Event Planning',
  'Executive Coaching',
  'Family Law',
  'Financial Advisory',
  'Fitness Coaching',
  'Flooring Installation',
  'Food Truck',
  'General Contracting',
  'Graphic Design',
  'Hair Salon',
  'Handyman Services',
  'Health Clinic',
  'Home Cleaning',
  'Home Inspection',
  'Home Remodeling',
  'Home Services',
  'House Painting',
  'HVAC Services',
  'Immigration Law',
  'Insurance Agency',
  'Interior Design',
  'IT Consulting',
  'IT Services',
  'Janitorial Services',
  'Landscaping',
  'Language Lessons',
  'Lash Studio',
  'Lawn Care',
  'Legal Services',
  'Life Coaching',
  'Locksmith',
  'Logistics',
  'Makeup Artist',
  'Manufacturing',
  'Marketing Consulting',
  'Massage Therapy',
  'Meal Prep Services',
  'Medical Clinic',
  'Medical Spa',
  'Mental Health Therapy',
  'Mobile Car Wash',
  'Mobile IV Therapy',
  'Mortgage Broker',
  'Moving Services',
  'Music Lessons',
  'Nail Salon',
  'Nonprofit Services',
  'Nutrition Coaching',
  'Online Courses',
  'Pest Control',
  'Pet Care',
  'Pet Grooming',
  'Pet Sitting',
  'Photography',
  'Physical Therapy',
  'Pilates Studio',
  'Plumbing',
  'Podcast Production',
  'Pool Cleaning',
  'Pressure Washing',
  'Private Chef',
  'Product Design',
  'Property Management',
  'Real Estate',
  'Recruiting',
  'Roofing',
  'SaaS Consulting',
  'SaaS Implementation',
  'Security Services',
  'SEO Services',
  'Social Media Marketing',
  'Software Development',
  'Solar Installation',
  'Speech Therapy',
  'Staffing Agency',
  'Tax Preparation',
  'Therapy Practice',
  'Travel Agency',
  'Tutoring',
  'Veterinary Services',
  'Video Production',
  'Virtual Assistant',
  'Web Design',
  'Wedding Planning',
  'Wellness Coaching',
  'Window Cleaning',
  'Yoga Studio',
] as const

type IndustryProfile = {
  match: string[]
  keywords: string[]
  suggestions: Array<Omit<OfferItem, 'url'>>
}

const professionalSuggestions: Array<Omit<OfferItem, 'url'>> = [
  { name: 'Discovery Session', price: '$150', description: '60-minute focused call with clear next steps.', duration: '60 min' },
  { name: 'Core Engagement', price: 'From $1,800', description: 'Full delivery with priority support and review cadence.', duration: 'Ongoing' },
]

const profiles: IndustryProfile[] = [
  {
    match: ['consulting', 'strategy', 'business consulting', 'management consulting', 'saas consulting'],
    keywords: ['session', 'consult', 'strategy', 'advisory', 'audit', 'workshop', 'retainer', 'roadmap'],
    suggestions: [
      { name: 'Strategy Session', price: '$450', description: 'Focused advisory session with diagnosis, recommendations, and next-step plan.', duration: '60 min' },
      { name: 'Implementation Retainer', price: 'From $2,500/mo', description: 'Ongoing execution support with priority advisory access and monthly reviews.', duration: 'Monthly' },
    ],
  },
  {
    match: ['coaching', 'training', 'career coaching', 'business coaching', 'executive coaching', 'life coaching'],
    keywords: ['coaching', 'training', 'program', 'workshop', 'session', 'cohort', 'leadership'],
    suggestions: [
      { name: 'Coaching Package', price: '$1,200', description: 'Multi-session coaching plan with goals, accountability, and async support.', duration: '4 sessions' },
      { name: 'Team Workshop', price: 'From $2,000', description: 'Facilitated training session with practical exercises and follow-up materials.', duration: 'Half day' },
    ],
  },
  {
    match: ['marketing', 'sales', 'advertising', 'seo', 'social media', 'copywriting', 'content marketing'],
    keywords: ['marketing', 'campaign', 'sales', 'lead', 'funnel', 'copy', 'seo', 'ads', 'conversion'],
    suggestions: [
      { name: 'Growth Audit', price: '$750', description: 'Review of messaging, funnel, and conversion paths with prioritized fixes.', duration: '1 week' },
      { name: 'Campaign Buildout', price: 'From $2,500', description: 'Strategy, copy, landing page direction, and launch support for one campaign.', duration: '2-4 weeks' },
    ],
  },
  {
    match: ['creative', 'design', 'photography', 'video', 'brand', 'graphic design', 'web design', 'podcast', 'production', 'product design'],
    keywords: ['design', 'brand', 'creative', 'logo', 'photo', 'video', 'shoot', 'content', 'asset'],
    suggestions: [
      { name: 'Creative Direction Sprint', price: 'From $1,500', description: 'Brand or content direction with moodboards, concepts, and production plan.', duration: '1-2 weeks' },
      { name: 'Production Package', price: 'Custom', description: 'Scoped creative production with deliverables, timeline, and revision details.', duration: 'Project based' },
    ],
  },
  {
    match: ['software', 'it', 'ai automation', 'ai consulting', 'operations', 'cybersecurity', 'saas implementation', 'automation'],
    keywords: ['software', 'automation', 'ai', 'workflow', 'integration', 'implementation', 'support', 'system', 'ops', 'security', 'dashboard', 'app', 'portal'],
    suggestions: [
      { name: 'Automation Audit', price: '$900', description: 'Workflow review with automation opportunities, system map, and implementation roadmap.', duration: '1 week' },
      { name: 'Implementation Sprint', price: 'From $3,500', description: 'Build and launch of one workflow, integration, or internal tool.', duration: '2-4 weeks' },
    ],
  },
  {
    match: ['legal', 'professional', 'attorney', 'law', 'family law', 'immigration law'],
    keywords: ['legal', 'contract', 'compliance', 'filing', 'review', 'consultation', 'policy', 'visa', 'immigration', 'custody', 'estate'],
    suggestions: [
      { name: 'Document Review', price: 'From $350', description: 'Review of one agreement or policy with clear notes and recommended edits.', duration: '3-5 days' },
      { name: 'Legal Consultation', price: '$250', description: 'Focused consultation for issue triage, options, and next steps.', duration: '45 min' },
    ],
  },
  {
    match: ['accounting', 'tax', 'bookkeeping', 'finance', 'insurance', 'advisory', 'mortgage'],
    keywords: ['tax', 'bookkeeping', 'accounting', 'finance', 'insurance', 'planning', 'payroll', 'filing', 'mortgage', 'loan', 'advisory'],
    suggestions: [
      { name: 'Financial Review', price: '$300', description: 'Review of current records, gaps, and recommendations for cleaner reporting.', duration: '60 min' },
      { name: 'Monthly Support', price: 'From $500/mo', description: 'Recurring bookkeeping, reporting, or advisory support with monthly check-ins.', duration: 'Monthly' },
    ],
  },
  {
    match: ['real estate', 'property management', 'mortgage broker'],
    keywords: ['real estate', 'listing', 'buyer', 'seller', 'property', 'valuation', 'showing', 'lease'],
    suggestions: [
      { name: 'Buyer Consultation', price: 'Free', description: 'Needs review, market overview, and next steps for active buyers.', duration: '45 min' },
      { name: 'Listing Strategy Session', price: 'Free', description: 'Property review, pricing direction, and launch plan for sellers.', duration: '60 min' },
    ],
  },
  {
    match: ['recruiting', 'hr', 'staffing', 'talent'],
    keywords: ['recruiting', 'hiring', 'hr', 'talent', 'candidate', 'interview', 'onboarding', 'policy'],
    suggestions: [
      { name: 'Hiring Sprint', price: 'From $2,000', description: 'Role definition, sourcing support, screening, and shortlist delivery.', duration: '2-4 weeks' },
      { name: 'HR Policy Review', price: '$750', description: 'Review of people policies, onboarding flow, and compliance gaps.', duration: '1 week' },
    ],
  },
  {
    match: ['education', 'tutoring', 'lessons', 'language lessons', 'music lessons', 'online courses', 'art classes', 'dance instruction'],
    keywords: ['tutoring', 'lesson', 'class', 'course', 'education', 'training', 'student', 'curriculum'],
    suggestions: [
      { name: 'Private Tutoring Session', price: '$75', description: 'One-on-one instruction with goals, practice plan, and progress notes.', duration: '60 min' },
      { name: 'Course Package', price: 'From $400', description: 'Multi-session learning plan with structured milestones and materials.', duration: '4 weeks' },
    ],
  },
  {
    match: ['health', 'medical', 'mental health', 'therapy', 'wellness', 'fitness', 'yoga', 'clinic', 'dental', 'chiropractic', 'acupuncture', 'physical therapy', 'speech therapy', 'medical spa', 'mobile iv', 'nutrition', 'pilates'],
    keywords: ['health', 'medical', 'therapy', 'wellness', 'fitness', 'yoga', 'session', 'treatment', 'care', 'intake', 'clinic', 'dental', 'chiropractic', 'iv therapy', 'nutrition'],
    suggestions: [
      { name: 'Initial Consultation', price: 'Custom', description: 'Intake session to understand needs, eligibility, and recommended next steps.', duration: '45-60 min' },
      { name: 'Follow-up Session', price: 'Custom', description: 'Recurring appointment for continued care, support, or training.', duration: '60 min' },
    ],
  },
  {
    match: ['beauty', 'personal care', 'hair', 'barber', 'makeup', 'lash', 'nail', 'salon'],
    keywords: ['beauty', 'hair', 'makeup', 'skin', 'nails', 'salon', 'appointment', 'treatment'],
    suggestions: [
      { name: 'Signature Appointment', price: 'From $95', description: 'Core beauty service with consultation, treatment, and aftercare notes.', duration: '60-90 min' },
      { name: 'Event Styling Package', price: 'From $250', description: 'Hair, makeup, or prep package for weddings, shoots, or special events.', duration: '2 hours' },
    ],
  },
  {
    match: ['home services', 'cleaning', 'maintenance', 'landscaping', 'construction', 'renovation', 'plumbing', 'hvac', 'electrical', 'roofing', 'handyman', 'painting', 'flooring', 'locksmith', 'pest control', 'pool cleaning', 'pressure washing', 'window cleaning', 'appliance repair', 'moving'],
    keywords: ['home', 'repair', 'maintenance', 'cleaning', 'landscaping', 'renovation', 'inspection', 'estimate', 'service call', 'plumbing', 'hvac', 'electrical', 'roof', 'handyman', 'pressure washing', 'window', 'pest', 'pool'],
    suggestions: [
      { name: 'Standard Service Call', price: 'From $129', description: 'On-site diagnosis with minor repair or clear estimate for next work.', duration: '60 min', isMobile: true, serviceArea: 'Local metro' },
      { name: 'Project Estimate', price: 'Free', description: 'Scope review, timeline, and quote for larger service or renovation projects.', duration: '30-60 min', isMobile: true },
    ],
  },
  {
    match: ['automotive', 'auto', 'car wash', 'car detailing', 'vehicle'],
    keywords: ['auto', 'car', 'vehicle', 'detail', 'repair', 'inspection', 'maintenance', 'mobile'],
    suggestions: [
      { name: 'Mobile Car Detailing', price: 'From $149', description: 'Interior and exterior detail completed at the customer location.', duration: '2-3 hours', isMobile: true },
      { name: 'Vehicle Service Appointment', price: 'Custom', description: 'Inspection or maintenance visit with clear estimate and service notes.', duration: '60-90 min' },
    ],
  },
  {
    match: ['pet', 'veterinary', 'dog training', 'pet sitting', 'pet grooming'],
    keywords: ['pet', 'dog', 'cat', 'groom', 'boarding', 'walking', 'training', 'care'],
    suggestions: [
      { name: 'Full Grooming Package', price: '$85', description: 'Bath, haircut, nail trim, ear cleaning, and basic coat care.', duration: '90-120 min', isMobile: true },
      { name: 'Pet Care Visit', price: 'From $30', description: 'Drop-in visit for feeding, walking, medication, or basic care.', duration: '30 min', isMobile: true },
    ],
  },
  {
    match: ['events', 'experiences', 'travel', 'hospitality', 'food', 'catering', 'wedding', 'private chef', 'meal prep', 'food truck'],
    keywords: ['event', 'experience', 'travel', 'booking', 'catering', 'menu', 'reservation', 'venue', 'guest'],
    suggestions: [
      { name: 'Event Planning Consultation', price: '$150', description: 'Planning session covering goals, budget, guest needs, and next steps.', duration: '60 min' },
      { name: 'Package Quote', price: 'Custom', description: 'Custom quote for event, catering, travel, or guest experience services.', duration: 'Project based' },
    ],
  },
  {
    match: ['retail', 'e-commerce', 'ecommerce', 'shop', 'store'],
    keywords: ['product', 'shop', 'store', 'bundle', 'shipping', 'inventory', 'subscription', 'order', 'checkout', 'delivery', 'variant'],
    suggestions: [
      { name: 'Featured Product Bundle', price: 'Custom', description: 'Curated product bundle with clear purchase path and shipping details.' },
      { name: 'Subscription Offer', price: 'From $49/mo', description: 'Recurring product or replenishment plan with predictable delivery.' },
    ],
  },
  {
    match: ['manufacturing', 'industrial', 'logistics', 'delivery', 'engineering', 'aviation'],
    keywords: ['manufacturing', 'industrial', 'logistics', 'delivery', 'quote', 'capacity', 'fulfillment', 'supply'],
    suggestions: [
      { name: 'Custom Quote Request', price: 'Custom', description: 'Structured request for scope, volume, timeline, and fulfillment needs.' },
      { name: 'Pilot Order', price: 'Custom', description: 'Small initial order or service run to confirm requirements before scaling.' },
    ],
  },
  {
    match: ['nonprofit', 'community'],
    keywords: ['nonprofit', 'community', 'program', 'donation', 'volunteer', 'membership', 'event'],
    suggestions: [
      { name: 'Program Inquiry', price: 'Free', description: 'Guided intake for community programs, eligibility, and next steps.', duration: '30 min' },
      { name: 'Partnership Call', price: 'Free', description: 'Intro call for sponsors, partners, volunteers, or community stakeholders.', duration: '30 min' },
    ],
  },
]

export function getIndustrySuggestions(industry: string, baseUrl = ''): OfferItem[] {
  const profile = findIndustryProfile(industry)
  return profile.suggestions.map((offer) => ({ ...offer, url: baseUrl }))
}

export function industrySeeds(industry: string | null | undefined, baseUrl: string): OfferItem[] {
  return getIndustrySuggestions(industry || '', baseUrl).slice(0, 2)
}

export function getIndustryBoostKeywords(industry?: string | null): string[] {
  return findIndustryProfile(industry || '').keywords
}

function findIndustryProfile(industry: string): IndustryProfile {
  const value = industry.toLowerCase()
  return profiles.find((profile) => profile.match.some((term) => value.includes(term))) ?? {
    match: [],
    keywords: ['session', 'consult', 'strategy', 'coaching', 'engagement', 'discovery', 'retainer', 'quote', 'package', 'booking'],
    suggestions: professionalSuggestions,
  }
}
