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

async function paginatedUpdate(
  buildQuery: (cursor: admin.firestore.QueryDocumentSnapshot | null) => admin.firestore.Query,
  applyUpdate: (doc: admin.firestore.QueryDocumentSnapshot) => Record<string, unknown>
): Promise<void> {
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
  while (true) {
    const snap = await buildQuery(cursor).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, applyUpdate(doc));
    }
    await batch.commit();
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
}

export async function cascadeReassignOnDelete(
  ownerUid: string,
  deletedWorkspaceId: string,
  defaultWorkspaceId: string
): Promise<void> {
  // Generations — scope by owner AND workspaceId so another owner's records never leak into the update.
  await paginatedUpdate(
    (cursor) => {
      let q: admin.firestore.Query = db
        .collection("generations")
        .where("userId", "==", ownerUid)
        .where("workspaceId", "==", deletedWorkspaceId)
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      return q;
    },
    () => ({
      workspaceId: defaultWorkspaceId,
      reassignedFromWorkspaceId: deletedWorkspaceId,
    })
  );

  // Saved projects under this owner only.
  await paginatedUpdate(
    (cursor) => {
      let q: admin.firestore.Query = db
        .collection(`users/${ownerUid}/projects`)
        .where("workspaceId", "==", deletedWorkspaceId)
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      return q;
    },
    () => ({
      workspaceId: defaultWorkspaceId,
      reassignedFromWorkspaceId: deletedWorkspaceId,
    })
  );

  // Team members — bounded small list, one batch is fine.
  const teamSnap = await db
    .collection(`users/${ownerUid}/team`)
    .where("workspaceAccess", "array-contains", deletedWorkspaceId)
    .get();
  if (!teamSnap.empty) {
    const batch = db.batch();
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
  }

  // Clear the pending flag only after every page has been processed.
  await db
    .collection(`users/${ownerUid}/workspaces`)
    .doc(deletedWorkspaceId)
    .update({ pendingReassign: false });
}

export async function cascadeRevertOnRestore(
  ownerUid: string,
  restoredWorkspaceId: string
): Promise<void> {
  await paginatedUpdate(
    (cursor) => {
      let q: admin.firestore.Query = db
        .collection("generations")
        .where("userId", "==", ownerUid)
        .where("reassignedFromWorkspaceId", "==", restoredWorkspaceId)
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      return q;
    },
    () => ({
      workspaceId: restoredWorkspaceId,
      reassignedFromWorkspaceId: admin.firestore.FieldValue.delete(),
    })
  );

  await paginatedUpdate(
    (cursor) => {
      let q: admin.firestore.Query = db
        .collection(`users/${ownerUid}/projects`)
        .where("reassignedFromWorkspaceId", "==", restoredWorkspaceId)
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      return q;
    },
    () => ({
      workspaceId: restoredWorkspaceId,
      reassignedFromWorkspaceId: admin.firestore.FieldValue.delete(),
    })
  );

  const teamSnap = await db.collection(`users/${ownerUid}/team`).get();
  if (!teamSnap.empty) {
    const batch = db.batch();
    let pending = 0;
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
      pending++;
    }
    if (pending > 0) await batch.commit();
  }

  await db
    .collection(`users/${ownerUid}/workspaces`)
    .doc(restoredWorkspaceId)
    .update({ pendingRestore: false });
}
