import {
  createNexezClient,
  type ApprovedCheckoutInput,
  type ApprovedNegotiationInput,
  type CheckoutInput,
  type DirectoryCategory,
  type JsonValue,
  type NegotiationInput,
  type NexezClient,
  type NexezMarketplacePriceBand,
} from './index.js'

export type NexezJsonSchema = Record<string, unknown>
export type NexezToolInput = Record<string, unknown>

export type NexezAgentToolDefinition = {
  name: NexezAgentToolName
  description: string
  inputSchema: NexezJsonSchema
}

const searchProperties = {
  query: { type: 'string', description: 'Buyer request or intent.' },
  location: { type: 'string', description: 'City, region, country, or service area.' },
  limit: { type: 'integer', minimum: 1, maximum: 50 },
  category: { type: 'string', enum: ['all', 'professional', 'consumer'] },
  industry: { type: 'string' },
  minReadiness: { type: 'integer', minimum: 0, maximum: 100 },
  minTrust: { type: 'integer', minimum: 0, maximum: 100 },
  verified: { type: 'boolean' },
  supportsCheckout: { type: 'boolean' },
  supportsNegotiation: { type: 'boolean' },
  priceBand: { type: 'string', enum: ['free', 'under_100', '100_500', '500_2000', '2000_plus', 'custom'] },
  lat: { type: 'number' },
  lng: { type: 'number' },
}

const checkoutProperties = {
  slug: { type: 'string', description: 'Nexez page slug.' },
  offer: { type: 'string', description: 'Offer key returned by search or agent.json.' },
  query: { type: 'string' },
  buyerEmail: { type: 'string' },
  buyerName: { type: 'string' },
  buyerReference: { type: 'string' },
  buyerAgent: { type: 'string' },
  approvalToken: { type: 'string', description: 'Token returned by the matching validation call.' },
}

const negotiationProperties = {
  slug: { type: 'string', description: 'Nexez page slug.' },
  offer: { type: 'string', description: 'Offer key returned by search or agent.json.' },
  query: { type: 'string' },
  budget: { type: 'string' },
  timeline: { type: 'string' },
  contact: { type: 'string' },
  buyerAgent: { type: 'string' },
  requestedTerms: { type: 'object', additionalProperties: true },
  negotiationId: { type: 'string' },
  statusToken: { type: 'string' },
  approvalToken: { type: 'string', description: 'Token returned by the matching validation call.' },
}

export const NEXEZ_AGENT_TOOL_DEFINITIONS = [
  {
    name: 'nexez_search',
    description: 'Search ranked Nexez offers by buyer intent, location, quality, capability, and price signals.',
    inputSchema: { type: 'object', properties: searchProperties, required: ['query'], additionalProperties: false },
  },
  {
    name: 'nexez_directory',
    description: 'Browse published Nexez sellers by category, readiness, query, and location.',
    inputSchema: {
      type: 'object',
      properties: {
        query: searchProperties.query,
        category: searchProperties.category,
        minReadiness: searchProperties.minReadiness,
        location: searchProperties.location,
        lat: searchProperties.lat,
        lng: searchProperties.lng,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'nexez_get_page',
    description: 'Read one seller page manifest and its current offer keys.',
    inputSchema: {
      type: 'object',
      properties: { slug: checkoutProperties.slug },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'nexez_validate_checkout',
    description: 'Validate an exact checkout action without starting a payment or booking.',
    inputSchema: {
      type: 'object',
      properties: checkoutProperties,
      required: ['slug', 'offer'],
      additionalProperties: false,
    },
  },
  {
    name: 'nexez_start_checkout',
    description: 'Start the validated checkout only after explicit buyer approval.',
    inputSchema: {
      type: 'object',
      properties: {
        ...checkoutProperties,
        userApproved: { type: 'boolean', const: true },
        idempotencyKey: { type: 'string', minLength: 16, maxLength: 255 },
      },
      required: ['slug', 'offer', 'userApproved'],
      additionalProperties: false,
    },
  },
  {
    name: 'nexez_validate_negotiation',
    description: 'Validate proposal terms without creating a seller-facing negotiation turn.',
    inputSchema: {
      type: 'object',
      properties: negotiationProperties,
      required: ['slug', 'offer'],
      additionalProperties: false,
    },
  },
  {
    name: 'nexez_submit_negotiation',
    description: 'Submit the validated proposal only after explicit buyer approval.',
    inputSchema: {
      type: 'object',
      properties: {
        ...negotiationProperties,
        userApproved: { type: 'boolean', const: true },
        idempotencyKey: { type: 'string', minLength: 16, maxLength: 255 },
      },
      required: ['slug', 'offer', 'userApproved'],
      additionalProperties: false,
    },
  },
  {
    name: 'nexez_get_negotiation_status',
    description: 'Read the latest negotiation decision with its private status credential.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string' },
        statusToken: { type: 'string' },
      },
      required: ['negotiationId', 'statusToken'],
      additionalProperties: false,
    },
  },
  {
    name: 'nexez_wait_for_negotiation_decision',
    description: 'Poll a pending negotiation until a decision arrives or the bounded wait expires.',
    inputSchema: {
      type: 'object',
      properties: {
        negotiationId: { type: 'string' },
        statusToken: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1, maximum: 300_000 },
        intervalMs: { type: 'integer', minimum: 1_000, maximum: 30_000 },
      },
      required: ['negotiationId', 'statusToken'],
      additionalProperties: false,
    },
  },
] as const

