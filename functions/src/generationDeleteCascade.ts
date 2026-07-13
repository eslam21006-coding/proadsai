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
// SCOPE (FR-023): the trigger only watches the workspace-scoped
// `generations` collection. Cross-workspace searches are forbidden anyway.
// ═══════════════════════════════════════════════════════════

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { getDb } from "./firestoreClient.js";

export const onGenerationDeleted = onDocumentDeleted(
    {
        region: "europe-west1",
        document: "users/{userId}/workspaces/{workspaceId}/generations/{generationId}",
    },
    async (event) => {
        const { userId, workspaceId, generationId } = event.params as {
            userId: string;
            workspaceId: string;
            generationId: string;
        };

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
