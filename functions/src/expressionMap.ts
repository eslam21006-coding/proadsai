// functions/src/expressionMap.ts — Phase 28 expression-adaptation mapper
// Pure module: resolves the active cold hook angle (or retargeting objection) to
// an `ExpressionDirective` (emotion + concrete physical description) and builds
// the `EXPRESSION DIRECTION:` block that is emitted as guidance into the
// [VISUAL ARCHITECT V5.0] concept prompt. The directive shapes the blueprint's
// `MOOD_EMOTION` / `SUBJECT_ACTION`; identity protection (priority #1) stays a
// TECHNICAL_PROMPT rule and is preserved verbatim.

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

/**
 * The resolved expression mapping for one generation. Built by the mapper and
 * consumed by `buildExpressionDirectionBlock`. The `source` tells a reader
 * whether the directive came from a cold-traffic hook angle or a retargeting
 * objection (so the trace is unambiguous).
 */
export interface ExpressionDirective {
    source: "hook" | "objection";
    sourceId: string;
    emotion: string;
    description: string;
}

// ═══════════════════════════════════════════════════════════
// COLD HOOK ANGLE → EXPRESSION DIRECTIVE
// ═══════════════════════════════════════════════════════════
// Canonical IDs come from `HOOK_ANGLE_KNOWLEDGE` (functions/src/knowledge/
// hookAnglesKnowledge.ts). Frontend `COLD_HOOK_ANGLES` is identical and is
// NOT imported here (functions/ has its own tsconfig and cannot import from
// the frontend package).

/**
 * 10 canonical cold hook angles → resolved emotional direction.
 * Pain / Curiosity / Logic / Social Proof / Urgency overlap the original request.
 * Emotional / Statistics / Scarcity / Logical Authority / Future Based are the
 * 5 IDs absent from the original request — their mappings are the confirmed
 * defaults from Clarifications 2026-06-23 (FR-005).
 */
const HOOK_EXPRESSION_MAP: Record<string, Omit<ExpressionDirective, "source" | "sourceId">> = {
    pain: {
        emotion: "concern, frustration",
        description: "slight frown, tired eyes, tension in the jaw — quiet suffering, NOT anger",
    },
    curiosity: {
        emotion: "intrigue, thoughtfulness",
        description: "raised eyebrow, slight head tilt, studying look — leaning in to understand",
    },
    logic: {
        emotion: "analytical clarity",
        description: "focused gaze, neutral relaxed mouth, evaluating expression — sharp and clear-eyed",
    },
    social_proof: {
        emotion: "confidence, quiet pride",
        description: "relaxed confident expression, soft smile — the calm of someone who belongs",
    },
    urgency: {
        emotion: "alertness, focused intensity",
        description: "focused eyes, lips slightly compressed, ready-to-act energy — composed urgency",
    },
    emotional: {
        emotion: "empathetic, heartfelt (warm vulnerability)",
        description: "open expression, eyes that connect, soft warmth — the vulnerability of someone who truly understands",
    },
    statistics: {
        emotion: "sober, analytical",
        description: "measured gaze, calm composed face, slight nod of authority — numbers personified",
    },
    scarcity: {
        emotion: "urgent, alert",
        description: "focused alert eyes, calm but tense posture — knowing the door is closing",
    },
    logical_authority: {
        emotion: "commanding, assured",
        description: "settled confident gaze, composed shoulders, slight knowing nod — earned authority",
    },
    future_based: {
        emotion: "aspirational, hopeful (looking forward)",
        description: "uplifted gaze, soft smile at the corners of the mouth, open posture — already seeing tomorrow",
    },
};

/**
 * Defensive aliases — older runs / legacy inputs may carry these IDs.
 * `shocking_stat` and `fear_of_missing_out` and `future_pacing` are referenced
 * by `generators.ts` defensively at lines 2323–2334. They MUST resolve to a
 * defined direction (never null) so a real generation is never left without
 * expression guidance.
 */
const HOOK_ALIAS_MAP: Record<string, string> = {
    shocking_stat: "statistics",
    fear_of_missing_out: "urgency", // FOMO reads as alert urgency
    future_pacing: "future_based",
};

/**
 * Fallback directive for any non-null, non-canonical ID. Per Decision 5
 * (research.md), a real run must NEVER receive null for a non-null input;
 * instead it gets a confident / approachable direction that keeps the
 * generation viable without misrepresenting a hook the codebase doesn't know.
 */
