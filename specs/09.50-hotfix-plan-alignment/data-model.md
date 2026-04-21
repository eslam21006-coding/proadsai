# Phase 1 — Data Model: Plan Structure Alignment Hotfix

**Feature**: Plan Structure Alignment Hotfix (Phases 1–9)
**Date**: 2026-04-20

This hotfix does **not** introduce new Firestore collections or new document shapes. It corrects three already-shipped in-memory types and one field value normaliser. Documented below so the frontend and backend share identical expectations (Principle XI).

---

## Entity 1 — `UserPlan` (discriminated string union)

**Shape**:
```typescript
export type UserPlan = 'none' | 'starter' | 'pro' | 'scale';
```

**Semantics**:
| Value | Meaning |
|---|---|
| `'none'` | Authenticated user with no paid plan (blocked by mandatory billing modal unless a team member). |
| `'starter'` | Paid entry tier. Full creative library; no batch, no carousel, no retargeting, no fantasy, no art direction, no reference ads. |
| `'pro'` | Mid tier. Adds retargeting, fantasy, art direction, batch (4 ads/run max), carousel (7 slides max), reference ads. |
| `'scale'` | Top tier. Raises batch to 36 ads/run, carousel to 10 slides, unlimited saved projects and audience avatars. |

**Invariants**:
- The union MUST have exactly these four members in this order.
- `'creator'` and `'scaling'` MUST NOT appear in the union, in any consuming branch, or in any runtime string literal inside `src/` or `functions/src/`.
- Any serialised representation (JSON payload, Firestore field value) of a current plan MUST be one of these four strings.

**Legacy normalisation (read-time only)**:
When `buildBillingState()` reads a Firestore `users/{uid}.plan` value of `'creator'` it emits `'pro'`; a value of `'scaling'` emits `'scale'`. The raw document is not rewritten — the mapping is a property of the read path only. A structured log event (`plan.legacy_mapped`, `{ uid, legacy, canonical }`) is emitted once per session.

---

## Entity 2 — `PlanConfig` record (one object per plan)

**Shape** (TypeScript):
```typescript
interface PlanConfig {
  name: string;                          // display name, e.g. "Pro"
  monthlyCredits: number;                // 0 for 'none'
  maxTeamMembers: number;                // owner-inclusive total seats (per clarification Q1)
  savedProjectLimit: number;             // Infinity for 'scale'
  audienceAvatarLimit: number;           // Infinity for 'scale'
  carouselMaxSlides: number | null;      // null = carousel disabled
  batchConfig: BatchConfig | null;       // null = batch disabled
  features: PlanFeatures;                // boolean gates (see Entity 3)
  paddlePriceId?: {                      // optional; null for 'none'
    monthly: string;
    annual: string;
  };
}

interface BatchConfig {
  maxSizes: number;                      // UI hard cap on size picker
  maxHooks: number;                      // UI hard cap on hook picker
  maxConcepts: number;                   // UI hard cap on concept picker
  maxAdsPerRun: number;                  // backend guard = sizes × hooks × concepts ≤ this
}
```

**Authoritative values** (the entire `PLANS` record after this hotfix):

| Field | `'none'` | `'starter'` | `'pro'` | `'scale'` |
|---|---|---|---|---|
| name | "None" | "Starter" | "Pro" | "Scale" |
| monthlyCredits | 0 | 800 | 2500 | 6500 |
| maxTeamMembers | 0 | 1 | 3 | 10 |
| savedProjectLimit | 0 | 10 | 30 | `Infinity` |
| audienceAvatarLimit | 0 | 5 | 15 | `Infinity` |
| carouselMaxSlides | null | null | 7 | 10 |
| batchConfig | null | null | `{ 1, 2, 2, 4 }` | `{ 3, 4, 3, 36 }` |
| features.retargeting | false | false | true | true |
| features.fantasyUniverse | false | false | true | true |
| features.artDirection | false | false | true | true |
| features.batch | false | false | true | true |
| features.carousel | false | false | true | true |
| features.referenceAds | false | false | true | true |
| features.hookAngles | n/a | all 11 | all 11 | all 11 |
| features.hookTypes | n/a | all 12 | all 12 | all 12 |
| features.copywritingStrategies | n/a | all 8 | all 8 | all 8 |
| features.adTones | n/a | all 11 | all 11 | all 11 |

**Invariants**:
- `savedProjectLimit === Infinity` implies new-save gate is always green. Any non-Infinity limit triggers the soft-grandfather rule (FR-006).
- `maxTeamMembers === 1` implies Team page hides the invite form entirely (matches pre-hotfix Phase 6 behaviour for `maxTeamMembers <= 1`).
- `batchConfig === null` implies the Batch toggle is shown as locked with "Upgrade to Pro" on the frontend (FR-020) and `validateLaunchSurface` returns `{ allowed: false, reason: 'pro_plan_required' }` on the backend.
- `carouselMaxSlides === null` implies the same pattern for the Carousel toggle.
- `monthlyCredits`, `maxTeamMembers`, `savedProjectLimit`, `audienceAvatarLimit`, `carouselMaxSlides` MUST NOT be negative.

