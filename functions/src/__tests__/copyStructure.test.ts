// functions/src/__tests__/copyStructure.test.ts
// Purpose: unit tests for Phase 23 copy structure + anti-sameness + variation carousel.
// Covers drawDimensions / rotateOpenings / rotateCarouselAngles, fingerprint bias,
// in-card variation state, and the rotational contracts documented in
// specs/959-copy-structure-variation/contracts/.

import { drawDimensions, drawOpenings, type DimensionEntry, type OpeningStructure } from "../knowledge/hookAnglesKnowledge.js";
import type { AngleFingerprint } from "../creativeMemory.js";
import { getRecentFingerprints, recordAngleFingerprint } from "../creativeMemory.js";
import { buildSlidePlan } from "../slidePlanEngine.js";
import { rotateCarouselAngles, remapCarouselFamiliesToSlots } from "../generators.js";
import * as fs from "node:fs";
import * as path from "node:path";

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
      console.error(`  ❌ ${label}`);
    }
  }

  console.log("copyStructure tests");

  // ─── T004 / drawDimensions is exported ───
  console.log("  drawDimensions helper exported");
  assert(typeof drawDimensions === "function", "drawDimensions is exported as a function");
  assert(typeof drawOpenings === "function", "drawOpenings is exported as a function");

  // ─── T004 / drawDimensions returns 4 distinct within-pool items ───
  console.log("  drawDimensions returns 4 distinct within-pool items");
  {
    const drawn: DimensionEntry[] = drawDimensions("urgency", 4, 12345, []);
    assert(drawn.length === 4, `drawDimensions returns 4 items (got ${drawn.length})`);
    const ids = new Set(drawn.map(d => d.id));
    assert(ids.size === 4, `drawDimensions returns 4 distinct ids (got ${ids.size})`);
    for (const d of drawn) {
      assert(d.angleKey === "urgency", `drawn dimension belongs to angleKey="urgency" (got ${d.angleKey})`);
    }
  }

  // ─── T004 / drawDimensions deterministic for same seed ───
  console.log("  drawDimensions determinism for same seed");
  {
    const a: DimensionEntry[] = drawDimensions("pain", 4, 999, []);
    const b: DimensionEntry[] = drawDimensions("pain", 4, 999, []);
    assert(a.length === b.length, "same seed -> same length");
    for (let i = 0; i < a.length; i++) {
      assert(a[i].id === b[i].id, `same seed -> same id at index ${i} (a=${a[i].id} b=${b[i].id})`);
    }
  }

  // ─── T004 / drawDimensions varies across seeds ───
  console.log("  drawDimensions varies across seeds");
  {
    const set1: string = drawDimensions("urgency", 4, 1, []).map(d => d.id).join(",");
    const set2: string = drawDimensions("urgency", 4, 2, []).map(d => d.id).join(",");
    const set3: string = drawDimensions("urgency", 4, 3, []).map(d => d.id).join(",");
    const distinctSets = new Set([set1, set2, set3]).size;
    assert(distinctSets >= 2, `3 seeds produce ≥2 distinct sets (got ${distinctSets})`);
  }

  // ─── T005 / drawOpenings returns 4 distinct structures ───
  console.log("  drawOpenings returns 4 distinct structures");
  {
    const openings: OpeningStructure[] = drawOpenings(4, 7777, []);
    assert(openings.length === 4, `drawOpenings returns 4 items (got ${openings.length})`);
    const ids = new Set(openings.map(o => o.id));
    assert(ids.size === 4, `drawOpenings returns 4 distinct ids (got ${ids.size})`);
    const knownIds = new Set([
      "percentage", "question", "imperative", "ratio",
      "conditional", "direct_address", "time_reference",
    ]);
    for (const o of openings) {
      assert(knownIds.has(o.id), `opening id "${o.id}" is one of the 7 forms`);
    }
  }

  // ─── T005 / drawOpenings varies across seeds ───
  console.log("  drawOpenings varies across seeds");
  {
    const o1: string = drawOpenings(4, 11, []).map(o => o.id).join(",");
    const o2: string = drawOpenings(4, 22, []).map(o => o.id).join(",");
    const o3: string = drawOpenings(4, 33, []).map(o => o.id).join(",");
    const distinct = new Set([o1, o2, o3]).size;
    assert(distinct >= 2, `drawOpenings varies across seeds (got ${distinct} distinct)`);
  }

  // ─── T008 / fingerprint helpers exported ───
  console.log("  creativeMemory fingerprint helpers exported");
  assert(typeof recordAngleFingerprint === "function", "recordAngleFingerprint exported");
  assert(typeof getRecentFingerprints === "function", "getRecentFingerprints exported");

  // ─── T008 / AngleFingerprint shape: required fields present ───
  {
    const sample: AngleFingerprint = {
      angleKey: "urgency",
      dimensionIds: ["urgency_deadline", "urgency_price_increase"],
      openingId: "question",
      storyFamilies: ["A", "B"],
      timestamp: 0,
    };
    assert(typeof sample.angleKey === "string", "AngleFingerprint.angleKey is string");
    assert(Array.isArray(sample.dimensionIds), "AngleFingerprint.dimensionIds is array");
    assert(typeof sample.openingId === "string" || sample.openingId === undefined, "AngleFingerprint.openingId is string | undefined");
  }

  // ─── T006 / resolutionTrace.copyDiversity additive sub-object ───
  console.log("  resolutionTrace copyDiversity additive");
  {
    const typesSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "types.ts"), "utf-8");
    assert(/copyDiversity/.test(typesSrc), "types.ts references copyDiversity");
    assert(/memoryBiasApplied/.test(typesSrc), "types.ts references memoryBiasApplied");
    assert(/fingerprintsConsidered/.test(typesSrc), "types.ts references fingerprintsConsidered");
    assert(/openingIds/.test(typesSrc), "types.ts references openingIds");
  }

  // ─── T009 / HookVariation type added to src/types.ts ───
  console.log("  HookVariation interface present in src/types.ts");
  {
    const typesSrc = fs.readFileSync(path.join(__dirname, "..", "..", "..", "src", "types.ts"), "utf-8");
    assert(/interface HookVariation/.test(typesSrc), "HookVariation interface declared in src/types.ts");
    assert(/hookText\s*:\s*string/.test(typesSrc), "HookVariation has hookText field");
    assert(/subheadText/.test(typesSrc), "HookVariation has subheadText field");
    assert(/ctaName/.test(typesSrc), "HookVariation has ctaName field");
    assert(/benefitText/.test(typesSrc), "HookVariation has benefitText field");
    assert(/rawBlock/.test(typesSrc), "HookVariation has rawBlock field");
    assert(/variationIndex/.test(typesSrc), "HookVariation has variationIndex field");
  }

  // ─── T007 / rotateCarouselAngles exported from generators ───
  console.log("  rotateCarouselAngles exported from generators.ts");
  {
    const genSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "generators.ts"), "utf-8");
    assert(/export function rotateCarouselAngles\b/.test(genSrc), "rotateCarouselAngles exported from generators.ts");
    assert(/campaignType/.test(genSrc.match(/export function rotateCarouselAngles[\s\S]*?\n\}/)?.[0] || ""), "rotateCarouselAngles signature contains campaignType");
  }

  // ─── T011 / generateVariationsLikeThis exported from generators.ts (Batch 2) ───
  // Intentionally left for Batch 2 (US1 backend) per the batch plan.

  // ─── T014 / US1 backend tests (generateVariationsLikeThis + parser pipeline) ───
  console.log("  US1 — generateVariationsLikeThis prompt mentions the 3 Phase 22 blocks");
  {
    const genSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "generators.ts"), "utf-8");
    // The 3 blocks are interpolated inside buildVariationPrompt() which
    // generateVariationsLikeThis() calls. Walk the file backwards and forwards
    // from the function declaration to capture both the wrapper + its helpers.
    const startIdx = genSrc.indexOf("export async function generateVariationsLikeThis");
    assert(startIdx >= 0, "generateVariationsLikeThis function declared");
    const searchWindow = 20000;
    const regionStart = Math.max(0, startIdx - searchWindow);
    const regionEnd = Math.min(genSrc.length, startIdx + searchWindow);
    const region = genSrc.slice(regionStart, regionEnd);
    assert(/READING_LEVEL_BLOCK/.test(region), "generateVariationsLikeThis pipeline injects READING_LEVEL_BLOCK");
    assert(/LIVED_SYMPTOM_BLOCK/.test(region), "generateVariationsLikeThis pipeline injects LIVED_SYMPTOM_BLOCK");
    assert(/FABRICATION_POLICY_BLOCK/.test(region), "generateVariationsLikeThis pipeline injects FABRICATION_POLICY_BLOCK");
  }

  console.log("  US1 — generateVariationsLikeThis dedupes against existing variations");
  {
    const genSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "generators.ts"), "utf-8");
    const startIdx = genSrc.indexOf("export async function generateVariationsLikeThis");
    const searchWindow = 20000;
    const regionStart = Math.max(0, startIdx - searchWindow);
    const regionEnd = Math.min(genSrc.length, startIdx + searchWindow);
    const region = genSrc.slice(regionStart, regionEnd);
    assert(/existingVariations/.test(region), "function signature accepts existingVariations");
    assert(/dedupAndFilter|dedupe|signature/i.test(region), "function performs dedup/filter logic");
  }

  // ─── T015 / Carousel-ad mode: ANGLE_START/END rawBlocks stored, no upfront slide set ───
  console.log("  US1 — carousel-ad routes via generateCarouselAngles with likeThisPrompt");
  {
    // App.tsx routes carousel-ad via gemini.generateCarouselAngles with likeThisPrompt.
    const appSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "src", "App.tsx"), "utf-8",
    );
    const inCard = appSrc.match(/Phase 23 \u2014 IN-CARD variation carousel[\s\S]{0,3000}/);
    assert(!!inCard, "App.tsx in-card variation handler is present");
    const handler = inCard ? inCard[0] : "";
    assert(/parseHookVariations/.test(handler), "App.tsx handler parses variations via T011a helper");
    assert(/pushVariations/.test(handler), "App.tsx handler pushes to store via pushVariations");
  }

  // ─── T011a / variation-block parser covers both HOOK and ANGLE blocks ───
  console.log("  T011a parser covers both HOOK_START_* and ANGLE_START_*");
  {
    const parserSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "src", "utils", "hookVariationParser.ts"), "utf-8",
    );
    assert(/export function parseHookVariation\b/.test(parserSrc), "parseHookVariation exported");
    assert(/export function parseHookVariations\b/.test(parserSrc), "parseHookVariations exported");
    assert(/HOOK_TEXT/.test(parserSrc), "parser uses HOOK_TEXT");
    assert(/SUBHEADLINE/.test(parserSrc), "parser uses SUBHEADLINE");
    assert(/CTA_BUTTON/.test(parserSrc), "parser uses CTA_BUTTON");
    assert(/HOOK_END|ANGLE_END/.test(parserSrc), "parser handles both end markers");
  }

  // ─── T016 / US1 UI smoke assertions on the store transitions ───
  console.log("  US1 — store: variations state machine (extend, cap, navigation)");
  {
    const storeSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "src", "store.ts"), "utf-8",
    );
    // Initial: empty maps
    assert(/variationCarousels:\s*Record<string, HookVariation\[\]>/.test(storeSrc), "variationCarousels keyed by variant");
    assert(/variationActiveIndex:\s*Record<string, number>/.test(storeSrc), "variationActiveIndex keyed by variant");
    assert(/variationCapReached:\s*Record<string, boolean>/.test(storeSrc), "variationCapReached keyed by variant");
    // pushVariations extends (not resets)
    assert(/pushVariations:\s*\(variant: string, list: HookVariation\[\]\)/.test(storeSrc), "pushVariations signature");
    assert(/const existing = state\.variationCarousels\[variant\] \|\| \[\]/.test(storeSrc), "pushVariations reads existing list (extend, not reset)");
    assert(/\[...\s*existing,\s*\.\.\.accepted\]/.test(storeSrc), "pushVariations merges new onto existing");
    // Cap = 11
    assert(/const cap = 11/.test(storeSrc), "cap is 11 (12 positions including reference)");
    // Cap-reached branch
    assert(/room <= 0/.test(storeSrc), "pushVariations refuses once cap is reached");
    assert(/variationCapReached:.*true/.test(storeSrc), "pushVariations sets capReached when at cap");
    // setVariationActiveIndex clamps to [0, length]
    assert(/Math\.max\(0, Math\.min\(index, max\)\)/.test(storeSrc), "setVariationActiveIndex clamps in [0, listLength]");
  }

  // ─── Slide-plan rotation invariants (B1–B6) ───
  console.log("  slide-plan rotation invariants");
  {
    const slides = buildSlidePlan("cold", 6);
    assert(slides.length === 6, "buildSlidePlan returns 6 slides for slideCount=6");
    assert(slides[0].hasCTA === true, "slide 1 has CTA");
    assert(slides[slides.length - 1].hasCTA === true, "last slide has CTA");
    assert(slides[0].photoInjection === true, "slide 1 has photoInjection");
    for (let i = 1; i < slides.length - 1; i++) {
      assert(!slides[i].hasCTA, `middle slide ${i + 1} has no CTA`);
      assert(!slides[i].photoInjection, `middle slide ${i + 1} has no photoInjection`);
    }
    for (let i = 1; i < slides.length - 2; i++) {
      assert(
        slides[i].narrativeAngle !== slides[i + 1].narrativeAngle || slides.length - 2 <= 1,
        "no two adjacent middle slides share the same angle (when ≥2 middles)",
      );
    }
  }

  // ─── rotateCarouselAngles: 4 of 7, distinct, subset, deterministic ───
  console.log("  rotateCarouselAngles (4-of-7) contract");
  {
    const fams1 = rotateCarouselAngles("cold", 1, []);
    const fams2 = rotateCarouselAngles("cold", 1, []);
    assert(fams1.length === 4, `rotateCarouselAngles returns 4 families (got ${fams1.length})`);
    const sameSeed = fams1.join(",") === fams2.join(",");
    assert(sameSeed, "rotateCarouselAngles is deterministic for same seed");
    // Multi-seed diversity: across N seeds, the SET of drawn families
    // should vary (not be identical every time). A single-pair inequality
    // check is flaky because two seeds can randomly collide; the proper
    // assertion is "most of the draws are distinct".
    const coldPool = new Set(["A", "B", "C", "D", "E", "F", "G"]);
    for (const f of fams1) {
      assert(coldPool.has(f), `cold family "${f}" is a member of the 7-angle pool`);
    }
    const uniqFams = new Set(fams1);
    assert(uniqFams.size === 4, "no family appears twice in one draw");
    // Diversity check: across 6 seeds, at least 3 distinct draws expected
    const diversitySets = new Set<string>();
    for (let s = 0; s < 6; s++) {
      diversitySets.add(rotateCarouselAngles("cold", s, []).join(","));
    }
    assert(diversitySets.size >= 3, `6 seeds produce ≥3 distinct 4-of-7 draws (got ${diversitySets.size})`);
  }

  // ─── T025 / US2 — drawDimensions + drawOpenings contract ─────────────
  console.log("  US2 — drawDimensions + drawOpenings + diversity metadata");
  {
    // Determinism for same (angle, count, seed, memory)
    const a = drawDimensions("pain", 4, 424242, []);
    const b = drawDimensions("pain", 4, 424242, []);
    assert(a.length === b.length, "drawDimensions deterministic for same seed/memory (length)");
    for (let i = 0; i < a.length; i++) {
      assert(a[i].id === b[i].id, `drawDimensions deterministic for same seed/memory (id at ${i})`);
    }
    // Vary across seeds
    const sets = new Set<string>();
    for (let s = 0; s < 6; s++) {
      const set = drawDimensions("statistics", 4, s, []).map((d) => d.id).sort().join(",");
      sets.add(set);
    }
    assert(sets.size >= 2, `6 sequential seeds produce ≥2 distinct sets (got ${sets.size})`);

    // drawOpenings always returns 4 distinct ids from the 7-form pool
    const o = drawOpenings(4, 999, []);
    assert(o.length === 4, "drawOpenings returns 4");
    const ids = new Set(o.map((s) => s.id));
    assert(ids.size === 4, "drawOpenings 4 entries are distinct");

    // Memory bias returns 4 even when ALL pool items are recent
    const allIds = ["urgency_deadline", "urgency_price_increase", "urgency_seats", "urgency_cost_of_inaction", "urgency_window", "urgency_competitive_clock"];
    const allRecent = drawDimensions("urgency", 4, 1, [{ dimensionIds: allIds }]);
    assert(allRecent.length === 4, `memory bias never starves: returns 4 even when all are recent (got ${allRecent.length})`);
    const recentSet = new Set(allIds);
    for (const d of allRecent) {
      assert(recentSet.has(d.id), `memory-biased result still within angle pool (got ${d.id})`);
    }

    // T024 — angle lock invariant: drawn dimensions all belong to the locked angle
    for (const angle of ["urgency", "scarcity", "social_proof", "logic", "emotional", "pain", "curiosity", "statistics", "logical_authority", "future_based"]) {
      const ds = drawDimensions(angle, 4, 123, []);
      for (const d of ds) {
        assert(d.angleKey === angle, `angle lock: drawn dim "${d.id}" belongs to angleKey="${angle}" (got "${d.angleKey}")`);
      }
    }
  }

  // ─── T026 / US2 — diversity assertion: 5 sequential seeds → ≥3 distinct sets ─
  console.log("  US2 — diversity assertion: 5 sequential seeds → ≥3 distinct sets");
  {
    const sets = new Set<string>();
    for (let s = 0; s < 5; s++) {
      const set = drawDimensions("social_proof", 4, s, []).map((d) => d.id).sort().join(",");
      sets.add(set);
    }
    assert(sets.size >= 3, `5 sequential seeds produce ≥3 distinct dimension sets (got ${sets.size})`);
  }

  // ─── T035 / US3 — rotateCarouselAngles: same seed → same 4, different seeds → differ
  console.log("  US3 — rotateCarouselAngles: 4-of-7 contract (cold + retargeting)");
  {
    const coldA = rotateCarouselAngles("cold", 100, []);
    const coldA2 = rotateCarouselAngles("cold", 100, []);
    assert(coldA.join(",") === coldA2.join(","), "same seed returns identical 4 families");
    const coldB = rotateCarouselAngles("cold", 200, []);
    assert(coldA.join(",") !== coldB.join(","), "different seeds return different 4 families");
    const coldPool = new Set(["A", "B", "C", "D", "E", "F", "G"]);
    for (const f of coldA) {
      assert(coldPool.has(f), `cold family "${f}" is in the 7-angle pool`);
    }
    assert(new Set(coldA).size === 4, "no family appears twice in a single cold draw");

    const retA = rotateCarouselAngles("retargeting", 100, []);
    const retPool = new Set(["P", "M", "R", "I", "C", "Q", "E"]);
    for (const f of retA) {
      assert(retPool.has(f), `retargeting family "${f}" is in the 7-angle pool`);
    }
    assert(new Set(retA).size === 4, "no family appears twice in a single retargeting draw");

    // Memory bias: down-weight recent families; never ban
    const allRet = ["P", "M", "R", "I", "C", "Q", "E"];
    const allRecentRet = rotateCarouselAngles("retargeting", 1, allRet);
    assert(allRecentRet.length === 4, "memory bias never starves: returns 4 even when all are recent");
  }

  // ─── T035 / US3 — middle-slide order: rotated, no adjacent repeat
  console.log("  US3 — middle-slide order rotated, no adjacent repeat");
  {
    const plan0 = buildSlidePlan("cold", 7, 0);
    const plan3 = buildSlidePlan("cold", 7, 3);
    // Same campaignType + slideCount, different seed → different middle order
    const middles0 = plan0.filter((s) => s.role === "middle").map((s) => s.narrativeAngle).join(",");
    const middles3 = plan3.filter((s) => s.role === "middle").map((s) => s.narrativeAngle).join(",");
    assert(middles0 !== middles3, `middle-slide order varies by seed (got '${middles0}' vs '${middles3}')`);
    // No two adjacent middle slides share the same angle. Both `plan0[i]`
    // and `plan0[i+1]` must be middle slides; the slide plan has 1 hook
    // at index 0 and 1 close at the last index, so middle slides run
    // [1 .. length-2]. The comparison `(i+1) <= length-2` translates to
    // `i < length-2` for the loop bound.
    for (let i = 1; i < plan0.length - 2; i++) {
      assert(
        plan0[i].narrativeAngle !== plan0[i + 1].narrativeAngle,
        "no two adjacent middle slides share an angle (plan0)",
      );
    }
  }

  // ─── T035 / US3 — copyDiversity sub-object populated after generation (code-level)
  console.log("  US3 — copyDiversity sub-object present in ResolutionTrace type");
  {
    const typesSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "types.ts"), "utf-8");
    assert(/copyDiversity/.test(typesSrc), "ResolutionTrace has copyDiversity sub-object");
    assert(/storyDirectionFamilies\?/.test(typesSrc), "copyDiversity has storyDirectionFamilies?");
    assert(/middleAngleOrder\?/.test(typesSrc), "copyDiversity has middleAngleOrder?");
  }

  // ─── T035 / US3 — generators.ts wired to use rotateCarouselAngles + drawDimensions
  console.log("  US3 — generators.ts calls rotateCarouselAngles + uses copyDiversity");
  {
    const genSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "generators.ts"), "utf-8");
    assert(/rotateCarouselAngles\(/.test(genSrc), "generators.ts calls rotateCarouselAngles");
    assert(/buildSlidePlan\(/.test(genSrc), "generators.ts calls buildSlidePlan (wired into live carousel path)");
    assert(/makeProjectSeed\(/.test(genSrc), "generators.ts uses makeProjectSeed");
    assert(/getRecentFingerprintsForRotation\(/.test(genSrc), "generators.ts reads recent fingerprints");
    assert(/recordAngleFingerprint\(/.test(genSrc), "generators.ts records fingerprints post-generation");
  }

  // ─── T035 / US3 — spec-001 carousel contract synced (FR-022)
  console.log("  US3 — spec-001 carousel contract synced per FR-022");
  {
    const contractSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "specs", "001-resolver-completeness-trace", "contracts", "carousel-slide-count-plan.md"),
      "utf-8",
    );
    assert(/Phase 23/.test(contractSrc), "spec-001 contract documents Phase 23 rotation");
    assert(/pool\[\(i \+ offset\)/.test(contractSrc), "spec-001 contract documents rotated middle-slide assignment");
    assert(/No two adjacent middle slides/.test(contractSrc), "spec-001 contract re-states the no-adjacent-repeat invariant");
  }

  // ─── T035 / US3 — reference doc reconciled (D11)
  console.log("  US3 — reference doc reconciled (Section 5.A → contract pointer)");
  {
    const refSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "specs", "_shared", "COPY_SYSTEM_REFERENCE.md"),
      "utf-8",
    );
    assert(/Section 5\.A reconciliation/.test(refSrc) || /carousel-slide-count-plan/.test(refSrc), "reference doc reconciles Section 5.A pointer");
  }

  // ─── FAIL-2 / T023 — copyDiversity populated after single-hook TOV generation ─
  console.log("  FAIL-2 — copyDiversity populated after single-hook TOV generation");
  {
    const genSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "generators.ts"), "utf-8");
    // Survivor variable + getter exist
    assert(/let _lastCopyDiversity/.test(genSrc), "generators.ts declares _lastCopyDiversity survivor");
    assert(/export function getLastCopyDiversity\b/.test(genSrc), "getLastCopyDiversity is exported");
    // Single-hook path populates it with the drawn dimensions + openings
    assert(/_lastCopyDiversity = \{[\s\S]*?drawnDimensionIds:/.test(genSrc), "single-hook path sets _lastCopyDiversity.drawnDimensionIds");
    assert(/openingIds:\s*(?:seenOpenings|_phase23DrawnOpenings)/.test(genSrc), "single-hook path sets _lastCopyDiversity.openingIds (from seenOpenings or _phase23DrawnOpenings)");
    // It is merged into the persisted ResolutionTrace
    assert(/copyDiversity:\s*_lastCopyDiversity/.test(genSrc), "copyDiversity merged into _lastResolutionTrace in generateFinalAd");
    // resetResolutionTrace must NOT clear the survivor (it survives to generateFinalAd)
    const resetBody = genSrc.match(/export function resetResolutionTrace[\s\S]*?\n\}/)?.[0] || "";
    assert(!/_lastCopyDiversity/.test(resetBody), "resetResolutionTrace does NOT clear _lastCopyDiversity");
  }

  // ─── FAIL-2 / T030 — copyDiversity.storyDirectionFamilies populated after carousel gen ─
  console.log("  FAIL-2 — copyDiversity.storyDirectionFamilies populated after carousel generation");
  {
    const genSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "generators.ts"), "utf-8");
    const carStart = genSrc.indexOf("export async function generateCarouselAngles");
    assert(carStart >= 0, "generateCarouselAngles function found");
    const carRegion = genSrc.slice(carStart, carStart + 8000);
    assert(/storyDirectionFamilies:\s*_phase23CarouselFamilies/.test(carRegion), "carousel path sets _lastCopyDiversity.storyDirectionFamilies");
    // middleAngleOrder is recorded where the slide plan is built
    assert(/middleAngleOrder:\s*middlePlans\.map/.test(genSrc), "slide-plan build records _lastCopyDiversity.middleAngleOrder");
  }

  // ─── FAIL-3 — carousel records a fingerprint (wiring + non-blocking stub) ─────
  console.log("  FAIL-3 — carousel recordAngleFingerprint is called + non-blocking");
  {
    const genSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "generators.ts"), "utf-8");
    const carStart = genSrc.indexOf("export async function generateCarouselAngles");
    // Use a much larger slice: the fingerprint is recorded AFTER the model call
    // (Phase 23 fix: don't pollute the memory pool with families the user never
    // saw), so it sits well past the first 8k chars of the function body.
    const carRegion = genSrc.slice(carStart, carStart + 25000);
    // The carousel path (not just the single-hook path) records a fingerprint
    assert(/recordAngleFingerprint\(/.test(carRegion), "carousel path calls recordAngleFingerprint");
    assert(/angleKey:\s*`carousel-\$\{campaignType\}`/.test(carRegion), "carousel fingerprint uses carousel-<campaignType> angleKey");
    assert(/storyFamilies:\s*_phase23CarouselFamilies/.test(carRegion), "carousel fingerprint records the drawn storyFamilies");
    // The read side is angle-scoped so single-hook and carousel recents don't cross-contaminate
    const cdSrc = fs.readFileSync(path.join(__dirname, "..", "..", "src", "copyDiversity.ts"), "utf-8");
    assert(/\.filter\(\(f\)\s*=>\s*f\.angleKey === angleKey\)/.test(cdSrc), "getRecentFingerprintsForRotation is angle-scoped");
    // Runtime stub: recordAngleFingerprint is non-blocking — calling it returns a Promise
    // and never throws synchronously even with no firebase app initialised.
    // (timestamp is intentionally NOT supplied — the writer always
    // overwrites it with FieldValue.serverTimestamp().)
    const ret = recordAngleFingerprint("audit-test-user", {
      angleKey: "carousel-cold",
      dimensionIds: [],
      storyFamilies: ["A", "B", "C", "D"],
    });
    assert(ret instanceof Promise, "recordAngleFingerprint returns a Promise (callable as a stub)");
    ret.catch(() => { /* non-blocking by contract */ });
  }

  // ─── HOTFIX — remapCarouselFamiliesToSlots: drawn family labels → fixed A–D ─
  console.log("  HOTFIX — remapCarouselFamiliesToSlots relabels drawn families to A–D");
  {
    const mkBlock = (f: string) =>
      `ANGLE_START_${f}\nHOOK_TEXT: hook ${f}\nSUBHEADLINE: sub ${f}\nSTORY_ARC: arc ${f}\nCTA_BUTTON: cta ${f}\nANGLE_END_${f}`;

    // Cold draw with a collision: drawn "A" must become slot C, NOT stay A.
    const coldFamilies = ["C", "F", "A", "E"];
    const coldInput = coldFamilies.map(mkBlock).join("\n\n");
    const coldOut = remapCarouselFamiliesToSlots(coldInput, coldFamilies);

    // Draw order → positional slots A,B,C,D
    assert(/ANGLE_START_A\b/.test(coldOut) && /ANGLE_END_A\b/.test(coldOut), "remap: slot A present");
    assert(/ANGLE_START_B\b/.test(coldOut) && /ANGLE_END_B\b/.test(coldOut), "remap: slot B present");
    assert(/ANGLE_START_C\b/.test(coldOut) && /ANGLE_END_C\b/.test(coldOut), "remap: slot C present");
    assert(/ANGLE_START_D\b/.test(coldOut) && /ANGLE_END_D\b/.test(coldOut), "remap: slot D present");

    // Content moved with the label: families[0]="C" content lands in slot A, etc.
    assert(/ANGLE_START_A\nHOOK_TEXT: hook C\b/.test(coldOut), "remap: families[0] (C) content → slot A");
    assert(/ANGLE_START_B\nHOOK_TEXT: hook F\b/.test(coldOut), "remap: families[1] (F) content → slot B");
    // Collision case: drawn "A" → slot C, and its content is the A content (not double-rewritten)
    assert(/ANGLE_START_C\nHOOK_TEXT: hook A\b/.test(coldOut), "remap: families[2] (A) content → slot C (collision)");
    assert(/ANGLE_START_D\nHOOK_TEXT: hook E\b/.test(coldOut), "remap: families[3] (E) content → slot D");

    // Exactly one of each slot label (no stray drawn-family labels left, no dup A)
    const startCount = (l: string) => (coldOut.match(new RegExp(`ANGLE_START_${l}\\b`, "g")) || []).length;
    assert(startCount("A") === 1, "remap: exactly one ANGLE_START_A (no double-rewrite)");
    assert(startCount("B") === 1, "remap: exactly one ANGLE_START_B");
    assert(startCount("C") === 1, "remap: exactly one ANGLE_START_C");
    assert(startCount("D") === 1, "remap: exactly one ANGLE_START_D");
    assert(startCount("E") === 0 && startCount("F") === 0, "remap: no out-of-range drawn-family labels remain");

    // Retargeting draw also remaps to A/B/C/D
    const rtFamilies = ["M", "R", "P", "Q"];
    const rtInput = rtFamilies.map(mkBlock).join("\n\n");
    const rtOut = remapCarouselFamiliesToSlots(rtInput, rtFamilies);
    assert(/ANGLE_START_A\nHOOK_TEXT: hook M\b/.test(rtOut), "remap(retargeting): families[0] (M) → slot A");
    assert(/ANGLE_START_B\nHOOK_TEXT: hook R\b/.test(rtOut), "remap(retargeting): families[1] (R) → slot B");
    assert(/ANGLE_START_C\nHOOK_TEXT: hook P\b/.test(rtOut), "remap(retargeting): families[2] (P) → slot C");
    assert(/ANGLE_START_D\nHOOK_TEXT: hook Q\b/.test(rtOut), "remap(retargeting): families[3] (Q) → slot D");
    assert(
      ["M", "R", "P", "Q"].every((l) => (rtOut.match(new RegExp(`ANGLE_START_${l}\\b`, "g")) || []).length === 0),
      "remap(retargeting): no original drawn-family labels remain",
    );

    // The audit record (the families array) is NOT mutated by the remap.
    assert(
      coldFamilies.join(",") === "C,F,A,E" && rtFamilies.join(",") === "M,R,P,Q",
      "remap: _phase23CarouselFamilies-style input array is not mutated (audit keeps real keys)",
    );

    // Empty / no-family inputs are passed through unchanged (defensive).
    assert(remapCarouselFamiliesToSlots("", coldFamilies) === "", "remap: empty text passthrough");
    assert(remapCarouselFamiliesToSlots(coldInput, []) === coldInput, "remap: empty families passthrough");
  }

  // ─── Summary ───
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
