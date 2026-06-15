// functions/src/slidePlanEngine.ts — deterministic carousel slide plans

import type { SlideEntry, ValueStackAdjustment } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// ANGLE POOLS
// ═══════════════════════════════════════════════════════════════════════════

export const COLD_ANGLES = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const RETARGETING_ANGLES = ["P", "M", "R", "I", "C", "Q", "E"] as const;

// ═══════════════════════════════════════════════════════════════════════════
// BUILD SLIDE PLAN — deterministic carousel slide plans
// ═══════════════════════════════════════════════════════════════════════════
//
// Phase 23 (23.C): middle-slide angle assignment is rotated by `seed` so the
// same first-4 lockstep (A→B→C→D→E...) does not recur every project. The
// offset is derived deterministically from a per-project seed; with a fixed
// seed, the plan is fully deterministic (Principle VI).
//
// Invariants (B1–B6):
//   - slideCount must be 2..9 (throws otherwise)
//   - slide 1: hook role, has CTA, photo injection true
//   - last slide: close role, has CTA
//   - middle slides: no CTA, no photo injection, no two adjacent share an
//     angle (guaranteed by sequential distinct picks from the rotated pool)
//   - deterministic for (campaignType, slideCount, seed)

export function buildSlidePlan(
    campaignType: "cold" | "retargeting",
    slideCount: number,
    seed?: number,
): SlideEntry[] {
    if (slideCount < 2 || slideCount > 9) {
        throw new Error(`slideCount must be 2–9, but got ${slideCount}`);
    }

    const pool = campaignType === "cold" ? COLD_ANGLES : RETARGETING_ANGLES;
    const middleCount = slideCount - 2;

    // Derive offset deterministically from the seed (default 0 = no rotation)
    let offset = 0;
    if (seed !== undefined && seed !== null && Number.isFinite(seed)) {
        offset = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
    }

    const slides: SlideEntry[] = [];

    slides.push({
        slide: 1,
        role: "hook",
        hasCTA: true,
        narrativeAngle: "hook",
        photoInjection: true,
    });

    for (let i = 0; i < middleCount; i++) {
        slides.push({
            slide: i + 2,
            role: "middle",
            hasCTA: false,
            narrativeAngle: pool[(i + offset) % pool.length],
            photoInjection: false,
        });
    }

    slides.push({
        slide: slideCount,
        role: "close",
        hasCTA: true,
        narrativeAngle: "close",
        photoInjection: false
    });

    return slides;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALUE STACK AUTO-ADJUSTMENT
// ═══════════════════════════════════════════════════════════════════════════

export function resolveValueStackSlideCount(
    giftCount: number,
    userSelectedCount: number
): ValueStackAdjustment {
    const resolvedSlideCount = Math.min(giftCount + 2, 9);
    return {
        giftCount,
        originalSlideCount: userSelectedCount,
        resolvedSlideCount,
        capped: giftCount + 2 > 9,
    };
}
