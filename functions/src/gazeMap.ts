// functions/src/gazeMap.ts — Phase 19 gaze-direction + DR-design mapper
// Pure module: resolves the active cold hook angle (or retargeting
// objection) to a `GazeDirective` (treatment label + concrete physical
// description) and builds the direct-response prompt blocks emitted as
// guidance into the image-rendering prompt at the single shared
// assembly point `buildFinalImagePrompt()` (generators.ts:5260):
//
//   1. `buildImagePromptGazeBlock(directive, { beforeAfterSplit,
//      aspectRatio })` → `GAZE DIRECTION:` block (US1, hook-gated).
//   2. `ONE_HIGHLIGHT_BLOCK` → one-focal-point cap (US2, always-on).
//   3. `buildHookVisualMoodBlock(directive)` → hook↔visual mood
//      modulation (US4, hook-gated).
//   4. `buildPriceHierarchyBlock()` → price-hierarchy block
//      (US5, content-gated via `detectPriceContent(...)`).
//   5. `CTA_OUTCOME_FRAMING_BLOCK` → copy-prompt CTA outcome framing
//      (US3, imported by `generators.ts` and spliced into the existing
//      CTA/benefit block of the copy-generation prompt).
//
// Mirrors `expressionMap.ts` (Phase 28) so the gaze and expression
// guidance are emitted through the same single-injection-point pattern.
// Face-identity protection (priority #1) stays a TECHNICAL_PROMPT rule
// and is preserved verbatim.

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

/**
 * The five canonical gaze treatments the spec recognises. Each one
 * pairs with a hook family's natural visual default (see HOOK_GAZE_MAP
 * below). All five are advisory — the renderer is free to pick the
 * most natural variation in context, just not to invert them.
 */
export type GazeTreatment =
    | "direct_to_viewer"      // level gaze to camera — authority / social_proof / urgency / statistics / logic / logical_authority
    | "toward_content"        // natural glance toward headline/CTA zone — scarcity, soft emotional
    | "reflective_downward"   // slightly down & inward, contemplative — pain
    | "forward_horizon"       // uplifted, forward / visionary — future_based, AFTER half
    | "three_quarter";        // classic off-axis portrait gaze — curiosity

/**
 * The resolved gaze mapping for one generation. Built by the mapper
 * and consumed by `buildImagePromptGazeBlock`. The `source` tells a
 * reader whether the directive came from a cold-traffic hook angle,
 * a retargeting objection, or the safe fallback (FR-010). An
 * `art-direction` source is reserved for a future phase (deferred per
 * the Phase 19 clarification session).
 */
export interface GazeDirective {
    source: "hook" | "objection" | "fallback";
    sourceId: string;
    treatment: GazeTreatment;
    description: string;
}

// ═══════════════════════════════════════════════════════════
// COLD HOOK ANGLE → GAZE DIRECTIVE
// ═══════════════════════════════════════════════════════════
// Canonical IDs come from `HOOK_ANGLE_KNOWLEDGE` (functions/src/knowledge/
// hookAnglesKnowledge.ts). Frontend `COLD_HOOK_ANGLES` is identical and
// is NOT imported here (functions/ has its own tsconfig and cannot
// import from the frontend package). The table below covers the 10
// canonical ids verified by spec.md FR-001.

/**
 * 10 canonical cold hook angles → resolved gaze treatment + concrete
 * physical description. Each treatment is the natural complement of
 * the hook's Phase 28 emotion (e.g., pain = quiet suffering →
 * reflective-downward gaze; logical_authority = commanding →
 * direct-to-viewer) so gaze and expression never contradict (FR-019).
 */
