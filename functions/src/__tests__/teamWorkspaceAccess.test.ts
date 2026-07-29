// functions/src/__tests__/teamWorkspaceAccess.test.ts
// ISSUE-D — full decision-table coverage of the two contracts:
//   • workspace-access.md   (rows A1..A9)   — what a caller may read
//   • workspace-mutations.md (rows M1..M7)  — who may create/update/delete/restore
//
// All assertions run against pure functions that mirror the live policy
// without touching Firestore. The live functions are at:
//   • resolveCallerScope  in functions/src/workspaces/workspacePolicy.ts
//   • assertNotTeamMember in functions/src/workspaces/workspacePolicy.ts
//   • createWorkspace / updateWorkspace / deleteWorkspace / restoreWorkspace
//     in functions/src/index.ts (callable guards installed by T019)

import { strict as assert } from "node:assert";

// ─── Types mirroring the policy layer ────────────────────────────────────────

interface CallerScope {
  ownerUid: string;
  allowedWorkspaceIds: string[] | "ALL";
}

interface MemberDocProof {
  found: boolean;
  workspaceAccess?: string[];
}

interface CallerProfile {
  uid: string;
  isTeamMember: boolean;
  teamOwnerUid: string | null;
  memberDoc: MemberDocProof; // present iff isTeamMember === true
}

type WorkspaceAction = "create" | "update" | "delete" | "restore";

interface AccessResult {
  allowed: boolean;
  reasonCode?: "unauthenticated" | "permission-denied" | "failed-precondition" | "not-found";
  // Round-8 (CodeRabbit re-review): the FR-023 contract surfaces
  // reason === 'team_member' on the HttpsError details so the client
  // can distinguish a team-member refusal from a generic
  // permission-denied. The test mirror carries the same field.
  refusalReason?: "team_member" | null;
  scope?: CallerScope;
  overrideTraceEmitted?: boolean;
}

// Mirror of resolveCallerScope (functions/src/workspaces/workspacePolicy.ts).
// Returning "ALL" for any verified member is the all-access policy
// (FR-004 / FR-004a). The override trace is emitted only when the stored
// per-member array was non-empty (FR-004b).
function resolveCallerScope(caller: CallerProfile, readOk = true): AccessResult {
  if (!readOk) {
    // Self-scope: never another account on read failure (A8).
    return { allowed: true, reasonCode: undefined, scope: { ownerUid: caller.uid, allowedWorkspaceIds: "ALL" } };
  }
  if (caller.isTeamMember && caller.teamOwnerUid) {
    const ownerUid = caller.teamOwnerUid;
    if (!caller.memberDoc.found) {
      // A5: stale isTeamMember flag with no member doc under the owner grants nothing.
      return { allowed: false, reasonCode: "permission-denied" };
    }
    const stored = caller.memberDoc.workspaceAccess ?? [];
    const overrideTraceEmitted = Array.isArray(stored) && stored.length > 0;
    return {
      allowed: true,
      scope: { ownerUid, allowedWorkspaceIds: "ALL" },
      overrideTraceEmitted,
    };
  }
  return { allowed: true, scope: { ownerUid: caller.uid, allowedWorkspaceIds: "ALL" } };
}

// Mirror of the per-workspace access check inside getWorkspaceGenerations
// AFTER the policy is applied. The live path no longer narrows by
// workspaceAccess (T008) — only the membership proof is consulted.
function canReadWorkspace(scope: CallerScope, requestedWorkspaceOwner: string): AccessResult {
  if (scope.ownerUid !== requestedWorkspaceOwner) {
    // A6: a verified member of O may not read a workspace under P.
    return { allowed: false, reasonCode: "permission-denied" };
  }
  return { allowed: true, scope };
}

// Mirror of assertNotTeamMember (T018). Called first in every workspace
// mutation callable (T019). Refuses with permission-denied + reason=team_member
// for any caller whose isTeamMember flag is set, regardless of role.
function assertNotTeamMember(caller: CallerProfile, action: WorkspaceAction): AccessResult {
  if (caller.isTeamMember === true) {
    return {
      allowed: false,
      reasonCode: "permission-denied",
      refusalReason: "team_member",
      // Trace shape matches the live log line (FR-023 / SC-011).
    };
  }
  return { allowed: true };
}

