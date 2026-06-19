// functions/src/__tests__/copyQuality.test.ts
// Purpose: unit tests for Phase 22 copy quality upgrade constants + parser.
// Verifies the six constants are exported, transcribe their named reference
// sections, are wired into the four prompt surfaces, and that the parser
// correctly strips CLAIM_FLAG lines from a raw response without leaking
// them into the assembled four fields.

import { SYSTEM_TOV } from "../promptConstants.js";
import {
  READING_LEVEL_BLOCK,
  LIVED_SYMPTOM_BLOCK,
  FABRICATION_POLICY_BLOCK,
  BANNED_CTA_LIST,
  COPY_SCORING_DIMENSIONS,
  COPY_REWRITE_DIAGNOSES,
} from "../copywriting_knowledge.js";
import { extractCopyFieldsFromResponse } from "../generators.js";
// `AdInputs` is a local type alias in generators.ts; not re-exported, so we
// declare a structural alias locally that satisfies the function's parameter type.
type AdInputs = Record<string, any>;

declare const require: any;
declare const process: any;
declare const console: any;

const fs = require("fs");
const path = require("path");

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

  console.log("copyQuality tests");

  // ═══════════════════════════════════════════════════════════
  // PHASE 22 — US1 / US2 / US3 / US4 TEST ASSERTIONS
  // ═══════════════════════════════════════════════════════════

  // ─── Six constants exported and non-empty ───
  console.log("  constants exported");
  assert(typeof READING_LEVEL_BLOCK === "string" && READING_LEVEL_BLOCK.length > 0, "READING_LEVEL_BLOCK exported and non-empty");
  assert(typeof LIVED_SYMPTOM_BLOCK === "string" && LIVED_SYMPTOM_BLOCK.length > 0, "LIVED_SYMPTOM_BLOCK exported and non-empty");
  assert(typeof FABRICATION_POLICY_BLOCK === "string" && FABRICATION_POLICY_BLOCK.length > 0, "FABRICATION_POLICY_BLOCK exported and non-empty");
  assert(Array.isArray(BANNED_CTA_LIST) && BANNED_CTA_LIST.length === 5, "BANNED_CTA_LIST exported with 5 entries");
  assert(typeof COPY_SCORING_DIMENSIONS === "string" && COPY_SCORING_DIMENSIONS.length > 0, "COPY_SCORING_DIMENSIONS exported and non-empty");
  assert(typeof COPY_REWRITE_DIAGNOSES === "string" && COPY_REWRITE_DIAGNOSES.length > 0, "COPY_REWRITE_DIAGNOSES exported and non-empty");

  // ─── US1: Key signal phrases in READING_LEVEL_BLOCK ───
  console.log("  reading-level signals");
  assert(/6(th)?\s*-?\s*grade|6th/i.test(READING_LEVEL_BLOCK), "READING_LEVEL_BLOCK mentions 6th grade");
  assert(/short everyday|everyday words|short sentences/i.test(READING_LEVEL_BLOCK), "READING_LEVEL_BLOCK mentions short everyday words/sentences");
  assert(/no jargon|abstract nouns/i.test(READING_LEVEL_BLOCK), "READING_LEVEL_BLOCK mentions no jargon / no abstract nouns");
  assert(/فصحى/.test(READING_LEVEL_BLOCK), "READING_LEVEL_BLOCK mentions simple spoken-style فصحى");

  // ─── US1: Key signal phrases in LIVED_SYMPTOM_BLOCK ───
  console.log("  lived-symptom signals");
  assert(/lived|concrete|recognizable|scene|time of day|that.?s literally me/i.test(LIVED_SYMPTOM_BLOCK), "LIVED_SYMPTOM_BLOCK mentions lived / concrete / recognizable / scene");
  assert(/never.*abstract|not.*abstract|state the problem.*abstractly/i.test(LIVED_SYMPTOM_BLOCK), "LIVED_SYMPTOM_BLOCK says never state the problem abstractly");
  assert(/pain|audience/i.test(LIVED_SYMPTOM_BLOCK), "LIVED_SYMPTOM_BLOCK references pain + audience inputs");

  // ─── US1: Rendered SYSTEM_TOV carries reading-level and lived-symptom signals ───
  console.log("  SYSTEM_TOV carries all Track-1 signals");
  assert(/6(th)?\s*-?\s*grade|6th/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions 6th grade reading level");
  assert(/lived symptom|concrete moment|recognizable detail|that.?s literally me|lived.*symptom|concrete.*moment/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions lived symptom / concrete moment");
  assert(/Banned CTAs|CLAIM_FLAG|claim.?flag|fabricated verifiable/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions fabrication flag / banned CTAs");

  // ─── US1: generators.ts references the block names + copywriting_knowledge.ts defines them ───
  console.log("  generators.ts and copywriting_knowledge.ts contain block markers");
  // The compiled .js lives at lib/__tests__/copyQuality.test.js; the source
  // .ts lives at src/__tests__/copyQuality.test.ts. Walk up two levels to the
  // functions/ root, then descend into src/ to read the source files.
  const sourceRoot = path.join(__dirname, "..", "..", "src");
  const generatorsSrc = fs.readFileSync(path.join(sourceRoot, "generators.ts"), "utf-8");
  const cwKnowledgeSrc = fs.readFileSync(path.join(sourceRoot, "copywriting_knowledge.ts"), "utf-8");
  assert(/READING_LEVEL_BLOCK/.test(generatorsSrc), "generators.ts references READING_LEVEL_BLOCK");
  assert(/LIVED_SYMPTOM_BLOCK/.test(generatorsSrc), "generators.ts references LIVED_SYMPTOM_BLOCK");
  assert(/FABRICATION_POLICY_BLOCK/.test(generatorsSrc), "generators.ts references FABRICATION_POLICY_BLOCK");
  assert(/BANNED_CTA_LIST/.test(generatorsSrc), "generators.ts references BANNED_CTA_LIST");
  assert(/READING_LEVEL_BLOCK/.test(cwKnowledgeSrc), "copywriting_knowledge.ts defines READING_LEVEL_BLOCK");
  assert(/LIVED_SYMPTOM_BLOCK/.test(cwKnowledgeSrc), "copywriting_knowledge.ts defines LIVED_SYMPTOM_BLOCK");
  assert(/FABRICATION_POLICY_BLOCK/.test(cwKnowledgeSrc), "copywriting_knowledge.ts defines FABRICATION_POLICY_BLOCK");
  assert(/BANNED_CTA_LIST/.test(cwKnowledgeSrc), "copywriting_knowledge.ts defines BANNED_CTA_LIST");

  // ─── US2: BANNED_CTA_LIST contains the five phrases (set membership, order-insensitive) ───
  console.log("  BANNED_CTA_LIST contents");
  const expectedBanned = new Set(["Learn more", "Sign up now", "Book now", "Get started", "Click here"]);
  assert(
    BANNED_CTA_LIST.length === expectedBanned.size &&
      BANNED_CTA_LIST.every((cta) => expectedBanned.has(cta)),
    `BANNED_CTA_LIST contains exactly the five banned phrases (set membership): ${[...expectedBanned].join(", ")}`,
  );

  // ─── US2: SYSTEM_TOV contains the banned-CTA + CTA-formula signal ───
  console.log("  SYSTEM_TOV contains CTA signals");
  assert(/Learn more/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions 'Learn more' in banned list");
  assert(/Sign up now/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions 'Sign up now' in banned list");
  assert(/Book now/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions 'Book now' in banned list");
  assert(/Get started/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions 'Get started' in banned list");
  assert(/Click here/i.test(SYSTEM_TOV), "SYSTEM_TOV mentions 'Click here' in banned list");
  assert(/specific verb.*offer|verb.*offer.*arrow|payoff tied to/i.test(SYSTEM_TOV), "SYSTEM_TOV contains the CTA formula signal (specific verb, offer, arrow, payoff)");

  // ─── US2: CTA-point prompt builder includes the banned-list guidance ───
  console.log("  CTA-point guidance in generators.ts");
  assert(/BANNED_CTA_LIST\.join\(|avoid.*Learn more|avoid.*banned|Banned CTAs/i.test(generatorsSrc), "generators.ts wires banned-CTA guidance near CTA points");

  // ─── US2: assert no code path overwrites inputs.cta ───
  console.log("  inputs.cta is never overwritten");
  assert(!/\binputs\.cta\s*=/.test(generatorsSrc) && !/\binputs!\.cta\s*=/.test(generatorsSrc), "no code path mutates inputs.cta");
  assert(!/\b\(inputs as any\)\.cta\s*=/.test(generatorsSrc), "no code path mutates (inputs as any).cta");

  // ─── US3: FABRICATION_POLICY_BLOCK contains framing-free/flag-not-block + CLAIM_FLAG output contract ───
  console.log("  FABRICATION_POLICY_BLOCK signals");
  assert(/framing|scenarios|hypotheticals|metaphors/i.test(FABRICATION_POLICY_BLOCK), "FABRICATION_POLICY_BLOCK mentions framing / scenarios / hypotheticals / metaphors");
  assert(/flag|never (block|delete|refuse)|do not (block|delete|refuse)/i.test(FABRICATION_POLICY_BLOCK), "FABRICATION_POLICY_BLOCK says flag — never block/delete/refuse");
  assert(/CLAIM_FLAG/i.test(FABRICATION_POLICY_BLOCK), "FABRICATION_POLICY_BLOCK names the CLAIM_FLAG output contract");
  assert(/named person|exact figure|hard count|star rating|concrete deadline/i.test(FABRICATION_POLICY_BLOCK), "FABRICATION_POLICY_BLOCK enumerates fabricated verifiable specifics");

  // ─── US3: extractCopyFieldsFromResponse() strips CLAIM_FLAG lines ───
  console.log("  parser strips CLAIM_FLAG lines");
  {
    const inputs: Partial<AdInputs> = {
      adLanguage: "en",
      cta: "Get the playbook",
    };
    const raw = `HOOK_START_A
HOOK_TEXT: Still posting daily but no calls
SUBHEADLINE: The funnel step everyone skips
CTA_BUTTON: Get the playbook ||| And fill next month
HOOK_END_A
HOOK_START_B
HOOK_TEXT: 9 out of 10 coaches leak leads here
SUBHEADLINE: Find the one fix
CTA_BUTTON: Get the playbook ||| And fix the leak
HOOK_END_B
CLAIM_FLAG: 9 out of 10 coaches — invented statistic, must be backed or removed
CLAIM_FLAG: "coach Ahmed" — invented testimonial name, must be backed
HOOK_START_C
HOOK_TEXT: Your offer leaks in one place
SUBHEADLINE: We find it together
CTA_BUTTON: Get the playbook ||| And stop the leak
HOOK_END_C
HOOK_START_D
HOOK_TEXT: Tomorrow's calendar is built today
SUBHEADLINE: Take 20 minutes
CTA_BUTTON: Get the playbook ||| And fill next month
HOOK_END_D`;

    const result = extractCopyFieldsFromResponse(raw, inputs as AdInputs);
    assert(result.claimFlags.length === 2, `parser extracted 2 claim flags (got ${result.claimFlags.length})`);
    assert(result.claimFlags[0].text.includes("9 out of 10"), `first claim flag text captured verbatim (got ${JSON.stringify(result.claimFlags[0])})`);
    assert(typeof result.claimFlags[0].reason === "string" && result.claimFlags[0].reason.length > 0, `first claim flag has a reason (got ${JSON.stringify(result.claimFlags[0])})`);
    assert(result.claimFlags[1].text.toLowerCase().includes("coach ahmed"), `second claim flag text captured verbatim (got ${JSON.stringify(result.claimFlags[1])})`);
    assert(result.fields.hookText.length > 0, "parser returned a non-empty hookText");
    // Phase 24B: optional fields widen to `string | null`. Coerce to string for
    // .length / .test() calls so the Phase 22 invariants stay asserted under the
    // new type contract (a present field is always a non-empty string).
    const _subhead = result.fields.subheadText ?? "";
    const _cta = result.fields.ctaName ?? "";
    const _benefit = result.fields.benefitText ?? "";
    assert(_subhead.length > 0, "parser returned a non-empty subheadText");
    assert(_cta.length > 0, "parser returned a non-empty ctaName");
    assert(!/CLAIM_FLAG/i.test(result.fields.hookText), "hookText has no CLAIM_FLAG substring");
    assert(!/CLAIM_FLAG/i.test(_subhead), "subheadText has no CLAIM_FLAG substring");
    assert(!/CLAIM_FLAG/i.test(_cta), "ctaName has no CLAIM_FLAG substring");
    assert(!/CLAIM_FLAG/i.test(_benefit), "benefitText has no CLAIM_FLAG substring");
  }

  // ─── US3: parser with NO CLAIM_FLAG line returns unchanged fields + empty claimFlags ───
  console.log("  parser with no CLAIM_FLAG returns empty flags");
  {
    const inputs: Partial<AdInputs> = {
      adLanguage: "en",
      cta: "Watch the training",
    };
    const raw = `HOOK_START_A
HOOK_TEXT: 3 reasons leads ghost you
SUBHEADLINE: And how to fix each one
CTA_BUTTON: Watch the training ||| And fix your funnel
HOOK_END_A
HOOK_START_B
HOOK_TEXT: The real reason ads stop working
SUBHEADLINE: It's not the creative
CTA_BUTTON: Watch the training ||| And find the leak
HOOK_END_B
HOOK_START_C
HOOK_TEXT: One sentence changes everything
SUBHEADLINE: Hear it on the call
CTA_BUTTON: Watch the training ||| And hear the truth
HOOK_END_C
HOOK_START_D
HOOK_TEXT: The 3-step leak detector
SUBHEADLINE: Take 20 minutes
CTA_BUTTON: Watch the training ||| And fix the funnel
HOOK_END_D`;
    const result = extractCopyFieldsFromResponse(raw, inputs as AdInputs);
    assert(result.claimFlags.length === 0, `parser returned zero claim flags (got ${result.claimFlags.length})`);
    assert(result.fields.hookText.length > 0, "parser returned hookText");
    assert(result.fields.ctaName === "Watch the training", `ctaName preserved as input (got ${JSON.stringify(result.fields.ctaName)})`);
  }

  // ─── US4: COPY_SCORING_DIMENSIONS mentions the two hard dims + pass rule ───
  console.log("  COPY_SCORING_DIMENSIONS signals");
  assert(/reading level|6(th)?\s*-?\s*grade|6th/i.test(COPY_SCORING_DIMENSIONS), "COPY_SCORING_DIMENSIONS mentions reading level / 6th grade");
  assert(/lived.symptom|lived symptom|depth/i.test(COPY_SCORING_DIMENSIONS), "COPY_SCORING_DIMENSIONS mentions lived-symptom depth");
  assert(/average.*8|avg.*≥.*8|avg >= 8|pass/i.test(COPY_SCORING_DIMENSIONS), "COPY_SCORING_DIMENSIONS mentions pass condition (avg ≥ 8)");

  // ─── US4: COPY_REWRITE_DIAGNOSES contains the two new diagnosis rows ───
  console.log("  COPY_REWRITE_DIAGNOSES signals");
  assert(/Above 6th grade|Above\s*6(th)?\s*-?\s*grade/i.test(COPY_REWRITE_DIAGNOSES), "COPY_REWRITE_DIAGNOSES has 'Above 6th grade' row");
  assert(/Surface-level|Surface level/i.test(COPY_REWRITE_DIAGNOSES), "COPY_REWRITE_DIAGNOSES has 'Surface-level' row");
  assert(/max.*2|2 passes|two passes/i.test(COPY_REWRITE_DIAGNOSES), "COPY_REWRITE_DIAGNOSES mentions max-2-pass rule");

  // ─── US4: drift-marker line is present in the constants file source ───
  console.log("  drift marker present");
  assert(/Implements specs\/_shared\/COPY_SYSTEM_REFERENCE\.md/i.test(cwKnowledgeSrc), "drift-marker line present in copywriting_knowledge.ts");

  // ─── US4: defined-but-unwired (COPY_SCORING_DIMENSIONS, COPY_REWRITE_DIAGNOSES) ───
  console.log("  defined-but-unwired");
  const generatorsHasScoring = /COPY_SCORING_DIMENSIONS/.test(generatorsSrc);
  const generatorsHasDiagnoses = /COPY_REWRITE_DIAGNOSES/.test(generatorsSrc);
  assert(!generatorsHasScoring, "COPY_SCORING_DIMENSIONS is NOT imported in generators.ts");
  assert(!generatorsHasDiagnoses, "COPY_REWRITE_DIAGNOSES is NOT imported in generators.ts");

  // ─── Phase 24B (US3): hookText status is NEVER 'absent' — RequiredFieldStatus enforced ───
  // FR-002 / D5 / INV-4: hookText is the variation's required identity. Its status
  // is `present | parse_failure`, never `absent`. The parser must enforce this at
  // runtime: even when the input has no HOOK_TEXT marker at all (which would map
  // hookText to ""), the resulting status MUST be parse_failure, not absent.
  // This is the field-level runtime enforcement that complements the type system
  // (RequiredFieldStatus in src/types.ts / functions/src/types.ts).
  console.log("  hookText status is NEVER 'absent' (RequiredFieldStatus enforced)");
  {
    // The parser returns a CopyFieldStatuses object on every call. The status
    // type is:
    //   hookText:    "present" | "parse_failure"            (RequiredFieldStatus)
    //   subheadText: "present" | "absent" | "parse_failure" (CopyFieldStatus)
    //   ctaName:     "present" | "absent" | "parse_failure"
    //   benefitText: "present" | "absent" | "parse_failure"
    //
    // We assert on every possible parser output that hookText.status is one of
    // {present, parse_failure} — never 'absent'. This pins the runtime
    // contract enforced by extractCopyFieldsFromResponse.
    const inputsArr: Partial<AdInputs>[] = [
      { adLanguage: "en", cta: "Watch the training" },
      { adLanguage: "en", cta: "Get the playbook" },
      { adLanguage: "ar", cta: "احجز المكالمة" },
    ];
    const raws = [
      // Headline + sub + cta + benefit (all four fields present).
      `HOOK_START_A
HOOK_TEXT: 3 reasons leads ghost you
SUBHEADLINE: And how to fix each one
CTA_BUTTON: Watch the training ||| And fix your funnel
HOOK_END_A`,
      // Headline-only (three optionals absent).
      `HOOK_START_A
HOOK_TEXT: Still posting daily but no calls
HOOK_END_A`,
      // Headline + subhead only.
      `HOOK_START_A
HOOK_TEXT: 9 out of 10 coaches leak leads here
SUBHEADLINE: Find the one fix
HOOK_END_A`,
      // Headline + cta only.
      `HOOK_START_A
HOOK_TEXT: One sentence changes everything
CTA_BUTTON: Get the playbook
HOOK_END_A`,
    ];
    for (let i = 0; i < raws.length; i++) {
      const result = extractCopyFieldsFromResponse(raws[i]!, inputsArr[i % inputsArr.length]! as AdInputs);
      // Pin the RequiredFieldStatus type contract at runtime: hookText.status is
      // typed as "present" | "parse_failure", but we cast to a plain string so
      // the test still runs even if a future refactor widens the type.
      const hookStatus = result.statuses.hookText as string;
      assert(hookStatus === "present" || hookStatus === "parse_failure",
        `RequiredFieldStatus enforced: hookText.status is 'present'|'parse_failure' (got '${hookStatus}') for shape #${i + 1}`);
      assert(hookStatus !== "absent",
        `RequiredFieldStatus enforced: hookText.status is NEVER 'absent' for shape #${i + 1}`);
    }
  }

  // ─── Summary ───
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
