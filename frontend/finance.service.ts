// ============================================================================
// KUMA Module: Finance / Caisse — API Client Autonome
// ============================================================================
const MODULE_API_PATH = '/api/v1/modules/finance';
const DEFAULT_TOKEN_KEY = 'kuma_token';

/**
 * API base resolution — per-site correctness, NO foreign fallback:
 *   1. an explicit apiBase (injected by the host) always wins
 *   2. local proxy-served (localhost / LAN) → the local Worker (:8787),
 *      because the module routes live on the Worker (the NestJS gateway
 *      does not mount them)
 *   3. VITE_API_URL (build-time, set per site) → absolute
 *   4. otherwise → same-origin relative
 * A module that WRITES (transactions, receipts) must never silently
 * target another school's API: there is deliberately no hardcoded
 * worker URL here.
 */
export function resolveApiBase(apiBase?: string): string {
    if (apiBase) return apiBase.replace(/\/$/, '');
    if (typeof window === 'undefined') return MODULE_API_PATH;
    const host = window.location.hostname;
    const isProxyServed = host === 'localhost' || host === '127.0.0.1' || host === '::1'
        || host.startsWith('192.168.') || host.startsWith('10.')
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (isProxyServed) return `${window.location.protocol}//${host}:8787${MODULE_API_PATH}`;
    const envBase = (import.meta.env.VITE_API_URL || '').replace(/\/api\/v1$/, '');
    return envBase ? `${envBase}${MODULE_API_PATH}` : MODULE_API_PATH;
}

/**
 * Token resolver — injectable (the host passes its own provider), default:
 * the KUMA platform key `kuma_token`. The old `authToken` key was never
 * written by the platform, so every module call was unauthenticated.
 */
export function resolveToken(getToken?: () => string | null): string {
    if (getToken) return getToken() || '';
    try { return localStorage.getItem(DEFAULT_TOKEN_KEY) || ''; } catch { return ''; }
}

export interface FinanceOptions {
    /** Explicit module API base (host injects it). */
    apiBase?: string;
    /** Token provider (host injects it). */
    getToken?: () => string | null;
}

export const FinanceService = {
    async createTransaction(data: { studentId?: string; type: string; amount: number; description: string; paymentMethod: string; mobileOperator?: string }, opts?: FinanceOptions) {
        const r = await fetch(`${resolveApiBase(opts?.apiBase)}/v1/transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resolveToken(opts?.getToken)}` },
            body: JSON.stringify(data)
        });
        return r.json();
    },
    async getTransactions(filters?: { type?: string; period?: string }, opts?: FinanceOptions) {
        const q = new URLSearchParams(Object.entries(filters || {}).filter(([, v]) => v));
        const r = await fetch(`${resolveApiBase(opts?.apiBase)}/v1/transactions?${q}`, {
            headers: { 'Authorization': `Bearer ${resolveToken(opts?.getToken)}` }
        });
        return r.json();
    },
    async getReceipt(transId: string, opts?: FinanceOptions) {
        const r = await fetch(`${resolveApiBase(opts?.apiBase)}/v1/receipt/${transId}`, {
            headers: { 'Authorization': `Bearer ${resolveToken(opts?.getToken)}` }
        });
        return r.json();
    },
    async getSummary(opts?: FinanceOptions) {
        const r = await fetch(`${resolveApiBase(opts?.apiBase)}/v1/summary`, {
            headers: { 'Authorization': `Bearer ${resolveToken(opts?.getToken)}` }
        });
        const d = await r.json();
        return d.success ? d.summary : null;
    }
};
