// functions/src/savedProjects/projectQuota.ts — server-side project quota enforcement
//
// Read-and-throw helper called from inside a Firestore transaction so the
// project-count read and the project-write happen atomically (FR-006/FR-007).
// Calling this outside a transaction would let two parallel saves at cap-1
// both pass the check and both write, breaking SC-005.

import { firestore } from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

interface PlanLimits {
  savedProjectLimit: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  none: { savedProjectLimit: 0 },
  starter: { savedProjectLimit: 10 },
  pro: { savedProjectLimit: 30 },
  scale: { savedProjectLimit: Infinity },
};

export async function enforceProjectQuota(
  txn: firestore.Transaction,
  uid: string,
  plan: string,
  isNewProject: boolean,
): Promise<void> {
  if (!isNewProject) return;

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
  if (limits.savedProjectLimit === Infinity) return;

  const projectsRef = firestore().collection(`users/${uid}/projects`);
  const snap = await txn.get(projectsRef);
  const current = snap.size;

  if (current >= limits.savedProjectLimit) {
    console.info(`phase13 ▸ quota-block uid=${uid} plan=${plan} current=${current} limit=${limits.savedProjectLimit}`);
    throw new HttpsError("failed-precondition", "QUOTA_EXCEEDED", {
      plan,
      limit: limits.savedProjectLimit,
      current,
    });
  }
}
