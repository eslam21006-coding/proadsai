// functions/src/tokenCrypto.ts — Phase 14 Layer 2 KMS envelope encryption for Meta tokens
// ═══════════════════════════════════════════════════════════
// Envelope-encrypts the long-lived Meta user token with Google Cloud KMS.
//
// ARCHITECTURE (research §C):
//   - The plaintext token NEVER leaves the Cloud Functions runtime.
//   - The encrypted token + a "wrapped" data encryption key (DEK) are persisted
//     to `users/{uid}/workspaces/{workspaceId}/private/metaConnection`.
//   - Decryption re-creates the plaintext on demand inside the worker.
//
// KMS KEY RESOURCE (T001 in INFRASTRUCTURE_SETUP.md):
//   projects/proadsai-saas/locations/europe-west1/keyRings/proads-meta-tokens/cryptoKeys/meta-token-envelope
//
// In dev / CI we DON'T call real KMS — the helpers expose `setKmsClientForTests`
// so unit tests can inject a fake. The production path lazily resolves
// `@google-cloud/kms` only on first encrypt/decrypt (so it never loads when
// this module is imported in a serverless cold start that doesn't need it).
//
// The serialized envelope format is JSON:
//   { v: 1, ciphertext: string (base64), wrappedKey?: string, keyResource: string }
//
// v=1 keeps us forward-compatible — a future v=2 envelope could carry
// additional metadata (e.g. wrapping-algorithm version) without breaking
// the persistence layer.
// ═══════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────

export interface EncryptedEnvelope {
    /** Schema version — 1 today. Future versions can carry additional metadata. */
    v: 1;
    /** Base64-encoded ciphertext. */
    ciphertext: string;
    /** Optional wrapped DEK. Reserved for future use; undefined today. */
    wrappedKey?: string;
    /** KMS key resource ID used (recorded so future decryption can verify). */
    keyResource: string;
}

export interface KmsClient {
    encrypt(plaintext: Buffer, keyResource: string): Promise<Buffer>;
    decrypt(ciphertext: Buffer, keyResource: string): Promise<Buffer>;
}

// ─── Constants ────────────────────────────────────────────────

/** Production KMS key resource — record in INFRASTRUCTURE_SETUP.md §T001. */
export const DEFAULT_KMS_KEY_RESOURCE =
    "projects/proadsai-saas/locations/europe-west1/keyRings/proads-meta-tokens/cryptoKeys/meta-token-envelope";

/** Schema version of the persisted envelope. */
export const ENVELOPE_VERSION: 1 = 1;

// ─── Test seam ─────────────────────────────────────────────────

let _kmsClientOverride: KmsClient | null = null;
let _kmsKeyResourceOverride: string | null = null;

/**
 * Inject a fake KMS client (and optional key resource) for unit tests.
 * Reset with `resetTokenCryptoForTests()`.
 */
export function setKmsClientForTests(client: KmsClient | null, keyResource?: string | null): void {
    _kmsClientOverride = client;
    _kmsKeyResourceOverride = keyResource ?? null;
}

export function resetTokenCryptoForTests(): void {
    _kmsClientOverride = null;
    _kmsKeyResourceOverride = null;
}

// ─── KMS client factory (lazy) ─────────────────────────────────

let _realClientPromise: Promise<KmsClient> | null = null;

/**
 * Lazily resolve the real @google-cloud/kms client. NEVER called at module
 * load — only inside encrypt/decrypt. Production invocations need
 * `@google-cloud/kms` available at runtime; if it isn't installed the call
 * throws a clear error instead of a cryptic `undefined` somewhere deep.
 */
