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
export declare function resolveBaseUrl(config?: NexezPluginConfig): string;
export declare function searchAgentPages(params: {
    query?: string;
    location?: string;
    limit?: number;
    lat?: number;
    lng?: number;
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
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function validateNegotiation(params: NegotiationInput, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
export declare function submitNegotiation(params: NegotiationInput & {
    userApproved: boolean;
}, config?: NexezPluginConfig, signal?: AbortSignal): Promise<any>;
type CheckoutInput = {
    slug: string;
    offer: string;
    query?: string;
    buyerEmail?: string;
    buyerName?: string;
    buyerReference?: string;
    buyerAgent?: string;
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
};
export {};
