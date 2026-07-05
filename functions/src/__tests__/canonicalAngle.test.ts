// functions/src/__tests__/canonicalAngle.test.ts
// Phase 14 — Layer 4b/7 shared alias resolver unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    resolveCanonicalAngle,
    isCanonicalAngle,
    getHookAliasMap,
    getCanonicalAnglesWithAliases,
    ALL_CANONICAL_HOOK_ANGLES,
} from "../canonicalAngle.js";

// ─── Alias resolution ────────────────────────────────────────

test("resolveCanonicalAngle — alias shocking_stat → statistics", () => {
    assert.equal(resolveCanonicalAngle("shocking_stat"), "statistics");
});

test("resolveCanonicalAngle — alias fear_of_missing_out → urgency", () => {
    assert.equal(resolveCanonicalAngle("fear_of_missing_out"), "urgency");
});

test("resolveCanonicalAngle — alias future_pacing → future_based", () => {
    assert.equal(resolveCanonicalAngle("future_pacing"), "future_based");
});

test("resolveCanonicalAngle — already canonical → returned unchanged", () => {
    assert.equal(resolveCanonicalAngle("statistics"), "statistics");
    assert.equal(resolveCanonicalAngle("urgency"), "urgency");
    assert.equal(resolveCanonicalAngle("future_based"), "future_based");
});

test("resolveCanonicalAngle — unknown id → returned unchanged (caller buckets it)", () => {
    assert.equal(resolveCanonicalAngle("unicorn_angle_99"), "unicorn_angle_99");
});

test("resolveCanonicalAngle — empty / null / non-string → fail-safe default", () => {
    assert.equal(resolveCanonicalAngle(""), "urgency");     // default failSafe
    assert.equal(resolveCanonicalAngle("   "), "urgency");
    assert.equal(resolveCanonicalAngle(null), "urgency");
    assert.equal(resolveCanonicalAngle(undefined), "urgency");
    assert.equal(resolveCanonicalAngle(42), "urgency");
    assert.equal(resolveCanonicalAngle({}), "urgency");
});

test("resolveCanonicalAngle — custom failSafe parameter honored", () => {
    assert.equal(resolveCanonicalAngle(null, "future_based"), "future_based");
    assert.equal(resolveCanonicalAngle("", "statistics"), "statistics");
});

// ─── isCanonicalAngle ─────────────────────────────────────────

test("isCanonicalAngle — true for the 10 canonical ids", () => {
    assert.equal(ALL_CANONICAL_HOOK_ANGLES.length, 10);
    for (const id of ALL_CANONICAL_HOOK_ANGLES) {
        assert.equal(isCanonicalAngle(id), true, `${id} should be canonical`);
    }
});

test("isCanonicalAngle — true for aliases (after resolution)", () => {
    assert.equal(isCanonicalAngle("shocking_stat"), true);
    assert.equal(isCanonicalAngle("fear_of_missing_out"), true);
    assert.equal(isCanonicalAngle("future_pacing"), true);
});

test("isCanonicalAngle — false for unknown / null / non-string", () => {
    assert.equal(isCanonicalAngle("not_a_real_angle"), false);
    assert.equal(isCanonicalAngle(""), false);
    assert.equal(isCanonicalAngle(null), false);
    assert.equal(isCanonicalAngle(42), false);
});

// ─── getHookAliasMap / getCanonicalAnglesWithAliases ──────────

test("getHookAliasMap — exposes the three canonical aliases", () => {
    const map = getHookAliasMap();
    assert.equal(Object.keys(map).length, 3);
    assert.deepEqual(map, {
        shocking_stat: "statistics",
        fear_of_missing_out: "urgency",
        future_pacing: "future_based",
    });
});

test("getCanonicalAnglesWithAliases — returns the three canonical targets", () => {
    const targets = getCanonicalAnglesWithAliases();
    assert.equal(targets.length, 3);
    assert.deepEqual(new Set(targets), new Set(["statistics", "urgency", "future_based"]));
});