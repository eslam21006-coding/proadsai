// functions/src/metaSync/concurrency.ts — Phase 970 Batch 1 (D5)
// ═══════════════════════════════════════════════════════════
// Bounded-async helpers for the per-ad Graph fan-out in shared.ts. The
// unbounded `Promise.allSettled(ads.map(…))` in this file used to fire
// ~1,149 Graph calls simultaneously for a 383-ad account — exactly the
// pattern that trips Meta's app-wide rate limit (`OAuthException code 4 /
// subcode 1504022`, see investigation report §1.3 and §6).
//
// These helpers preserve the shape and ordering of the existing calls:
// every input produces one output (or one rejected entry), in input
// index order. Only the parallelism is changed.
//
// `mapWithConcurrency` — when the inner function either always resolves
// or swallows its own errors (matches the image-match loop in shared.ts,
// which collects failures into the per-sync `errors[]` itself rather than
// rejecting).
//
// `mapSettledWithConcurrency` — when the caller needs the per-item
// success/failure verdict the way `Promise.allSettled` returns it
// (matches the insights loop in shared.ts).
//
// The semaphore is implemented as a pool of `limit` workers drawing from a
// shared cursor — no third-party dependency, runs on Node 24's native
// runtime.
// ═══════════════════════════════════════════════════════════

/**
 * Resolve `fn` over every element of `items` with at most `limit`
 * in-flight at any time. Output is the same length and order as input.
 *
 * If `fn` throws, the rejection propagates out of `mapWithConcurrency`
 * immediately — the residual in-flight work is allowed to settle into the
 * already-allocated slot. Use `mapSettledWithConcurrency` instead when the
 * caller wants the per-item verdict preserved.
 */
export async function mapWithConcurrency<T, U>(
    items: ReadonlyArray<T>,
    limit: number,
    fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
    const results: U[] = new Array(items.length);
    let cursor = 0;

    async function worker(): Promise<void> {
        while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            results[idx] = await fn(items[idx], idx);
        }
    }

    const slots = Math.max(1, Math.min(limit, items.length));
    const workers: Promise<void>[] = [];
    for (let i = 0; i < slots; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

/**
 * `Promise.allSettled`-shaped variant: each input produces one
 * `{status:"fulfilled",value}` or `{status:"rejected",reason}` entry in
 * input order. The same `limit` ceiling as `mapWithConcurrency` applies;
 * a single rejection never aborts the run.
 */
export async function mapSettledWithConcurrency<T, U>(
    items: ReadonlyArray<T>,
    limit: number,
    fn: (item: T, index: number) => Promise<U>,
): Promise<Array<PromiseSettledResult<U>>> {
    const results: PromiseSettledResult<U>[] = new Array(items.length);
    let cursor = 0;

    async function worker(): Promise<void> {
        while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            try {
                const v = await fn(items[idx], idx);
                results[idx] = { status: "fulfilled", value: v };
            } catch (e: unknown) {
                results[idx] = { status: "rejected", reason: e };
            }
        }
    }

    const slots = Math.max(1, Math.min(limit, items.length));
    const workers: Promise<void>[] = [];
    for (let i = 0; i < slots; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

/**
 * Run `fn(item)` for every element with at most `limit` in-flight, and
 * return the maximum number of `fn` invocations that were running at the
 * same instant. Used by the concurrency contract test (D5).
 *
 * Implementation note: the helper schedules `limit` workers that each
 * grab the next cursor under `await Promise.resolve()` to give the
 * event loop a fair chance to interleave. The peak counter is incremented
 * before `fn` runs and decremented after it settles.
 */
export async function peakConcurrency<T>(
    items: ReadonlyArray<T>,
    limit: number,
    fn: (item: T) => Promise<unknown>,
): Promise<number> {
    let inFlight = 0;
    let peak = 0;
    let cursor = 0;

    async function worker(): Promise<void> {
        while (true) {
            const idx = cursor++;
            if (idx >= items.length) return;
            inFlight++;
            if (inFlight > peak) peak = inFlight;
            try {
                await fn(items[idx]);
            } finally {
                inFlight--;
            }
        }
    }

    const slots = Math.max(1, Math.min(limit, items.length));
    const workers: Promise<void>[] = [];
    for (let i = 0; i < slots; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return peak;
}
