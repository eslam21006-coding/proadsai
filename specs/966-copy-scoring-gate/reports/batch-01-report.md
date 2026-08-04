# Batch 01 Report — Phase 22 Copy Scoring Gate

**Tasks completed**: T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013 (initial pass)
**Phase**: 1 (Setup) + Phase 2 (Foundational, partial) + Phase 3 (initial US1 skeleton)
**Files changed**:
- `functions/src/modelConfig.ts` (+ `COPY_SCORING_ENABLED: boolean = true` beside MODEL_PROVIDER)
- `functions/src/copywriting_knowledge.ts` (annotation block: 9 ACTIVE / 6 DEFERRED dimensions)
- `functions/src/copyScoringGate.ts` (NEW — gate core: parseBlockIntoFields, substituteFieldsInBlock, blockStructurePreserved, applyCulturalSubstitution, evaluateThreshold, validateRewriteCandidate, gateCopySet + openai clients, formatGateLogLine)
- `functions/src/__tests__/copyScoringGate.test.ts` (NEW — runner scaffold + A/B/F clause tests)
- `functions/package.json` (+ `test:copyScoringGate` convenience script; registered in main `test` chain)
- `functions/src/types.ts` (+ `ResolutionTrace.copyScoring` optional sub-object)
- `functions/src/generators.ts` (+ `ResolutionTrace.copyScoring` optional sub-object; `import type { CopyScoringTrace }`; `generateTOV` now returns `{ text, rankingGuidance, copyScoringTrace }`; `generateCarouselSlideCopies` returns `{ copies, copyScoringTrace }`; `generateTestimonialCarousel` returns existing + `copyScoringTrace`; attach points wired at `generateTOV`, `generateCarouselSlideCopies`, `generateTestimonialCarousel` with kill-switch + edit-path guard + always-fail-open wrapper)
- `functions/src/index.ts` (`+ openaiApiKey` to three callables: `serverGenerateTOV`, `serverGenerateCarouselSlideCopies`, `serverGenerateTestimonialCarousel`; `+ copyScoringTrace` to finalAd request payload; `generateFinalAd` extended with `copyScoringTrace` parameter; merge into `_lastResolutionTrace.copyScoring`)

**Issues found**: None blocking. The dynamic-import pattern inside `generateTOV` keeps the gate module side-effect-free in tests. The `gateCopySet` total-isolation wrapper (T009) returns the original block on any failure path. `setOpenAIKey(openaiApiKey.value())` is now called inside the TOV callable so the production client has access to the key.

**Build result**: `npm run build` in `functions/` PASSES (TypeScript clean).

**Test result**: `npm run test:copyScoringGate` PASSES (22/22 assertions).
- A1: gateCopySet never throws / rejects under throwing / rejecting / undefined-returning stubs
- B1: ACTIVE_DIMENSIONS has exactly 9 entries (and includes all 9 named dimensions)
- F1: passing field makes exactly 1 scoring call (interaction counter wired)

**Next batch**: T014–T018 (US1 test groups — scoring/threshold/rewrite/claim-flags/block-integrity) and T019–T035 (US1 implementation hardening).