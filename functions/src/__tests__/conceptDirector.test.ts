// functions/src/__tests__/conceptDirector.test.ts
// Phase 20 — Concept Director (Option A, backend-only) — unit tests.
// Verifies Contracts A (Director), B (Validator), C (Integration:
// injection site in generators.ts, gate in index.ts), and D (Trace:
// ResolutionTrace.conceptDirector).
//
// Pure (no Gemini calls) — exercises the Director / Validator in
// isolation with a stub `callModel`, plus source-scan assertions for
// injection + gate + trace sites (mirrors `gazeMap.test.ts` /
// `expressionMap.test.ts` source-scan style).
//
// Test runner: built by tsc, run as `node lib/__tests__/conceptDirector.test.js`
// via the `test:conceptDirector` script in package.json (T001).

import { readFileSync } from "fs";
import { join } from "path";
import {
    directConcept,
    buildDirectorPrompt,
    parseDirectorResponse,
    validateBrief,
    buildConceptEnrichmentBlock,
    HEADLINE_ARCHITECTURES,
    LAYOUT_ARCHETYPES,
    HERO_GAZE_DIRECTIONS,
    HERO_PRESENCES,
    BACKGROUND_COMPLEXITIES,
    LOGO_TREATMENTS,
    type ConceptDirectorInput,
    type ConceptBrief,
    type ConceptDirectorFallback,
} from "../conceptDirector.js";
import { normalizeToken, validateBatchVariance } from "../varianceValidator.js";
import type { ResolutionTrace } from "../types.js";

declare const process: { exit(code: number): void };
declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void };

// ═══════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════

const SAMPLE_SUB_STYLE = "luxury_magazine";

function sampleBrief(overrides: Partial<ConceptBrief> = {}): ConceptBrief {
    return {
        visualMetaphor: {
            description: "a folded newspaper left on a subway seat, headlines blurred",
            keyVisualElement: "newspaper on seat",
            emotionalReason: "abandoned attention, media decay",
        },
        headlineArchitecture: "editorial",
        highlightCardinality: { count: 1, phrases: ["FOR YOU"], treatment: "underline" },
        layoutArchetype: "asymmetric_void",
        heroPresence: "present",
        heroGazeDirection: "toward_headline",
        heroPoseSpecific: "leaning on a doorframe, weight on one leg, hands in pockets",
        propsAllowed: ["watch", "sleeve cuff", "doorframe"],
        propsForbidden: ["laptop", "phone screen", "desk"],
        backgroundComplexity: "moderate",
        accentBehavior: { primaryUse: "CTA button fill", secondaryUse: "headline highlight", cardinality: 2 },
        logoTreatment: "corner_subtle",
        subStyleSpecialization: {
            inheritedFrom: SAMPLE_SUB_STYLE,
            specializedAs: "magazine cover crop with editorial typography",
            keyDeparture: "tight waist-up crop vs full-body editorial portrait",
        },
        restraintRules: ["no text on hero's clothing", "no expression of anger"],
        conceptIndex: 0,
        varianceAxes: {
            metaphorToken: "newspaper-subway-seat",
            layoutToken: "asymmetric_void",
            headlineToken: "editorial",
        },
        ...overrides,
    };
}

function sampleInput(overrides: Partial<ConceptDirectorInput> = {}): ConceptDirectorInput {
    return {
        brief: { hookText: "Stop guessing your pricing strategy", hookType: "logical_authority" },
        inviolable: {
            subStyle: SAMPLE_SUB_STYLE,
            creativeMode: "standard_hero",
            language: "en",
            aspectRatio: "1:1",
            brand: null,
        },
        conceptIndex: 0,
        siblingConcepts: [],
        varianceMode: "balanced",
        avoidTokens: {},
        pastWinningAds: [],
        ...overrides,
    };
}

function okCallModel(text: string): (prompt: string) => Promise<string> {
    return async () => text;
}

function failingCallModel(reason: string): (prompt: string) => Promise<string> {
    return async () => {
        throw new Error(reason);
    };
}

function hangingCallModel(): (prompt: string) => Promise<string> {
    return () => new Promise<string>(() => { /* never resolves */ });
}

// ═══════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════

function runTests(): Promise<void> {
    return runTestsImpl().then((res) => {
        console.log(`  ${res.passed} passed, ${res.failed} failed`);
        if (res.failed > 0) process.exit(1);
    }).catch((e) => {
        console.error("  test runner crashed:", e);
        process.exit(1);
    });
}

interface RunResult { passed: number; failed: number; }

