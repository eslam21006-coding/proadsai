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

    it("07: failure — ok === false → failed", () => {
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "ok",
        })).toBe("sync.result.failed");
    });

    it("08: failure — inline.status === 'failed' → failed", () => {
        expect(computeSyncResultKey({
            ok: true,
            inlineStatus: "failed",
        })).toBe("sync.result.failed");
    });

    it("09: failure — ok false wins over inline partial", () => {
        // Even if the inline surface looks partial, an overall
        // false ok is a hard failure.
        expect(computeSyncResultKey({
            ok: false,
            inlineStatus: "partial",
        })).toBe("sync.result.failed");
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

    it("12: missing fields default to success", () => {
        // The sidebar only passes the legacy response shape
        // (success + rateLimited + workspaceInline). Anything
        // missing should still produce a sane result.
        expect(computeSyncResultKey({ ok: true })).toBe(
            "sync.result.done",
        );
        expect(computeSyncResultKey({ ok: false })).toBe(
            "sync.result.failed",
        );
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
