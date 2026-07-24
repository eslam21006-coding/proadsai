// functions/src/metaGraph.ts — Phase 14 Layer 2 Meta Graph API helpers
// ═══════════════════════════════════════════════════════════
// Pure-ish wrapper around the Meta Graph API. The shape of every response is
// typed; the transport (fetch) is injectable so unit tests can stub Meta
// without a network.
//
// INSIGHTS FIELDS (spec §3.1.3):
//   impressions, reach, frequency, clicks, inline_link_clicks,
//   ctr, inline_link_click_ctr, spend, cpm, cpc,
//   actions, action_values, cost_per_action_type, date_start, date_stop
//
// TIME WINDOWS (spec §3.1.3):
//   - 3-day rolling:        time_range={'since':'<today-2>','until':'<today>'}
//   - today (CB only):      date_preset=today
//   - 7-day daily:          date_preset=last_7d, time_increment=1
//
// RATE LIMITING (FR-008):
//   Exponential backoff on 429 (and 5xx for resilience). Bounded attempts.
//   For accounts too large for synchronous insights, the spec says use async
//   insights (POST → poll report_run_id). We expose that escape hatch via
//   `requestInsightsAsync` but the sync helpers try the simple path first.
//
// TESTABILITY:
//   - The transport (fetch + JSON parsing) is provided by `setFetchImpl`.
//   - All public helpers accept a `fetchImpl` parameter (default: global fetch).
//   - This keeps the module a normal side-effecting wrapper while letting
//     tests assert the exact Graph URL + query string Meta sees.
// ═══════════════════════════════════════════════════════════

// ─── Constants ─────────────────────────────────────────────────

export const META_GRAPH_BASE = "https://graph.facebook.com/v22.0";
export const META_API_VERSION = "v22.0";

/**
 * Normalize an ad-account id to the `act_<digits>` form the Graph API expects.
 *
 * Ad account ids reach us from `/me/adaccounts?fields=id`, whose `id` is
 * ALREADY prefixed (`act_995888422231015`) — that value is what the picker
 * sends and what `connectMetaAccount` stores. Blindly prepending `act_` here
 * produced `act_act_995888422231015`, which Graph rejects, so every account
 * scoped call in this module silently failed.
 *
 * Idempotent on purpose: it accepts both the prefixed form and a bare numeric
 * id, so legacy documents written before the prefix was stored keep working.
 */
export function toActId(adAccountId: string): string {
    const id = (adAccountId || "").trim();
    return id.startsWith("act_") ? id : `act_${id}`;
}

// Insights fields used in every call (spec §3.1.3).
export const INSIGHTS_FIELDS: ReadonlyArray<string> = [
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "inline_link_clicks",
    "ctr",
    "inline_link_click_ctr",
    "spend",
    "cpm",
    "cpc",
    "actions",
    "action_values",
    "cost_per_action_type",
    "date_start",
    "date_stop",
];

export const HIERARCHY_CAMPAIGN_FIELDS = "id,name,status,objective,daily_budget,lifetime_budget";
export const HIERARCHY_ADSET_FIELDS = "id,name,status,daily_budget,targeting,campaign_id";
// FIX 4 (Claude audit): request the creative's image_url + thumbnail_url
// via field expansion. Without this Meta returns only `{ id: "..." }` and
// the worker's image-matching step would skip the ad (no URL to download).
// Also include adset_id so the parent join works without our own stamping
// (we still stamp defensively in shared.ts as a belt-and-braces measure).
export const HIERARCHY_AD_FIELDS = "id,name,status,adset_id,creative{id,image_url,thumbnail_url}";

export const MAX_INSIGHTS_RETRIES = 4;
export const INITIAL_BACKOFF_MS = 500;
export const BACKOFF_FACTOR = 2;

// ─── Types ─────────────────────────────────────────────────────

