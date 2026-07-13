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
// ═══════════════════════════════════════════════════════════

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDb } from "./firestoreClient.js";
import { SYNC_DISPATCH_REGION } from "./metaSync/dispatcher.js";

interface LinkUnmatchedAdRequest {
    workspaceId: string;
    accountId: string;
    adId: string;
    generationId: string;
}

export const linkUnmatchedAd = onCall(
    { region: SYNC_DISPATCH_REGION, cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const uid = request.auth.uid;
        const req = request.data as LinkUnmatchedAdRequest;
        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }
        if (typeof req.adId !== "string" || typeof req.generationId !== "string") {
            throw new HttpsError("invalid-argument", "adId and generationId are required.");
        }

        // Verify the generation exists in this workspace (cross-workspace link → reject).
        const generationRef = getDb()
            .collection("users").doc(uid)
            .collection("workspaces").doc(req.workspaceId)
            .collection("generations").doc(req.generationId);
        const genSnap = await generationRef.get();
        if (!genSnap.exists) {
            throw new HttpsError(
                "not-found",
                "This generation does not belong to the selected workspace.",
            );
        }
        // Defensive cross-workspace check — the generation's workspaceId
        // must match the request's workspaceId. The doc path already
        // matches (so the read would have succeeded only if the path is
        // correct), but the in-doc field is the canonical source of truth.
        const genData = genSnap.data() || {};
        if (typeof genData.workspaceId === "string" && genData.workspaceId !== req.workspaceId) {
            throw new HttpsError(
                "permission-denied",
                "This generation belongs to a different workspace.",
            );
        }

        // Set the match on the ad performance record. Manual links are
        // LOCKED — the worker preserves this on every re-sync.
        const adRef = getDb()
            .collection("users").doc(uid)
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
                schemaVersion: 1,
            }, { merge: true });
        }

        return { ok: true as const, matchType: "manual" as const };
    },
);