const HOOK_GAZE_MAP: Record<string, Omit<GazeDirective, "source" | "sourceId">> = {
    pain: {
        treatment: "reflective_downward",
        description: "gaze cast slightly down and inward, contemplative — sitting with the problem, not at camera",
    },
    emotional: {
        treatment: "toward_content",
        description: "soft eyes that connect, gentle slightly-off direct gaze — warm and understanding, leaning toward the headline",
    },
    curiosity: {
        treatment: "three_quarter",
        description: "eyes angled three-quarter off-axis, intrigued — drawing the viewer to look where they look",
    },
    logic: {
        treatment: "direct_to_viewer",
        description: "steady level direct gaze, clear-eyed and evaluating — the data-driven eye contact",
    },
    social_proof: {
        treatment: "direct_to_viewer",
        description: "confident direct gaze to viewer — the calm of someone who belongs",
    },
    urgency: {
        treatment: "direct_to_viewer",
        description: "focused direct gaze, alert and ready-to-act — eyes forward, no wavering",
    },
    statistics: {
        treatment: "direct_to_viewer",
        description: "measured level gaze to viewer, sober authority — the data personified",
    },
    scarcity: {
        treatment: "toward_content",
        description: "alert gaze angled toward the offer/CTA zone — aware the door is closing",
    },
    logical_authority: {
        treatment: "direct_to_viewer",
        description: "settled commanding gaze straight to viewer — earned authority, no wavering",
    },
    future_based: {
        treatment: "forward_horizon",
        description: "uplifted gaze toward the horizon/forward — already seeing tomorrow",
    },
};

/**
 * Defensive aliases — older runs / legacy inputs may carry these IDs.
 * They MUST resolve to a defined direction (never null) so a real
 * generation is never left without gaze guidance. Mirrors the alias
 * map in `expressionMap.ts` (Phase 28, FR-010).
 */
const HOOK_ALIAS_MAP: Record<string, string> = {
    shocking_stat: "statistics",
    fear_of_missing_out: "urgency", // FOMO reads as alert urgency
    future_pacing: "future_based",
};

/**
 * Fallback directive for any non-null, non-canonical ID. Per FR-010,
 * a real run must NEVER receive null for a non-null input; instead it
 * gets a confident, approachable direction that keeps the generation
 * viable without misrepresenting a hook the codebase doesn't know.
 */
const GAZE_FALLBACK_DIRECTIVE: Omit<GazeDirective, "source" | "sourceId"> = {
    treatment: "three_quarter",
    description: "natural, intentional three-quarter gaze, approachable and engaged — never staring into empty space",
};

/**
 * Aspirational fallback used for the AFTER half in before/after mode
 * (and any time the AFTER half needs a forward-looking gaze).
 * Matches the `future_based` cold-hook mapping verbatim so the AFTER
 * state reads as confident and forward-looking regardless of the
 * problem-oriented hook that drives the BEFORE half.
 */
const GAZE_ASPIRATIONAL_DIRECTIVE: Omit<GazeDirective, "source" | "sourceId"> = {
    treatment: "forward_horizon",
    description: "uplifted forward gaze, already seeing the result",
};

/**
 * Resolve a cold hook angle id to a `GazeDirective`. Returns `null`
 * ONLY when the input itself is null/undefined (the absent sentinel —
 * FR-005). Any non-null input returns a directive — canonical ids
 * via the table, aliases via `HOOK_ALIAS_MAP`, and anything else
 * via the safe fallback (FR-010: never throws, never null for a
 * non-null id).
 */
export function getHookGazeDirection(angle: string | null | undefined): GazeDirective | null {
    if (angle == null) return null;
    const raw = String(angle).trim();
    if (raw === "") return null;
    // Canonical lookup (with alias resolution).
    const canonical = HOOK_ALIAS_MAP[raw] ?? raw;
    const entry = HOOK_GAZE_MAP[canonical];
    if (entry) {
        return { source: "hook", sourceId: canonical, ...entry };
    }
    // Unrecognized but non-null → fallback (NEVER null for a real run).
    return { source: "fallback", sourceId: raw, ...GAZE_FALLBACK_DIRECTIVE };
}

// ═══════════════════════════════════════════════════════════
// RETARGETING OBJECTION → GAZE DIRECTIVE (BY FAMILY)
// ═══════════════════════════════════════════════════════════
// IDs from `RETARGETING_OBJECTION_DATA` (functions/src/retargetingObjections.ts).
// Family groupings mirror the Phase 28 expression families so gaze and
// expression stay aligned for retargeting heroes (FR-019).

const PRICE_OBJECTION_IDS = new Set<string>(["price_too_high", "no_budget_now", "need_installments"]);
const TRUST_OBJECTION_IDS = new Set<string>(["dont_trust", "tried_before_failed", "will_it_work_for_me"]);
const TIMING_OBJECTION_IDS = new Set<string>(["no_time", "not_ready_yet"]);

/**
 * Fallback family — also covers any unmapped objection id.
 */
