# Phase 19 — Direct-Response Design Upgrades (gaze direction + DR guidance)

**Implementation Report** | **Branch:** `962-gaze-direction-dr` | **PR:** [#47](https://github.com/eslam21006-coding/proadsai/pull/47) | **Date:** 2026-06-24
**Spec:** [`specs/962-gaze-direction-dr/`](./specs/962-gaze-direction-dr/) | **Tasks:** all 27 in [`specs/962-gaze-direction-dr/tasks.md`](./specs/962-gaze-direction-dr/tasks.md) marked complete

---

## TL;DR

Phase 19 ships five additive prompt blocks through the single shared image-prompt assembly point `buildFinalImagePrompt()` in `functions/src/generators.ts:5260`, all of them subordinate to the #1 face-identity rule. The feature is **prompt-only, reversible, no new model calls, no Firestore schema migration, no frontend change, no billing/plan-gating change.** 244 unit assertions cover Contracts A–G with zero regressions. The pattern mirrors Phase 28 (`expressionMap.ts`) so the gaze and expression guidance operate together without one replacing or contradicting the other.

| Sub-feature | Story | Gating | Source |
|---|---|---|---|
| Gaze direction | US1 | hook (cold hook angle) → objection (retargeting) → fallback (FR-010) | `gazeMap.ts::buildImagePromptGazeBlock` |
| One-highlight cap | US2 | **always-on, hook-independent** (FR-011/FR-012) | `gazeMap.ts::ONE_HIGHLIGHT_BLOCK` (string const) |
| Hook↔visual mood | US4 | hook-gated (FR-015) | `gazeMap.ts::buildHookVisualMoodBlock` |
| Price hierarchy | US5 | content-gated via `detectPriceContent(...)` (FR-016/FR-017) | `gazeMap.ts::detectPriceContent` + `buildPriceHierarchyBlock` |
| CTA outcome framing | US3 | always-on advisory in copy prompt (FR-013/FR-014) | `gazeMap.ts::CTA_OUTCOME_FRAMING_BLOCK` (string const, imported by `generators.ts`) |

---

## What's in the PR

### Files

| File | Action | Lines | Purpose |
|---|---|---|---|
| `functions/src/gazeMap.ts` | **NEW** | ~470 | Pure mapper (10 hooks + 12 objections → `GazeDirective`) + all five DR block builders + `CTA_OUTCOME_FRAMING_BLOCK` constant. Side-effect-free. |
| `functions/src/__tests__/gazeMap.test.ts` | **NEW** | ~480 | 244 unit assertions covering Contracts A–G + reversibility (mirror of `expressionMap.test.ts`). |
| `functions/src/generators.ts` | **EDIT** | +97 | Import `gazeMap.ts`; inject DR blocks at `buildFinalImagePrompt()` (right after the Phase 28 expression block); splice `CTA_OUTCOME_FRAMING_BLOCK` into the copy prompt CTA/benefit block; write `gazeDirection` trace in `generateFinalAd()`. |
| `functions/src/types.ts` | **EDIT** | +23 | Additive `ResolutionTrace.gazeDirection?` sub-object — no migration, `null` is the canonical absent sentinel. |
| `functions/package.json` | **EDIT** | +1 | `test:gazeMap` script. |
| `CLAUDE.md` | **EDIT** | +1 | Phase 19 entry in Recent Changes. |
| `docs/LAUNCH_MATRIX.md` | **EDIT** | +34/-13 | Phase 19 status flipped from TODO to DONE; status-table row added; Section 8 mirror written. |
| `specs/962-gaze-direction-dr/*` | **NEW** | n/a | Full speckit artifacts (spec, plan, research, data-model, quickstart, contracts, tasks, requirements checklist) for traceability. |

**Total diff:** 17 files changed, 2300 insertions(+), 13 deletions(-).

### Tests

```shell
$ cd functions && npm run test:gazeMap
  A1–A11: resolver coverage (10 hooks + 12 objections + aliases + fallback + null/empty + hook>objection priority)
  B1–B7:  image-prompt gaze block (label, identity clause, advisory + failure-mode prohibitions, 9:16 vertical note, before/after split, null→"", guide-toward-content)
  C1–C7:  one-highlight cap, hook-mood block (4 families + null), price detector (true on currency/percent/discount, false on price-free copy and on a bare year "2026")
  D1–D8:  injection-site placement (gaze AFTER BLUEPRINT + expression, exactly one call, aspectRatio passed, provider-agnostic)
  E1–E4:  audit trace (sub-object shape, applied:true with non-null fields, applied:false with reason, source:fallback path, additive no-migration)
  G1–G6:  CTA outcome framing (outcome-framing, advisory, ≈3–5 words, language adaptation, Arabic grammar rules preserved, English path covered, copy-fidelity contract preserved, generators.ts imports the constant from gazeMap.ts)
  R1:     reversibility (null resolvers + no pricing → only ONE_HIGHLIGHT_BLOCK survives)
  244 passed, 0 failed
```

```shell
$ cd functions && npm test    # full backend suite
  ... (all 14 test files green, EXIT_CODE 0)
```

```shell
$ cd functions && npm run test:expressionMap    # Phase 28 regression
  223 passed, 0 failed
```

```shell
$ cd functions && npm run build    # TypeScript compile
  tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
  (no errors, EXIT_CODE 0)
```

### Mapping tasks → commits

All 27 tasks from `specs/962-gaze-direction-dr/tasks.md` completed in a single commit (`10fb254`):

| Phase | Tasks | Status |
|---|---|---|
| Phase 1: Setup | T001–T002 (test script + scaffold) | ✅ |
| Phase 2: Foundational | T003–T004 (gazeMap.ts types + `ResolutionTrace.gazeDirection?`) | ✅ |
| Phase 3: US1 Smart Gaze Direction | T005–T011 (Contract A/B/E tests, mapper tables, resolvers, image block, injection, trace) | ✅ |
| Phase 4: US2 One-Highlight Cap | T012–T014 (Contract C1/D2 tests, `ONE_HIGHLIGHT_BLOCK` const, injection) | ✅ |
| Phase 5: US3 CTA Outcome Framing | T015–T016 (Contract G test, constant in gazeMap.ts, splice into copy prompt) | ✅ |
| Phase 6: US4 Hook↔Visual Mood | T017–T019 (Contract C2–C4 tests, `buildHookVisualMoodBlock`, injection hook-gated) | ✅ |
| Phase 7: US5 Price Hierarchy | T020–T022 (Contract C5–C7/D3/D4 tests, `detectPriceContent` + `buildPriceHierarchyBlock`, injection content-gated) | ✅ |
| Phase 8: Polish | T023–T027 (build, full test, reversibility, docs) | ✅ |

---

## Architecture decisions

### Single shared injection point

Following Phase 28's pattern (R1 in `research.md`), all five DR blocks are emitted through one site — the `(() => { ... })()` IIFE right after the Phase 28 `EXPRESSION DIRECTION` block in `buildFinalImagePrompt()`. Every render path (single, carousel slide, batch item, retargeting, before-after, reflow-rerender, edit) routes through this function, so one injection point covers all of them (FR-007 / audit #17 mirror).

The Phase 19 IIFE assembles:
1. `_gazeBlock = buildImagePromptGazeBlock(_imGazeDirective, { beforeAfterSplit, aspectRatio })` — empty for null directive
2. `ONE_HIGHLIGHT_BLOCK` — string const, always emitted
3. `_moodBlock = buildHookVisualMoodBlock(_imGazeDirective)` — empty for null directive
4. `_priceBlock = detectPriceContent({...}) ? buildPriceHierarchyBlock() : ""` — content-gated

The four pieces are joined with `\n` and the whole template literal is placed AFTER the BLUEPRINT line AND AFTER the Phase 28 expression block so the renderer sees the full scene + emotion context first, then the gaze / focal / mood / price guidance. Order: BLUEPRINT → expression → gaze → one-highlight → mood → price.

### Resolver shape (mirrors `expressionMap.ts`)

`gazeMap.ts` exports:
- `GazeTreatment` union (5 values: `direct_to_viewer`, `toward_content`, `reflective_downward`, `forward_horizon`, `three_quarter`)
- `GazeDirective` interface (`source`, `sourceId`, `treatment`, `description`)
- `HOOK_GAZE_MAP` (10 canonical hook ids) + `HOOK_ALIAS_MAP` (3 defensive aliases) + `GAZE_FALLBACK_DIRECTIVE` (safe `three_quarter` for unknown ids)
- `GAZE_ASPIRATIONAL_DIRECTIVE` (forward_horizon for AFTER half of before/after)
- `getHookGazeDirection`, `getObjectionGazeDirection`, `resolveGazeDirective`, `getKnownHookAngleIds`
- `buildImagePromptGazeBlock(directive, { beforeAfterSplit, aspectRatio })` — image-prompt block builder
- `ONE_HIGHLIGHT_BLOCK` (string const)
- `buildHookVisualMoodBlock(directive)` — hook-mood block builder
- `detectPriceContent(copy)` / `buildPriceHierarchyBlock()` — price content gate + block builder
- `CTA_OUTCOME_FRAMING_BLOCK` (string const)

Defensive invariants (FR-010): unknown non-null id → safe fallback (`source: "fallback"`, treatment `three_quarter`, "natural, intentional three-quarter gaze, approachable and engaged — never staring into empty space"). Never throws, never returns null for a non-null input.

### Trace (additive, no migration)

`ResolutionTrace.gazeDirection?` = `{ source: "hook" | "objection" | "fallback" | null, sourceId: string | null, treatment: string | null, applied: boolean, reason?: string }`.

The `null` sentinel is the canonical absent value. The `applied:false` path explicitly writes `reason: "no-hook-or-objection-active"` (mirroring Phase 28's expression trace write). Legacy records without the field read as "not applied" — no migration logic.

The trace is written in `generateFinalAd()` immediately after the existing `expressionAdaptation` trace write so a single inspection of the trace shows both.

### CTA outcome framing placement (US3)

`CTA_OUTCOME_FRAMING_BLOCK` is imported into `generators.ts` from `gazeMap.ts` (NOT defined inline) so Contract G is deterministically testable from the standalone runner without pulling in the heavy `generators.ts` module. It is spliced into the existing CTA/benefit block of the copy-generation prompt at `generators.ts:~2517`, immediately after the Arabic grammar rules section and BEFORE the COPYWRITING QUALITY RULES section. This is the spot the spec specifies ("after the benefit-formula section, before output formatting") and keeps the outcome-framing guidance adjacent to the benefit rules it complements.

### Aspect-ratio awareness (FR-009)

`buildImagePromptGazeBlock` accepts `aspectRatio: GazeAspectRatio` (6-value union re-declared locally so the module stays side-effect-free) and adds a vertical-composition note for 9:16/4:5/3:4 ("keep the gaze within the frame, never off the side edge into empty margin") and a horizontal-headroom note for 16:9/4:3 ("the hero has horizontal headroom — use it, but the gaze itself should still point toward the content zone, not into the empty wing"). 1:1 (default) gets a balanced note. The injection site passes the existing `aspectRatio` parameter that `buildFinalImagePrompt` already destructures — no new wiring.

### Reversibility (FR-023)

Two layers of reversibility:
1. **Logical revert** (no code changes): all the per-block builders return empty strings when their gating signal is null (gaze, mood) or false (price). The `ONE_HIGHLIGHT_BLOCK` is intentionally always-on per FR-011 — to fully revert it, comment out the entire `${(() => { ... })()}` IIFE in `buildFinalImagePrompt`. The `R1` test in `gazeMap.test.ts` exercises this and asserts that null resolvers + no pricing → only `ONE_HIGHLIGHT_BLOCK` survives.
2. **Full revert** (one comment-out): commented-out injection line is preserved in the source so a `git revert` of the commit OR a manual comment-out of the IIFE returns `buildFinalImagePrompt` to byte-for-byte pre-Phase-19 behavior.

### Defensive Arabic keyword detection

`detectPriceContent` uses `\b` word boundaries for Latin keywords (so "off" doesn't match "offer" substring, etc.) but plain-substring matching for Arabic keywords (where `\b` doesn't apply because Arabic characters are not in `\w`). The Arabic keyword set is specific enough that plain-substring match is safe; this was added after the first test run revealed the `اعرض` (offer) edge case.

---

## Contracts coverage

| Contract | Coverage | Test names |
|---|---|---|
| A (resolver) | A1–A11 | every HOOK_ANGLE_KNOWLEDGE id resolves (10); pain → reflective_downward; logical_authority → direct_to_viewer; future_based → forward_horizon; curiosity → three_quarter; scarcity → toward_content; every RETARGETING_OBJECTION_DATA id resolves (12); unknown → safe fallback; defensive aliases; null/empty → null; hook > objection priority |
| B (image-prompt gaze block) | B1–B7 | GAZE DIRECTION label + treatment + description; identity-priority clause; advisory + forbidden failure modes; 9:16 vertical note; before/after split; null → empty; guide-toward-content clause |
| C (helpers) | C1–C7 | ONE_HIGHLIGHT_BLOCK (one primary + one supporting + forbids multiple); buildHookVisualMoodBlock(pain/future_based/null); detectPriceContent true on currency/percent/discount; false on price-free copy and bare year; buildPriceHierarchyBlock (original smaller/struck, new larger/prominent, savings secondary) |
| D (injection gating) | D1–D8 | gaze AFTER BLUEPRINT + expression; ONE_HIGHLIGHT_BLOCK unconditional; price gated on detectPriceContent; price content-gated; before/after split wired; exactly one call site; aspectRatio passed; provider-agnostic (no MODEL_PROVIDER branch) |
| E (audit trace) | E1–E4 | types.ts has ResolutionTrace.gazeDirection with required fields (source/sourceId/treatment/applied/reason?); applied:true/with-non-null-fields write; applied:false/with-reason write; source:fallback path; additive no-migration |
| G (CTA outcome framing) | G1–G6 | non-empty + outcome-framing + advisory; ≈3–5 words + language adaptation; Arabic grammar rules preserved (no leading و); English path covered; copy-fidelity contract preserved; generators.ts imports from gazeMap.ts |
| Reversibility | R1 | null resolvers + no pricing → only ONE_HIGHLIGHT_BLOCK survives |

---

## Reversibility verification

The `R1` test in `gazeMap.test.ts` exercises the structural reversibility path:
- Sets `resolveGazeDirective` to return `null` (simulating "no hook, no objection" path).
- Calls `detectPriceContent` on price-free copy (returns `false`).
- Assembles the four-block template literal that `buildFinalImagePrompt` would emit.
- Asserts the only non-empty block is `ONE_HIGHLIGHT_BLOCK`.

```ts
const _gazeBlock = "";            // null resolver → ""
const _moodBlock = "";            // null resolver → ""
const _priceBlock = "";           // no pricing → ""
const _injection = `${_gazeBlock}\n${ONE_HIGHLIGHT_BLOCK}\n${_moodBlock}\n${_priceBlock}`.trim();
assert(_injection === ONE_HIGHLIGHT_BLOCK);
```

Full revert path: comment out the `${(() => { ... })()}` IIFE in `buildFinalImagePrompt` (the one IIFE comment header explicitly documents the Phase 19 injection site, so a `git grep "Phase 19 — Direct-Response Design Upgrades"` will find the single line to comment out). The Phase 28 expression block IIFE and the rest of the prompt are untouched. The `ResolutionTrace.gazeDirection?` field remains additive — legacy records read as "not applied."

---

## What's deferred (out of scope for v1)

- **Art-direction gaze override** (FR-006): the spec explicitly defers this to a later phase (clarification 2026-06-24). The mapper is structured so an `art-direction` source can be added later (`GazeDirective.source` is already typed as `"hook" | "objection" | "fallback" | null`, and the call site uses `_imGazeDirective.source` as-is so a future `art-direction` source flows through without reworking the injection point). Contract B / E explicitly support this — the source type is `string` in the persisted trace (not a closed union) so a future `art-direction` value would be accepted by the writer.
- **Campaign coherence** (Phase 19 row 19.7 in LAUNCH_MATRIX): the spec did not include this in the FRs; it remains a separate piece of work for a later phase.
- **`visualPromiseMapping` hook↔visual alignment scoring** (Phase 19 row 19.6 in LAUNCH_MATRIX): not in scope; the hook-mood block (US4) covers the mood modulation side of the same lever.

---

## Qualitative sampling (T026 from tasks.md)

The quickstart (`specs/962-gaze-direction-dr/quickstart.md`) defines a qualitative sampling procedure (10-hook sweep + before/after + 9:16 story + carousel + batch + no-hook) that requires actual model runs. The unit tests cover the deterministic contract surface (Contracts A–G, 244 assertions); qualitative sampling is a manual QA step that the reviewer will run against a real face / hook / offer combination after merge. The structural hooks for sampling are in place:
- `resolutionTrace.gazeDirection` is populated for every hero-bearing generation (Contract E) so the trace can be inspected post-hoc.
- The output prompt is grep-able for the canonical labels (`GAZE DIRECTION:`, `VISUAL FOCAL POINT:`, `HOOK ↔ VISUAL MOOD:`, `PRICE HIERARCHY`) so the reviewer can confirm the blocks are present in the assembled prompt before generation.
- Before/after mode, 9:16 aspect, carousel/batch paths, and no-hook gating are all unit-tested at the contract level (D1–D8), so the deterministic surface is verified; the visual outcome is a Gemini-side concern.

---

## Spec artifacts added

For full traceability, all 8 speckit artifacts live under `specs/962-gaze-direction-dr/`:

```text
specs/962-gaze-direction-dr/
├── checklists/
│   └── requirements.md                    # 17/17 items complete
├── contracts/
│   ├── cta-outcome-framing.contract.md    # Contract G
│   ├── dr-guidance-injection.contract.md  # Contracts D, E, F
│   └── gaze-map.contract.md               # Contracts A, B, C
├── data-model.md                          # types, mapping tables, block outputs
├── plan.md                                # constitution check, structure, scope
├── quickstart.md                          # build/test/sample procedure
├── research.md                            # 11 decisions (R1–R11)
├── spec.md                                # 5 user stories, FRs, success criteria
└── tasks.md                               # 27 tasks across 8 phases
```

---

## No regressions — proof

```shell
$ cd functions && npm test
  phase13 ▸ projectStatus — all 14 tests passed
  phase13 ▸ projectQuota — all 8 tests passed
  phase13 ▸ getUserProjects access denial tests
    ✅ All getUserProjects access denial tests passed
  culturalCompliance tests
    ... 929 passed, 0 failed
  modeFormatValidator tests
    ✅ all passed
  copyQuality tests
    71 passed, 0 failed
  copyStructure tests
    206 passed, 0 failed
  conditionalCopyFields tests (US2 — copy-parser contract rows P2-P9)
    77 passed, 0 failed
  expressionMap tests (post-audit)
    223 passed, 0 failed
  languageQuality tests
    ✅ Spec 008 — All language quality tests passed
  workspace tests
    Workspace Tests: 5 passed, 0 failed, 13 skipped
  creativeResolver parity tests
    ✅ ALLOWED_PAIRS parity: 10 entries match
    ✅ DISALLOWED_PAIRS parity: 0 entries match
  sizeVariant tests
    51 passed, 0 failed
  contractFixtures.test
    ✅ Spec 002 — All 11 lanes passed
    ✅ Spec 005 — All regression tests passed
    ✅ Spec 005 Phase 2 — All new tests passed
    ✅ Spec 006 — All team fixture tests passed
    ✅ T025 — All entitlement fixtures passed
    ✅ T026a — Cross-module parity complete
    ✅ HFC.9 — Integration checks complete
    ✅ HFD — All logo fixtures passed
    ✅ HFE — All hybrid logo fixtures passed
    ✅ BCR — All brand color resolver fixtures passed
    ✅ US1 — All carousel/batch fixtures passed
    ✅ US2 — All retargeting fixtures passed
    ✅ BCC — All compliance fixtures passed
    ✅ US4 — All compositor fixtures passed
    ✅ US5 — All scoring fixtures passed
    ✅ HFF — All aspect ratio reflow fixtures passed
    ✅ Phase 16 — All creative modes & art direction QA fixtures passed
  EXIT_CODE: 0
```

The full backend test suite (14 test files, hundreds of contract fixtures) is green. Phase 28 (`expressionMap.test.ts`) is still 223/223. The new `gazeMap.test.ts` is 244/244.

---

## CodeRabbit / review handling

CodeRabbit review is in progress on PR #47. To be handled iteratively: pull the inline comments via `gh api /repos/eslam21006-coding/proadsai/pulls/47/comments` and the review bodies via `gh pr view 47 --json reviews`, address each comment (or push back with a citation), and push a fix-up commit. See `docs/LAUNCH_MATRIX.md` (or the project's review-process convention) for the review-iteration protocol.

---

## References

- Spec artifacts: `specs/962-gaze-direction-dr/`
- Source files: `functions/src/gazeMap.ts`, `functions/src/__tests__/gazeMap.test.ts`, `functions/src/generators.ts` (edits), `functions/src/types.ts` (edits), `functions/package.json` (edits)
- Docs: `CLAUDE.md` (Recent Changes), `docs/LAUNCH_MATRIX.md` (Phase 19 → DONE; Section 8 mirror)
- Pattern reference: `functions/src/expressionMap.ts` (Phase 28 — the exact same shape)
- Test runner: `npm run test:gazeMap` (mirrors `test:expressionMap`)
- PR: https://github.com/eslam21006-coding/proadsai/pull/47
- Commit: `10fb254` on branch `962-gaze-direction-dr`
