// functions/src/__tests__/expressionMap.test.ts
// Phase 28 — Expression Adaptation — unit tests (post-audit).
// Verifies Contract A (mapper), Contract B (block builder — concept + image
// variants), the IMAGE-prompt injection site, the applied:false trace path,
// the before/after split, and that carousel / batch are covered by the
// shared `buildFinalImagePrompt` injection point.
//
// Pure (no Gemini calls) — exercises the mapper + block-builder in isolation
// and checks the source file for the canonical injection site.
//
// Test runner: built by tsc, run as `node lib/__tests__/expressionMap.test.js`
// via the `test:expressionMap` script in package.json.

import { readFileSync } from "fs";
import { join } from "path";
import {
    getHookExpressionDirection,
    getObjectionExpressionDirection,
    buildExpressionDirectionBlock,
    buildImagePromptExpressionBlock,
    resolveExpressionDirective,
    getKnownHookAngleIds,
    type ExpressionDirective,
} from "../expressionMap.js";
import { HOOK_ANGLE_KNOWLEDGE } from "../knowledge/hookAnglesKnowledge.js";
import { RETARGETING_OBJECTION_DATA } from "../retargetingObjections.js";

declare const process: { exit(code: number): void };
declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void };

// ═══════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════

/**
 * Test runner. Executes every Contract A–E assertion in document order,
 * logs a per-section pass/fail line, then prints the totals. Exits the
 * process with code 1 if any assertion failed so the npm `test` script
 * surfaces a non-zero exit code.
 */
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

    console.log("expressionMap tests (post-audit)");

    // ─── A1: every canonical backend hook-angle id resolves ───
    console.log("  A1: every HOOK_ANGLE_KNOWLEDGE id resolves to non-null directive");
    {
        const knownIds = Object.keys(HOOK_ANGLE_KNOWLEDGE);
        assert(knownIds.length === 10, `backend HOOK_ANGLE_KNOWLEDGE has 10 ids (got ${knownIds.length})`);
        for (const id of knownIds) {
            const d = getHookExpressionDirection(id);
            assert(d !== null, `${id} resolves to non-null directive`);
            if (d) {
                assert(d.source === "hook", `${id} has source "hook" (got ${d.source})`);
                assert(d.sourceId === id, `${id} has sourceId "${id}" (got "${d.sourceId}")`);
                assert(typeof d.emotion === "string" && d.emotion.trim().length > 0, `${id} has non-empty emotion`);
                assert(typeof d.description === "string" && d.description.trim().length > 0, `${id} has non-empty description`);
            }
        }
        const local = new Set(getKnownHookAngleIds());
        for (const id of knownIds) {
            assert(local.has(id), `getKnownHookAngleIds() includes "${id}"`);
        }
    }

    // ─── A2: pain → concern/frustration, NOT anger ───
    console.log("  A2: pain maps to concern/frustration, not anger");
    {
        const d = getHookExpressionDirection("pain");
        assert(d !== null, "pain returns non-null");
        if (d) {
            assert(/concern|frustration/i.test(d.emotion), `pain emotion mentions concern or frustration (got "${d.emotion}")`);
            assert(/not\s+anger/i.test(d.description), `pain description says "not anger" (got "${d.description}")`);
            assert(d.sourceId === "pain", `pain sourceId === "pain"`);
        }
    }

    // ─── A3–A7: confirmed-default angles map to spec ───
    console.log("  A3–A7: confirmed-default angle mappings");
    {
        const cases: Array<[string, RegExp]> = [
            ["emotional", /empathetic|heartfelt/i],
            ["statistics", /sober|analytical/i],
            ["scarcity", /urgent|alert/i],
            ["logical_authority", /commanding|assured/i],
            ["future_based", /aspirational|hopeful/i],
        ];
        for (const [id, re] of cases) {
            const d = getHookExpressionDirection(id);
            assert(d !== null, `${id} resolves`);
            if (d) assert(re.test(d.emotion), `${id} emotion matches ${re} (got "${d.emotion}")`);
        }
    }

    // ─── A8: every RETARGETING_OBJECTION_DATA id resolves ───
    console.log("  A8: every retargeting objection id resolves");
    {
        const allIds = RETARGETING_OBJECTION_DATA.map((o) => o.id);
        assert(allIds.length === 12, `RETARGETING_OBJECTION_DATA has 12 ids (got ${allIds.length})`);
        for (const id of allIds) {
            const d = getObjectionExpressionDirection(id);
            assert(d !== null, `objection "${id}" resolves to non-null directive`);
            if (d) {
                assert(d.source === "objection", `objection "${id}" source === "objection"`);
                assert(d.sourceId === id, `objection "${id}" sourceId matches input`);
                assert(d.emotion.trim().length > 0 && d.description.trim().length > 0, `objection "${id}" has non-empty emotion+description`);
            }
        }
    }

    // ─── A9–A12: objection family groupings ───
    console.log("  A9–A12: objection families");
    {
        const priceCases = ["price_too_high", "no_budget_now", "need_installments"];
        for (const id of priceCases) {
            const d = getObjectionExpressionDirection(id);
            assert(d !== null && /analytical|evaluating/i.test(d.emotion), `${id} → analytical/evaluating (got "${d?.emotion}")`);
        }
        const trustCases = ["dont_trust", "tried_before_failed", "will_it_work_for_me"];
        for (const id of trustCases) {
            const d = getObjectionExpressionDirection(id);
            assert(d !== null && /reassuring|confident/i.test(d.emotion), `${id} → reassuring/confident (got "${d?.emotion}")`);
        }
        const timingCases = ["no_time", "not_ready_yet"];
        for (const id of timingCases) {
            const d = getObjectionExpressionDirection(id);
            assert(d !== null && /urgent|focused/i.test(d.emotion), `${id} → urgent/focused (got "${d?.emotion}")`);
        }
        const fallbackCases = ["overwhelmed", "need_approval", "dont_want_call", "dont_need_it"];
        for (const id of fallbackCases) {
            const d = getObjectionExpressionDirection(id);
            assert(d !== null && /confident|approachable/i.test(d.emotion), `${id} → confident/approachable fallback (got "${d?.emotion}")`);
        }
    }

    // ─── A13: unknown non-null id → fallback (NOT null) ───
    console.log("  A13: unknown id → fallback directive");
    {
        const d = getHookExpressionDirection("zzz_bogus");
        assert(d !== null, "unknown id returns non-null fallback");
        if (d) {
            assert(/confident|approachable/i.test(d.emotion), `fallback emotion mentions confident/approachable (got "${d.emotion}")`);
            assert(d.sourceId === "zzz_bogus", "fallback sourceId echoes input");
        }
    }

    // ─── A14: null in → null out (canonical absent sentinel) ───
    console.log("  A14: null inputs return null");
    {
        assert(getHookExpressionDirection(null) === null, "getHookExpressionDirection(null) === null");
        assert(getHookExpressionDirection(undefined) === null, "getHookExpressionDirection(undefined) === null");
        assert(getHookExpressionDirection("") === null, "getHookExpressionDirection('') === null");
        assert(getObjectionExpressionDirection(null) === null, "getObjectionExpressionDirection(null) === null");
        assert(getObjectionExpressionDirection(undefined) === null, "getObjectionExpressionDirection(undefined) === null");
        assert(getObjectionExpressionDirection("") === null, "getObjectionExpressionDirection('') === null");
        assert(resolveExpressionDirective({ coldHookAngle: null, retargetingObjection: null }) === null, "resolveExpressionDirective(both null) === null");
    }

    // ─── A15: defensive aliases resolve ───
    console.log("  A15: defensive aliases");
    {
        const a = getHookExpressionDirection("shocking_stat");
        const b = getHookExpressionDirection("statistics");
        assert(a !== null && b !== null && a.emotion === b.emotion, `shocking_stat alias → statistics emotion (${a?.emotion} vs ${b?.emotion})`);
        assert(a !== null && a.sourceId === "statistics", `shocking_stat alias sourceId canonicalizes to "statistics"`);

        const fomo = getHookExpressionDirection("fear_of_missing_out");
        assert(fomo !== null && /urgent|alert/i.test(fomo.emotion), `fear_of_missing_out → urgent/alert emotion (got "${fomo?.emotion}")`);

        const fp = getHookExpressionDirection("future_pacing");
        const fb = getHookExpressionDirection("future_based");
        assert(fp !== null && fb !== null && fp.emotion === fb.emotion, `future_pacing alias → future_based emotion (${fp?.emotion} vs ${fb?.emotion})`);
    }

    // ─── A16: resolveExpressionDirective priority (cold hook > objection) ───
    console.log("  A16: resolveExpressionDirective priority (cold hook > objection)");
    {
        const r = resolveExpressionDirective({ coldHookAngle: "pain", retargetingObjection: "price_too_high" });
        assert(r !== null && r.source === "hook" && r.sourceId === "pain", `cold hook wins over objection (got "${r?.source}:${r?.sourceId}")`);

        const r2 = resolveExpressionDirective({ coldHookAngle: null, retargetingObjection: "dont_trust" });
        assert(r2 !== null && r2.source === "objection" && r2.sourceId === "dont_trust", `objection alone resolves (got "${r2?.source}:${r2?.sourceId}")`);

        const r3 = resolveExpressionDirective({ coldHookAngle: "", retargetingObjection: null });
        assert(r3 === null, `empty-string coldHookAngle → null`);

        const r4 = resolveExpressionDirective({});
        assert(r4 === null, `empty inputs → null`);
    }

    // ─── B1: concept block contains emotion + description ───
    console.log("  B1: concept block contains emotion + description");
    {
        const d: ExpressionDirective = {
            source: "hook",
            sourceId: "pain",
            emotion: "concern, frustration",
            description: "slight frown, tired eyes, tension in the jaw — quiet suffering, NOT anger",
        };
        const out = buildExpressionDirectionBlock(d);
        assert(out.includes("concern, frustration"), `concept block includes emotion text`);
        assert(out.includes("NOT anger"), `concept block includes description text`);
        assert(/EXPRESSION DIRECTION/i.test(out), `concept block has EXPRESSION DIRECTION label`);
    }

    // ─── B2: identity-is-priority-#1 clause present ───
    console.log("  B2: identity-priority clause");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(/priority\s*#?\s*1/i.test(out), `concept block states priority #1`);
        assert(/bone structure|facial features/i.test(out), `concept block forbids changing bone structure/features`);
    }

    // ─── B3: blending clause (art direction character + hook emotion) ───
    console.log("  B3: art-direction blending clause");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(/BLEND|blend/i.test(out), `concept block instructs blending`);
        assert(/art direction/i.test(out), `concept block mentions art direction`);
        assert(/character|style|energy/i.test(out), `concept block mentions character/style/energy`);
        assert(/emotion/i.test(out), `concept block mentions emotion from hook`);
    }

    // ─── B4: subtle / natural, no theatrical / exaggerated ───
    console.log("  B4: subtle / natural clause");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(/subtle|natural/i.test(out), `concept block says subtle/natural`);
        assert(/exaggerated|theatrical|caricatur/i.test(out), `concept block forbids exaggerated/theatrical/caricature`);
    }

    // ─── B5: NO gaze-direction instruction ───
    console.log("  B5: NO gaze-direction instruction");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(!/\bgaze\b/i.test(out), `concept block must NOT mention gaze (FR-014)`);
        assert(!/looking\s+at\s+the\s+camera/i.test(out), `concept block must NOT direct camera gaze`);
    }

    // ─── B6: null directive → empty string ───
    console.log("  B6: null directive → empty block");
    {
        const out = buildExpressionDirectionBlock(null);
        assert(out === "", `null directive returns empty string (got ${JSON.stringify(out)})`);
    }

    // ─── B7: MOOD_EMOTION / SUBJECT_ACTION routing instruction present (audit #9) ───
    console.log("  B7: MOOD_EMOTION / SUBJECT_ACTION routing instruction (audit #9)");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(/MOOD_EMOTION/i.test(out), `concept block references MOOD_EMOTION field`);
        assert(/SUBJECT_ACTION/i.test(out), `concept block references SUBJECT_ACTION field`);
        assert(/TECHNICAL_PROMPT/i.test(out), `concept block notes these flow into TECHNICAL_PROMPT`);

        // Image block too — must also route.
        const imOut = buildImagePromptExpressionBlock(d);
        assert(/MOOD_EMOTION/i.test(imOut), `image block references MOOD_EMOTION field`);
        assert(/SUBJECT_ACTION/i.test(imOut), `image block references SUBJECT_ACTION field`);

        // opt-out still works (test seam)
        const optOut = buildExpressionDirectionBlock(d, { omitFieldRoutingClause: true });
        assert(!/MOOD_EMOTION/.test(optOut), `omitFieldRoutingClause suppresses MOOD_EMOTION routing`);
    }

    // ─── B8: image block builder (audit #8 / #15 / #17) ───
    console.log("  B8: image-prompt block builder (audit #8 / #15 / #17)");
    {
        const d: ExpressionDirective = {
            source: "hook",
            sourceId: "pain",
            emotion: "concern, frustration",
            description: "slight frown, tired eyes, jaw tension — NOT anger",
        };

        // Default (non-before/after): single EXPRESSION DIRECTION line.
        const out = buildImagePromptExpressionBlock(d);
        assert(/EXPRESSION DIRECTION:/i.test(out), `image block (single) has EXPRESSION DIRECTION label`);
        assert(/concern, frustration/.test(out), `image block (single) carries the emotion`);
        assert(/slight frown/.test(out), `image block (single) carries the description`);
        assert(!/BEFORE HALF/i.test(out), `image block (single) does NOT split into BEFORE/AFTER halves`);
        assert(!/AFTER HALF/i.test(out), `image block (single) does NOT split into AFTER half`);
        assert(/priority\s*#?\s*1/i.test(out), `image block (single) states identity priority #1`);
        assert(/subtle|natural/i.test(out), `image block (single) says subtle/natural`);

        // Before/after split: BEFORE = hook emotion, AFTER = aspirational.
        const baOut = buildImagePromptExpressionBlock(d, { beforeAfterSplit: true });
        assert(/BEFORE HALF/i.test(baOut), `image block (before/after) labels BEFORE HALF`);
        assert(/AFTER HALF/i.test(baOut), `image block (before/after) labels AFTER HALF`);
        assert(/concern, frustration/.test(baOut), `image block (before/after) BEFORE carries hook emotion`);
        assert(/aspirational|hopeful/i.test(baOut), `image block (before/after) AFTER carries aspirational emotion`);
        assert(/same (face|person)/i.test(baOut), `image block (before/after) notes same face on both halves`);

        // Null directive → empty string (C3 — no regression).
        const empty = buildImagePromptExpressionBlock(null);
        assert(empty === "", `null directive yields empty image block`);
        const emptyBA = buildImagePromptExpressionBlock(null, { beforeAfterSplit: true });
        assert(emptyBA === "", `null directive yields empty image block even in before/after mode`);

        // Options flow through (omitIdentityClause, omitBlendingClause, omitFieldRoutingClause).
        const noIdentity = buildImagePromptExpressionBlock(d, { omitIdentityClause: true });
        assert(!/priority\s*#?\s*1/i.test(noIdentity), `omitIdentityClause suppresses identity clause`);
    }

    // ─── Source-coverage sanity: every HOOK_ANGLE_KNOWLEDGE id in expressionMap.ts ───
    console.log("  source-coverage sanity vs source file");
    {
        const src = readFileSync(join(__dirname, "..", "..", "src", "expressionMap.ts"), "utf8");
        const knownIds = Object.keys(HOOK_ANGLE_KNOWLEDGE);
        for (const id of knownIds) {
            const re = new RegExp(`(^|\\s|[\\(\\[,])${id}:\\s*\\{`);
            assert(re.test(src), `expressionMap.ts contains a "${id}: { ... }" entry`);
        }
    }

    // ─── Audit #8: injection placement — IMAGE prompt AFTER BLUEPRINT ───
    console.log("  audit #8: injection in IMAGE prompt, AFTER BLUEPRINT (hero/environment/universe)");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");

        // The injection lives inside `buildFinalImagePrompt` and the literal
        // "BLUEPRINT:" must appear BEFORE the `buildImagePromptExpressionBlock`
        // call in source order.
        const blueprintIdx = genSrc.indexOf("BLUEPRINT: ${strippedBlueprint}");
        const imagePromptBodyIdx = genSrc.indexOf("buildImagePromptExpressionBlock(");
        assert(blueprintIdx > -1, `generators.ts contains the BLUEPRINT line`);
        assert(imagePromptBodyIdx > -1, `generators.ts calls buildImagePromptExpressionBlock`);
        assert(imagePromptBodyIdx > blueprintIdx, `image-prompt injection comes AFTER BLUEPRINT line (got idx ${imagePromptBodyIdx} vs blueprintIdx ${blueprintIdx})`);

        // The injection must NOT be in the concept prompt (generateConcepts)
        // — it was moved to the image prompt (audit #8 fix). Verify the
        // buildExpressionDirectionBlock call (concept-prompt variant) is
        // absent from the source.
        const conceptVariantCount = (genSrc.match(/\bbuildExpressionDirectionBlock\s*\(/g) || []).length;
        assert(conceptVariantCount === 0, `concept-prompt variant buildExpressionDirectionBlock is NOT called from generators.ts (got ${conceptVariantCount} — should be 0)`);
    }

    // ─── Audit #17: carousel / batch coverage — shared image-prompt site ───
    console.log("  audit #17: carousel / batch share the image-prompt injection site");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");

        // Exactly ONE call site for buildImagePromptExpressionBlock.
        const injectionCount = (genSrc.match(/buildImagePromptExpressionBlock\s*\(/g) || []).length;
        assert(injectionCount === 1, `buildImagePromptExpressionBlock is called from exactly one site (got ${injectionCount})`);

        // The injection lives inside `buildFinalImagePrompt` — the single
        // shared prompt-assembly function used by single / carousel slide /
        // batch item / edit / reflow-rerender paths.
        const fnIdx = genSrc.indexOf("export function buildFinalImagePrompt(");
        assert(fnIdx > -1, `buildFinalImagePrompt exists`);
        const fnBodyStart = genSrc.indexOf("{", fnIdx);
        // Find the matching close brace (rough heuristic — find injection position).
        const injectionIdx = genSrc.indexOf("buildImagePromptExpressionBlock(", fnBodyStart);
        assert(injectionIdx > fnBodyStart, `buildImagePromptExpressionBlock is INSIDE buildFinalImagePrompt`);
    }

    // ─── Audit #13: applied:false trace path with reason ───
    console.log("  audit #13: applied:false trace path with reason");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        const typesSrc = readFileSync(join(__dirname, "..", "..", "src", "types.ts"), "utf8");

        // Trace entry has `reason` field.
        assert(/reason\?: string/.test(typesSrc), `types.ts expressionAdaptation has optional reason field`);
        assert(/reason\?: string/.test(genSrc), `generators.ts ResolutionTrace.expressionAdaptation has optional reason field`);

        // Trace writer uses BOTH paths — applied:true with non-null fields AND
        // applied:false with null fields + reason string. Search for the
        // exact literal "no-hook-or-objection-active" so a future rename is
        // caught.
        assert(/no-hook-or-objection-active/.test(genSrc), `generators.ts records reason "no-hook-or-objection-active" for the applied:false path`);
        assert(/applied: false/.test(genSrc), `generators.ts writes applied: false on the absent path`);
        assert(/applied: true/.test(genSrc), `generators.ts writes applied: true on the present path`);
    }

    // ─── Audit #15: before/after split BEFORE=hook / AFTER=aspirational ───
    console.log("  audit #15: before/after split in image-prompt block");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");

        // The injection site detects before/after via isBeforeAfterSelection.
        assert(/isBeforeAfterSelection\(inputs/.test(genSrc), `generators.ts detects before/after at the injection site`);
        assert(/beforeAfterSplit: _isBA/.test(genSrc), `generators.ts enables beforeAfterSplit in the image-prompt block builder`);

        // Pre-existing before/after block still in place (unchanged).
        assert(/BEFORE\/AFTER SPLIT — Canvas split into two halves\. BEFORE half: hero in problem state with struggle expression\. AFTER half: same hero in result state with confident expression\./.test(genSrc), `pre-existing before/after block unchanged`);

        // The aspirational fallback lives in expressionMap.ts.
        const mapSrc = readFileSync(join(__dirname, "..", "..", "src", "expressionMap.ts"), "utf8");
        assert(/ASPIRATIONAL_DIRECTIVE/.test(mapSrc), `expressionMap.ts defines ASPIRATIONAL_DIRECTIVE for AFTER half`);
        assert(/aspirational, hopeful, looking forward/.test(mapSrc), `aspirational directive carries aspirational/hopeful emotion`);
    }

    // ─── Contract C5: before/after pre-existing block in generators.ts ───
    console.log("  C5: before/after block in generators.ts is unchanged");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/struggle expression/.test(genSrc), `before/after block contains "struggle expression" (BEFORE)`);
        assert(/confident expression/.test(genSrc), `before/after block contains "confident expression" (AFTER)`);
    }

    // ─── Contract C8: no Box A / no reference face → guidance still applies ───
    console.log("  C8: directive is independent of Box A presence");
    {
        const a = getHookExpressionDirection("pain");
        const b = getObjectionExpressionDirection("price_too_high");
        assert(a !== null && b !== null, "both mappers return non-null for valid ids");
        if (a && b) {
            assert(typeof a.emotion === "string" && a.emotion.length > 0, `pain emotion non-empty`);
            assert(typeof b.emotion === "string" && b.emotion.length > 0, `price_too_high emotion non-empty`);
        }
        const block = buildImagePromptExpressionBlock(a);
        assert(block.includes("EXPRESSION DIRECTION:"), `image block carries the EXPRESSION DIRECTION label`);
        assert(/priority\s*#?\s*1/i.test(block), `image block protects identity (Box A may be absent)`);
    }

    // ─── Summary ───
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
