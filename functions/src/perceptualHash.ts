// functions/src/perceptualHash.ts — Phase 14 Layer 3 perceptual image hashing
// ═══════════════════════════════════════════════════════════
// 64-bit dHash (difference hash) implementation using sharp (research §A).
//
// ALGORITHM:
//   1. Decode the input (any format sharp supports).
//   2. Resize to 9x8 grayscale (the 9th column is dropped after comparison).
//   3. For each row, compare each pixel with its right neighbor; set the bit
//      if left > right.
//   4. Hash is 64 bits → 16 hex chars.
//
// MATCH RULES (spec §4.2):
//   - distance <= MATCH_THRESHOLD → auto-match
//   - if MULTIPLE candidates are below threshold, pick the CLOSEST distance
//   - if the top two candidates are within AMBIGUITY_MARGIN, leave UNMATCHED
//     for manual linking (genuinely ambiguous → avoid mis-attribution)
//   - exact-tie fallback: prefer the most recent generation
//
// PHash (DCT) is the documented upgrade path — same sharp decode, swap the
// hash step, store `hashAlgo: 'phash64'` so both can coexist during
// migration. Not implemented in v1.
// ═══════════════════════════════════════════════════

import sharp from "sharp";

// ─── Constants ─────────────────────────────────────────────────

export const DHASH_BITS = 64;
export const DHASH_HEX_LENGTH = 16; // 64 / 4
export const MATCH_THRESHOLD = 10;
export const AMBIGUITY_MARGIN = 2;

export type HashAlgo = "dhash64" | "phash64";

// ─── Hash algorithm ────────────────────────────────────────────

/**
 * Compute the 64-bit dHash of an image buffer. Output is 16 hex chars
 * (lowercase, zero-padded).
 *
 * Throws if sharp cannot decode the buffer.
 */
export async function computeHash(imageBuffer: Buffer): Promise<string> {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        throw new Error("perceptualHash.computeHash: imageBuffer must be a non-empty Buffer");
    }
    // Resize to 9x8 grayscale — sharp converts to grayscale by default.
    const { data, info } = await sharp(imageBuffer)
        .grayscale()
        .resize(9, 8, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true });
    void info; // 9x8=72 pixels — info.width/info.height asserted by assertShape below

    assertShape(info.width, info.height);

    // Each row has 9 pixels; compare 8 pairs (left > right). Total 8*8=64 bits.
    let hash = 0n; // BigInt to avoid 32-bit overflow
    let bit = 0n;
    for (let y = 0; y < 8; y++) {
        const rowBase = y * 9;
        for (let x = 0; x < 8; x++) {
            const left = data[rowBase + x];
            const right = data[rowBase + x + 1];
            if (left > right) {
                hash |= 1n << bit;
            }
            bit++;
        }
    }
    return hash.toString(16).padStart(DHASH_HEX_LENGTH, "0");
}

/**
 * Compute the hash synchronously — useful for tests that pass already-prepared
 * pixel arrays. `pixels` is a flat array of 9*8=72 grayscale values (0-255).
 */
export function computeHashFromPixels(pixels: ReadonlyArray<number>): string {
    if (pixels.length !== 72) {
        throw new Error(`perceptualHash.computeHashFromPixels: expected 72 grayscale values, got ${pixels.length}`);
    }
    let hash = 0n;
    let bit = 0n;
    for (let y = 0; y < 8; y++) {
        const rowBase = y * 9;
        for (let x = 0; x < 8; x++) {
            const left = pixels[rowBase + x];
            const right = pixels[rowBase + x + 1];
            if (left > right) {
                hash |= 1n << bit;
            }
            bit++;
        }
    }
    return hash.toString(16).padStart(DHASH_HEX_LENGTH, "0");
}

function assertShape(width: number, height: number): void {
    if (width !== 9 || height !== 8) {
        throw new Error(`perceptualHash: sharp returned ${width}x${height} (expected 9x8)`);
    }
}

// ─── Distance / matching ───────────────────────────────────────

/**
 * Hamming distance between two hex hashes. Same-length only — caller must
 * ensure both sides use `dhash64` (otherwise the comparison is meaningless).
 */
