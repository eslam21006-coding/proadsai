# Contract: Copy Parser & Fidelity (T20 — backend)

**Surface:** `functions/src/generators.ts` (`resolveOwnedRenderText` 566–623, `extractCopyFieldsFromResponse` 672–680, retry loop 4560–4615, dedup 5388–5427), `functions/src/buildPlanSlotMap.ts` (`validateCopyFidelity` 696–740).
**Consumers:** build-plan retry loop, `buildFinalImagePrompt`, dedup/QA, `resolutionTrace`.
**Paranoid checkpoint:** YES — this is the hardest invariant in the phase.

## Required behavior (pass/fail rows)

| # | Given (model output / state) | Then (parser/fidelity result) | FR / SC |
|---|---|---|---|
| P1 | Output has all four fields, all readable | 4× `present`; 4 non-null values; identical to today's behavior | FR-015, SC-008 |
| P2 | Output has `HOOK_TEXT` only (no subhead/CTA/benefit markers) | `hookText` present; `subheadText`/`ctaName`/`benefitText` = `{ value: null, status: absent }` | FR-006, SC-003 |
| P3 | An optional field's marker is present but its block is unreadable/malformed | retry within `MAX_COPY_FIDELITY_ATTEMPTS`; if still bad → log a warning AND set `{ value: null, status: parse_failure }`; ad still ships | FR-008, SC-010 |
| P4 | Any optional field absent (`null`) | `validateCopyFidelity` returns `passed: true` for that field (it is skipped, not failed); no fidelity retry triggered solely by the absence | FR-009, SC-005 |
| P5 | A dedup-rule blanks an optional field (duplicate of another) | field becomes `{ value: null, status: absent }` (NOT `""`); treated as intentionally absent everywhere | FR-010, SC-011 |
| P6 | An optional field's parsed value is whitespace-only | normalized to `{ value: null, status: absent }` | FR-014 |
| P7 | `hookText` is empty/unreadable | NEVER `absent`; `validateCopyFidelity` hard-fails on empty `hookText`; variation is retried; never shipped hookless | FR-002, US2 AC5 |
| P8 | Any field is `present` | Phase 22 quality rules + `claimFlag` extraction still run and attach on that field | FR-011, US2 AC6 |
| P9 | Output mixes a legit-absent field and a malformed field | the absent field → `absent`; the malformed field → `parse_failure`; zero cross-contamination | SC-004, FR-007 |

## Invariants (must hold for every parse)

- **INV-1**: No optional field is ever `""` or a placeholder at rest. `absent`/`parse_failure` ⇒ value `null`. (FR-006)
- **INV-2**: `present` ⇒ non-null, non-empty, non-whitespace value.
- **INV-3**: `parse_failure` is assigned only after the retry cap, and only after a log line is emitted. (FR-008, SC-010)
- **INV-4**: `hookText.status ∈ { present, parse_failure }`. (FR-002)
- **INV-5**: A `parse_failure` is never silently relabeled `absent` — it is recorded as `parse_failure` in the trace even though its value is `null`. (FR-007/FR-008, D6)

## Trace obligation (Constitution VI/VII, D6)

Every generation records `resolutionTrace.copyFieldStatus` with the four final statuses, plus `degradedToAbsent[]` (parse_failure fields) and `dedupBlanked[]` (dedup-nulled fields). Additive; no migration.

## Out of scope (must NOT change)

- `textCompositing.ts`, `captionValidator.ts`, `culturalCompliance.ts` (OOS-005).
- Carousel `SHOW_CTA` middle-slide blanking rules (OOS scope; carousel rendering unchanged).
- Telling the model when to omit a field (FR-017) — the prompts are NOT modified to request omission.
- Phase 23 dedup *rules* (only the blanked value `""`→`null` and its status change; the rules themselves are untouched). (OOS-004)

## Test obligations (FR-016, SC-009)

New `functions/src/__tests__/conditionalCopyFields.test.ts` MUST cover rows P2–P9 with explicit assertions that `absent` and `parse_failure` are distinct and that no value is ever `""`. Extend `copyQuality.test.ts` for parser-level cases. `cd functions && npm test` green; `cd functions && npm run build` clean (type-widening guards complete).
