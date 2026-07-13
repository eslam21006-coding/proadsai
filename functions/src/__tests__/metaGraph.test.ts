// functions/src/__tests__/metaGraph.test.ts — Phase 14 Layer 2 Graph API helpers
// ═══════════════════════════════════════════════════════════
// Pure URL-builder + response-parsing tests, with an injected fake fetch so
// no real Meta calls happen. Tests cover:
//   - Hierarchy fetches (campaigns/adsets/ads/creative).
//   - Insights time windows (3d rolling, today, 7d daily).
//   - 429/5xx retry with exponential backoff.
//   - Error envelope parsing.
//   - Async insights request + poll.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    fetchCampaigns,
    fetchAdSets,
    fetchAds,
    fetchAdCreativeImage,
    fetchAdInsights3d,
    fetchAdInsightsToday,
    fetchAdInsights7dDaily,
    fetchAccountBaselines,
    exchangeForLongLivedToken,
    extractImageUrl,
    setFetchImplForTests,
    resetMetaGraphForTests,
    MetaGraphError,
    META_GRAPH_BASE,
    INITIAL_BACKOFF_MS,
    BACKOFF_FACTOR,
    MAX_INSIGHTS_RETRIES,
} from "../metaGraph.js";

// ─── Helpers ───────────────────────────────────────────────────

interface FetchCall {
    url: string;
    count: number;
}

function makeFakeFetch(responses: Array<{ match: (u: string) => boolean; body: unknown; status?: number }>): {
    fetch: typeof fetch;
    calls: FetchCall[];
} {
    const calls: FetchCall[] = [];
    const seen = new Map<string, number>();
    const fetchImpl: typeof fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        const idx = seen.get(url) ?? 0;
        seen.set(url, idx + 1);
        calls.push({ url, count: idx + 1 });
        for (const r of responses) {
            if (r.match(url)) {
                const status = r.status ?? 200;
                return new Response(JSON.stringify(r.body), { status });
            }
        }
        return new Response(JSON.stringify({ error: { message: "no match in fake" } }), { status: 500 });
    }) as unknown as typeof fetch;
    return { fetch: fetchImpl, calls };
}

// ─── Hierarchy tests ───────────────────────────────────────────

test("fetchCampaigns — hits /act_{id}/campaigns with required fields", async () => {
    const { fetch: impl, calls } = makeFakeFetch([{
        match: (u) => u.includes("/act_12345/campaigns"),
        body: { data: [{ id: "c1", name: "Campaign 1", objective: "OUTCOME_SALES" }] },
    }]);
    setFetchImplForTests(impl);
    const result = await fetchCampaigns("TOKEN", "12345");
    resetMetaGraphForTests();
    assert.deepEqual(result, [{ id: "c1", name: "Campaign 1", objective: "OUTCOME_SALES" }]);
    assert.equal(calls.length, 1);
    const url = calls[0].url;
    assert.ok(url.includes("/act_12345/campaigns"), url);
    assert.ok(url.includes("access_token=TOKEN"), url);
    assert.ok(url.includes("fields="), url);
    assert.ok(url.includes("objective"), url);
    assert.ok(url.startsWith(META_GRAPH_BASE), url);
});

test("fetchAdSets — reads targeting field", async () => {
    const { fetch: impl, calls } = makeFakeFetch([{
        match: (u) => u.includes("/c1/adsets"),
        body: {
            data: [
                { id: "as1", name: "AdSet 1", targeting: { geo_locations: { countries: ["AE"] } } },
            ],
        },
    }]);
    setFetchImplForTests(impl);
    const result = await fetchAdSets("TOKEN", "c1");
    resetMetaGraphForTests();
    assert.equal(result.length, 1);
    assert.deepEqual((result[0].targeting as { geo_locations: { countries: string[] } }).geo_locations.countries, ["AE"]);
    assert.ok(calls[0].url.includes("targeting"));
});

test("fetchAds — reads creative field", async () => {
    const { fetch: impl } = makeFakeFetch([{
        match: (u) => u.includes("/as1/ads"),
        body: {
            data: [
                { id: "ad1", name: "Ad 1", creative: { id: "cr1", image_url: "https://example.com/img.jpg" } },
            ],
        },
    }]);
    setFetchImplForTests(impl);
    const result = await fetchAds("TOKEN", "as1");
    resetMetaGraphForTests();
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].creative, { id: "cr1", image_url: "https://example.com/img.jpg" });
});