async function getRealKmsClient(): Promise<KmsClient> {
    if (_realClientPromise) return _realClientPromise;
    _realClientPromise = (async () => {
        let kms: typeof import("@google-cloud/kms");
        try {
            // Dynamic import keeps the module out of cold starts that never
            // touch KMS — and gives a clean error if the dep is missing.
            kms = await import("@google-cloud/kms");
        } catch (e) {
            throw new Error(
                "tokenCrypto: @google-cloud/kms is not installed. " +
                "Add it to functions/package.json or inject a fake via setKmsClientForTests().",
            );
        }
        const client = new kms.KeyManagementServiceClient();
        return {
            async encrypt(plaintext: Buffer, keyResource: string): Promise<Buffer> {
                const [resp] = await client.encrypt({ name: keyResource, plaintext });
                if (!resp || !resp.ciphertext) {
                    throw new Error("tokenCrypto: KMS encrypt returned empty ciphertext");
                }
                return Buffer.from(resp.ciphertext as Uint8Array);
            },
            async decrypt(ciphertext: Buffer, keyResource: string): Promise<Buffer> {
                const [resp] = await client.decrypt({ name: keyResource, ciphertext });
                if (!resp || !resp.plaintext) {
                    throw new Error("tokenCrypto: KMS decrypt returned empty plaintext");
                }
                return Buffer.from(resp.plaintext as Uint8Array);
            },
        };
    })();
    return _realClientPromise;
}

function resolveClient(): Promise<KmsClient> {
    if (_kmsClientOverride) return Promise.resolve(_kmsClientOverride);
    return getRealKmsClient();
}

function resolveKeyResource(): string {
    if (_kmsKeyResourceOverride) return _kmsKeyResourceOverride;
    return DEFAULT_KMS_KEY_RESOURCE;
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Encrypt a plaintext token string. Returns a JSON-serializable envelope
 * ready for Firestore storage.
 */
export async function encrypt(plaintext: string): Promise<EncryptedEnvelope> {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
        throw new Error("tokenCrypto.encrypt: plaintext must be a non-empty string");
    }
    const client = await resolveClient();
    const keyResource = resolveKeyResource();
    const buf = await client.encrypt(Buffer.from(plaintext, "utf8"), keyResource);
    return {
        v: ENVELOPE_VERSION,
        ciphertext: buf.toString("base64"),
        keyResource,
    };
}

/**
 * Decrypt an envelope back to a plaintext string.
 */
export async function decrypt(envelope: EncryptedEnvelope | string): Promise<string> {
    const parsed = parseEnvelope(envelope);
    const client = await resolveClient();
    const buf = await client.decrypt(
        Buffer.from(parsed.ciphertext, "base64"),
        parsed.keyResource,
    );
    return buf.toString("utf8");
}

/**
 * Parse + validate an envelope. Accepts the JSON form OR an already-parsed
 * object. Throws on shape errors — encryption and persistence layers can
 * fail loudly instead of silently passing garbage to KMS.
 */
export function parseEnvelope(input: EncryptedEnvelope | string): EncryptedEnvelope {
    let raw: unknown;
    if (typeof input === "string") {
        try {
            raw = JSON.parse(input);
        } catch (e) {
            throw new Error(`tokenCrypto.parseEnvelope: invalid JSON envelope (${(e as Error).message})`);
        }
    } else {
        raw = input;
    }
    if (!raw || typeof raw !== "object") {
        throw new Error("tokenCrypto.parseEnvelope: envelope must be an object");
    }
    const r = raw as Record<string, unknown>;
    if (r.v !== ENVELOPE_VERSION) {
        throw new Error(
            `tokenCrypto.parseEnvelope: unsupported envelope version ${String(r.v)} (expected ${ENVELOPE_VERSION})`,
        );
    }
    if (typeof r.ciphertext !== "string" || r.ciphertext.length === 0) {
        throw new Error("tokenCrypto.parseEnvelope: ciphertext must be a non-empty string");
    }
    if (typeof r.keyResource !== "string" || r.keyResource.length === 0) {
        throw new Error("tokenCrypto.parseEnvelope: keyResource must be a non-empty string");
    }
    const env: EncryptedEnvelope = {
        v: ENVELOPE_VERSION,
        ciphertext: r.ciphertext,
        keyResource: r.keyResource,
    };
    if (typeof r.wrappedKey === "string") env.wrappedKey = r.wrappedKey;
    return env;
}
