# Contract — `resolveEntitlement()` Function

**Feature**: Plan Structure Alignment Hotfix (Phases 1–9)
**Authority**: `docs/LAUNCH_MATRIX.md` HF.2, HF.3, HF.6, HF.7 + spec FR-010–FR-027
**Consumers**: `src/components/InputForm.tsx` (locked-state UI), `functions/src/creativeResolver.ts::validateLaunchSurface()`, `functions/src/generators.ts` (batch + carousel guards), Cloud Function entry points (`functions/src/index.ts`).

This contract encodes the *only* function that decides whether a given plan can use a given feature at a given quantity. Frontend locked-state UI and backend request guards both call this function — they MUST NOT re-implement the logic (Principle XI).

---

## 1. Signature

```typescript
export function resolveEntitlement(input: EntitlementInput): EntitlementDecision;

interface EntitlementInput {
  plan: UserPlan;
  feature: FeatureName;
  quantity?: number;   // required for numeric-cap features; ignored otherwise
}

type FeatureName =
  // boolean gates
  | 'retargeting'
  | 'fantasyUniverse'
  | 'artDirection'
  | 'batch'
  | 'carousel'
  | 'referenceAds'
  // quantity-bounded
  | 'carouselSlides'          // quantity = requested slide count
  | 'batchRun'                // quantity = total combinations (sizes × hooks × concepts)
  | 'teamInvite'              // quantity = current team size + 1
  | 'savedProjectSave'        // quantity = current count + 1
  | 'audienceAvatarCreate'    // quantity = current count + 1
  // always-allowed on paid plans (explicit no-op for discoverability)
  | 'hookAngles'
  | 'hookTypes'
  | 'copywritingStrategies'
  | 'adTones';

interface EntitlementDecision {
  allowed: boolean;
  reason?: EntitlementDenialReason;
  limit?: number;
}

type EntitlementDenialReason =
  | 'plan_none'
  | 'pro_plan_required'
  | 'scale_plan_required'
  | 'batch_limit_exceeded'
  | 'carousel_limit_exceeded'
  | 'team_limit_exceeded'
  | 'saved_project_limit_exceeded'
  | 'avatar_limit_exceeded';
```

---

## 2. Behaviour matrix

### Boolean-gate features

| Feature | plan=`none` | plan=`starter` | plan=`pro` | plan=`scale` |
|---|---|---|---|---|
| `retargeting` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: false, reason: 'pro_plan_required' }` | `{ allowed: true }` | `{ allowed: true }` |
| `fantasyUniverse` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: false, reason: 'pro_plan_required' }` | `{ allowed: true }` | `{ allowed: true }` |
| `artDirection` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: false, reason: 'pro_plan_required' }` | `{ allowed: true }` | `{ allowed: true }` |
| `batch` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: false, reason: 'pro_plan_required' }` | `{ allowed: true }` | `{ allowed: true }` |
| `carousel` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: false, reason: 'pro_plan_required' }` | `{ allowed: true }` | `{ allowed: true }` |
| `referenceAds` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: false, reason: 'pro_plan_required' }` | `{ allowed: true }` | `{ allowed: true }` |

### Always-allowed on paid plans

