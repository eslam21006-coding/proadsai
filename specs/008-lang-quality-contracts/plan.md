# Implementation Plan: Language Quality Contracts

**Branch**: `008-lang-quality-contracts` | **Date**: 2026-04-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-lang-quality-contracts/spec.md`

## Summary

Add per-language caption quality validation for all 7 launch languages (6 Arabic dialects + English) to `captionValidator.ts`. Each language gets a dedicated validation contract (word count, script ratio, dialect markers, register, grammar heuristics) that runs after caption generation and before delivery. The existing `validateCaption()` function is extended — not replaced — with a new `validateLanguageQuality()` entry point that returns a `CaptionQualityResult` persisted as the `captionQuality` field on the generation's resolution trace.

## Technical Context

**Language/Version**: TypeScript 5.7.3 (functions)
**Primary Dependencies**: Firebase Cloud Functions v2, firebase-admin, @google/genai (Gemini)
**Storage**: Firestore (`generations/{genId}` documents, `captionQuality` field on resolution trace)
**Testing**: Node.js built-in `assert/strict` — no Jest/Mocha. Tests compiled to `lib/` and run via `node lib/<test>.test.js`
**Target Platform**: Firebase Cloud Functions (Node.js runtime)
**Project Type**: Backend cloud functions (SaaS ad generation pipeline)
**Performance Goals**: Validation must add <200ms latency to caption delivery (all checks are string-based, no network calls)
**Constraints**: Existing repair loop is MAX_CAPTION_ATTEMPTS = 2 (1 initial + 1 repair). Language quality checks integrate into this existing loop, not a separate retry mechanism.
**Scale/Scope**: 7 languages, ~5-8 checks per language, 21+ unit test cases (3 per language minimum)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | Extends existing validator with per-language rules; no new modes or features added |
| II. Selected Mode Must Be Obeyed | PASS | Language selection drives which contract runs — no silent drift |
| III. Launch Surface Is Frozen | PASS | Only 7 approved languages; deferred languages explicitly excluded |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Core purpose of this feature — explicit pass/fail rules per language |
| V. Arabic Quality Is First-Class | PASS | Arabic Fusha, Egyptian, Gulf get full contracts; 3 lighter dialects get minimum checks |
| VI. Hidden Machine Layers Must Be Auditable | PASS | `captionQuality` field persisted on resolution trace for every generation |
| VII. No Silent Override Without Rule, Signal, Trace | PASS | Failed validation logged even when caption delivered after max retries (FR-015) |
| VIII. Cost Discipline Is Mandatory | PASS | Integrates into existing 2-attempt loop; no additional Gemini calls beyond current architecture |
| IX. Proof Required for Every Fix | PASS | Unit tests with pass/fail fixtures provide regression evidence |
| X. Spec Before Code | PASS | Full spec with 15 FRs, 7 SCs, 8 clarifications completed |
| XI. Frontend and Backend Must Agree | N/A | Backend-only change; no frontend surface for language quality |
| XII. Deferred Scope Must Remain Deferred | PASS | French, Spanish, German, Turkish, Portuguese explicitly excluded |

**Gate result**: ALL PASS. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/008-lang-quality-contracts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
functions/src/
├── captionValidator.ts          # MODIFY — add per-language quality contracts
├── generators.ts                # MODIFY — integrate validateLanguageQuality() into caption pipeline, persist captionQuality
├── dialectMarkers.ts            # NEW — static dialect marker reference lists (Egyptian, Gulf exclusion lists)
└── languageQuality.test.ts      # NEW — per-language unit tests (21+ cases)
```

**Structure Decision**: All language quality logic lives in `functions/src/`. The main validator extension goes in `captionValidator.ts`. Dialect marker data is extracted to a dedicated file to keep marker lists maintainable. Tests follow the existing pattern (`contractFixtures.test.ts`) using Node.js assert/strict.

## Complexity Tracking

No violations to justify. Feature extends existing architecture with no new projects, patterns, or abstractions.
