// functions/src/__tests__/savedProjects.projectQuota.test.ts — quota resolution tests
//
// Mirrors the NON-BLOCKING decision logic of enforceProjectQuota (projectQuota.ts):
// the project limit never hard-blocks a save. Updates are always allowed; a new auto-save
// over the cap is allowed and reports the oldest DRAFT to evict; a new manual save over the
// cap is allowed with an overLimit warning and no eviction.

import assert from "node:assert/strict";

interface PlanLimits { savedProjectLimit: number; }
const PLAN_LIMITS: Record<string, PlanLimits> = {
  none: { savedProjectLimit: 0 },
  starter: { savedProjectLimit: 10 },
  pro: { savedProjectLimit: 30 },
  scale: { savedProjectLimit: Infinity },
};

type SaveSource = "autosave" | "manual";
interface Decision { overLimit: boolean; evictId: string | null; }
interface ProjectDoc { id: string; status?: string; updatedAt?: number; }

function resolveQuota(plan: string, isNewProject: boolean, projects: ProjectDoc[], source: SaveSource = "autosave"): Decision {
  if (!isNewProject) return { overLimit: false, evictId: null };
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
  if (limits.savedProjectLimit === Infinity) return { overLimit: false, evictId: null };
  if (projects.length < limits.savedProjectLimit) return { overLimit: false, evictId: null };
  if (source === "autosave") {
    const oldestDraft = projects
      .filter((p) => p.status === "draft")
      .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0) || a.id.localeCompare(b.id))[0];
    return { overLimit: true, evictId: oldestDraft ? oldestDraft.id : null };
  }
  return { overLimit: true, evictId: null };
}

// Build N project docs; the first `drafts` of them are status "draft" (oldest first by updatedAt).
function makeProjects(n: number, drafts = 0): ProjectDoc[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i).padStart(3, "0")}`,
    status: i < drafts ? "draft" : "rendered",
    updatedAt: i, // ascending → index 0 is oldest
  }));
}

function run() {
  console.log("phase13 ▸ projectQuota tests");

  // ─── Update existing → always allowed, never over limit, no eviction ───
  {
    const d = resolveQuota("starter", false, makeProjects(11));
    assert.equal(d.overLimit, false, "update existing always allowed");
    assert.equal(d.evictId, null);
  }

  // ─── Scale unlimited ───
  {
    const d = resolveQuota("scale", true, makeProjects(999));
    assert.equal(d.overLimit, false, "scale is unlimited");
    assert.equal(d.evictId, null);
  }

  // ─── Under-cap new → allowed, no warning ───
  {
    const d = resolveQuota("starter", true, makeProjects(5));
    assert.equal(d.overLimit, false, "under-cap allowed");
    assert.equal(d.evictId, null);
  }

  // ─── 1 below cap → allowed ───
  {
    const d = resolveQuota("starter", true, makeProjects(9));
    assert.equal(d.overLimit, false, "1 below cap allowed");
  }

  // ─── Starter at cap, auto-save WITH a draft → allowed + evict oldest draft (non-blocking) ───
  {
    const projects = makeProjects(10, 3); // p000..p002 are drafts (oldest = p000)
    const d = resolveQuota("starter", true, projects, "autosave");
    assert.equal(d.overLimit, true, "at-cap reports overLimit warning");
    assert.equal(d.evictId, "p000", "auto-save evicts the oldest draft");
  }

  // ─── Starter at cap, auto-save with NO draft → allowed, soft overflow (no eviction, never blocks) ───
  {
    const d = resolveQuota("starter", true, makeProjects(10, 0), "autosave");
    assert.equal(d.overLimit, true);
    assert.equal(d.evictId, null, "no draft to evict → soft overflow, never blocks");
  }

  // ─── Pro at 30, manual save → warn but allow, no eviction ───
  {
    const d = resolveQuota("pro", true, makeProjects(30, 5), "manual");
    assert.equal(d.overLimit, true, "manual over-cap warns");
    assert.equal(d.evictId, null, "manual save never evicts");
  }

  // ─── None plan, new → over limit immediately, but still non-blocking (no throw) ───
  {
    const d = resolveQuota("none", true, makeProjects(0), "autosave");
    assert.equal(d.overLimit, true, "none plan is at cap for any new project");
    assert.equal(d.evictId, null, "no projects to evict");
  }

  console.log("✅ phase13 ▸ projectQuota — all 8 tests passed");
}

run();
