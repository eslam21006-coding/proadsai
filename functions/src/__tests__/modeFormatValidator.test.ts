// functions/src/__tests__/modeFormatValidator.test.ts — unit tests for validateModeFormatCombination

import assert from "node:assert/strict";
import { validateModeFormatCombination, type ModeFormatValidationResult } from "../creativeResolver.js";

const ALL_MODES = [
  "standard_hero", "value_stack", "before_after", "text_only",
  "event_ticket", "webinar_screen", "speaker_card", "book_mockup",
  "device_mockup", "testimonial_carousel",
] as const;

const FORMATS = ["single", "carousel", "batch"] as const;
const CAMPAIGNS = ["cold", "retargeting"] as const;

// subsets() is exponential: 2^n - 1 = 1023 for ALL_MODES (n=10), all sizes.
// At n=10 the test runs 1023 * 3 formats * 2 campaigns = 6138 cases — fast.
// If ALL_MODES grows past ~12 modes, edit MAX_SUBSETS or restrict minSize/maxSize
// before this fuzz becomes slow or memory-heavy.
const MAX_SUBSETS = 4096;
function subsets<T>(arr: readonly T[], minSize: number, maxSize: number): T[][] {
  const n = arr.length;
  const totalSubsets = (1 << n) - 1;
  if (totalSubsets > MAX_SUBSETS) {
    throw new Error(
      `subsets(): ${totalSubsets} subsets for n=${n} exceeds MAX_SUBSETS=${MAX_SUBSETS}. ` +
      `Reduce ALL_MODES.length or raise MAX_SUBSETS — but verify the cartesian product won't slow the suite.`,
    );
  }
  const result: T[][] = [];
  for (let mask = 1; mask < (1 << n); mask++) {
    const sub: T[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) sub.push(arr[i]);
    }
    if (sub.length >= minSize && sub.length <= maxSize) result.push(sub);
  }
  return result;
}

function testRow1(): void {
  console.log("  row 1: before_after + multiple modes");
  const positive = validateModeFormatCombination({
    modes: ["before_after", "standard_hero"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(positive, {
    valid: false,
    reason: "Before/After is single-image only — defines the entire canvas.",
  });
  const negative = validateModeFormatCombination({
    modes: ["before_after"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(negative, { valid: true });
  console.log("    ✅ passed");
}

function testRow2(): void {
  console.log("  row 2: before_after + non-single format");
  const positive = validateModeFormatCombination({
    modes: ["before_after"],
    adFormat: "carousel",
    campaignType: "cold",
  });
  assert.deepStrictEqual(positive, {
    valid: false,
    reason: "Before/After is single-image only.",
  });
  const negative = validateModeFormatCombination({
    modes: ["before_after"],
    adFormat: "single",
    campaignType: "retargeting",
  });
  assert.deepStrictEqual(negative, { valid: true });
  console.log("    ✅ passed");
}

function testRow3(): void {
  console.log("  row 3: text_only + multiple modes");
  const positive = validateModeFormatCombination({
    modes: ["text_only", "standard_hero"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(positive, {
    valid: false,
    reason: "Text-only mode is mutually exclusive — it defines the entire canvas.",
  });
  const negative = validateModeFormatCombination({
    modes: ["text_only"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(negative, { valid: true });
  console.log("    ✅ passed");
}

function testRow4(): void {
  console.log("  row 4: testimonial_carousel + non-carousel format");
  const positive = validateModeFormatCombination({
    modes: ["testimonial_carousel"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(positive, {
    valid: false,
    reason: "Testimonial Carousel requires carousel format.",
  });
  const negative = validateModeFormatCombination({
    modes: ["testimonial_carousel"],
    adFormat: "carousel",
    campaignType: "cold",
  });
  assert.deepStrictEqual(negative, { valid: true });
  console.log("    ✅ passed");
}

function testRow5(): void {
  console.log("  row 5: solo mode in launched set + allowed format");
  const positive = validateModeFormatCombination({
    modes: ["standard_hero"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(positive, { valid: true });
  const negative = validateModeFormatCombination({
    modes: ["unknown_mode"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(negative, {
    valid: false,
    reason: "Combination is not in the launch surface.",
  });
  console.log("    ✅ passed");
}

function testRow6(): void {
  console.log("  row 6: pair in ALLOWED_PAIRS + allowed format");
  const positive = validateModeFormatCombination({
    modes: ["standard_hero", "value_stack"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(positive, { valid: true });
  const negative = validateModeFormatCombination({
    modes: ["event_ticket", "value_stack"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(negative, {
    valid: false,
    reason: "Combination is not in the launch surface.",
  });
  console.log("    ✅ passed");
}

function testRow7(): void {
  console.log("  row 7: everything else → not in launch surface");
  const positive = validateModeFormatCombination({
    modes: ["standard_hero", "value_stack", "event_ticket"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(positive, {
    valid: false,
    reason: "Combination is not in the launch surface.",
  });
  const negative = validateModeFormatCombination({
    modes: ["standard_hero", "event_ticket"],
    adFormat: "single",
    campaignType: "cold",
  });
  assert.deepStrictEqual(negative, { valid: true });
  console.log("    ✅ passed");
}

function testFuzz(): void {
  console.log("  fuzz: cartesian product over mode subsets × formats × campaigns");
  let count = 0;
  // Include empty-modes case explicitly — totality requires the validator to
  // handle modes: [] without throwing. subsets() starts at size 1 by design,
  // so we prepend [] here.
  const modeSubsets: string[][] = [
    [],
    ...subsets(ALL_MODES, 1, ALL_MODES.length).map(s => [...s]),
  ];
  for (const modeSubset of modeSubsets) {
    for (const fmt of FORMATS) {
      for (const camp of CAMPAIGNS) {
        const result: ModeFormatValidationResult = validateModeFormatCombination({
          modes: [...modeSubset],
          adFormat: fmt,
          campaignType: camp,
        });
        assert.ok(
          result !== undefined && result !== null,
          `result defined for modes=${JSON.stringify(modeSubset)} format=${fmt} campaign=${camp}`,
        );
        if (result.valid) {
          assert.ok(
            !("reason" in result),
            `valid result has no reason for modes=${JSON.stringify(modeSubset)}`,
          );
        } else {
          assert.ok(
            typeof result.reason === "string" && result.reason.length > 0,
            `invalid result has reason for modes=${JSON.stringify(modeSubset)}`,
          );
        }
        count++;
      }
    }
  }
  console.log(`    ✅ ${count} combinations validated, no throws`);
}

function main(): void {
  console.log("modeFormatValidator tests");
  try {
    testRow1();
    testRow2();
    testRow3();
    testRow4();
    testRow5();
    testRow6();
    testRow7();
    testFuzz();
    console.log("  all passed");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
