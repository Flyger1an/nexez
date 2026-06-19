import { Type } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';
import { browseDirectory, getAgentPage, searchAgentPages, startCheckout, submitNegotiation, validateCheckout, validateNegotiation, } from './nexez-client.js';
const configSchema = Type.Object({
    baseUrl: Type.Optional(Type.String({ description: 'Optional Nexez API base URL. Defaults to https://nexez.app.' })),
    userAgent: Type.Optional(Type.String({ description: 'Optional User-Agent sent to Nexez public endpoints.' })),
}, { additionalProperties: false });
const querySchema = Type.Object({
    query: Type.Optional(Type.String({ description: 'Buyer request, such as "strategy consultant under $3k".' })),
    location: Type.Optional(Type.String({ description: 'City, region, country, or service area.' })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, description: 'Maximum number of results.' })),
    lat: Type.Optional(Type.Number({ description: 'Optional buyer latitude.' })),
    lng: Type.Optional(Type.Number({ description: 'Optional buyer longitude.' })),
}, { additionalProperties: false });
const checkoutSchema = Type.Object({
    slug: Type.String({ description: 'Nexez page slug.' }),
    offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
    query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
    buyerEmail: Type.Optional(Type.String({ description: 'Buyer email, only after user approval.' })),
    buyerName: Type.Optional(Type.String({ description: 'Buyer name or organization, only after user approval.' })),
    buyerReference: Type.Optional(Type.String({ description: 'Optional buyer-side order/reference id.' })),
    buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
}, { additionalProperties: false });
const approvedCheckoutSchema = Type.Object({
    slug: Type.String({ description: 'Nexez page slug.' }),
    offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
    query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
    buyerEmail: Type.Optional(Type.String({ description: 'Buyer email, only after user approval.' })),
    buyerName: Type.Optional(Type.String({ description: 'Buyer name or organization, only after user approval.' })),
    buyerReference: Type.Optional(Type.String({ description: 'Optional buyer-side order/reference id.' })),
    buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
    userApproved: Type.Boolean({ description: 'Must be true only after explicit user approval of business, offer, price, and contact details.' }),
}, { additionalProperties: false });
const requestedTermsSchema = Type.Record(Type.String(), Type.Unsafe({}));
const negotiationSchema = Type.Object({
    slug: Type.String({ description: 'Nexez page slug.' }),
    offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
    query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
    budget: Type.Optional(Type.String({ description: 'Buyer budget or price target.' })),
    timeline: Type.Optional(Type.String({ description: 'Desired start date, deadline, or delivery timeline.' })),
    contact: Type.Optional(Type.String({ description: 'Buyer contact info, only after user approval.' })),
    buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
    requestedTerms: Type.Optional(requestedTermsSchema),
}, { additionalProperties: false });
const approvedNegotiationSchema = Type.Object({
    slug: Type.String({ description: 'Nexez page slug.' }),
    offer: Type.String({ description: 'Offer key, such as services-0 or products-0.' }),
    query: Type.Optional(Type.String({ description: 'Buyer request or context.' })),
    budget: Type.Optional(Type.String({ description: 'Buyer budget or price target.' })),
    timeline: Type.Optional(Type.String({ description: 'Desired start date, deadline, or delivery timeline.' })),
    contact: Type.Optional(Type.String({ description: 'Buyer contact info, only after user approval.' })),
    buyerAgent: Type.Optional(Type.String({ description: 'Agent identifier. Defaults to openclaw.' })),
    requestedTerms: Type.Optional(requestedTermsSchema),
    userApproved: Type.Boolean({ description: 'Must be true only after explicit user approval of seller, offer, requested terms, budget, timeline, and contact details.' }),
}, { additionalProperties: false });
export default defineToolPlugin({
    id: 'nexez',
    name: 'Nexez',
    description: 'Discover AI-ready Nexez pages, inspect structured offers, and safely hand off checkout or negotiation intent.',
    configSchema,
    tools: (tool) => [
        tool({
            name: 'nexez_search',
            label: 'Search Nexez',
            description: 'Search published Nexez agent pages and offer-level actions by buyer intent and optional location.',
            parameters: querySchema,
            execute(params, config, context) {
                return searchAgentPages(params, config, context.signal);
            },
        }),
        tool({
            name: 'nexez_get_page',
            label: 'Get Nexez Page',
            description: 'Fetch the structured agent.json manifest for one Nexez page slug.',
            parameters: Type.Object({
                slug: Type.String({ description: 'Nexez page slug.' }),
            }, { additionalProperties: false }),
            execute(params, config, context) {
                return getAgentPage(params, config, context.signal);
            },
        }),
        tool({
            name: 'nexez_directory',
            label: 'Browse Nexez Directory',
            description: 'Browse Nexez directory results with category, readiness, query, and location filters.',
            parameters: Type.Object({
                query: Type.Optional(Type.String({ description: 'Optional text query.' })),
                location: Type.Optional(Type.String({ description: 'City, region, country, or service area.' })),
                category: Type.Optional(Type.Union([
                    Type.Literal('all'),
                    Type.Literal('professional'),
                    Type.Literal('consumer'),
                ], { description: 'Directory category filter.' })),
                minReadiness: Type.Optional(Type.Number({ minimum: 0, maximum: 100, description: 'Minimum readiness score.' })),
                lat: Type.Optional(Type.Number({ description: 'Optional buyer latitude.' })),
                lng: Type.Optional(Type.Number({ description: 'Optional buyer longitude.' })),
            }, { additionalProperties: false }),
            execute(params, config, context) {
                return browseDirectory(params, config, context.signal);
            },
        }),
        tool({
            name: 'nexez_validate_checkout',
            label: 'Validate Nexez Checkout',
            description: 'Dry-run a Nexez checkout handoff without creating a real checkout session.',
            parameters: checkoutSchema,
            optional: true,
            execute(params, config, context) {
                return validateCheckout(params, config, context.signal);
            },
        }),
        tool({
            name: 'nexez_validate_negotiation',
            label: 'Validate Nexez Negotiation',
            description: 'Dry-run a Nexez negotiation request without submitting a real seller-facing proposal.',
            parameters: negotiationSchema,
            optional: true,
            execute(params, config, context) {
                return validateNegotiation(params, config, context.signal);
            },
        }),
        tool({
            name: 'nexez_start_checkout',
            label: 'Start Nexez Checkout',
            description: 'Create a real Nexez checkout handoff only after explicit user approval.',
            parameters: approvedCheckoutSchema,
            optional: true,
            execute(params, config, context) {
                return startCheckout(params, config, context.signal);
            },
        }),
        tool({
            name: 'nexez_submit_negotiation',
            label: 'Submit Nexez Negotiation',
            description: 'Submit a real seller-facing Nexez negotiation only after explicit user approval.',
            parameters: approvedNegotiationSchema,
            optional: true,
            execute(params, config, context) {
                return submitNegotiation(params, config, context.signal);
            },
        }),
    ],
});