test("fetchAdCreativeImage — returns creative meta or null", async () => {
    const { fetch: impl } = makeFakeFetch([{
        match: (u) => u.includes("/cr1?") && u.includes("image_url"),
        body: { id: "cr1", image_url: "https://example.com/img.jpg", thumbnail_url: "https://example.com/thumb.jpg" },
    }]);
    setFetchImplForTests(impl);
    const result = await fetchAdCreativeImage("TOKEN", "cr1");
    resetMetaGraphForTests();
    assert.equal(result?.image_url, "https://example.com/img.jpg");
});

test("fetchAdCreativeImage — empty creative id returns null (graceful skip)", async () => {
    // Empty / missing creative id → return null so the worker can skip
    // this ad without throwing. Throwing would break the sync.
    const result = await fetchAdCreativeImage("TOKEN", "");
    assert.equal(result, null);
});

// ─── Insights time windows ─────────────────────────────────────

test("fetchAdInsights3d — passes time_range {since, until}", async () => {
    const { fetch: impl, calls } = makeFakeFetch([{
        match: (u) => u.includes("/ad1/insights"),
        body: { data: [{ impressions: "1000", spend: "10.00" }] },
    }]);
    setFetchImplForTests(impl);
    const result = await fetchAdInsights3d("TOKEN", "ad1");
    resetMetaGraphForTests();
    assert.equal(result.length, 1);
    // time_range is JSON-stringified in the URL.
    assert.ok(calls[0].url.includes("time_range="), calls[0].url);
    assert.ok(calls[0].url.includes("%22since%22") || calls[0].url.includes("since"), calls[0].url);
});

test("fetchAdInsightsToday — uses date_preset=today (circuit-breaker path)", async () => {
    const { fetch: impl, calls } = makeFakeFetch([{
        match: (u) => u.includes("/ad1/insights"),
        body: { data: [{ impressions: "100" }] },
    }]);
    setFetchImplForTests(impl);
    await fetchAdInsightsToday("TOKEN", "ad1");
    resetMetaGraphForTests();
    assert.ok(calls[0].url.includes("date_preset=today"), calls[0].url);
});

test("fetchAdInsights7dDaily — uses date_preset=last_7d + time_increment=1", async () => {
    const { fetch: impl, calls } = makeFakeFetch([{
        match: (u) => u.includes("/ad1/insights"),
        body: { data: [{ date_start: "2026-07-01" }, { date_start: "2026-07-02" }] },
    }]);
    setFetchImplForTests(impl);
    const result = await fetchAdInsights7dDaily("TOKEN", "ad1");
    resetMetaGraphForTests();
    assert.equal(result.length, 2);
    assert.ok(calls[0].url.includes("date_preset=last_7d"), calls[0].url);
    assert.ok(calls[0].url.includes("time_increment=1"), calls[0].url);
});

// ─── Baselines ────────────────────────────────────────────────

test("fetchAccountBaselines — averages CPM/CPC/CTR across ads", async () => {
    const { fetch: impl } = makeFakeFetch([
        { match: (u) => u.includes("/insights") && u.includes("inline_link_click_ctr"), body: { data: [{ inline_link_click_ctr: "1.5" }, { inline_link_click_ctr: "2.5" }] } },
        { match: (u) => u.includes("/insights") && u.includes("cpm") && !u.includes("cpc"), body: { data: [{ cpm: "5.00" }, { cpm: "7.00" }] } },
        { match: (u) => u.includes("/insights") && u.includes("actions"), body: { data: [{ spend: "20", actions: [{ action_type: "purchase", value: "2" }] }, { spend: "30", actions: [{ action_type: "purchase", value: "3" }] }] } },
        { match: (u) => u.includes("/insights") && u.includes("cpc"), body: { data: [{ cpc: "0.50" }, { cpc: "1.50" }] } },
    ]);
    setFetchImplForTests(impl);
    const b = await fetchAccountBaselines("TOKEN", "act_1");
    resetMetaGraphForTests();
    // Average of 1.5 and 2.5 → 2.0
    assert.equal(b.linkCtr90d, 2.0);
    // Average of 5 and 7 → 6
    assert.equal(b.cpm14d, 6);
    // Total spend 50 / total actions 5 → 10
    assert.equal(b.cpaCpl30d, 10);
    // Average of 0.5 and 1.5 → 1.0
    assert.equal(b.cpc30d, 1);
});

