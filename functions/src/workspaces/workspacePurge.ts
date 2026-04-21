// functions/src/workspaces/workspacePurge.ts — scheduled purge + delete/restore cascade triggers

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;
const PAGE_SIZE = 400;

export const purgeExpiredWorkspaces = functions.scheduler.onSchedule(
  {
    schedule: "0 4 * * *",
    timeZone: "UTC",
    region: "us-central1",
  },
  async () => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    let purged = 0;
    let errors: { workspaceId: string; reason: string }[] = [];

    try {
      const snap = await db
        .collectionGroup("workspaces")
        .where("deletedAt", "<=", cutoff)
        .limit(500)
        .get();

      for (const doc of snap.docs) {
        if (doc.data().isDefault === true) {
          errors.push({
            workspaceId: doc.id,
            reason: "Default workspace should never be purged",
          });
          continue;
        }
        try {
          await doc.ref.delete();
          purged++;
        } catch (err: any) {
          errors.push({ workspaceId: doc.id, reason: err.message });
        }
      }
    } catch (err: any) {
      functions.logger.error("🔥 Purge run failed:", err);
    }

    functions.logger.log(
      `✅ Purge complete: ${purged} purged, ${errors.length} errors`
    );
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
