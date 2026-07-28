// functions/src/workspaces/workspacePolicy.ts — server-side plan/credit entitlement resolution for workspaces

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Asserts that the caller's auth context owns the workspace at
 * `users/{auth.uid}/workspaces/{workspaceId}` and returns its Firestore
 * snapshot. Used by write paths that resolve the workspace under the
 * caller's own account. A team member's view is served by
 * {@link resolveCallerScope} + the per-callable member-doc lookup, not
 * this function.
 *
 * @param auth - The callable request's auth context (caller uid).
 * @param workspaceId - The workspace id to resolve under the caller's account.
 * @returns The Firestore document snapshot for the workspace.
 * @throws {HttpsError} `unauthenticated` if no caller uid, `not-found` if the
 *   workspace does not exist under the caller's account.
 */
export async function assertOwner(
  auth: { uid: string } | undefined,
  workspaceId: string
): Promise<admin.firestore.DocumentSnapshot> {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const wsSnap = await admin.firestore()
    .collection(`users/${auth.uid}/workspaces`)
    .doc(workspaceId)
    .get();
  if (!wsSnap.exists) {
    throw new HttpsError("not-found", "Workspace not found.");
  }
  return wsSnap;
}

/**
 * Asserts the user is on the Scale plan — required to create more than
 * one workspace. Reads the user doc once; throws `permission-denied`
 * with `reason: 'scale_plan_required'` otherwise.
 *
 * @param uid - The user uid whose plan to check.
 * @throws {HttpsError} `permission-denied` if the user is not on Scale.
 */
export async function assertScalePlan(uid: string): Promise<void> {
  const userSnap = await admin.firestore().collection("users").doc(uid).get();
  const plan = userSnap.data()?.billingState?.plan ?? "none";
  if (plan !== "scale") {
    throw new HttpsError(
      "permission-denied",
      "Creating more than one workspace requires the Scale plan.",
      { reason: "scale_plan_required" }
    );
  }
}

/**
 * Asserts the workspace document has not been soft-deleted. A soft
 * delete sets `deletedAt` to a non-null timestamp; the field is
 * treated as null when absent (legacy docs). Throws `not-found` for
 * either state.
 *
 * @param wsSnap - The workspace Firestore document snapshot.
 * @throws {HttpsError} `not-found` if the workspace is soft-deleted.
 */
export function assertWorkspaceActive(
  wsSnap: admin.firestore.DocumentSnapshot
): void {
  const data = wsSnap.data();
  if (data?.deletedAt != null) {
    throw new HttpsError(
      "not-found",
      "Workspace not found or already deleted."
    );
  }
}

/**
 * Asserts the user is below the 10-workspace cap on the Scale plan.
 * Reads all workspaces under the user and counts active (non
 * soft-deleted) entries. Throws `failed-precondition` if the cap is
 * reached.
 *
 * @param uid - The user uid whose workspace count to check.
 * @throws {HttpsError} `failed-precondition` if the user already has 10
 *   active workspaces.
 */
export async function assertWorkspaceLimit(uid: string): Promise<void> {
  // Read all workspaces then filter client-side: a `where('deletedAt','==',null)`
  // query would miss legacy docs where the field is absent entirely (Firestore
  // doesn't treat "field missing" and "field is null" as equal).
  const snap = await admin.firestore().collection(`users/${uid}/workspaces`).get();
  const active = snap.docs.filter((d) => {
    const deletedAt = d.data().deletedAt;
    return deletedAt == null; // covers both null and undefined
  });
  if (active.length >= 10) {
    throw new HttpsError(
      "failed-precondition",
      "You've reached the 10-workspace limit on the Scale plan.",
      { reason: "workspace_limit_reached" }
    );
  }
}

/**
 * Transaction-safe plan check + limit check + workspace create. Plan,
 * count, and write all happen in one Firestore transaction so a
 * concurrent downgrade or concurrent create cannot slip through
 * between a pre-txn entitlement check and the write.
 *
 * @param uid - The user uid that owns the new workspace.
 * @param newDoc - The workspace document fields to persist.
 * @returns The id of the newly created workspace.
 * @throws {HttpsError} `permission-denied` if the user is not on Scale;
 *   `failed-precondition` if the 10-workspace cap is reached.
 */