const OBJECTION_FALLBACK: Omit<GazeDirective, "source" | "sourceId"> = {
    treatment: "three_quarter",
    description: "natural, intentional three-quarter gaze, approachable and engaged — never staring into empty space",
};

/**
 * Resolve a retargeting objection id to a `GazeDirective` by family.
 * Returns `null` ONLY when the input itself is null/undefined.
 */
export function getObjectionGazeDirection(objectionId: string | null | undefined): GazeDirective | null {
    if (objectionId == null) return null;
    const raw = String(objectionId).trim();
    if (raw === "") return null;

    let entry: Omit<GazeDirective, "source" | "sourceId">;
    if (PRICE_OBJECTION_IDS.has(raw)) {
        entry = {
            treatment: "direct_to_viewer",
            description: "level direct gaze, clear-eyed and steady — doing the math, not selling",
        };
    } else if (TRUST_OBJECTION_IDS.has(raw)) {
        entry = {
            treatment: "direct_to_viewer",
            description: "settled direct gaze, calm and certain — the kind of eye contact that dissolves doubt",
        };
    } else if (TIMING_OBJECTION_IDS.has(raw)) {
        entry = {
            treatment: "direct_to_viewer",
            description: "focused direct gaze, alert — clear-eyed about the cost of delay",
        };
    } else {
        entry = OBJECTION_FALLBACK;
    }
    return { source: "objection", sourceId: raw, ...entry };
}

/**
 * Resolve the directive for a given render context. Single shared
 * helper used by `buildFinalImagePrompt` and `generateFinalAd`. Picks
 * the cold hook angle first, falling back to the retargeting
 * objection. Returns `null` if neither applies (FR-005).
 */
export function resolveGazeDirective(inputs: {
    coldHookAngle?: string | null;
    retargetingObjection?: string | null;
}): GazeDirective | null {
    if (inputs.coldHookAngle) {
        return getHookGazeDirection(inputs.coldHookAngle);
    }
    if (inputs.retargetingObjection) {
        return getObjectionGazeDirection(inputs.retargetingObjection);
    }
    return null;
}

/**
 * Returns the canonical list of cold hook-angle IDs the mapper
 * recognises (the keys of `HOOK_GAZE_MAP`). Exposed so test code can
 * iterate the canonical set without importing from `hookAnglesKnowledge`
 * (the `functions/` package must not import from the frontend bundle).
 */
export function getKnownHookAngleIds(): readonly string[] {
    return Object.keys(HOOK_GAZE_MAP);
}

// ═══════════════════════════════════════════════════════════
// IMAGE-PROMPT BLOCK BUILDER
// ═══════════════════════════════════════════════════════════
// The IMAGE prompt (built by `buildFinalImagePrompt`) is the SINGLE
// shared prompt-assembly point for single, carousel, and batch
// generations (FR-007). Injecting here — AFTER the BLUEPRINT (which
// contains hero / environment / universe descriptions) AND AFTER the
// Phase 28 expression block — means:
//   - Gemini sees the hero/environment first, then the emotion
//     direction, then the gaze direction applied on top.
//   - Carousel slides all see the same hook direction (FR-011).
//   - Batch items each carry their own `inputs.coldHookAngle`, so
//     each gets its own direction (FR-012).
//   - Before/after mode splits BEFORE=hook / AFTER=aspirational
//     (FR-008, mirroring Phase 28's expression split).

/**
 * AspectRatio is the same union that `buildFinalImagePrompt` already
 * destructures (`generators.ts:5266`); we re-declare a local minimal
 * view so this module stays side-effect-free (does not import from
 * `generators.ts`, which would create a circular dep).
 */
export type GazeAspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "3:4" | "4:3";

export interface BuildImagePromptGazeBlockOptions {
    /**
     * Set to true to emit a BEFORE/AFTER split block (used by
     * `buildFinalImagePrompt` when `inputs.offerCreativeMode` includes
     * `before_after`). The BEFORE half uses the hook-derived
     * directive; the AFTER half uses the aspirational directive
     * regardless of the hook (FR-008: BEFORE = reflective/problem
     * gaze, AFTER = forward/aspirational).
     *
     * When `false` (default), the block is a single `GAZE DIRECTION:`
     * line for the whole image — the canonical single/carousel/batch
     * case.
     */
    beforeAfterSplit?: boolean;
    /**
     * The canvas aspect ratio of the requested image. Used to add a
     * vertical-composition note for 9:16/4:5 (FR-009, edge case) and
     * a horizontal-headroom note for 16:9 so the renderer keeps the
     * gaze within the frame.
     */
    aspectRatio: GazeAspectRatio;
}