/** Result of one insights call — row shape per Meta. */
export interface InsightsRow {
    date_start?: string;
    date_stop?: string;
    impressions?: string;
    reach?: string;
    frequency?: string;
    clicks?: string;
    inline_link_clicks?: string;
    ctr?: string;
    inline_link_click_ctr?: string;
    spend?: string;
    cpm?: string;
    cpc?: string;
    actions?: Array<{ action_type: string; value: string }>;
    action_values?: Array<{ action_type: string; value: string }>;
    cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

/** Three time windows from spec §3.1.3. */
export interface InsightsTimeWindows {
    threeDayRolling: InsightsRow[];
    today: InsightsRow[];
    last7DaysDaily: InsightsRow[];
}

export interface AccountBaselines {
    linkCtr90d: number;
    cpm14d: number;
    cpaCpl30d: number;
    cpc30d: number;
}

export interface MetaCampaign {
    id: string;
    name?: string;
    status?: string;
    objective?: string;
    daily_budget?: string;
    lifetime_budget?: string;
}

export interface MetaAdSet {
    id: string;
    name?: string;
    status?: string;
    daily_budget?: string;
    targeting?: unknown;
    campaign_id?: string;
}

export interface MetaAd {
    id: string;
    name?: string;
    status?: string;
    creative?: { id?: string; image_url?: string; thumbnail_url?: string } | string;
    adset_id?: string;
}

export interface MetaCreative {
    id: string;
    image_url?: string;
    thumbnail_url?: string;
}

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

// ─── Test seam ─────────────────────────────────────────────────

let _fetchOverride: FetchImpl | null = null;

export function setFetchImplForTests(impl: FetchImpl | null): void {
    _fetchOverride = impl;
}

export function resetMetaGraphForTests(): void {
    _fetchOverride = null;
}

function activeFetch(): FetchImpl {
    return _fetchOverride ?? ((input, init) => fetch(input, init));
}

// ─── Error type ────────────────────────────────────────────────

export class MetaGraphError extends Error {
    public readonly status: number;
    public readonly body: unknown;
    constructor(status: number, body: unknown, message: string) {
        super(message);
        this.name = "MetaGraphError";
        this.status = status;
        this.body = body;
    }
}

// ─── Internal: response handling with retry ────────────────────

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GraphParams {
    [key: string]: string | number | undefined;
}

function buildUrl(path: string, params: GraphParams, accessToken: string): string {
    const url = new URL(`${META_GRAPH_BASE}${path}`);
    url.searchParams.set("access_token", accessToken);
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
    }
    return url.toString();
}

/**
 * Parse Meta error envelope (top-level `error` field) into a typed error.
 * Returns null when the response is OK-shaped but failed (no top-level error
 * envelope) so the caller can decide.
 */
function parseError(status: number, body: unknown): MetaGraphError {
    let message = `Meta Graph API error ${status}`;
    if (body && typeof body === "object" && "error" in body) {
        const err = (body as { error: { message?: string; type?: string; code?: number; error_subcode?: number } }).error;
        if (err?.message) {
            message = `${message}: ${err.message}`;
        }
        if (err?.type) message += ` (${err.type})`;
    }
    return new MetaGraphError(status, body, message);
}

/**
 * Internal fetch with exponential backoff on 429/5xx. Resolves with the
 * parsed JSON body; throws MetaGraphError after the final retry.
 */
async function graphFetchWithRetry(
    url: string,
    fetchImpl: FetchImpl,
    attempts: number = MAX_INSIGHTS_RETRIES,
): Promise<unknown> {
    let lastErr: Error | null = null;
    let backoffMs = INITIAL_BACKOFF_MS;
    for (let i = 0; i < attempts; i++) {
        let resp: Response;
        try {
            resp = await fetchImpl(url);
        } catch (e) {
            // Network failure — treat as retryable.
            lastErr = e instanceof Error ? e : new Error(String(e));
            if (i === attempts - 1) break;
            await sleep(backoffMs);
            backoffMs *= BACKOFF_FACTOR;
            continue;
        }
        if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
            lastErr = new MetaGraphError(resp.status, null, `Meta Graph transient ${resp.status}`);
            if (i === attempts - 1) {
                // Last attempt — surface the actual error body.
                const body = await safeJson(resp);
                throw parseError(resp.status, body);
            }
            await sleep(backoffMs);
            backoffMs *= BACKOFF_FACTOR;
            continue;
        }
        if (!resp.ok) {
            const body = await safeJson(resp);
            throw parseError(resp.status, body);
        }
        return await safeJson(resp);
    }
    throw lastErr ?? new MetaGraphError(599, null, "Meta Graph retries exhausted");
}

