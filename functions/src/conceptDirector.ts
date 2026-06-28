// functions/src/conceptDirector.ts — Phase 20 Concept Director module
// Pure module (no Firebase / Gemini SDK imports — see Contract A10):
//
//   1. `buildDirectorPrompt(input)` — emits a structured JSON-only prompt
//      that authors one `ConceptBrief` per call. Free-text fields in the
//      user's language; closed enum labels in canonical English (FR-004).
//   2. `parseDirectorResponse(raw)` — JSON-parse + defensive trim,
//      returns either a `ConceptBrief` or a typed
//      `ConceptDirectorFallback`. NEVER throws.
//   3. `validateBrief(brief, expectedSubStyle)` — enforces the hard
//      constraints from data-model.md §3 (counts, enum membership,
//      `inheritedFrom` invariant, non-empty varianceAxes tokens).
//   4. `directConcept(input, callModel, timeoutMs?)` — orchestrates one
//      brief attempt with a 15s timeout and a typed fallback on every
//      failure mode (api_error / timeout_15s / json_parse_failed /
//      schema_invalid / constraint_violation). NEVER throws.
//   5. `buildConceptEnrichmentBlock(results)` — emits, for each of 3
//      slots, either a labeled `CONCEPT N` directive (metaphor /
//      headline architecture / layout / forbidden props / hero
//      gaze+pose / restraint) for an accepted brief, or a "use existing
//      logic for CONCEPT N" marker for a fallback slot. Hero-less
//      briefs and fallback slots omit the hero gaze / pose lines
//      (G1 — there is no hero to direct).
//
// Mirrors the Phase 19 `gazeMap.ts` / Phase 28 `expressionMap.ts`
// pattern: pure, side-effect-free, no module-level side effects, all
// effects enter through `callModel`. Imported by `index.ts` and
// consumed via the per-generation `conceptDirectorBriefs?` parameter
// on `generators.generateConcepts(...)`.

// ═══════════════════════════════════════════════════════════
// ENUMS (canonical English — FR-004)
// ═══════════════════════════════════════════════════════════

/**
 * Three variance modes. Only `balanced` is exercised live this build
 * (A2, D6 / data-model.md §1). The other two are defined for
 * forward-compatibility — a future toggle (deferred 20.F) can drive
 * them without re-architecting.
 */
export type VarianceMode = "conservative" | "balanced" | "aggressive";

/**
 * Eight headline architectures (data-model.md §1). The validator and
 * the prompt-assembly layer switch on these — keeping them in a fixed
 * vocabulary is what lets the Stage compare three siblings
 * deterministically (D6).
 */
export type HeadlineArchitecture =
    | "manifesto"
    | "editorial"
    | "annotated"
    | "dual_state"
    | "oversized_question"
    | "numerical_anchor"
    | "ellipsis_tease"
    | "stacked_weight";

/**
 * Seven layout archetypes (data-model.md §1). `buildConceptEnrichmentBlock`
 * echoes this label into the [VISUAL ARCHITECT V5.0] prompt so the
 * existing render call can specialize the layout for each concept.
 */
export type LayoutArchetype =
    | "asymmetric_void"
    | "central_headroom"
    | "central_baseweight"
    | "environmental_canvas"
    | "split_dual_state"
    | "typography_dominant"
    | "editorial_columns";

/**
 * Five hero gaze directions. Note: this is the Director's BRIEF-LEVEL
 * gaze field (for variety across the three siblings). It is distinct
 * from and does NOT modify the Phase 19 `gazeMap.ts` image-prompt
 * gaze block — that block stays untouched per spec "What NOT to
 * change".
 */
export type HeroGazeDirection =
    | "toward_headline"
    | "toward_cta"
    | "direct_camera"
    | "off_frame_intentional"
    | "downward_introspective";

export type HeroPresence = "present" | "absent" | "partial" | "multiple_subjects";
export type BackgroundComplexity = "minimal" | "moderate" | "rich";
export type LogoTreatment = "composite_post" | "absent_this_concept" | "corner_subtle";

// ═══════════════════════════════════════════════════════════
// INPUTS / OUTPUTS
// ═══════════════════════════════════════════════════════════

/**
 * Per-concept input to the Director (data-model.md §2). Built by the
 * orchestrator (`index.ts`) and passed into `directConcept(...)`. The
 * model call enters as the injected `callModel` argument so this
 * module stays pure (Contract A10).
 */
export interface ConceptDirectorInput {
    /**
     * Pass-through ad brief fields. `hookText`, `hookType`, `hookAngle`,
     * `adTone`, `copywritingStrategy`, `audience`, offer fields. The
     * Director uses these to ground the metaphor (FR-003) and headline
     * architecture but does NOT generate the four copy fields itself —
     * those remain on the existing copy path (out of scope this build).
     */
    brief: Record<string, unknown>;

