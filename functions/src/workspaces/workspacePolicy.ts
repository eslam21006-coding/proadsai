// functions/src/workspaces/workspacePolicy.ts — server-side plan/credit entitlement resolution for workspaces

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

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

// Transaction-safe plan check + limit check + create. Plan, count, and write
// all happen in one txn so a concurrent downgrade or concurrent create cannot
// slip through between a pre-txn entitlement check and the write.
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

export async function resolveCallerScope(callerUid: string): Promise<{
  ownerUid: string;
  allowedWorkspaceIds: string[] | "ALL";
}> {
  const teamDoc = await admin.firestore().collection(`users/${callerUid}/team`).doc("meta").get();

  if (teamDoc.exists && teamDoc.data()?.ownerUid) {
    const ownerUid = teamDoc.data()!.ownerUid;
    const membersSnap = await admin.firestore().collection(`users/${ownerUid}/team/members`).doc(callerUid).get();
    const allowedWs: string[] = membersSnap.exists ? (membersSnap.data()?.workspaceIds ?? []) : [];
    return { ownerUid, allowedWorkspaceIds: allowedWs };
  }

  const wsSnap = await admin.firestore().collection(`users/${callerUid}/workspaces`).get();
  const wsIds = wsSnap.docs.filter((d) => d.data().deletedAt == null).map((d) => d.id);
  return { ownerUid: callerUid, allowedWorkspaceIds: wsIds.length > 0 ? wsIds : "ALL" };
}



