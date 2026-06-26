// functions/src/universeCopyMap.ts — Phase 27 universe-aware-copy mapper
// Pure module (no side effects, no Gemini/Firebase imports): encodes the
// single decision function that resolves `universeAwareCopy` for any
// generation and owns the relaxed copy block + blueprint visual-coherence
// instruction consumed by `generators.ts`. Mirrors the Phase 19
// (`gazeMap.ts`) / Phase 28 (`expressionMap.ts`) pattern.
//
//   1. `resolveUniverseCopyDecision(args)` — the single source of truth
//      for `applied` / `styleFamily` / `reason`. First-match precedence
//      per `data-model.md` § 4: reference ad → text-only → carousel
//      non-hook → fantasy active → minimal literal → realistic literal.
//   2. `STRICT_METAPHOR_BLOCK` / `STRICT_METAPHOR_REFRESH_LINE` — the
//      existing strict anti-metaphor text lifted VERBATIM from
//      `generators.ts` (L1899–1915 and L2020). Byte-identity preserved
//      so Contract E reversibility holds and the feature can be
//      disabled by neutralizing the mapper alone.
//   3. `buildFantasyMetaphorCopyBlock(resolvedUniverse,
//      customUniverseDetails?)` — the RELAXED fantasy rule that permits
//      one subtle, evocative universe-echoing word/phrase across
//      headline/subheadline/CTA/benefit (Gemini's choice).
//   4. `buildBlueprintMetaphorVisualBlock(resolvedUniverse)` — the
//      blueprint instruction telling the renderer to describe one
//      matching visual element so the rendered image stays coherent
//      with the metaphor in copy.

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type StyleFamily = "fantasy" | "realistic" | "minimal";

export type UniverseCopyReason =
    | "fantasy-universe-metaphor-active"
    | "realistic-no-metaphor"
    | "minimal-no-metaphor"
    | "reference-ad-override"
    | "text-only-mode"
    | "carousel-non-hook-slide";

export interface UniverseCopyDecisionArgs {
    styleFamily: StyleFamily;
    referenceAdPresent: boolean;
    isTextOnly: boolean;
    isCarouselNonHookSlide: boolean;
}

export interface UniverseCopyDecision {
    applied: boolean;
    styleFamily: StyleFamily;
    reason: UniverseCopyReason;
}

// ═══════════════════════════════════════════════════════════
// DECISION FUNCTION (Contract A — total, deterministic, no throws)
// ═══════════════════════════════════════════════════════════

/**
 * Resolve the universe-aware-copy DECISION for one generation. Single
 * source of truth — every emission site (copy + blueprint + trace)
 * MUST call this with the SAME inputs so the three sites cannot
 * disagree on the same run (research.md Decision 4 / T020).
 *
 * Precedence (first match wins, per `data-model.md` § 4):
 *   1. `referenceAdPresent`            → `reference-ad-override`
 *   2. `isTextOnly`                    → `text-only-mode`
 *   3. `isCarouselNonHookSlide`        → `carousel-non-hook-slide`
 *   4. `styleFamily === "fantasy"`     → `fantasy-universe-metaphor-active` (applied: true)
 *   5. `styleFamily === "minimal"`     → `minimal-no-metaphor`
 *   6. else (realistic / unknown)      → `realistic-no-metaphor`
 *
 * `styleFamily` is always echoed back unchanged (FR-013a — never null,
 * even when suppressed). The function is total — it never throws and
 * never returns null/undefined. Any StyleFamily value outside the
 * canonical three resolves to `realistic-no-metaphor` (the safe
 * default; matches the safe-default behavior of `resolveStyleFamily`).
 */
export function resolveUniverseCopyDecision(args: UniverseCopyDecisionArgs): UniverseCopyDecision {
    if (args.referenceAdPresent) {
        return { applied: false, styleFamily: args.styleFamily, reason: "reference-ad-override" };
    }
    if (args.isTextOnly) {
        return { applied: false, styleFamily: args.styleFamily, reason: "text-only-mode" };
    }
    if (args.isCarouselNonHookSlide) {
        return { applied: false, styleFamily: args.styleFamily, reason: "carousel-non-hook-slide" };
    }
    if (args.styleFamily === "fantasy") {
        return { applied: true, styleFamily: "fantasy", reason: "fantasy-universe-metaphor-active" };
    }
    if (args.styleFamily === "minimal") {
        return { applied: false, styleFamily: "minimal", reason: "minimal-no-metaphor" };
    }
    // realistic / unknown → realistic-no-metaphor (safe default).
    return { applied: false, styleFamily: "realistic", reason: "realistic-no-metaphor" };
}

