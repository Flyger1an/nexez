export type NexezPluginConfig = {
    baseUrl?: string;
    userAgent?: string;
};
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export declare class NexezApiError extends Error {
    readonly status: number;
    readonly url: string;
    readonly body: string;
    constructor(message: string, status: number, url: string, body: string);
}
export declare class NexezApprovalError extends Error {
    readonly status = 403;
    constructor(action: string);
}
export declare class NexezTimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(timeoutMs: number);
}
export declare function resolveBaseUrl(config?: NexezPluginConfig): string;
export declare function searchAgentPages(params: {
    query?: string;
    location?: string;
    limit?: number;
    lat?: number;
    lng?: number;
    category?: 'all' | 'professional' | 'consumer';
    industry?: string;
    minReadiness?: number;
    minTrust?: number;
    verified?: boolean;
    supportsCheckout?: boolean;
    supportsNegotiation?: boolean;
    priceBand?: 'free' | 'under_100' | '100_500' | '500_2000' | '2000_plus' | 'custom';
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function browseDirectory(params: {
    query?: string;
    location?: string;
    category?: 'all' | 'professional' | 'consumer';
    minReadiness?: number;
    lat?: number;
    lng?: number;
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function getAgentPage(params: {
    slug: string;
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function validateCheckout(params: CheckoutInput, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function startCheckout(params: CheckoutInput & {
    userApproved: boolean;
    idempotencyKey?: string;
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function validateNegotiation(params: NegotiationInput, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function submitNegotiation(params: NegotiationInput & {
    userApproved: boolean;
    idempotencyKey?: string;
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function getNegotiationStatus(params: {
    negotiationId: string;
    statusToken: string;
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function waitForNegotiationDecision(params: {
    negotiationId: string;
    statusToken: string;
    timeoutMs?: number;
    intervalMs?: number;
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<{
    decisionPending: boolean;
}>;
type CheckoutInput = {
    slug: string;
    offer: string;
    query?: string;
    buyerEmail?: string;
    buyerName?: string;
    buyerReference?: string;
    buyerAgent?: string;
    approvalToken?: string;
};
type NegotiationInput = {
    slug: string;
    offer: string;
    query?: string;
    budget?: string;
    timeline?: string;
    contact?: string;
    buyerAgent?: string;
    requestedTerms?: Record<string, JsonValue>;
    negotiationId?: string;
    statusToken?: string;
    approvalToken?: string;
};
export {};