    /**
     * Inviolable user choices (FR-008). The Director specializes WITHIN
     * these — never swaps them. `subStyle` is required and is echoed
     * verbatim into `ConceptBrief.subStyleSpecialization.inheritedFrom`.
     */
    inviolable: {
        subStyle: string;
        creativeMode: string;
        language: string;
        aspectRatio: string;
        brand?: { primary?: string; secondary?: string } | null;
    };

    /** Which sibling this is. 0..2 (FR-005). */
    conceptIndex: 0 | 1 | 2;

    /**
     * The 0..N-1 already-produced briefs (their `varianceAxes` tokens
     * are appended to the avoid-list in the prompt so this concept
     * deliberately differs). Empty for index 0. A FALLBACK entry in the
     * array exposes no `varianceAxes` — the Director just notes that no
     * sibling token was available for that slot.
     */
    siblingConcepts: ReadonlyArray<ConceptBrief | ConceptDirectorFallback>;

    /** Fixed `"balanced"` this build (A2). */
    varianceMode: VarianceMode;

    /**
     * Extra tokens to avoid. Populated on RETRY from the validator's
     * duplicates (Contract A4 / C4.2). Empty on first pass.
     */
    avoidTokens: {
        metaphor?: string[];
        layout?: string[];
        headline?: string[];
    };

    /**
     * Defaults to `[]` (FR-007). Intentionally unwired this build.
     * Defined here for forward-compatibility — a future creative-memory
     * phase will populate it without re-architecting.
     */
    pastWinningAds: ReadonlyArray<unknown>;

    /**
     * Pass-through placeholder for the Selection Reviewer (deferred).
     * Unused this build. Included so the input shape is complete.
     */
    reviewerFlags?: unknown;
}

/**
 * Director success output (data-model.md §3). Every enum field is
 * within its allowed set; `subStyleSpecialization.inheritedFrom` exactly
 * equals `inviolable.subStyle`; the three `varianceAxes` tokens are
 * non-empty.
 */
export interface ConceptBrief {
    visualMetaphor: {
        description: string;
        keyVisualElement: string;
        emotionalReason: string;
    };
    headlineArchitecture: HeadlineArchitecture;
    highlightCardinality: {
        count: 0 | 1 | 2;
        phrases: string[];
        treatment: string;
    };
    layoutArchetype: LayoutArchetype;
    heroPresence: HeroPresence;
    heroGazeDirection: HeroGazeDirection;
    heroPoseSpecific: string;
    propsAllowed: string[];
    propsForbidden: string[];
    backgroundComplexity: BackgroundComplexity;
    accentBehavior: {
        primaryUse: string;
        secondaryUse: string;
        cardinality: 1 | 2 | 3;
    };
    logoTreatment: LogoTreatment;
    subStyleSpecialization: {
        inheritedFrom: string;
        specializedAs: string;
        keyDeparture: string;
    };
    restraintRules: string[];
    conceptIndex: number;
    varianceAxes: {
        metaphorToken: string;
        layoutToken: string;
        headlineToken: string;
    };
}

/**
 * Director failure signal (data-model.md §4). Consumed downstream as
 * the signal to run existing Visual Architect logic for that ONE
 * concept. The function signature `ConceptBrief | ConceptDirectorFallback`
 * is discriminated on `fallback`.
 */
export interface ConceptDirectorFallback {
    fallback: true;
    /**
     * One of the canonical reason strings. The list is closed so the
     * orchestrator can route / record it deterministically.
     */
    reason:
        | "api_error"
        | "timeout_15s"
        | "json_parse_failed"
        | "schema_invalid"
        | "constraint_violation:propsForbidden_min3"
        | "constraint_violation:restraintRules_min2"
        | "constraint_violation:highlightCardinality_max2"
        | "constraint_violation:subStyle_inheritedFrom_mismatch"
        | "constraint_violation:varianceAxes_empty"
        | "constraint_violation:enum_out_of_set"
        | "constraint_violation:required_field_missing";
}

// ═══════════════════════════════════════════════════════════
// ENUM MEMBERSHIP SETS (used by validateBrief — Contract A6)
// ═══════════════════════════════════════════════════════════

export const HEADLINE_ARCHITECTURES: ReadonlySet<HeadlineArchitecture> = new Set<HeadlineArchitecture>([
    "manifesto",
    "editorial",
    "annotated",
    "dual_state",
    "oversized_question",
    "numerical_anchor",
    "ellipsis_tease",
    "stacked_weight",
]);

