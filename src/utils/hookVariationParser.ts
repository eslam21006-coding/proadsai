// src/utils/hookVariationParser.ts
// ═══════════════════════════════════════════════════════════════════════════
// PHASE 23 — In-card variation carousel parser
// Converts a single returned hook/angle block (one of HOOK_START_A..D or
// ANGLE_START_A..D) into a HookVariation for the per-card variation
// carousel. The full block is preserved verbatim in rawBlock so existing
// Approve / Edit / AI Edit / Batch handlers can operate on it unchanged.
// ═══════════════════════════════════════════════════════════════════════════

import type { HookVariation, ClaimFlagEntry } from "../types";

const CLAIM_FLAG_RE = /CLAIM_FLAG\s*[:：]?\s*([^\n]+?)\s*[-–—]\s*([^\n]+)/gi;
const CLAIM_FLAG_LINE_RE = /^\s*CLAIM_FLAG\s*[:：]?.*$/gim;

function extractBetween(text: string, startKey: string, endKey: string): string {
  if (!text) return "";
  const upper = text.toUpperCase();
  const skU = startKey.toUpperCase().replace(/:\s*$/, "");
  const ekU = endKey.toUpperCase().replace(/:\s*$/, "");

  const si = upper.indexOf(skU);
  if (si === -1) return "";
  let cs = si + skU.length;
  if (cs < text.length && (text[cs] === ":" || text[cs] === "\uFF1A")) cs++;
  while (cs < text.length && /\s/.test(text[cs])) cs++;

  const ei = upper.indexOf(ekU, cs);
  if (ei === -1) return text.slice(cs).trim();
  return text.slice(cs, ei).trim();
}

function extractClaimFlags(block: string): ClaimFlagEntry[] {
  const flags: ClaimFlagEntry[] = [];
  let m: RegExpExecArray | null;
  CLAIM_FLAG_RE.lastIndex = 0;
  while ((m = CLAIM_FLAG_RE.exec(block)) !== null) {
    const text = (m[1] || "").trim();
    const reason = (m[2] || "").trim();
    if (text && reason) {
      flags.push({ text, reason });
    }
  }
  return flags;
}

function splitCtaAndBenefit(ctaBlock: string): { cta: string; benefit: string } {
  if (!ctaBlock) return { cta: "", benefit: "" };
  // Phase 23 (CodeRabbit): handle a BENEFIT: marker in addition to the legacy
  // ||| separator. Two forms are supported:
  //   1. Inline label on the same line:  "BENEFIT: Save 50%"
  //   2. Standalone label, benefit on subsequent lines:
  //        "BENEFIT:"
  //        "Save 50%"
  // Capture group 1 is the inline content (may be empty for the standalone
  // form); the tail after the matched line is appended if non-empty.
  const benefitMarker = ctaBlock.match(/^\s*BENEFIT\s*[:：]\s*([^\n]*)/im);
  if (benefitMarker && typeof benefitMarker.index === "number") {
    const cta = ctaBlock.slice(0, benefitMarker.index).replace(/\*\*/g, "").trim();
    const inlineBenefit = (benefitMarker[1] || "").replace(/\*\*/g, "").trim();
    const tailBenefit = ctaBlock
      .slice(benefitMarker.index + benefitMarker[0].length)
      .replace(/\*\*/g, "")
      .replace(CLAIM_FLAG_LINE_RE, "")
      .trim();
    // Phase 23 (CodeRabbit): normalize the joined benefit so markdown
    // emphasis and CLAIM_FLAG warning lines never reach the carousel UI.
    const benefit = [inlineBenefit, tailBenefit]
      .filter(Boolean)
      .join("\n")
      .replace(CLAIM_FLAG_LINE_RE, "")
      .replace(/\*\*/g, "")
      .trim();
    return { cta, benefit };
  }
  const triplePipe = ctaBlock.indexOf("|||");
  if (triplePipe === -1) {
    return {
      cta: ctaBlock.replace(/\*\*/g, "").replace(CLAIM_FLAG_LINE_RE, "").trim(),
      benefit: "",
    };
  }
  const cta = ctaBlock
    .slice(0, triplePipe)
    .replace(/\*\*/g, "")
    .replace(CLAIM_FLAG_LINE_RE, "")
    .trim();
  const benefit = ctaBlock
    .slice(triplePipe + 3)
    .replace(/\*\*/g, "")
    .replace(CLAIM_FLAG_LINE_RE, "")
    .trim();
  return { cta, benefit };
}

