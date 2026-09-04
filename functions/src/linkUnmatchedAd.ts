// functions/src/linkUnmatchedAd.ts — Phase 14 Layer 3 manual link callable
// ═══════════════════════════════════════════════════════════
// Dashboard surface for the user to manually link an "unmatched" Meta ad
// back to its source generation (spec §4.2 + contract: imageMatching.md).
//
// PRECEDENCE RULE (spec §4.3):
//   - A manual link is AUTHORITATIVE and LOCKED.
//   - Auto-match NEVER overrides an existing link (manual or prior auto).
//   - Re-syncs never alter an existing link.
//
// SCOPE (FR-023):
//   - Both the ad (account under this workspace) and the generation must
//     belong to the SAME workspace. Cross-workspace linking is FORBIDDEN.
//   - The picker (dashboard, Batch 04) only shows generations from the same
//     workspace; this callable is the server-side enforcement.
//
// CALLER SCOPE (Phase 967 / round-13 expansion):
//   - The body is extracted into `linkUnmatchedAdImpl` so the structural
//     guard test can drive it with a fake `scope` + an in-memory Firestore
//     stub. Production wraps it in `onCall` and resolves the scope via
//     `resolveMetaScope` — the same pattern as `connectMetaAccountImpl`
//     / `getWhatsWorkingDashboardImpl`.
//   - `scope.ownerUid` is the Firestore path. `scope.callerUid` is the
//     audit signal only and MUST NOT appear in any path the impl reads or
//     writes. Without this conversion a team member calling this surface
//     would resolve to their OWN (empty) `users/{callerUid}/...` doc and
//     fail not-found — which is exactly the bug class
//     `whatsWorkingDashboardScope.test.ts` was added to lock down.
//   - Because manual linking mutates a per-ad performance record, the gate
//     is `resolveMetaScope` (workspace resolution + team-member allow-list),
//     not `assertNotTeamMember` — a verified team member on the owner's
//     workspaces IS the intended caller (SC-009 / FR-017).
// ═══════════════════════════════════════════════════════════

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getDb } from "./firestoreClient.js";
import { SYNC_DISPATCH_REGION } from "./metaSync/dispatcher.js";
import {
    resolveMetaScope,
    assertWorkspaceAllowed,
    type ResolvedMetaScope,
} from "./workspaces/metaCallerScope.js";

interface LinkUnmatchedAdRequest {
    workspaceId: string;
    accountId: string;
    adId: string;
    generationId: string;
}

export const linkUnmatchedAd = onCall(
    { region: SYNC_DISPATCH_REGION, cors: true },
    async (request: CallableRequest) => {
        // Universal Phase 967 preamble (FR-001, FR-003). `resolveMetaScope`
        // rejects unauthenticated callers and degraded scope lookups
        // itself; no separate `request.auth` check needed here.
        const scope = await resolveMetaScope(request);
        return linkUnmatchedAdImpl(scope, request.data);
    },
);

// Extracted so the caller-scope contract test can drive it directly with
// a fake `scope` + an in-memory Firestore stub. Same shape as
// `getWhatsWorkingDashboardImpl` in whatsWorkingDashboard.ts.
export async function linkUnmatchedAdImpl(
    scope: ResolvedMetaScope,
    requestData: unknown,
): Promise<{ ok: true; matchType: "manual" }> {
    const req = requestData as LinkUnmatchedAdRequest;
    if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
        throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
    }
    if (typeof req.adId !== "string" || typeof req.generationId !== "string") {
        throw new HttpsError("invalid-argument", "adId and generationId are required.");
    }

    // FR-004 / FR-021 — refuse before any read or write.
    assertWorkspaceAllowed(scope, req.workspaceId);
    // Every Firestore path below is the OWNER's. `scope.callerUid` is the
    // audit signal only and MUST NOT appear in a path.
    const ownerUid = scope.ownerUid;

    // Verify the generation exists. Generation docs live at the TOP-LEVEL
    // `generations/{genId}` collection (written by `feedbackService.saveGeneration`
    // via `addDoc(collection(db, 'generations'), ...)`), NOT inside the
    // workspace subcollection. The original (wrong) read path always
    // returned "not found" and broke manual linking.
    const generationRef = getDb().collection("generations").doc(req.generationId);
    const genSnap = await generationRef.get();
    if (!genSnap.exists) {
        throw new HttpsError(
            "not-found",
            "This generation does not exist.",
        );
    }
    // FR-023: the generation's `workspaceId` field must match the
    // request's workspaceId. Without this check, a user could link an ad
    // to a generation from a different workspace — bypassing the
    // workspace-scoped fingerprint index that drives auto-match.
    const genData = genSnap.data() || {};
    if (typeof genData.workspaceId === "string" && genData.workspaceId !== req.workspaceId) {
        throw new HttpsError(
            "permission-denied",
            "This generation belongs to a different workspace.",
        );
    }
    // The generation's `userId` is the OWNER's (generations are stored
    // under the owner — `feedbackService.saveGeneration` runs in the
    // owner's auth context, not a team member's). The pre-967 check
    // compared against the caller's uid, which a team member's call
    // would never satisfy even when the link was legitimate.
    if (typeof genData.userId === "string" && genData.userId !== ownerUid) {
        throw new HttpsError(
            "permission-denied",
            "This generation does not belong to the current account.",
        );
    }

    // Set the match on the ad performance record. Manual links are
    // LOCKED — the worker preserves this on every re-sync.
    const adRef = getDb()
        .collection("users").doc(ownerUid)
        .collection("workspaces").doc(req.workspaceId)
        .collection("adAccounts").doc(req.accountId)
        .collection("adPerformance").doc(req.adId);

    const existingSnap = await adRef.get();
    if (existingSnap.exists) {
        const existing = existingSnap.data() as { matchType?: string } | undefined;
        // Re-linking manually is allowed (the dashboard may need to
        // switch which generation an ad is linked to). Auto-hash links
        // can be replaced by manual links; manual links can be replaced
        // by other manual links. Either way the new value is "manual".
        await adRef.set({
            generationId: req.generationId,
            matchType: "manual",
            matchDistance: null,
            metadataAvailable: true,
            matchedManuallyAt: Date.now(),
            // Audit signal — which team member (if any) initiated the link.
            matchedByUid: scope.callerUid,
        }, { merge: true });
    } else {
        // The ad hasn't been synced yet — create a minimal record so the
        // dashboard can show the manual link before the next sync.
        await adRef.set({
            adId: req.adId,
            generationId: req.generationId,
            matchType: "manual",
            matchDistance: null,
            metadataAvailable: true,
            matchedManuallyAt: Date.now(),
            matchedByUid: scope.callerUid,
            schemaVersion: 1,
        }, { merge: true });
    }

    return { ok: true as const, matchType: "manual" as const };
}
