// src/utils/inlineHookEdit.ts
// ═══════════════════════════════════════════════════════════════════════════
// PHASE 24B — Inline hook editor save helper (T026 / U10 / UINV-3 / FR-006)
// Pure helper extracted from App.tsx's `handleInlineHookSave` so the
// empty-optional-field normalization can be unit-tested directly.
//
// Behavior:
//   - hookText is NEVER normalized — it is the variation's required identity.
//   - An optional field whose trimmed value is empty is OMITTED from the
//     serialized block, so parseHookVariation() reads no marker and
//     normalizeOptional() returns `null` for that field.
//   - The CTA + benefit pair shares one line (`CTA_BUTTON: <cta> ||| <benefit>`).
//     If CTA is empty, the entire CTA_BUTTON line is omitted (benefit would
//     be orphaned without a CTA). If CTA is present but benefit is empty,
//     the `|||` separator is omitted (CTA-only line).
//   - For carousel blocks, STORY_ARC is always written verbatim so the
//     existing parser pipeline is preserved.
//
// The returned string is a raw block ready to be re-parsed by
// `parseHookVariation()` or to replace the matching start/end marker pair
// in the full TOV text.
// ═══════════════════════════════════════════════════════════════════════════

export interface InlineHookEditInput {
  /** Required. The block open marker, e.g. `HOOK_START_A` or `ANGLE_START_A`. */
  startTag: string;
  /** Required. The block close marker, e.g. `HOOK_END_A` or `ANGLE_END_A`. */
  endTag: string;
  /** Required. The headline / hook text. Empty strings are written through (this field is never optional). */
  hookText: string;
  /** Optional. Empty or whitespace-only → omitted from the block. */
  subhead: string;
  /** Optional. Empty or whitespace-only → entire CTA_BUTTON line omitted. */
  cta: string;
  /** Optional. Empty or whitespace-only → `||| <benefit>` suffix omitted (CTA-only line). */
  benefit: string;
  /** Carousel-only. Always written verbatim when `isCarousel=true`. Optional in the input. */
  storyArc?: string;
  /** Whether to emit the carousel-shaped block (with STORY_ARC line). */
  isCarousel: boolean;
}

/**
 * Build the raw block that `handleInlineHookSave` writes back into the TOV
 * text. Optional fields whose trimmed value is empty are OMITTED so that
 * the downstream `parseHookVariation()` returns `null` for them (FR-006 /
 * U10 / UINV-3). `hookText` is always emitted as-is — it is the
 * variation's required identity and is never optional.
 */
export function buildInlineEditedBlock(input: InlineHookEditInput): string {
  const trimmedSubhead = input.subhead.trim();
  const trimmedCta = input.cta.trim();
  const trimmedBenefit = input.benefit.trim();

  // Omit the SUBHEADLINE: line entirely when cleared. parseHookVariation()
  // then reads no marker and returns null for subheadText via normalizeOptional.
  const subheadLine = trimmedSubhead.length > 0 ? `SUBHEADLINE: ${trimmedSubhead}\n` : "";

  // CTA + benefit share one line. If CTA is empty, drop the entire line —
  // a benefit without a CTA is not a valid CTA_BUTTON block and would
  // produce confusing downstream rendering.
  let ctaLine = "";
  if (trimmedCta.length > 0) {
    ctaLine = trimmedBenefit.length > 0
      ? `CTA_BUTTON: ${trimmedCta} ||| ${trimmedBenefit}\n`
      : `CTA_BUTTON: ${trimmedCta}\n`;
  }

  // STORY_ARC is carousel-only. Always written verbatim so the parser's
  // existing extraction logic is unchanged.
  const storyArcLine = input.isCarousel ? `STORY_ARC: ${input.storyArc ?? ""}\n` : "";

  return `${input.startTag}\nHOOK_TEXT: ${input.hookText}\n${subheadLine}${storyArcLine}${ctaLine}${input.endTag}`;
}