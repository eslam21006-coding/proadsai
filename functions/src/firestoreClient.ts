// functions/src/firestoreClient.ts — Phase 14 canonical Firestore getter
// ═══════════════════════════════════════════════════════════
// Single canonical lazy `getDb()` getter for the entire `functions/src/`
// tree. Replaces the duplicated `function getDb() { return admin.firestore(); }`
// helpers that were inlined into ~10 modules (research constraint: "lazy
// getDb(), never `admin.firestore()` at module load").
//
// Why a shared module:
//   - One canonical line of code to audit (the plan's cross-cutting
//     constraint, principle VI/VII — auditable hidden layer).
//   - Phase 14 modules import from here so the entire codebase can later
//     migrate to a mockable seam for tests (e.g. swap to `getFirestore()`
//     from `@firebase/testing`).
//   - Tree-shake friendly: this module imports `firebase-admin` lazily, so
//     modules that never touch Firestore never pay the cost.
//
// Behavior:
//   - First call resolves `admin.initializeApp()` if not already initialized
//     (idempotent — `initializeApp()` is safe to call multiple times in
//     modern admin SDKs, but we guard it).
//   - Subsequent calls return the cached Firestore instance.
//   - Never called at module load — only inside async function bodies.
//
// Import:
//   import { getDb } from "./firestoreClient.js";
// ═══════════════════════════════════════════════════════════

import * as admin from "firebase-admin";

let _initialized = false;

function ensureInitialized(): void {
    if (_initialized) return;
    try {
        admin.initializeApp();
    } catch (err: unknown) {
        // Ignore "already initialized" — every other error is rethrown so
        // broken configs surface loudly.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists|already initialized/i.test(msg)) {
            throw err;
        }
    }
    _initialized = true;
}

/**
 * Lazily resolve the Admin SDK Firestore instance. Cached after first call.
 * Never call `admin.firestore()` directly anywhere else in the codebase —
 * import this helper instead. (Phase 14 cross-cutting constraint.)
 */
export function getDb(): FirebaseFirestore.Firestore {
    ensureInitialized();
    return admin.firestore();
}

/**
 * Test-only seam — resets the "initialized" flag so unit tests that mock
 * `admin.initializeApp` get a clean slate. NOT exported in any barrel.
 */
export function _resetFirestoreClientForTests(): void {
    _initialized = false;
}