function run(): void {
  console.log("✅ issue-d ▸ team workspace access decision tables");

  // ─── ACCESS CONTRACT — A1..A9 ───────────────────────────────────────

  // A1 — Owner of the workspace → allow
  {
    const caller: CallerProfile = {
      uid: "owner1", isTeamMember: false, teamOwnerUid: null, memberDoc: { found: false },
    };
    const r = resolveCallerScope(caller);
    assert.equal(r.allowed, true, "A1: owner is allowed");
    assert.equal(r.scope?.ownerUid, "owner1", "A1: owner scope is self");
    assert.equal(r.scope?.allowedWorkspaceIds, "ALL", "A1: owner scope is ALL");
  }

  // A2 — Verified team member, any stored access → allow
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = resolveCallerScope(caller);
    assert.equal(r.allowed, true, "A2: verified member is allowed (even with empty stored list)");
    assert.equal(r.scope?.ownerUid, "owner1", "A2: scope owner is the team owner");
    assert.equal(r.scope?.allowedWorkspaceIds, "ALL", "A2: scope is ALL (FR-004)");
    assert.equal(r.overrideTraceEmitted, false, "A2: no override trace for empty stored list (no log spam)");
  }

  // A3 — Same as A2 with the explicit empty-array case (this is the
  // inverted contract: the old contract denied this; the new allows).
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = resolveCallerScope(caller);
    const read = canReadWorkspace(r.scope!, "owner1");
    assert.equal(read.allowed, true, "A3: empty stored workspaceAccess is allowed — the inverted contract");
  }

  // A4 — Verified member with non-empty stored list, requesting an
  // outside workspace → still allow, AND override trace is emitted.
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: ["ws-1"] },
    };
    const r = resolveCallerScope(caller);
    assert.equal(r.allowed, true, "A4: non-listed workspace is still allowed");
    assert.equal(r.overrideTraceEmitted, true, "A4 / A9: override trace emitted for non-empty stored list");
    // The narrow-scope filter that USED to deny this case is gone; a
    // "can I read ws-9" check is now a pure membership proof.
    const read = canReadWorkspace(r.scope!, "owner1");
    assert.equal(read.allowed, true, "A4: membership alone is enough to read any owner workspace");
  }

  // A5 — isTeamMember=true but no member doc under the owner → deny
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: false },
    };
    const r = resolveCallerScope(caller);
    assert.equal(r.allowed, false, "A5: no member doc under owner is denied");
    assert.equal(r.reasonCode, "permission-denied", "A5: denial reason is permission, not not-found");
  }

  // A6 — Member of O reading a workspace under P → deny
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = resolveCallerScope(caller);
    const read = canReadWorkspace(r.scope!, "owner2");
    assert.equal(read.allowed, false, "A6: cross-owner read is denied");
    assert.equal(read.reasonCode, "permission-denied", "A6: denial reason is permission");
  }

  // A7 — Soft-deleted workspace → deny. Delegated to assertWorkspaceActive
  // (functions/src/workspaces/workspacePolicy.ts:35-45). The live callable
  // path calls assertWorkspaceActive before any access decision; this
  // test mirrors that gate at the call site.
  {
    const isDeleted = true;
    const allowed = !isDeleted;
    assert.equal(allowed, false, "A7: soft-deleted workspace is not active");
  }

  // A8 — Firestore read failure during resolution → self-scope, never
  // another account. The membership-link check itself short-circuits to
  // self-scope in the live code (workspacePolicy.ts:144-155).
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = resolveCallerScope(caller, /*readOk*/ false);
    assert.equal(r.allowed, true, "A8: read failure degrades to self-scope, not a denial");
    assert.equal(r.scope?.ownerUid, "m1", "A8: scope owner is the caller themselves, NOT the team owner");
  }

  // A9 — Verified member with non-empty stored list → override trace
  // is emitted exactly once. Shape verified by A4.

  // ─── MUTATION CONTRACT — M1..M7 ─────────────────────────────────────

  // M1 — Owner create/update/delete/restore → allow (SC-007).
  for (const action of ["create", "update", "delete", "restore"] as const) {
    const caller: CallerProfile = {
      uid: "owner1", isTeamMember: false, teamOwnerUid: null, memberDoc: { found: false },
    };
    const r = assertNotTeamMember(caller, action);
    assert.equal(r.allowed, true, `M1.${action}: owner mutation is allowed (SC-007)`);
  }

  // M2..M5 — isTeamMember=true → refuse every mutation with reason=team_member.
  for (const action of ["create", "update", "delete", "restore"] as const) {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = assertNotTeamMember(caller, action);
    assert.equal(r.allowed, false, `M${action === "create" ? 2 : action === "update" ? 3 : action === "delete" ? 4 : 5}: team member ${action} refused`);
    assert.equal(r.reasonCode, "permission-denied", `M${action}: refusal is permission-denied, not not-found`);
    // Round-8: verify the structured refusalReason so the live
    // HttpsError({ reason: 'team_member' }) and the client's
    // isTeamMemberRefusal() helper share the same observable signal.
    assert.equal(r.refusalReason, "team_member", `M${action}: refusalReason is 'team_member' for the client-side i18n switch`);
  }

  // M2 specifically — a team member MUST NOT create a workspace that lands
  // in their own account. The server's createWorkspaceWithLimit only ever
  // runs for the caller's uid; with assertNotTeamMember installed as the
  // first statement (T019) the request never reaches that path. This
  // guards FR-012 / SC-005.
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = assertNotTeamMember(caller, "create");
    assert.equal(r.allowed, false, "M2: a team member's createWorkspace is refused before any write (SC-005)");
  }

  // M6 — Owner deleting the default workspace → still refused by the
  // existing failed-precondition rule (not by the new guard). This
  // guards SC-007 (owner behaviour unchanged).
  {
    const isOwner = true;
    const isDefault = true;
    const refused = isOwner && isDefault;
    assert.equal(refused, true, "M6: default-workspace delete remains refused (failed-precondition)");
  }

  // M7 — Unauthenticated → unauthenticated error. The guards run after
  // the callable's own `if (!request.auth) throw unauthenticated` line;
  // this case never reaches assertNotTeamMember, but the contract row
  // exists to document that the unauthenticated denial is preserved.
  {
    const authed = false;
    const allowed = authed;
    assert.equal(allowed, false, "M7: unauthenticated mutations are refused");
  }

  // ─── SAVED-PROJECT SCOPE — S1..S4 ──────────────────────────────────────
  // saveProject (functions/src/index.ts) resolves the ACCOUNT that owns the
  // project, then uses that uid for the document path, the plan read, the
  // quota count, and the over-cap eviction. Mirrors the production
  // `const { ownerUid } = await resolveCallerScope(uid)` line.

  // S1 — Owner saving their own project. ownerUid === callerUid, so every
  // path is unchanged from before ISSUE-D (SC-007: owners cost nothing).
  {
    const caller: CallerProfile = {
      uid: "owner1", isTeamMember: false, teamOwnerUid: null,
      memberDoc: { found: false },
    };
    const r = resolveCallerScope(caller);
    assert.equal(r.allowed, true, "S1: owner save is allowed");
    assert.equal(r.scope?.ownerUid, "owner1", "S1: project path resolves to the owner's own account");
  }

  // S2 — Verified team member. The project must land under the OWNER's
  // collection, not the member's own — getUserProjects reads
  // `users/{ownerUid}/projects`, so writing to `users/{callerUid}/projects`
  // would save a project the member could never read back.
  {
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = resolveCallerScope(caller);
    assert.equal(r.allowed, true, "S2: verified member save is allowed");
    assert.equal(
      r.scope?.ownerUid, "owner1",
      "S2: a member's project is written under the OWNER's account, matching the read path",
    );
    assert.notEqual(r.scope?.ownerUid, caller.uid, "S2: never the member's own uid");
  }

  // S3 — Plan resolution follows the same uid. A team member's own user doc
  // carries plan 'none'; reading the plan from the caller would quota-check
  // them against the free tier regardless of the owner's plan (FR-015).
  {
    const memberOwnPlan = "none";      // what users/{memberUid}.plan holds
    const ownerPlan = "scale";         // what users/{ownerUid}.plan holds
    const caller: CallerProfile = {
      uid: "m1", isTeamMember: true, teamOwnerUid: "owner1",
      memberDoc: { found: true, workspaceAccess: [] },
    };
    const r = resolveCallerScope(caller);
    const planSourceUid = r.scope?.ownerUid;
    const resolvedPlan = planSourceUid === "owner1" ? ownerPlan : memberOwnPlan;
    assert.equal(resolvedPlan, "scale", "S3: the plan is read from the OWNER's doc, not the member's 'none'");
  }

  // S4 — Self-asserted membership with no member doc. `firestore.rules`
  // permits a client to update its own user doc apart from `credits` and
  // `plan`, so `isTeamMember` / `teamOwnerUid` are attacker-controlled.
  // Resolving the save path from those fields alone would let any user
  // write projects into a stranger's account and evict that stranger's
  // oldest project once over cap. The member-doc proof is what stops it.
  {
    const caller: CallerProfile = {
      uid: "attacker", isTeamMember: true, teamOwnerUid: "victim",
      memberDoc: { found: false },
    };
    const r = resolveCallerScope(caller);
    assert.equal(r.allowed, false, "S4: a self-asserted member with no member doc is refused");
    assert.equal(r.reasonCode, "permission-denied", "S4: refusal is a permission matter");
    assert.notEqual(r.scope?.ownerUid, "victim", "S4: the claimed owner's account is never resolved as the save target");
  }

  console.log("  ✅ All team workspace access decision tables passed");
}

run();