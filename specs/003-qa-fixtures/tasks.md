# Tasks: QA Fixtures (Phase 3 from LAUNCH_MATRIX Section 14)

**Input**: `docs/LAUNCH_MATRIX.md` Section 14, Phase 3
**Prerequisites**: Phase 1 (Resolver Foundation) complete
**Status**: ALL TASKS COMPLETE ✅

**All tests in**: `functions/src/contractFixtures.test.ts`

---

## Lane Fixtures (from Phase 2)

- [X] 3.1–3.9 Lane fixtures 1–9
- [X] Stubs — Lanes 10-11 testimonial stubs

## Resolver Function Unit Tests

- [X] T001 `validateLaunchSurface()` unit tests — 9 passing combos + blocked deleted modes + cross-tab + before_after+carousel
- [X] T002 `carouselSlideCountPlan()` unit tests — cold 2/5/9, retargeting 3/5/7 with exact angle arrays
- [X] T003 `resolveValueStackSlideCount()` unit tests — 3/7/9/0 gifts + empty string filtering
- [X] T004 `filterEmptyValueStackFields()` unit tests — all populated (9 fields), all empty (9 fields), mixed

## Verification

- [X] T005 `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all pass

## Notes

- 3 warnings expected: `limited_access`, `module_preview`, `day_strip` still in backend catalog on this branch (Phase 1 cleanup pending on branch 001)
- `carouselSlideCountPlan` assigns pool[0] to hook slide, pool[1..] to middle slides
- `resolveValueStackSlideCount` returns 0 for 0 gifts (no carousel possible)
- `filterEmptyValueStackFields` checks all 9 VALUE_STACK_FIELDS — undefined fields count as skipped
