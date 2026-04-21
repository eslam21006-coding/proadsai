# Contract — `planconfig.ts` PLANS Record Schema

**Feature**: Plan Structure Alignment Hotfix (Phases 1–9)
**Authority**: `docs/LAUNCH_MATRIX.md` HF.1 + pricing page (3-plan finalisation)
**Consumers**: `src/components/InputForm.tsx`, `src/components/PricingTable.tsx`, `src/App.tsx`, `functions/src/entitlements.ts` (parallel record), `functions/src/creativeResolver.ts` (plan hierarchy).

This contract pins the shape and values of the single `PLANS` record. Any drift between the frontend (`src/planconfig.ts`) and the backend mirror (`functions/src/entitlements.ts` `PLAN_FEATURES`) is a Principle XI violation.

---

## 1. Type definitions

```typescript
export type UserPlan = 'none' | 'starter' | 'pro' | 'scale';

export interface BatchConfig {
  maxSizes: number;      // UI picker cap
  maxHooks: number;      // UI picker cap
  maxConcepts: number;   // UI picker cap
  maxAdsPerRun: number;  // backend ceiling = sizes × hooks × concepts ≤ this
}

export interface PlanFeatures {
  retargeting: boolean;
  fantasyUniverses: boolean;       // plural — matches implementation
  visualPolishes: boolean;         // formerly "artDirection" in an earlier draft
  batchGeneration: boolean;        // formerly "batch" in an earlier draft
  carousel: boolean;
  referenceAdUpload: boolean;      // formerly "referenceAds" in an earlier draft
  maxTeamMembers: number;          // owner-inclusive (clarification Q1) — lives inside features
  hookAngles: 'full' | 'none';
  hookTypes: 'full' | 'none';
  copywritingStrategies: 'full' | 'none';
  adTones: 'full' | 'none';
}

export interface PlanConfig {
  name: string;
  monthlyCredits: number;
  savedProjectLimit: number;       // Infinity allowed
  audienceAvatarLimit: number;     // Infinity allowed
  carouselMaxSlides: number | null;
  batchConfig: BatchConfig | null;
  features: PlanFeatures;          // maxTeamMembers lives here (not at top level)
  paddlePriceId?: {
    monthly: string;
    yearly: string;                // implementation uses 'yearly' — matches Paddle SDK
  };
}

export const PLANS: Record<UserPlan, PlanConfig> = { /* 4 entries below */ };
```

---

## 2. Authoritative PLANS values

### `'none'`

```typescript
{
  name: 'No Plan',
  monthlyCredits: 0,
  savedProjectLimit: 0,
  audienceAvatarLimit: 0,
  carouselMaxSlides: null,
  batchConfig: null,
  features: {
    retargeting: false,
    fantasyUniverses: false,
    visualPolishes: false,
    batchGeneration: false,
    carousel: false,
    referenceAdUpload: false,
    maxTeamMembers: 0,
    hookAngles: 'none',              // 'none' plan has no creative access
    hookTypes: 'none',
    copywritingStrategies: 'none',
    adTones: 'none',
  },
  paddlePriceId: { monthly: '', yearly: '' },
}
```

### `'starter'`

```typescript
{
  name: 'Starter',
  monthlyCredits: 800,
  savedProjectLimit: 10,
  audienceAvatarLimit: 5,
  carouselMaxSlides: null,              // carousel locked
  batchConfig: null,                    // batch locked
  features: {
    retargeting: false,
    fantasyUniverses: false,
    visualPolishes: false,
    batchGeneration: false,
    carousel: false,
    referenceAdUpload: false,
    maxTeamMembers: 1,                  // owner only — invite form hidden
    hookAngles: 'full',                 // all 11 available
    hookTypes: 'full',                  // all 12 available
    copywritingStrategies: 'full',      // all 8 available
    adTones: 'full',                    // all 11 available
  },
  paddlePriceId: { monthly: '<see planconfig.ts>', yearly: '<see planconfig.ts>' },
}
```

### `'pro'`

```typescript
{
  name: 'Pro',
  monthlyCredits: 2500,
  savedProjectLimit: 30,
  audienceAvatarLimit: 15,
  carouselMaxSlides: 7,
  batchConfig: { maxSizes: 1, maxHooks: 2, maxConcepts: 2, maxAdsPerRun: 4 },
  features: {
    retargeting: true,
    fantasyUniverses: true,
    visualPolishes: true,
    batchGeneration: true,
    carousel: true,
    referenceAdUpload: true,
    maxTeamMembers: 3,                  // owner + 2 invitees
    hookAngles: 'full',
    hookTypes: 'full',
    copywritingStrategies: 'full',
    adTones: 'full',
  },
  paddlePriceId: { monthly: '<see planconfig.ts>', yearly: '<see planconfig.ts>' },
}
```

