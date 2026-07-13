// functions/src/backfillImageFingerprints.ts — Phase 14 Layer 3 backfill migration
// ═══════════════════════════════════════════════════════════
// One-time callable that walks existing generations, computes their perceptual
// hash from the stored Storage image, and writes both:
//   - `imageFingerprint` + `imageFingerprintAlgo` on the generation doc
//   - The workspace-scoped `imageFingerprints/{hash}` index entry
//
// IDEMPOTENT — skips generations that already carry an `imageFingerprint`.
//
// SCOPE (FR-023, Edge Case 13):
//   - Only generations with a `workspaceId` are processed.
//   - Unassigned legacy generations are skipped and can only be matched
//     manually via the dashboard.
//
// MISSING SOURCE — generations whose Storage image is gone are skipped.
// They remain manually-linkable (Batch 04 picker shows them).
// ═══════════════════════════════════════════════════════════

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { getDb } from "./firestoreClient.js";
import { computeHash } from "./perceptualHash.js";
import { SYNC_DISPATCH_REGION } from "./metaSync/dispatcher.js";

interface BackfillRequest {
    /** Optional — limit to one workspace. Useful for incremental / per-user runs. */
    workspaceId?: string;
    /** Optional — cap on how many generations to process in this invocation. */
    maxItems?: number;
}

interface BackfillResult {
    ok: true;
    scanned: number;
    skippedAlreadyFingerprinted: number;
    skippedNoWorkspace: number;
    skippedMissingImage: number;
    processed: number;
    errors: number;
}

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;

export const backfillImageFingerprints = onCall(
    { region: SYNC_DISPATCH_REGION, cors: true, timeoutSeconds: 540, memory: "2GiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const uid = request.auth.uid;
        const req = (request.data || {}) as BackfillRequest;
        const maxItems = Math.min(typeof req.maxItems === "number" && req.maxItems > 0 ? req.maxItems : DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
        const targetWorkspaceId = typeof req.workspaceId === "string" && req.workspaceId.length > 0
            ? req.workspaceId
            : null;

        const result: BackfillResult = {
            ok: true,
            scanned: 0,
            skippedAlreadyFingerprinted: 0,
            skippedNoWorkspace: 0,
            skippedMissingImage: 0,
            processed: 0,
            errors: 0,
        };

        // Walk the user's generations in pages. We use a simple in-memory
        // page loop — backfill is one-time per user (callable invokes are
        // bounded by maxItems per call).
        const workspacesSnap = await getDb()
            .collection("users").doc(uid)
            .collection("workspaces")
            .get();

        outer: for (const wsDoc of workspacesSnap.docs) {
            if (targetWorkspaceId && wsDoc.id !== targetWorkspaceId) continue;
            const wsData = wsDoc.data() || {};
            if (typeof wsData.workspaceId === "string" && wsData.workspaceId !== wsDoc.id) continue;
            void wsData;

            const generationsRef = wsDoc.ref.collection("generations");
            // Firestore paginates 100 at a time by default. For backfill we
            // only need to scan up to maxItems across ALL workspaces, so we
            // use a coarse cursor + in-memory filter on `imageFingerprint`.
            let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
            while (true) {
                let q = generationsRef.orderBy("createdAt", "desc").limit(100);
                if (cursor) q = q.startAfter(cursor);
                const page = await q.get();
                if (page.empty) break;
                cursor = page.docs[page.docs.length - 1];

                for (const genDoc of page.docs) {
                    result.scanned++;
                    if (result.scanned > maxItems) break outer;

                    const data = genDoc.data() as Record<string, unknown>;
                    if (typeof data.imageFingerprint === "string" && data.imageFingerprint.length > 0) {
                        result.skippedAlreadyFingerprinted++;
                        continue;
                    }
                    if (typeof data.workspaceId !== "string" || data.workspaceId.length === 0) {
                        result.skippedNoWorkspace++;
                        continue;
                    }

                    // Locate the source image. The Storage URL is persisted on
                    // `imageUrl` (or `output.imageUrl` for newer shapes).
                    const imageUrl = pickImageUrl(data);
                    if (!imageUrl) {
                        result.skippedMissingImage++;
                        continue;
                    }

                    try {
                        const buffer = await downloadFromUrl(imageUrl);
                        const hash = await computeHash(buffer);
                        // Write to the generation doc + the workspace index.
                        const indexRef = genDoc.ref.parent.parent
                            ? getDb()
                                .collection("users").doc(uid)
                                .collection("workspaces").doc(wsDoc.id)
                                .collection("imageFingerprints").doc(hash)
                            : null;
                        const writes: Array<Promise<unknown>> = [
                            genDoc.ref.set({
                                imageFingerprint: hash,
                                imageFingerprintAlgo: "dhash64",
                            }, { merge: true }),
                        ];
                        if (indexRef) {
                            writes.push(indexRef.set({
                                hash,
                                hashAlgo: "dhash64",
                                generationId: genDoc.id,
                                createdAt: typeof data.createdAt === "number"
                                    ? data.createdAt
                                    : Date.now(),
                            }, { merge: true }));
                        }
                        await Promise.all(writes);
                        result.processed++;
                    } catch (e: unknown) {
                        result.errors++;
                        console.warn(`backfillImageFingerprints: ${genDoc.id} failed: ${(e as Error).message}`);
                    }
                }
            }
        }

        return result;
    },
);

function pickImageUrl(data: Record<string, unknown>): string | null {
    const candidates = [
        data.imageUrl,
        (data.output as { imageUrl?: string } | undefined)?.imageUrl,
        (data.output as { storageUrl?: string } | undefined)?.storageUrl,
        data.storageUrl,
        (data.deploymentMeta as { storageUrl?: string } | undefined)?.storageUrl,
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.length > 0) return c;
    }
    return null;
}

async function downloadFromUrl(url: string): Promise<Buffer> {
    // Storage URLs (https://storage.googleapis.com/<bucket>/<object>) — use
    // Admin SDK because we have admin privileges and we want to bypass CORS
    // / signed URL expiration. The bucket name is the first path segment,
    // not the default bucket — projects may store renders in a non-default
    // bucket. For other URLs, fall back to fetch().
    if (url.startsWith("https://storage.googleapis.com/")) {
        const stripped = url.replace("https://storage.googleapis.com/", "");
        const slashIdx = stripped.indexOf("/");
        if (slashIdx < 0) {
            throw new Error("downloadFromUrl: malformed Storage URL (no object path)");
        }
        const bucketName = stripped.slice(0, slashIdx);
        const objectPath = stripped.slice(slashIdx + 1);
        if (objectPath.length === 0) {
            throw new Error("downloadFromUrl: empty object path");
        }
        const bucket = getStorage().bucket(bucketName);
        const file = bucket.file(objectPath);
        const [contents] = await file.download();
        return contents;
    }
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`download failed: ${resp.status}`);
    }
    const arr = await resp.arrayBuffer();
    return Buffer.from(arr);
}
