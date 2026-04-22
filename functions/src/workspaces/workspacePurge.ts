// functions/src/workspaces/workspacePurge.ts — scheduled purge + delete/restore cascade triggers

import * as functions from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

const db = admin.firestore();
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;
const PAGE_SIZE = 400;
const PURGE_BATCH_SIZE = 200;
const MAX_ITEMS_PER_INVOCATION = 2000;

interface PurgeRunSummary {
  startedAt: number;
  finishedAt: number;
  workspacesChecked: number;
  workspacesPurged: number;
  errors: { workspaceId: string; reason: string }[];
}

export const purgeExpiredWorkspaces = onSchedule(
  {
    schedule: "0 4 * * *",
    timeZone: "UTC",
    region: "us-central1",
  },
  async () => {
    const summary: PurgeRunSummary = {
      startedAt: Date.now(),
      finishedAt: 0,
      workspacesChecked: 0,
      workspacesPurged: 0,
      errors: [],
    };

    const cutoff = Date.now() - THIRTY_DAYS_MS;
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

    try {
      while (summary.workspacesChecked < MAX_ITEMS_PER_INVOCATION) {
        let q: admin.firestore.Query = db
          .collectionGroup("workspaces")
          .where("deletedAt", "<=", cutoff)
          .orderBy("deletedAt", "asc")
          .limit(PURGE_BATCH_SIZE);

        if (lastDoc) {
          q = q.startAfter(lastDoc);
        }

        const snap = await q.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
          summary.workspacesChecked++;
          if (doc.data().isDefault === true) {
            summary.errors.push({
              workspaceId: doc.id,
              reason: "Default workspace should never be purged",
            });
            continue;
          }
          try {
            await doc.ref.delete();
            summary.workspacesPurged++;
          } catch (err: any) {
            summary.errors.push({
              workspaceId: doc.id,
              reason: err?.message ?? String(err),
            });
          }
        }

        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < PURGE_BATCH_SIZE) break;
      }
    } catch (err: any) {
      functions.logger.error("🔥 Purge run failed:", err);
      summary.errors.push({
        workspaceId: "(run)",
        reason: err?.message ?? String(err),
      });
    }

    summary.finishedAt = Date.now();
    functions.logger.log("✅ Purge run summary", summary);
  }
);

export async function cascadeReassignOnDelete(
  ownerUid: string,
  deletedWorkspaceId: string,
  defaultWorkspaceId: string
): Promise<void> {
  const batch = db.batch();

  const genSnap = await db
    .collection("generations")
    .where("workspaceId", "==", deletedWorkspaceId)
    .limit(PAGE_SIZE)
    .get();

  for (const doc of genSnap.docs) {
    batch.update(doc.ref, {
      workspaceId: defaultWorkspaceId,
      reassignedFromWorkspaceId: deletedWorkspaceId,
    });
  }

  const projSnap = await db
    .collection(`users/${ownerUid}/projects`)
    .where("workspaceId", "==", deletedWorkspaceId)
    .limit(PAGE_SIZE)
    .get();

  for (const doc of projSnap.docs) {
    batch.update(doc.ref, {
      workspaceId: defaultWorkspaceId,
      reassignedFromWorkspaceId: deletedWorkspaceId,
    });
  }

  const teamSnap = await db
    .collection(`users/${ownerUid}/team`)
    .where("workspaceAccess", "array-contains", deletedWorkspaceId)
    .get();

  for (const doc of teamSnap.docs) {
    const data = doc.data();
    const access: string[] = data.workspaceAccess ?? [];
    const removed: string[] = data.removedWorkspaceAccessByDelete ?? [];
    batch.update(doc.ref, {
      workspaceAccess: access.filter((id) => id !== deletedWorkspaceId),
      removedWorkspaceAccessByDelete: [...removed, deletedWorkspaceId],
    });
  }

  await batch.commit();

  await db
    .collection(`users/${ownerUid}/workspaces`)
    .doc(deletedWorkspaceId)
    .update({ pendingReassign: false });
}

export async function cascadeRevertOnRestore(
  ownerUid: string,
  restoredWorkspaceId: string
): Promise<void> {
  const batch = db.batch();

  const genSnap = await db
    .collection("generations")
    .where("reassignedFromWorkspaceId", "==", restoredWorkspaceId)
    .limit(PAGE_SIZE)
    .get();

  for (const doc of genSnap.docs) {
    batch.update(doc.ref, {
      workspaceId: restoredWorkspaceId,
      reassignedFromWorkspaceId: admin.firestore.FieldValue.delete(),
    });
  }

  const projSnap = await db
    .collection(`users/${ownerUid}/projects`)
    .where("reassignedFromWorkspaceId", "==", restoredWorkspaceId)
    .limit(PAGE_SIZE)
    .get();

  for (const doc of projSnap.docs) {
    batch.update(doc.ref, {
      workspaceId: restoredWorkspaceId,
      reassignedFromWorkspaceId: admin.firestore.FieldValue.delete(),
    });
  }

  const teamSnap = await db.collection(`users/${ownerUid}/team`).get();
  for (const doc of teamSnap.docs) {
    const data = doc.data();
    const removed: string[] = data.removedWorkspaceAccessByDelete ?? [];
    if (!removed.includes(restoredWorkspaceId)) continue;
    const access: string[] = data.workspaceAccess ?? [];
    batch.update(doc.ref, {
      workspaceAccess: [...access, restoredWorkspaceId],
      removedWorkspaceAccessByDelete: removed.filter(
        (id) => id !== restoredWorkspaceId
      ),
    });
  }

  await batch.commit();

  await db
    .collection(`users/${ownerUid}/workspaces`)
    .doc(restoredWorkspaceId)
    .update({ pendingRestore: false });
}