### `'scale'`

```typescript
{
  name: 'Scale',
  monthlyCredits: 6500,
  savedProjectLimit: Infinity,
  audienceAvatarLimit: Infinity,
  carouselMaxSlides: 10,
  batchConfig: { maxSizes: 3, maxHooks: 4, maxConcepts: 3, maxAdsPerRun: 36 },
  features: {
    retargeting: true,
    fantasyUniverses: true,
    visualPolishes: true,
    batchGeneration: true,
    carousel: true,
    referenceAdUpload: true,
    maxTeamMembers: 10,                 // owner + 9 invitees
    hookAngles: 'full',
    hookTypes: 'full',
    copywritingStrategies: 'full',
    adTones: 'full',
  },
  paddlePriceId: { monthly: '<see planconfig.ts>', yearly: '<see planconfig.ts>' },
}
```

---

## 3. Contract invariants (enforced by tests)

| # | Invariant | Validation |
|---|---|---|
| C-01 | `Object.keys(PLANS)` is exactly `['none','starter','pro','scale']` in any order | Unit test: `expect(new Set(Object.keys(PLANS))).toEqual(new Set(['none','starter','pro','scale']))` |
| C-02 | No runtime reference to `'creator'` or `'scaling'` exists in active plan unions or entitlement enums under `src/` or `functions/src/` | Repo grep in CI: `grep -rnE "\b(creator\|scaling)\b" src/ functions/src/ --include="*.ts" --include="*.tsx"` — with an allowlist for documented legacy-mapping paths (see `plan.md`) returns zero plan-related hits |
| C-03 | `PLANS.starter.features.batchGeneration === false` and `PLANS.starter.batchConfig === null` | Unit test |
| C-04 | `PLANS.pro.batchConfig.maxAdsPerRun === 4`, `PLANS.pro.carouselMaxSlides === 7` | Unit test |
| C-05 | `PLANS.scale.batchConfig.maxAdsPerRun === 36`, `PLANS.scale.carouselMaxSlides === 10` | Unit test |
| C-06 | `PLANS.scale.savedProjectLimit === Infinity`, `PLANS.scale.audienceAvatarLimit === Infinity` | Unit test |
| C-07 | For every paid plan, `features.hookAngles === 'full' && features.hookTypes === 'full' && features.copywritingStrategies === 'full' && features.adTones === 'full'` | Unit test, parameterised over `['starter','pro','scale']` |
| C-08 | `retargeting` / `fantasyUniverses` / `visualPolishes` / `batchGeneration` / `carousel` / `referenceAdUpload` are `false` on Starter, `true` on Pro, `true` on Scale | Unit test, one assertion per feature |
| C-09 | `PLANS.pro.features.maxTeamMembers === 3`, `PLANS.scale.features.maxTeamMembers === 10`, `PLANS.starter.features.maxTeamMembers === 1` (owner-inclusive) | Unit test |
| C-10 | Backend mirror: `functions/src/entitlements.ts` `PLAN_FEATURES` has the same booleans and the same `maxTeamMembers` / `maxCarouselSlides` (backend field) ≡ `carouselMaxSlides` (frontend) / `batchConfig.maxAdsPerRun` per plan | Cross-module unit test that imports both and compares key values (T026a — hard-fail on import failure) |

---

## 4. Failure-mode contract

| Caller mistake | Contract response |
|---|---|
| Passing `plan: 'creator'` or `plan: 'scaling'` to any helper that takes `UserPlan` | TypeScript compile error. Runtime hits an `exhaustive-switch` default that throws `new Error('unknown_plan:' + plan)`. |
| Asking `PLANS['creator']` at runtime | Returns `undefined` — the consumer must treat this as "unknown plan" and fall through to `plan: 'none'` behaviour (mandatory billing modal). |
| Reading a Firestore `users/{uid}.plan` with legacy value | `buildBillingState()` applies the read-time map (see `data-model.md`, Entity 1). No consumer sees the legacy literal. |

---

## 5. Extension / change policy

- Adding a new plan: requires spec amendment, pricing-page sign-off, and Constitution re-check. Adds a new member to the `UserPlan` union, a new entry to `PLANS`, and parallel entries in `functions/src/entitlements.ts` and `PADDLE_PRICE_TO_PLAN`.
- Changing a numeric limit (credits, seats, saved projects, avatars, carousel cap, batch cap): requires spec update AND pricing-page update in the same PR. Tests C-04 / C-05 / C-06 / C-09 must move with the change.
- Adding a new feature gate: add to `PlanFeatures`, set booleans per plan, add parameterised test.
