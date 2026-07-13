// functions/src/__tests__/perceptualHash.test.ts — Phase 14 Layer 3 dHash
// ═══════════════════════════════════════════════════════════
// Pure dHash unit tests + integration tests via sharp. Two flavors:
//   - Pure: synthetic pixel arrays → exact hash strings (deterministic).
//   - Image: generate PNG buffers via sharp → round-trip through JPEG.

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
    computeHash,
    computeHashFromPixels,
    hammingDistance,
    isMatch,
    isAmbiguousMatch,
    decideMatch,
    MATCH_THRESHOLD,
    AMBIGUITY_MARGIN,
    DHASH_HEX_LENGTH,
    type MatchCandidate,
} from "../perceptualHash.js";

// ─── Pure helpers (no sharp) ──────────────────────────────────

test("computeHashFromPixels — all-white → all bits 0", () => {
    const pixels = new Array(72).fill(255);
    const hash = computeHashFromPixels(pixels);
    assert.equal(hash.length, DHASH_HEX_LENGTH);
    assert.equal(hash, "0".repeat(DHASH_HEX_LENGTH));
});

test("computeHashFromPixels — all-black → all bits 0 (equal adjacent pixels)", () => {
    // When every pixel is equal, `left > right` is false everywhere, so
    // every bit is 0. (Bit-set semantics: `left > right` triggers the bit.)
    // Mirror the all-white test for symmetry.
    const pixels = new Array(72).fill(0);
    const hash = computeHashFromPixels(pixels);
    assert.equal(hash, "0".repeat(DHASH_HEX_LENGTH));
});

test("computeHashFromPixels — strictly decreasing row → all bits 1", () => {
    // For every adjacent pair (left, right) we want `left > right` so the bit
    // is set. A strictly decreasing row (8,7,...,0) produces 8 set bits per row.
    const pixels = new Array(72).fill(0).map((_, i) => 8 - (i % 9));
    const hash = computeHashFromPixels(pixels);
    assert.equal(hash, "f".repeat(DHASH_HEX_LENGTH));
});

test("computeHashFromPixels — rejects wrong pixel count", () => {
    assert.throws(() => computeHashFromPixels(new Array(71).fill(0)), /expected 72 grayscale values/);
    assert.throws(() => computeHashFromPixels(new Array(73).fill(0)), /expected 72 grayscale values/);
});

// ─── Hamming distance ─────────────────────────────────────────

test("hammingDistance — identical → 0", () => {
    const h = "0123456789abcdef";
    assert.equal(hammingDistance(h, h), 0);
});

test("hammingDistance — known vectors", () => {
    // Flip 1 bit in the low nibble of byte 0 → distance 1.
    const a = "0".repeat(DHASH_HEX_LENGTH);
    const b = "1" + "0".repeat(DHASH_HEX_LENGTH - 1);
    assert.equal(hammingDistance(a, b), 1);
    // Flip all 64 bits (flip every nibble to 'f').
    assert.equal(hammingDistance(a, "f".repeat(DHASH_HEX_LENGTH)), 64);
});

test("hammingDistance — length mismatch throws", () => {
    assert.throws(() => hammingDistance("00", "0000"), /length mismatch/);
});

test("hammingDistance — wrong hex length throws", () => {
    assert.throws(() => hammingDistance("abc", "def"), /expected 16-char hex/);
});

// ─── isMatch / isAmbiguousMatch ───────────────────────────────

test("isMatch — within threshold", () => {
    const a = "0".repeat(DHASH_HEX_LENGTH);
    // Flip the first MATCH_THRESHOLD bits to build a hash exactly MATCH_THRESHOLD
    // Hamming-distance away from `a`. Bit i lives at nibble floor(i/4), bit (i%4).
    const bArr = "0".repeat(DHASH_HEX_LENGTH).split("");
    for (let i = 0; i < MATCH_THRESHOLD; i++) {
        const nibbleIdx = Math.floor(i / 4);
        const bitInNibble = i % 4;
        const v = parseInt(bArr[nibbleIdx], 16);
        bArr[nibbleIdx] = (v | (1 << bitInNibble)).toString(16);
    }
    const b = bArr.join("");
    assert.equal(hammingDistance(a, b), MATCH_THRESHOLD);
    assert.equal(isMatch(a, b), true);
});