export function hammingDistance(hash1: string, hash2: string): number {
    if (typeof hash1 !== "string" || typeof hash2 !== "string") {
        throw new Error("perceptualHash.hammingDistance: both hashes must be strings");
    }
    if (hash1.length !== hash2.length) {
        throw new Error(`perceptualHash.hammingDistance: length mismatch ${hash1.length} vs ${hash2.length}`);
    }
    if (hash1.length !== DHASH_HEX_LENGTH) {
        throw new Error(`perceptualHash.hammingDistance: expected ${DHASH_HEX_LENGTH}-char hex, got ${hash1.length}`);
    }
    // Pad to 16 chars / 64 bits.
    const a = BigInt("0x" + hash1);
    const b = BigInt("0x" + hash2);
    let xor = a ^ b;
    let count = 0;
    while (xor > 0n) {
        if ((xor & 1n) === 1n) count++;
        xor >>= 1n;
    }
    return count;
}

/**
 * Whether two hashes are considered the same image (survives JPEG re-upload
 * quality loss). Threshold is the implementation-time default; callers may
 * override for tighter / looser matching.
 */
export function isMatch(hash1: string, hash2: string, threshold: number = MATCH_THRESHOLD): boolean {
    return hammingDistance(hash1, hash2) <= threshold;
}

/**
 * Ambiguity check — returns true when the top two candidates are close enough
 * that auto-matching would risk mis-attribution (spec §4.2).
 *
 * Caller passes the distance to the top candidate and the distance to the
 * second-closest candidate. Returns true when the gap is a positive small
 * number. An EXACT tie (gap = 0) is intentionally NOT flagged ambiguous —
 * the spec's "exact-tie fallback: prefer the most recent generation" rule
 * applies: deterministic tie-break by recency is safer than abandoning the
 * match.
 */
export function isAmbiguousMatch(
    topDistance: number,
    secondDistance: number,
    margin: number = AMBIGUITY_MARGIN,
): boolean {
    if (typeof topDistance !== "number" || typeof secondDistance !== "number") return false;
    if (!Number.isFinite(topDistance) || !Number.isFinite(secondDistance)) return false;
    const gap = secondDistance - topDistance;
    // gap > 0 (not an exact tie) AND gap <= margin.
    return gap > 0 && gap <= margin;
}

// ─── Candidate resolution ──────────────────────────────────────

export interface MatchCandidate {
    hash: string;
    /** Distance from the query hash — pre-computed by the caller. */
    distance: number;
    /** Created-at ms — used for the exact-tie fallback (most-recent wins). */
    createdAt: number;
    /** Generation id — passed through on match. */
    generationId: string;
}

export interface MatchDecision {
    /** The winning candidate, or null if ambiguous / no match. */
    candidate: MatchCandidate | null;
    /** "auto_match" | "ambiguous" | "no_match" — drives the worker write. */
    reason: "auto_match" | "ambiguous" | "no_match";
    /** All candidates that were within threshold, sorted ascending by distance. */
    belowThreshold: MatchCandidate[];
}

/**
 * Apply the spec §4.2 match rules to a list of pre-computed candidates.
 *
 *   - Sort by distance ASC, then by createdAt DESC (most-recent fallback).
 *   - If the top candidate's distance > threshold → no_match.
 *   - If the gap between top and second <= ambiguity margin → ambiguous
 *     (leave unmatched — don't mis-attribute).
 *   - Otherwise → auto_match on the top candidate.
 */
export function decideMatch(
    candidates: ReadonlyArray<MatchCandidate>,
    threshold: number = MATCH_THRESHOLD,
    ambiguityMargin: number = AMBIGUITY_MARGIN,
): MatchDecision {
    const below = candidates
        .filter((c) => Number.isFinite(c.distance) && c.distance <= threshold)
        .slice()
        .sort((a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance;
            // Exact tie — most-recent wins.
            return b.createdAt - a.createdAt;
        });

    if (below.length === 0) {
        return { candidate: null, reason: "no_match", belowThreshold: [] };
    }
    const top = below[0];
    const second = below[1];
    if (second && isAmbiguousMatch(top.distance, second.distance, ambiguityMargin)) {
        return { candidate: null, reason: "ambiguous", belowThreshold: below };
    }
    return { candidate: top, reason: "auto_match", belowThreshold: below };
}

// ─── Utility: decode a stored hex string back to bits ─────────

export function hashToBits(hex: string): bigint {
    if (typeof hex !== "string" || hex.length !== DHASH_HEX_LENGTH) {
        throw new Error(`perceptualHash.hashToBits: expected ${DHASH_HEX_LENGTH}-char hex`);
    }
    return BigInt("0x" + hex);
}
