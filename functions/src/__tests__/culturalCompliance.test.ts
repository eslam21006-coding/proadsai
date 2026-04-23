// functions/src/__tests__/culturalCompliance.test.ts
// Purpose: unit tests for functions/src/culturalCompliance.ts — verifies the table
// invariants, the scanAndReplace pure function (single-pass left-to-right scan,
// case-insensitivity, whole-word boundary, longest-match-first), and the non-fatal
// invalid-sourceLayer path.

import {
  scanAndReplace,
  assertInvariants,
  isArabic,
  TRIGGER_WORDS,
  SUBSTITUTIONS,
  HARAM_MOTIFS,
  MOTIF_SUBSTITUTIONS,
} from "../culturalCompliance.js";

// ═══════════════════════════════════════════════════════════
// TABLE INVARIANTS
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

  console.log("culturalCompliance tests");

  // ─── Invariants ───
  console.log("  invariants");
  try {
    assertInvariants();
    assert(true, "assertInvariants does not throw");
  } catch {
    assert(false, "assertInvariants does not throw");
  }

  for (const motif of HARAM_MOTIFS) {
    assert(motif in MOTIF_SUBSTITUTIONS, `HARAM_MOTIFS "${motif}" has MOTIF_SUBSTITUTIONS entry`);
  }
  for (const trigger of TRIGGER_WORDS) {
    assert(trigger in SUBSTITUTIONS, `TRIGGER_WORDS "${trigger}" has SUBSTITUTIONS entry`);
  }
  for (const [, value] of Object.entries(SUBSTITUTIONS)) {
    for (const trigger of TRIGGER_WORDS) {
      const re = new RegExp(`(?:^|\\W)${trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\W|$)`, "i");
      assert(!re.test(value), `substitution "${value}" does not contain trigger "${trigger}"`);
    }
  }

  // ─── Empty input ───
  console.log("  empty input");
  {
    const r = scanAndReplace("", "imagePrompt");
    assert(r.cleaned === "", "empty input returns empty cleaned");
    assert(r.matched.length === 0, "empty input returns empty matched");
  }

  // ─── Case insensitivity ───
  console.log("  case insensitivity");
  {
    const r = scanAndReplace("Wine tasting", "imagePrompt");
    assert(!r.cleaned.includes("Wine"), "title-case Wine is replaced");
    assert(r.matched.includes("wine"), "matched contains lowercased wine");
  }

  // ─── Whole-word boundary ───
  console.log("  whole-word boundary");
  {
    const r = scanAndReplace("wineglass holder", "imagePrompt");
    assert(r.cleaned === "wineglass holder", "substring inside word is not replaced");
    assert(r.matched.length === 0, "no match inside compound word");
  }

  // ─── Longest match first ───
  console.log("  longest match first");
  {
    const r = scanAndReplace("bar counter", "imagePrompt");
    assert(r.cleaned === "service counter", "bar counter replaced as whole phrase");
    assert(r.matched.length === 1, "only one match for bar counter");
  }

  // ─── Non-overlapping ───
  console.log("  non-overlapping");
  {
    const r = scanAndReplace("wine and champagne", "imagePrompt");
    assert(r.matched.length === 2, "two separate matches found");
    assert(!r.cleaned.includes("wine"), "wine replaced");
    assert(!r.cleaned.includes("champagne"), "champagne replaced");
  }

  // ─── No false positive on clean text ───
  console.log("  clean text");
  {
    const r = scanAndReplace("the quick brown fox", "adCopy");
    assert(r.cleaned === "the quick brown fox", "clean text unchanged");
    assert(r.matched.length === 0, "no matches on clean text");
  }

  // ─── Non-fatal invalid sourceLayer ───
  console.log("  invalid sourceLayer returns warning, not throw");
  {
    const r = scanAndReplace("wine tasting", "unknown" as unknown as "imagePrompt");
    assert(r.cleaned === "wine tasting", "invalid sourceLayer: text unchanged");
    assert(r.matched.length === 0, "invalid sourceLayer: empty matched");
    assert(typeof r.warning === "string" && r.warning.length > 0, "invalid sourceLayer: warning string emitted");
  }

  // ─── Round-2 trigger expansion (vodka/rum/pub/crop top/backless/brothel …) ───
  console.log("  round-2 trigger expansion");
  {
    const cases: Array<[string, string]> = [
      ["A glass of vodka on the table", "sparkling water"],
      ["Friday night at the pub", "private lounge"],
      ["rum and coke", "artisan coffee"],
      ["Wearing a crop top and heels", "tailored top"],
      ["backless dress at the gala", "elegant"],
      ["near the brothel district", "private residence"],
    ];
    for (const [input, expectedSub] of cases) {
      const r = scanAndReplace(input, "adCopy");
      assert(r.matched.length > 0, `round-2 trigger fired for: "${input}"`);
      assert(r.cleaned.includes(expectedSub), `round-2 substitution present for: "${input}" → expected "${expectedSub}" in "${r.cleaned}"`);
    }
  }

  // ─── Repeat hits preserve original order including repeats ───
  console.log("  repeat hits preserved");
  {
    const r = scanAndReplace("wine and more wine", "imagePrompt");
    assert(r.matched.length === 2, "two wine hits recorded, not deduplicated");
    assert(r.matched[0] === "wine" && r.matched[1] === "wine", "matched preserves repeat order");
  }

  // ─── Caller-level English bypass: the function is pure and language-agnostic,
  //     but the documented contract is that callers gate with isArabic first. This
  //     test simulates the gate at the caller: if isArabic("en") returns false,
  //     the caller never invokes scanAndReplace and the text is preserved verbatim.
  console.log("  caller gates scanAndReplace for English");
  {
    const englishInput = "Wine tasting with premium cheeses";
    const shouldScan = isArabic("en");
    assert(shouldScan === false, "isArabic('en') returns false");
    // Because the gate said no, the caller leaves the text untouched:
    const finalText = shouldScan ? scanAndReplace(englishInput, "imagePrompt").cleaned : englishInput;
    assert(finalText === englishInput, "English input preserved when caller respects the gate");
  }

  // ─── isArabic is case- and whitespace-tolerant (reviewer round 3) ───
  console.log("  isArabic tolerates case and whitespace");
  {
    assert(isArabic("  ar  ") === true, "whitespace tolerated");
    assert(isArabic("AR-SA") === true, "upper-case locale tolerated");
    assert(isArabic("Ar_Fusha") === true, "mixed-case locale tolerated");
    assert(isArabic("  EN-US ") === false, "non-arabic after trim stays false");
  }

  // ─── Summary ───
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