/**
 * Build the `GAZE DIRECTION:` block for the IMAGE-rendering prompt
 * (`buildFinalImagePrompt`). Returns `''` for a null directive
 * (Contract B6: caller can emit a single line unconditionally and
 * the absent case produces no line at all).
 *
 * The block always contains:
 *   - The treatment + physical description (Contract B1)
 *   - Identity-is-priority-#1 / gaze is eye-and-head orientation
 *     ONLY (FR-018 — never alter facial features)
 *   - Advisory / natural clause + the forbidden-failure-modes
 *     clause: NEVER stare into empty space, NEVER cross-eyed /
 *     wall-eyed, NEVER robotic "always look at the CTA" (FR-003)
 *   - The composition-defer + aspect-ratio note (FR-009)
 *   - The positive guide-toward-content clause (FR-004): when
 *     natural and not forced, the gaze MAY lead the viewer's eye
 *     toward the CTA or headline
 *
 * In before/after mode (`opts.beforeAfterSplit === true`), the block
 * is split into two clearly labelled halves (BEFORE / AFTER) — the
 * AFTER half always uses the aspirational forward-horizon gaze
 * regardless of the hook (FR-008).
 */
export function buildImagePromptGazeBlock(
    directive: GazeDirective | null,
    opts: BuildImagePromptGazeBlockOptions,
): string {
    if (directive == null) return "";

    const lines: string[] = [];

    if (opts.beforeAfterSplit === true) {
        // Before/after split: BEFORE half = hook-derived gaze, AFTER
        // half = aspirational forward-horizon gaze. Each half gets
        // its own physical description so the renderer can render two
        // visibly different gaze states for the same face.
        const beforeDirective = directive;
        const afterDirective: GazeDirective = {
            source: directive.source,
            sourceId: `${directive.sourceId}::after`,
            ...GAZE_ASPIRATIONAL_DIRECTIVE,
        };
        lines.push(
            `GAZE DIRECTION — BEFORE HALF: ${beforeDirective.treatment.replace(/_/g, " ")}.`,
            `BEFORE physical description: ${beforeDirective.description}.`,
            `GAZE DIRECTION — AFTER HALF: ${afterDirective.treatment.replace(/_/g, " ")}.`,
            `AFTER physical description: ${afterDirective.description}.`,
            "Same face / same person on BOTH halves — only the gaze (and any props) change.",
        );
    } else {
        lines.push(
            `GAZE DIRECTION: ${directive.treatment.replace(/_/g, " ")}.`,
            `Physical description: ${directive.description}.`,
        );
    }

    // Identity priority #1 — gaze is eye-and-head orientation ONLY
    // and must NEVER alter facial features (FR-018). Echoes Phase 28's
    // identity clause verbatim; the renderer is free to adapt the
    // eye/head orientation but must not change bone structure, facial
    // features, or skin texture.
    lines.push(
        "Identity is PRIORITY #1 — gaze direction is eye and head orientation only; do NOT change bone structure, facial features, or skin texture.",
    );

    // Advisory / natural clause + the explicit failure-mode
    // prohibitions (FR-003). The list is literal and non-negotiable:
    // any of these is a known failure mode that has shipped in the
    // past and is now forbidden.
    lines.push(
        "Treat the above as a NATURAL default — not a rigid command. Adapt it to whatever reads most natural for the scene.",
        "NEVER: stare into empty canvas space, produce a cross-eyed / wall-eyed look, point the gaze at nothing meaningful, or behave robotically by always forcing the gaze at the CTA. The gaze must read as a real human's eye contact, not a programmatic arrow.",
    );

    // Positive guide-toward-content clause (FR-004). The block tells
    // the renderer that, when natural and not forced, the gaze MAY
    // lead the viewer's eye toward the CTA or headline — never a
    // mandatory redirect, always an opt-in affordance.
    lines.push(
        "When natural and not forced, the gaze MAY lead the viewer's eye toward the headline or CTA — but it must always feel like a real human's eye contact, never a programmatic redirect.",
    );

    // Composition-defer note + aspect-ratio awareness (FR-009). For
    // vertical (9:16) and tall (4:5) canvases the gaze must stay
    // within the frame; for wide (16:9) it gets horizontal headroom.
    lines.push(
        "Defer to layout composition: the hero must never stare away from the content zone into meaningless empty space.",
        ...getAspectRatioNotes(opts.aspectRatio),
    );

    return lines.join("\n");
}