// ═══════════════════════════════════════════════════════════
// STRICT ANTI-METAPHOR TEXT — LIFTED VERBATIM FROM generators.ts
// ═══════════════════════════════════════════════════════════
// These two constants are the byte-for-byte lift of the existing strict
// anti-metaphor METAPHOR RULE block from `generators.ts`:
//   - `STRICT_METAPHOR_BLOCK`       ← L1899–1915 (mode === 'initial')
//   - `STRICT_METAPHOR_REFRESH_LINE`← L2020 (mode === 'refresh')
//
// Contract E depends on byte-identity (reversibility proof). Do NOT
// paraphrase, normalize whitespace, or reformat — any change here
// breaks the reversibility contract. If generators.ts drifts, update
// these constants to match the new strict text (and re-run Contract
// E1/E2 to confirm the build emits identical prompts).

/**
 * The STRICT anti-metaphor METAPHOR RULE block as it exists in
 * `generators.ts` `generateTOV()` mode `initial` (L1899–1915).
 * Byte-for-byte lift from the source. Used by the copy site when
 * the decision is `applied:false` (realistic / minimal / unknown /
 * suppressed runs) so the pre-Phase-27 behavior is restored.
 *
 * Indentation is preserved (6 leading spaces) because the original
 * site interpolates this text inside a multi-line template literal
 * that already has 6-space indent.
 */
export const STRICT_METAPHOR_BLOCK: string =
    "      ⚠️ METAPHOR RULE (ABSOLUTELY CRITICAL):\n" +
    "      - The universe/theme is primarily for VISUAL SETTING. You MAY use subtle vocabulary from the universe theme (e.g. one evocative word or short phrase that echoes the visual) but do NOT build the copy logic around the theme.\n" +
    "      - Do NOT write full thematic metaphors or sentences that only make sense in context of the universe.\n" +
    "      - The copy must stand on its own and make complete sense to someone who has never seen the visual.\n" +
    "\n" +
    "      ❌ WRONG (Rooftop Garden theme): \"المشكلة في جودة التربة وليست في سعر المحصول النهائي\"\n" +
    "         → This is NONSENSE. What is \"soil\" and \"crop\"? The reader won't understand.\n" +
    "      ❌ WRONG (Ocean theme): \"اغوص في أعماق النجاح\" (Dive into the depths of success)\n" +
    "         → Too metaphorical. Not direct.\n" +
    "      ❌ WRONG (Space theme): \"أطلق صاروخ مبيعاتك\" (Launch your sales rocket)\n" +
    "         → Forced metaphor. Nobody talks like \n" +
    "\n" +
    "      ✅ RIGHT: Use DIRECT, CLEAR language about the ACTUAL problem/solution:\n" +
    "      ✅ \"جمهورك يدفع 1000 دولار لغيرك... ليه مش ليك؟\" (Your audience pays $1000 to others... why not you?)\n" +
    "      ✅ \"خبراء يحصدون أرباحاً مرتفعة بينما تتردد أنت\" (Experts reap high profits while you hesitate)\n" +
    "      ✅ \"مش محتاج محتوى أكتر... محتاج نظام يحول المحتوى لفلوس\" (You don't need more content... you need a system to convert content to money)\n";

/**
 * The STRICT anti-metaphor single-line rule as it exists in
 * `generators.ts` `generateTOV()` mode `refresh` (L2020). Byte-for-byte
 * lift from the source. Used by the copy site (refresh mode) when the
 * decision is `applied:false`.
 */
export const STRICT_METAPHOR_REFRESH_LINE: string =
    "- UNIVERSE/THEME USAGE: The theme is primarily for VISUAL SETTING. You MAY use subtle vocabulary from the universe theme (one evocative word or short phrase that echoes the visual) but do NOT build the copy logic around the theme. Do NOT write full thematic metaphors or sentences that only make sense in context of the universe. The copy must stand on its own and make complete sense to someone who has never seen the visual.";

// ═══════════════════════════════════════════════════════════
// RELAXED FANTASY METAPHOR COPY BLOCK
// ═══════════════════════════════════════════════════════════

/**
 * Build the RELAXED anti-metaphor rule text emitted when the decision
 * is `applied:true` (fantasy + no suppression). Replaces the strict
 * block at the copy site. Permits ONE subtle, evocative universe-
 * echoing word/short phrase across headline / subheadline / CTA /
 * benefit (Gemini's choice — FR-003); keeps the copy must-stand-on-
 * its-own guardrail; preserves Arabic quality rules (no leading و,
 * self-contained phrasing, cultural compliance — NFR-005).
 *
 * `customUniverseDetails` (user-typed custom universe text) takes
 * priority over `resolvedUniverse` when present — matches the
 * existing "CUSTOM UNIVERSE (TOP PRIORITY)" precedence at
 * `generators.ts:1875–1877` (US6 / FR-006). The relaxed block uses
 * only the universe string text, NOT raw `visualMotifs` /
 * `aspirationSignals` / `tone` arrays (those are deferred per
 * research.md "Universe vocabulary source" — add only if localhost
 * QA shows the metaphor is too generic).
 *
 * Advisory tone only — no "reject" / "fail" language, no post-gen
 * enforcement pass (FR-004 / clarification #3). The subtlety cap is
 * prompt wording, not code.
 */