export async function createWorkspaceWithLimit(
  uid: string,
  newDoc: Record<string, unknown>
): Promise<string> {
  const colRef = admin.firestore().collection(`users/${uid}/workspaces`);
  const userRef = admin.firestore().collection("users").doc(uid);
  const newRef = colRef.doc();
  await admin.firestore().runTransaction(async (txn) => {
    // All reads first (Firestore txn requirement).
    const userSnap = await txn.get(userRef);
    const snap = await txn.get(colRef);

    const plan = userSnap.data()?.billingState?.plan ?? "none";
    if (plan !== "scale") {
      throw new HttpsError(
        "permission-denied",
        "Creating more than one workspace requires the Scale plan.",
        { reason: "scale_plan_required" }
      );
    }

    const active = snap.docs.filter((d) => d.data().deletedAt == null);
    if (active.length >= 10) {
      throw new HttpsError(
        "failed-precondition",
        "You've reached the 10-workspace limit on the Scale plan.",
        { reason: "workspace_limit_reached" }
      );
    }
    txn.create(newRef, newDoc);
  });
  return newRef.id;
}

/**
 * Resolves the user's default workspace id. Throws `not-found` if no
 * default workspace exists. The default workspace is the soft-delete
 * anchor — every workspace delete validates against this id.
 *
 * @param uid - The user uid whose default workspace to resolve.
 * @returns The id of the user's default workspace.
 * @throws {HttpsError} `not-found` if no workspace has `isDefault: true`.
 */
export async function resolveDefaultWorkspaceId(
  uid: string
): Promise<string> {
  const snap = await admin.firestore()
    .collection(`users/${uid}/workspaces`)
    .where("isDefault", "==", true)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpsError("not-found", "Default workspace not found.");
  }
  return snap.docs[0].id;
}

/**
 * Asserts the caller is NOT a team member. Called as the FIRST
 * statement of every workspace mutation callable (createWorkspace,
 * updateWorkspace, deleteWorkspace, restoreWorkspace). Throws
 * `permission-denied` with `reason: 'team_member'` so a team member
 * can never reach a "workspace not found" outcome that misreports a
 * permission problem as a missing workspace (FR-011), and never reaches
 * `createWorkspaceWithLimit` with their own uid (FR-012, SC-005).
 *
 * The check is intentionally identical for editors and viewers: under
 * the ISSUE-D product decision no role may add, remove, or alter a
 * workspace, regardless of role. The deferred role-based editing
 * capability will revisit this gate.
 *
 * @param callerUid - The auth uid of the caller.
 * @param action - The mutation being attempted: `create | update | delete | restore`.
 * @throws {HttpsError} `permission-denied` (with `reason: 'team_member'`)
 *   if the caller's user doc has `isTeamMember: true`. Logs the FR-023
 *   structured refusal line before throwing so the operating team can
 *   query by the `issue-d ▸` prefix in Cloud Logging.
 */
export async function assertNotTeamMember(
  callerUid: string,
  action: "create" | "update" | "delete" | "restore",
): Promise<void> {
  // Read the caller's user doc inside a try/catch so a Firestore read
  // failure surfaces as a structured `internal` error rather than an
  // unhandled exception that crashes the callable (and so we never
  // accidentally grant access when the doc is unreadable).
  const callerDoc = await admin.firestore().collection("users").doc(callerUid).get()
    .catch((err) => {
      console.warn(
        `⚠️ issue-d ▸ assertNotTeamMember caller-doc read failed — caller=${callerUid} action=${action}:`,
        (err as { message?: string })?.message ?? err,
      );
      throw new HttpsError(
        "internal",
        "Failed to read the caller profile. Please retry.",
        { reason: "caller_doc_unreadable" },
      );
    });
  const callerData = callerDoc.data();
  if (callerData?.isTeamMember === true) {
    // Stable, queryable log line. Shape is the FR-023 contract:
    //   issue-d ▸ workspace action refused — action=<…> caller=<…> owner=<…|unknown> workspace=<id|n/a> reason=team_member
    // The owner value comes straight from the caller's own user doc
    // (the only place it is stored). It is always present for a
    // verified member; the `unknown` fallback handles the stale-flag
    // edge case where the doc was tampered with out-of-band.
    const ownerUid = callerData.teamOwnerUid ?? "unknown";
    console.warn(
      `⚠️ issue-d ▸ workspace action refused — action=${action} caller=${callerUid} owner=${ownerUid} workspace=n/a reason=team_member`
    );
    throw new HttpsError(
      "permission-denied",
      "Only the account owner can add, change, or remove workspaces.",
      { reason: "team_member" },
    );
  }
}