---

## Entity 3 — `PlanFeatures` (boolean-gate sub-object)

**Shape**:
```typescript
interface PlanFeatures {
  retargeting: boolean;
  fantasyUniverse: boolean;
  artDirection: boolean;
  batch: boolean;
  carousel: boolean;
  referenceAds: boolean;
  // ungated on every paid plan — represented as "full" rather than per-plan subsets:
  hookAngles: 'full';
  hookTypes: 'full';
  copywritingStrategies: 'full';
  adTones: 'full';
}
```

**Invariants**:
- `hookAngles`, `hookTypes`, `copywritingStrategies`, `adTones` MUST be the literal `'full'` on every paid plan (FR-010–FR-014). A per-plan array type is forbidden — it was the source of the bug this hotfix fixes.
- `retargeting`, `fantasyUniverse`, `artDirection`, `batch`, `carousel`, `referenceAds` MUST be `false` on Starter and `true` on Pro + Scale (FR-015–FR-019).

---

## Entity 4 — `EntitlementDecision` (pure-function output)

**Shape**:
```typescript
interface EntitlementDecision {
  allowed: boolean;
  reason?: EntitlementDenialReason;      // present iff allowed === false
  limit?: number;                        // present when a numeric cap applies (batch size, carousel slides, team size, saved projects, avatars)
}

type EntitlementDenialReason =
  | 'pro_plan_required'
  | 'scale_plan_required'
  | 'batch_limit_exceeded'
  | 'carousel_limit_exceeded'
  | 'team_limit_exceeded'
  | 'saved_project_limit_exceeded'
  | 'avatar_limit_exceeded'
  | 'plan_none';
```

**Semantics**:
- `resolveEntitlement({ plan, feature, quantity? })` is the single authoritative gate. Both the frontend locked-state UI and the backend `validateLaunchSurface` / request handlers call it.
- A `quantity` is required for numeric-cap features (batch, carousel, team invite, saved project save, avatar create); ignored otherwise.
- For a quantity-based feature, `allowed: false` with `limit: N` tells the UI the ceiling so it can display the exact number in the "You're at N/M" message.

**Invariants**:
- Never throws. Always returns a decision.
- Pure; no Firestore reads, no network calls.
- For `plan: 'none'`, every gated feature returns `{ allowed: false, reason: 'plan_none' }` — the mandatory-billing modal is the only recovery.

---

## Entity 5 — `UserBillingState` (frontend-visible resolved state)

**Shape** (the pre-hotfix interface continues unchanged apart from the `plan` field's type narrowing):
```typescript
interface UserBillingState {
  plan: UserPlan;                        // tightened to 4-member union
  credits: number;
  billingStatus: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'none';
  // … team fields from Phase 9, unchanged:
  isTeamOwner: boolean;
  isTeamMember: boolean;
  teamOwnerUid?: string;
  teamOwnerName?: string;
  teamMemberCount: number;
  teamOpenInvites: number;
  maxTeamMembers: number;                // owner-inclusive (per clarification Q1)
  // … rest unchanged
}
```

**State transitions relevant to this hotfix**:
| Before hotfix | After hotfix (read-time) |
|---|---|
| `{ plan: 'creator', … }` stored in Firestore | Emitted as `{ plan: 'pro', … }` to all consumers |
| `{ plan: 'scaling', … }` stored in Firestore | Emitted as `{ plan: 'scale', … }` to all consumers |
| `{ plan: 'starter' \| 'pro', … }` | Unchanged |

No write-back is performed; legacy documents remain as-is in Firestore until either (a) a Paddle webhook updates them to a canonical plan value, or (b) a future migration script sweeps them.

---

## Relationship diagram

```
[Firestore users/{uid}]
        │  (raw document, may contain legacy plan value)
        ▼
[functions/src/billing/billingState.ts: buildBillingState()]
        │  ← legacy read-time map applied here
        ▼
[UserBillingState]  ──────────────────────►  [Frontend: useBillingState()]
        │                                             │
        └─►  [PlanConfig (PLANS[billingState.plan])]  │
                     │                                │
                     ▼                                ▼
            [PlanFeatures]                   [InputForm UI gates]
                     │
                     ▼
            [resolveEntitlement(plan, feature, quantity?)]
                     │
                     ▼
            [EntitlementDecision] ──► backend validateLaunchSurface + frontend locked-state
```

---

## Out of model

- New Firestore collections: **none**.
- New document fields: **none**.
- Paddle webhook payload shape: **unchanged** (price-ID normalisation happens in `paddleClient.ts` mapping, not at the webhook contract).
