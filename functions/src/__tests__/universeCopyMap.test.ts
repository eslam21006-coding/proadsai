// functions/src/__tests__/universeCopyMap.test.ts
// Phase 27 — Universe-Aware Copy — unit tests (Contracts A–E).
// Mirrors `gazeMap.test.ts` / `expressionMap.test.ts`:
//   - local `assert(cond, label)` shell with pass/fail counter,
//   - Contract sections with explicit labels,
//   - `process.exit(1)` on failure,
//   - run via `node lib/__tests__/universeCopyMap.test.js`.
//
// Pure (no Gemini/Firebase calls). Exercises the mapper + block
// builders in isolation and checks the source files for the
// canonical injection sites (copy + blueprint + trace) and the
// types.ts additive `universeAwareCopy?` field.

import { readFileSync } from "fs";
import { join } from "path";
import {
    resolveUniverseCopyDecision,
    buildFantasyMetaphorCopyBlock,
    buildBlueprintMetaphorVisualBlock,
    STRICT_METAPHOR_BLOCK,
    STRICT_METAPHOR_REFRESH_LINE,
    type StyleFamily,
    type UniverseCopyDecision,
} from "../universeCopyMap.js";

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

    console.log("universeCopyMap tests (Phase 27)");

    // ═══════════════════════════════════════════════════════════
    // CONTRACT A — Decision function coverage (10 rows from
    // contracts/universe-copy-decision.md)
    // ═══════════════════════════════════════════════════════════

    // ─── A1: fantasy, no suppression → applied:true, fantasy-universe-metaphor-active ───
    console.log("  A1: fantasy + no suppression → applied:true");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === true, `fantasy active → applied:true (got ${d.applied})`);
        assert(d.styleFamily === "fantasy", `fantasy family preserved (got ${d.styleFamily})`);
        assert(d.reason === "fantasy-universe-metaphor-active", `reason is fantasy-universe-metaphor-active (got ${d.reason})`);
    }

    // ─── A2: realistic, no suppression → applied:false, realistic-no-metaphor ───
    console.log("  A2: realistic + no suppression → applied:false");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "realistic",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === false, `realistic → applied:false (got ${d.applied})`);
        assert(d.styleFamily === "realistic", `realistic family preserved (got ${d.styleFamily})`);
        assert(d.reason === "realistic-no-metaphor", `reason is realistic-no-metaphor (got ${d.reason})`);
    }

    // ─── A3: minimal, no suppression → applied:false, minimal-no-metaphor ───
    console.log("  A3: minimal + no suppression → applied:false");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "minimal",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === false, `minimal → applied:false (got ${d.applied})`);
        assert(d.styleFamily === "minimal", `minimal family preserved (got ${d.styleFamily})`);
        assert(d.reason === "minimal-no-metaphor", `reason is minimal-no-metaphor (got ${d.reason})`);
    }

    // ─── A4: fantasy + reference ad → reference-ad-override (suppression beats family) ───
    console.log("  A4: fantasy + ref ad → reference-ad-override");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: true,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === false, `fantasy + ref ad → applied:false (got ${d.applied})`);
        assert(d.styleFamily === "fantasy", `styleFamily preserved as fantasy (FR-013a)`);
        assert(d.reason === "reference-ad-override", `reason is reference-ad-override (got ${d.reason})`);
    }

    // ─── A5: realistic + reference ad → reference-ad-override ───
    console.log("  A5: realistic + ref ad → reference-ad-override");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "realistic",
            referenceAdPresent: true,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === false, `realistic + ref ad → applied:false`);
        assert(d.styleFamily === "realistic", `styleFamily preserved as realistic`);
        assert(d.reason === "reference-ad-override", `reason is reference-ad-override`);
    }

    // ─── A6: fantasy + text-only → text-only-mode (suppression beats family) ───
    console.log("  A6: fantasy + text-only → text-only-mode");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: true,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === false, `fantasy + text-only → applied:false`);
        assert(d.styleFamily === "fantasy", `styleFamily preserved as fantasy`);
        assert(d.reason === "text-only-mode", `reason is text-only-mode`);
    }

    // ─── A7: fantasy + carousel non-hook slide → carousel-non-hook-slide ───
    console.log("  A7: fantasy + carousel non-hook → carousel-non-hook-slide");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: true,
        });
        assert(d.applied === false, `fantasy + carousel non-hook → applied:false`);
        assert(d.styleFamily === "fantasy", `styleFamily preserved as fantasy`);
        assert(d.reason === "carousel-non-hook-slide", `reason is carousel-non-hook-slide`);
    }

    // ─── A8: fantasy + ref ad + carousel non-hook → reference-ad-override (refAd beats slide) ───
    console.log("  A8: fantasy + ref ad + non-hook → reference-ad-override (precedence)");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: true,
            isTextOnly: false,
            isCarouselNonHookSlide: true,
        });
        assert(d.applied === false, `ref ad + slide → applied:false`);
        assert(d.styleFamily === "fantasy", `styleFamily preserved as fantasy`);
        assert(d.reason === "reference-ad-override", `ref ad wins over carousel suppression`);
    }

    // ─── A9: fantasy + text-only + carousel non-hook → text-only-mode (textOnly beats slide) ───
    console.log("  A9: fantasy + text-only + non-hook → text-only-mode (precedence)");
    {
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: true,
            isCarouselNonHookSlide: true,
        });
        assert(d.applied === false, `text-only + slide → applied:false`);
        assert(d.styleFamily === "fantasy", `styleFamily preserved as fantasy`);
        assert(d.reason === "text-only-mode", `text-only wins over carousel suppression`);
    }

    // ─── A10: unknown / garbage family → resolves to realistic (safe default) ───
    console.log("  A10: unknown/garbage family → realistic-no-metaphor");
    {
        // Cast through unknown to simulate a defensive caller passing a bad value.
        const badFamily = "garbage" as unknown as StyleFamily;
        const d = resolveUniverseCopyDecision({
            styleFamily: badFamily,
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === false, `unknown family → applied:false`);
        assert(d.styleFamily === "realistic", `unknown family → realistic (safe default; got ${d.styleFamily})`);
        assert(d.reason === "realistic-no-metaphor", `unknown family → realistic-no-metaphor`);
    }

    // ─── A11: function is total — never throws for any inputs ───
    console.log("  A11: decision function is total (no throws)");
    {
        const families: StyleFamily[] = ["fantasy", "realistic", "minimal"];
        let threw = false;
        for (const fam of families) {
            for (const refAd of [false, true]) {
                for (const textOnly of [false, true]) {
                    for (const nonHook of [false, true]) {
                        try {
                            const d = resolveUniverseCopyDecision({
                                styleFamily: fam,
                                referenceAdPresent: refAd,
                                isTextOnly: textOnly,
                                isCarouselNonHookSlide: nonHook,
                            });
                            // Must return a valid decision shape.
                            if (typeof d.applied !== "boolean") threw = true;
                            if (typeof d.styleFamily !== "string") threw = true;
                            if (typeof d.reason !== "string") threw = true;
                        } catch {
                            threw = true;
                        }
                    }
                }
            }
        }
        assert(!threw, `decision function is total (no throws across 24 combinations)`);
    }

    // ─── A12: decision shape — styleFamily is always echoed back (FR-013a) ───
    console.log("  A12: styleFamily always echoed unchanged (FR-013a)");
    {
        for (const fam of ["fantasy", "realistic", "minimal"] as StyleFamily[]) {
            for (const refAd of [false, true]) {
                for (const textOnly of [false, true]) {
                    for (const nonHook of [false, true]) {
                        const d = resolveUniverseCopyDecision({
                            styleFamily: fam,
                            referenceAdPresent: refAd,
                            isTextOnly: textOnly,
                            isCarouselNonHookSlide: nonHook,
                        });
                        assert(d.styleFamily === fam, `styleFamily=${fam} preserved under refAd=${refAd} textOnly=${textOnly} nonHook=${nonHook}`);
                    }
                }
            }
        }
    }

    // ─── A13: reason is always from the canonical union ───
    console.log("  A13: reason is always from canonical union");
    {
        const canonicalReasons = new Set([
            "fantasy-universe-metaphor-active",
            "realistic-no-metaphor",
            "minimal-no-metaphor",
            "reference-ad-override",
            "text-only-mode",
            "carousel-non-hook-slide",
        ]);
        for (const fam of ["fantasy", "realistic", "minimal"] as StyleFamily[]) {
            for (const refAd of [false, true]) {
                for (const textOnly of [false, true]) {
                    for (const nonHook of [false, true]) {
                        const d = resolveUniverseCopyDecision({
                            styleFamily: fam,
                            referenceAdPresent: refAd,
                            isTextOnly: textOnly,
                            isCarouselNonHookSlide: nonHook,
                        });
                        assert(canonicalReasons.has(d.reason), `reason "${d.reason}" is in canonical union`);
                    }
                }
            }
        }
    }

    // ─── A14: never returns applied:true for non-fantasy ───
    console.log("  A14: never applied:true for non-fantasy family");
    {
        for (const fam of ["realistic", "minimal"] as StyleFamily[]) {
            for (const refAd of [false, true]) {
                for (const textOnly of [false, true]) {
                    for (const nonHook of [false, true]) {
                        const d = resolveUniverseCopyDecision({
                            styleFamily: fam,
                            referenceAdPresent: refAd,
                            isTextOnly: textOnly,
                            isCarouselNonHookSlide: nonHook,
                        });
                        assert(d.applied === false, `non-fantasy family never gets applied:true (fam=${fam} refAd=${refAd} textOnly=${textOnly} nonHook=${nonHook})`);
                    }
                }
            }
        }
    }

    // ─── A15: never returns applied:true when any suppression flag is set ───
    console.log("  A15: never applied:true when suppression flag is set");
    {
        for (const refAd of [false, true]) {
            for (const textOnly of [false, true]) {
                for (const nonHook of [false, true]) {
                    if (!refAd && !textOnly && !nonHook) continue; // skip the "no suppression" case
                    const d = resolveUniverseCopyDecision({
                        styleFamily: "fantasy",
                        referenceAdPresent: refAd,
                        isTextOnly: textOnly,
                        isCarouselNonHookSlide: nonHook,
                    });
                    assert(d.applied === false, `suppression flag set → applied:false (refAd=${refAd} textOnly=${textOnly} nonHook=${nonHook})`);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT E — Reversibility (byte-identity guard)
    // ═══════════════════════════════════════════════════════════

    // ─── E1: STRICT_METAPHOR_BLOCK is non-empty and well-formed ───
    console.log("  E1: STRICT_METAPHOR_BLOCK is non-empty + lifted verbatim");
    {
        assert(typeof STRICT_METAPHOR_BLOCK === "string" && STRICT_METAPHOR_BLOCK.length > 0, `STRICT_METAPHOR_BLOCK is non-empty`);
        assert(STRICT_METAPHOR_BLOCK.includes("METAPHOR RULE (ABSOLUTELY CRITICAL)"), `block has METAPHOR RULE label`);
        assert(STRICT_METAPHOR_BLOCK.includes("VISUAL SETTING"), `block carries VISUAL SETTING clause`);
        assert(STRICT_METAPHOR_BLOCK.includes("stand on its own"), `block carries stand-on-its-own clause`);
        assert(STRICT_METAPHOR_BLOCK.includes("WRONG"), `block has WRONG examples`);
        assert(STRICT_METAPHOR_BLOCK.includes("RIGHT"), `block has RIGHT examples`);
        assert(STRICT_METAPHOR_BLOCK.includes("❌"), `block has ❌ markers`);
        assert(STRICT_METAPHOR_BLOCK.includes("✅"), `block has ✅ markers`);
    }

    // ─── E2: STRICT_METAPHOR_BLOCK byte-for-byte identity to the pre-Phase-27 generators.ts text ───
    //
    // After Phase 27 the generators.ts source no longer contains the
    // strict text at the original line range (it's been replaced with a
    // conditional `${_metaphorCopyBlock}` interpolation). The contract
    // is checked against a FROZEN SNAPSHOT of the original L1899–1915
    // text taken before the swap — embedded inline below so the test
    // is self-contained and doesn't drift with future generators.ts
    // edits. The mapper constant must remain byte-for-byte identical to
    // this snapshot for the reversibility contract (Contract E) to hold.
    console.log("  E2: STRICT_METAPHOR_BLOCK is byte-identical to the frozen pre-Phase-27 snapshot");
    {
        const FROZEN_STRICT_BLOCK =
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
        assert(
            STRICT_METAPHOR_BLOCK === FROZEN_STRICT_BLOCK,
            `STRICT_METAPHOR_BLOCK === frozen pre-Phase-27 snapshot (parsed ${STRICT_METAPHOR_BLOCK.length} chars vs expected ${FROZEN_STRICT_BLOCK.length})`,
        );
    }

    // ─── E3: STRICT_METAPHOR_REFRESH_LINE is non-empty and lifted verbatim ───
    console.log("  E3: STRICT_METAPHOR_REFRESH_LINE is non-empty + lifted verbatim");
    {
        assert(typeof STRICT_METAPHOR_REFRESH_LINE === "string" && STRICT_METAPHOR_REFRESH_LINE.length > 0, `STRICT_METAPHOR_REFRESH_LINE is non-empty`);
        assert(STRICT_METAPHOR_REFRESH_LINE.startsWith("- UNIVERSE/THEME USAGE:"), `line begins with the canonical prefix`);
        assert(STRICT_METAPHOR_REFRESH_LINE.includes("VISUAL SETTING"), `line carries VISUAL SETTING clause`);
        assert(STRICT_METAPHOR_REFRESH_LINE.includes("stand on its own"), `line carries stand-on-its-own clause`);
    }

    // ─── E4: STRICT_METAPHOR_REFRESH_LINE byte-for-byte identity to the frozen pre-Phase-27 text ───
    //
    // Same snapshot pattern as E2: the original L2020 line no longer
    // exists in generators.ts after Phase 27 (replaced with a
    // conditional interpolation). The contract is checked against a
    // frozen snapshot embedded inline so the test doesn't drift.
    console.log("  E4: STRICT_METAPHOR_REFRESH_LINE is byte-identical to the frozen pre-Phase-27 snapshot");
    {
        const FROZEN_STRICT_REFRESH_LINE =
            "- UNIVERSE/THEME USAGE: The theme is primarily for VISUAL SETTING. You MAY use subtle vocabulary from the universe theme (one evocative word or short phrase that echoes the visual) but do NOT build the copy logic around the theme. Do NOT write full thematic metaphors or sentences that only make sense in context of the universe. The copy must stand on its own and make complete sense to someone who has never seen the visual.";
        assert(
            STRICT_METAPHOR_REFRESH_LINE === FROZEN_STRICT_REFRESH_LINE,
            `STRICT_METAPHOR_REFRESH_LINE === frozen pre-Phase-27 snapshot (parsed ${STRICT_METAPHOR_REFRESH_LINE.length} chars vs expected ${FROZEN_STRICT_REFRESH_LINE.length})`,
        );
    }

    // ─── E5: Decision function shape — directly spreadable into ResolutionTrace.universeAwareCopy ───
    console.log("  E5: decision shape matches ResolutionTrace.universeAwareCopy");
    {
        const decision: UniverseCopyDecision = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        // The shape must be exactly { applied, styleFamily, reason } — no extra
        // fields (clarification: no `metaphorContent` / `visualElementSuggestion`).
        const keys = Object.keys(decision).sort();
        assert(keys.length === 3, `decision has exactly 3 keys (got ${keys.length}: ${keys.join(",")})`);
        assert(keys[0] === "applied", `first key is "applied"`);
        assert(keys[1] === "reason", `second key is "reason"`);
        assert(keys[2] === "styleFamily", `third key is "styleFamily"`);
    }

    // ─── E6: Neutralized mapper (strict-for-all) → applied:false with literal reason ───
    console.log("  E6: neutralized path returns literal reason for fantasy");
    {
        // The neutralization path is "the mapper returns strict-for-all": we
        // verify the ABSENT path resolves to a literal-family reason (not
        // fantasy-universe-metaphor-active) when suppression flags force it.
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: true, // ref-ad present → strict (Contract E3 of contract doc)
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === false, `neutralized fantasy (ref ad) → applied:false`);
        assert(d.reason === "reference-ad-override", `neutralized fantasy → reference-ad-override reason`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT B — Copy-block emission at the two generateTOV sites
    // ═══════════════════════════════════════════════════════════

    // ─── B1: fantasy-active decision → relaxed block present + strict absent ───
    console.log("  B1: relaxed block present / strict absent when applied:true");
    {
        // Simulate the generateTOV copy-site swap. The mapper returns
        // applied:true → the call site emits buildFantasyMetaphorCopyBlock
        // (NOT STRICT_METAPHOR_BLOCK). The relaxed block must contain the
        // canonical fantasy label and the strict block must be absent
        // from the emitted prompt text.
        const decision = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        const emitted = decision.applied
            ? buildFantasyMetaphorCopyBlock("mythic battlefield", undefined)
            : STRICT_METAPHOR_BLOCK;
        assert(decision.applied === true, `decision is applied:true (precondition for B1)`);
        assert(/UNIVERSE METAPHOR/i.test(emitted), `emitted block has UNIVERSE METAPHOR label`);
        assert(/FANTASY/.test(emitted), `emitted block is labeled FANTASY`);
        assert(!/METAPHOR RULE \(ABSOLUTELY CRITICAL\)/.test(emitted), `strict METAPHOR RULE absent from emitted fantasy block`);
        assert(!/❌ WRONG/.test(emitted), `strict WRONG examples absent from emitted fantasy block`);
        assert(/mythic battlefield/.test(emitted), `emitted block carries the resolved universe text`);
        // The relaxed block carries all the advisory / Arabic guardrails
        // required by FR-004 / FR-006 / NFR-005.
        assert(/subtle|evocative/i.test(emitted), `relaxed block mentions subtle / evocative`);
        assert(/stand on its own/i.test(emitted), `relaxed block preserves stand-on-its-own rule`);
        assert(/Arabic/i.test(emitted), `relaxed block carries Arabic quality reminder`);
        assert(/ADVISORY|advisory/i.test(emitted), `relaxed block is marked advisory (no enforcement)`);
    }

    // ─── B2: literal decision → strict block present + relaxed absent ───
    console.log("  B2: strict block present / relaxed absent when applied:false");
    {
        // Simulate the literal-path swap (realistic / minimal / unknown /
        // suppressed). The mapper returns applied:false → the call site
        // emits STRICT_METAPHOR_BLOCK. The relaxed block must NOT appear
        // in the emitted prompt text.
        const literalFamilies = ["realistic", "minimal"] as const;
        for (const fam of literalFamilies) {
            const decision = resolveUniverseCopyDecision({
                styleFamily: fam,
                referenceAdPresent: false,
                isTextOnly: false,
                isCarouselNonHookSlide: false,
            });
            const emitted = decision.applied
                ? buildFantasyMetaphorCopyBlock("X", undefined)
                : STRICT_METAPHOR_BLOCK;
            assert(decision.applied === false, `${fam} → applied:false (precondition for B2)`);
            assert(/METAPHOR RULE \(ABSOLUTELY CRITICAL\)/.test(emitted), `${fam} emits strict METAPHOR RULE`);
            assert(/❌ WRONG/.test(emitted), `${fam} emits strict WRONG examples`);
            assert(!/UNIVERSE METAPHOR RULE \(FANTASY/.test(emitted), `${fam} does NOT emit relaxed fantasy label`);
            assert(!/✨ UNIVERSE METAPHOR \(FANTASY/.test(emitted), `${fam} does NOT emit relaxed refresh label`);
        }
        // Suppression cases (ref ad / text-only / non-hook) all funnel to
        // the same STRICT_METAPHOR_BLOCK regardless of style family —
        // refAd + fantasy must NOT relax.
        const suppressionCases: Array<{ family: StyleFamily; refAd: boolean; textOnly: boolean; nonHook: boolean; label: string }> = [
            { family: "fantasy", refAd: true, textOnly: false, nonHook: false, label: "fantasy+refAd" },
            { family: "realistic", refAd: true, textOnly: false, nonHook: false, label: "realistic+refAd" },
            { family: "fantasy", refAd: false, textOnly: true, nonHook: false, label: "fantasy+textOnly" },
            { family: "fantasy", refAd: false, textOnly: false, nonHook: true, label: "fantasy+nonHook" },
            { family: "minimal", refAd: false, textOnly: false, nonHook: false, label: "minimal" },
        ];
        for (const c of suppressionCases) {
            const decision = resolveUniverseCopyDecision({
                styleFamily: c.family,
                referenceAdPresent: c.refAd,
                isTextOnly: c.textOnly,
                isCarouselNonHookSlide: c.nonHook,
            });
            const emitted = decision.applied
                ? buildFantasyMetaphorCopyBlock("X", undefined)
                : STRICT_METAPHOR_BLOCK;
            assert(decision.applied === false, `${c.label} → applied:false (precondition)`);
            assert(/METAPHOR RULE \(ABSOLUTELY CRITICAL\)/.test(emitted), `${c.label} emits strict block`);
            assert(!/UNIVERSE METAPHOR RULE \(FANTASY/.test(emitted), `${c.label} does NOT emit relaxed block`);
        }
    }

    // ─── B3: refresh-mode swap uses STRICT_METAPHOR_REFRESH_LINE for literal ───
    console.log("  B3: refresh-mode strict line emitted for literal decisions");
    {
        const decision = resolveUniverseCopyDecision({
            styleFamily: "realistic",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        // The refresh-mode emission site swaps between the strict
        // single-line rule and a compressed relaxed variant. For
        // literal decisions it emits the strict single line.
        const emitted = decision.applied
            ? `✨ UNIVERSE METAPHOR (FANTASY — RELAXED): The copy MAY carry ONE subtle, evocative universe-echoing word or short phrase (Gemini chooses the placement: headline, subheadline, CTA, or benefit). Keep it SUBTLE — never a full themed sentence. The copy MUST still stand on its own to a reader who never sees the image. Advisory; no rejection pass.`
            : STRICT_METAPHOR_REFRESH_LINE;
        assert(decision.applied === false, `realistic refresh → applied:false (precondition for B3)`);
        assert(emitted.startsWith("- UNIVERSE/THEME USAGE:"), `refresh strict line begins with canonical prefix`);
        assert(emitted.includes("stand on its own"), `refresh strict line preserves stand-on-its-own rule`);
        assert(!emitted.startsWith("✨ UNIVERSE METAPHOR"), `refresh strict line is NOT the relaxed variant`);
    }

    // ─── B4: refresh-mode swap uses relaxed variant for fantasy-active ───
    console.log("  B4: refresh-mode relaxed variant emitted for fantasy-active decisions");
    {
        const decision = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        const emitted = decision.applied
            ? `✨ UNIVERSE METAPHOR (FANTASY — RELAXED): The copy MAY carry ONE subtle, evocative universe-echoing word or short phrase (Gemini chooses the placement: headline, subheadline, CTA, or benefit). Keep it SUBTLE — never a full themed sentence. The copy MUST still stand on its own to a reader who never sees the image. Advisory; no rejection pass.`
            : STRICT_METAPHOR_REFRESH_LINE;
        assert(decision.applied === true, `fantasy refresh → applied:true (precondition for B4)`);
        assert(emitted.startsWith("✨ UNIVERSE METAPHOR"), `refresh relaxed variant emitted`);
        assert(/subtle|evocative/i.test(emitted), `refresh relaxed variant mentions subtle / evocative`);
        assert(!emitted.startsWith("- UNIVERSE/THEME USAGE:"), `refresh strict line is NOT emitted for fantasy`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT C — Blueprint visual-coherence instruction
    // ═══════════════════════════════════════════════════════════

    // ─── C1: applied:true → blueprint visual block present ───
    console.log("  C1: blueprint visual instruction present when applied:true");
    {
        const decision = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        const emitted = decision.applied
            ? buildBlueprintMetaphorVisualBlock("mythic battlefield")
            : "";
        assert(emitted.length > 0, `applied:true → non-empty blueprint block`);
        assert(/UNIVERSE METAPHOR/.test(emitted), `blueprint block has UNIVERSE METAPHOR label`);
        assert(/VISUAL COHERENCE/i.test(emitted), `blueprint block has VISUAL COHERENCE label`);
        assert(/FANTASY/.test(emitted), `blueprint block is labeled FANTASY`);
        assert(/mythic battlefield/.test(emitted), `blueprint block is anchored to the resolved universe`);
        assert(/matching visual element/i.test(emitted), `blueprint block mentions matching visual element`);
        assert(/identity|costume|composition/i.test(emitted), `blueprint block defers to identity/costume/composition rules`);
        assert(/SUBJECT_ACTION|TECHNICAL_PROMPT|blueprint/i.test(emitted), `blueprint block references authoring site`);
    }

    // ─── C2: applied:false → blueprint visual block ABSENT ───
    console.log("  C2: blueprint visual instruction absent when applied:false");
    {
        // Every literal/suppressed scenario must emit NO visual-coherence
        // block — otherwise the metaphor could leak into the rendered
        // image of a literal ad (a hard failure mode).
        const cases: Array<{ family: StyleFamily; refAd: boolean; textOnly: boolean; nonHook: boolean; label: string }> = [
            { family: "realistic", refAd: false, textOnly: false, nonHook: false, label: "realistic" },
            { family: "minimal", refAd: false, textOnly: false, nonHook: false, label: "minimal" },
            { family: "fantasy", refAd: true, textOnly: false, nonHook: false, label: "fantasy+refAd" },
            { family: "fantasy", refAd: false, textOnly: true, nonHook: false, label: "fantasy+textOnly" },
            { family: "fantasy", refAd: false, textOnly: false, nonHook: true, label: "fantasy+nonHook" },
        ];
        for (const c of cases) {
            const decision = resolveUniverseCopyDecision({
                styleFamily: c.family,
                referenceAdPresent: c.refAd,
                isTextOnly: c.textOnly,
                isCarouselNonHookSlide: c.nonHook,
            });
            const emitted = decision.applied
                ? buildBlueprintMetaphorVisualBlock("X")
                : "";
            assert(emitted === "", `${c.label} → empty blueprint block (would otherwise leak metaphor)`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT D — Resolution-trace write (source-file wiring)
    // ═══════════════════════════════════════════════════════════

    // ─── D1: types.ts defines ResolutionTrace.universeAwareCopy ───
    console.log("  D1: types.ts has ResolutionTrace.universeAwareCopy");
    {
        const typesSrc = readFileSync(join(__dirname, "..", "..", "src", "types.ts"), "utf8");
        assert(/universeAwareCopy\?:/.test(typesSrc), `types.ts defines optional universeAwareCopy? field`);
        assert(/applied:\s*boolean/.test(typesSrc), `universeAwareCopy.applied is boolean`);
        assert(/styleFamily:\s*["']fantasy["']\s*\|\s*["']realistic["']\s*\|\s*["']minimal["']/.test(typesSrc), `styleFamily is the literal union`);
        assert(/fantasy-universe-metaphor-active/.test(typesSrc), `reason includes fantasy-universe-metaphor-active`);
        assert(/realistic-no-metaphor/.test(typesSrc), `reason includes realistic-no-metaphor`);
        assert(/minimal-no-metaphor/.test(typesSrc), `reason includes minimal-no-metaphor`);
        assert(/reference-ad-override/.test(typesSrc), `reason includes reference-ad-override`);
        assert(/text-only-mode/.test(typesSrc), `reason includes text-only-mode`);
        assert(/carousel-non-hook-slide/.test(typesSrc), `reason includes carousel-non-hook-slide`);
    }

    // ─── D2: generators.ts writes universeAwareCopy trace in generateFinalAd ───
    console.log("  D2: generators.ts writes universeAwareCopy trace");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        assert(/universeAwareCopy:/.test(genSrc), `generators.ts writes universeAwareCopy trace`);
        assert(/resolveUniverseCopyDecision/.test(genSrc), `generators.ts calls resolveUniverseCopyDecision`);
        assert(/buildBlueprintMetaphorVisualBlock/.test(genSrc), `generators.ts calls buildBlueprintMetaphorVisualBlock`);
        assert(/buildFantasyMetaphorCopyBlock/.test(genSrc), `generators.ts calls buildFantasyMetaphorCopyBlock`);
        assert(/STRICT_METAPHOR_BLOCK/.test(genSrc), `generators.ts references STRICT_METAPHOR_BLOCK constant`);
        assert(/STRICT_METAPHOR_REFRESH_LINE/.test(genSrc), `generators.ts references STRICT_METAPHOR_REFRESH_LINE constant`);
    }

    // ─── D3: generateTOV copy sites use the mapper (US1 wiring) ───
    console.log("  D3: generateTOV copy sites use the universeCopyDecision");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // Two call sites for resolveUniverseCopyDecision in generateTOV
        // (mode === 'initial' + mode === 'refresh').
        const tovDecisionCount = (genSrc.match(/resolveUniverseCopyDecision\s*\(\s*\{[^}]*styleFamily:\s*resolveStyleFamily\s*\(\s*inputs\s*\)/g) || []).length;
        assert(tovDecisionCount >= 2, `generateTOV calls resolveUniverseCopyDecision at ≥2 sites (got ${tovDecisionCount})`);
        // Both sites must use the canonical reference-ad signal.
        assert(/referenceAdPresent:\s*!!\s*\(\s*inputs\s+as\s+any\s*\)\.referenceAd/.test(genSrc), `generators.ts uses canonical referenceAdPresent expression`);
    }

    // ─── D4: blueprint injection uses isCarouselNonHookSlide from carouselSlideIndex ───
    console.log("  D4: blueprint injection uses carouselSlideIndex for non-hook detection");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // The blueprint site must compute isCarouselNonHookSlide from
        // carouselSlideIndex on the inputs (T023 wiring).
        assert(/carouselSlideIndex.*\?\?\s*0\s*\)\s*>\s*0/.test(genSrc), `generators.ts computes isCarouselNonHookSlide from carouselSlideIndex`);
        // The blueprint site must pass isCarouselNonHookSlide into the
        // decision so slides 2+ get suppressed.
        assert(/isCarouselNonHookSlide:\s*_isCarouselNonHookSlide/.test(genSrc), `blueprint site forwards isCarouselNonHookSlide into the decision`);
    }

    // ─── D5: trace write uses carouselSlideIndex for non-hook detection ───
    console.log("  D5: trace write uses carouselSlideIndex for non-hook detection");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        // Same pattern as D4 — the trace write site must also compute
        // isCarouselNonHookSlide from carouselSlideIndex so slides 2+
        // record reason:'carousel-non-hook-slide'.
        const traceSiteCount = (genSrc.match(/universeAwareCopy:\s*_ucTraceDecision/g) || []).length;
        assert(traceSiteCount >= 1, `generators.ts writes universeAwareCopy at the trace site (got ${traceSiteCount})`);
    }

    // ─── D6: single shared injection point — exactly one call site for the blueprint block in buildFinalImagePrompt ───
    console.log("  D6: single shared injection point for the blueprint block");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        const count = (genSrc.match(/buildBlueprintMetaphorVisualBlock\s*\(/g) || []).length;
        assert(count === 1, `buildBlueprintMetaphorVisualBlock is called from exactly one site (got ${count})`);
        // The call must live inside buildFinalImagePrompt (single shared
        // assembly point, mirrors Phase 28 / Phase 19 pattern).
        const fnIdx = genSrc.indexOf("export function buildFinalImagePrompt(");
        assert(fnIdx > -1, `buildFinalImagePrompt exists`);
        const callIdx = genSrc.indexOf("buildBlueprintMetaphorVisualBlock(");
        assert(callIdx > fnIdx, `blueprint block is injected inside buildFinalImagePrompt (call ${callIdx} > fn ${fnIdx})`);
    }

    // ─── D7: blueprint block injection happens AFTER the BLUEPRINT line (audit #8 mirror) ───
    console.log("  D7: blueprint block injection happens AFTER the BLUEPRINT line");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
        const blueprintIdx = genSrc.indexOf("BLUEPRINT: ${strippedBlueprint}");
        const blockIdx = genSrc.indexOf("buildBlueprintMetaphorVisualBlock(");
        assert(blueprintIdx > -1, `BLUEPRINT line exists`);
        assert(blockIdx > blueprintIdx, `blueprint block injection comes AFTER BLUEPRINT line (block ${blockIdx} > blueprint ${blueprintIdx})`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT F — REASON VALUES — verify all canonical reasons are
    // produced by the decision function across the 24+ valid input
    // combinations (already covered by A1–A15, but listed here as a
    // single-pass regression guard for the canonical reason set).
    // ═══════════════════════════════════════════════════════════

    // ─── F1: every canonical reason is reachable ───
    console.log("  F1: every canonical reason is reachable from the decision function");
    {
        const reachableReasons = new Set<string>();
        for (const fam of ["fantasy", "realistic", "minimal"] as StyleFamily[]) {
            for (const refAd of [false, true]) {
                for (const textOnly of [false, true]) {
                    for (const nonHook of [false, true]) {
                        const d = resolveUniverseCopyDecision({
                            styleFamily: fam,
                            referenceAdPresent: refAd,
                            isTextOnly: textOnly,
                            isCarouselNonHookSlide: nonHook,
                        });
                        reachableReasons.add(d.reason);
                    }
                }
            }
        }
        assert(reachableReasons.has("fantasy-universe-metaphor-active"), `reason fantasy-universe-metaphor-active is reachable`);
        assert(reachableReasons.has("realistic-no-metaphor"), `reason realistic-no-metaphor is reachable`);
        assert(reachableReasons.has("minimal-no-metaphor"), `reason minimal-no-metaphor is reachable`);
        assert(reachableReasons.has("reference-ad-override"), `reason reference-ad-override is reachable`);
        assert(reachableReasons.has("text-only-mode"), `reason text-only-mode is reachable`);
        assert(reachableReasons.has("carousel-non-hook-slide"), `reason carousel-non-hook-slide is reachable`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT G — US6 custom-fantasy-universe precedence
    // ═══════════════════════════════════════════════════════════

    // ─── G1: buildFantasyMetaphorCopyBlock prefers customUniverseDetails ───
    console.log("  G1: custom fantasy universe text wins over resolvedUniverse");
    {
        const custom = "a storm-blasted sky-pirate skyship where every deck is a marketplace";
        const withCustom = buildFantasyMetaphorCopyBlock("generic fantasy", custom);
        const withoutCustom = buildFantasyMetaphorCopyBlock("mythic battlefield", undefined);
        assert(withCustom.includes(custom), `relaxed block carries the custom universe text (FR-006)`);
        assert(!withCustom.includes("generic fantasy"), `relaxed block does NOT carry the resolvedUniverse when custom is present`);
        assert(withoutCustom.includes("mythic battlefield"), `relaxed block carries resolvedUniverse when custom is absent`);
        // The decision for custom fantasy is still applied:true — the
        // mapper doesn't read customUniverseDetails; it reads styleFamily.
        const d = resolveUniverseCopyDecision({
            styleFamily: "fantasy",
            referenceAdPresent: false,
            isTextOnly: false,
            isCarouselNonHookSlide: false,
        });
        assert(d.applied === true, `custom fantasy decision is still applied:true`);
    }

    // ─── G2: blueprint block also anchors to customUniverseDetails (via caller) ───
    console.log("  G2: blueprint visual block can be anchored to a custom universe");
    {
        const custom = "an ancient library where every book is a portal";
        const block = buildBlueprintMetaphorVisualBlock(custom);
        assert(block.includes(custom), `blueprint block carries custom universe text`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONTRACT H — Reversibility additional: the original strict text
    // is still readable from a "neutralized" mapper simulation (proves
    // setting every decision to literal restores byte-identical pre-
    // Phase-27 prompts).
    // ═══════════════════════════════════════════════════════════

    // ─── H1: every literal-family decision pairs STRICT_METAPHOR_BLOCK ───
    console.log("  H1: every literal decision pairs with STRICT_METAPHOR_BLOCK (reversibility proof)");
    {
        for (const fam of ["realistic", "minimal"] as StyleFamily[]) {
            for (const refAd of [false, true]) {
                for (const textOnly of [false, true]) {
                    for (const nonHook of [false, true]) {
                        const d = resolveUniverseCopyDecision({
                            styleFamily: fam,
                            referenceAdPresent: refAd,
                            isTextOnly: textOnly,
                            isCarouselNonHookSlide: nonHook,
                        });
                        const emittedCopyBlock = d.applied
                            ? buildFantasyMetaphorCopyBlock("X", undefined)
                            : STRICT_METAPHOR_BLOCK;
                        assert(emittedCopyBlock === STRICT_METAPHOR_BLOCK, `${fam} refAd=${refAd} textOnly=${textOnly} nonHook=${nonHook} → strict block`);
                    }
                }
            }
        }
    }

    // ─── E7: ASSEMBLED call-site byte-identity (closes the audit M1 blind
    // spot). E2/E4 prove the CONSTANTS are byte-identical to the frozen
    // pre-Phase-27 snapshots, but they do NOT prove the EMITTED prompt is
    // identical — the call site could prepend a duplicate prefix on top of
    // the constant (e.g. "      ${block}" → 12-space first line, or
    // "- ${block}" → "- - UNIVERSE/THEME USAGE"). This test reads the
    // generators.ts source and asserts the interpolation tokens have an
    // EMPTY line-prefix, so the assembled strict output === the constant. ───
    console.log("  E7: assembled call-site interpolation adds no duplicate prefix (M1)");
    {
        const genSrc = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");

        // Initial site: STRICT_METAPHOR_BLOCK already carries its own
        // 6-space indent, so the template line must interpolate it with
        // NO leading whitespace (else the first line gets 12 spaces).
        const initMatch = genSrc.match(/\n([^\n]*)\$\{_metaphorCopyBlock\}/);
        assert(initMatch !== null, `found the \${_metaphorCopyBlock} interpolation site`);
        const initPrefix = initMatch ? initMatch[1] : "<none>";
        assert(initPrefix === "", `initial interpolation has EMPTY line-prefix (got ${JSON.stringify(initPrefix)}) — no double indent`);
        assert((initPrefix + STRICT_METAPHOR_BLOCK) === STRICT_METAPHOR_BLOCK, `emitted initial strict text === STRICT_METAPHOR_BLOCK (byte-identical)`);

        // Refresh site: STRICT_METAPHOR_REFRESH_LINE already starts with
        // "- ", so the template line must interpolate it with NO prefix
        // (else the strict path emits "- - UNIVERSE/THEME USAGE").
        const refMatch = genSrc.match(/\n([^\n]*)\$\{_metaphorRefreshBlock\}/);
        assert(refMatch !== null, `found the \${_metaphorRefreshBlock} interpolation site`);
        const refPrefix = refMatch ? refMatch[1] : "<none>";
        assert(refPrefix === "", `refresh interpolation has EMPTY line-prefix (got ${JSON.stringify(refPrefix)}) — no doubled "- " bullet`);
        assert((refPrefix + STRICT_METAPHOR_REFRESH_LINE) === STRICT_METAPHOR_REFRESH_LINE, `emitted refresh strict text === STRICT_METAPHOR_REFRESH_LINE (byte-identical)`);

        // The relaxed refresh variant must still carry its own single
        // bullet so the fantasy path stays a clean list item.
        assert(/\?\s*`- ✨ UNIVERSE METAPHOR \(FANTASY/.test(genSrc), `relaxed refresh variant carries its own single "- " bullet`);
    }

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