const HOOK_FALLBACK_DIRECTIVE: Omit<ExpressionDirective, "source" | "sourceId"> = {
    emotion: "confident, approachable",
    description: "relaxed confident expression, natural calm — open and easy to trust",
};

/**
 * Resolve a cold hook angle id to an `ExpressionDirective`. Returns `null`
 * ONLY when the input itself is null/undefined (the absent sentinel). Any
 * non-null input returns a directive — canonical ids via the table, aliases
 * via `HOOK_ALIAS_MAP`, and anything else via the fallback.
 */
export function getHookExpressionDirection(angle: string | null | undefined): ExpressionDirective | null {
    if (angle == null) return null;
    const raw = String(angle).trim();
    if (raw === "") return null;
    // Canonical lookup
    const canonical = HOOK_ALIAS_MAP[raw] ?? raw;
    const entry = HOOK_EXPRESSION_MAP[canonical];
    if (entry) {
        return { source: "hook", sourceId: canonical, ...entry };
    }
    // Unrecognized but non-null → fallback (NEVER null for a real run)
    return { source: "hook", sourceId: raw, ...HOOK_FALLBACK_DIRECTIVE };
}

// ═══════════════════════════════════════════════════════════
// RETARGETING OBJECTION → EXPRESSION DIRECTIVE (BY FAMILY)
// ═══════════════════════════════════════════════════════════
// IDs from `RETARGETING_OBJECTION_DATA` (functions/src/retargetingObjections.ts).
// Family groupings per FR-006 and data-model.md.

const PRICE_OBJECTION_IDS = new Set<string>(["price_too_high", "no_budget_now", "need_installments"]);
const TRUST_OBJECTION_IDS = new Set<string>(["dont_trust", "tried_before_failed", "will_it_work_for_me"]);
const TIMING_OBJECTION_IDS = new Set<string>(["no_time", "not_ready_yet"]);

/**
 * Fallback family — also covers any unmapped objection id. Per FR-006.
 */
const OBJECTION_FALLBACK: Omit<ExpressionDirective, "source" | "sourceId"> = {
    emotion: "confident, approachable",
    description: "relaxed confident expression, natural calm — open and easy to trust",
};

/**
 * Resolve a retargeting objection id to an `ExpressionDirective` by family.
 * Returns `null` ONLY when the input itself is null/undefined.
 */
export function getObjectionExpressionDirection(objectionId: string | null | undefined): ExpressionDirective | null {
    if (objectionId == null) return null;
    const raw = String(objectionId).trim();
    if (raw === "") return null;

    let entry: Omit<ExpressionDirective, "source" | "sourceId">;
    if (PRICE_OBJECTION_IDS.has(raw)) {
        entry = {
            emotion: "analytical, evaluating",
            description: "measured gaze, weighing look, neutral evaluating mouth — doing the math, not selling",
        };
    } else if (TRUST_OBJECTION_IDS.has(raw)) {
        entry = {
            emotion: "reassuring, confident",
            description: "calm steady eyes, soft confident expression, open hands — the kind of certainty that calms doubt",
        };
    } else if (TIMING_OBJECTION_IDS.has(raw)) {
        entry = {
            emotion: "urgent, focused",
            description: "focused eyes, slight forward lean, alert expression — clear-eyed about the cost of delay",
        };
    } else {
        entry = OBJECTION_FALLBACK;
    }
    return { source: "objection", sourceId: raw, ...entry };
}

// ═══════════════════════════════════════════════════════════
// PROMPT BLOCK BUILDER
// ═══════════════════════════════════════════════════════════

export interface BuildExpressionDirectionBlockOptions {
    /**
     * Set to true to suppress the identity-priority clause (e.g. for tests
     * that only care about the emotion+description rendering). Default false
     * — the clause is ALWAYS emitted in production.
     */
    omitIdentityClause?: boolean;
    /**
     * Set to true to suppress the art-direction blending clause.
     */
    omitBlendingClause?: boolean;
    /**
     * Set to true to suppress the explicit MOOD_EMOTION / SUBJECT_ACTION
     * routing instruction. Default false — production always emits it so
     * Gemini knows WHERE to apply the emotion (Contract #9 / FR-002).
     */
    omitFieldRoutingClause?: boolean;
}