/**
 * Resolves the caller scope: which account owns the workspaces they
 * may read, and the set of workspace ids they may read on that
 * account. Under the ISSUE-D all-access policy (FR-004), a verified
 * team member returns `allowedWorkspaceIds: "ALL"` and the stored
 * per-member `workspaceAccess` array is deliberately NOT consulted
 * for visibility decisions. A non-empty stored array IS logged as
 * an explicit FR-004b override trace so the silence is never invisible
 * (Constitution VII).
 *
 * Failure mode: any Firestore read failure inside this function
 * degrades to a self-scope (`ownerUid = callerUid, allowedWorkspaceIds
 * = "ALL"`). This is the safe, no-data-leak default — it can never
 * grant a caller access to another account's documents, only their
 * own.
 *
 * @param callerUid - The auth uid of the caller.
 * @returns The caller's effective owner uid and the set of workspace
 *   ids they may read on that account.
 */
export async function resolveCallerScope(callerUid: string): Promise<{
  ownerUid: string;
  allowedWorkspaceIds: string[] | "ALL";
}> {
  try {
    // Check if caller is a team member via their user doc
    const callerDoc = await admin.firestore().collection("users").doc(callerUid).get();
    const callerData = callerDoc.data();

    if (callerData?.isTeamMember && callerData?.teamOwnerUid) {
      const ownerUid = callerData.teamOwnerUid;
      // Find the member doc in the owner's team subcollection
      const memberSnap = await admin.firestore()
        .collection(`users/${ownerUid}/team`)
        .where("uid", "==", callerUid)
        .limit(1)
        .get();
      if (!memberSnap.empty) {
        const memberData = memberSnap.docs[0].data();
        // ISSUE-D FR-004 / FR-004a / FR-004b (Round-2 #9 wording): a verified
        // team member gets account-wide access to every workspace under the
        // owner. The stored per-member `workspaceAccess` array is retained
        // unchanged (FR-021) and is NOT used for authorization decisions; it
        // is read here only to emit the FR-004b override trace when non-empty,
        // so the operating team can audit ignored allowlists. A future
        // restriction feature can adopt the stored array without a migration.
        const storedAccess: unknown[] = memberData.workspaceAccess ?? [];
        if (Array.isArray(storedAccess) && storedAccess.length > 0) {
          console.warn(
            `⚠️ issue-d ▸ workspaceAccess ignored (all-access policy) — caller=${callerUid} owner=${ownerUid} stored=${storedAccess.length} granted=ALL`
          );
        }
        return { ownerUid, allowedWorkspaceIds: "ALL" };
      }
      // Round-9 (CodeRabbit re-review): the previous code returned
      // `{ ownerUid, allowedWorkspaceIds: [] }` here, which the consumer-side
      // check (`!allowedWorkspaceIds.includes(workspaceId)`) silently
      // translated to "permission-denied: Workspace access denied" — a
      // fact that was easy to miss in code review. Contract row A5 says
      // "isTeamMember=true but no member doc under the owner → deny |
      // permission-denied", and the test mirror A5 asserts
      // `reasonCode: 'permission-denied'`. Throw explicitly here so the
      // contract is observable at the source rather than implicit in the
      // consumer's empty-array short-circuit.
      throw new HttpsError(
        "permission-denied",
        "Team membership is not established for this account.",
        { reason: "membership_unproven" }
      );
    }

    const wsSnap = await admin.firestore().collection(`users/${callerUid}/workspaces`).get();
    const wsIds = wsSnap.docs.filter((d) => d.data().deletedAt == null).map((d) => d.id);
    return { ownerUid: callerUid, allowedWorkspaceIds: wsIds.length > 0 ? wsIds : "ALL" };
  } catch (err) {
    // A Firestore read failure here must NOT bubble up as an unhandled
    // 500. The common case is a regular (non-team) user, for whom the
    // safe, no-data-leak default is to scope to their own account.
    // Round-9: re-throw HttpsError so an explicit "membership unproven"
    // or similar call-side error propagates correctly; only generic
    // read failures degrade to self-scope.
    if (err instanceof HttpsError) throw err;
    console.warn(
      `⚠️ resolveCallerScope: degraded to self-scope for ${callerUid} after read failure:`,
      (err as { message?: string })?.message ?? err,
    );
    return { ownerUid: callerUid, allowedWorkspaceIds: "ALL" };
  }
}