export const LAYOUT_ARCHETYPES: ReadonlySet<LayoutArchetype> = new Set<LayoutArchetype>([
    "asymmetric_void",
    "central_headroom",
    "central_baseweight",
    "environmental_canvas",
    "split_dual_state",
    "typography_dominant",
    "editorial_columns",
]);

export const HERO_GAZE_DIRECTIONS: ReadonlySet<HeroGazeDirection> = new Set<HeroGazeDirection>([
    "toward_headline",
    "toward_cta",
    "direct_camera",
    "off_frame_intentional",
    "downward_introspective",
]);

export const HERO_PRESENCES: ReadonlySet<HeroPresence> = new Set<HeroPresence>([
    "present",
    "absent",
    "partial",
    "multiple_subjects",
]);

export const BACKGROUND_COMPLEXITIES: ReadonlySet<BackgroundComplexity> = new Set<BackgroundComplexity>([
    "minimal",
    "moderate",
    "rich",
]);

export const LOGO_TREATMENTS: ReadonlySet<LogoTreatment> = new Set<LogoTreatment>([
    "composite_post",
    "absent_this_concept",
    "corner_subtle",
]);

// ═══════════════════════════════════════════════════════════
// PROMPT BUILDER (Contract A2–A5)
// ═══════════════════════════════════════════════════════════

/**
 * Build the prompt that the Director's `callModel` receives. Pure —
 * takes only the per-concept input, returns the prompt string.
 *
 * The prompt is intentionally written as a small, literal set of
 * declarative sentences (no JSON-template, no `[placeholders]` —
 * brackets are a known literal-copy hazard for Gemini per the repo's
 * project rule). It instructs Gemini to:
 *
 *   1. Author ONE `ConceptBrief` per call (we call 3× sequentially).
 *   2. Use a CONCRETE, DEPICTABLE visual metaphor for
 *      `visualMetaphor.description` — not an abstract idea.
 *   3. Write free-text fields in `input.inviolable.language` and keep
 *      all closed enum category labels in CANONICAL ENGLISH.
 *   4. NEVER override any of `input.inviolable` — specialize WITHIN
 *      the chosen subStyle, and record it exactly in
 *      `subStyleSpecialization.inheritedFrom`.
 *   5. See every prior sibling's `varianceAxes` tokens plus the
 *      `avoidTokens` retry list and DELIBERATELY differ on at least
 *      one of metaphor / layout / headline.
 *   6. Output JSON ONLY — no prose wrapper, no markdown fences, no
 *      commentary. The prompt also forbids brackets/braces inside
 *      text values (same Gemini literal-copy hazard).
 *
 * Returns the full prompt text. The caller passes it to `callModel`.
 */