/**
 * Convert a returned hook/angle text block into a HookVariation.
 * Accepts a single block (HOOK_START_A..HOOK_END_A or
 * ANGLE_START_A..ANGLE_END_A) and extracts the four copy fields using
 * the existing HOOK_TEXT / SUBHEADLINE / CTA_BUTTON / BENEFIT markers.
 * The full block is preserved verbatim in `rawBlock` so existing
 * Approve/Edit/AI Edit/Batch handlers can operate on it unchanged.
 *
 * For carousel blocks (ANGLE_START_X), HOOK_TEXT is used as `hookText`
 * and STORY_ARC is folded into the subheadText as additional context.
 */
export function parseHookVariation(block: string, index: number): HookVariation {
  if (!block || typeof block !== "string") {
    return { hookText: "", subheadText: "", ctaName: "", benefitText: "", rawBlock: "", variationIndex: index };
  }

  const hookText = extractBetween(block, "HOOK_TEXT", "SUBHEADLINE")
    .replace(/\*\*/g, "").replace(/^\s*[:：\-–•]+\s*/g, "").trim();
  // Phase 23 (CodeRabbit): stop subhead extraction at STORY_ARC first so
  // we never capture the STORY_ARC marker + value into subheadRaw when
  // STORY_ARC is ordered BEFORE CTA_BUTTON. Fall back to CTA_BUTTON for
  // blocks that omit STORY_ARC.
  const subheadRaw = (extractBetween(block, "SUBHEADLINE", "STORY_ARC")
    || extractBetween(block, "SUBHEADLINE", "CTA_BUTTON"))
    .replace(/\*\*/g, "").replace(/^\s*[:：\-–•]+\s*/g, "").trim();
  const storyArc = extractBetween(block, "STORY_ARC", "CTA_BUTTON")
    .replace(/\*\*/g, "").replace(/^\s*[:：\-–•]+\s*/g, "").trim();
  // Phase 23 (CodeRabbit): join subhead + storyArc with a separator only
  // when both have content, so we never emit a leading "— " on a partial
  // subhead or a trailing "— " when storyArc is empty.
  const subheadText =
    subheadRaw && storyArc ? `${subheadRaw} — ${storyArc}` : (subheadRaw || storyArc);

  let ctaRaw = extractBetween(block, "CTA_BUTTON", "HOOK_END");
  if (!ctaRaw) ctaRaw = extractBetween(block, "CTA_BUTTON", "ANGLE_END");
  if (!ctaRaw) {
    const ctaMatch = block.match(/CTA[_\s]*BUTTON\s*[:：]?\s*([\s\S]*?)$/i);
    ctaRaw = ctaMatch ? ctaMatch[1].trim() : "";
  }
  ctaRaw = ctaRaw.replace(/HOOK_END.*|ANGLE_END.*/gi, "").trim();

  const { cta, benefit } = splitCtaAndBenefit(ctaRaw);
  const claimFlags = extractClaimFlags(block);
  const rawBlock = block.replace(CLAIM_FLAG_LINE_RE, "").trim();

  return {
    hookText,
    subheadText,
    ctaName: cta,
    benefitText: benefit,
    rawBlock,
    claimFlags: claimFlags.length > 0 ? claimFlags : undefined,
    variationIndex: index,
  };
}

/**
 * Parse multiple blocks at once (e.g., the response from
 * generateVariationsLikeThis which can return up to `count` blocks).
 * Returns the parsed HookVariation objects; blocks that fail to yield
 * a non-empty hookText are dropped from the result.
 */
export function parseHookVariations(blocks: readonly string[]): HookVariation[] {
  if (!Array.isArray(blocks)) return [];
  const out: HookVariation[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const v = parseHookVariation(blocks[i]!, i);
    if (v.hookText && v.hookText.length >= 3) {
      out.push(v);
    }
  }
  return out;
}
