// functions/src/brandPromptBlocks.ts — pure builders for carousel/batch
// brand-consistency instruction blocks. Extracted so generators.ts and the
// fixture suite can both call the exact same builder (FR-016 traceability).

import type { BrandColorPair } from "./types.js";

const _RULE = "════════════════════════════════════════════════════════════════════════════════";

export function buildCarouselBrandConsistencyBlock(brand: BrandColorPair): string {
    if (!brand.primary) return "";
    const sec = brand.secondary ? ` Secondary color ${brand.secondary} used as supporting accent.` : "";
    return `\n${_RULE}
BRAND COLOR CONSISTENCY (CRITICAL)
${_RULE}
CRITICAL: Maintain brand color consistency across all carousel slides. Primary brand color ${brand.primary} must appear in every slide (CTA button, accent, or heading highlight).${sec} This creates visual cohesion when swiping.
${_RULE}\n`;
}

export function buildBatchBrandConsistencyBlock(brand: BrandColorPair, batchN: number | string): string {
    if (!brand.primary) return "";
    const sec = brand.secondary ? ` and secondary ${brand.secondary}` : "";
    const n = batchN || "multiple";
    return `\n${_RULE}
BRAND COLOR CONSISTENCY (CRITICAL)
${_RULE}
This is part of a batch of ${n} ad variations. All variations MUST use the same brand color palette anchored by primary ${brand.primary}${sec}. Vary composition and messaging, NOT the color scheme.
${_RULE}\n`;
}
