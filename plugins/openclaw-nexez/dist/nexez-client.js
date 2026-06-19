export class NexezApiError extends Error {
    status;
    url;
    body;
    constructor(message, status, url, body) {
        super(message);
        this.name = 'NexezApiError';
        this.status = status;
        this.url = url;
        this.body = body;
    }
}
export function resolveBaseUrl(config) {
    const raw = config?.baseUrl || process.env.NEXEZ_BASE_URL || 'https://nexez.app';
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Nexez baseUrl must use http or https.');
    }
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
}
export async function searchAgentPages(params, config, signal) {
    return requestJson('/api/agent-search', {
        query: {
            q: params.query || '',
            location: params.location,
            limit: clampLimit(params.limit, 10),
            lat: params.lat,
            lng: params.lng,
        },
        signal,
    }, config);
}
export async function browseDirectory(params, config, signal) {
    return requestJson('/api/directory', {
        query: {
            q: params.query || undefined,
            location: params.location,
            category: params.category || 'all',
            min_readiness: clampReadiness(params.minReadiness),
            lat: params.lat,
            lng: params.lng,
        },
        signal,
    }, config);
}
export async function getAgentPage(params, config, signal) {
    return requestJson(`/${encodeURIComponent(params.slug)}/agent.json`, { signal }, config);
}
export async function validateCheckout(params, config, signal) {
    return postJson('/api/checkout', { ...params, dryRun: true, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal);
}
export async function startCheckout(params, config, signal) {
    assertApproved(params.userApproved, 'checkout');
    return postJson('/api/checkout', { ...params, dryRun: false, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal);
}
export async function validateNegotiation(params, config, signal) {
    return postJson('/api/negotiations', { ...params, dryRun: true, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal);
}
export async function submitNegotiation(params, config, signal) {
    assertApproved(params.userApproved, 'negotiation');
    return postJson('/api/negotiations', { ...params, dryRun: false, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal);
}
async function postJson(path, body, config, signal) {
    return requestJson(path, {
        method: 'POST',
        body,
        signal,
    }, config);
}
async function requestJson(path, options, config) {
    const url = new URL(`${resolveBaseUrl(config)}${path}`);
    for (const [key, value] of Object.entries(options.query || {})) {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
        }
    }
    const response = await fetch(url, {
        method: options.method || 'GET',
        signal: options.signal,
        headers: {
            Accept: 'application/json',
            'User-Agent': config?.userAgent || 'OpenClaw Nexez Plugin',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
        throw new NexezApiError(`Nexez request failed with ${response.status}.`, response.status, url.toString(), text.slice(0, 1000));
    }
    try {
        return JSON.parse(text);
    }
    catch {
        throw new NexezApiError('Nexez returned a non-JSON response.', response.status, url.toString(), text.slice(0, 1000));
    }
}
function clampLimit(value, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.max(1, Math.min(50, Math.floor(value)));
}
function clampReadiness(value) {
    if (!Number.isFinite(value))
        return undefined;
    return Math.max(0, Math.min(100, Math.floor(value)));
}
function assertApproved(userApproved, action) {
    if (userApproved !== true) {
        throw new Error(`Refusing to start ${action}. The tool input must include userApproved: true after explicit user approval.`);
    }
}