async function safeJson(resp: Response): Promise<unknown> {
    try {
        return await resp.json();
    } catch {
        return null;
    }
}

/**
 * Internal un-paginated fetcher — assumes Meta returns the full result. If
 * `paging.next` is present, callers should iterate (currently we don't because
 * ad counts per account are bounded in our scale).
 */
async function graphGet<T = unknown>(path: string, params: GraphParams, accessToken: string): Promise<T> {
    const url = buildUrl(path, params, accessToken);
    const data = await graphFetchWithRetry(url, activeFetch());
    return data as T;
}

// ─── Hierarchy fetches (spec §3.1.2) ──────────────────────────

interface CampaignsResponse { data: MetaCampaign[] }
interface AdSetsResponse { data: MetaAdSet[] }
interface AdsResponse { data: MetaAd[] }
interface CreativeResponse { id: string; image_url?: string; thumbnail_url?: string }

export async function fetchCampaigns(accessToken: string, adAccountId: string): Promise<MetaCampaign[]> {
    const resp = await graphGet<CampaignsResponse>(
        `/${toActId(adAccountId)}/campaigns`,
        { fields: HIERARCHY_CAMPAIGN_FIELDS },
        accessToken,
    );
    return resp.data || [];
}

export async function fetchAdSets(accessToken: string, campaignId: string): Promise<MetaAdSet[]> {
    const resp = await graphGet<AdSetsResponse>(
        `/${campaignId}/adsets`,
        { fields: HIERARCHY_ADSET_FIELDS },
        accessToken,
    );
    return resp.data || [];
}

export async function fetchAds(accessToken: string, adSetId: string): Promise<MetaAd[]> {
    const resp = await graphGet<AdsResponse>(
        `/${adSetId}/ads`,
        { fields: HIERARCHY_AD_FIELDS },
        accessToken,
    );
    return resp.data || [];
}

export async function fetchAdCreativeImage(accessToken: string, creativeId: string): Promise<MetaCreative | null> {
    if (!creativeId) return null;
    const resp = await graphGet<CreativeResponse>(
        `/${creativeId}`,
        { fields: "id,image_url,thumbnail_url" },
        accessToken,
    );
    return resp;
}

// ─── Insights fetches (spec §3.1.3) ────────────────────────────

/**
 * Fetch the 3-day rolling insights for a single ad. Window:
 *   time_range={'since':'<today-2>','until':'<today>'}
 * Returns an array — typically 1 aggregated row per Meta.
 */
export async function fetchAdInsights3d(accessToken: string, adId: string): Promise<InsightsRow[]> {
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setUTCDate(today.getUTCDate() - 2);
    const since = twoDaysAgo.toISOString().slice(0, 10);
    const until = today.toISOString().slice(0, 10);
    const resp = await graphGet<{ data: InsightsRow[] }>(
        `/${adId}/insights`,
        {
            fields: INSIGHTS_FIELDS.join(","),
            time_range: JSON.stringify({ since, until }),
            level: "ad",
        },
        accessToken,
    );
    return resp.data || [];
}

/** Today's-only insights (circuit-breaker path — CB1/CB2). */
export async function fetchAdInsightsToday(accessToken: string, adId: string): Promise<InsightsRow[]> {
    const resp = await graphGet<{ data: InsightsRow[] }>(
        `/${adId}/insights`,
        {
            fields: INSIGHTS_FIELDS.join(","),
            date_preset: "today",
            level: "ad",
        },
        accessToken,
    );
    return resp.data || [];
}

/**
 * Last-7-days daily breakdown. Used for 72-hour decay detection (K4).
 * `time_increment=1` makes Meta return one row per day.
 */
export async function fetchAdInsights7dDaily(accessToken: string, adId: string): Promise<InsightsRow[]> {
    const resp = await graphGet<{ data: InsightsRow[] }>(
        `/${adId}/insights`,
        {
            fields: INSIGHTS_FIELDS.join(","),
            date_preset: "last_7d",
            time_increment: 1,
            level: "ad",
        },
        accessToken,
    );
    return resp.data || [];
}