/**
 * Returns the aspect-ratio-specific guidance line(s) for the gaze
 * block. Pure helper — extracted so it stays unit-testable in
 * isolation.
 */
function getAspectRatioNotes(aspectRatio: GazeAspectRatio): string[] {
    switch (aspectRatio) {
        case "9:16":
            return [
                "VERTICAL COMPOSITION: This is a 9:16 story. Keep the gaze within the frame — never off the side edge into empty vertical margin. A glance that points off-frame on a vertical canvas reads as a wall-eyed artifact.",
            ];
        case "4:5":
        case "3:4":
            return [
                "TALL COMPOSITION: Respect the vertical stack — keep the gaze within the frame, never off the side edge into empty margin.",
            ];
        case "16:9":
            return [
                "HORIZONTAL COMPOSITION: This is a 16:9 landscape. The hero has horizontal headroom — use it, but the gaze itself should still point toward the content zone, not into the empty wing.",
            ];
        case "4:3":
            return [
                "LANDSCAPE COMPOSITION: Standard 4:3 canvas — the gaze should point toward the content zone, not into the empty wing.",
            ];
        case "1:1":
        default:
            return [
                "SQUARE COMPOSITION: 1:1 canvas — keep the gaze balanced within the frame, never off any edge into empty space.",
            ];
    }
}

// ═══════════════════════════════════════════════════════════
// ONE-HIGHLIGHT CAP (US2 — always-on, hook-independent)
// ═══════════════════════════════════════════════════════════

/**
 * The one-highlight cap. US2: there is exactly one primary visual
 * focal point — the hero — and at most one supporting secondary
 * emphasis that supports the hero or guides the eye toward the CTA.
 * This block is hook-INDEPENDENT and is injected UNCONDITIONALLY for
 * every prompt assembled at `buildFinalImagePrompt` (FR-011, FR-012,
 * Contract D1/D2). No hero-detection gate is required: the Pro Ads
 * AI pipeline is uniformly hero-centric — every generated ad has a
 * hero subject; Phase 28's facial-expression guidance already
 * relies on this and gates only on hook, never on hero presence.
 *
 * The block is a string constant so it can be unit-tested in
 * isolation and the text reads consistently across every prompt.
 */
export const ONE_HIGHLIGHT_BLOCK: string = `VISUAL FOCAL POINT: There is exactly ONE primary visual focal point in this image — the hero. Any other visual emphasis (glow, shimmer, dramatic lighting, sparkle, accent bar) is supporting only: it must EITHER support the hero OR guide the viewer's eye toward the CTA button. It must NEVER compete with the hero for attention, and you must NEVER add multiple simultaneous glowing / sparkling / highlighted elements. Two highlights on a single ad cancel each other out; three or more guarantees the viewer skips the whole image.`;

// ═══════════════════════════════════════════════════════════
// HOOK↔VISUAL MOOD MODULATION (US4 — hook-gated)
// ═══════════════════════════════════════════════════════════

/**
 * Map a `GazeDirective` (already resolved from the cold hook angle
 * or retargeting objection) to a hook↔visual mood-modulation block.
 * Returns `""` for a null directive (FR-015 + Contract C4 — no mood
 * guidance on the no-hook path).
 *
 * The block tells the renderer to MODULATE the visual mood within
 * (and never override) the active art direction and universe
 * aesthetic. The text explicitly subordinates itself to the
 * art direction so the universe's signature aesthetic stays
 * recognizable (FR-015, SC-006).
 *
 * The mapping is by hook family (not by the gaze treatment) so
 * pain hooks read moodier, aspiration/future hooks read brighter
 * and warmer, authority hooks read structured and symmetrical,
 * and urgency hooks read tighter with warm/hot accents. Objection
 * fallbacks use a neutral "confident / approachable" mood.
 */
