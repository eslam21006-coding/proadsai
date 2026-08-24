// functions/src/workspaces/metaCallerScope.ts
// �══════════════════════════════════════════════════════════════════════════
// Phase 967 — shared caller-scope guard for every Meta-touching callable.
//
// Every one of the 15 authenticated Meta entry points covered by Phase 967
// runs through the same preamble before touching any Firestore path:
//
//   1. Reject unauthenticated callers (no `request.auth`).
//   2. Resolve the caller's *account* (their own, or their team owner's)
//      via `resolveCallerScope` from workspacePolicy.ts. This is the
//      single source of the team-owner mapping — see FR-001 / FR-002 /
//      research.md R3.
//   3. Reject calls whose owner lookup was a transient read failure —
//      `readDegraded: true` is the sentinel that distinguishes a
//      fallback from a resolved answer. A caller that skips this check
//      would misattribute a team member's write to the member's own
//      account (the exact bug Phase 967 removes — quickstart.md traps).
//
// The returned `ResolvedMetaScope` is what every downstream Meta call
// consumes: `ownerUid` is the Firestore path, `callerUid` is the audit
// signal that distinguishes a team-member push from an owner push.
// ═══════════════════════════════════════════════════════════════════════════

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

import {
  resolveCallerScope,
  resolveDefaultWorkspaceId,
  assertWorkspaceActive,
} from "./workspacePolicy.js";

// ─── Public types ───────────────────────────────────────────────────────────

/**
 * What every Meta-touching callable sees after the preamble. `ownerUid`
 * is the Firestore path; `callerUid` is the audit signal.
 *
 * `allowedWorkspaceIds === "ALL"` for any verified team member (the
 * ISSUE-D all-access policy — see FR-004 / FR-004a). For an owner it is
 * the list of their active workspace ids at resolution time; we do not
 * snapshot it for the owner case because the owner's allowed set is
 * always "ALL" by construction (their own account). The literal
 * `"ALL"` is used so downstream guards can short-circuit with
 * `=== "ALL"` rather than `Array.includes(...)` on a singleton array.
 */
export interface ResolvedMetaScope {
  ownerUid: string;
  callerUid: string;
  allowedWorkspaceIds: string[] | "ALL";
  storedWorkspaceAccess: string[];
}

// ─── T014 — resolveMetaScope(request) ───────────────────────────────────────

/**
 * Wraps `resolveCallerScope` with the Phase 967 preamble:
 *
 *   - throws `unauthenticated` if the request has no auth
 *   - throws `unavailable` if `resolveCallerScope` returned
 *     `readDegraded: true` (a transient Firestore read failure —
 *     FR-003)
 *
 * The `unavailable` throw MUST happen before any use of
 * `scope.ownerUid` in the caller — a degraded read returns a
 * self-scope that looks like a legitimate owner resolution, so a
 * caller that skips the check would silently write a team member's
 * work under the member's own account.
 *
 * @param request - The callable request, typed as
 *   `CallableRequest<unknown>` so the helper accepts both
 *   typed-request callables and the untyped ones.
 * @returns The resolved scope, including the original `callerUid`
 *   for audit logging.
 * @throws {HttpsError} `unauthenticated` if no auth; `unavailable`
 *   if the scope lookup degraded.
 */
export async function resolveMetaScope(
  request: CallableRequest<unknown>
): Promise<ResolvedMetaScope> {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const callerUid = request.auth.uid;
  const scope = await resolveCallerScope(callerUid);
  if (scope.readDegraded) {
    // FR-003 — the call MUST fail as retryable and MUST NOT proceed
    // against the caller's own identity. `unavailable` is the
    // Cloud Functions error code that the client surfaces as a
    // transient failure rather than an authorization verdict.
    throw new HttpsError(
      "unavailable",
      "Could not verify your account. Please retry.",
      { reason: "read_degraded" }
    );
  }
  return {
    ownerUid: scope.ownerUid,
    callerUid,
    allowedWorkspaceIds: scope.allowedWorkspaceIds,
    storedWorkspaceAccess: scope.storedWorkspaceAccess,
  };
}

// ─── T015 — assertWorkspaceAllowed ──────────────────────────────────────────

/**
 * Throws `permission-denied` with `reason: 'workspace_not_permitted'`
 * if the workspace is outside the resolved scope. The check is the
 * single source of FR-004 / FR-021 for every Meta call site that
 * names a workspace:
 *
 *   - `scope.allowedWorkspaceIds === "ALL"` → never throws.
 *   - Otherwise the workspace id must be present in the array.
 *
 * The check runs BEFORE any side effect (workspace load, validation,
 * Meta API call) so a refused call never leaves a half-written state.
 *
 * @param scope - The resolved caller scope from `resolveMetaScope`.
 * @param workspaceId - The workspace id the caller named.
 * @throws {HttpsError} `permission-denied` if the workspace is not
 *   permitted; the structured `reason` lets the client distinguish
 *   this from a generic permission failure (and from the team-member
 *   refusal reason in the workspace-mutation guards).
 */
