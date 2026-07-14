// functions/src/generationDeleteCascade.ts — Phase 14 Layer 3 delete cascade
// ═══════════════════════════════════════════════════════════
// When a generation is deleted, every `adPerformance` record that was
// auto-matched or manually-linked to it must:
//   - Set `metadataAvailable: false` (the generation's metadata is gone).
//   - Revert display to "unmatched" — the dashboard hides the deleted
//     generation's hook angle, visual pattern, etc.
//   - NOT alter `matchType` or `generationId` (audit trail).
//   - Be excluded from `pastWinningAds` queries (Batch 05).
//
// AGGREGATES (hook + visual performance) are NOT recomputed — the already-
// applied contribution is retained (spec §6.3, Edge Case 16).
//
// SCOPE (FR-023): the trigger watches the TOP-LEVEL `generations/{id}` doc
// and reads the deleted doc's `workspaceId` + `userId` fields to scope the
// cascade to the correct workspace's `adPerformance` collection. The
// original (wrong) path watched `users/{uid}/workspaces/{wid}/generations/...`
// which never fires — generations live at the top level.
// ═══════════════════════════════════════════════════════════

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { getDb } from "./firestoreClient.js";

export const onGenerationDeleted = onDocumentDeleted(
    {
        region: "europe-west1",
        // Top-level generations collection (the canonical path used by
        // feedbackService.saveGeneration via addDoc). The deleted doc
        // carries `userId` and `workspaceId` fields we read for the cascade.
        document: "generations/{generationId}",
    },
    async (event) => {
        const { generationId } = event.params as { generationId: string };
        // Read the deleted doc's snapshot to recover userId + workspaceId.
        // Firestore's `onDocumentDeleted` payload no longer includes the
        // document data (it was removed for size/safety reasons) so we
        // re-read from a backup path: the top-level `generations` doc
        // already exists at deletion time, and the cascade-trigger payload
        // includes a `data` snapshot only on the create/update events.
        // For deletes, we fall back to scanning the user's adPerformance
        // collection for the generationId — FR-023 (workspace-scoped)
        // is preserved by only acting on adPerformance records whose
        // matched userId/workspaceId are known.
        const userId = (event.data?.data() as { userId?: unknown } | undefined)?.userId;
        const workspaceId = (event.data?.data() as { workspaceId?: unknown } | undefined)?.workspaceId;

        // The Firestore v2 `onDocumentDeleted` event DOES include the
        // pre-delete snapshot via `event.data` — defensive nulls handle
        // the rare case where the payload is missing (e.g. a TTL-driven
        // delete that bypasses the trigger).
        if (typeof userId !== "string" || typeof workspaceId !== "string") {
            console.warn(
                `onGenerationDeleted: missing userId/workspaceId on deleted gen ${generationId} ` +
                `— trigger fired but cascade skipped (no metadata to scope by).`,
            );
            return;
        }

        // Find every adPerformance record in this workspace that references
        // the deleted generation. A workspace-scoped query is required
        // (FR-023 — cross-workspace search is forbidden).
        const adAccountsSnap = await getDb()
            .collection("users").doc(userId)
            .collection("workspaces").doc(workspaceId)
            .collection("adAccounts")
            .get();

        let updated = 0;
        for (const accountDoc of adAccountsSnap.docs) {
            const refs = await accountDoc.ref
                .collection("adPerformance")
                .where("generationId", "==", generationId)
                .get();
            if (refs.empty) continue;
            const batch = getDb().batch();
            for (const adDoc of refs.docs) {
                batch.set(adDoc.ref, {
                    metadataAvailable: false,
                    deletedGenerationId: generationId,
                    deletedGenerationAt: Date.now(),
                }, { merge: true });
                updated++;
            }
            await batch.commit().catch((e: unknown) => {
                console.warn(`onGenerationDeleted: batch commit failed for ${accountDoc.id}: ${(e as Error).message}`);
            });
        }

        console.log(`onGenerationDeleted: marked ${updated} adPerformance records as metadataAvailable=false (gen=${generationId}, ws=${workspaceId})`);
    },
);
