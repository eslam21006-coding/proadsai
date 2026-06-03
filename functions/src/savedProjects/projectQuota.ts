// functions/src/savedProjects/projectQuota.ts — server-side project quota resolution
//
// Read-and-decide helper called from inside a Firestore transaction so the
// project-count read and the project-write happen atomically (FR-006/FR-007).
// Calling this outside a transaction would let two parallel saves at cap-1
// both pass the check and both write, breaking SC-005.
//
// NON-BLOCKING by design: the project limit must NEVER block the user from
// working. This returns a decision instead of throwing:
//   - Updates to an existing project (isNewProject=false) are always allowed.
//   - A new auto-save over the limit is still allowed, and reports the oldest
//     DRAFT project to evict so the count stays at the cap (keep the most recent N).
//   - A new manual save over the limit is allowed with an `overLimit` warning flag
//     and no eviction (the user decides which projects to delete).

import { firestore } from "firebase-admin";

interface PlanLimits {
  savedProjectLimit: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  none: { savedProjectLimit: 0 },
  starter: { savedProjectLimit: 10 },
  pro: { savedProjectLimit: 30 },
  scale: { savedProjectLimit: Infinity },
};

export type SaveSource = "autosave" | "manual";

export interface QuotaDecision {
  // True when the user is at/over their plan's project cap on a NEW project — surfaced to
  // the client as a non-blocking warning banner. Never set for updates or under-cap saves.
  overLimit: boolean;
  // Project id to evict (oldest draft) so an auto-save stays within the cap; null = no eviction.
  evictId: string | null;
}

export async function enforceProjectQuota(
  txn: firestore.Transaction,
  uid: string,
  plan: string,
  isNewProject: boolean,
  source: SaveSource = "autosave",
): Promise<QuotaDecision> {
  // Updates to an existing project never count against the limit.
  if (!isNewProject) return { overLimit: false, evictId: null };

  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
  if (limits.savedProjectLimit === Infinity) return { overLimit: false, evictId: null };

  const projectsRef = firestore().collection(`users/${uid}/projects`);
  const snap = await txn.get(projectsRef);
  const current = snap.size;

  if (current < limits.savedProjectLimit) return { overLimit: false, evictId: null };

  // Over the cap on a NEW project. NEVER hard-block (auto-save must always succeed).
  console.info(`phase13 ▸ quota-over uid=${uid} plan=${plan} current=${current} limit=${limits.savedProjectLimit} source=${source}`);

  if (source === "autosave") {
    // Evict the OLDEST draft (by updatedAt, then id) to make room — never touch a
    // rendered/published project. If there is no draft to evict, allow a soft overflow
    // rather than block the user.
    const oldestDraft = snap.docs
      .filter((d) => (d.data() as { status?: string }).status === "draft")
      .sort((a, b) => {
        const au = (a.data() as { updatedAt?: number }).updatedAt ?? 0;
        const bu = (b.data() as { updatedAt?: number }).updatedAt ?? 0;
        return au - bu || a.id.localeCompare(b.id);
      })[0];
    return { overLimit: true, evictId: oldestDraft ? oldestDraft.id : null };
  }

  // Manual save: warn but allow, no eviction.
  return { overLimit: true, evictId: null };
}
