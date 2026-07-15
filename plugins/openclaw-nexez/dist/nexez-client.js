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
export class NexezApprovalError extends Error {
    status = 403;
    constructor(action) {
        super(`Refusing to start ${action}. The tool input must include userApproved: true after explicit user approval.`);
        // OpenClaw recognizes this stable error name and preserves the 403 plus the
        // actionable message instead of collapsing the refusal into a 500.
        this.name = 'ToolAuthorizationError';
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
    return dryRunResult('/api/checkout', { ...params, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal);
}
export async function startCheckout(params, config, signal) {
    assertApproved(params.userApproved, 'checkout');
    const { userApproved: _userApproved, ...input } = params;
    return postJson('/api/checkout', { ...input, dryRun: false, buyerAgent: input.buyerAgent || 'openclaw' }, config, signal);
}
export async function validateNegotiation(params, config, signal) {
    const result = await dryRunResult('/api/negotiations', { ...params, buyerAgent: params.buyerAgent || 'openclaw' }, config, signal);
    // Nexez validates non-negotiable offers with HTTP 200 and a stable rules
    // reason. Normalize that into the tool's documented branch signal so an
    // agent does not mistake a valid dry run for permission to negotiate.
    if (hasRuleReason(result, 'offer_not_negotiable')) {
        return {
            ...result,
            ok: false,
            reason: 'This offer does not accept negotiation. Use checkout at the listed price.',
        };
    }
    return result;
}
export async function submitNegotiation(params, config, signal) {
    assertApproved(params.userApproved, 'negotiation');
    const { userApproved: _userApproved, ...input } = params;
    return postJson('/api/negotiations', { ...input, dryRun: false, buyerAgent: input.buyerAgent || 'openclaw' }, config, signal);
}
async function postJson(path, body, config, signal) {
    return requestJson(path, {
        method: 'POST',
        body,
        signal,
    }, config);
}
// A validate/dry-run reports validity structurally rather than throwing on an
// EXPECTED rejection (e.g. a fixed-price offer refusing negotiation), so the agent
// can branch cleanly — "not negotiable" -> use checkout — instead of treating it as
// a tool failure. Genuine transport errors (network/abort) still throw.
async function dryRunResult(path, body, config, signal) {
    try {
        return await postJson(path, { ...body, dryRun: true }, config, signal);
    }
    catch (error) {
        if (error instanceof NexezApiError) {
            let reason = error.message;
            try {
                const parsed = JSON.parse(error.body);
                if (parsed && typeof parsed.error === 'string') {
                    reason = parsed.error;
                }
            }
            catch {
                // non-JSON body — keep the generic message
            }
            return { ok: false, status: error.status, reason };
        }
        throw error;
    }
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
        throw new NexezApprovalError(action);
    }
}
function hasRuleReason(value, reason) {
    if (!value || typeof value !== 'object')
        return false;
    const rulesEvaluation = value.rulesEvaluation;
    if (!rulesEvaluation || typeof rulesEvaluation !== 'object')
        return false;
    const reasons = rulesEvaluation.reasons;
    return Array.isArray(reasons) && reasons.includes(reason);
}