| Feature | plan=`none` | plan=`starter` | plan=`pro` | plan=`scale` |
|---|---|---|---|---|
| `hookAngles` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: true }` | `{ allowed: true }` | `{ allowed: true }` |
| `hookTypes` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: true }` | `{ allowed: true }` | `{ allowed: true }` |
| `copywritingStrategies` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: true }` | `{ allowed: true }` | `{ allowed: true }` |
| `adTones` | `{ allowed: false, reason: 'plan_none' }` | `{ allowed: true }` | `{ allowed: true }` | `{ allowed: true }` |

### Quantity-bounded features

- **`carouselSlides`** (requires `quantity`):
  - Starter → `{ allowed: false, reason: 'pro_plan_required', limit: 0 }`
  - Pro → if `quantity > 7` → `{ allowed: false, reason: 'carousel_limit_exceeded', limit: 7 }`; else `{ allowed: true, limit: 7 }`
  - Scale → if `quantity > 10` → `{ allowed: false, reason: 'carousel_limit_exceeded', limit: 10 }`; else `{ allowed: true, limit: 10 }`

- **`batchRun`** (requires `quantity` = total combinations):
  - Starter → `{ allowed: false, reason: 'pro_plan_required', limit: 0 }`
  - Pro → if `quantity > 4` → `{ allowed: false, reason: 'batch_limit_exceeded', limit: 4 }`; else `{ allowed: true, limit: 4 }`
  - Scale → if `quantity > 36` → `{ allowed: false, reason: 'batch_limit_exceeded', limit: 36 }`; else `{ allowed: true, limit: 36 }`

- **`teamInvite`** (requires `quantity` = proposed new team size, owner-inclusive):
  - Starter → `{ allowed: false, reason: 'pro_plan_required', limit: 1 }`
  - Pro → if `quantity > 3` → `{ allowed: false, reason: 'team_limit_exceeded', limit: 3 }`; else `{ allowed: true, limit: 3 }`
  - Scale → if `quantity > 10` → `{ allowed: false, reason: 'team_limit_exceeded', limit: 10 }`; else `{ allowed: true, limit: 10 }`

- **`savedProjectSave`** (requires `quantity` = proposed new saved-project count):
  - Starter → if `quantity > 10` → `{ allowed: false, reason: 'saved_project_limit_exceeded', limit: 10 }`; else `{ allowed: true, limit: 10 }`
  - Pro → if `quantity > 30` → `{ allowed: false, reason: 'saved_project_limit_exceeded', limit: 30 }`; else `{ allowed: true, limit: 30 }`
  - Scale → `{ allowed: true, limit: Infinity }` (always allowed)
  - *Note:* soft-grandfather (FR-006) is enforced by the caller — only the *create new* action calls this resolver. Reads, edits, and deletes bypass the gate.

- **`audienceAvatarCreate`** (requires `quantity` = proposed new avatar count):
  - Starter → if `quantity > 5` → `{ allowed: false, reason: 'avatar_limit_exceeded', limit: 5 }`; else `{ allowed: true, limit: 5 }`
  - Pro → if `quantity > 15` → `{ allowed: false, reason: 'avatar_limit_exceeded', limit: 15 }`; else `{ allowed: true, limit: 15 }`
  - Scale → `{ allowed: true, limit: Infinity }`

---

## 3. Invariants

| # | Invariant | Validation |
|---|---|---|
| R-01 | Pure: no Firestore reads, no network calls, no Date/time reads. | Lint rule + unit test that calls the function 10000× and measures no I/O. |
| R-02 | Never throws on any input of the declared types. | Property test with generated `{ plan, feature, quantity }` triples. |
| R-03 | For `plan: 'none'`, every feature returns `{ allowed: false, reason: 'plan_none' }` regardless of `quantity`. | Parameterised unit test over every `FeatureName`. |
| R-04 | `reason` is present iff `allowed === false`. | Assertion in the return-shape test. |
| R-05 | `limit` is present for every quantity-bounded feature decision (both allow and deny). | Parameterised test over the 5 numeric features. |
| R-06 | For any boolean-gate feature, `resolveEntitlement({ plan: 'pro', feature: X }).allowed === PLANS.pro.features[X]`. (Resolver must mirror the PlanConfig, not duplicate the values.) | Unit test using cross-imports. |
| R-07 | Frontend and backend MUST import the same `resolveEntitlement` implementation (or exact mirrors generated from the same source). | CI check: diff `src/planconfig.ts` entitlement helpers vs `functions/src/entitlements.ts`. Discrepancy fails CI. |
| R-08 | Never returns `{ allowed: true, reason: X }`. | Type system: `reason` is conditionally present via discriminated union. |

---

## 4. Caller integration points (post-hotfix)

| Caller | Call pattern |
|---|---|
| `InputForm.tsx` — carousel slide selector | `resolveEntitlement({ plan, feature: 'carouselSlides', quantity: selected })` on each change |
| `InputForm.tsx` — batch toggle | `resolveEntitlement({ plan, feature: 'batch' })` on mount |
| `InputForm.tsx` — hook angle dropdown | *skipped* — Starter sees all 11 by design; no gate call |
| `Team.tsx` — invite form | `resolveEntitlement({ plan, feature: 'teamInvite', quantity: currentSize + 1 })` |
| `App.tsx` — save project button | `resolveEntitlement({ plan, feature: 'savedProjectSave', quantity: currentCount + 1 })` |
| `functions/src/creativeResolver.ts::validateLaunchSurface` | Consolidated: checks each active mode / feature selection against `resolveEntitlement` before allowing generation |
| `functions/src/generators.ts` — batch entry | `resolveEntitlement({ plan, feature: 'batchRun', quantity: sizes × hooks × concepts })` |
| `functions/src/generators.ts` — carousel entry | `resolveEntitlement({ plan, feature: 'carouselSlides', quantity: requestedSlides })` |
| Cloud Function entrypoints (`magicEditImage`, etc.) | Feature-specific gate call before any work |

---

## 5. Fixture checklist

Every row in the matrix above MUST have one corresponding entry in `functions/src/contractFixtures.test.ts`. HF.10 is complete when:

- [x] 6 boolean-gate features × 4 plans = **24** fixtures
- [x] 4 always-allowed features × 4 plans = **16** fixtures
- [x] 5 quantity-bounded features × 4 plans × 2 boundary cases (at-limit, over-limit) = **40** fixtures
- [x] Legacy read-time mapping: 2 fixtures (one for `creator → pro`, one for `scaling → scale`)

**Target**: **82** entitlement fixtures after this hotfix. Prior count was ~58 (with the 4-plan × 3 boolean features + Creator-specific scenarios). The net increase is from expanding coverage to quantity-bounded features that were previously untested end-to-end.
