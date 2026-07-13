// functions/src/__tests__/fingerprintAccuracy.test.ts — Phase 14 SC-3 validation
// ═══════════════════════════════════════════════════════════
// Validates that the dHash-based fingerprint matching achieves ≥ 90% correct
// auto-matches on a synthetic corpus of generated-style images that simulate
// the re-upload compression the spec cares about (spec §4.2 / SC-3).
//
// Methodology:
//   1. Generate 24 unique "creative" PNGs (gradient + text overlay patterns).
//   2. For each, simulate Meta's re-upload pipeline:
//      a. Convert to JPEG @ quality 85 (most common).
//      b. Convert to JPEG @ quality 70 (more compression).
//      c. Convert PNG → JPEG → PNG (round-trip through Meta's CDN).
//   3. For each original, build a candidate list of (itself + all 23 others)
//      with their re-upload variants.
//   4. Run `decideMatch` and assert the original is the top candidate.
//   5. Failure rate must be ≤ 10% (SC-3 ≥ 90% auto-match).

import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
    computeHash,
    hammingDistance,
    decideMatch,
    MATCH_THRESHOLD,
    type MatchCandidate,
} from "../perceptualHash.js";

// ─── Corpus generation ────────────────────────────────────────

interface CreativeEntry {
    id: string;
    buffer: Buffer;
    hash: string;
}

async function generateCorpus(): Promise<CreativeEntry[]> {
    const entries: CreativeEntry[] = [];
    const palettes: Array<{ bg: { r: number; g: number; b: number; alpha?: number }; fg: { r: number; g: number; b: number; alpha?: number } }> = [
        { bg: { r: 240, g: 235, b: 220 }, fg: { r: 30, g: 30, b: 30 } },
        { bg: { r: 18, g: 28, b: 56 }, fg: { r: 245, g: 245, b: 240 } },
        { bg: { r: 230, g: 230, b: 240 }, fg: { r: 200, g: 30, b: 70 } },
        { bg: { r: 12, g: 80, b: 50 }, fg: { r: 250, g: 230, b: 200 } },
        { bg: { r: 50, g: 50, b: 60 }, fg: { r: 230, g: 200, b: 100 } },
        { bg: { r: 250, g: 240, b: 230 }, fg: { r: 100, g: 30, b: 30 } },
        { bg: { r: 25, g: 25, b: 25 }, fg: { r: 240, g: 200, b: 80 } },
        { bg: { r: 180, g: 200, b: 230 }, fg: { r: 20, g: 50, b: 100 } },
    ];
    for (let i = 0; i < 24; i++) {
        const palette = palettes[i % palettes.length];
        // Vary the composition: different overlay positions per index.
        const overlayLeft = ((i * 71) % 400);
        const overlayTop = ((i * 113) % 400);
        const overlayW = 80 + (i % 60);
        const overlayH = 80 + (i % 60);
        // Every other image exercises a 4-channel (RGBA) overlay so the
        // corpus covers both opaque and transparent creative inputs —
        // Meta may store PNGs with alpha after edits.
        const useAlpha = i % 2 === 0;
        const overlayChannels = useAlpha ? 4 : 3;
        const overlayAlpha = useAlpha ? 0.5 + ((i % 5) * 0.1) : 1;
        const bgChannels = useAlpha ? 4 : 3;
        const bgAlpha = useAlpha ? 0.9 : 1;
        const overlay = await sharp({
            create: {
                width: overlayW,
                height: overlayH,
                channels: overlayChannels,
                background: { ...palette.fg, alpha: overlayAlpha },
            },
        }).png().toBuffer();
        const buf = await sharp({
            create: {
                width: 512,
                height: 512,
                channels: bgChannels,
                background: { ...palette.bg, alpha: bgAlpha },
            },
        })
            .composite([{ input: overlay, left: overlayLeft, top: overlayTop }])
            .png()
            .toBuffer();
        entries.push({
            id: `creative-${i.toString().padStart(2, "0")}`,
            buffer: buf,
            hash: await computeHash(buf),
        });
    }
    return entries;
}

// ─── Re-upload simulation ─────────────────────────────────────

async function simulateReupload(buffer: Buffer, mode: "jpeg85" | "jpeg70" | "roundtrip"): Promise<Buffer> {
    if (mode === "jpeg85") {
        return await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
    }
    if (mode === "jpeg70") {
        return await sharp(buffer).jpeg({ quality: 70 }).toBuffer();
    }
    // roundtrip: PNG → JPEG → PNG (mirrors Meta CDN cycle)
    const jpeg = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
    return await sharp(jpeg).png().toBuffer();
}