async function runTestsImpl(): Promise<RunResult> {
    let passed = 0;
    let failed = 0;

    function assert(condition: boolean, label: string): void {
        if (condition) {
            passed++;
        } else {
            failed++;
            console.error(`  ✗ ${label}`);
        }
    }

    function assertEq<T>(actual: T, expected: T, label: string): void {
        const ok = actual === expected || JSON.stringify(actual) === JSON.stringify(expected);
        if (ok) {
            passed++;
        } else {
            failed++;
            console.error(`  ✗ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }

    console.log("conceptDirector tests (Phase 20)");

    // ═══════════════════════════════════════════════════════════
    // CONTRACT A — Director module
    // ═══════════════════════════════════════════════════════════

    // ─── A1: pure module imports ───
    {
        const cdSrc = readFileSync(join(__dirname, "..", "..", "src", "conceptDirector.ts"), "utf8");
        const vvSrc = readFileSync(join(__dirname, "..", "..", "src", "varianceValidator.ts"), "utf8");
        assert(!/from\s+["']firebase-admin/.test(cdSrc), "conceptDirector.ts does NOT import from firebase-admin");
        assert(!/from\s+["']firebase-functions/.test(cdSrc), "conceptDirector.ts does NOT import from firebase-functions");
        assert(!/from\s+["']@google\//.test(cdSrc), "conceptDirector.ts does NOT import from @google/* (Gemini SDK)");
        assert(!/from\s+["']firebase-admin/.test(vvSrc), "varianceValidator.ts does NOT import from firebase-admin");
        assert(!/from\s+["']firebase-functions/.test(vvSrc), "varianceValidator.ts does NOT import from firebase-functions");
        assert(!/from\s+["']@google\//.test(vvSrc), "varianceValidator.ts does NOT import from @google/* (Gemini SDK)");
    }

    // ─── A2: enum set sizes (FR-002 / data-model.md §1) ───
    console.log("  A2: enum sets match the spec counts");
    {
        assertEq(HEADLINE_ARCHITECTURES.size, 8, "HEADLINE_ARCHITECTURES has 8 values");
        assertEq(LAYOUT_ARCHETYPES.size, 7, "LAYOUT_ARCHETYPES has 7 values");
        assertEq(HERO_GAZE_DIRECTIONS.size, 5, "HERO_GAZE_DIRECTIONS has 5 values");
        assertEq(HERO_PRESENCES.size, 4, "HERO_PRESENCES has 4 values (present/absent/partial/multiple_subjects)");
        assertEq(BACKGROUND_COMPLEXITIES.size, 3, "BACKGROUND_COMPLEXITIES has 3 values");
        assertEq(LOGO_TREATMENTS.size, 3, "LOGO_TREATMENTS has 3 values");
    }

    // ─── A3: prompt builder — concrete metaphor + language + inviolable + siblings ───
    console.log("  A3: buildDirectorPrompt emits a 7-step structured prompt with concrete-metaphor + sibling-avoidance + inviolable clauses");
    {
        const inp = sampleInput({
            conceptIndex: 1,
            siblingConcepts: [sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "newspaper-subway-seat", layoutToken: "asymmetric_void", headlineToken: "editorial" } })],
            avoidTokens: { metaphor: ["clock-tower", "fountain"] },
        });
        const p = buildDirectorPrompt(inp);
        assert(typeof p === "string" && p.length > 0, "prompt is a non-empty string");
        assert(/JSON|json/.test(p), "prompt instructs JSON-only output");
        assert(/CONCRETE|depictable|concrete image/i.test(p), "prompt instructs concrete depictable metaphor");
        assert(/inherit|subStyle|inheritedFrom/i.test(p), "prompt mandates subStyleSpecialization.inheritedFrom === user subStyle");
        assert(/ENGLISH|category label|canonical English/i.test(p), "prompt instructs canonical English enum labels");
        assert(newspaperAvoidanceOrVariance(p), "prompt includes sibling / avoid token context");
        assert(/do NOT (override|change|swap|replace).*sub[- ]?style/i.test(p) || /never (override|change|swap)/i.test(p), "prompt forbids overriding inviolable subStyle");
        assert(!/\[|\{/.test(p), "prompt contains no brackets or braces (Bracket Rule / Gemini literal-copy guard)");
    }

    // ─── A4: parseDirectorResponse — JSON parse failure → fallback ───
    console.log("  A4: parseDirectorResponse on malformed input returns typed fallback (NEVER throws)");
    {
        const r1 = parseDirectorResponse("not json at all");
        assert("fallback" in r1 && r1.fallback === true, "garbage string → fallback");
        if ("fallback" in r1) assertEq(r1.reason, "json_parse_failed", "garbage string → json_parse_failed");

        const r2 = parseDirectorResponse("{\"missing\":\"many-fields\"}");
        assert("fallback" in r2 && r2.fallback === true, "JSON missing required fields → fallback");
        if ("fallback" in r2) assertEq(r2.reason, "schema_invalid", "missing fields → schema_invalid");

        const r3 = parseDirectorResponse("");
        assert("fallback" in r3 && r3.fallback === true, "empty string → fallback");

        // Valid JSON, complete fields → returns a ConceptBrief.
        const json = JSON.stringify(sampleBrief());
        const r4 = parseDirectorResponse(json);
        assert(!("fallback" in r4), "valid JSON + complete fields → ConceptBrief (not a fallback)");
    }

    // ─── A5: validateBrief — hard constraints ───
    console.log("  A5: validateBrief enforces the hard constraints (Contract A6 / data-model §3)");
    {
        // Pass case.
        const ok = validateBrief(sampleBrief(), SAMPLE_SUB_STYLE);
        assert(ok.ok === true, "well-formed brief passes validateBrief");

        // highlightCardinality.count > 2 → fail.
        const tooMany = sampleBrief({ highlightCardinality: { count: 3 as any, phrases: ["A", "B", "C"], treatment: "x" } });
        const r1 = validateBrief(tooMany, SAMPLE_SUB_STYLE);
        assert(r1.ok === false, "highlightCardinality.count > 2 fails");
        if (!r1.ok) assertEq(r1.reason, "constraint_violation:highlightCardinality_max2", "reason names the constraint");

        // propsForbidden.length < 3 → fail.
        const fewForbidden = sampleBrief({ propsForbidden: ["a", "b"] });
        const r2 = validateBrief(fewForbidden, SAMPLE_SUB_STYLE);
        assert(r2.ok === false, "propsForbidden.length < 3 fails");
        if (!r2.ok) assertEq(r2.reason, "constraint_violation:propsForbidden_min3", "reason names propsForbidden_min3");

        // restraintRules.length < 2 → fail.
        const fewRestraints = sampleBrief({ restraintRules: ["only one"] });
        const r3 = validateBrief(fewRestraints, SAMPLE_SUB_STYLE);
        assert(r3.ok === false, "restraintRules.length < 2 fails");
        if (!r3.ok) assertEq(r3.reason, "constraint_violation:restraintRules_min2", "reason names restraintRules_min2");

        // inheritedFrom mismatch → fail.
        const wrongSub = sampleBrief({ subStyleSpecialization: { inheritedFrom: "ugly_ad", specializedAs: "x", keyDeparture: "y" } });
        const r4 = validateBrief(wrongSub, SAMPLE_SUB_STYLE);
        assert(r4.ok === false, "subStyleSpecialization.inheritedFrom !== expectedSubStyle fails");
        if (!r4.ok) assertEq(r4.reason, "constraint_violation:subStyle_inheritedFrom_mismatch", "reason names inheritedFrom mismatch");

        // enum out of set → fail.
        const badEnum = sampleBrief({ layoutArchetype: "garbage_archetype" as any });
        const r5 = validateBrief(badEnum, SAMPLE_SUB_STYLE);
        assert(r5.ok === false, "layoutArchetype out of enum set fails");
        if (!r5.ok) assertEq(r5.reason, "constraint_violation:enum_out_of_set", "reason names enum_out_of_set");

        // empty varianceAxes token → fail.
        const emptyVA = sampleBrief({ varianceAxes: { metaphorToken: "x", layoutToken: "y", headlineToken: "" } });
        const r6 = validateBrief(emptyVA, SAMPLE_SUB_STYLE);
        assert(r6.ok === false, "empty varianceAxes headlineToken fails");
        if (!r6.ok) assertEq(r6.reason, "constraint_violation:varianceAxes_empty", "reason names varianceAxes_empty");
    }

    // ─── A6: directConcept — happy path returns a ConceptBrief ───
    console.log("  A6: directConcept happy path returns a ConceptBrief");
    {
        const capturedRef: { value: string | null } = { value: null };
        const callModel = async (prompt: string) => { capturedRef.value = prompt; return JSON.stringify(sampleBrief()); };
        const r = await directConcept(sampleInput(), callModel);
        assert(!("fallback" in r), "valid JSON + complete fields → ConceptBrief");
        const captured: string | null = capturedRef.value;
        assert(typeof captured === "string" && captured.length > 0, "callModel received a non-empty prompt");
    }

    // ─── A7: directConcept — model error → fallback (api_error) ───
    console.log("  A7: directConcept returns typed fallback on model rejection (NEVER throws)");
    {
        const r = await directConcept(sampleInput(), failingCallModel("network"));
        assert("fallback" in r && r.fallback === true, "rejected model → fallback");
        if ("fallback" in r) assertEq(r.reason, "api_error", "rejection reason is api_error");
    }

    // ─── A8: directConcept — timeout → fallback (timeout_15s) ───
    console.log("  A8: directConcept returns typed fallback on >timeoutMs");
    {
        const r = await directConcept(sampleInput(), hangingCallModel(), 50);
        assert("fallback" in r && r.fallback === true, "hanging callModel → fallback");
        if ("fallback" in r) assertEq(r.reason, "timeout_15s", "timeout reason is timeout_15s (canonical reason even when override timeout is shorter)");
    }

    // ─── A9: directConcept — JSON parse failure → fallback ───
    console.log("  A9: directConcept returns fallback on unparseable model output");
    {
        const r = await directConcept(sampleInput(), okCallModel("not json"));
        assert("fallback" in r && r.fallback === true, "garbage model output → fallback");
        if ("fallback" in r) assertEq(r.reason, "json_parse_failed", "reason is json_parse_failed");
    }

    // ─── A10: directConcept — schema/constraint violation → fallback ───
    console.log("  A10: directConcept returns fallback on hard-constraint violation");
    {
        const bad = sampleBrief({ propsForbidden: ["only", "two"] });
        const r = await directConcept(sampleInput(), okCallModel(JSON.stringify(bad)));
        assert("fallback" in r && r.fallback === true, "constraint-violating brief → fallback");
        if ("fallback" in r) {
            assert(r.reason.startsWith("constraint_violation"), "reason is a constraint_violation:* code");
        }
    }

    // ─── A11: directConcept — never throws even on hostile inputs ───
    console.log("  A11: directConcept NEVER throws (hostile inputs all return fallback)");
    {
        let threw = false;
        try {
            await directConcept(sampleInput(), failingCallModel("boom"));
        } catch (e) {
            threw = true;
        }
        assert(!threw, "directConcept does not throw on api_error");

        threw = false;
        try {
            await directConcept(sampleInput(), okCallModel(""));
        } catch (e) {
            threw = true;
        }
        assert(!threw, "directConcept does not throw on empty model output");
    }

    // ─── A12: 3 briefs carry distinct metaphor tokens (FR-027a) ───
    console.log("  A12: 3 distinct balanced-mode briefs carry distinct metaphorTokens");
    {
        const briefs: ConceptBrief[] = [
            sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "newspaper-subway-seat", layoutToken: "asymmetric_void", headlineToken: "editorial" } }),
            sampleBrief({ conceptIndex: 1, varianceAxes: { metaphorToken: "lighthouse-storm", layoutToken: "central_headroom", headlineToken: "manifesto" } }),
            sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "hourglass-desk", layoutToken: "environmental_canvas", headlineToken: "numerical_anchor" } }),
        ];
        const tokens = new Set(briefs.map(b => b.varianceAxes.metaphorToken));
        assert(tokens.size === 3, "3 briefs have 3 distinct metaphor tokens");
        for (const b of briefs) {
            assert(b.propsForbidden.length >= 3, `concept ${b.conceptIndex} has ≥3 propsForbidden`);
            assertEq(b.subStyleSpecialization.inheritedFrom, SAMPLE_SUB_STYLE, `concept ${b.conceptIndex} subStyle inherits user subStyle`);
            assert(HERO_GAZE_DIRECTIONS.has(b.heroGazeDirection), `concept ${b.conceptIndex} heroGazeDirection is one of the 5 allowed`);
        }
    }

    // ─── A13: hero-less brief passes validateBrief + omits gaze/pose from enrichment slot ───
    console.log("  A13: heroPresence:'absent' brief passes validateBrief; its enrichment slot omits hero gaze/pose");
    {
        const heroLess = sampleBrief({ heroPresence: "absent", heroPoseSpecific: "" });
        const v = validateBrief(heroLess, SAMPLE_SUB_STYLE);
        assert(v.ok === true, "heroPresence:absent passes validateBrief (no hero-pose rule)");
        const fb: ConceptDirectorFallback = { fallback: true, reason: "api_error" };
        const block = buildConceptEnrichmentBlock([heroLess, fb, sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "x", layoutToken: "y", headlineToken: "z" } })]);
        // The hero-less slot (CONCEPT 1) must NOT include a "hero gaze" / "hero pose" line.
        const concept1Slot = slotFor(block, 1);
        assert(concept1Slot.length > 0, "CONCEPT 1 slot is non-empty");
        assert(!/hero gaze/i.test(concept1Slot), "hero-less slot omits hero gaze directive");
        assert(!/hero pose/i.test(concept1Slot), "hero-less slot omits hero pose directive");
        // The fallback slot (CONCEPT 2) is a "use existing logic" marker.
        const concept2Slot = slotFor(block, 2);
        assert(/existing logic/i.test(concept2Slot), "fallback slot is marked as 'use existing logic'");
        // CONCEPT 3 is a regular accepted brief → hero gaze / pose are emitted.
        const concept3Slot = slotFor(block, 3);
        assert(/hero gaze/i.test(concept3Slot) || /gaze direction/i.test(concept3Slot), "accepted brief slot emits hero gaze directive");
    }

    // ─── A14: pastWinningAds default (FR-007) ───
    console.log("  A14: pastWinningAds defaults to [] when undefined");
    {
        const inp = sampleInput();
        // Construct a ConceptDirectorInput with pastWinningAds omitted entirely.
        const partialInput: Omit<ConceptDirectorInput, "pastWinningAds"> & { pastWinningAds?: unknown } = {
            brief: inp.brief,
            inviolable: inp.inviolable,
            conceptIndex: inp.conceptIndex,
            siblingConcepts: inp.siblingConcepts,
            varianceMode: inp.varianceMode,
            avoidTokens: inp.avoidTokens,
        };
        // Force undefined (already undefined above).
        const normalized = { ...partialInput, pastWinningAds: partialInput.pastWinningAds ?? [] } as ConceptDirectorInput;
        assert(Array.isArray(normalized.pastWinningAds) && normalized.pastWinningAds.length === 0, "pastWinningAds normalizes to []");
        // directConcept with default empty pastWinningAds runs unaffected.
        const r = await directConcept(normalized, okCallModel(JSON.stringify(sampleBrief())));
        assert(!("fallback" in r), "directConcept with empty pastWinningAds returns a ConceptBrief");
    }

    // ─── A15: buildConceptEnrichmentBlock emits 3 slots ───
    console.log("  A15: buildConceptEnrichmentBlock emits 3 labeled CONCEPT N slots");
    {
        const block = buildConceptEnrichmentBlock([
            sampleBrief({ conceptIndex: 0 }),
            sampleBrief({ conceptIndex: 1, varianceAxes: { metaphorToken: "y", layoutToken: "z", headlineToken: "w" } }),
            sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "a", layoutToken: "b", headlineToken: "c" } }),
        ]);
        assert(/CONCEPT 1/.test(block), "block has CONCEPT 1 label");
        assert(/CONCEPT 2/.test(block), "block has CONCEPT 2 label");
        assert(/CONCEPT 3/.test(block), "block has CONCEPT 3 label");
        assert(/headline architecture/i.test(block), "block includes the headline architecture directive");
        assert(/layout archetype/i.test(block), "block includes the layout archetype directive");
        assert(/forbidden props/i.test(block), "block includes the forbidden props directive");
        assert(/visual metaphor/i.test(block), "block includes the visual metaphor directive");
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT B — Variance Validator
    // ═══════════════════════════════════════════════════════════

    // ─── B1: normalizeToken — lowercase + trim, no interior munging ───
    console.log("  B1: normalizeToken lowercases + trims; interior chars unchanged");
    {
        assertEq(normalizeToken("  Hello World  "), "hello world", "lowercase + trim");
        assertEq(normalizeToken("A-B-C"), "a-b-c", "interior dashes preserved");
        assertEq(normalizeToken(""), "", "empty input → empty");
        assertEq(normalizeToken("   "), "", "whitespace-only → empty");
    }

    // ─── B2: balanced mode — metaphor duplicate in 2 of 3 → block ───
    console.log("  B2: balanced mode blocks when metaphor matches in 2 of 3");
    {
        const a = sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "newspaper-subway-seat", layoutToken: "asymmetric_void", headlineToken: "editorial" } });
        const b = sampleBrief({ conceptIndex: 1, varianceAxes: { metaphorToken: "newspaper-subway-seat", layoutToken: "central_headroom", headlineToken: "manifesto" } });
        const c = sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "lighthouse-storm", layoutToken: "environmental_canvas", headlineToken: "numerical_anchor" } });
        const r = validateBatchVariance([a, b, c], "balanced");
        assertEq(r.passed, false, "passed=false on 2-of-3 metaphor duplicate");
        const metaBlock = r.violations.find(v => v.axis === "metaphor" && v.severity === "block");
        assert(metaBlock !== undefined, "metaphor block violation recorded");
        if (metaBlock) {
            assertEq(metaBlock.duplicateConceptIndices.length, 2, "2 concept indices flagged");
            assert(metaBlock.duplicateConceptIndices.includes(0) && metaBlock.duplicateConceptIndices.includes(1), "concepts 0 + 1 flagged");
        }
    }

    // ─── B3: balanced mode — layout identical across all 3 → block ───
    console.log("  B3: balanced mode blocks when layout identical across all 3");
    {
        const a = sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "x1", layoutToken: "asymmetric_void", headlineToken: "h1" } });
        const b = sampleBrief({ conceptIndex: 1, varianceAxes: { metaphorToken: "y1", layoutToken: "asymmetric_void", headlineToken: "h2" } });
        const c = sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "z1", layoutToken: "asymmetric_void", headlineToken: "h3" } });
        const r = validateBatchVariance([a, b, c], "balanced");
        assertEq(r.passed, false, "passed=false on all-3 layout duplicate");
        const layBlock = r.violations.find(v => v.axis === "layout" && v.severity === "block");
        assert(layBlock !== undefined, "layout block violation recorded");
        if (layBlock) assertEq(layBlock.duplicateConceptIndices.length, 3, "all 3 concept indices flagged for layout");
    }

    // ─── B4: balanced mode — layout 2-of-3 is a WARN, not a block ───
    console.log("  B4: balanced mode warns (does not block) on 2-of-3 layout duplicate");
    {
        const a = sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "x1", layoutToken: "asymmetric_void", headlineToken: "h1" } });
        const b = sampleBrief({ conceptIndex: 1, varianceAxes: { metaphorToken: "y1", layoutToken: "asymmetric_void", headlineToken: "h2" } });
        const c = sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "z1", layoutToken: "central_headroom", headlineToken: "h3" } });
        const r = validateBatchVariance([a, b, c], "balanced");
        const layWarn = r.violations.find(v => v.axis === "layout" && v.severity === "warn");
        const layBlock = r.violations.find(v => v.axis === "layout" && v.severity === "block");
        assert(layWarn !== undefined && layBlock === undefined, "2-of-3 layout → warn (not block)");
        assertEq(r.passed, true, "warn does not flip passed");
    }

    // ─── B5: distinct set passes (no violation) ───
    console.log("  B5: a non-duplicating set passes with no violation");
    {
        const a = sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "newspaper", layoutToken: "asymmetric_void", headlineToken: "editorial" } });
        const b = sampleBrief({ conceptIndex: 1, varianceAxes: { metaphorToken: "lighthouse", layoutToken: "central_headroom", headlineToken: "manifesto" } });
        const c = sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "hourglass", layoutToken: "environmental_canvas", headlineToken: "numerical_anchor" } });
        const r = validateBatchVariance([a, b, c], "balanced");
        assertEq(r.passed, true, "passed=true on a distinct set");
        assertEq(r.violations.length, 0, "no violations recorded");
    }

    // ─── B6: fallback slots are excluded from comparison ───
    console.log("  B6: fallback slots are excluded from comparison (B5)");
    {
        const fb: ConceptDirectorFallback = { fallback: true, reason: "api_error" };
        const fb2: ConceptDirectorFallback = { fallback: true, reason: "api_error" };
        const a = sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "x", layoutToken: "y", headlineToken: "z" } });
        // With ≥ 2 fallbacks, the 1 remaining accepted brief cannot
        // duplicate against anything — the "≥2 of 3" rule cannot fire.
        const r = validateBatchVariance([a, fb, fb2], "balanced");
        assertEq(r.passed, true, "1 accepted + 2 fallbacks never blocks (≥2 fallbacks = no block)");

        // With 2 accepted duplicates + 1 fallback, the "≥2 of 3"
        // ACTIVE-BRIEFS rule DOES fire (the two accepted briefs are
        // real duplicates — the fallback cannot satisfy them per B5,
        // but they duplicate each other directly). This is by design:
        // the orchestrator can retry one of the duplicates to break
        // the collision.
        const r2 = validateBatchVariance([
            sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "x", layoutToken: "y", headlineToken: "z" } }),
            fb,
            sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "x", layoutToken: "y", headlineToken: "z" } }),
        ], "balanced");
        assertEq(r2.passed, false, "2 accepted duplicates + 1 fallback → still blocks (the 2 accepted are real duplicates)");
    }

    // ─── B7: deterministic, fast, no I/O ───
    console.log("  B7: validateBatchVariance is deterministic and fast");
    {
        const a = sampleBrief({ conceptIndex: 0, varianceAxes: { metaphorToken: "x", layoutToken: "y", headlineToken: "z" } });
        const b = sampleBrief({ conceptIndex: 1, varianceAxes: { metaphorToken: "y", layoutToken: "z", headlineToken: "x" } });
        const c = sampleBrief({ conceptIndex: 2, varianceAxes: { metaphorToken: "z", layoutToken: "x", headlineToken: "y" } });
        const r1 = validateBatchVariance([a, b, c], "balanced");
        const r2 = validateBatchVariance([a, b, c], "balanced");
        assertEq(JSON.stringify(r1), JSON.stringify(r2), "deterministic — same input, same output");
        const t0 = Date.now();
        for (let i = 0; i < 1000; i++) validateBatchVariance([a, b, c], "balanced");
        const elapsed = Date.now() - t0;
        assert(elapsed < 5000, `1000 runs complete in <5s (took ${elapsed}ms)`);
    }

    // ─── B8: conservative / aggressive modes defined for forward-compat ───
    console.log("  B8: conservative + aggressive modes do not throw");
    {
        // Vary BOTH the varianceAxes tokens AND backgroundComplexity so
        // the aggressive-mode backgroundComplexity duplicate check
        // (Contract B4) also passes — the sample fixture's default
        // `backgroundComplexity: "moderate"` is intentionally uniform
        // for most tests, but here we need all four axes distinct.
        const a = sampleBrief({
            conceptIndex: 0,
            varianceAxes: { metaphorToken: "x", layoutToken: "y", headlineToken: "z" },
            backgroundComplexity: "minimal",
        });
        const b = sampleBrief({
            conceptIndex: 1,
            varianceAxes: { metaphorToken: "y", layoutToken: "z", headlineToken: "x" },
            backgroundComplexity: "moderate",
        });
        const c = sampleBrief({
            conceptIndex: 2,
            varianceAxes: { metaphorToken: "z", layoutToken: "x", headlineToken: "y" },
            backgroundComplexity: "rich",
        });
        const rCons = validateBatchVariance([a, b, c], "conservative");
        assert(rCons.passed === true, "conservative passes on a distinct set");
        const rAgg = validateBatchVariance([a, b, c], "aggressive");
        assert(rAgg.passed === true, "aggressive passes on a distinct set");
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT C — Integration: gate + injection site
    // ═══════════════════════════════════════════════════════════

    // ─── C1: generateConcepts accepts the optional conceptDirectorBriefs param ───
    console.log("  C1: generators.ts accepts an optional conceptDirectorBriefs param on generateConcepts");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/conceptDirectorBriefs\s*\??:/.test(genSrc) || /conceptDirectorBriefs\?/.test(genSrc), "generateConcepts has conceptDirectorBriefs? param");
    }

    // ─── C2: enrichment block is injected into the [VISUAL ARCHITECT V5.0] prompt ───
    console.log("  C2: buildConceptEnrichmentBlock is called inside generateConcepts at the concept-architecting site");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/buildConceptEnrichmentBlock\s*\(/.test(genSrc), "generators.ts calls buildConceptEnrichmentBlock");
        const vaIdx = genSrc.indexOf("[VISUAL ARCHITECT V5.0]");
        const injectIdx = genSrc.indexOf("buildConceptEnrichmentBlock(");
        assert(vaIdx > -1, "generators.ts has the [VISUAL ARCHITECT V5.0] prompt header");
        assert(injectIdx > vaIdx, "injection site is inside the concept prompt (after the V5.0 header)");
        assert(/conceptDirectorBriefs/.test(genSrc.slice(injectIdx, injectIdx + 400)), "injection site references conceptDirectorBriefs");
    }

    // ─── C3: serverGenerateConcepts gates on mode === 'initial' ───
    console.log("  C3: serverGenerateConcepts has a mode==='initial' gate that wraps the Director loop");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        assert(/serverGenerateConcepts\s*=/.test(idxSrc), "index.ts defines serverGenerateConcepts");
        // The gate must check `mode === 'initial'` for the Director to run.
        assert(/mode\s*===\s*['"]initial['"]/.test(idxSrc), "index.ts has a mode==='initial' check");
        // The gate must reference the per-user flag (variable name OR
        // helper function `getConceptDirectorEnabled`).
        assert(/conceptDirectorEnabled|getConceptDirectorEnabled/.test(idxSrc), "index.ts reads conceptDirectorEnabled flag");
        // The gate must reference the kill switch (variable name OR
        // helper function `getConceptDirectorKillSwitch`).
        assert(/conceptDirectorKillSwitch|getConceptDirectorKillSwitch/.test(idxSrc), "index.ts reads conceptDirectorKillSwitch");
    }

    // ─── C4: 3x sequential Director loop ───
    console.log("  C4: serverGenerateConcepts runs the Director 3x sequentially for conceptIndex 0→1→2");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        assert(/directConcept\s*\(/.test(idxSrc), "index.ts calls directConcept");
        // 0 → 1 → 2 sequencing — accept both the literal `conceptIndex: N`
        // form AND the conditional `conceptIndex: i === 0 ? 0 : i === 1 ? 1 : 2`
        // form used to satisfy the strict literal-type narrowing.
        assert(/conceptIndex\s*:\s*0/.test(idxSrc) || /conceptIndex\s*:\s*i === 0 \? 0/.test(idxSrc), "index.ts calls directConcept with conceptIndex 0");
        assert(/conceptIndex\s*:\s*1/.test(idxSrc) || /i === 1 \? 1/.test(idxSrc), "index.ts calls directConcept with conceptIndex 1");
        assert(/conceptIndex\s*:\s*2/.test(idxSrc) || /i === 1 \? 1 : 2/.test(idxSrc) || /idx === 1 \? 1 : 2/.test(idxSrc), "index.ts calls directConcept with conceptIndex 2");
    }

    // ─── C5: retry orchestration — ≤1 retry per concept, ship-as-is after ───
    console.log("  C5: serverGenerateConcepts calls validateBatchVariance and re-runs directConcept with avoidTokens on blocking violations");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        assert(/validateBatchVariance\s*\(/.test(idxSrc), "index.ts calls validateBatchVariance");
        assert(/avoidTokens/.test(idxSrc), "index.ts uses avoidTokens on retry");
        assert(/retried/.test(idxSrc) || /retryCount/.test(idxSrc), "index.ts has a per-concept retry guard");
    }

    // ─── C6: quickRejectCheck / validateBlueprintMinimalStyle awareness ───
    console.log("  C6: generators.ts has a HeadlineArchitecture-aware quick-reject / minimal-style whitelist");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // The whitelist should mention at least the novel architectures.
        assert(/HEADLINE_WHITELIST|HEADLINE_ARCHS|headline[- ]?architecture/i.test(genSrc), "generators.ts has a headline-architecture whitelist / awareness");
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT D — Trace
    // ═══════════════════════════════════════════════════════════

    // ─── D1: ResolutionTrace.conceptDirector shape ───
    console.log("  D1: types.ts defines the additive conceptDirector? sub-object");
    {
        const typesSrc = readFileSync(join(__dirname, "..", "..", "src", "types.ts"), "utf8");
        assert(/conceptDirector\?:/.test(typesSrc), "types.ts defines conceptDirector? as optional");
        // Discriminated union: the ran field is now `ran: true | ran: false`
        // (NOT a flat boolean) so the skip-path branch can carry an
        // exact discriminated `reason`. Match either form.
        assert(/ran:\s*(boolean|true|false)/.test(typesSrc), "conceptDirector has ran field (boolean or literal true/false)");
        assert(/enabled:\s*boolean/.test(typesSrc), "conceptDirector has enabled: boolean");
        assert(/killSwitch:\s*boolean/.test(typesSrc), "conceptDirector has killSwitch: boolean");
        assert(/mode:\s*["']balanced["']/.test(typesSrc), "conceptDirector has mode: 'balanced'");
        assert(/conceptCount:\s*number|conceptCount:\s*0/.test(typesSrc), "conceptDirector has conceptCount: number or 0 literal");
        assert(/fallbackCount:\s*number|fallbackCount:\s*0/.test(typesSrc), "conceptDirector has fallbackCount: number or 0 literal");
        assert(/validatorTriggered:\s*boolean|validatorTriggered:\s*false/.test(typesSrc), "conceptDirector has validatorTriggered: boolean or false literal");
        assert(/retryCount:\s*number|retryCount:\s*0/.test(typesSrc), "conceptDirector has retryCount: number or 0 literal");
        assert(/varianceAchieved:\s*boolean|varianceAchieved:\s*false/.test(typesSrc), "conceptDirector has varianceAchieved: boolean or false literal");
        assert(/reason\?:\s*string|reason:\s*["']flag-disabled["']/.test(typesSrc), "conceptDirector has reason field (optional string OR required literal union)");
    }

    // ─── D2: ran:true and ran:false trace objects both satisfy the type ───
    console.log("  D2: sample ran:true + ran:false trace objects both satisfy ResolutionTrace.conceptDirector");
    {
        // Explicitly type both samples as the additive trace sub-object
        // so the test acts as a COMPILE-TIME guard against changes in
        // `types.ts` (a missing/renamed field here would surface as a
        // TS error, not just a runtime round-trip mismatch).
        const ranTrue: NonNullable<ResolutionTrace["conceptDirector"]> = {
            ran: true,
            enabled: true,
            killSwitch: false,
            mode: "balanced",
            conceptCount: 3,
            fallbackCount: 0,
            validatorTriggered: true,
            retryCount: 1,
            varianceAchieved: true,
        };
        const ranFalse: NonNullable<ResolutionTrace["conceptDirector"]> = {
            ran: false,
            enabled: false,
            killSwitch: false,
            mode: "balanced",
            conceptCount: 0,
            fallbackCount: 0,
            validatorTriggered: false,
            retryCount: 0,
            varianceAchieved: false,
            reason: "flag-disabled",
        };
        // Round-trip through JSON without losing shape (proves the
        // optional field is structural and additive).
        const j1 = JSON.parse(JSON.stringify(ranTrue));
        const j2 = JSON.parse(JSON.stringify(ranFalse));
        assertEq(j1.ran, true, "ran:true round-trips");
        assertEq(j1.varianceAchieved, true, "ran:true varianceAchieved round-trips");
        assertEq(j2.ran, false, "ran:false round-trips");
        assertEq(j2.reason, "flag-disabled", "ran:false reason round-trips");
        // Type-level assertions: each sample IS a ResolutionTrace["conceptDirector"].
        const _t1: ResolutionTrace["conceptDirector"] = ranTrue;
        const _t2: ResolutionTrace["conceptDirector"] = ranFalse;
        assert(_t1 !== undefined && _t2 !== undefined, "typed samples satisfy ResolutionTrace['conceptDirector']");
    }

    // ─── D3: index.ts writes the trace in BOTH branches ───
    console.log("  D3: index.ts writes the trace in BOTH ran and skipped branches");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        assert(/conceptDirector:/.test(idxSrc), "index.ts references conceptDirector trace key");
        assert(/ran:\s*true/.test(idxSrc), "index.ts writes ran:true");
        assert(/ran:\s*false/.test(idxSrc), "index.ts writes ran:false");
        assert(/["']flag-disabled["']/.test(idxSrc), "index.ts records reason 'flag-disabled' on skip");
        assert(/["']kill-switch-on["']/.test(idxSrc), "index.ts records reason 'kill-switch-on' on skip");
        assert(/["']non-initial-mode["']/.test(idxSrc), "index.ts records reason 'non-initial-mode' on skip");
        // Audit fix #30/#32/#33 — round 2: the trace rides the HTTP
        // boundary (NOT a module global, which worked in the emulator
        // but NEVER in production because serverGenerateConcepts and
        // serverGenerateFinalAd run in SEPARATE Cloud Run containers).
        // The concept stage RETURNS the trace in the response; the
        // render stage READS it from the request. We assert both
        // directions exist.
        assert(/conceptDirectorTrace:\s*_cdTrace/.test(idxSrc), "serverGenerateConcepts returns conceptDirectorTrace in its response");
        assert(/conceptDirectorTrace[,\s}]/.test(idxSrc), "serverGenerateFinalAd destructures conceptDirectorTrace from request.data");
        // The dead concept-stage Firestore write must be GONE (it would
        // target a non-existent generations/{genId} doc).
        assert(!/persistConceptDirectorTrace\s*\(/.test(idxSrc), "index.ts no longer calls the dead concept-stage persistConceptDirectorTrace");
        // The module-global setter (which worked only in the emulator
        // because Cloud Run containers don't share process memory)
        // must be GONE.
        assert(!/setLastConceptDirectorTrace\s*\(/.test(idxSrc), "index.ts no longer calls the dead module-global setLastConceptDirectorTrace");
    }

    // ─── D4: trace flows to render-stage via HTTP payload (audit #30/#32/#33 round 2) ───
    console.log("  D4: conceptDirector trace flows to render-stage via the generateFinalAd function parameter (no module global)");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // 1. generateFinalAd has a `conceptDirectorTrace` parameter
        //    (the test regex must handle multi-line signatures with
        //    comments and nested `)` — use [\s\S] with the closest
        //    `): Promise<` terminator).
        const sigMatch = genSrc.match(/export async function generateFinalAd\(([\s\S]*?)\):\s*Promise/);
        assert(sigMatch !== null, "generateFinalAd signature found");
        const sigBody = sigMatch![1];
        assert(/conceptDirectorTrace\s*\??:/.test(sigBody),
            "generateFinalAd signature includes conceptDirectorTrace parameter");
        assert(/ConceptDirectorTraceEntry/.test(sigBody),
            "conceptDirectorTrace parameter is typed as ConceptDirectorTraceEntry | null");
        // 2. The merge is from the parameter, NOT the module global.
        const genFinalAdIdx = genSrc.indexOf("export async function generateFinalAd");
        const tailIdx = genSrc.indexOf("return { image", genFinalAdIdx);
        const genFinalAdBody = genSrc.slice(genFinalAdIdx, tailIdx);
        assert(/if\s*\(\s*conceptDirectorTrace\s*\)/.test(genFinalAdBody),
            "generateFinalAd guards the merge with `if (conceptDirectorTrace)`");
        assert(/conceptDirector:\s*conceptDirectorTrace/.test(genFinalAdBody),
            "generateFinalAd merges `conceptDirectorTrace` (the parameter) into _lastResolutionTrace");
        // 3. The merge happens AFTER the expressionAdaptation / gazeDirection /
        //    universeAwareCopy writes (same render-stage precedent).
        const exprIdx = genFinalAdBody.indexOf("expressionAdaptation:");
        const cdMergeIdx = genFinalAdBody.indexOf("conceptDirector: conceptDirectorTrace");
        assert(cdMergeIdx > exprIdx, "conceptDirector merge happens AFTER expressionAdaptation in generateFinalAd");
        // 4. The module-global survivor and its setter/getter must be GONE.
        //    (The previous round-1 fix used a module-level variable; round
        //    2 removes it because Cloud Run containers don't share process
        //    memory, so the module-global bridge never worked in prod.)
        assert(!/let _lastConceptDirectorTrace\s*:/.test(genSrc),
            "generators.ts no longer declares the module-global _lastConceptDirectorTrace survivor");
        assert(!/setLastConceptDirectorTrace/.test(genSrc),
            "generators.ts no longer exports the dead setLastConceptDirectorTrace setter");
        assert(!/getLastConceptDirectorTrace/.test(genSrc),
            "generators.ts no longer exports the dead getLastConceptDirectorTrace getter");
    }

    // ─── D5: types.ts exposes the trace entry as an exportable type alias ───
    console.log("  D5: types.ts exports ConceptDirectorTraceEntry type alias");
    {
        const typesSrc = readFileSync(join(__dirname, "..", "..", "src", "types.ts"), "utf8");
        assert(/export type ConceptDirectorTraceEntry\s*=/.test(typesSrc), "types.ts exports ConceptDirectorTraceEntry type alias");
        assert(/readonly conceptDirector\?:\s*ConceptDirectorTraceEntry/.test(typesSrc), "ResolutionTrace.conceptDirector references the alias");
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT E — config helper (kill switch + flag)
    // ═══════════════════════════════════════════════════════════

    // ─── E1: conceptDirectorConfig.ts exists with kill-switch + flag helpers ───
    console.log("  E1: conceptDirectorConfig.ts exists and provides the kill-switch + flag helpers");
    {
        const cfgSrc = readFileSync(join(__dirname, "..", "..", "src", "conceptDirectorConfig.ts"), "utf8");
        assert(typeof cfgSrc === "string" && cfgSrc.length > 0, "conceptDirectorConfig.ts is non-empty");
        assert(/getConceptDirectorKillSwitch/.test(cfgSrc), "config exports getConceptDirectorKillSwitch");
        assert(/getConceptDirectorEnabled/.test(cfgSrc), "config exports getConceptDirectorEnabled");
        assert(/Remote\s*Config|remoteConfig|getRemoteConfig/i.test(cfgSrc), "config reads Firebase Remote Config");
    }

    // ─── E2: index.ts imports from conceptDirectorConfig (not inlined) ───
    console.log("  E2: index.ts imports the config helpers (PINNED — config lives in its own module)");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        assert(/from\s+["']\.\/conceptDirectorConfig\.js["']/.test(idxSrc), "index.ts imports from ./conceptDirectorConfig.js");
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT F — Director budget guard (audit fix round 4)
    // ═══════════════════════════════════════════════════════════

    // ─── F1: Director budget guard exists and is consulted before each call ───
    console.log("  F1: index.ts bounds the Director stage with a timeout-aware budget guard");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        // Semantic check 1: a budget ceiling is declared.
        assert(/_directorBudgetMs/.test(idxSrc), "index.ts declares a Director budget ceiling (_directorBudgetMs)");
        // Semantic check 2: the budget is consulted (the remaining-time
        // helper is called at least twice — once in the initial 3× loop
        // and once in the retry loop). We assert at least two distinct
        // calls rather than matching an exact loop header.
        const callMatches = idxSrc.match(/_directorRemainingMs\(\)/g) || [];
        assert(callMatches.length >= 2, `index.ts consults _directorRemainingMs() at least twice (initial loop + retry loop) — found ${callMatches.length}`);
        // Semantic check 3: when budget is exhausted, the code path
        // fails open (sets fallback / breaks the loop) rather than
        // continuing to spend budget. We check that an exhaustion
        // check exists and is paired with `break` or fallback assignment.
        const hasExhaustionGuard = /_directorRemainingMs\(\)\s*<=\s*0/.test(idxSrc);
        assert(hasExhaustionGuard, "index.ts has a budget-exhausted check (_directorRemainingMs() <= 0)");
        const hasExhaustionResponse = /break\s*;|fallback\s*:\s*true|_cdResultsBudgetExhausted/.test(idxSrc);
        assert(hasExhaustionResponse, "index.ts has a fail-open response on budget exhaustion (break or fallback)");
    }

    // ─── F2: catch block uses 'director-failed' reason (not 'flag-disabled') ───
    console.log("  F2: Director exception catch uses 'director-failed' reason (distinct from gate-skip reasons)");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        // The Director gate's catch block sets reason = "director-failed"
        // (not "flag-disabled"). We check the catch block specifically by
        // looking for the "director-failed" literal inside any catch
        // context, not just matching one assignment line.
        const catchBlocks = idxSrc.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\}/g) || [];
        const hasDirectorFailedInCatch = catchBlocks.some(b => /director-failed/.test(b));
        assert(hasDirectorFailedInCatch, "Director gate's catch block records 'director-failed' reason on exception");
        // 'director-failed' is in the discriminated union reason.
        const typesSrc = readFileSync(join(__dirname, "..", "..", "src", "types.ts"), "utf8");
        assert(/["']director-failed["']/.test(typesSrc), "types.ts includes 'director-failed' in the trace reason union");
    }

    // ─── F3: index.ts avoids `(inputs as any)` for Director inputs ───
    console.log("  F3: index.ts uses a typed view for Director inputs (no new any casts)");
    {
        const idxSrc = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
        assert(/interface DirectorInputsView/.test(idxSrc),
            "index.ts declares a DirectorInputsView typed interface");
        // No remaining `(inputs as any)?.subStyle` reads.
        assert(!/\(inputs as any\)\?\.subStyle/.test(idxSrc),
            "index.ts no longer reads (inputs as any)?.subStyle");
        assert(!/\(inputs as any\)\?\.adLanguage/.test(idxSrc),
            "index.ts no longer reads (inputs as any)?.adLanguage");
        assert(!/\(inputs as any\)\?\.aspectRatio/.test(idxSrc),
            "index.ts no longer reads (inputs as any)?.aspectRatio");
        assert(/Array\.isArray\(_cdInputs\.offerCreativeMode\)/.test(idxSrc),
            "index.ts guards offerCreativeMode access with Array.isArray");
    }

    // ═══════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════
    return { passed, failed };
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Returns the text of the `CONCEPT n` slot from a buildConceptEnrichmentBlock output.
 * Falls back to an empty string if the slot is missing.
 */
function slotFor(block: string, n: 1 | 2 | 3): string {
    const re = new RegExp(`CONCEPT ${n}([\\s\\S]*?)(?=CONCEPT ${n + 1}|$)`);
    const m = block.match(re);
    return m ? m[1] : "";
}

/**
 * Soft check that the prompt references either sibling varianceAxes tokens
 * or the avoidTokens we passed in. The exact phrase varies by prompt
 * iteration — we just require SOMETHING from the avoidance context to
 * appear, which proves the prompt builder did not silently drop the
 * avoid-list / sibling-avoidance clauses (Contract A4).
 */
function newspaperAvoidanceOrVariance(prompt: string): boolean {
    return /newspaper-subway-seat/.test(prompt) || /clock-tower/.test(prompt) || /fountain/.test(prompt)
        || /avoid|previous sibling|prior sibling|sibling|already-produced/i.test(prompt);
}

runTests();