export type NexezAgentToolName =
  | 'nexez_search'
  | 'nexez_directory'
  | 'nexez_get_page'
  | 'nexez_validate_checkout'
  | 'nexez_start_checkout'
  | 'nexez_validate_negotiation'
  | 'nexez_submit_negotiation'
  | 'nexez_get_negotiation_status'
  | 'nexez_wait_for_negotiation_decision'

export type NexezAgentToolExecutor = (input: NexezToolInput) => Promise<unknown>
export type NexezAgentToolExecutors = Record<NexezAgentToolName, NexezAgentToolExecutor>

export function createNexezAgentToolExecutors(
  client: NexezClient = createNexezClient(),
): NexezAgentToolExecutors {
  return {
    nexez_search: (input) => client.search(requiredString(input, 'query'), {
      limit: optionalNumber(input, 'limit'),
      location: optionalString(input, 'location'),
      category: optionalString(input, 'category') as DirectoryCategory | undefined,
      industry: optionalString(input, 'industry'),
      minReadiness: optionalNumber(input, 'minReadiness'),
      minTrust: optionalNumber(input, 'minTrust'),
      verified: optionalBoolean(input, 'verified'),
      supportsCheckout: optionalBoolean(input, 'supportsCheckout'),
      supportsNegotiation: optionalBoolean(input, 'supportsNegotiation'),
      priceBand: optionalString(input, 'priceBand') as NexezMarketplacePriceBand | undefined,
      lat: optionalNumber(input, 'lat'),
      lng: optionalNumber(input, 'lng'),
    }),
    nexez_directory: (input) => client.browseDirectory({
      query: optionalString(input, 'query'),
      category: optionalString(input, 'category') as DirectoryCategory | undefined,
      minReadiness: optionalNumber(input, 'minReadiness'),
      location: optionalString(input, 'location'),
      lat: optionalNumber(input, 'lat'),
      lng: optionalNumber(input, 'lng'),
    }),
    nexez_get_page: (input) => client.getAgentPage(requiredString(input, 'slug')),
    nexez_validate_checkout: (input) => client.validateCheckout(checkoutInput(input)),
    nexez_start_checkout: (input) => client.startCheckout(approvedCheckoutInput(input), {
      idempotencyKey: optionalString(input, 'idempotencyKey'),
    }),
    nexez_validate_negotiation: (input) => client.validateNegotiation(negotiationInput(input)),
    nexez_submit_negotiation: (input) => client.submitNegotiation(approvedNegotiationInput(input), {
      idempotencyKey: optionalString(input, 'idempotencyKey'),
    }),
    nexez_get_negotiation_status: (input) => client.getNegotiationStatus({
      negotiationId: requiredString(input, 'negotiationId'),
      statusToken: requiredString(input, 'statusToken'),
    }),
    nexez_wait_for_negotiation_decision: (input) => client.waitForNegotiationDecision({
      negotiationId: requiredString(input, 'negotiationId'),
      statusToken: requiredString(input, 'statusToken'),
      timeoutMs: optionalNumber(input, 'timeoutMs'),
      intervalMs: optionalNumber(input, 'intervalMs'),
    }),
  }
}

