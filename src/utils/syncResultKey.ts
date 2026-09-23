// src/utils/syncResultKey.ts
// Pure mapper from the triggerMetaSync payload + sidebar syncPerformance
// payload to the five-value resultKey used by the dashboard banner and
// the sidebar toast. Lives in `utils/` (not `services/`) so it can be
// imported by both the dashboard and the sidebar without dragging the
// Firebase SDK into the test runner, and so any backend field shape
// change here is one file rather than two wiring sites.
//
// The fix-sync-banner batch (PR #73 fix, spec §2) replaces the inline
// branches in App.tsx's onSyncNow and handleSyncMeta with one shared
// pure function whose three-outcome spec is:
//
//   - failure  → `ok === false` OR `inlineStatus === 'failed'`
//   - partial  → the inline ran, but at least one account was rate
//                limited (legacy or workspace) OR a workspace fan-out
//                task failed (errors[])
//   - more_coming / done  → everything else; "more_coming" is the
//                success-with-tail variant when at least one workspace
//                fan-out task was queued.
//
// The busy case (a second concurrent press lands on the in-flight
// lease and throws `failed-precondition`) is caught upstream of the
// helper — `App.tsx`'s catch block uses `sync.result.busy`, never the
// failure key. See the metaService.swallow at metaService.ts:251 and
// the dashboard's busy catch at App.tsx:13198.

export type SyncResultKey =
    | "sync.result.done"
    | "sync.result.partial"
    | "sync.result.more_coming"
    | "sync.result.failed"
    | "sync.result.busy";

export interface SyncOutcomeInput {
    ok?: boolean | undefined;
    /** Inline workspace status from the orchestrator. null when there
     *  is no active workspace's inline result (e.g. legacy-only). */
    inlineStatus?: "ok" | "partial" | "failed" | null | undefined;
    /** Legacy (account-global) sync accounts that were rate-limited. */
    legacyRateLimited?: readonly string[] | null | undefined;
    /** Workspace fan-out accounts that were rate-limited. */
    workspaceRateLimited?: readonly string[] | null | undefined;
    /** Cloud Tasks fan-out errors that are NOT rate-limit failures.
     *  These are non-fatal server-side (the inline still ran) but
     *  indicate a partial completion. */
    fanOutErrors?: readonly string[] | null | undefined;
    /** Workspace fan-out tasks successfully queued by Cloud Tasks. */
    workspaceQueued?: number | null | undefined;
}

/**
 * Map an orchestrator or sidebar response shape to the banner resultKey.
 * Pure: no side effects, no closures. The dashboard passses the
 * triggerMetaSync response, the sidebar passes a smaller projection of
 * the metaSyncPerformance response (missing `inlineStatus` /
 * `fanOutErrors` because the legacy callable does not expose them).
 * The unknown fields default safely to "success".
 */
export function computeSyncResultKey(input: SyncOutcomeInput): SyncResultKey {
    // Failure 1 of 2: the inline workspace sync itself reported
    // failure. The orchestrator exposes this via `inlineStatus`.
    if (input.inlineStatus === "failed") return "sync.result.failed";

    // Partial: the inline ran (so it is NOT a failure), but
    //   (a) a different account hit Meta's rate limit
    //       (legacyRateLimited / workspaceRateLimited), OR
    //   (b) a workspace fan-out task errored for a non-rate-limit
    //       reason (fanOutErrors) — this is the case where
    //       `ok === false` but `inlineStatus === 'ok'`; the
    //       fix-sync-infra inline logic (commit 04a90aa,
    //       App.tsx:13116-13120) classified this as `partial`
    //       and the round-1 helper must agree, OR
    //   (c) the inline sync itself reported 'partial' status
    //       (e.g. fetchAdInsights 403ed, ads still updated but a
    //       portion had no fresh insights to merge).
    // Partial signals take precedence over the aggregate `ok`
    // flag — PR #75 review (Codex). The round-1 helper
    // originally short-circuited on `ok === false` BEFORE the
    // partial signals and regressed post-Fix-3 behaviour.
    const anyLegacyLimited = (input.legacyRateLimited?.length ?? 0) > 0;
    const anyWorkspaceLimited = (input.workspaceRateLimited?.length ?? 0) > 0;
    const anyFanOutError = (input.fanOutErrors?.length ?? 0) > 0;
    const inlinePartial = input.inlineStatus === "partial";
    if (anyLegacyLimited || anyWorkspaceLimited || anyFanOutError || inlinePartial) {
        return "sync.result.partial";
    }

    // Failure 2 of 2: residual `ok === false` with no partial
    // signal. PR #75 review (CodeRabbit, follow-up): removing the
    // `ok === false` short-circuit entirely surfaced a regression
    // where `metaService.syncPerformance` returns
    // `{ success: false, adsSynced: 0 }` for the round-1 swallow
    // path (network reset, unavailable, etc.) and the helper
    // classifies as `done`. The sidebar's `handleSyncMeta` then
    // renders "Synced 0 ads" — misleading. Restore the failure
    // classification AFTER the partial signals so partial cases
    // keep precedence.
    if (input.ok === false) return "sync.result.failed";

    // More-coming: the inline ran clean, nothing rate-limited, but
    // at least one workspace fan-out task was queued.
    const queued = input.workspaceQueued ?? 0;
    if (queued > 0) return "sync.result.more_coming";

    // Success: clean.
    return "sync.result.done";
}