/**
 * Convenience: fetch all three time windows for a single ad. Caller should
 * handle errors per-window so partial failure is non-blocking (FR-010).
 */
export async function fetchAdInsights(accessToken: string, adId: string): Promise<InsightsTimeWindows> {
    const [threeDayRolling, today, last7DaysDaily] = await Promise.all([
        fetchAdInsights3d(accessToken, adId),
        fetchAdInsightsToday(accessToken, adId),
        fetchAdInsights7dDaily(accessToken, adId),
    ]);
    return { threeDayRolling, today, last7DaysDaily };
}

// ─── Baselines (spec §3.1.4) ──────────────────────────────────

/**
 * Compute account-level baselines:
 *   - 90-day متوسط Link CTR  (level=ad, date_preset=last_90d, averaged)
 *   - 14-day متوسط CPM       (date_preset=last_14d)
 *   - 30-day متوسط CPA/CPL   (date_preset=last_30d)
 *   - 30-day متوسط CPC       (date_preset=last_30d)
 *
 * Averaging is computed across all rows (one per ad); cost-per-action is
 * computed as total spend / total actions.
 */
export async function fetchAccountBaselines(accessToken: string, adAccountId: string): Promise<AccountBaselines> {
    const [ctr90, cpm14, cpaCpl30, cpc30] = await Promise.all([
        fetchAccountLevelMetric(accessToken, adAccountId, "last_90d", "inline_link_click_ctr"),
        fetchAccountLevelMetric(accessToken, adAccountId, "last_14d", "cpm"),
        fetchAccountLevelCpaCpl(accessToken, adAccountId, "last_30d"),
        fetchAccountLevelMetric(accessToken, adAccountId, "last_30d", "cpc"),
    ]);
    return {
        linkCtr90d: ctr90,
        cpm14d: cpm14,
        cpaCpl30d: cpaCpl30,
        cpc30d: cpc30,
    };
}

/** Helper: simple field-level metric (CPM, CPC, CTR) averaged across ads. */
async function fetchAccountLevelMetric(
    accessToken: string,
    adAccountId: string,
    datePreset: string,
    field: string,
): Promise<number> {
    const resp = await graphGet<{ data: Array<Record<string, string>> }>(
        `/${toActId(adAccountId)}/insights`,
        {
            fields: field,
            date_preset: datePreset,
            level: "ad",
            time_increment: "all_days",
        },
        accessToken,
    );
    const rows = resp.data || [];
    if (rows.length === 0) return 0;
    const total = rows.reduce((acc, row) => acc + parseNumber(row[field]), 0);
    return total / rows.length;
}

/**
 * Helper: cost-per-action (CPA or CPL depending on which actions exist) =
 * total spend / total actions across all ads. If no actions, returns 0.
 */
async function fetchAccountLevelCpaCpl(
    accessToken: string,
    adAccountId: string,
    datePreset: string,
): Promise<number> {
    const resp = await graphGet<{ data: Array<{ spend?: string; actions?: Array<{ action_type: string; value: string }> }> }>(
        `/${toActId(adAccountId)}/insights`,
        {
            fields: "spend,actions",
            date_preset: datePreset,
            level: "ad",
            time_increment: "all_days",
        },
        accessToken,
    );
    const rows = resp.data || [];
    let totalSpend = 0;
    let totalActions = 0;
    for (const row of rows) {
        totalSpend += parseNumber(row.spend);
        // Pick the first action type that exists (purchase for purchases,
        // lead for leads) — for baseline purposes we sum any "result" actions.
        const resultActions = (row.actions || []).filter((a) => isResultAction(a.action_type));
        const rowActions = resultActions.reduce((acc, a) => acc + parseNumber(a.value), 0);
        totalActions += rowActions;
    }
    return totalActions > 0 ? totalSpend / totalActions : 0;
}

const RESULT_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "lead",
    "omni_complete_registration",
    "complete_registration",
]);

function isResultAction(t: string): boolean {
    return RESULT_ACTION_TYPES.has(t.toLowerCase());
}

// ─── Async insights escape hatch (FR-008) ──────────────────────

interface AsyncInsightsResponse {
    report_run_id?: string;
    async_status?: string;
    async_percent_completion?: number;
}

