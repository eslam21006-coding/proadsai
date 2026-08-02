// functions/src/__tests__/copyScoringGate.test.ts
// Purpose: unit tests for functions/src/copyScoringGate.ts — verifies the
// contract clauses A..L per specs/966-copy-scoring-gate/contracts/copy-scoring-gate.md.
// Every assertion uses a stubbed score/rewrite client — no live model calls.
// Pattern mirrors culturalCompliance.test.ts / expressionMap.test.ts.

import {
  gateCopySet,
  ACTIVE_DIMENSIONS,
  DEFERRED_DIMENSIONS,
  parseBlockIntoFields,
  parseBlockIntoFieldsForSlides,
  substituteFieldsInBlock,
  blockStructurePreserved,
  applyCulturalSubstitution,
  evaluateThreshold,
  validateRewriteCandidate,
  formatGateLogLine,
  type CopyDimension,
  type FieldName,
  type GateDeps,
  type GateInput,
  type ScoreResponse,
  type RewriteResponse,
} from "../copyScoringGate.js";

declare const require: any;
declare const process: any;
declare const console: any;

async function runTests(): Promise<void> {
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

  function makeDeps(overrides?: Partial<GateDeps>): GateDeps {
    return {
      score: async () => ({ fields: [] }),
      rewrite: async () => ({ rewrites: [] }),
      now: () => 0,
      ...overrides,
    };
  }

  function makeInput(overrides?: Partial<GateInput>): GateInput {
    return {
      step: "hook",
      rawBlock: "HOOK_START_A\nHOOK_TEXT: Headline\nHOOK_END_A",
      language: "en",
      untouchable: [],
      ...overrides,
    };
  }

  function allPassingScores(): Record<CopyDimension, number> {
    return {
      audienceSpecificity: 9, painDesireRelevance: 9, clarity: 9,
      scrollStoppingTension: 9, wordingSpecificity: 9, offerRelevance: 9,
      nonGenericLanguage: 9, readingLevel: 9, livedSymptomDepth: 9,
    };
  }

  console.log("copyScoringGate tests");

  // ═══════════════════════════════════════════════════════════
  // A — Module surface
  // ═══════════════════════════════════════════════════════════

  console.log("  A: module surface — never throws (A1)");
  {
    let r: { block: string; trace: any } | null = null;
    let threw = false;
    try {
      r = await gateCopySet(makeInput(), makeDeps({
        score: async () => { throw new Error("boom"); },
      }));
    } catch {
      threw = true;
    }
    assert(!threw, "A1: throwing score stub does not throw out of gateCopySet");
    assert(r !== null, "A1: returns a value even when score throws");
    assert(typeof r?.block === "string", "A1: result has a block string");
  }
  {
    let r: { block: string; trace: any } | null = null;
    let threw = false;
    try {
      r = await gateCopySet(makeInput(), makeDeps({
        score: async () => Promise.reject(new Error("rej")),
        rewrite: async () => Promise.reject(new Error("rej")),
      }));
    } catch {
      threw = true;
    }
    assert(!threw, "A1: rejecting stubs do not throw out of gateCopySet");
    assert(r !== null, "A1: returns a value even when both deps reject");
  }
  {
    let r: { block: string; trace: any } | null = null;
    let threw = false;
    try {
      r = await gateCopySet(makeInput(), makeDeps({
        score: async () => undefined as any,
      }));
    } catch {
      threw = true;
    }
    assert(!threw, "A1: undefined-returning stub does not throw");
    assert(r !== null, "A1: returns a value on undefined response");
  }

  // A1: when score throws, original block is preserved
  {
    const original = "HOOK_START_A\nHOOK_TEXT: Original Headline\nHOOK_END_A";
    const r = await gateCopySet(makeInput({ rawBlock: original }), makeDeps({
      score: async () => { throw new Error("boom"); },
    }));
    assert(r.block === original, "A1: throwing score stub returns the original block");
  }

  // ═══════════════════════════════════════════════════════════
  // B — Scoring shape
  // ═══════════════════════════════════════════════════════════

  console.log("  B: scoring shape");
  assert(ACTIVE_DIMENSIONS.length === 9, `B1: ACTIVE_DIMENSIONS has exactly 9 entries (got ${ACTIVE_DIMENSIONS.length})`);
  const expectedDims: CopyDimension[] = [
    "audienceSpecificity",
    "painDesireRelevance",
    "clarity",
    "scrollStoppingTension",
    "wordingSpecificity",
    "offerRelevance",
    "nonGenericLanguage",
    "readingLevel",
    "livedSymptomDepth",
  ];
  for (const dim of expectedDims) {
    assert(ACTIVE_DIMENSIONS.includes(dim), `B1: ACTIVE_DIMENSIONS contains ${dim}`);
  }
  assert(DEFERRED_DIMENSIONS.length === 6, `B1: DEFERRED_DIMENSIONS has exactly 6 entries (got ${DEFERRED_DIMENSIONS.length})`);

  // B1: a scoring response naming a deferred dimension is rejected as malformed
  {
    let scoreCalls = 0;
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => {
        scoreCalls++;
        return {
          fields: [{
            variationId: "A",
            fieldName: "hookText",
            scores: {
              ...allPassingScores(),
              hookAngleFit: 9, // DEFERRED — should be rejected
            } as any,
          }],
        };
      },
    }));
    assert(scoreCalls === 1, "B1: scoring call was made");
    assert(r.trace.fields.length === 0, "B1: deferred-dimension response → empty fields (fail open)");
  }

  // B2: absent optional fields are never scored
  {
    let scoreFields: any = null;
    const r = await gateCopySet(
      makeInput({
        // block has hookText but no subhead / cta / benefit
        rawBlock: "HOOK_START_A\nHOOK_TEXT: Headline only\nHOOK_END_A",
      }),
      makeDeps({
        score: async (payload) => {
          scoreFields = payload.fields;
          return { fields: payload.fields.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            scores: allPassingScores(),
          })) };
        },
      }),
    );
    assert(scoreFields.length === 1, "B2: only present fields are sent to scoring");
    assert(scoreFields[0].fieldName === "hookText", "B2: the one present field is hookText");
  }

  // B3: untouchable entries are not sent to scoring
  {
    let scoreFields: any = null;
    await gateCopySet(
      makeInput({
        rawBlock: "HOOK_START_A\nHOOK_TEXT: Headline\nHOOK_END_A",
        untouchable: ["UNTEXT_BRAND_NAME"],
      }),
      makeDeps({
        score: async (payload) => {
          scoreFields = payload.fields;
          return { fields: payload.fields.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            scores: allPassingScores(),
          })) };
        },
      }),
    );
    // Untouchable entries do not appear in the `fields` we send — they
    // are carried as context for rewrite (untouchable[] payload arg).
    for (const f of scoreFields) {
      assert(f.value !== "UNTEXT_BRAND_NAME", `B3: untouchable entry "${f.value}" not sent to scorer`);
    }
  }

  // B4: out-of-range scores → fail open
  {
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => ({
        fields: [{
          variationId: "A",
          fieldName: "hookText",
          scores: { ...allPassingScores(), readingLevel: 11 }, // out of range
        }],
      }),
    }));
    assert(r.trace.fields.length === 0, "B4: out-of-range score → empty fields (fail open)");
  }
  {
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => ({
        fields: [{
          variationId: "A",
          fieldName: "hookText",
          scores: { ...allPassingScores(), readingLevel: 5.5 }, // non-integer
        }],
      }),
    }));
    assert(r.trace.fields.length === 0, "B4: non-integer score → empty fields (fail open)");
  }
  {
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => ({
        fields: [{
          variationId: "A",
          fieldName: "hookText",
          scores: { ...allPassingScores(), readingLevel: 0 }, // below 1
        }],
      }),
    }));
    assert(r.trace.fields.length === 0, "B4: score below 1 → empty fields (fail open)");
  }

  // B5: one scoring interaction covers every present field of every variation
  {
    let scoreCalls = 0;
    let fieldsSeen: any[] = [];
    const block =
      "HOOK_START_A\nHOOK_TEXT: A1\nSUBHEADLINE: A2\nCTA_BUTTON: A3\nHOOK_END_A\n" +
      "HOOK_START_B\nHOOK_TEXT: B1\nSUBHEADLINE: B2\nHOOK_END_B\n" +
      "HOOK_START_C\nHOOK_TEXT: C1\nHOOK_END_C";
    await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async (payload) => {
        scoreCalls++;
        fieldsSeen = payload.fields.slice();
        return { fields: payload.fields.map((f) => ({
          variationId: f.variationId,
          fieldName: f.fieldName,
          scores: allPassingScores(),
        })) };
      },
    }));
    assert(scoreCalls === 1, `B5: exactly one scoring call covers every field (got ${scoreCalls})`);
    // Hook + subhead + cta = 3 fields on A, hook + subhead = 2 on B, hook = 1 on C = 6 total
    assert(fieldsSeen.length === 6, `B5: all present fields of all variations scored in one call (got ${fieldsSeen.length})`);
  }

  // B6: language flag passes through to the score client
  {
    let capturedLang = "";
    await gateCopySet(makeInput({ language: "ar" }), makeDeps({
      score: async (payload) => {
        capturedLang = payload.language;
        return { fields: [] };
      },
    }));
    assert(capturedLang === "ar", "B6: language flag is forwarded to scorer");
  }

  // ═══════════════════════════════════════════════════════════
  // C — Threshold evaluation
  // ═══════════════════════════════════════════════════════════

  console.log("  C: threshold evaluation");
  // C1: a field passes when all conditions hold
  {
    const evald = evaluateThreshold(allPassingScores(), "hookText");
    assert(evald.passed === true, "C1: passing scores → passed:true");
    assert(evald.failureReasons.length === 0, "C1: passing scores → empty failureReasons");
  }
  // C2: reading level < 7 fails
  {
    const scores = { ...allPassingScores(), readingLevel: 6 };
    const evald = evaluateThreshold(scores, "hookText");
    assert(evald.passed === false, "C2: readingLevel < 7 fails the field");
    assert(evald.failureReasons.includes("readingLevel<7"), "C2: failureReasons includes 'readingLevel<7'");
  }
  // C2: any other dimension < 6 fails
  {
    const scores = { ...allPassingScores(), clarity: 5 };
    const evald = evaluateThreshold(scores, "hookText");
    assert(evald.passed === false, "C2: clarity < 6 fails the field");
    assert(evald.failureReasons.includes("clarity<6"), "C2: failureReasons includes 'clarity<6'");
  }
  // C2: average < 8 fails (with all individual dimensions passing the dimension minimums)
  {
    const scores: Record<CopyDimension, number> = {
      audienceSpecificity: 7, painDesireRelevance: 7, clarity: 7,
      scrollStoppingTension: 7, wordingSpecificity: 7, offerRelevance: 7,
      nonGenericLanguage: 7, readingLevel: 8, livedSymptomDepth: 8,
    };
    const evald = evaluateThreshold(scores, "hookText");
    assert(evald.passed === false, "C2: average < 8 fails the field");
    assert(evald.failureReasons.includes("average<8"), "C2: failureReasons includes 'average<8'");
  }
  // C3: CTA averages over 8 dimensions (livedSymptomDepth excluded)
  {
    const scores: Record<CopyDimension, number> = {
      audienceSpecificity: 10, painDesireRelevance: 10, clarity: 10,
      scrollStoppingTension: 10, wordingSpecificity: 10, offerRelevance: 10,
      nonGenericLanguage: 10, readingLevel: 10, livedSymptomDepth: 1, // low
    };
    const evald = evaluateThreshold(scores, "ctaName");
    assert(evald.passed === true, "C3: CTA passes despite low livedSymptomDepth (not gated)");
    assert(evald.average === 10, `C3: CTA averages over 8 dimensions, not 9 (got ${evald.average})`);
    const evaldBenefit = evaluateThreshold(scores, "benefitText");
    assert(evaldBenefit.passed === true, "C3: benefitText passes despite low livedSymptomDepth (not gated)");
    assert(evaldBenefit.average === 10, "C3: benefitText also averages over 8 dimensions");
  }
  // C3: headline still gates on livedSymptomDepth
  {
    const scores = { ...allPassingScores(), livedSymptomDepth: 1 };
    const evald = evaluateThreshold(scores, "hookText");
    assert(evald.passed === false, "C3: hookText fails on livedSymptomDepth (gated)");
    assert(evald.failureReasons.includes("livedSymptomDepth<7"), "C3: failureReasons includes 'livedSymptomDepth<7'");
  }
  // C4: a CTA scoring 2 on livedSymptomDepth and ≥ threshold elsewhere passes
  {
    const scores: Record<CopyDimension, number> = {
      audienceSpecificity: 8, painDesireRelevance: 8, clarity: 8,
      scrollStoppingTension: 8, wordingSpecificity: 8, offerRelevance: 8,
      nonGenericLanguage: 8, readingLevel: 8, livedSymptomDepth: 2,
    };
    const evald = evaluateThreshold(scores, "ctaName");
    assert(evald.passed === true, "C4: CTA with livedSymptomDepth=2 passes (FR-003b, SC-014)");
  }

  // SC-014 — end-to-end: CTA fields with low livedSymptomDepth are
  // NOT sent to the rewrite payload.
  {
    let seenFailing: any[] = [];
    const block =
      "HOOK_START_A\nHOOK_TEXT: head\nCTA_BUTTON: click\nHOOK_END_A";
    await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async (payload) => ({
        fields: payload.fields.map((f) => ({
          variationId: f.variationId,
          fieldName: f.fieldName,
          scores: {
            audienceSpecificity: 9, painDesireRelevance: 9, clarity: 9,
            scrollStoppingTension: 9, wordingSpecificity: 9, offerRelevance: 9,
            nonGenericLanguage: 9, readingLevel: 8, livedSymptomDepth: 1, // low
          },
        })),
      }),
      rewrite: async (payload) => {
        seenFailing = payload.failing.slice();
        return { rewrites: [] };
      },
    }));
    const failedFieldNames = seenFailing.map((f) => f.fieldName);
    assert(!failedFieldNames.includes("ctaName"),
      `SC-014: CTA is not rewritten on livedSymptomDepth grounds (failed: ${JSON.stringify(failedFieldNames)})`);
  }

  // ═══════════════════════════════════════════════════════════
  // D — Rewriting
  // ═══════════════════════════════════════════════════════════

  console.log("  D: rewriting");

  // D1: one rewrite interaction handles multiple failing fields
  {
    let rewriteCalls = 0;
    let seenFields: any[] = [];
    let firstCallFields: any[] = [];
    const block =
      "HOOK_START_A\nHOOK_TEXT: vague\nSUBHEADLINE: vague\nHOOK_END_A";
    await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async (payload) => ({
        fields: payload.fields.map((f) => ({
          variationId: f.variationId,
          fieldName: f.fieldName,
          scores: f.fieldName === "hookText"
            ? { ...allPassingScores(), readingLevel: 1 }
            : { ...allPassingScores(), clarity: 1 },
        })),
      }),
      rewrite: async (payload) => {
        rewriteCalls++;
        if (rewriteCalls === 1) firstCallFields = payload.failing.slice();
        seenFields = payload.failing.slice();
        return {
          rewrites: payload.failing.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            candidate: `${f.value} BETTER`,
            claimFlags: [],
          })),
        };
      },
    }));
    // D1 contract: one rewrite per PASS. The candidates still fail on
    // re-score so a second pass runs (≤2 total — D4). Both passes see
    // both fields together — NOT one call per field.
    assert(firstCallFields.length === 2,
      `D1: first rewrite pass handles all failing fields together (got ${firstCallFields.length})`);
    assert(rewriteCalls <= 2, `D1+D4: ≤2 rewrite passes total (got ${rewriteCalls})`);
  }

  // D2: each rewritten field carries its own diagnosis
  {
    let seenDiagnoses: string[] = [];
    const block = "HOOK_START_A\nHOOK_TEXT: too clever\nHOOK_END_A";
    await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async (payload) => ({
        fields: payload.fields.map((f) => ({
          variationId: f.variationId,
          fieldName: f.fieldName,
          scores: f.fieldName === "hookText"
            ? { ...allPassingScores(), readingLevel: 1 }
            : allPassingScores(),
        })),
      }),
      rewrite: async (payload) => {
        seenDiagnoses = payload.failing.map((f) => f.diagnosis);
        return {
          rewrites: payload.failing.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            candidate: "improved",
            claimFlags: [],
          })),
        };
      },
    }));
    assert(seenDiagnoses.length >= 1, "D2: each failing field carries a diagnosis");
    assert(seenDiagnoses.every((d) => typeof d === "string" && d.length > 0),
      "D2: every diagnosis is a non-empty string");
  }

  // D3: passing fields are absent from the rewrite payload
  {
    let seenFailing: any[] = [];
    const block =
      "HOOK_START_A\nHOOK_TEXT: bad\nSUBHEADLINE: good\nHOOK_END_A";
    await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async (payload) => ({
        fields: payload.fields.map((f) => ({
          variationId: f.variationId,
          fieldName: f.fieldName,
          scores: f.fieldName === "hookText"
            ? { ...allPassingScores(), readingLevel: 1 }
            : allPassingScores(),
        })),
      }),
      rewrite: async (payload) => {
        seenFailing = payload.failing.slice();
        return {
          rewrites: payload.failing.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            candidate: "improved",
            claimFlags: [],
          })),
        };
      },
    }));
    assert(seenFailing.length === 1, "D3: only failing fields appear in rewrite payload");
    assert(seenFailing[0].fieldName === "hookText", "D3: the failing field is hookText");
  }

  // D4: max 2 rewrite passes
  {
    let rewriteCalls = 0;
    let scoreCalls = 0;
    const block = "HOOK_START_A\nHOOK_TEXT: still bad\nHOOK_END_A";
    await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async (payload) => {
        scoreCalls++;
        return {
          fields: payload.fields.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            // Always fail → triggers rewrite forever (until the cap).
            scores: { ...allPassingScores(), readingLevel: 1 },
          })),
        };
      },
      rewrite: async (payload) => {
        rewriteCalls++;
        return {
          rewrites: payload.failing.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            candidate: "still bad", // Score it again as failing
            claimFlags: [],
          })),
        };
      },
    }));
    assert(rewriteCalls <= 2, `D4: max 2 rewrite passes (got ${rewriteCalls})`);
  }

  // D5: a rewrite scoring lower than the original is discarded (scored_lower)
  {
    let rewriteCalls = 0;
    const block = "HOOK_START_A\nHOOK_TEXT: original\nHOOK_END_A";
    const r = await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async (payload) => {
        // First call: hookText scores below threshold on readingLevel
        // AND low on most others. Subsequent calls (re-score) also
        // return LOWER scores for the candidate than the original had.
        if (rewriteCalls === 0) {
          return {
            fields: payload.fields.map((f) => ({
              variationId: f.variationId,
              fieldName: f.fieldName,
              scores: {
                audienceSpecificity: 6, painDesireRelevance: 6, clarity: 6,
                scrollStoppingTension: 6, wordingSpecificity: 6, offerRelevance: 6,
                nonGenericLanguage: 6, readingLevel: 1, livedSymptomDepth: 6,
              },
            })),
          };
        }
        // Re-score: candidate also fails — LOWER scores than the original
        return {
          fields: payload.fields.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            scores: {
              audienceSpecificity: 5, painDesireRelevance: 5, clarity: 5,
              scrollStoppingTension: 5, wordingSpecificity: 5, offerRelevance: 5,
              nonGenericLanguage: 5, readingLevel: 1, livedSymptomDepth: 5,
            },
          })),
        };
      },
      rewrite: async (payload) => {
        rewriteCalls++;
        return {
          rewrites: payload.failing.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            candidate: "much worse rewrite",
            claimFlags: [],
          })),
        };
      },
    }));
    // The rewrite scores lower than the original → discarded; original
    // block survives. The decision MUST be recorded (D5 contract), so
    // assert unconditionally rather than guarding on length.
    assert(r.block === block, "D5: lower-scoring rewrite → block is the original");
    const hookRewrites = r.trace.rewrites.filter((x) => x.fieldName === "hookText");
    assert(hookRewrites.length > 0, "D5: a rewrite decision is recorded for hookText");
    assert(hookRewrites.some((x) => x.rejectReason === "scored_lower" || x.rejectReason === "below_threshold"),
      `D5: lower-scoring rewrite is rejected (got rejectReasons: ${JSON.stringify(hookRewrites.map((x) => x.rejectReason))})`);
  }

  // D9: rewrite candidate failing a length cap is rejected
  {
    const original = "Short";
    const validation = validateRewriteCandidate("a".repeat(500), "en", original);
    assert(!validation.ok, "D9: oversized rewrite candidate rejected");
    assert(validation.rejectReason === "length_cap", `D9: rejectReason is 'length_cap' (got '${validation.rejectReason}')`);
  }
  {
    const validation = validateRewriteCandidate("", "en", "original");
    assert(!validation.ok, "D9: empty rewrite candidate rejected");
  }

  // ═══════════════════════════════════════════════════════════
  // E — Block integrity
  // ═══════════════════════════════════════════════════════════

  console.log("  E: block integrity");
  // E1: markers preserved through substitution
  {
    const original = "HOOK_START_A\nHOOK_TEXT: Original\nHOOK_END_A";
    const sub = substituteFieldsInBlock(original, [
      { variationId: "A", fieldName: "hookText", value: "New" },
    ], []);
    assert(sub.ok, "E1: substitution preserves markers");
    assert(sub.newBlock.includes("HOOK_START_A"), "E1: HOOK_START_A preserved");
    assert(sub.newBlock.includes("HOOK_END_A"), "E1: HOOK_END_A preserved");
    assert(sub.newBlock.includes("HOOK_TEXT: New"), "E1: new value injected");
  }
  // E1: $ in a value must be written literally (no `$$` doubling). The
  // function replacer of String.prototype.replace does NOT treat `$`
  // specially, so escaping is unnecessary AND a no-op escape (like
  // `$$$$`) would double the character — caught by this test.
  {
    const original = "HOOK_START_A\nHOOK_TEXT: Original\nHOOK_END_A";
    const sub = substituteFieldsInBlock(original, [
      { variationId: "A", fieldName: "hookText", value: "Save $99 today" },
    ], []);
    assert(sub.newBlock.includes("HOOK_TEXT: Save $99 today"),
      `E1: '$' in a value is written literally (got: ${JSON.stringify(sub.newBlock)})`);
    assert(!sub.newBlock.includes("$$"),
      `E1: no '$$' doubling from string-form-replace escaping (got: ${JSON.stringify(sub.newBlock)})`);
  }

  // E3: dropped variation → blockStructurePreserved detects it
  {
    const original = "HOOK_START_A\nHOOK_TEXT: A\nHOOK_END_A\n\nHOOK_START_B\nHOOK_TEXT: B\nHOOK_END_B";
    const rewritten = "HOOK_START_A\nHOOK_TEXT: A\nHOOK_END_A";
    assert(!blockStructurePreserved(original, rewritten), "E3: dropped variation → not preserved");
  }
  {
    const original = "HOOK_START_A\nHOOK_TEXT: A\nCTA_BUTTON: X\nHOOK_END_A";
    const same = "HOOK_START_A\nHOOK_TEXT: A\nCTA_BUTTON: X\nHOOK_END_A";
    assert(blockStructurePreserved(original, same), "E3: identical blocks → preserved");
  }

  // E4: untouchable mutation → substitution fails
  {
    const original = "HOOK_START_A\nHOOK_TEXT: Original\nHOOK_END_A — UNTOUCHABLE_LITERAL";
    const sub = substituteFieldsInBlock(original, [
      { variationId: "A", fieldName: "hookText", value: "New" },
    ], ["UNTOUCHABLE_LITERAL"]);
    assert(sub.ok, "E4: substitution preserves untouchable literal");
  }
  {
    const original = "HOOK_START_A\nHOOK_TEXT: Original";
    const sub = substituteFieldsInBlock(original, [
      { variationId: "A", fieldName: "hookText", value: "New" },
    ], ["NEVER_APPEARED_IN_BLOCK"]);
    assert(!sub.ok, "E4: missing untouchable → ok:false");
    assert(sub.newBlock === original, "E4: ok:false returns the original block");
  }

  // ═══════════════════════════════════════════════════════════
  // F — Budgets and ceilings
  // ═══════════════════════════════════════════════════════════

  console.log("  F: budgets");
  {
    let scoreCalls = 0;
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => {
        scoreCalls++;
        return { fields: [{
          variationId: "A",
          fieldName: "hookText",
          scores: allPassingScores(),
        }] };
      },
    }));
    assert(scoreCalls === 1, `F1: a passing field makes exactly 1 scoring call (got ${scoreCalls})`);
    assert(r.trace.interactionCount === 1, "F1: trace.interactionCount === 1 when scoring succeeded");
  }

  // F1: ceiling holds even with many failing fields
  {
    let scoreCalls = 0;
    let rewriteCalls = 0;
    const block =
      "HOOK_START_A\nHOOK_TEXT: bad1\nSUBHEADLINE: bad2\nCTA_BUTTON: bad3\nHOOK_END_A";
    const r = await gateCopySet(makeInput({ rawBlock: block }), makeDeps({
      score: async () => {
        scoreCalls++;
        return {
          fields: [{
            variationId: "A",
            fieldName: "hookText",
            scores: { ...allPassingScores(), readingLevel: 1 },
          }, {
            variationId: "A",
            fieldName: "subheadText",
            scores: { ...allPassingScores(), readingLevel: 1 },
          }, {
            variationId: "A",
            fieldName: "ctaName",
            scores: { ...allPassingScores(), readingLevel: 1 },
          }],
        };
      },
      rewrite: async (payload) => {
        rewriteCalls++;
        return {
          rewrites: payload.failing.map((f) => ({
            variationId: f.variationId,
            fieldName: f.fieldName,
            candidate: `${f.value} BETTER`,
            claimFlags: [],
          })),
        };
      },
    }));
    // 1 initial score + 1 rewrite + (1 re-score per pass) = ≤5 interactions
    assert(r.trace.interactionCount <= 5, `F1: ≤5 interactions per copy set (got ${r.trace.interactionCount})`);
    assert(rewriteCalls <= 2, `F4: ≤2 rewrite passes (got ${rewriteCalls})`);
  }

  // F4: timeout when now() advances past the interaction budget
  {
    let now = 0;
    const clockedNow = () => now;
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => {
        // Simulate a slow response: jump the clock past 8s before returning
        now += 9_000;
        return { fields: [{
          variationId: "A",
          fieldName: "hookText",
          scores: allPassingScores(),
        }] };
      },
      now: clockedNow,
    }));
    // The interaction was attempted but the post-check fired fail-open;
    // no fields scored, no rewrites attempted.
    assert(r.trace.fields.length === 0, "F4: interaction timeout → fields empty");
    assert(r.trace.rewrites.length === 0, "F4: interaction timeout → rewrites empty");
  }

  // F4: timeout when now() advances past the copy-set budget
  {
    let now = 0;
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => {
        now += 21_000;
        return { fields: [{
          variationId: "A",
          fieldName: "hookText",
          scores: allPassingScores(),
        }] };
      },
      now: () => now,
    }));
    assert(r.trace.fields.length === 0, "F4: copy-set timeout → fields empty");
  }

  // F4 / F5: run-budget elapses mid-run → fail open for this step,
  // original block preserved, no fields scored.
  {
    const r = await gateCopySet(
      makeInput(),
      makeDeps({ now: () => 100_000 }), // 100s elapsed since run start
    );
    assert(r.trace.fields.length === 0, "F4/F5: run-budget elapsed → no fields scored");
    assert(r.trace.rewrites.length === 0, "F4/F5: run-budget elapsed → no rewrites");
  }

  // F6: gate does not consume the callable's own timeout headroom.
  // The run-budget check is the only gate-side timeout the callable cares
  // about — and it's strictly less than the callable's 120s timeout.
  {
    const { GATE_RUN_TIMEOUT_MS } = await import("../copyScoringGate.js");
    assert(GATE_RUN_TIMEOUT_MS === 60_000, "F6: run budget is 60s (under the 120s callable timeout)");
  }

  // ═══════════════════════════════════════════════════════════
  // H — Silence (no UI change; gate outputs are opaque)
  // ═══════════════════════════════════════════════════════════

  console.log("  H: silence");
  {
    const logLine = formatGateLogLine("hook", { ran: true, steps: [{
      step: "hook",
      fields: [{ variationId: "A", fieldName: "hookText", scores: {}, average: 9, passed: true }],
      rewrites: [],
      passCount: 0,
      gaveUp: false,
      interactionCount: 1,
    }] });
    // The log line must be a structured JSON string (one line, queryable).
    assert(typeof logLine === "string", "H: formatGateLogLine returns a string");
    assert(logLine.length > 0, "H: log line is non-empty");
    assert(logLine.startsWith("{") && logLine.endsWith("}"), "H: log line is a single-line JSON object");
  }
  {
    const logLine = formatGateLogLine("hook", { ran: false, skipReason: "no_credential" });
    assert(logLine.includes("no_credential"), "H: skip reason appears in the log line");
  }

  // ═══════════════════════════════════════════════════════════
  // I — Trace transport (additive, no fields removed)
  // ═══════════════════════════════════════════════════════════

  console.log("  I: trace shape (additive)");
  {
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => ({ fields: [{
        variationId: "A",
        fieldName: "hookText",
        scores: allPassingScores(),
      }] }),
    }));
    // The step trace object contains the canonical fields, no more, no less.
    assert(typeof r.trace.step === "string", "I: trace has 'step'");
    assert(Array.isArray(r.trace.fields), "I: trace has 'fields' array");
    assert(Array.isArray(r.trace.rewrites), "I: trace has 'rewrites' array");
    assert([0, 1, 2].includes(r.trace.passCount), "I: trace.passCount is 0/1/2");
    assert(typeof r.trace.gaveUp === "boolean", "I: trace.gaveUp is boolean");
    assert(typeof r.trace.interactionCount === "number", "I: trace.interactionCount is number");
  }

  // I4: additive — a malformed payload does not break a future merge.
  // (The merge is in generateFinalAd; here we just confirm the per-step
  // trace shape is self-contained and does not depend on external state.)
  {
    const r = await gateCopySet(makeInput(), makeDeps({
      score: async () => ({ fields: [] }),
    }));
    const serialized = JSON.stringify(r);
    const parsed = JSON.parse(serialized);
    assert(parsed.trace.step === "hook", "I4: serialized trace round-trips");
    assert(Array.isArray(parsed.trace.fields), "I4: fields array survives serialization");
  }

  // ═══════════════════════════════════════════════════════════
  // FR-019c — kill switch (modelConfig.COPY_SCORING_ENABLED)
  // ═══════════════════════════════════════════════════════════

  console.log("  FR-019c: kill switch reads from modelConfig");
  {
    const { COPY_SCORING_ENABLED } = await import("../modelConfig.js");
    assert(typeof COPY_SCORING_ENABLED === "boolean", "FR-019c: COPY_SCORING_ENABLED is boolean");
    // When true (default), gate is active; this is a sanity check on the
    // type — behavior is exercised in the integration smoke matrix.
  }

  // ═══════════════════════════════════════════════════════════
  // SC-011 — compliance regression: gate-produced Arabic runs through
  // scanAndReplace (FR-012a). The existing substitution tables
  // (HARAM_MOTIFS / TRIGGER_WORDS) still fire on rewrite candidates
  // before the gate accepts them.
  // ═══════════════════════════════════════════════════════════

  console.log("  SC-011: cultural substitution still fires on gate output");
  {
    // Use an English input containing a known TRIGGER_WORDS entry
    // ("wine") and assert the cleaned output differs from the
    // original — this proves the substitution actually fires (not
    // just returns a string). Also exercise applyCulturalSubstitution
    // directly so the gate-side function under test is verified.
    const { scanAndReplace, isArabic, TRIGGER_WORDS } = await import("../culturalCompliance.js");
    assert(isArabic("ar") === true, "SC-011: isArabic('ar') is true");
    assert(TRIGGER_WORDS.length > 0, "SC-011: TRIGGER_WORDS is populated");
    const englishWithTrigger = `Wine tasting with premium cheeses`;
    const r = scanAndReplace(englishWithTrigger, "adCopy");
    // scanAndReplace substitutes regardless of language. The
    // language gate is enforced by the CALLER (applyCulturalSubstitution
    // short-circuits on `language !== "ar"`). Verify the substitution
    // itself fires end-to-end.
    assert(r.cleaned !== englishWithTrigger,
      `SC-011: trigger-word substitution fires (cleaned=${JSON.stringify(r.cleaned)})`);
    assert(r.matched.length > 0, `SC-011: matched list populated (matched=${JSON.stringify(r.matched)})`);
    // Exercise the gate-side wrapper directly.
    const { applyCulturalSubstitution } = await import("../copyScoringGate.js");
    assert(applyCulturalSubstitution("passthrough", "en") === "passthrough",
      "SC-011: applyCulturalSubstitution('en') passes through");
    assert(typeof applyCulturalSubstitution("أي نص", "ar") === "string",
      "SC-011: applyCulturalSubstitution('ar') returns a string");
  }

  // ═══════════════════════════════════════════════════════════
  // parseBlockIntoFields
  // ═══════════════════════════════════════════════════════════

  console.log("  parseBlockIntoFields");
  {
    const fields = parseBlockIntoFields(
      "HOOK_START_A\nHOOK_TEXT: Hi\nSUBHEADLINE: Sub\nCTA_BUTTON: Btn\nHOOK_END_A\n" +
      "HOOK_START_B\nHOOK_TEXT: Hi2\nHOOK_END_B"
    );
    assert(fields.length === 4, `parseBlockIntoFields: 4 fields across 2 variations (got ${fields.length})`);
    assert(fields.some((f) => f.fieldName === "hookText" && f.variationId === "A"), "parseBlockIntoFields: A.hookText present");
    assert(fields.some((f) => f.fieldName === "ctaName" && f.variationId === "A"), "parseBlockIntoFields: A.ctaName present");
  }
  {
    const slides = parseBlockIntoFieldsForSlides(
      "HOOK_START_A\nHOOK_TEXT: Slide A\nHOOK_END_A\n\nHOOK_START_B\nHOOK_TEXT: Slide B\nHOOK_END_B"
    );
    assert(slides.size === 2, `parseBlockIntoFieldsForSlides: 2 slides extracted (got ${slides.size})`);
    assert(slides.get("A") === "Slide A", "parseBlockIntoFieldsForSlides: var A extracted");
    assert(slides.get("B") === "Slide B", "parseBlockIntoFieldsForSlides: var B extracted");
  }

  // ═══════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════

  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test runner threw:", e);
  process.exit(1);
});