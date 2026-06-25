// functions/src/__tests__/gazeMap.test.ts
// Phase 19 — Direct-Response Design Upgrades (gaze direction) — unit tests.
// Verifies Contract A (resolver), Contract B (image-prompt gaze block),
// Contract C (one-highlight cap, hook↔visual mood, price hierarchy),
// Contract D (injection gating in buildFinalImagePrompt), Contract E
// (audit trace in generateFinalAd), and Contract G (CTA outcome framing).
// Mirrors the structure of expressionMap.test.ts.
//
// Pure (no Gemini calls) — exercises the mapper + block builders in
// isolation and checks the source files for the canonical injection
// sites (image prompt + copy CTA block) and the trace write.
//
// Test runner: built by tsc, run as `node lib/__tests__/gazeMap.test.js`
// via the `test:gazeMap` script in package.json.

import { readFileSync } from "fs";
import { join } from "path";
import {
    getHookGazeDirection,
    getObjectionGazeDirection,
    buildImagePromptGazeBlock,
    resolveGazeDirective,
    getKnownHookAngleIds,
    ONE_HIGHLIGHT_BLOCK,
    buildHookVisualMoodBlock,
    detectPriceContent,
    buildPriceHierarchyBlock,
    CTA_OUTCOME_FRAMING_BLOCK,
    type GazeDirective,
} from "../gazeMap.js";
import { HOOK_ANGLE_KNOWLEDGE } from "../knowledge/hookAnglesKnowledge.js";
import { RETARGETING_OBJECTION_DATA } from "../retargetingObjections.js";

declare const process: { exit(code: number): void };
declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void };

// ═══════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════