interface AsyncInsightsResultResponse {
    async_status?: string;
    account_id?: string;
    time_ref?: number;
    data?: Array<Record<string, unknown>>;
}

/**
 * Kick off an async insights job (for very large accounts where synchronous
 * insights times out). Returns the `report_run_id` to poll via
 * `pollAsyncInsights`.
 */
export async function requestInsightsAsync(
    accessToken: string,
    parentId: string,
    level: "account" | "campaign" | "adset" | "ad" = "ad",
): Promise<string> {
    const url = buildUrl(`/${parentId}/insights`, {
        fields: INSIGHTS_FIELDS.join(","),
        level,
        date_preset: "last_7d",
        time_increment: 1,
        access_token: undefined, // overridden below to keep order
    }, accessToken);
    // Re-build the URL with async=true explicitly (we don't expose async as a param).
    const finalUrl = new URL(url);
    finalUrl.searchParams.set("async", "true");
    const data = await graphFetchWithRetry(finalUrl.toString(), activeFetch(), MAX_INSIGHTS_RETRIES);
    const r = data as AsyncInsightsResponse;
    if (!r.report_run_id) {
        throw new MetaGraphError(500, r, "Meta async insights returned no report_run_id");
    }
    return r.report_run_id;
}

/** Poll an async insights job until it completes or times out. */
export async function pollAsyncInsights(
    accessToken: string,
    reportRunId: string,
    options: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<AsyncInsightsResultResponse> {
    const maxAttempts = options.maxAttempts ?? 30;
    const intervalMs = options.intervalMs ?? 2000;
    for (let i = 0; i < maxAttempts; i++) {
        const resp = await graphGet<AsyncInsightsResultResponse>(
            `/${reportRunId}`,
            { fields: "async_status,async_percent_completion,account_id,time_ref,data" },
            accessToken,
        );
        const status = (resp.async_status || "").toLowerCase();
        if (status === "completed" || status === "complete" || status === "success") {
            return resp;
        }
        if (status === "failed" || status === "error") {
            throw new MetaGraphError(500, resp, `Meta async insights failed: ${status}`);
        }
        await sleep(intervalMs);
    }
    throw new MetaGraphError(504, null, "Meta async insights timed out");
}

// ─── Image download (for sync-time fingerprint matching) ────────

export async function downloadCreativeImage(imageUrl: string, fetchImpl?: FetchImpl): Promise<Buffer> {
    if (!imageUrl) throw new Error("metaGraph.downloadCreativeImage: imageUrl is required");
    const fn = fetchImpl ?? activeFetch();
    const resp = await fn(imageUrl);
    if (!resp.ok) {
        throw new MetaGraphError(resp.status, null, `Image download failed: ${resp.status}`);
    }
    const arr = await resp.arrayBuffer();
    return Buffer.from(arr);
}

// ─── Token refresh ─────────────────────────────────────────────

/**
 * Exchange a short-lived Meta token for a long-lived one (~60 days).
 * See https://developers.facebook.com/docs/facebook-login/access-tokens/refreshing
 */
export async function exchangeForLongLivedToken(
    shortLivedToken: string,
    appId: string,
    appSecret: string,
): Promise<{ accessToken: string; expiresAt: number | null }> {
    const url = buildUrl("/oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
    }, "");
    const data = await graphFetchWithRetry(url, activeFetch());
    const r = data as { access_token?: string; expires_in?: number };
    if (!r.access_token) {
        throw new MetaGraphError(500, r, "Meta long-lived token exchange returned no access_token");
    }
    // expires_in is in seconds; if missing the token never expires (rare).
    const expiresAt = typeof r.expires_in === "number" && r.expires_in > 0
        ? Date.now() + r.expires_in * 1000
        : null;
    return { accessToken: r.access_token, expiresAt };
}

// ─── Helpers ───────────────────────────────────────────────────

function parseNumber(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

/** Extract the first usable image URL from a creative reference. */
export function extractImageUrl(creative: MetaAd["creative"]): string | null {
    if (!creative) return null;
    if (typeof creative === "string") return null; // raw ID — needs a separate fetch
    return creative.image_url || creative.thumbnail_url || null;
}
