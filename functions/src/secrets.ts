// functions/src/secrets.ts — Centralized Firebase Functions secret definitions
// ═══════════════════════════════════════════════════════════
// Phase 14 — Layer 2 (Meta sync) needs `META_APP_SECRET` to decrypt the
// legacy AES-GCM token used by the existing OAuth flow (`metaConnections`
// collection). The `metaSync/` worker + trigger functions can't import
// from `index.ts` (circular), so we declare the secret here and any
// future module that needs it can import from this file.
//
// Cloud Functions only injects secrets into functions that DECLARE them
// in their options. Forgetting the declaration causes the secret to be
// `undefined` at runtime, which manifests as a synchronous throw inside
// the legacy decrypt helper.
//
// Region: europe-west1 (matches the rest of the Cloud Functions surface).
// ═══════════════════════════════════════════════════════════

import { defineSecret } from "firebase-functions/params";

// Long-lived Meta user token encryption key — derived via scrypt into the
// AES-256-GCM key the existing OAuth callback uses.
export const metaAppSecret = defineSecret("META_APP_SECRET");