export function buildDirectorPrompt(input: ConceptDirectorInput): string {
    const language = String(input.inviolable.language || "en");
    const subStyle = stripBrackets(String(input.inviolable.subStyle || ""));
    const creativeMode = stripBrackets(String(input.inviolable.creativeMode || "standard_hero"));
    const aspectRatio = stripBrackets(String(input.inviolable.aspectRatio || "1:1"));
    const brand = input.inviolable.brand;
    const brandLine = brand && (brand.primary || brand.secondary)
        ? `Brand colors are fixed: primary ${stripBrackets(String(brand.primary || "n/a"))}${brand.secondary ? `, secondary ${stripBrackets(String(brand.secondary))}` : ""}. These inform accentBehavior.primaryUse and accentBehavior.secondaryUse but you MUST NOT change them.`
        : "No brand colors specified.";

    // Sibling / avoid list — surfaces tokens that this brief must NOT
    // reuse. A fallback slot in siblingConcepts exposes no tokens, so
    // its index is simply skipped (no false duplicates). Every value is
    // sanitized through stripBrackets so user-derived tokens can never
    // reintroduce `[]` or `{}` into the prompt (Gemini literal-copy
    // hazard per the repo rule).
    const avoidLines: string[] = [];
    for (let i = 0; i < input.siblingConcepts.length; i++) {
        const s = input.siblingConcepts[i];
        if ("fallback" in s && s.fallback) {
            avoidLines.push(`Sibling ${i + 1}: (no brief available — this slot fell back to existing logic).`);
            continue;
        }
        const b = s as ConceptBrief;
        avoidLines.push(
            `Sibling ${i + 1}: metaphorToken=${stripBrackets(String(b.varianceAxes.metaphorToken))}; layoutToken=${stripBrackets(String(b.varianceAxes.layoutToken))}; headlineToken=${stripBrackets(String(b.varianceAxes.headlineToken))}.`,
        );
    }
    const retryAvoidLines: string[] = [];
    if (input.avoidTokens.metaphor?.length) {
        retryAvoidLines.push(`Metaphor tokens to AVOID (retry): ${input.avoidTokens.metaphor.map(stripBrackets).join(", ")}.`);
    }
    if (input.avoidTokens.layout?.length) {
        retryAvoidLines.push(`Layout tokens to AVOID (retry): ${input.avoidTokens.layout.map(stripBrackets).join(", ")}.`);
    }
    if (input.avoidTokens.headline?.length) {
        retryAvoidLines.push(`Headline tokens to AVOID (retry): ${input.avoidTokens.headline.map(stripBrackets).join(", ")}.`);
    }
    const avoidanceBlock = [
        avoidLines.length > 0 ? `Prior siblings (this concept MUST deliberately differ on at least one of metaphor / layout / headline):\n${avoidLines.join("\n")}` : "This is concept 1 of 3 — no prior siblings.",
        retryAvoidLines.length > 0 ? `Retry avoid-list (additional tokens to AVOID on this attempt):\n${retryAvoidLines.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    // The brief context — flat key=value list, no JSON-template
    // (brackets `[]` and `{}` are a known Gemini literal-copy hazard
    // per the repo rule — see `simple literal sentences over structured
    // templates`). The brief is internal model context, so a flat list
    // is enough for Gemini to ground the metaphor and headline
    // architecture. Every line is pre-sanitized through stripBrackets
    // (inside flattenBriefForPrompt) so user-supplied free text cannot
    // reintroduce brackets.
    const briefBlob = flattenBriefForPrompt(input.brief || {});

    return [
        "You are the CONCEPT DIRECTOR for a single ad brief.",
        `This is concept ${input.conceptIndex + 1} of 3 for the same hook. Variance mode is ${input.varianceMode}.`,
        "",
        "AD BRIEF (use these to ground the metaphor and headline architecture):",
        briefBlob,
        "",
        "INVIOLABLE USER CHOICES (NEVER override, NEVER substitute):",
        `subStyle=${subStyle}. creativeMode=${creativeMode}. language=${language}. aspectRatio=${aspectRatio}.`,
        brandLine,
        "",
        "OUTPUT — ONE CONCEPT BRIEF, JSON ONLY:",
        `Emit a single JSON object with EXACTLY these top-level keys (no extra keys, no missing keys):`,
        `visualMetaphor (object with description, keyVisualElement, emotionalReason), headlineArchitecture (one of: manifesto, editorial, annotated, dual_state, oversized_question, numerical_anchor, ellipsis_tease, stacked_weight), highlightCardinality (object with count 0..2, phrases array length equal to count, treatment string), layoutArchetype (one of: asymmetric_void, central_headroom, central_baseweight, environmental_canvas, split_dual_state, typography_dominant, editorial_columns), heroPresence (one of: present, absent, partial, multiple_subjects), heroGazeDirection (one of: toward_headline, toward_cta, direct_camera, off_frame_intentional, downward_introspective), heroPoseSpecific (free text), propsAllowed (array of strings), propsForbidden (array of strings, length at least 3), backgroundComplexity (one of: minimal, moderate, rich), accentBehavior (object with primaryUse, secondaryUse, cardinality 1..3), logoTreatment (one of: composite_post, absent_this_concept, corner_subtle), subStyleSpecialization (object with inheritedFrom — MUST EXACTLY EQUAL the user subStyle, specializedAs free text, keyDeparture free text), restraintRules (array of strings, length at least 2), conceptIndex (number, equals this concept index 0..2), varianceAxes (object with metaphorToken, layoutToken, headlineToken — all three short non-empty canonical tokens).`,
        "",
        "CONCRETE-METAPHOR RULE:",
        `visualMetaphor.description MUST be a concrete, depictable image — a thing a camera could photograph. Bad: an abstract concept like 'media is dying'. Good: a folded newspaper left on a subway seat. The reader should be able to draw it.`,
        "",
        "LANGUAGE SPLIT:",
        `Free-text fields (visualMetaphor.description, visualMetaphor.keyVisualElement, visualMetaphor.emotionalReason, heroPoseSpecific, restraintRules, propsAllowed, propsForbidden, accentBehavior.primaryUse, accentBehavior.secondaryUse, subStyleSpecialization.specializedAs, subStyleSpecialization.keyDeparture, highlightCardinality.phrases, highlightCardinality.treatment) are written in ${language}.`,
        `Closed enum category labels (headlineArchitecture, layoutArchetype, heroGazeDirection, heroPresence, backgroundComplexity, logoTreatment) are emitted as canonical English tokens regardless of ${language}.`,
        "",
        "INVIOLABLE SUBSTYLE RULE:",
        `subStyleSpecialization.inheritedFrom MUST be the EXACT string "${subStyle}" — character-for-character. Do NOT capitalize it, swap it, or translate it. The Director specializes WITHIN this subStyle; it does not replace it.`,
        "",
        "PROHIBITION RULE:",
        "Do NOT use square brackets or curly braces inside any free-text value. Do NOT wrap the JSON in a code fence. Do NOT add commentary before or after the JSON object. The response must be parseable by a strict JSON parser on the first attempt.",
        "",
        "SIBLING / AVOIDANCE:",
        avoidanceBlock,
        "",
        "VARIANCE TARGET:",
        `Make this concept visibly distinct from its siblings on at least one of: metaphorToken, layoutToken, headlineToken. The validator will compare your three tokens against the prior siblings and may ask you to redo this concept if they collide.`,
        "",
        "OUTPUT JSON OBJECT NOW.",
    ].join("\n");
}

// ═══════════════════════════════════════════════════════════
// PARSER + VALIDATOR (Contract A6 / data-model §3)
// ═══════════════════════════════════════════════════════════

/**
 * Strict JSON parse with a defensive fall-back: any error → typed
 * `ConceptDirectorFallback`. NEVER throws.
 */
function safeJsonParse(raw: string): { ok: true; value: unknown } | { ok: false; reason: "json_parse_failed" } {
    if (typeof raw !== "string" || raw.trim() === "") {
        return { ok: false, reason: "json_parse_failed" };
    }
    // Strip code fences defensively — Gemini sometimes adds them even
    // when instructed not to.
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    }
    try {
        return { ok: true, value: JSON.parse(cleaned) };
    } catch {
        return { ok: false, reason: "json_parse_failed" };
    }
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return NaN;
}