// ─── Validation ───────────────────────────────────────────────

test("fingerprint accuracy — ≥90% correct auto-matches across the corpus (SC-3)", async () => {
    const corpus = await generateCorpus();
    assert.equal(corpus.length, 24);

    // Build the candidate pool: for each entry, pre-compute hashes for the 3
    // re-upload variants.
    type Variant = { variant: "jpeg85" | "jpeg70" | "roundtrip"; hash: string };
    const variantsById = new Map<string, Variant[]>();
    for (const entry of corpus) {
        const variants: Variant[] = [];
        for (const mode of ["jpeg85", "jpeg70", "roundtrip"] as const) {
            const buf = await simulateReupload(entry.buffer, mode);
            variants.push({ variant: mode, hash: await computeHash(buf) });
        }
        variantsById.set(entry.id, variants);
    }

    // Test loop: for each entry, treat one re-upload variant as the "Meta
    // ad" we need to match, then build a candidate list of the ORIGINAL
    // (correct match) plus 5 distractors (all re-upload variants of OTHER
    // entries). Run decideMatch and check whether the top candidate points
    // back at the right entry.
    let totalAttempts = 0;
    let correct = 0;
    const failed: Array<{ entryId: string; variant: string; topId: string | null; topDistance: number | null; reason: string }> = [];

    for (const entry of corpus) {
        const variants = variantsById.get(entry.id) || [];
        for (const variant of variants) {
            // Build candidate list: the entry's own re-upload variant is the
            // ground-truth "Meta ad". Candidates = all corpus entries'
            // variants — distractor pool simulates the real sync scenario
            // where we compare against the entire workspace's index.
            const candidates: MatchCandidate[] = [];
            for (const candidateEntry of corpus) {
                const candidateVariants = variantsById.get(candidateEntry.id) || [];
                // Use the candidate's original-hash distance (we don't have
                // multiple variants per candidate in this synthetic test —
                // we compare the original hash against the re-upload variant
                // of the query entry; the distractor's "best variant" is its
                // original hash).
                const dist = hammingDistance(variant.hash, candidateEntry.hash);
                candidates.push({
                    hash: candidateEntry.hash,
                    distance: dist,
                    createdAt: Date.parse("2026-01-01T00:00:00Z") + parseInt(candidateEntry.id.split("-")[1] || "0", 10),
                    generationId: candidateEntry.id,
                });
            }

            const decision = decideMatch(candidates, MATCH_THRESHOLD);
            totalAttempts++;
            const topId = decision.candidate?.generationId ?? null;
            if (decision.reason === "auto_match" && topId === entry.id) {
                correct++;
            } else {
                failed.push({
                    entryId: entry.id,
                    variant: variant.variant,
                    topId,
                    topDistance: decision.candidate?.distance ?? null,
                    reason: decision.reason,
                });
            }
        }
    }

    const accuracy = correct / totalAttempts;
    // SC-3: ≥90% correct auto-matches on the re-upload corpus.
    assert.ok(
        accuracy >= 0.9,
        `SC-3 FAIL: accuracy ${(accuracy * 100).toFixed(1)}% < 90% ` +
        `(${correct}/${totalAttempts} correct). Failed: ${JSON.stringify(failed.slice(0, 5))}`,
    );
});

test("fingerprint accuracy — jpeg85-only sub-test (most common Meta case)", async () => {
    const corpus = await generateCorpus();
    let correct = 0;
    let total = 0;
    for (const entry of corpus) {
        const jpeg = await simulateReupload(entry.buffer, "jpeg85");
        const queryHash = await computeHash(jpeg);
        const candidates: MatchCandidate[] = corpus.map((c) => ({
            hash: c.hash,
            distance: hammingDistance(queryHash, c.hash),
            createdAt: 0,
            generationId: c.id,
        }));
        const decision = decideMatch(candidates, MATCH_THRESHOLD);
        total++;
        if (decision.candidate?.generationId === entry.id) correct++;
    }
    // The jpeg85 case should comfortably exceed 90% — sanity check.
    assert.ok(correct / total >= 0.9, `jpeg85 accuracy ${correct}/${total}`);
});
