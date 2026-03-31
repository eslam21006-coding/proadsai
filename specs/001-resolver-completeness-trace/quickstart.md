# Quickstart: Resolver Completeness, Resolution Trace & Slide Plans

**Feature**: 001-resolver-completeness-trace
**Date**: 2026-03-31

---

## What This Feature Delivers

This feature extends the creative resolver (`functions/src/creativeResolver.ts`) to become the single authority for launch surface validation, carousel slide planning, value_stack auto-adjustment, and empty field filtering. It also introduces a resolution trace that is persisted on every generation run.

## Files Changed

| File | Change | Risk |
|---|---|---|
| `functions/src/creativeResolver.ts` | Extend `ResolverInput`, add 6 new functions, delete 3 modes from catalog/pairs/compat | High — core resolver, all generation paths depend on it |
| `functions/src/generators.ts` | Wire `resolveStyleFamily()` to use resolver's `visualStyleFamily` input; centralize retargeting hook clearing | Medium — scattered changes, existing logic preserved |
| `functions/src/index.ts` | Add server-side launch surface guard at handler entry; persist resolution trace after generation | Medium — entry point changes affect all requests |
| `functions/src/types.ts` | Add `ResolutionTrace` interface, `SlideRole` type, `ValueStackAdjustment` type | Low — additive types only |
| `functions/src/step3point5.ts` | **DELETE** — dead code, zero imports | Low — no dependents |

## Execution Order

The 17 tasks from LAUNCH_MATRIX.md Phase 1 map to this dependency chain:

```
1.1  Delete step3point5.ts
1.2  Delete 3 modes from CREATIVE_MODE_CATALOG
1.3  Delete mode pair entries referencing deleted modes
1.4  Delete SUBSTYLE_MODE_COMPAT entries for deleted modes
     ↓
1.5  Add campaignType to ResolverInput
1.6  Add adFormat to ResolverInput
1.7  Add visualStyleFamily to ResolverInput
     ↓
1.8  Wire minimal handling in resolveStyleFamily()
1.9  Write validateLaunchSurface()
1.10 Write carouselSlideCountPlan()
1.11 Write resolveValueStackSlideCount()
1.12 Write filterEmptyValueStackFields()
     ↓
1.13 Write ResolutionTrace interface in types.ts
1.14 Write buildResolutionTrace()
     ↓
1.15 Wire trace persistence into index.ts
1.16 Add server-side launch surface guard to index.ts
1.17 Centralize retargeting hook clearing into resolver
```

## Validation

After all changes, run:

```powershell
cd functions
npm run build
npm run test:contracts
```

Both must pass. The test suite will be extended in Phase 3 (Spec D) with 11 priority lane fixtures, but the existing tests must continue to pass throughout.

## Key Integration Points

1. **Frontend will consume `validateLaunchSurface()`** in Phase 2 (Spec C) for inline combination blocking.
2. **Generators consume `carouselSlideCountPlan()`** during carousel generation to drive per-slide prompts.
3. **Generators consume `filterEmptyValueStackFields()`** before any value_stack prompt construction.
4. **`index.ts` consumes `buildResolutionTrace()`** after every generation to persist the audit trail.

## Re-Verify Constitution After Design

| Principle | Status | Evidence |
|---|---|---|
| I. Reliability over features | PASS | Removing 3 modes reduces surface, increases reliability |
| II. Selected mode obeyed | PASS | Resolver propagates all user selections faithfully |
| III. Launch surface frozen | PASS | `validateLaunchSurface()` encodes the frozen registry |
| IV. Behavior contracts | PASS | Slide plans provide deterministic pass/fail criteria |
| V. Arabic first-class | PASS | Language selection passes through resolver unchanged |
| VI. Hidden layers auditable | PASS | Resolution trace records every resolver decision |
| VII. No silent override | PASS | All overrides logged in trace + signaled to user |
| VIII. Cost discipline | PASS | Server guard blocks invalid combos before credit deduction |
| IX. Proof required | PASS | Resolution trace enables before/after evidence |
| X. Spec before code | PASS | This plan + spec precede implementation |
| XI. Frontend/backend agree | PASS | Shared `validateLaunchSurface()` function |
| XII. Deferred stays deferred | PASS | Deleted modes are gone, not hidden |
