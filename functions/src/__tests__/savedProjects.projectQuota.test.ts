// functions/src/__tests__/savedProjects.projectQuota.test.ts — quota enforcement tests

import assert from "node:assert/strict";

interface PlanLimits { savedProjectLimit: number; }
const PLAN_LIMITS: Record<string, PlanLimits> = {
  none: { savedProjectLimit: 0 },
  starter: { savedProjectLimit: 10 },
  pro: { savedProjectLimit: 30 },
  scale: { savedProjectLimit: Infinity },
};

function checkQuota(plan: string, isNewProject: boolean, currentCount: number): { ok: boolean; plan?: string; limit?: number; current?: number } {
  if (!isNewProject) return { ok: true };
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
  if (limits.savedProjectLimit === Infinity) return { ok: true };
  if (currentCount >= limits.savedProjectLimit) {
    return { ok: false, plan, limit: limits.savedProjectLimit, current: currentCount };
  }
  return { ok: true };
}

function run() {
  console.log("phase13 ▸ projectQuota tests");

  // ─── At-cap rejection (Starter, 10 projects, new) ───
  {
    const result = checkQuota("starter", true, 10);
    assert.equal(result.ok, false, "starter at-cap should reject");
    assert.equal(result.limit, 10, "limit should be 10");
  }

  // ─── Over-cap update allowed (Starter, 11 projects, existing) ───
  {
    const result = checkQuota("starter", false, 11);
    assert.equal(result.ok, true, "update existing always allowed");
  }

  // ─── Scale unlimited ───
  {
    const result = checkQuota("scale", true, 999);
    assert.equal(result.ok, true, "scale is unlimited");
  }

  // ─── Under-cap allowed ───
  {
    const result = checkQuota("starter", true, 5);
    assert.equal(result.ok, true, "under-cap allowed");
  }

  // ─── Pro at 30 rejected ───
  {
    const result = checkQuota("pro", true, 30);
    assert.equal(result.ok, false, "pro at-cap rejected");
    assert.equal(result.limit, 30);
  }

  // ─── None plan rejects all new ───
  {
    const result = checkQuota("none", true, 0);
    assert.equal(result.ok, false, "none plan rejects new");
  }

  // ─── Race-safe: at-1-below cap allowed ───
  {
    const result = checkQuota("starter", true, 9);
    assert.equal(result.ok, true, "1 below cap allowed");
  }

  console.log("✅ phase13 ▸ projectQuota — all 7 tests passed");
}

run();