export function createOpenAiFunctionTools() {
  return NEXEZ_AGENT_TOOL_DEFINITIONS.map((definition) => ({
    type: 'function' as const,
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.inputSchema,
      strict: false,
    },
  }))
}

export function createVercelAiSdkTools<TSchema>(
  jsonSchema: (schema: NexezJsonSchema) => TSchema,
  client: NexezClient = createNexezClient(),
) {
  const executors = createNexezAgentToolExecutors(client)
  return Object.fromEntries(NEXEZ_AGENT_TOOL_DEFINITIONS.map((definition) => [
    definition.name,
    {
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      execute: executors[definition.name],
    },
  ])) as Record<NexezAgentToolName, {
    description: string
    inputSchema: TSchema
    execute: NexezAgentToolExecutor
  }>
}

function checkoutInput(input: NexezToolInput): CheckoutInput {
  return compact({
    slug: requiredString(input, 'slug'),
    offer: requiredString(input, 'offer'),
    query: optionalString(input, 'query'),
    buyerEmail: optionalString(input, 'buyerEmail'),
    buyerName: optionalString(input, 'buyerName'),
    buyerReference: optionalString(input, 'buyerReference'),
    buyerAgent: optionalString(input, 'buyerAgent'),
    approvalToken: optionalString(input, 'approvalToken'),
  }) as CheckoutInput
}

function approvedCheckoutInput(input: NexezToolInput): ApprovedCheckoutInput {
  return { ...checkoutInput(input), userApproved: requireApproval(input) }
}

function negotiationInput(input: NexezToolInput): NegotiationInput {
  return compact({
    slug: requiredString(input, 'slug'),
    offer: requiredString(input, 'offer'),
    query: optionalString(input, 'query'),
    budget: optionalString(input, 'budget'),
    timeline: optionalString(input, 'timeline'),
    contact: optionalString(input, 'contact'),
    buyerAgent: optionalString(input, 'buyerAgent'),
    requestedTerms: optionalRecord(input, 'requestedTerms') as Record<string, JsonValue> | undefined,
    negotiationId: optionalString(input, 'negotiationId'),
    statusToken: optionalString(input, 'statusToken'),
    approvalToken: optionalString(input, 'approvalToken'),
  }) as NegotiationInput
}

function approvedNegotiationInput(input: NexezToolInput): ApprovedNegotiationInput {
  return { ...negotiationInput(input), userApproved: requireApproval(input) }
}

function requireApproval(input: NexezToolInput): true {
  if (input.userApproved !== true) {
    throw new TypeError('userApproved must be true after explicit buyer approval.')
  }
  return true
}

function requiredString(input: NexezToolInput, key: string) {
  const value = optionalString(input, key)
  if (!value) throw new TypeError(`${key} must be a non-empty string.`)
  return value
}

function optionalString(input: NexezToolInput, key: string) {
  const value = input[key]
  if (value == null) return undefined
  if (typeof value !== 'string') throw new TypeError(`${key} must be a string.`)
  return value
}

function optionalNumber(input: NexezToolInput, key: string) {
  const value = input[key]
  if (value == null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${key} must be a finite number.`)
  return value
}

function optionalBoolean(input: NexezToolInput, key: string) {
  const value = input[key]
  if (value == null) return undefined
  if (typeof value !== 'boolean') throw new TypeError(`${key} must be a boolean.`)
  return value
}

function optionalRecord(input: NexezToolInput, key: string) {
  const value = input[key]
  if (value == null) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${key} must be an object.`)
  return value as Record<string, unknown>
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}