export function buildHookVisualMoodBlock(directive: GazeDirective | null): string {
    if (directive == null) return "";

    // Map the directive's source / family to a mood shape. We use the
    // sourceId (canonical hook id or objection id) — not the gaze
    // treatment — because mood aligns with the emotional family, not
    // with where the eyes point.
    const id = directive.sourceId;

    let moodShape: string;
    if (directive.source === "hook") {
        switch (id) {
            case "pain":
                moodShape = "moodier palette with dramatic shadows — deeper contrast, slightly cooler undertones, the pain reads in the lighting and the negative space around the hero";
                break;
            case "future_based":
            case "emotional":
                moodShape = "brighter, warmer, and more open composition — softer shadows, golden undertones, a sense of breathing room and forward motion";
                break;
            case "logic":
            case "statistics":
                moodShape = "clean, structured, balanced — symmetrical framing, even lighting, a sense of order and clarity; no drama, no theatrics";
                break;
            case "urgency":
            case "scarcity":
                moodShape = "tighter composition with warm/hot accents — a focused frame, high-contrast edges, warm color temperature that reads as 'the door is closing'";
                break;
            case "logical_authority":
            case "social_proof":
                moodShape = "settled and confident — stable framing, controlled lighting, a sense of earned presence; the hero owns the frame without filling it with noise";
                break;
            case "curiosity":
                moodShape = "intrigued and slightly off-axis — a dynamic but not chaotic composition, a touch of mystery in the lighting that pulls the viewer's eye to where the hero is looking";
                break;
            default:
                moodShape = "confident and approachable — balanced lighting, neutral warm undertones, the hero is present and easy to read";
        }
    } else {
        // objection or fallback — neutral, confident, approachable.
        moodShape = "confident and approachable — balanced lighting, neutral warm undertones, the hero is present and easy to read";
    }

    return `HOOK ↔ VISUAL MOOD: ${moodShape}. This MODULATES WITHIN the active art direction and universe — the universe's signature aesthetic remains the dominant visual language; this guidance only nudges the palette, lighting, and composition to match the hook's emotional family. NEVER override the art direction or universe in favor of these mood notes.`;
}

// ═══════════════════════════════════════════════════════════
// PRICE HIERARCHY (US5 — content-gated, hook-independent)
// ═══════════════════════════════════════════════════════════

/**
 * Shape of the resolved copy fields used by `detectPriceContent` to
 * decide whether the price-hierarchy block should be injected.
 * Mirrors the four text fields `buildFinalImagePrompt` already
 * receives (`hookText`, `subheadText`, `benefitText`, `badges`).
 */
export interface PriceContentInput {
    hookText?: string | null;
    subheadText?: string | null;
    benefitText?: string | null;
    badges?: string | null;
}

/**
 * Returns true iff the assembled copy contains a price / discount /
 * currency signal. The scan covers:
 *   - Currency symbols: $, د.إ, ر.س, SAR, AED, USD, EUR, GBP, $
 *   - Numeric price patterns: digits adjacent to currency words
 *   - Percent / discount markers: Arabic ٪ and Latin %, خصم, offer
 *   - Common discount keywords in both languages
 *
 * MUST return false on a bare year (e.g. "2026") so a price-free
 * coach ad with just a year isn't mistaken for a price-shock ad
 * (Contract C6 / C7 fail condition).
 */
export function detectPriceContent(copy: PriceContentInput): boolean {
    const blob = [
        copy.hookText ?? "",
        copy.subheadText ?? "",
        copy.benefitText ?? "",
        copy.badges ?? "",
    ].join(" \n ");

    if (blob.trim() === "") return false;

    // 1. Currency symbols / words (Arabic + Latin).
    const currencyRe = /(ر\.س|د\.إ|د\.ك|د\.ع|ر\.ع|ر\.ق|SAR|AED|KWD|USD|EUR|GBP|JOD|OMR|QAR|BHD|\$|€|£|¥)/i;
    if (currencyRe.test(blob)) return true;

    // 2. Percent / discount markers (Arabic ٪ + Latin %).
    if (/[٪%]/.test(blob)) return true;

    // 3. Discount keywords (Arabic + English). `\b` only matches Latin
    //    word boundaries in JS (Arabic chars are not in `\w`), so we
    //    test Arabic keywords as plain substrings and Latin keywords
    //    with `\b` to keep both accurate. The Arabic keywords are
    //    specific enough that plain-substring match is safe; the
    //    Latin set is gated by `\b` to avoid false positives on
    //    substrings like "now" inside "knowledge".
    if (/(خصم|تخفيض|سعر|عرض|وفّر|وفورات|وفر)/.test(blob)) return true;
    if (/\b(offer|discount|sale|deal|save|off|was|now)\b/i.test(blob)) return true;

    // 4. Numeric price patterns: a digit cluster immediately followed
    //    by a currency word/symbol (e.g. "199 SAR", "$49", "50 ر.س").
    //    Bare years (e.g. "2026") MUST NOT trigger this pattern because
    //    they are not followed by a currency marker — the currencyRe
    //    above already gates that.
    const priceWithCurrencyRe = /\d+(\.\d+)?\s*(ر\.س|د\.إ|SAR|AED|KWD|USD|EUR|GBP|JOD|OMR|QAR|BHD|\$|€|£|¥)/i;
    if (priceWithCurrencyRe.test(blob)) return true;

    return false;
}

