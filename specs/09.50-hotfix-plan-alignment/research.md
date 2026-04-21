# Phase 0 — Research: Plan Structure Alignment Hotfix

**Feature**: Plan Structure Alignment Hotfix (Phases 1–9)
**Date**: 2026-04-20
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/LAUNCH_MATRIX.md` HF.1–HF.10 (lines 1248–1263)

This document captures the handful of decisions that had to be resolved before implementation could start. The spec already pinned scope and numeric limits; research focused on (a) *how* legacy data is bridged, (b) which existing files are authoritative seams, and (c) where the 4-plan assumption leaks beyond the ten tasks listed in HF.1–HF.10.

---

## Decision 1 — Legacy-record handling for `plan: 'creator'` and `plan: 'scaling'`

**Decision**: Read-time mapping in `functions/src/billing/billingState.ts`'s `buildBillingState()`. When the raw `users/{uid}.plan` field equals `'creator'`, emit `pro`; when it equals `'scaling'`, emit `scale`. Log a structured event (`plan.legacy_mapped`) with the old and new values so the incidence rate is observable. No background migration job is scheduled for launch.

**Rationale**:
- The `users/{uid}` document already has a single read path in `buildBillingState()`; inserting a 4-line `switch` there bridges every legacy record without touching any consumer.
- Principle VIII (Cost Discipline) — a read-time constant-time comparison costs nothing; a batch-migration Cloud Function would spin through N users for a pre-launch codebase with near-zero users, which is wasted effort.
- Principle VI (Auditable Hidden Layers) is satisfied by the structured log — ops can `gcloud logging read` for `jsonPayload.event="plan.legacy_mapped"` to see how many legacy records remain.
- Clarifications session Q1 already pinned this choice.

**Alternatives considered**:
- *One-off migration script* (`functions/src/migrations/02_legacy_plan_rename.ts`): Rejected for launch. Can be added later if `plan.legacy_mapped` log volume remains >0 after 30 days post-launch.
- *Both (read-time map + background backfill)*: Rejected — unnecessary complexity for a pre-launch codebase.

---

## Decision 2 — Paddle price-ID normalisation

**Decision**: `functions/src/paddle/paddleClient.ts`'s `PADDLE_PRICE_TO_PLAN` map has 8 legacy entries (4 for Creator monthly/annual/trial, 4 for Scaling monthly/annual). Remap each Creator price ID's value from `{ plan: 'creator', credits: 1000 }` to `{ plan: 'pro', credits: 2500 }`. Remap each Scaling price ID's value to `{ plan: 'scale', credits: 6500 }`. Keep the price IDs themselves — Paddle-side dashboard cleanup is an ops follow-up (spec Assumptions).

**Rationale**:
- Any historical webhook replay (Paddle re-sends up to 30 days) with a legacy price ID must resolve to a working plan today. Remapping in code is the shortest path.
- Credits values jump up (1000 → 2500 for Creator customers, 5000 → 6500 for Scaling customers) — this is favourable to any legacy customer, so no downgrade complaint is possible.
- Principle XI — frontend checkout URLs (`creator_monthly` etc. in `App.tsx`) are deleted; backend price-ID mapping is the last-line remap for ghost webhooks.

**Alternatives considered**:
- *Drop legacy price IDs entirely*: Rejected. A Paddle replay or late webhook would silently fail the webhook idempotency check and the user would be stuck.
- *Reject legacy price IDs with an error*: Rejected — same problem.

---

## Decision 3 — Batch sub-limit enforcement semantics

**Decision**: `batchConfig` on Pro is `{ maxSizes: 1, maxHooks: 2, maxConcepts: 2, maxAdsPerRun: 4 }`. On Scale, `{ maxSizes: 3, maxHooks: 4, maxConcepts: 3, maxAdsPerRun: 36 }`. The UI enforces the three sub-caps (`maxSizes` / `maxHooks` / `maxConcepts`) as hard limits on individual selectors; the backend enforces `maxAdsPerRun` as the final ceiling (total combinations = sizes × hooks × concepts). Starter has `batchConfig: null` — batch is unavailable.

**Rationale**:
- Matches HF.1 ("`batchConfig` per plan: Pro `{ maxSizes: 1, maxHooks: 2, maxConcepts: 2, maxAdsPerRun: 4 }`") and HF.6 ("Pro user requesting 5 batch combos gets rejected").
- Having both sub-caps and a product cap means the UI can give precise in-control feedback ("You can pick 2 hooks on Pro") while the backend has a cheap single-number guard (`maxAdsPerRun`).
- Principle XI — UI and backend share `planconfig.ts`'s `batchConfig` via a shared type; no duplication.

**Alternatives considered**:
- *Only `maxAdsPerRun`, let the user choose any combination*: Rejected — lets a Pro user pick 4 sizes × 1 hook × 1 concept (= 4 combos, within cap) but undermines the structural guidance in the pricing copy.
- *Only sub-caps, no `maxAdsPerRun`*: Rejected — backend needs a single scalar guard to reject malformed client requests.

---

## Decision 4 — Hook-angle / hook-type / strategy / tone un-gating

**Decision**: Delete all per-plan filtering functions (`getAvailableHookAngles(plan)` and equivalents) and their call sites. All four lists become plain exports consumed directly by `InputForm.tsx`. Plan-tier no longer affects these selectors.

**Rationale**:
- HF.2 and HF.4 are explicit: "show all 11 for all plans", "show all 12 for all plans", etc.
- The creative engine is the product's core value; starving Starter users of options was a legacy decision being reversed because it suppressed first-generation quality and hurt conversion.
- Principle II (The Selected Mode MUST Be Obeyed) — if a Starter user wants the "hard sell" tone and the pricing page implies all tones are available, the selector must show it.

**Alternatives considered**:
- *Keep the filter function, just pass a constant list on every plan*: Rejected — dead code is a landmine. If a future plan tier re-introduces filtering, re-implement from scratch rather than leaving a vestigial wrapper.

---

## Decision 5 — Scope creep beyond the ten HF tasks

**Decision**: Three files referenced in LAUNCH_MATRIX HF.1–HF.10 turned out to have companion files that also carry legacy literals. These are **in scope** as direct dependencies of the named tasks:

| Named task | Named file | Companion file also touched |
|---|---|---|
| HF.9 | `functions/src/index.ts` | `functions/src/billing/billingState.ts` (PLAN_CREDITS, PLAN_HIERARCHY), `functions/src/paddle/paddleClient.ts` (PLAN_CREDITS, PADDLE_PRICE_TO_PLAN) |
| HF.8 | `src/types.ts`, `src/store.ts` | `src/App.tsx` (checkout URL keys, plan arrays, hierarchy comparisons — ~14 refs) |
| HF.4 | `src/components/InputForm.tsx` | `src/components/PricingTable.tsx` (PLANS_CONFIG, UI tier labels, feature-row sections) |

**Rationale**: SC-001 ("a repo-wide text search for `creator` / `scaling` returns zero plan-related hits") is impossible without touching these companion files. The ten HF tasks are the *plan structure*; the companion files are where the same literals escaped and must be cleaned up to satisfy the success criterion.

**Alternatives considered**:
- *Ship HF.1–HF.10 only and leave companion files for a follow-up*: Rejected — SC-001 would fail, and the `UserPlan` type union is re-exported everywhere; a single stray `'creator' | 'scaling'` entry would break TypeScript compile across the entire frontend.

---

## File audit — where legacy literals live today

Sourced from a fresh codebase scan; totals 70+ references across 12 files.

| File | `creator` refs | `scaling` refs | Role |
|---|---|---|---|
| `src/planconfig.ts` | L13, L163–172 | L13, L183–192 | UserPlan union + PLANS record |
| `src/types.ts` | — | — | Re-exports `UserPlan` |
| `src/store.ts` | — | — | Zustand `userPlan: UserPlan` field |
| `src/App.tsx` | L1650–1651, L2379–2380, L2564, L7642, L7661, L7784–7786 | L456, L501, L1654–1655, L2564, L7642, L7661, L7784–7786 | Checkout URLs, plan arrays, hierarchy |
| `src/components/InputForm.tsx` | — | — | Per-plan UI slicing (hooks/tones/strategies) |
| `src/components/PricingTable.tsx` | L24 | L15, L26, L71–75, L93 | SECTIONS array, PLANS_CONFIG, feature rows |
| `functions/src/entitlements.ts` | L28, L104–130, L221 | L28, L160–190, L223 | `BasePlan` type, PLAN_FEATURES, PLAN_CREDITS |
| `functions/src/creativeResolver.ts` | (indirect via plan hierarchy) | (indirect) | `validateLaunchSurface()` plan-tier guard |
| `functions/src/generators.ts` | — | — | Batch/carousel cap enforcement (hardcoded) |
| `functions/src/index.ts` | L56–90, L338, L343, L1147–1156, L2116 | L60, L65, L73–75, L89–90, L338, L343, L2116 | PLAN_NAMES, PLAN_LIMITS, PLAN_TEAM_LIMITS |
| `functions/src/billing/billingState.ts` | L55, L65 | L57, L67, L111 | PLAN_CREDITS, PLAN_HIERARCHY |
| `functions/src/billing/__tests__/billingState.test.ts` | L78–87, L168, L252–259 | L93–104, L325–330 | 6 creator + 4 scaling fixtures |
| `functions/src/paddle/paddleClient.ts` | L11, L60–61 | L13, L64–65 | PLAN_CREDITS, PADDLE_PRICE_TO_PLAN |
| `functions/src/contractFixtures.test.ts` | (creator fixtures) | (scaling fixtures) | Plan-gated contract tests |

**Current `UserPlan` type union (to be rewritten)**:
```typescript
// src/planconfig.ts line 13
export type UserPlan = 'starter' | 'creator' | 'pro' | 'scaling' | 'none';
```

**Target `UserPlan` type union**:
```typescript
export type UserPlan = 'none' | 'starter' | 'pro' | 'scale';
```

---

## Summary

All NEEDS CLARIFICATION markers from Technical Context are resolved. Five decisions recorded. One companion-file scope-expansion is documented and justified against SC-001. Ready for Phase 1 (data-model, contracts, quickstart).
