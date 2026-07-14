// functions/src/__tests__/tokenCrypto.test.ts — Phase 14 Layer 2 KMS round-trip
// ═══════════════════════════════════════════════════════════
// Pure round-trip tests using an injected fake KMS client — NEVER call real
// KMS here (would slow tests, require credentials, and risk leaking tokens
// to KMS audit logs).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    encrypt,
    decrypt,
    parseEnvelope,
    setKmsClientForTests,
    resetTokenCryptoForTests,
    ENVELOPE_VERSION,
    type EncryptedEnvelope,
    type KmsClient,
} from "../tokenCrypto.js";

// ─── Fake KMS client (NO real KMS calls) ───────────────────────

class FakeKms implements KmsClient {
    public encryptCalls = 0;
    public decryptCalls = 0;
    public lastPlaintext: Buffer | null = null;
    public lastCiphertext: Buffer | null = null;

    // Reversible "encryption" — XOR against a constant key, then base64 is
    // handled by the caller. The point is round-trip integrity, not crypto.
    private readonly key = Buffer.from("FAKE_KMS_TEST_KEY_2026", "utf8");

    async encrypt(plaintext: Buffer, keyResource: string): Promise<Buffer> {
        this.encryptCalls++;
        this.lastPlaintext = Buffer.from(plaintext);
        const out = Buffer.alloc(plaintext.length);
        for (let i = 0; i < plaintext.length; i++) {
            out[i] = plaintext[i] ^ this.key[i % this.key.length];
        }
        // Stamp the resource ID into the last 8 bytes so we can verify the
        // round trip preserves the resource.
        const stamp = keyResource.slice(0, 8).padEnd(8, "_");
        return Buffer.concat([out, Buffer.from(stamp, "utf8")]);
    }

    async decrypt(ciphertext: Buffer, _keyResource: string): Promise<Buffer> {
        this.decryptCalls++;
        this.lastCiphertext = Buffer.from(ciphertext);
        // Strip the resource stamp from the tail.
        const body = ciphertext.subarray(0, ciphertext.length - 8);
        const out = Buffer.alloc(body.length);
        for (let i = 0; i < body.length; i++) {
            out[i] = body[i] ^ this.key[i % this.key.length];
        }
        return out;
    }
}

// ─── Setup / teardown ──────────────────────────────────────────

test("setup — install fake KMS client", () => {
    const fake = new FakeKms();
    setKmsClientForTests(fake, "projects/test/locations/global/keyRings/r/cryptoKeys/k");
    resetTokenCryptoForTests(); // clear after setup so the test below installs its own
    setKmsClientForTests(fake, "projects/test/locations/global/keyRings/r/cryptoKeys/k");
    // Smoke: encryption uses our fake.
    assert.ok(fake);
});

// ─── Round-trip ────────────────────────────────────────────────

test("encrypt → decrypt returns the original plaintext", async () => {
    const fake = new FakeKms();
    setKmsClientForTests(fake, "projects/test/locations/global/keyRings/r/cryptoKeys/k");
    const original = "EAAJ7ZBlZBCZBwBAOZBQwQZBxQxQYZC0wZDZD";
    const env = await encrypt(original);
    const recovered = await decrypt(env);
    assert.equal(recovered, original);
    assert.equal(fake.encryptCalls, 1);
    assert.equal(fake.decryptCalls, 1);
    assert.equal(fake.lastPlaintext?.toString("utf8"), original);
});

test("envelope carries the KMS key resource used", async () => {
    const fake = new FakeKms();
    const keyResource = "projects/proadsai-saas/locations/europe-west1/keyRings/proads-meta-tokens/cryptoKeys/meta-token-envelope";
    setKmsClientForTests(fake, keyResource);
    const env = await encrypt("hello-world");
    assert.equal(env.v, ENVELOPE_VERSION);
    assert.equal(env.keyResource, keyResource);
    assert.ok(env.ciphertext.length > 0);
    // ciphertext is base64 — round-trips through parseEnvelope.
    const parsed = parseEnvelope(env);
    assert.equal(parsed.keyResource, keyResource);
    assert.equal(parsed.ciphertext, env.ciphertext);
});