test("isMatch — over threshold → false", () => {
    const a = "0".repeat(DHASH_HEX_LENGTH);
    const b = "f".repeat(DHASH_HEX_LENGTH);
    assert.equal(hammingDistance(a, b), 64);
    assert.equal(isMatch(a, b), false);
});

test("isMatch — custom threshold honored", () => {
    const a = "0".repeat(DHASH_HEX_LENGTH);
    const b = "f".repeat(DHASH_HEX_LENGTH);
    assert.equal(isMatch(a, b, 64), true);
    assert.equal(isMatch(a, b, 63), false);
});

test("isAmbiguousMatch — gap within margin → ambiguous", () => {
    assert.equal(isAmbiguousMatch(5, 6), true);   // gap 1
    assert.equal(isAmbiguousMatch(5, 7), true);   // gap 2
});

test("isAmbiguousMatch — exact tie (gap 0) → NOT ambiguous (recency fallback applies)", () => {
    // Spec §4.2: "Exact-tie fallback: prefer the most recent generation."
    // An exact tie is deterministic, so we treat it as auto-match (tied
    // candidate wins by recency) rather than ambiguous.
    assert.equal(isAmbiguousMatch(5, 5), false);
    assert.equal(isAmbiguousMatch(0, 0), false);
});

test("isAmbiguousMatch — gap > margin → not ambiguous", () => {
    assert.equal(isAmbiguousMatch(5, 8), false);  // gap 3
    assert.equal(isAmbiguousMatch(5, 100), false);
});

test("isAmbiguousMatch — custom margin", () => {
    assert.equal(isAmbiguousMatch(5, 10), false);
    assert.equal(isAmbiguousMatch(5, 10, 5), true);
});

test("isAmbiguousMatch — invalid inputs", () => {
    assert.equal(isAmbiguousMatch(NaN, 5), false);
    assert.equal(isAmbiguousMatch(5, "x" as unknown as number), false);
});

// ─── decideMatch (spec §4.2) ───────────────────────────────────

test("decideMatch — no candidates → no_match", () => {
    const d = decideMatch([]);
    assert.equal(d.reason, "no_match");
    assert.equal(d.candidate, null);
});

test("decideMatch — one candidate below threshold → auto_match", () => {
    const c: MatchCandidate = { hash: "a", distance: 3, createdAt: 100, generationId: "g1" };
    const d = decideMatch([c]);
    assert.equal(d.reason, "auto_match");
    assert.equal(d.candidate?.generationId, "g1");
});

test("decideMatch — top candidate above threshold → no_match", () => {
    const c: MatchCandidate = { hash: "a", distance: 20, createdAt: 100, generationId: "g1" };
    const d = decideMatch([c]);
    assert.equal(d.reason, "no_match");
});

test("decideMatch — two close candidates (gap 1) → ambiguous (no auto-match)", () => {
    // gap=1 (within AMBIGUITY_MARGIN=2) → ambiguous, leave unmatched.
    const c1: MatchCandidate = { hash: "a", distance: 5, createdAt: 200, generationId: "g1" };
    const c2: MatchCandidate = { hash: "b", distance: 6, createdAt: 100, generationId: "g2" };
    const d = decideMatch([c1, c2]);
    assert.equal(d.reason, "ambiguous");
    assert.equal(d.candidate, null);
    assert.equal(d.belowThreshold.length, 2);
});

test("decideMatch — two distant candidates → auto_match on top", () => {
    const c1: MatchCandidate = { hash: "a", distance: 3, createdAt: 200, generationId: "g1" };
    const c2: MatchCandidate = { hash: "b", distance: 8, createdAt: 100, generationId: "g2" };
    const d = decideMatch([c1, c2]);
    assert.equal(d.reason, "auto_match");
    assert.equal(d.candidate?.generationId, "g1");
});

test("decideMatch — exact tie resolved by most recent (gap > margin so unambiguous)", () => {
    // Spec §4.2 exact-tie fallback: prefer the most recent generation.
    // We give both candidates the same distance (3) so the tie resolves by
    // createdAt, but the second-best must still be >MARGIN below the top
    // to remain unambiguous. With a single candidate, that's guaranteed.
    const older: MatchCandidate = { hash: "a", distance: 3, createdAt: 100, generationId: "older" };
    const newer: MatchCandidate = { hash: "b", distance: 3, createdAt: 200, generationId: "newer" };
    const d = decideMatch([older, newer]);
    assert.equal(d.reason, "auto_match");
    assert.equal(d.candidate?.generationId, "newer");
});

