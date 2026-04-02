# Tasks: Frontend Enforcement (Phase 2 from LAUNCH_MATRIX Section 14)

**Input**: `docs/LAUNCH_MATRIX.md` Section 14, Phase 2
**Prerequisites**: Phase 1 (Resolver Foundation) complete
**Status**: ALL 12 TASKS COMPLETE ✅

---

## Phase 2 — Frontend Enforcement (12/12 complete)

- [X] 2.1 Remove `limited_access`, `module_preview`, `day_strip` from all UI components in `src/components/InputForm.tsx`
- [X] 2.2 Remove `limited_access`, `module_preview`, `day_strip` from mode-related constants in `src/constants.ts`
- [X] 2.3 Move `before_after` from hook angle selector to Creative Mode card grid in `src/creativeResolver.ts`
- [X] 2.4 Remove `before_after` from `COLD_HOOK_ANGLES` in `src/constants.ts`
- [X] 2.5 Slice `AD_LANGUAGES` to 7 launch languages in `src/constants.ts` — remove fr, es, de, tr, pt
- [X] 2.6 Consume `validateLaunchSurface()` in `src/components/InputForm.tsx` — inline blocking message on invalid combo
- [X] 2.7 Universe dropdown visible for all 3 style families including Minimal in `src/components/InputForm.tsx`
- [X] 2.8 Art Direction section labeled "Art Direction" across all families in `src/components/InputForm.tsx`
- [X] 2.9 Reference ad upload gated to Pro plan in `src/components/InputForm.tsx`
- [X] 2.10 value_stack slideCount auto-override with inline notification in `src/components/InputForm.tsx`
- [X] 2.11 Testimonial slideCount auto-override stub (Spec G) in `src/components/InputForm.tsx`
- [X] 2.12 Override signals for auto-switches in `src/components/InputForm.tsx`

---

## Type Cleanup (verified)

- [X] `ColdHookAngle` in `src/types.ts`: `before_after` removed (10 angles remain)
- [X] `OfferCreativeMode` in `src/types.ts`: `before_after` present as creative mode. `day_strip`, `module_preview`, `limited_access` removed.

---

## Verification

- [X] `npm run build` compiles clean
- [X] Deleted modes absent from `src/components/InputForm.tsx` (0 matches)
- [X] Deleted modes absent from `src/constants.ts` (0 matches)
- [X] `before_after` absent from `COLD_HOOK_ANGLES` (0 matches)
- [X] Non-launch languages absent from `src/constants.ts` (0 matches for fr/es/de/tr/pt)
