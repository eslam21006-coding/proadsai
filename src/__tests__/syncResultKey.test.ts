// src/__tests__/syncResultKey.test.ts
// Pure-mapper regression test for the three-outcome spec.
// Catches any future drift between the dashboard's onSyncNow and the
// sidebar's handleSyncMeta — they now both delegate to a shared
// helper, but this test pins the helper's behaviour.

import { describe, it, expect } from "vitest";
import { computeSyncResultKey } from "../utils/syncResultKey";

describe("computeSyncResultKey — three-outcome spec", () => {
    it("01: success — clean run → done", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            workspaceQueued: 0,
        })).toBe("sync.result.done");
    });

    it("02: success — workspace task queued → more_coming", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            workspaceQueued: 5,
        })).toBe("sync.result.more_coming");
    });

    it("03: partial — legacy account rate limited → partial", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            legacyRateLimited: ["act_781389063661831"],
        })).toBe("sync.result.partial");
    });

    it("04: partial — workspace account rate limited → partial", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            workspaceRateLimited: ["act_1180773537404268"],
        })).toBe("sync.result.partial");
    });

    it("05: partial — workspace fan-out task errored → partial", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            fanOutErrors: ["enqueue failed for ws/acct: NOT_FOUND"],
        })).toBe("sync.result.partial");
    });

    it("06: partial — inline.status === 'partial' taken as authoritative → partial", () => {
        // Inline ran but reported partial (e.g. fetchAdInsights
        // 403ed; ops-wise the user sees a clean run, but a portion
        // had no insights). Banner: partial.
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "partial",
        })).toBe("sync.result.partial");
    });

    it("07: failure — inline.status === 'failed' alone is sufficient (the only failure trigger)", () => {
        // PR #75 review (Codex): the round-1 helper's
        // `ok === false` early-return regressed post-Fix-3
        // behaviour, where `ok === false` + `inlineStatus === 'ok'`
        // + `fanOutErrors > 0` was classified `partial`. The
        // helper no longer keys on the aggregate `ok` flag; the
        // inline status alone drives the failure classification.
        // A press where the inline workspace itself reported
        // failure is a hard failure regardless of fan-out.
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "failed",
        })).toBe("sync.result.failed");
    });

    it("08: failure — ok === true, inline.status === 'failed' → failed", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "failed",
        })).toBe("sync.result.failed");
    });

    it("09: inline.status === 'partial' wins over ok === false → partial", () => {
        // PR #75 review (Codex). The helper keys on the inline
        // status; `ok === false` is delegated to the per-signal
        // branches. With inline === 'partial' the partial branch
        // matches before any ok-flag short-circuit could fire.
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "partial",
        })).toBe("sync.result.partial");
    });

    it("10: rate-limit precedence over queued — partial wins, not more_coming", () => {
        // The dashboard's rule: rate-limit or fan-out errors are
        // more user-visible than "the rest of your workspaces are
        // updating now", so partial wins when both apply.
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            workspaceRateLimited: ["act_AAA"],
            workspaceQueued: 5,
        })).toBe("sync.result.partial");
    });

    it("11: queue-only is still success-with-tail (more_coming, not failed)", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            workspaceQueued: 3,
        })).toBe("sync.result.more_coming");
    });

    it("12: missing fields default to success; residual ok=false with no signals fails (PR #75 follow-up)", () => {
        // The sidebar only passes the legacy response shape
        // (success + rateLimited + workspaceInline). Anything
        // missing should still produce a sane result.
        //
        // PR #75 follow-up review (CodeRabbit): `ok: false` with
        // no inline-status / partial signals must classify as
        // `failed`, not `done`. The round-1 helper had a
        // short-circuit on `ok === false` at the top; the first
        // fix removed it entirely and surfaced a regression where
        // `metaService.syncPerformance`'s round-1 swallow path
        // (network reset, unavailable, etc.) returns
        // `{ success: false, adsSynced: 0 }`, the helper
        // classified as `done`, and the sidebar's `handleSyncMeta`
        // rendered "Synced 0 ads" — misleading. The new helper
        // restores the failure classification AFTER the partial
        // signals so partial cases still take precedence.
        expect(computeSyncResultKey({ ok: true })).toBe(
            "sync.result.done",
        );
        expect(computeSyncResultKey({ ok: false })).toBe(
            "sync.result.failed",
        );
    });

    it("16 (NEW, PR #75): regression — ok=false + inline.status=ok + fanOutErrors > 0 → partial (NOT failed)", () => {
        // PR #75 review (Codex). Post-Fix-3 inline logic at
        // App.tsx:13116-13120 explicitly classified this as
        // `partial`. The round-1 helper regressed it because the
        // `ok === false` early-return fired before the fan-out
        // signal branch. Locking it in here.
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "ok",
            fanOutErrors: ["enqueue failed for ws/acct: NOT_FOUND"],
        })).toBe("sync.result.partial");
    });

    it("17 (NEW, PR #75): regression — ok=false + inline.status=ok + legacy rate limited → partial", () => {
        // Same case via the legacy signal channel — CodeRabbit
        // parallel finding. Round-1 short-circuit regressed this
        // too.
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "ok",
            legacyRateLimited: ["act_781389063661831"],
        })).toBe("sync.result.partial");
    });

    it("18 (NEW, PR #75): regression — ok=false + inline.status=failed → failed (the only ok-flag path)", () => {
        // When the inline itself failed, both the aggregate ok
        // AND inlineStatus agree. The helper classifies as
        // `failed`. This is the ONLY path to `failed` from a
        // `ok === false` input via the inline status; the residual
        // `ok === false` after partial signals is the second path
        // (test 19).
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "failed",
            fanOutErrors: ["some workspace enqueue failed"],
        })).toBe("sync.result.failed");
    });

    it("19 (NEW, PR #75 follow-up): residual ok=false with no partial signals → failed", () => {
        // PR #75 follow-up review (CodeRabbit): the round-1
        // helper had a short-circuit on `ok === false` at the
        // top; the first fix removed it entirely and surfaced a
        // regression where `metaService.syncPerformance`'s
        // round-1 swallow path (network reset, unavailable)
        // returns `{ success: false, adsSynced: 0 }`, the helper
        // classified as `done`, and the sidebar's `handleSyncMeta`
        // rendered "Synced 0 ads". The new helper restores the
        // failure classification AFTER the partial-signals branch
        // so partial cases still take precedence.
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "ok",
            // no legacyRateLimited, no workspaceRateLimited,
            // no fanOutErrors, no workspaceQueued
        })).toBe("sync.result.failed");
    });

    it("13: empty arrays are not rate limits", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            legacyRateLimited: [],
            workspaceRateLimited: [],
            fanOutErrors: [],
        })).toBe("sync.result.done");
    });

    it("14: PRESERVED FROM THE FIX-SYNC-INFRA PROMPT EVIDENCE — Sync 1 (07:09:52Z): ok=true, queued=5 → more_coming", () => {
        // The two syncs the owner reported. Sync 1's measured
        // values out of the [Batch 5] evidence log:
        //   ok=true, inline.status="ok", legacy.rateLimited=[],
        //   workspace.rateLimited=[], workspace.queued=5.
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "ok",
            legacyRateLimited: [],
            workspaceRateLimited: [],
            workspaceQueued: 5,
        })).toBe("sync.result.more_coming");
    });

    it("15: PRESERVED FROM THE FIX-SYNC-INFRA PROMPT EVIDENCE — Sync 2 (07:15:07Z): ok=true, queued=5, workspace rate limited → partial", () => {
        // Sync 2's measured values out of the [Batch 5] log:
        //   ok=true, inline.status="partial", legacy.rateLimited=[],
        //   workspace.rateLimited=["act_1180773537404268"],
        //   workspace.queued=5.
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "partial",
            legacyRateLimited: [],
            workspaceRateLimited: ["act_1180773537404268"],
            workspaceQueued: 5,
        })).toBe("sync.result.partial");
    });
});