/**
 * Parse the raw model output into either a `ConceptBrief` or a typed
 * fallback. Defensive against every failure mode:
 *   - non-string / empty input    → fallback `json_parse_failed`
 *   - JSON parse failure          → fallback `json_parse_failed`
 *   - top-level type / missing    → fallback `schema_invalid`
 *   - hard-constraint violation   → fallback `constraint_violation:*`
 *
 * NEVER throws. The orchestrator can call this inside its own
 * try/catch and the only way it ever sees an exception is if the JS
 * runtime itself is broken.
 */
export function parseDirectorResponse(raw: string): ConceptBrief | ConceptDirectorFallback {
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) return { fallback: true, reason: parsed.reason };
    if (typeof parsed.value !== "object" || parsed.value === null) {
        return { fallback: true, reason: "schema_invalid" };
    }
    const obj = parsed.value as Record<string, unknown>;
    // We do NOT call validateBrief here — the orchestrator calls it
    // explicitly so it can pass the expected subStyle. We do, however,
    // do a light shape-coercion pass to coerce JSON-friendly defaults
    // (arrays → array, numbers → number) so the downstream
    // `validateBrief` only sees structural errors. Missing required
    // keys still surface as `schema_invalid`.
    const required = [
        "visualMetaphor",
        "headlineArchitecture",
        "highlightCardinality",
        "layoutArchetype",
        "heroPresence",
        "heroGazeDirection",
        "heroPoseSpecific",
        "propsAllowed",
        "propsForbidden",
        "backgroundComplexity",
        "accentBehavior",
        "logoTreatment",
        "subStyleSpecialization",
        "restraintRules",
        "conceptIndex",
        "varianceAxes",
    ];
    for (const key of required) {
        if (!(key in obj)) return { fallback: true, reason: "schema_invalid" };
    }
    return obj as unknown as ConceptBrief;
}

/**
 * Validate a `ConceptBrief` against the hard constraints from
 * `data-model.md §3`. Returns `{ ok, reason? }` — `ok: false` always
 * carries a canonical reason string the orchestrator can record in
 * the trace and the failed-slot fallback.
 *
 * Constraints checked (Contract A6):
 *   - highlightCardinality.count <= 2
 *   - propsForbidden.length >= 3
 *   - restraintRules.length >= 2
 *   - subStyleSpecialization.inheritedFrom === expectedSubStyle
 *   - all enum fields within their allowed sets
 *   - varianceAxes: all three tokens present and non-empty (normalized)
 *   - highlightCardinality.phrases.length === highlightCardinality.count
 *   - accentBehavior.cardinality 1..3
 *   - conceptIndex is a finite number 0..2
 *
 * NEVER throws.
 */
