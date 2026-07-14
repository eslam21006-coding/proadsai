// functions/src/metaSync/legacyToken.ts — Phase 14 Layer 2 legacy token decrypt
// ═══════════════════════════════════════════════════════════
// The existing user-level `metaConnections/{uid}` doc stores the Meta long-
// lived token encrypted with AES-256-GCM using a key derived from
// `META_APP_SECRET` (see `index.ts decryptToken`). For Phase 14 we re-encrypt
// with KMS via `tokenCrypto.ts`, but until the OAuth flow is updated, the
// workspace-scoped private doc carries the LEGACY ciphertext under
// `legacyToken`. This module decrypts that payload.
//
// FORMAT: `ivHex:authTagHex:ciphertextHex` — three hex-encoded buffers.
// KEY: `scryptSync(META_APP_SECRET, "proadsai-salt", 32)`
//
// WHY NOT IMPORT FROM index.ts: `decryptToken` there is a local function
// (not exported). Re-implementing here keeps metaSync isolated from the
// index.ts module surface and avoids accidentally calling into the AI code
// path on cold start.
// ═══════════════════════════════════════════════════════════

import * as crypto from "crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const SALT = "proadsai-salt";

/**
 * Decrypt the legacy AES-256-GCM ciphertext. `secret` is the META_APP_SECRET.
 * Throws on shape mismatch / auth-tag failure (treated as token corruption).
 */
export function decryptLegacyToken(encryptedData: string, secret?: string): Promise<string> {
    if (typeof encryptedData !== "string" || encryptedData.length === 0) {
        return Promise.reject(new Error("decryptLegacyToken: encryptedData is empty"));
    }
    const effectiveSecret = secret ?? process.env.META_APP_SECRET;
    if (!effectiveSecret) {
        return Promise.reject(new Error("decryptLegacyToken: META_APP_SECRET not configured"));
    }
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
        return Promise.reject(new Error("decryptLegacyToken: malformed ciphertext (expected iv:tag:body)"));
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = crypto.scryptSync(effectiveSecret, SALT, 32);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    try {
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return Promise.resolve(decrypted);
    } catch (e: unknown) {
        return Promise.reject(new Error(`decryptLegacyToken: decrypt failed (${(e as Error).message})`));
    }
}