/**
 * Build the price-hierarchy block. Returns a non-empty string
 * whenever `detectPriceContent(...)` returns true. Contract C7: the
 * block states (a) original price smaller + struck-through, (b)
 * discounted price larger + prominent + distinct color, (c) savings
 * highlighted but secondary to the new price.
 */
export function buildPriceHierarchyBlock(): string {
    return `PRICE HIERARCHY (when the ad shows pricing): The ORIGINAL price (if shown) MUST be smaller and rendered struck-through so it reads as a comparison anchor. The DISCOUNTED / NEW price MUST be the largest price element on the design, prominent and rendered in a distinct accent color so it pops off the canvas. Any SAVINGS amount or percent MUST be highlighted, but visually SECONDARY to the discounted price — it is a supporting number, never the headline. The CTA button itself remains a single visually distinct button with strong text-to-background contrast; the price hierarchy lives in the BADGE / OFFER text area, not inside the button.`;
}

// ═══════════════════════════════════════════════════════════
// CTA OUTCOME FRAMING (US3 — copy prompt, both languages)
// ═══════════════════════════════════════════════════════════

/**
 * Advisory outcome-framing guidance for the Gemini copy prompt's
 * CTA/benefit block. Defined here (side-effect-free) so it can be
 * unit-tested in isolation without importing the heavy
 * `generators.ts` module. Imported by `generators.ts` and spliced
 * into the existing CTA/benefit block of the copy-generation prompt
 * (`generators.ts:~2478-2516`), after the benefit-formula section
 * and before output formatting (FR-013, FR-014, Contract G).
 *
 * Contract G notes:
 *   - G1: frame the CTA/benefit around an OUTCOME or benefit, not
 *     just the bare action.
 *   - G2: the guidance is ADVISORY — a direct-action CTA is still
 *     allowed when it reads better.
 *   - G3: keep CTA/benefit short (≈3–5 words) and action-oriented;
 *     length adapts per language.
 *   - G4: Arabic path preserves existing Arabic grammar / flow
 *     rules (no leading و, self-contained phrase) — the guidance
 *     does NOT weaken or override them.
 *   - G5: English path receives the same outcome-framing guidance.
 */
export const CTA_OUTCOME_FRAMING_BLOCK: string = `CTA OUTCOME FRAMING (ADVISORY — both languages):
- The CTA / benefit line should hint at an OUTCOME or benefit the reader gets, not just name the action. "Start your growth journey" / "ابدأ رحلة النمو" reads as an outcome; "Subscribe now" / "اشترك الآن" reads as a bare action.
- This is ADVISORY, not mandatory. When a direct action reads better for the offer (e.g. time-sensitive registration, one-tap sign-up), a direct-action CTA is still the right call.
- Keep the CTA / benefit short (≈3–5 words). Length adapts per language — Arabic allows slightly more for natural phrasing.
- Arabic grammar / flow rules are UNCHANGED: the benefit must still be a grammatically complete phrase that flows directly from the CTA, never starting with a dangling و (waw) or any other conjunction, and never a hanging clause that depends on words not shown on the button.
- English CTAs follow the same outcome-framing guidance — the copy engine may choose "Start your growth journey" over "Join now" when an outcome framing is natural for the offer.
- The copy-fidelity contract, banned-benefit-pattern rules, and Phase 24B optional copy fields are all UNCHANGED. This guidance only nudges the CTA / benefit toward outcome framing when natural.`;