/**
 * Build the `EXPRESSION DIRECTION:` text block emitted into the
 * [VISUAL ARCHITECT V5.0] concept prompt. Returns `''` for a null directive
 * (so the caller can emit a single line unconditionally and the absent case
 * produces no line at all — Contract C3).
 *
 * The block contains:
 *   - The emotion + physical description (Contract B1)
 *   - Identity-is-priority-#1 / do not change bone structure (Contract B2)
 *   - Art-direction blending — character from art direction, emotion from
 *     hook/objection (Contract B3 / FR-008)
 *   - Subtle / natural, never exaggerated (Contract B4 / FR-009)
 *   - NO gaze-direction instruction (Contract B5 / FR-014)
 *   - Explicit field routing: "Reflect this in MOOD_EMOTION and SUBJECT_ACTION"
 *     (Audit fix #9 / FR-002 — without this, Gemini is free to ignore the
 *     emotion; with it, the concept template's MOOD_EMOTION / SUBJECT_ACTION
 *     fields carry the resolved emotion through blueprint→technical synthesis.)
 */
export function buildExpressionDirectionBlock(
    directive: ExpressionDirective | null,
    opts: BuildExpressionDirectionBlockOptions = {},
): string {
    if (directive == null) return "";

    const lines: string[] = [];
    lines.push(
        `EXPRESSION DIRECTION: ${directive.emotion}.`,
        `Physical description: ${directive.description}.`,
    );
    if (!opts.omitIdentityClause) {
        lines.push(
            "Identity is PRIORITY #1 — do NOT change bone structure, facial features, or skin texture; the expression must adapt without altering who the person is.",
        );
    }
    if (!opts.omitBlendingClause) {
        lines.push(
            "BLEND with the selected art direction: art direction sets the CHARACTER / STYLE / ENERGY (e.g. mythic, neon, watercolor, cinematic) and the hook/objection sets the EMOTION — combine them into one cohesive expression (e.g. a 'mythic' art direction with a 'pain' emotion reads as 'powerful concern', not flat concern and not a default smile).",
        );
    }
    if (!opts.omitFieldRoutingClause) {
        lines.push(
            "Reflect this emotional direction in the MOOD_EMOTION and SUBJECT_ACTION fields of your concept output — these are the fields that flow into the TECHNICAL_PROMPT.",
        );
    }
    lines.push(
        "Keep the expression SUBTLE and NATURAL — never exaggerated, theatrical, or caricatured.",
    );
    return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════
// IMAGE-PROMPT BLOCK — for the IMAGE-rendering prompt (audit #8 / #15 / #17)
// ═══════════════════════════════════════════════════════════
// The IMAGE prompt (built by `buildFinalImagePrompt`) is the SINGLE shared
// prompt-assembly point for single, carousel, and batch generations. Injecting
// here — AFTER the BLUEPRINT (which contains hero / environment / universe
// descriptions) — means:
//   - Gemini sees the hero/environment first, then the expression direction
//     applied on top (audit #8 fix).
//   - Carousel slides all see the same hook direction (FR-011).
//   - Batch items each carry their own `inputs.coldHookAngle`, so each gets
//     its own direction (FR-012).
//   - Before/after mode splits BEFORE=hook / AFTER=aspirational (audit #15
//     fix — FR-010).

/**
 * Aspirational fallback directive used for the AFTER half in before/after
 * mode (and any time the AFTER half needs a forward-looking, hopeful
 * emotion). Matches the `future_based` cold-hook mapping verbatim so the
 * AFTER state reads as confident and forward-looking regardless of the
 * problem-oriented hook that drives the BEFORE half.
 */
const ASPIRATIONAL_DIRECTIVE: Omit<ExpressionDirective, "source" | "sourceId"> = {
    emotion: "aspirational, hopeful, looking forward",
    description: "uplifted gaze, soft smile at the corners of the mouth, open posture, settled confident shoulders — already seeing the result",
};

export interface BuildImagePromptExpressionBlockOptions extends BuildExpressionDirectionBlockOptions {
    /**
     * Set to true to emit a BEFORE/AFTER split block (used by
     * `buildFinalImagePrompt` when `inputs.offerCreativeMode` includes
     * `before_after`). The BEFORE half uses the hook-derived directive;
     * the AFTER half uses an aspirational directive regardless of the
     * hook (FR-010: BEFORE = problem emotion, AFTER = aspirational /
     * confident).
     *
     * When `false` (default), the block is a single EXPRESSION DIRECTION
     * line for the whole image — the canonical single/carousel/batch case.
     */
    beforeAfterSplit?: boolean;
}

/**
 * Build the EXPRESSION DIRECTION block for the IMAGE-rendering prompt
 * (`buildFinalImagePrompt`). Returns `''` for a null directive.
 *
 * The block always contains:
 *   - The emotion + physical description
 *   - Identity-is-priority-#1 clause
 *   - Art-direction blending clause
 *   - Subtle / natural requirement
 *   - Explicit MOOD_EMOTION / SUBJECT_ACTION routing instruction
 *     (audit #9 fix — Gemini knows WHERE to apply the emotion)
 *   - NO gaze-direction instruction
 *
 * In before/after mode (`opts.beforeAfterSplit === true`), the block is
 * split into two clearly labelled halves (BEFORE / AFTER) — audit #15 fix.
 */
export function buildImagePromptExpressionBlock(
    directive: ExpressionDirective | null,
    opts: BuildImagePromptExpressionBlockOptions = {},
): string {
    if (directive == null) return "";

    const emitBeforeAfterSplit = opts.beforeAfterSplit === true;

    const lines: string[] = [];

    if (emitBeforeAfterSplit) {
        // Before/after split: BEFORE half = hook emotion (the problem), AFTER
        // half = aspirational (the resolution). Each half gets its own
        // physical description so the model can render two visibly different
        // emotional states for the same face.
        const beforeDirective = directive;
        const afterDirective: ExpressionDirective = {
            source: directive.source,
            sourceId: `${directive.sourceId}::after`,
            ...ASPIRATIONAL_DIRECTIVE,
        };
        lines.push(
            `EXPRESSION DIRECTION — BEFORE HALF: ${beforeDirective.emotion}.`,
            `BEFORE physical description: ${beforeDirective.description}.`,
            `EXPRESSION DIRECTION — AFTER HALF: ${afterDirective.emotion}.`,
            `AFTER physical description: ${afterDirective.description}.`,
            "Same face / same person on BOTH halves — only the expression (and any props) change.",
        );
    } else {
        lines.push(
            `EXPRESSION DIRECTION: ${directive.emotion}.`,
            `Physical description: ${directive.description}.`,
        );
    }

    if (!opts.omitIdentityClause) {
        lines.push(
            "Identity is PRIORITY #1 — do NOT change bone structure, facial features, or skin texture; the expression must adapt without altering who the person is.",
        );
    }
    if (!opts.omitBlendingClause) {
        lines.push(
            "BLEND with the selected art direction: art direction sets the CHARACTER / STYLE / ENERGY (e.g. mythic, neon, watercolor, cinematic) and the hook/objection sets the EMOTION — combine them into one cohesive expression (e.g. a 'mythic' art direction with a 'pain' emotion reads as 'powerful concern', not flat concern and not a default smile).",
        );
    }
    if (!opts.omitFieldRoutingClause) {
        lines.push(
            "Reflect this emotional direction in the MOOD_EMOTION and SUBJECT_ACTION fields of your concept output — these are the fields that flow into the TECHNICAL_PROMPT.",
        );
    }
    lines.push(
        "Keep the expression SUBTLE and NATURAL — never exaggerated, theatrical, or caricatured.",
    );
    return lines.join("\n");
}

/**
 * Resolve the directive for a given render context. Single shared helper
 * used by both `generateFinalAd` (and downstream `buildFinalImagePrompt`)
 * and `generateConcepts`. Picks the cold hook angle first, falling back to
 * the retargeting objection. Returns `null` if neither applies.
 */
export function resolveExpressionDirective(inputs: {
    coldHookAngle?: string | null;
    retargetingObjection?: string | null;
}): ExpressionDirective | null {
    if (inputs.coldHookAngle) {
        return getHookExpressionDirection(inputs.coldHookAngle);
    }
    if (inputs.retargetingObjection) {
        return getObjectionExpressionDirection(inputs.retargetingObjection);
    }
    return null;
}

// ═══════════════════════════════════════════════════════════
// INVARIANT — every canonical hook angle id must resolve
// ═══════════════════════════════════════════════════════════
// Imported lazily in non-production by the test scaffold; we don't import
// HOOK_ANGLE_KNOWLEDGE at module load because that would create a circular
// dep in some test setups. The test file owns the coverage assertion.

// Re-export the canonical id set so the test scaffold can iterate it without
// importing `hookAnglesKnowledge` directly from outside the package.
export function getKnownHookAngleIds(): readonly string[] {
    return Object.keys(HOOK_EXPRESSION_MAP);
}