export function buildFantasyMetaphorCopyBlock(
    resolvedUniverse: string,
    customUniverseDetails?: string,
): string {
    const universeLabel = (customUniverseDetails && String(customUniverseDetails).trim().length > 0)
        ? String(customUniverseDetails).trim()
        : String(resolvedUniverse || "").trim();
    const universeCtx = universeLabel
        ? ` The active universe is "${universeLabel}".`
        : " The active fantasy universe is the visual world you are rendering.";
    return (
        "      ✨ UNIVERSE METAPHOR RULE (FANTASY — REQUIRED):\n" +
        "      - The copy MUST include exactly ONE subtle, evocative universe-echoing word or short phrase (Gemini chooses the placement: headline, subheadline, CTA, or benefit — wherever it reads most natural for the hook and the offer). The metaphor is required for fantasy; it is not optional.\n" +
        "      - Keep it SUBTLE — exactly one word or a short phrase, never a full thematic sentence, never a multi-sentence narrative. The metaphor is a hint that the words and the picture live in the same world, not a story.\n" +
        "      - The copy MUST still stand on its own and make complete sense to a reader who has never seen the image. If the only metaphor you can land also requires the visual to make sense, pick a different metaphor — do NOT drop the requirement, change the metaphor.\n" +
        "      - DO NOT echo the universe name literally (e.g. dropping the universe word verbatim into the headline). Echo a vocabulary MOTIF (a concept, object, action, or setting native to the universe) so it reads as natural language, not as a label.\n" +
        "      - Each hook MUST include its own subtle universe-echoing word or phrase. Limit to one metaphor per hook — never more than one subtle phrase per single line of copy.\n" +
        "      - DO NOT break the existing copy rules to land a metaphor. Direct, clear, conversational copy still wins. The metaphor is a small flavor, never the main course.\n" +
        "      - Arabic quality rules UNCHANGED: no leading و on a STANDALONE line; phrases must be self-contained and culturally compliant; no broken half-metaphors (Arabic must work as spoken language, not as assembled vocabulary blocks). The metaphor must respect every Arabic-quality guardrail that already exists.\n" +
        "      - This is a prompt-level mandate, NOT a code-enforced cap. There is no post-generation rejection pass for over-aggressive metaphor — over-aggressive output (full themed sentences, image-dependent copy, forced vocabulary) is a quality failure and should be rewritten before output.\n" +
        `      - Universe vocabulary source:${universeCtx} If a custom universe was provided, draw metaphor vocabulary from that text rather than from a default catalog entry.\n`
    );
}

// ═══════════════════════════════════════════════════════════
// BLUEPRINT VISUAL-COHERENCE INSTRUCTION (Contract C)
// ═══════════════════════════════════════════════════════════

/**
 * Build the BLUEPRINT (concept/build-plan) instruction that pairs the
 * copy-side metaphor with a concrete visual element so the rendered
 * image stays coherent with the words. Emitted into the rendered-image
 * prompt only when the decision is `applied:true` (fantasy + not
 * suppressed — FR-005 / Contract C1). Subordinate to existing
 * identity / costume rules — must never override them.
 *
 * The instruction is intentionally ANCHORED to `resolvedUniverse` so
 * the renderer knows WHICH universe vocabulary to draw the visual
 * element from. It does NOT inject raw `visualMotifs` arrays —
 * Gemini picks one matching element from the universe context
 * already present in the blueprint prompt.
 */
export function buildBlueprintMetaphorVisualBlock(resolvedUniverse: string): string {
    const universeLabel = String(resolvedUniverse || "").trim();
    const universeCtx = universeLabel
        ? `universe "${universeLabel}"`
        : "the active fantasy universe";
    return (
        "🖼️ UNIVERSE METAPHOR — VISUAL COHERENCE (FANTASY ONLY):\n" +
        `If the copy carries a subtle universe-echoing word or short phrase drawn from ${universeCtx}, the blueprint / SUBJECT_ACTION / TECHNICAL_PROMPT MUST describe ONE matching visual element (a prop, a setting detail, an action, or a costume motif native to that universe) so the rendered image reflects the metaphor coherently — the words and the picture must feel like the same world, not a disconnected pair.\n` +
        "Keep the visual element SUBTLE and ANCHORED to the existing hero pose / environment / costume — never let the metaphor override identity, costume, or composition rules. The visual element is a small worldbuilding detail in service of the hook, never the dominant focal point.\n" +
        "If the copy chose to stay literal (relaxation is permissive, not mandatory), you may stay literal here too — do NOT invent a visual metaphor the copy did not author.\n"
    );
}