export function validateBrief(brief: unknown, expectedSubStyle: string): { ok: true } | { ok: false; reason: ConceptDirectorFallback["reason"] } {
    if (typeof brief !== "object" || brief === null) {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    const b = brief as Partial<ConceptBrief>;

    // Required nested leaf fields. Each leaf is checked explicitly so a
    // model that emits a top-level key with an empty / missing nested
    // value cannot slip past as a "valid" brief. Without these checks
    // a brief like `{visualMetaphor: {}}` would pass the top-level key
    // gate but produce a useless enrichment block downstream.
    if (!b.visualMetaphor || typeof b.visualMetaphor !== "object") {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    const vm = b.visualMetaphor as Record<string, unknown>;
    if (
        typeof vm.description !== "string" || normalizeWhitespace(vm.description) === "" ||
        typeof vm.keyVisualElement !== "string" || normalizeWhitespace(vm.keyVisualElement) === "" ||
        typeof vm.emotionalReason !== "string" || normalizeWhitespace(vm.emotionalReason) === ""
    ) {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    if (typeof b.headlineArchitecture !== "string" || !HEADLINE_ARCHITECTURES.has(b.headlineArchitecture as HeadlineArchitecture)) {
        return { ok: false, reason: "constraint_violation:enum_out_of_set" };
    }
    if (typeof b.layoutArchetype !== "string" || !LAYOUT_ARCHETYPES.has(b.layoutArchetype as LayoutArchetype)) {
        return { ok: false, reason: "constraint_violation:enum_out_of_set" };
    }
    if (typeof b.heroGazeDirection !== "string" || !HERO_GAZE_DIRECTIONS.has(b.heroGazeDirection as HeroGazeDirection)) {
        return { ok: false, reason: "constraint_violation:enum_out_of_set" };
    }
    if (typeof b.heroPresence !== "string" || !HERO_PRESENCES.has(b.heroPresence as HeroPresence)) {
        return { ok: false, reason: "constraint_violation:enum_out_of_set" };
    }
    if (typeof b.backgroundComplexity !== "string" || !BACKGROUND_COMPLEXITIES.has(b.backgroundComplexity as BackgroundComplexity)) {
        return { ok: false, reason: "constraint_violation:enum_out_of_set" };
    }
    if (typeof b.logoTreatment !== "string" || !LOGO_TREATMENTS.has(b.logoTreatment as LogoTreatment)) {
        return { ok: false, reason: "constraint_violation:enum_out_of_set" };
    }

    // highlightCardinality.
    const hc = b.highlightCardinality;
    if (!hc || typeof hc !== "object") {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    if (typeof hc.count !== "number" || hc.count < 0 || hc.count > 2) {
        return { ok: false, reason: "constraint_violation:highlightCardinality_max2" };
    }
    if (!Array.isArray(hc.phrases) || hc.phrases.length !== hc.count) {
        return { ok: false, reason: "constraint_violation:highlightCardinality_max2" };
    }
    if (typeof hc.treatment !== "string" || normalizeWhitespace(hc.treatment) === "") {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }

    // heroPoseSpecific — must be a non-empty string ONLY when a hero
    // is present. Hero-absent briefs (text-only, value-stack,
    // ticket-only, device/book mockup, multi-subject-without-an-individual)
    // legitimately have no hero pose to describe, so an empty string
    // is the correct value there. Without this carve-out, every
    // hero-less concept would falsely trip required_field_missing.
    if (b.heroPresence !== "absent") {
        if (typeof b.heroPoseSpecific !== "string" || normalizeWhitespace(b.heroPoseSpecific) === "") {
            return { ok: false, reason: "constraint_violation:required_field_missing" };
        }
    } else if (typeof b.heroPoseSpecific !== "string") {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }

    // propsAllowed must be an array (may be empty).
    if (!Array.isArray(b.propsAllowed)) {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }

    // propsForbidden.
    if (!Array.isArray(b.propsForbidden) || b.propsForbidden.length < 3) {
        return { ok: false, reason: "constraint_violation:propsForbidden_min3" };
    }

    // restraintRules.
    if (!Array.isArray(b.restraintRules) || b.restraintRules.length < 2) {
        return { ok: false, reason: "constraint_violation:restraintRules_min2" };
    }

    // subStyleSpecialization.inheritedFrom must equal expected.
    if (!b.subStyleSpecialization || typeof b.subStyleSpecialization !== "object") {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    const ss = b.subStyleSpecialization as Record<string, unknown>;
    if (
        typeof ss.specializedAs !== "string" || normalizeWhitespace(ss.specializedAs) === "" ||
        typeof ss.keyDeparture !== "string" || normalizeWhitespace(ss.keyDeparture) === ""
    ) {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    if (ss.inheritedFrom !== expectedSubStyle) {
        return { ok: false, reason: "constraint_violation:subStyle_inheritedFrom_mismatch" };
    }

    // varianceAxes tokens — all three non-empty after normalization.
    if (!b.varianceAxes || typeof b.varianceAxes !== "object") {
        return { ok: false, reason: "constraint_violation:varianceAxes_empty" };
    }
    const va = b.varianceAxes;
    if (
        typeof va.metaphorToken !== "string" || normalizeWhitespace(va.metaphorToken) === "" ||
        typeof va.layoutToken !== "string" || normalizeWhitespace(va.layoutToken) === "" ||
        typeof va.headlineToken !== "string" || normalizeWhitespace(va.headlineToken) === ""
    ) {
        return { ok: false, reason: "constraint_violation:varianceAxes_empty" };
    }

    // accentBehavior.cardinality 1..3.
    if (!b.accentBehavior || typeof b.accentBehavior !== "object") {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    const ab = b.accentBehavior as Record<string, unknown>;
    if (
        typeof ab.primaryUse !== "string" || normalizeWhitespace(ab.primaryUse) === "" ||
        typeof ab.secondaryUse !== "string" || normalizeWhitespace(ab.secondaryUse) === ""
    ) {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }
    if (typeof ab.cardinality !== "number" || ab.cardinality < 1 || ab.cardinality > 3) {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }

    // conceptIndex must be 0..2.
    if (typeof b.conceptIndex !== "number" || b.conceptIndex < 0 || b.conceptIndex > 2) {
        return { ok: false, reason: "constraint_violation:required_field_missing" };
    }

    return { ok: true };
}

function normalizeWhitespace(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

/**
 * Strip every `[]` and `{}` character from a string before it lands in
 * the prompt. Brackets are a known Gemini literal-copy hazard — the
 * repo rule (`GEMINI_BRACKET_RULE`) forbids emitting bracket characters
 * anywhere in the prompt text because Gemini tends to copy them
 * verbatim into its output JSON, breaking strict-mode parsers. We
 * apply this to EVERY interpolated value (subStyle, brand color,
 * sibling tokens, avoid-list tokens, brief values) so even a user who
 * picks `subStyle = "ugly_ad [test]"` cannot reintroduce brackets.
 */
function stripBrackets(value: string): string {
    return value
        .replace(/\[/g, "")
        .replace(/\]/g, "")
        .replace(/\{/g, "")
        .replace(/\}/g, "");
}

/**
 * Flatten the brief object into a single multi-line `key = value`
 * blob. We deliberately avoid JSON.stringify (which emits brackets)
 * because brackets are a known Gemini literal-copy hazard — the rule
 * is `do not use brackets or braces in prompt text`. The brief is
 * internal context, so a flat key=value list is sufficient for Gemini
 * to ground the metaphor + headline architecture. Every value is run
 * through `stripBrackets` so even a deep user-supplied payload cannot
 * sneak brackets back into the final prompt.
 */
function flattenBriefForPrompt(brief: Record<string, unknown>, prefix = ""): string {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(brief)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v === null || v === undefined) continue;
        if (typeof v === "object" && !Array.isArray(v)) {
            const nested = flattenBriefForPrompt(v as Record<string, unknown>, key);
            if (nested) lines.push(nested);
            continue;
        }
        if (Array.isArray(v)) {
            // Render array elements as a bracketed-free key=value line.
            // Each element is flattened to its own line under the parent
            // key so JSON.stringify is never used (which would emit `{}`).
            const subLines: string[] = [];
            v.forEach((item, idx) => {
                if (item === null || item === undefined) return;
                if (typeof item === "object" && !Array.isArray(item)) {
                    const flat = flattenBriefForPrompt(item as Record<string, unknown>, `${key}.${idx}`);
                    if (flat) subLines.push(flat);
                } else {
                    subLines.push(`${key}.${idx} = ${stripBrackets(String(item))}`);
                }
            });
            const joined = subLines.join("\n");
            if (joined) lines.push(joined);
            continue;
        }
        lines.push(`${key} = ${stripBrackets(typeof v === "string" ? v : String(v))}`);
    }
    return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════
// ORCHESTRATED ENTRY: directConcept (Contract A1 / A7 / A8)
// ═══════════════════════════════════════════════════════════

/**
 * Single-concept orchestration: build prompt → callModel → parse →
 * validate. NEVER throws. Returns either a `ConceptBrief` or a typed
 * `ConceptDirectorFallback` with a canonical reason:
 *   - `api_error`           → callModel rejected
 *   - `timeout_15s`         → exceeded `timeoutMs` (default 15000)
 *   - `json_parse_failed`   → unparseable / empty model output
 *   - `schema_invalid`      → JSON parsed but missing required fields
 *   - `constraint_violation:*` → validateBrief returned ok: false
 */
export async function directConcept(
    input: ConceptDirectorInput,
    callModel: (prompt: string) => Promise<string>,
    timeoutMs: number = 15000,
): Promise<ConceptBrief | ConceptDirectorFallback> {
    try {
        const prompt = buildDirectorPrompt(input);
        const raw = await raceWithTimeout(callModel(prompt), timeoutMs);
        const parsed = parseDirectorResponse(raw);
        if ("fallback" in parsed && parsed.fallback) {
            return parsed;
        }
        const v = validateBrief(parsed, String(input.inviolable.subStyle || ""));
        if (!v.ok) return { fallback: true, reason: v.reason };
        return parsed as ConceptBrief;
    } catch (err: unknown) {
        // Distinguish timeout from a generic api_error. The race helper
        // throws a sentinel error with `.conceptDirectorTimeout = true`.
        const anyErr = err as { conceptDirectorTimeout?: boolean } | null;
        if (anyErr && anyErr.conceptDirectorTimeout === true) {
            return { fallback: true, reason: "timeout_15s" };
        }
        return { fallback: true, reason: "api_error" };
    }
}

/**
 * Race `callModel(prompt)` against `timeoutMs`. On timeout, rejects
 * with a sentinel error (`conceptDirectorTimeout: true`) so the
 * caller can distinguish from a generic API error.
 */
function raceWithTimeout(callModelPromise: Promise<string>, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            const err = new Error("conceptDirector_timeout");
            (err as Error & { conceptDirectorTimeout?: boolean }).conceptDirectorTimeout = true;
            reject(err);
        }, timeoutMs);
        callModelPromise.then(
            (v) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(v);
            },
            (e) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(e);
            },
        );
    });
}

// ═══════════════════════════════════════════════════════════
// ENRICHMENT BLOCK BUILDER (Contract A9)
// ═══════════════════════════════════════════════════════════

/**
 * Build the three `CONCEPT N` directives that the existing
 * `[VISUAL ARCHITECT V5.0]` prompt consults so each of the three
 * sibling concept cards diverges on metaphor / headline / layout /
 * forbidden props / hero gaze+pose. For an accepted brief, emits a
 * labeled directive. For a fallback slot, emits a "use existing
 * logic for CONCEPT N" marker (Contract A9) so the downstream
 * pipeline runs today's logic for that slot alone.
 *
 * Hero-less case (G1): if a brief's `heroPresence` is `absent`, the
 * slot deliberately omits the hero gaze + hero pose lines — there is
 * no hero to direct, and emitting a gaze / pose line for a hero-less
 * concept would fight the hero-less mode. A fallback slot is
 * treated identically (also omits gaze / pose).
 */
export function buildConceptEnrichmentBlock(results: ReadonlyArray<ConceptBrief | ConceptDirectorFallback>): string {
    const slots: string[] = [];
    for (let i = 0; i < 3; i++) {
        const slot = results[i];
        const conceptNumber = i + 1;
        if (!slot || ("fallback" in slot && slot.fallback)) {
            slots.push(`CONCEPT ${conceptNumber}: use existing logic for this concept (Director unavailable — fell back to existing generation).`);
            continue;
        }
        const b = slot as ConceptBrief;
        const lines: string[] = [];
        lines.push(`CONCEPT ${conceptNumber} DIRECTION (Phase 20 Concept Director — specialize WITHIN the user subStyle; never override inviolable choices):`);
        // visualMetaphor
        lines.push(`- Visual metaphor: ${b.visualMetaphor.description} (key visual element: ${b.visualMetaphor.keyVisualElement}; emotional reason: ${b.visualMetaphor.emotionalReason}).`);
        // headline architecture
        lines.push(`- Headline architecture: ${b.headlineArchitecture}. Treat this as the SHAPE the headline must take for concept ${conceptNumber}.`);
        // layout archetype
        lines.push(`- Layout archetype: ${b.layoutArchetype}. Use this composition shape — do not duplicate the layout of the other concepts.`);
        // forbidden props
        if (Array.isArray(b.propsForbidden) && b.propsForbidden.length > 0) {
            lines.push(`- Forbidden props for this concept: ${b.propsForbidden.join(", ")}.`);
        }
        // hero gaze + pose — only when a hero is present
        if (b.heroPresence && b.heroPresence !== "absent") {
            lines.push(`- Hero gaze direction: ${b.heroGazeDirection}.`);
            if (typeof b.heroPoseSpecific === "string" && b.heroPoseSpecific.trim() !== "") {
                lines.push(`- Hero pose: ${b.heroPoseSpecific}.`);
            }
        }
        // restraint rules
        if (Array.isArray(b.restraintRules) && b.restraintRules.length > 0) {
            lines.push(`- Restraint rules: ${b.restraintRules.join(" | ")}.`);
        }
        slots.push(lines.join("\n"));
    }
    return slots.join("\n\n");
}

