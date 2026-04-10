// functions/src/slidePlanEngine.ts — deterministic carousel slide plans

import type { SlideEntry, ValueStackAdjustment } from "./types.js";

// ═══════════════════════════════════════════════════════════
// ANGLE POOLS
// ═══════════════════════════════════════════════════════════

export const COLD_ANGLES = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const RETARGETING_ANGLES = ["P", "M", "R", "I", "C", "Q", "E"] as const;

// ═════════════════════════════════════════════════════════════
// BUILD SLIDE PLAN — deterministic carousel slide plans
// ═══════════════════════════════════════════════════════════

export function buildSlidePlan(
    campaignType: "cold" | "retargeting",
    slideCount: number,
): SlideEntry[] {
    if (slideCount < 2 || slideCount > 9) {
        throw new Error(`slideCount must be 2–9, but got ${slideCount}`);
    }

    const pool = campaignType === "cold" ? COLD_ANGLES : RETARGETING_ANGLES;
    const middleCount = slideCount - 2;

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
            narrativeAngle: pool[i % pool.length],
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

// ═══════════════════════════════════════════════════════════
// VALUE STACK AUTO-ADJUSTMENT
// ═══════════════════════════════════════════════════════════

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