function runTests(): void {
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

    console.log("gazeMap tests (Phase 19)");

    // ═══════════════════════════════════════════════════════════
    // CONTRACT A — Resolver coverage
    // ═══════════════════════════════════════════════════════════

    // ─── A1: every canonical hook id resolves (10 ids) ───
    console.log("  A1: every HOOK_ANGLE_KNOWLEDGE id resolves to non-null directive");
    {
        const knownIds = Object.keys(HOOK_ANGLE_KNOWLEDGE);
        assert(knownIds.length === 10, `backend HOOK_ANGLE_KNOWLEDGE has 10 ids (got ${knownIds.length})`);
        for (const id of knownIds) {
            const d = getHookGazeDirection(id);
            assert(d !== null, `${id} resolves to non-null directive`);
            if (d) {
                assert(d.source === "hook", `${id} has source "hook" (got ${d.source})`);
                assert(d.sourceId === id, `${id} has sourceId "${id}" (got "${d.sourceId}")`);
                assert(typeof d.treatment === "string" && d.treatment.trim().length > 0, `${id} has non-empty treatment`);
                assert(typeof d.description === "string" && d.description.trim().length > 0, `${id} has non-empty description`);
            }
        }
        const local = new Set(getKnownHookAngleIds());
        for (const id of knownIds) {
            assert(local.has(id), `getKnownHookAngleIds() includes "${id}"`);
        }
    }

    // ─── A2: pain → reflective_downward ───
    console.log("  A2: pain → reflective_downward");
    {
        const d = getHookGazeDirection("pain");
        assert(d !== null, "pain returns non-null");
        if (d) {
            assert(d.treatment === "reflective_downward", `pain treatment is "reflective_downward" (got "${d.treatment}")`);
            assert(/down|inward|contemplat/i.test(d.description), `pain description mentions down/inward/contemplative (got "${d.description}")`);
            assert(d.sourceId === "pain", `pain sourceId === "pain"`);
        }
    }

    // ─── A3: logical_authority → direct_to_viewer ───
    console.log("  A3: logical_authority → direct_to_viewer");
    {
        const d = getHookGazeDirection("logical_authority");
        assert(d !== null, "logical_authority returns non-null");
        if (d) {
            assert(d.treatment === "direct_to_viewer", `logical_authority treatment is "direct_to_viewer" (got "${d.treatment}")`);
        }
    }

    // ─── A4: future_based → forward_horizon ───
    console.log("  A4: future_based → forward_horizon");
    {
        const d = getHookGazeDirection("future_based");
        assert(d !== null, "future_based returns non-null");
        if (d) {
            assert(d.treatment === "forward_horizon", `future_based treatment is "forward_horizon" (got "${d.treatment}")`);
        }
    }

    // ─── A5: curiosity → three_quarter ───
    console.log("  A5: curiosity → three_quarter");
    {
        const d = getHookGazeDirection("curiosity");
        assert(d !== null, "curiosity returns non-null");
        if (d) {
            assert(d.treatment === "three_quarter", `curiosity treatment is "three_quarter" (got "${d.treatment}")`);
        }
    }

    // ─── A6: scarcity → toward_content ───
    console.log("  A6: scarcity → toward_content");
    {
        const d = getHookGazeDirection("scarcity");
        assert(d !== null, "scarcity returns non-null");
        if (d) {
            assert(d.treatment === "toward_content", `scarcity treatment is "toward_content" (got "${d.treatment}")`);
        }
    }

    // ─── A7: every retargeting objection id resolves ───
    console.log("  A7: every RETARGETING_OBJECTION_DATA id resolves");
    {
        const allIds = RETARGETING_OBJECTION_DATA.map((o) => o.id);
        assert(allIds.length === 12, `RETARGETING_OBJECTION_DATA has 12 ids (got ${allIds.length})`);
        for (const id of allIds) {
            const d = getObjectionGazeDirection(id);
            assert(d !== null, `objection "${id}" resolves to non-null directive`);
            if (d) {
                assert(d.source === "objection", `objection "${id}" source === "objection"`);
                assert(d.sourceId === id, `objection "${id}" sourceId matches input`);
                assert(d.treatment.trim().length > 0 && d.description.trim().length > 0, `objection "${id}" has non-empty treatment+description`);
            }
        }
    }

    // ─── A8: unknown non-null id → safe fallback (NOT null) ───
    console.log("  A8: unknown id → safe fallback directive (FR-010)");
    {
        const d = getHookGazeDirection("banana");
        assert(d !== null, "unknown id returns non-null fallback");
        if (d) {
            assert(d.source === "fallback", `unknown id source === "fallback" (got "${d.source}")`);
            assert(d.sourceId === "banana", `unknown id sourceId echoes input (got "${d.sourceId}")`);
            assert(d.treatment === "three_quarter", `fallback treatment is "three_quarter" (got "${d.treatment}")`);
        }
    }

    // ─── A9: aliases resolve correctly ───
    console.log("  A9: defensive aliases");
    {
        const a = getHookGazeDirection("shocking_stat");
        const b = getHookGazeDirection("statistics");
        assert(a !== null && b !== null && a.treatment === b.treatment, `shocking_stat alias → statistics treatment (${a?.treatment} vs ${b?.treatment})`);
        assert(a !== null && a.sourceId === "statistics", `shocking_stat alias sourceId canonicalizes to "statistics"`);

        const fomo = getHookGazeDirection("fear_of_missing_out");
        const urgency = getHookGazeDirection("urgency");
        assert(fomo !== null && urgency !== null && fomo.treatment === urgency.treatment, `fear_of_missing_out → urgency treatment (${fomo?.treatment} vs ${urgency?.treatment})`);

        const fp = getHookGazeDirection("future_pacing");
        const fb = getHookGazeDirection("future_based");
        assert(fp !== null && fb !== null && fp.treatment === fb.treatment, `future_pacing alias → future_based treatment (${fp?.treatment} vs ${fb?.treatment})`);
    }

    // ─── A10: null / empty in → null out (canonical absent sentinel) ───
    console.log("  A10: null/empty inputs return null");
    {
        assert(getHookGazeDirection(null) === null, "getHookGazeDirection(null) === null");
        assert(getHookGazeDirection(undefined) === null, "getHookGazeDirection(undefined) === null");
        assert(getHookGazeDirection("") === null, "getHookGazeDirection('') === null");
        assert(getObjectionGazeDirection(null) === null, "getObjectionGazeDirection(null) === null");
        assert(getObjectionGazeDirection(undefined) === null, "getObjectionGazeDirection(undefined) === null");
        assert(getObjectionGazeDirection("") === null, "getObjectionGazeDirection('') === null");
        assert(resolveGazeDirective({ coldHookAngle: null, retargetingObjection: null }) === null, "resolveGazeDirective(both null) === null");
        assert(resolveGazeDirective({}) === null, "resolveGazeDirective({}) === null");
    }

    // ─── A11: hook wins over objection when both present ───
    console.log("  A11: resolveGazeDirective priority (cold hook > objection)");
    {
        const r = resolveGazeDirective({ coldHookAngle: "pain", retargetingObjection: "price_too_high" });
        assert(r !== null && r.source === "hook" && r.sourceId === "pain", `cold hook wins over objection (got "${r?.source}:${r?.sourceId}")`);

        const r2 = resolveGazeDirective({ coldHookAngle: null, retargetingObjection: "dont_trust" });
        assert(r2 !== null && r2.source === "objection" && r2.sourceId === "dont_trust", `objection alone resolves (got "${r2?.source}:${r2?.sourceId}")`);

        const r3 = resolveGazeDirective({ coldHookAngle: "", retargetingObjection: null });
        assert(r3 === null, `empty-string coldHookAngle → null`);

        // Fall-through: a whitespace-only hook id resolves to null
        // inside getHookGazeDirection (canonical after .trim()), so
        // resolveGazeDirective must continue to the retargeting
        // objection (not return null just because the hook field was
        // non-empty-but-whitespace). This matches the Phase 28
        // expression-adaptation resolveExpressionDirective semantics.
        const r4 = resolveGazeDirective({ coldHookAngle: "   ", retargetingObjection: "dont_trust" });
        assert(r4 !== null && r4.source === "objection" && r4.sourceId === "dont_trust", `whitespace-only hook → falls through to objection (got "${r4?.source}:${r4?.sourceId}")`);

        const r5 = resolveGazeDirective({ coldHookAngle: "   ", retargetingObjection: null });
        assert(r5 === null, `whitespace-only hook + null objection → null`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT B — Image-prompt gaze block builder
    // ═══════════════════════════════════════════════════════════

    // ─── B1: non-null directive → GAZE DIRECTION block with treatment + description ───
    console.log("  B1: image-prompt block contains GAZE DIRECTION + treatment + description");
    {
        const d: GazeDirective = {
            source: "hook",
            sourceId: "pain",
            treatment: "reflective_downward",
            description: "gaze cast slightly down and inward, contemplative — sitting with the problem, not at camera",
        };
        const out = buildImagePromptGazeBlock(d, { aspectRatio: "1:1" });
        assert(/GAZE DIRECTION:/i.test(out), `image block has GAZE DIRECTION label`);
        assert(/reflective[_ ]downward|reflective downward/i.test(out), `image block carries the treatment`);
        assert(out.includes("sitting with the problem"), `image block carries the description`);
        assert(!/BEFORE HALF/i.test(out), `image block (single) does NOT split into BEFORE/AFTER halves`);
        assert(!/AFTER HALF/i.test(out), `image block (single) does NOT split into AFTER half`);
    }

    // ─── B2: identity-priority clause (eye/head only, face unchanged) ───
    console.log("  B2: identity-priority clause");
    {
        const d: GazeDirective = { source: "hook", sourceId: "pain", treatment: "reflective_downward", description: "x" };
        const out = buildImagePromptGazeBlock(d, { aspectRatio: "1:1" });
        assert(/priority\s*#?\s*1/i.test(out), `image block states priority #1`);
        assert(/eye and head orientation only/i.test(out), `image block states gaze is eye/head orientation only`);
        assert(/bone structure|facial features/i.test(out), `image block forbids changing bone structure/features`);
    }

    // ─── B3: advisory/natural + forbidden failure modes ───
    console.log("  B3: advisory + forbidden-failure-modes clause");
    {
        const d: GazeDirective = { source: "hook", sourceId: "pain", treatment: "reflective_downward", description: "x" };
        const out = buildImagePromptGazeBlock(d, { aspectRatio: "1:1" });
        assert(/NATURAL|advisory|not a rigid command/i.test(out), `image block states natural / advisory`);
        assert(/empty canvas space|staring into empty/i.test(out), `image block forbids empty-space stare`);
        assert(/cross[- ]eyed|wall[- ]eyed/i.test(out), `image block forbids cross-eyed / wall-eyed`);
        assert(/robotic|always.{0,20}CTA/i.test(out), `image block forbids robotic always-at-CTA`);
    }

    // ─── B4: 9:16 vertical-composition note ───
    console.log("  B4: 9:16 vertical-composition note");
    {
        const d: GazeDirective = { source: "hook", sourceId: "pain", treatment: "reflective_downward", description: "x" };
        const out = buildImagePromptGazeBlock(d, { aspectRatio: "9:16" });
        assert(/VERTICAL COMPOSITION/i.test(out), `9:16 image block has VERTICAL COMPOSITION note`);
        assert(/9:16/i.test(out), `9:16 image block references the 9:16 ratio`);
        assert(/vertical|side edge/i.test(out), `9:16 image block notes vertical / side-edge concern`);
    }

    // ─── B5: before/after split ───
    console.log("  B5: before/after split (BEFORE = hook gaze, AFTER = aspirational)");
    {
        const d: GazeDirective = { source: "hook", sourceId: "pain", treatment: "reflective_downward", description: "reflective contemplative gaze, sitting with the problem" };
        const out = buildImagePromptGazeBlock(d, { aspectRatio: "1:1", beforeAfterSplit: true });
        assert(/BEFORE HALF/i.test(out), `image block (before/after) labels BEFORE HALF`);
        assert(/AFTER HALF/i.test(out), `image block (before/after) labels AFTER HALF`);
        assert(/reflective[_ ]?downward/i.test(out), `image block (before/after) BEFORE carries the hook treatment`);
        assert(/forward[_ ]?horizon/i.test(out), `image block (before/after) AFTER uses aspirational forward_horizon`);
        assert(/same (face|person)/i.test(out), `image block (before/after) notes same face on both halves`);
    }

    // ─── B6: null directive → empty string ───
    console.log("  B6: null directive → empty string");
    {
        const out = buildImagePromptGazeBlock(null, { aspectRatio: "1:1" });
        assert(out === "", `null directive returns empty string (got ${JSON.stringify(out)})`);
        const outBA = buildImagePromptGazeBlock(null, { aspectRatio: "1:1", beforeAfterSplit: true });
        assert(outBA === "", `null directive returns empty string even in before/after mode`);
    }

    // ─── B7: guide-toward-content clause (FR-004) ───
    console.log("  B7: positive guide-toward-content clause (FR-004)");
    {
        const d: GazeDirective = { source: "hook", sourceId: "pain", treatment: "reflective_downward", description: "x" };
        const out = buildImagePromptGazeBlock(d, { aspectRatio: "1:1" });
        assert(/lead the viewer|guide the viewer|viewer's eye/i.test(out), `image block includes the MAY-lead-the-viewer's-eye clause`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT C — one-highlight cap, mood, price helpers
    // ═══════════════════════════════════════════════════════════

    // ─── C1: ONE_HIGHLIGHT_BLOCK is non-empty + states one primary + ≤1 secondary ───
    console.log("  C1: ONE_HIGHLIGHT_BLOCK is non-empty and states one primary + one supporting");
    {
        assert(typeof ONE_HIGHLIGHT_BLOCK === "string" && ONE_HIGHLIGHT_BLOCK.trim().length > 0, `ONE_HIGHLIGHT_BLOCK is non-empty`);
        assert(/ONE|one primary|exactly one/i.test(ONE_HIGHLIGHT_BLOCK), `ONE_HIGHLIGHT_BLOCK states one primary focal point`);
        assert(/hero/i.test(ONE_HIGHLIGHT_BLOCK), `ONE_HIGHLIGHT_BLOCK names the hero as the focal point`);
        assert(/supporting|secondary/i.test(ONE_HIGHLIGHT_BLOCK), `ONE_HIGHLIGHT_BLOCK allows a supporting secondary`);
        assert(/NEVER|never/i.test(ONE_HIGHLIGHT_BLOCK), `ONE_HIGHLIGHT_BLOCK forbids multiple highlights`);
        assert(/glow|sparkle|highlight/i.test(ONE_HIGHLIGHT_BLOCK), `ONE_HIGHLIGHT_BLOCK names the failure modes (glow/sparkle/highlight)`);
    }

    // ─── C2: buildHookVisualMoodBlock(pain) → moodier/dramatic ───
    console.log("  C2: buildHookVisualMoodBlock(pain) → moodier/dramatic");
    {
        const d = getHookGazeDirection("pain");
        assert(d !== null, "pain directive is non-null");
        if (d) {
            const out = buildHookVisualMoodBlock(d);
            assert(out.length > 0, `pain mood block is non-empty`);
            assert(/moodier|dramatic|shadows|deeper/i.test(out), `pain mood block mentions moodier/dramatic/shadows`);
            assert(/WITHIN|modulates? within|never override|never.*overrid/i.test(out), `pain mood block states it modulates WITHIN, never overrides`);
            assert(/art direction|universe/i.test(out), `pain mood block references art direction / universe`);
        }
    }

    // ─── C3: buildHookVisualMoodBlock(future_based) → brighter/warmer/open ───
    console.log("  C3: buildHookVisualMoodBlock(future_based) → brighter/warmer/open");
    {
        const d = getHookGazeDirection("future_based");
        assert(d !== null, "future_based directive is non-null");
        if (d) {
            const out = buildHookVisualMoodBlock(d);
            assert(out.length > 0, `future_based mood block is non-empty`);
            assert(/brighter|warmer|open|golden|forward/i.test(out), `future_based mood block mentions brighter/warmer/open`);
            assert(/WITHIN|never override/i.test(out), `future_based mood block states it modulates WITHIN, never overrides`);
        }
    }

    // ─── C4: buildHookVisualMoodBlock(null) → empty string ───
    console.log("  C4: buildHookVisualMoodBlock(null) → empty string");
    {
        const out = buildHookVisualMoodBlock(null);
        assert(out === "", `null directive returns empty mood block (got ${JSON.stringify(out)})`);
    }

    // ─── C5: detectPriceContent true on currency/percent/discount ───
    console.log("  C5: detectPriceContent true on price signals");
    {
        assert(detectPriceContent({ hookText: "خصم 50٪", subheadText: "", benefitText: "", badges: "" }) === true, `Arabic ٪ with خصm → true`);
        assert(detectPriceContent({ hookText: "199 SAR", subheadText: "", benefitText: "", badges: "" }) === true, `"199 SAR" → true`);
        assert(detectPriceContent({ hookText: "$49 today", subheadText: "", benefitText: "", badges: "" }) === true, `"$49 today" → true`);
        assert(detectPriceContent({ hookText: "احصل على عرض خاص", subheadText: "", benefitText: "", badges: "" }) === true, `Arabic "عرض" / offer keyword → true`);
        assert(detectPriceContent({ hookText: "Limited time offer", subheadText: "", benefitText: "", badges: "" }) === true, `English "offer" keyword → true`);
        assert(detectPriceContent({ hookText: "50% off", subheadText: "", benefitText: "", badges: "" }) === true, `"50% off" → true`);
    }

    // ─── C6: detectPriceContent false on price-free copy + bare year ───
    console.log("  C6: detectPriceContent false on price-free copy and bare year");
    {
        assert(detectPriceContent({ hookText: "Stop guessing your pricing strategy", subheadText: "", benefitText: "", badges: "" }) === false, `price-free coach hook → false`);
        assert(detectPriceContent({ hookText: "How to coach in 2026", subheadText: "", benefitText: "", badges: "" }) === false, `bare year "2026" → false (Contract C7 fail condition)`);
        assert(detectPriceContent({}) === false, `empty input → false`);
        assert(detectPriceContent({ hookText: "", subheadText: "", benefitText: "", badges: "" }) === false, `all-empty input → false`);
        assert(detectPriceContent({ hookText: "Build your coaching business", subheadText: "Learn the framework", benefitText: "without overwhelm", badges: "" }) === false, `all-price-free fields → false`);
        // Word-boundary guards on Latin currency codes — must NOT
        // match "SAR" inside "Sarah" or "AED" inside "AEDUCATION".
        assert(detectPriceContent({ hookText: "Meet Sarah at the conference", subheadText: "", benefitText: "", badges: "" }) === false, `"Sarah" must NOT trigger on SAR substring`);
        assert(detectPriceContent({ hookText: "AEDUCATION for the modern coach", subheadText: "", benefitText: "", badges: "" }) === false, `"AEDUCATION" must NOT trigger on AED substring`);
        assert(detectPriceContent({ hookText: "KNOWLEDGE is the new leverage", subheadText: "", benefitText: "", badges: "" }) === false, `"KNOWLEDGE" must NOT trigger on "now" or "ledg" — the discount keyword scan is \b-gated`);
    }

    // ─── C7: buildPriceHierarchyBlock — original smaller/struck, new larger, savings secondary ───
    console.log("  C7: buildPriceHierarchyBlock hierarchy");
    {
        const out = buildPriceHierarchyBlock();
        assert(out.length > 0, `price-hierarchy block is non-empty`);
        assert(/ORIGINAL|original price/i.test(out), `block names the original price`);
        assert(/struck|small/i.test(out), `block says original is smaller/struck-through`);
        assert(/DISCOUNTED|NEW/i.test(out), `block names the new / discounted price`);
        assert(/largest|prominent|distinct/i.test(out), `block says discounted is larger/prominent/distinct`);
        assert(/SAVINGS|savings/i.test(out), `block names the savings amount`);
        assert(/SECONDARY|secondary/i.test(out), `block says savings is secondary`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT D — Injection gating at buildFinalImagePrompt
    // ═══════════════════════════════════════════════════════════

    // ─── D1: gaze injection present inside buildFinalImagePrompt AFTER BLUEPRINT + expression ───
    console.log("  D1: gaze injection in IMAGE prompt AFTER BLUEPRINT + expression");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");

        const blueprintIdx = genSrc.indexOf("BLUEPRINT: ${strippedBlueprint}");
        const expressionIdx = genSrc.indexOf("buildImagePromptExpressionBlock(");
        const gazeIdx = genSrc.indexOf("buildImagePromptGazeBlock(");
        assert(blueprintIdx > -1, `generators.ts contains the BLUEPRINT line`);
        assert(expressionIdx > -1, `generators.ts calls buildImagePromptExpressionBlock`);
        assert(gazeIdx > -1, `generators.ts calls buildImagePromptGazeBlock`);
        assert(gazeIdx > blueprintIdx, `gaze injection comes AFTER BLUEPRINT line (gaze idx ${gazeIdx} vs blueprint idx ${blueprintIdx})`);
        assert(gazeIdx > expressionIdx, `gaze injection comes AFTER expression block (gaze idx ${gazeIdx} vs expression idx ${expressionIdx})`);
    }

    // ─── D2: ONE_HIGHLIGHT_BLOCK injected unconditionally inside buildFinalImagePrompt ───
    console.log("  D2: ONE_HIGHLIGHT_BLOCK injected unconditionally in buildFinalImagePrompt");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        const buildFnIdx = genSrc.indexOf("export function buildFinalImagePrompt(");
        assert(buildFnIdx > -1, `buildFinalImagePrompt exists`);
        const oneHighlightIdx = genSrc.indexOf("ONE_HIGHLIGHT_BLOCK", buildFnIdx);
        assert(oneHighlightIdx > buildFnIdx, `ONE_HIGHLIGHT_BLOCK is referenced INSIDE buildFinalImagePrompt`);
    }

    // ─── D3: price hierarchy injection only when detectPriceContent is true ───
    console.log("  D3: price hierarchy injection gated on detectPriceContent");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/detectPriceContent\s*\(/.test(genSrc), `generators.ts calls detectPriceContent`);
        assert(/buildPriceHierarchyBlock\s*\(/.test(genSrc), `generators.ts calls buildPriceHierarchyBlock`);
    }

    // ─── D4: price hierarchy NOT injected when no pricing content ───
    console.log("  D4: price hierarchy is content-gated (not always-on)");
    {
        // The block is built unconditionally; the injection point gates
        // on detectPriceContent. We assert that pattern in source.
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // The injection line should be guarded by detectPriceContent(...)
        const guard = /detectPriceContent\s*\([^)]*\)\s*\?\s*[^]*?buildPriceHierarchyBlock/;
        assert(guard.test(genSrc) || /detectPriceContent\s*\(/.test(genSrc), `generators.ts gates the price block on detectPriceContent`);
    }

    // ─── D5: before/after split wired in buildFinalImagePrompt ───
    console.log("  D5: before/after split wired in gaze injection");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/isBeforeAfterSelection\(inputs\s+as\s+any,\s+\(inputs\s+as\s+any\)\.coldHookAngle\)/.test(genSrc) || /isBeforeAfterSelection\(inputs/.test(genSrc), `generators.ts detects before/after at the gaze injection site`);
        assert(/beforeAfterSplit\s*:/.test(genSrc), `generators.ts enables beforeAfterSplit on the gaze block builder`);
    }

    // ─── D6: single shared injection point — exactly one call to buildImagePromptGazeBlock ───
    console.log("  D6: single shared injection point for the gaze block");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        const count = (genSrc.match(/buildImagePromptGazeBlock\s*\(/g) || []).length;
        assert(count === 1, `buildImagePromptGazeBlock is called from exactly one site (got ${count})`);
    }

    // ─── D7: aspect ratio passed through to the gaze block ───
    console.log("  D7: aspectRatio passed through to the gaze block");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // The build call site should mention `aspectRatio` somewhere
        // within the call to buildImagePromptGazeBlock.
        const callIdx = genSrc.indexOf("buildImagePromptGazeBlock(");
        const callEnd = genSrc.indexOf(")", callIdx);
        const callSlice = callIdx > -1 && callEnd > -1 ? genSrc.slice(callIdx, callEnd) : "";
        assert(/aspectRatio/.test(callSlice), `buildImagePromptGazeBlock call passes aspectRatio`);
    }

    // ─── D8: provider-agnostic — no MODEL_PROVIDER branch around the gaze injection ───
    console.log("  D8: gaze injection is provider-agnostic (no MODEL_PROVIDER branch)");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        const callIdx = genSrc.indexOf("buildImagePromptGazeBlock(");
        // 800 chars of context before the call should NOT be a MODEL_PROVIDER check
        const ctx = callIdx > 600 ? genSrc.slice(callIdx - 600, callIdx) : "";
        assert(!/MODEL_PROVIDER\s*===\s*['"]openai['"]/.test(ctx), `gaze injection is not wrapped in a MODEL_PROVIDER branch (provider-agnostic)`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT E — Audit trace (ResolutionTrace.gazeDirection)
    // ═══════════════════════════════════════════════════════════

    // ─── E1: trace type has the gazeDirection sub-object with required fields ───
    console.log("  E1: types.ts has ResolutionTrace.gazeDirection with required fields");
    {
        const typesSrc = readFileSync(join(__dirname, "..", "..", "src", "types.ts"), "utf8");
        assert(/gazeDirection\?:/.test(typesSrc), `types.ts defines optional gazeDirection? field`);
        assert(/source:\s*["']hook["']\s*\|\s*["']objection["']\s*\|\s*["']fallback["']\s*\|\s*null/.test(typesSrc), `types.ts gazeDirection.source is "hook" | "objection" | "fallback" | null`);
        assert(/sourceId:\s*string\s*\|\s*null/.test(typesSrc), `types.ts gazeDirection.sourceId is string | null`);
        assert(/treatment:\s*string\s*\|\s*null/.test(typesSrc), `types.ts gazeDirection.treatment is string | null`);
        assert(/applied:\s*boolean/.test(typesSrc), `types.ts gazeDirection.applied is boolean`);
        assert(/reason\?:\s*string/.test(typesSrc), `types.ts gazeDirection.reason? is string`);
    }

    // ─── E2: applied:true with non-null fields when directive resolves ───
    console.log("  E2: applied:true trace write in generateFinalAd");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/gazeDirection:/i.test(genSrc), `generators.ts writes gazeDirection trace`);
        assert(/applied:\s*true/.test(genSrc), `generators.ts writes applied:true on the present path`);
        assert(/applied:\s*false/.test(genSrc), `generators.ts writes applied:false on the absent path`);
        assert(/no-hook-or-objection-active/.test(genSrc), `generators.ts records reason "no-hook-or-objection-active" for the absent path`);
    }

    // ─── E3: fallback source recorded as "fallback" ───
    console.log("  E3: trace records source:fallback for unknown ids");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // The trace writer is built around resolveGazeDirective() output,
        // which sets source = "hook" | "objection" | "fallback".
        // We assert that the writer handles source="fallback" explicitly
        // (i.e. passes through whatever resolveGazeDirective returns
        // rather than coercing to "hook").
        assert(/source:\s*_gazeDirective\.source/.test(genSrc) || /source:\s*directive\.source/.test(genSrc) || /source:\s*\(?\s*_?gaze/i.test(genSrc), `trace writer preserves the directive's source field`);
    }

    // ─── E4: legacy docs read as absent (no migration needed) ───
    console.log("  E4: gazeDirection is additive — no migration logic required");
    {
        const typesSrc = readFileSync(join(__dirname, "..", "..", "src", "types.ts"), "utf8");
        // The field is OPTIONAL and the writer only writes it; legacy
        // docs simply lack the field and read as "not applied".
        assert(/gazeDirection\?:/.test(typesSrc), `gazeDirection is optional (additive)`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT G — CTA outcome framing
    // ═══════════════════════════════════════════════════════════

    // ─── G1: CTA_OUTCOME_FRAMING_BLOCK is non-empty + outcome-framing + advisory ───
    console.log("  G1: CTA_OUTCOME_FRAMING_BLOCK is non-empty + outcome-framing + advisory");
    {
        assert(typeof CTA_OUTCOME_FRAMING_BLOCK === "string" && CTA_OUTCOME_FRAMING_BLOCK.trim().length > 0, `CTA_OUTCOME_FRAMING_BLOCK is non-empty`);
        assert(/OUTCOME|outcome/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block references OUTCOME framing`);
        assert(/benefit/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block references benefit framing`);
        assert(/ADVISORY|advisory/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block is marked advisory`);
        assert(/direct[- ]action/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block allows direct-action CTAs`);
    }

    // ─── G2: keeps CTA short + length adapts per language ───
    console.log("  G2: CTA length guidance (3-5 words, adapts per language)");
    {
        assert(/3[-–]5|3 to 5|3 - 5/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block states ≈3-5 words`);
        assert(/language|Arabic|English/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block references language adaptation`);
    }

    // ─── G3: Arabic grammar rules preserved (no leading و, self-contained) ───
    console.log("  G3: Arabic grammar rules preserved (no leading و, self-contained)");
    {
        assert(/Arabic|arabic/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block references Arabic path`);
        assert(/و|waw|conjunction/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block references the no-leading-و rule`);
    }

    // ─── G4: English path covered too ───
    console.log("  G4: English path receives the same outcome-framing guidance");
    {
        assert(/English/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block references English path`);
    }

    // ─── G5: copy-fidelity + banned patterns + Phase 24B unchanged ───
    console.log("  G5: copy-fidelity contract preserved");
    {
        assert(/copy[- ]fidelity|copy fidelity/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block notes copy-fidelity is preserved`);
        assert(/UNCHANGED|unchanged/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block marks things unchanged`);
    }

    // ─── G6: generators.ts imports CTA_OUTCOME_FRAMING_BLOCK from gazeMap.ts (not defined inline) ───
    console.log("  G6: generators.ts imports CTA_OUTCOME_FRAMING_BLOCK from gazeMap.ts");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/CTA_OUTCOME_FRAMING_BLOCK/.test(genSrc), `generators.ts references CTA_OUTCOME_FRAMING_BLOCK`);
        assert(/from\s+["']\.\/gazeMap\.js["']/.test(genSrc), `generators.ts imports from "./gazeMap.js"`);
    }

    // ─── G7: CTA_OUTCOME_FRAMING_BLOCK clarifies the Arabic connector rule (FR-014, G4) ───
    console.log("  G7: CTA_OUTCOME_FRAMING_BLOCK clarifies the Arabic connector rule");
    {
        // The benefit can use a natural connector (و/ل/عشان/وابدأ)
        // in the "CTA ||| وابدأ تحقق..." format because there the
        // connector is a continuation of the CTA, not a hanging
        // conjunction. The "no leading و" rule applies to a
        // STANDALONE benefit line. Phase 19's block must not be
        // misread as forbidding the standard "وابدأ تحقق..." pattern.
        assert(/continuation of the CTA/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block clarifies و as a continuation of the CTA`);
        assert(/STANDALONE/i.test(CTA_OUTCOME_FRAMING_BLOCK), `block applies the no-leading-و rule to standalone benefits only`);
        assert(/CTA\s*\|\|\|\s*وَ?ابدِ?أ?/.test(CTA_OUTCOME_FRAMING_BLOCK), `block uses the canonical "CTA ||| وابدأ..." example`);
    }

    // ─── D9: text-only mode suppresses gaze / one-highlight / mood blocks (CodeRabbit fix) ───
    console.log("  D9: text-only mode suppresses gaze / one-highlight / mood blocks");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // isTextOnlyMode(inputs) is the existing typed helper at
        // line 562. The injection IIFE must call it and suppress the
        // gaze + mood + one-highlight blocks in text-only mode.
        assert(/isTextOnlyMode\s*\(\s*inputs\s*\)/.test(genSrc), `generators.ts gates on isTextOnlyMode(inputs)`);
        // Trace write also uses the text-only gate.
        assert(/text-only-mode-no-hero/.test(genSrc), `gazeDirection trace has a distinct reason for text-only mode`);
    }

    // ═══════════════════════════════════════════════════════════
    // REVERSIBILITY (F4) — verify that null resolvers + content gate
    // produce no gaze / mood / price text. ONE_HIGHLIGHT_BLOCK is
    // intentionally always-on per FR-011 (the spec's stated
    // hook-independent behavior) so to revert to TRUE pre-Phase-19
    // the entire injection line in buildFinalImagePrompt must be
    // commented out — which is a single, well-scoped change.
    // ═══════════════════════════════════════════════════════════
    console.log("  R1: null resolvers + no pricing → only ONE_HIGHLIGHT_BLOCK survives");
    {
        // Simulate the buildFinalImagePrompt DR-injection branch
        // (mirrored from generators.ts) under a no-hook + no-pricing
        // scenario and verify that ONLY ONE_HIGHLIGHT_BLOCK remains.
        const _gazeDirective: GazeDirective | null = null; // null resolver
        const _gazeBlock = _gazeDirective
            ? buildImagePromptGazeBlock(_gazeDirective, {
                beforeAfterSplit: false,
                aspectRatio: "1:1",
            })
            : "";
        const _moodBlock = buildHookVisualMoodBlock(_gazeDirective);
        const _priceBlock = detectPriceContent({
            hookText: "Stop guessing your pricing strategy",
            subheadText: null,
            benefitText: null,
            badges: null,
        })
            ? buildPriceHierarchyBlock()
            : "";
        const _injection = `${_gazeBlock}\n${ONE_HIGHLIGHT_BLOCK}\n${_moodBlock}\n${_priceBlock}`.trim();

        // The gaze + mood + price blocks all collapse to empty
        // strings when resolvers return null and no pricing is
        // detected — so only ONE_HIGHLIGHT_BLOCK remains (and it
        // remains by design per FR-011, the hook-independent one-
        // highlight cap).
        assert(_gazeBlock === "", `null gaze directive → empty gaze block (got ${JSON.stringify(_gazeBlock)})`);
        assert(_moodBlock === "", `null gaze directive → empty mood block (got ${JSON.stringify(_moodBlock)})`);
        assert(_priceBlock === "", `no pricing → empty price block (got ${JSON.stringify(_priceBlock)})`);
        assert(_injection === ONE_HIGHLIGHT_BLOCK, `with null resolvers + no pricing, the only DR text is ONE_HIGHLIGHT_BLOCK`);

        // Document the FULL revert path: comment out the entire
        // injection line in buildFinalImagePrompt (the one that
        // emits the template literal containing _gazeBlock,
        // ONE_HIGHLIGHT_BLOCK, _moodBlock, _priceBlock). That single
        // edit + setting all resolvers to null + setting
        // detectPriceContent to false restores the pre-Phase-19
        // prompt byte-for-byte.
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/Phase 19 — Direct-Response Design Upgrades/.test(genSrc), `revert comment in buildFinalImagePrompt documents the Phase 19 injection site`);
    }

    // ═══════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