export function assertWorkspaceAllowed(
  scope: ResolvedMetaScope,
  workspaceId: string
): void {
  if (scope.allowedWorkspaceIds === "ALL") return;
  if (scope.allowedWorkspaceIds.includes(workspaceId)) return;
  throw new HttpsError(
    "permission-denied",
    "No access to this workspace.",
    { reason: "workspace_not_permitted" }
  );
}

// ─── T016 — loadActiveWorkspace ─────────────────────────────────────────────

/**
 * Loads the workspace document under the resolved owner and confirms
 * it is active. Combines two checks into one helper so every Meta
 * call site has a single, identical gate:
 *
 *   1. `not-found` if the workspace does not exist under the owner —
 *      covers the team-member-on-the-wrong-owner and the deleted-
 *      mid-publish edge cases (FR-024, FR-004).
 *   2. `not-found` if `assertWorkspaceActive` flags the record as
 *      soft-deleted (`deletedAt` is a non-null timestamp).
 *
 * The single error code (`not-found`) for both cases is what the
 * spec calls for — the caller cannot distinguish a missing workspace
 * from a soft-deleted one (FR-024), and a leaked distinction would
 * let a caller probe for soft-deleted workspace ids.
 *
 * @param ownerUid - The owner uid from the resolved scope.
 * @param workspaceId - The workspace id to load.
 * @returns The Firestore document snapshot for the active workspace.
 * @throws {HttpsError} `not-found` if the workspace is absent or
 *   soft-deleted.
 */
export async function loadActiveWorkspace(
  ownerUid: string,
  workspaceId: string
): Promise<admin.firestore.DocumentSnapshot> {
  const wsSnap = await admin.firestore()
    .collection(`users/${ownerUid}/workspaces`)
    .doc(workspaceId)
    .get();
  if (!wsSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Workspace not found.",
      { reason: "workspace_not_found" }
    );
  }
  assertWorkspaceActive(wsSnap); // throws not-found if soft-deleted
  return wsSnap;
}

// ─── T030 — resolvePublishWorkspace ─────────────────────────────────────────

/**
 * Resolves exactly one workspace to publish from. The caller names
 * the workspace via `requestedWorkspaceId`; when it is omitted, the
 * account's default workspace is used (FR-012). When no workspace
 * can be resolved at all, the call fails with `failed-precondition`
 * and `reason: 'no_workspace_resolved'` (FR-012a). The single-
 * workspace plan path is covered because every workspace on a
 * post-Phase-2 account has a default marker (FR-026d / T011/T012).
 *
 * FR-004 is enforced first by `assertWorkspaceAllowed` — a verified
 * team member's `allowedWorkspaceIds` is "ALL" (the all-access
 * policy) so the check is a no-op for them.
 *
 * The returned `workspaceIdSource` is recorded on every deployment
 * (FR-027, FR-012, SC-008) so a downstream auditor can tell which
 * publishes named the workspace and which fell back to the default.
 *
 * @param scope - The resolved caller scope.
 * @param requestedWorkspaceId - The workspace id the caller named,
 *   or undefined/null to use the default.
 * @returns The active workspace's Firestore snapshot plus the
 *   source that chose it.
 * @throws {HttpsError} `permission-denied`
 *   (`workspace_not_permitted`) when the caller named a workspace
 *   outside their scope; `not-found` (via `loadActiveWorkspace`)
 *   when the workspace is absent or soft-deleted;
 *   `failed-precondition` (`no_workspace_resolved`) when no
 *   workspace could be determined at all.
 */
