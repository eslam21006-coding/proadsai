// functions/src/__tests__/expressionMap.test.ts
// Phase 28 — Expression Adaptation (Mapper + Block Builder) — unit tests.
// Verifies Contract A (mapper resolution) and Contract B (block builder)
// from `specs/028-expression-adaptation/contracts/expression-mapping.md`.
// Tests are pure (no Gemini calls) — they exercise the mapper functions in
// isolation and check the block-builder text output for the required clauses.
//
// Test runner: built by tsc, run as `node lib/__tests__/expressionMap.test.js`
// via the `test:expressionMap` script in package.json.

import { readFileSync } from "fs";
import { join } from "path";
import {
    getHookExpressionDirection,
    getObjectionExpressionDirection,
    buildExpressionDirectionBlock,
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

    console.log("expressionMap tests");

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
        // Local sanity: getKnownHookAngleIds() agrees with HOOK_ANGLE_KNOWLEDGE keys
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

    // ─── B1: block contains emotion + description ───
    console.log("  B1: block contains emotion + description");
    {
        const d: ExpressionDirective = {
            source: "hook",
            sourceId: "pain",
            emotion: "concern, frustration",
            description: "slight frown, tired eyes, tension in the jaw — quiet suffering, NOT anger",
        };
        const out = buildExpressionDirectionBlock(d);
        assert(out.includes("concern, frustration"), `out includes emotion text`);
        assert(out.includes("NOT anger"), `out includes description text`);
        assert(/EXPRESSION DIRECTION/i.test(out), `out has EXPRESSION DIRECTION label`);
    }

    // ─── B2: identity-is-priority-#1 clause present ───
    console.log("  B2: identity-priority clause");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(/priority\s*#?\s*1/i.test(out), `out states priority #1 (got: ${JSON.stringify(out)})`);
        assert(/bone structure|facial features/i.test(out), `out forbids changing bone structure/features`);
    }

    // ─── B3: blending clause (art direction character + hook emotion) ───
    console.log("  B3: art-direction blending clause");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(/BLEND|blend/i.test(out), `out instructs blending`);
        assert(/art direction/i.test(out), `out mentions art direction`);
        assert(/character|style|energy/i.test(out), `out mentions character/style/energy`);
        assert(/emotion/i.test(out), `out mentions emotion from hook`);
    }

    // ─── B4: subtle / natural, no theatrical / exaggerated ───
    console.log("  B4: subtle / natural clause");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(/subtle|natural/i.test(out), `out says subtle/natural`);
        assert(/exaggerated|theatrical|caricatur/i.test(out), `out forbids exaggerated/theatrical/caricature`);
    }

    // ─── B5: NO gaze-direction instruction ───
    console.log("  B5: NO gaze-direction instruction");
    {
        const d: ExpressionDirective = { source: "hook", sourceId: "pain", emotion: "concern", description: "x" };
        const out = buildExpressionDirectionBlock(d);
        assert(!/\bgaze\b/i.test(out), `block must NOT mention gaze (FR-014 — gaze owned by Phase 19)`);
        assert(!/looking\s+at\s+the\s+camera/i.test(out), `block must NOT direct camera gaze`);
        assert(!/eye\s+contact\s+(with|to)\s+the\s+viewer/i.test(out), `block must NOT direct eye-contact-with-viewer`);
    }

    // ─── B6: null directive → empty string ───
    console.log("  B6: null directive → empty block");
    {
        const out = buildExpressionDirectionBlock(null);
        assert(out === "", `null directive returns empty string (got ${JSON.stringify(out)})`);
        assert(!out.includes("EXPRESSION DIRECTION"), `null block has no EXPRESSION DIRECTION label`);
    }

    // ─── Source-coverage sanity: every HOOK_ANGLE_KNOWLEDGE id, lookup against source-of-truth file ───
    console.log("  source-coverage sanity vs source file");
    {
        // __dirname after compile is lib/__tests__; the .ts source lives at
        // <repo>/functions/src/expressionMap.ts. Walk up two levels (lib/
        // → functions/) then into src/.
        const src = readFileSync(join(__dirname, "..", "..", "src", "expressionMap.ts"), "utf8");
        const knownIds = Object.keys(HOOK_ANGLE_KNOWLEDGE);
        // Keys are unquoted in the source file (`pain: {`, not `"pain": {`),
        // so we look for `id:` (with optional surrounding whitespace) rather
        // than the quoted form. The regex anchors on the word boundary so
        // substring hits inside other words are not counted.
        for (const id of knownIds) {
            const re = new RegExp(`(^|\\s|[\\(\\[,])${id}:\\s*\\{`);
            assert(re.test(src), `expressionMap.ts contains a "${id}: { ... }" entry`);
        }
    }

    // ─── Contract C5: before/after block unchanged & not contradicted ───
    console.log("  C5: before/after block in generators.ts is unchanged and consistent");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/struggle expression/.test(genSrc), `before/after block contains "struggle expression" (BEFORE)`);
        assert(/confident expression/.test(genSrc), `before/after block contains "confident expression" (AFTER)`);
        // Phase 28's EXPRESSION DIRECTION line is also emitted into the same
        // concept prompt — verify the injection site is wired (so the new
        // guidance and the existing before/after block co-exist in the same
        // prompt, and the new guidance does not displace the old). The
        // literal "EXPRESSION DIRECTION:" string lives in expressionMap.ts;
        // generators.ts references it in comments and uses the builder.
        assert(/EXPRESSION DIRECTION/i.test(genSrc), `generators.ts references EXPRESSION DIRECTION (comment + injection)`);
        assert(/buildExpressionDirectionBlock/.test(genSrc), `generators.ts calls buildExpressionDirectionBlock`);
    }

    // ─── Contract C6/C7: carousel/batch share the same injection point ───
    console.log("  C6/C7: carousel/batch share the [VISUAL ARCHITECT V5.0] concept prompt");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // The injection lives in the SHARED generateConcepts path; carousel
        // and batch both call generateConcepts, so a single edit covers both.
        // We assert: (a) the [VISUAL ARCHITECT V5.0] block is referenced,
        // (b) there is exactly one injection site (no per-path divergence).
        const injectionCount = (genSrc.match(/buildExpressionDirectionBlock\s*\(/g) || []).length;
        assert(injectionCount === 1, `buildExpressionDirectionBlock is called from exactly one site (got ${injectionCount})`);
        // Carousel/batch call generateConcepts — verify the function still exists
        assert(/export async function generateConcepts\b/.test(genSrc), `generateConcepts exists`);
        assert(/VISUAL ARCHITECT V5\.0/.test(genSrc), `[VISUAL ARCHITECT V5.0] header present in concept prompt`);
    }

    // ─── Contract C3: no hook angle → no EXPRESSION DIRECTION line ───
    console.log("  C3: null directive → empty block → no line emitted");
    {
        const empty = buildExpressionDirectionBlock(null);
        assert(empty === "", `null directive yields empty block (got ${JSON.stringify(empty)})`);
        // And confirm that the injection site guards on `_exprDirectionBlock` so
        // an empty string produces no line — back-tick template emits '' not 'undefined'.
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/_exprDirectionBlock\s*\?/.test(genSrc), `generators.ts guards the EXPRESSION DIRECTION line on a truthy block`);
    }

    // ─── Contract C8: no Box A / no reference face → guidance still applies ───
    console.log("  C8: directive is independent of Box A presence");
    {
        // The mapper functions take only an angle / objection id, no inputs —
        // so they make no assumption about whether Box A photos are attached.
        const a = getHookExpressionDirection("pain");
        const b = getObjectionExpressionDirection("price_too_high");
        assert(a !== null && b !== null, "both mappers return non-null for valid ids");
        if (a && b) {
            assert(typeof a.emotion === "string" && a.emotion.length > 0, `pain emotion non-empty (got "${a.emotion}")`);
            assert(typeof b.emotion === "string" && b.emotion.length > 0, `price_too_high emotion non-empty (got "${b.emotion}")`);
        }
        // And the block builder includes the identity-priority clause — so even
        // when there is no reference photo (no identity to protect), the
        // emotion+description still flow into the prompt.
        const block = buildExpressionDirectionBlock(a);
        assert(block.includes("EXPRESSION DIRECTION:"), `block carries the EXPRESSION DIRECTION label`);
    }

    // ─── Summary ───
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
