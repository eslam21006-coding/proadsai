# Quickstart: Verify Phase 22 — Copy Quality Upgrade

Reproducible verification for the copy-quality change. Provides the Principle-IX before/after evidence.

## Prerequisites

- Branch `958-copy-quality` checked out.
- `cd functions && npm install` (already present in repo).

## 1. Build + run the test suite

```bash
cd functions
npm run build
npm test            # includes the new copyQuality.test.js in the chain
```

**Expect:** all existing tests still pass, plus `copyQuality.test` passes:
- six constants exported & non-empty; `BANNED_CTA_LIST` = the five phrases;
- drift header present;
- rendered `SYSTEM_TOV` contains all four Track-1 rule signals;
- each of the four prompt surfaces contains the three block markers;
- `CLAIM_FLAG` parsing strips the marker from the four fields and returns structured flags;
- a no-flag response yields unchanged fields and empty `claimFlags`.

## 2. Static checks (manual, fast)

```bash
# drift header present
head -n 6 functions/src/copywriting_knowledge.ts

# six constants exist
grep -nE "export const (READING_LEVEL_BLOCK|LIVED_SYMPTOM_BLOCK|FABRICATION_POLICY_BLOCK|BANNED_CTA_LIST|COPY_SCORING_DIMENSIONS|COPY_REWRITE_DIAGNOSES)" functions/src/copywriting_knowledge.ts

# Section-18 instruction reached SYSTEM_TOV
grep -ni "6th-grade\|banned\|claim" functions/src/promptConstants.ts

# the two future constants are NOT imported anywhere (defined-but-unwired)
grep -rn "COPY_SCORING_DIMENSIONS\|COPY_REWRITE_DIAGNOSES" functions/src --include=*.ts | grep -v copywriting_knowledge.ts
#   → expect NO matches (only the definition site)

# trace field added
grep -n "claimFlags\|ClaimFlagEntry" functions/src/types.ts
```

## 3. Behavioral spot-check (optional, live generation)

Generate one English and one Arabic ad (single + carousel) via the normal flow and confirm:

| Check | Pass condition |
|---|---|
| Reading level (SC-001) | copy uses short everyday words / short sentences; Arabic = simple spoken فصحى |
| Lived symptom (SC-002) | the problem names a concrete recognizable moment, not an abstract category |
| Banned CTA (SC-003) | no generated CTA wording uses the five banned phrases; user's literal CTA preserved |
| Fabrication flag (SC-004) | if a fabricated specific appears, `resolutionTrace.claimFlags` records it; copy not deleted |
| No-leak / gate (SC-006) | four copy fields render identically through the fidelity gate; no `CLAIM_FLAG` text on the image; field count unchanged |

Inspect the resulting `generations/{genId}.resolutionTrace.claimFlags` in Firestore to confirm structured capture.

## 4. Regression guard

Confirm the hard compliance guards still fire (FR-004a):
- Provide inputs with no real stats and verify `hookAnglesKnowledge` honest-degradation behavior is unchanged.
- Provide a price-claim mismatch and verify `captionValidator` NUMERIC FACT VIOLATION repair still triggers.

## Rollback

Fully reversible: revert the constant additions, the four prompt-surface injections, the SYSTEM_TOV append, the `types.ts` field, and the parser strip. No data migration to undo (the trace field is additive/optional).