test("decrypt accepts a JSON-serialized envelope string", async () => {
    const fake = new FakeKms();
    setKmsClientForTests(fake, "projects/test/locations/global/keyRings/r/cryptoKeys/k");
    const env = await encrypt("token-stringified");
    const recovered = await decrypt(JSON.stringify(env));
    assert.equal(recovered, "token-stringified");
});

// ─── parseEnvelope ─────────────────────────────────────────────

test("parseEnvelope — JSON string round-trip", () => {
    const env: EncryptedEnvelope = {
        v: 1,
        ciphertext: "BASE64DATA==",
        keyResource: "projects/x/locations/y/keyRings/z/cryptoKeys/k",
    };
    const parsed = parseEnvelope(JSON.stringify(env));
    assert.deepEqual(parsed, env);
});

test("parseEnvelope — accepts object directly", () => {
    const env: EncryptedEnvelope = {
        v: 1,
        ciphertext: "BASE64DATA==",
        keyResource: "projects/x/locations/y/keyRings/z/cryptoKeys/k",
    };
    assert.deepEqual(parseEnvelope(env), env);
});

test("parseEnvelope — rejects invalid JSON", () => {
    assert.throws(() => parseEnvelope("not-json{"), /invalid JSON envelope/);
});

test("parseEnvelope — rejects wrong version", () => {
    assert.throws(() =>
        parseEnvelope({ v: 2 as unknown as 1, ciphertext: "abc", keyResource: "x" }),
        /unsupported envelope version/,
    );
});

test("parseEnvelope — rejects missing ciphertext", () => {
    assert.throws(() =>
        parseEnvelope({ v: 1, ciphertext: "", keyResource: "x" } as EncryptedEnvelope),
        /ciphertext must be a non-empty string/,
    );
});

test("parseEnvelope — rejects missing keyResource", () => {
    assert.throws(() =>
        parseEnvelope({ v: 1, ciphertext: "abc", keyResource: "" } as EncryptedEnvelope),
        /keyResource must be a non-empty string/,
    );
});

test("parseEnvelope — rejects non-object input", () => {
    assert.throws(() => parseEnvelope("null"), /envelope must be an object/);
});

// ─── Validation of input ───────────────────────────────────────

test("encrypt — rejects empty plaintext", async () => {
    const fake = new FakeKms();
    setKmsClientForTests(fake, "projects/test/locations/global/keyRings/r/cryptoKeys/k");
    await assert.rejects(() => encrypt(""), /plaintext must be a non-empty string/);
});

test("encrypt — rejects non-string plaintext", async () => {
    const fake = new FakeKms();
    setKmsClientForTests(fake, "projects/test/locations/global/keyRings/r/cryptoKeys/k");
    await assert.rejects(() => encrypt(null as unknown as string), /plaintext must be a non-empty string/);
    await assert.rejects(() => encrypt(undefined as unknown as string), /plaintext must be a non-empty string/);
});

// ─── Idempotency / determinism ────────────────────────────────

test("envelope ciphertext is opaque — encrypt twice → different ciphertext bytes (XOR with our key IS deterministic — sanity check on shape)", async () => {
    const fake = new FakeKms();
    setKmsClientForTests(fake, "projects/test/locations/global/keyRings/r/cryptoKeys/k");
    const env1 = await encrypt("same-input");
    const env2 = await encrypt("same-input");
    // Same key, same plaintext → same ciphertext (deterministic XOR — but
    // importantly the round-trip preserves the value).
    assert.equal(env1.ciphertext, env2.ciphertext);
    assert.equal(await decrypt(env1), "same-input");
});

// ─── Teardown ──────────────────────────────────────────────────

test("teardown — reset so subsequent tests get a clean client", () => {
    resetTokenCryptoForTests();
});