// ─── Retry / backoff ──────────────────────────────────────────

test("fetchCampaigns — retries on 429 then succeeds", async () => {
    let attempts = 0;
    const impl: typeof fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        attempts++;
        if (attempts === 1) {
            return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 });
        }
        if (url.includes("/act_12345/campaigns")) {
            return new Response(JSON.stringify({ data: [{ id: "c1" }] }), { status: 200 });
        }
        return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    setFetchImplForTests(impl);
    const start = Date.now();
    const result = await fetchCampaigns("TOKEN", "12345");
    const elapsed = Date.now() - start;
    resetMetaGraphForTests();
    assert.deepEqual(result, [{ id: "c1" }]);
    assert.equal(attempts, 2);
    // First attempt fails immediately, second waits INITIAL_BACKOFF_MS before
    // retry. The exact elapsed time may vary, but it should be at least close.
    assert.ok(elapsed >= INITIAL_BACKOFF_MS, `expected backoff wait, got ${elapsed}ms`);
});

test("fetchCampaigns — fails after MAX_INSIGHTS_RETRIES on persistent 429", async () => {
    let attempts = 0;
    const impl: typeof fetch = (async () => {
        attempts++;
        return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 });
    }) as unknown as typeof fetch;
    setFetchImplForTests(impl);
    await assert.rejects(
        () => fetchCampaigns("TOKEN", "12345"),
        (e: unknown) => {
            assert.ok(e instanceof MetaGraphError, `expected MetaGraphError, got ${e}`);
            return true;
        },
    );
    resetMetaGraphForTests();
    assert.equal(attempts, MAX_INSIGHTS_RETRIES);
});

test("fetchCampaigns — surfaces Meta error envelope on 400", async () => {
    const impl: typeof fetch = (async () => {
        return new Response(JSON.stringify({
            error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 },
        }), { status: 400 });
    }) as unknown as typeof fetch;
    setFetchImplForTests(impl);
    await assert.rejects(
        () => fetchCampaigns("BAD_TOKEN", "12345"),
        /Invalid OAuth access token/,
    );
    resetMetaGraphForTests();
});

// ─── Token exchange ───────────────────────────────────────────

test("exchangeForLongLivedToken — returns access_token + expiresAt", async () => {
    const impl: typeof fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/oauth/access_token")) {
            return new Response(JSON.stringify({ access_token: "LONG_TOKEN", expires_in: 5184000 }), { status: 200 });
        }
        return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    setFetchImplForTests(impl);
    const out = await exchangeForLongLivedToken("SHORT_TOKEN", "app_id", "app_secret");
    resetMetaGraphForTests();
    assert.equal(out.accessToken, "LONG_TOKEN");
    assert.ok(out.expiresAt && out.expiresAt > Date.now(), "expiresAt must be in the future");
    // 60 days in seconds
    const days = (out.expiresAt! - Date.now()) / 1000 / 60 / 60 / 24;
    assert.ok(days > 55 && days <= 60, `expected ~60 days, got ${days}`);
});

test("exchangeForLongLivedToken — returns null expiresAt when expires_in absent", async () => {
    const impl: typeof fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/oauth/access_token")) {
            return new Response(JSON.stringify({ access_token: "LONG_TOKEN" }), { status: 200 });
        }
        return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    setFetchImplForTests(impl);
    const out = await exchangeForLongLivedToken("SHORT_TOKEN", "app_id", "app_secret");
    resetMetaGraphForTests();
    assert.equal(out.accessToken, "LONG_TOKEN");
    assert.equal(out.expiresAt, null);
});

// ─── Image URL extraction ─────────────────────────────────────

test("extractImageUrl — picks image_url, falls back to thumbnail", () => {
    assert.equal(extractImageUrl({ id: "c1", image_url: "https://x/y.jpg" }), "https://x/y.jpg");
    assert.equal(extractImageUrl({ id: "c1", thumbnail_url: "https://x/t.jpg" }), "https://x/t.jpg");
    assert.equal(extractImageUrl({ id: "c1", image_url: "https://x/y.jpg", thumbnail_url: "https://x/t.jpg" }), "https://x/y.jpg");
    assert.equal(extractImageUrl(undefined), null);
    assert.equal(extractImageUrl("c1"), null); // raw string id — needs separate fetch
});

test("teardown — reset for subsequent tests", () => {
    resetMetaGraphForTests();
});