export async function resolvePublishWorkspace(
  scope: ResolvedMetaScope,
  requestedWorkspaceId: string | null | undefined,
): Promise<{
  workspace: admin.firestore.DocumentSnapshot;
  workspaceIdSource: "request" | "default";
}> {
  let wsId: string | null = null;
  let workspaceIdSource: "request" | "default";

  if (requestedWorkspaceId) {
    // FR-004 / FR-021 — refuse before any side effect.
    assertWorkspaceAllowed(scope, requestedWorkspaceId);
    wsId = requestedWorkspaceId;
    workspaceIdSource = "request";
  } else {
    // FR-012 — fall back to the account default. The default marker
    // is fixed by Phase 2 (T011/T012) so post-Phase-2 accounts
    // always resolve; pre-Phase-2 accounts land in the catch below
    // (FR-012a) and are repaired by the script before publish-time
    // impact can be felt.
    try {
      wsId = await resolveDefaultWorkspaceId(scope.ownerUid);
      workspaceIdSource = "default";
    } catch (err) {
      // CR-MAJOR (CodeRabbit review feedback): `resolveDefaultWorkspaceId`
      // throws `HttpsError("not-found")` when no default marker
      // exists AND propagates Firestore read failures. The previous
      // blanket `catch {}` mapped both to
      // `failed-precondition / reason: 'no_workspace_resolved'`,
      // which contradicts FR-003 — a transient read failure must
      // surface as retryable, not as a permanent precondition.
      // Re-throw anything that isn't the "no default marker" verdict
      // so it propagates as `unavailable` (retryable) per the
      // universal preamble contract.
      if (!(err instanceof HttpsError) || err.code !== "not-found") {
        throw new HttpsError(
          "unavailable",
          "Could not determine your workspace. Please retry.",
          { reason: "workspace_lookup_degraded" },
        );
      }
      throw new HttpsError(
        "failed-precondition",
        "No workspace could be determined for this publish.",
        { reason: "no_workspace_resolved" },
      );
    }
    // Even though the default is server-side, the caller still must
    // be permitted to act on it. A verified member gets "ALL", so this
    // is a no-op for them; for an owner it is also a no-op (the
    // owner is always permitted on their own workspaces). The check
    // remains for defence in depth.
    assertWorkspaceAllowed(scope, wsId);
  }

  const workspace = await loadActiveWorkspace(scope.ownerUid, wsId);
  return { workspace, workspaceIdSource };
}

// ─── T031 — resolveWorkspacePage ────────────────────────────────────────────

export type PageSource = "workspace" | "legacy_global" | "none";

/**
 * Resolves the Facebook Page that should be recorded against a
 * publish. Three cases (data-model.md §1 Page state machine):
 *
 *   - SET  (`metaPageId` set, `metaPageClearedAt` null)
 *       → `{ pageId, pageName, pageSource: 'workspace' }`
 *   - NEVER_SET  (`metaPageId` null, `metaPageClearedAt` null)
 *       → falls back to the legacy account-level `selectedPageId` /
 *         `selectedPageName` (FR-007). `pageSource: 'legacy_global'`
 *         if the legacy Page is present, otherwise `'none'`.
 *   - CLEARED  (`metaPageId` null, `metaPageClearedAt` set)
 *       → the legacy fallback is FORBIDDEN (FR-011a). Publish still
 *         succeeds (FR-015a); `pageSource: 'none'`.
 *
 * `pageSource` is recorded on every deployment so an audit can count
 * remaining un-migrated workspaces (FR-028).
 *
 * Publishing is deliberately NOT gated on a Page value (FR-015a) —
 * today's push uploads to the ad-account media library and the Page
 * is metadata only. When Meta requests begin consuming the Page,
 * reconsider the gate (FR-015b).
 *
 * @param workspace - The workspace snapshot. Reads `metaPageId`,
 *   `metaPageName`, `metaPageClearedAt`.
 * @param connection - The account-level Meta connection record.
 *   Reads the legacy `selectedPageId` / `selectedPageName` fallbacks
 *   only when the workspace is `NEVER_SET`.
 * @returns The resolved Page id, name, and the source label.
 */
export function resolveWorkspacePage(
  workspace: admin.firestore.DocumentSnapshot,
  connection: { selectedPageId?: string | null; selectedPageName?: string | null } | null | undefined,
): { pageId: string | null; pageName: string | null; pageSource: PageSource } {
  const wsData = workspace.data() ?? {};
  const wsPageId: string | null = typeof wsData.metaPageId === "string" && wsData.metaPageId.length > 0
    ? wsData.metaPageId
    : null;
  const wsPageName: string | null = typeof wsData.metaPageName === "string"
    ? wsData.metaPageName
    : null;
  const wsClearedAt: number | null = typeof wsData.metaPageClearedAt === "number"
    ? wsData.metaPageClearedAt
    : null;

  if (wsPageId) {
    // SET — workspace has its own Page; never consult the legacy.
    return { pageId: wsPageId, pageName: wsPageName, pageSource: "workspace" };
  }
  if (wsClearedAt != null) {
    // CLEARED — FR-011a forbids the legacy fallback here.
    return { pageId: null, pageName: null, pageSource: "none" };
  }
  // NEVER_SET — FR-007 legacy fallback applies.
  const legacyId = connection?.selectedPageId ?? null;
  const legacyName = connection?.selectedPageName ?? null;
  return {
    pageId: legacyId,
    pageName: legacyName,
    pageSource: legacyId ? "legacy_global" : "none",
  };
}
