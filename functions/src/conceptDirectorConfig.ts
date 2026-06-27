// functions/src/conceptDirectorConfig.ts — Phase 20 Concept Director config
// PINNED 2026-06-27 (research.md D4 / D1 remediation): the kill-switch
// mechanism is FIXED to Firebase Remote Config server template. The
// Firestore-doc alternative is documented in research.md §D4 as a
// break-glass fallback only and MUST NOT be implemented unless Remote
// Config wiring is blocked.
//
// This module owns two small IO helpers used by `index.ts`:
//   - `getConceptDirectorKillSwitch()` — read the Remote Config
//     `conceptDirectorKillSwitch` parameter with a 60-second
//     in-process cache; serves last-known-good on read error (C2.3).
//   - `getConceptDirectorEnabled(uid)` — read the per-user
//     `users/{uid}.conceptDirectorEnabled` flag from the user doc;
//     absent / non-boolean → `false` (C2.1).
//
// Both helpers are fail-open: a failed read NEVER throws to the
// caller; it returns the safe default (`killSwitch: false`,
// `enabled: false`). The whole Phase 20 stage is itself fail-open
// (FR-011), so a config-read failure at worst disables the new stage
// for the affected generation — never converts a successful generation
// into a user-facing failure (Contract C6.2).

import * as admin from "firebase-admin";

// ═══════════════════════════════════════════════════════════
// KILL-SWITCH CACHE — 60s in-process
// ═══════════════════════════════════════════════════════════

const CACHE_TTL_MS = 60_000;

/**
 * Cached kill-switch value. Holds the LAST KNOWN GOOD value so a
 * read failure during a live cache window does not silently re-enable
 * a killed feature (research.md §D4 nuance, "Important nuance" — flip
 * after a remote-config outage keeps the kill switch sticky).
 */
let _cachedKillSwitch: { value: boolean; ts: number; hasEverResolved: boolean } = {
    value: false,
    ts: 0,
    hasEverResolved: false,
};

/**
 * Read the global kill switch from Firebase Remote Config with a 60s
 * in-process cache. Returns `true` only when the Remote Config server
 * template explicitly carries `conceptDirectorKillSwitch === true`.
 * Anything else (param absent, type wrong, Remote Config read error)
 * returns `false` — fail-open per FR-011 / Contract C2.3.
 *
 * Caching strategy (per research.md D4):
 *   - First read attempts Remote Config; on success, primes the cache
 *     with `value` + current timestamp + sets `hasEverResolved = true`.
 *   - Subsequent reads within the 60s window return the cached value
 *     without hitting Remote Config (SC-006 + Principle VIII cost
 *     discipline).
 *   - On read failure, the cached value (if any) is served — the kill
 *     switch stays sticky across a remote-config outage.
 *   - If the cache has never resolved, the failure falls through to
 *     `false` (the safe default — the stage is itself fail-open).
 */
export async function getConceptDirectorKillSwitch(): Promise<boolean> {
    const now = Date.now();
    if (_cachedKillSwitch.hasEverResolved && now - _cachedKillSwitch.ts < CACHE_TTL_MS) {
        return _cachedKillSwitch.value;
    }
    try {
        // Dynamic import — avoids loading firebase-admin/remote-config
        // until we actually need it (cuts cold-start cost on the
        // common cache-hit path).
        const rc = admin.remoteConfig();
        const tpl = await rc.getServerTemplate();
        // The ServerTemplate carries a typed `evaluate()` helper that
        // resolves parameter values against the default config; using
        // it (instead of regex-parsing the raw template JSON) is the
        // type-safe path and handles every Remote Config parameter
        // shape (string / boolean / number / JSON).
        const serverConfig = tpl.evaluate();
        let value: boolean;
        try {
            value = serverConfig.getBoolean("conceptDirectorKillSwitch");
        } catch {
            // Param absent or non-boolean → treat as OFF (safe default).
            value = false;
        }
        _cachedKillSwitch = { value, ts: now, hasEverResolved: true };
        return value;
    } catch {
        // Read failure: serve cached value if we have one, else false.
        if (_cachedKillSwitch.hasEverResolved) {
            return _cachedKillSwitch.value;
        }
        return false;
    }
}

/**
 * Test-only seam — invalidates the in-process cache so a unit test can
 * exercise both the cache-hit and the cold-read paths without sleeping
 * 60 seconds. NOT exported in package.json barrel; only called from
 * tests.
 */
export function _resetConceptDirectorKillSwitchCacheForTests(): void {
    _cachedKillSwitch = { value: false, ts: 0, hasEverResolved: false };
}

// ═══════════════════════════════════════════════════════════
// PER-USER FLAG
// ═══════════════════════════════════════════════════════════

/**
 * Read the per-user `users/{uid}.conceptDirectorEnabled` flag. Absent
 * or non-boolean → `false` (Contract C2.1, A4 default-off). Read
 * failures also resolve to `false` (fail-open) — the orchestrator's
 * run/skip gate treats false as "skip" and runs today's behavior
 * verbatim.
 */
export async function getConceptDirectorEnabled(uid: string): Promise<boolean> {
    if (!uid || typeof uid !== "string") return false;
    try {
        const snap = await admin.firestore().collection("users").doc(uid).get();
        if (!snap.exists) return false;
        const v = snap.get("conceptDirectorEnabled");
        return v === true;
    } catch {
        return false;
    }
}