test("decideMatch — sorts below-threshold ascending", () => {
    const c1: MatchCandidate = { hash: "a", distance: 9, createdAt: 100, generationId: "far" };
    const c2: MatchCandidate = { hash: "b", distance: 2, createdAt: 100, generationId: "close" };
    const d = decideMatch([c1, c2]);
    assert.equal(d.belowThreshold[0].generationId, "close");
    assert.equal(d.belowThreshold[1].generationId, "far");
});

test("decideMatch — candidates above threshold filtered out", () => {
    const above: MatchCandidate = { hash: "a", distance: 100, createdAt: 100, generationId: "skip" };
    const below: MatchCandidate = { hash: "b", distance: 3, createdAt: 100, generationId: "win" };
    const d = decideMatch([above, below]);
    assert.equal(d.reason, "auto_match");
    assert.equal(d.candidate?.generationId, "win");
    assert.equal(d.belowThreshold.length, 1);
});

// ─── Image-level tests (via sharp) ────────────────────────────

async function makeGradientPng(width: number, height: number): Promise<Buffer> {
    return await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
        },
    })
        // Draw a black diagonal so the image isn't a flat color (dHash would
        // collapse to a constant on flat images).
        .composite([{
            input: await sharp({
                create: {
                    width: Math.floor(width / 2),
                    height: Math.floor(height / 2),
                    channels: 3,
                    background: { r: 0, g: 0, b: 0 },
                },
            }).png().toBuffer(),
            left: 0,
            top: 0,
        }])
        .png()
        .toBuffer();
}

test("computeHash — same image → same hash", async () => {
    const img = await makeGradientPng(512, 512);
    const h1 = await computeHash(img);
    const h2 = await computeHash(img);
    assert.equal(h1, h2);
    assert.equal(h1.length, DHASH_HEX_LENGTH);
});

test("computeHash — JPEG re-upload (quality 85) survives the threshold", async () => {
    const img = await makeGradientPng(512, 512);
    const jpeg = await sharp(img).jpeg({ quality: 85 }).toBuffer();
    const h1 = await computeHash(img);
    const h2 = await computeHash(jpeg);
    const dist = hammingDistance(h1, h2);
    assert.ok(dist <= MATCH_THRESHOLD, `expected distance <= ${MATCH_THRESHOLD}, got ${dist}`);
    assert.equal(isMatch(h1, h2), true);
});

test("computeHash — completely different image → no match", async () => {
    // White vs black: both are uniform → both produce all-zero hash
    // (adjacent-equal pixels set no bits). They DO match by hash, but
    // semantically they're different images — so we exercise the algorithm
    // with a more representative pair: a gradient image vs a checkerboard.
    const gradient = await makeGradientPng(512, 512);
    const checker = await sharp({
        create: {
            width: 512,
            height: 512,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
        },
    })
        .composite([{
            input: await sharp({
                create: {
                    width: 256,
                    height: 256,
                    channels: 3,
                    background: { r: 255, g: 255, b: 255 },
                },
            }).png().toBuffer(),
            left: 0,
            top: 0,
        }, {
            input: await sharp({
                create: {
                    width: 256,
                    height: 256,
                    channels: 3,
                    background: { r: 255, g: 255, b: 255 },
                },
            }).png().toBuffer(),
            left: 256,
            top: 256,
        }])
        .png()
        .toBuffer();
    const h1 = await computeHash(gradient);
    const h2 = await computeHash(checker);
    assert.notEqual(h1, h2);
    // The distance must be > MATCH_THRESHOLD for genuinely different images.
    const dist = hammingDistance(h1, h2);
    assert.ok(dist > MATCH_THRESHOLD, `expected distance > ${MATCH_THRESHOLD}, got ${dist}`);
    assert.equal(isMatch(h1, h2), false);
});

test("computeHash — rejects empty / non-buffer input", async () => {
    await assert.rejects(() => computeHash(Buffer.alloc(0)), /non-empty Buffer/);
    await assert.rejects(() => computeHash("not-a-buffer" as unknown as Buffer), /non-empty Buffer/);
});
