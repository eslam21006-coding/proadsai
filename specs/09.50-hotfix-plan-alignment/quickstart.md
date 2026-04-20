# Quickstart — Plan Structure Alignment Hotfix

**Feature**: Plan Structure Alignment Hotfix (Phases 1–9)
**Audience**: Developer or QA reviewer validating the hotfix post-merge, pre-deploy.
**Precondition**: Branch `hotfix/plan-alignment` is checked out. `npm ci` has been run at repo root and inside `functions/`.

---

## 0. Pre-flight

From the repo root:

```bash
git status                 # should be clean except for this hotfix
npm ci                     # installs frontend deps
cd functions && npm ci     # installs backend deps
cd ..
```

---

## 1. Code hygiene — SC-001 evidence

The biggest invariant from the spec: no `creator` or `scaling` literal remains anywhere in code (Principle IX proof artefact for SC-001).

```bash
grep -rnE "\b(creator|scaling)\b" src/ functions/src/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "// legacy" \
  | grep -v "legacy_mapped"
```

**Expected output**: empty (or only the two intentional `// legacy read-time map` comments inside `functions/src/billing/billingState.ts`).

If any other hit appears, it is a blocker — fix before proceeding.

---

## 2. Type check

```bash
npm run build              # tsc + vite build for frontend
cd functions && npx tsc --noEmit
cd ..
```

**Expected**: both complete with zero errors. The `UserPlan` union narrowing will surface any stale consumers.

---

## 3. Unit + fixture tests

```bash
cd functions && npm test -- --testPathPattern="contractFixtures|billingState"
```

**Expected**: all tests pass. Specifically watch for:

- `PLANS record: exactly 4 keys (none/starter/pro/scale)` (C-01)
- `PLANS.pro.batchConfig.maxAdsPerRun === 4` and `PLANS.scale.batchConfig.maxAdsPerRun === 36` (C-04 / C-05)
- `hookAngles === 'full' on every paid plan` (C-07)
- `buildBillingState() maps legacy plan: 'creator' → 'pro'` (new fixture from HF.10)
- `buildBillingState() maps legacy plan: 'scaling' → 'scale'` (new fixture from HF.10)

---

## 4. Local smoke — Starter flow

Run frontend locally (`npm run dev`). Log in as a Starter test account.

| Check | Expected |
|---|---|
| Open Step 1, hook-angle dropdown | All 11 angles are selectable |
| Open Step 1, hook-type dropdown | All 12 types are selectable |
| Open Step 1, copywriting-strategy dropdown | All 8 strategies are selectable |
| Open Step 1, ad-tone dropdown | All 11 tones are selectable |
| Open Step 1, retargeting toggle | Shows "Upgrade to Pro" locked-state affordance |
| Open Step 1, fantasy universe selector | Shows "Upgrade to Pro" locked-state affordance |
| Open Step 1, art direction section | Shows "Upgrade to Pro" locked-state affordance |
| Open Step 1, batch toggle | Shows "Upgrade to Pro" locked-state affordance |
| Open Step 1, carousel toggle | Shows "Upgrade to Pro" locked-state affordance |
| Open Step 1, reference ad upload | Shows "Upgrade to Pro" locked-state affordance |

Evidence for SC-003.

---

## 5. Local smoke — Pro flow

Log in as a Pro test account.

| Check | Expected |
|---|---|
| Enable carousel, slide-count selector | Shows options 2 through 7 |
| Enable batch, UI label | Reads "Up to 4 ads per run" |
| Configure batch: 1 size × 2 hooks × 2 concepts | Generate button enabled (= 4 combos, at cap) |
| Configure batch: 1 size × 2 hooks × 3 concepts | UI inline error ("batch limit exceeded"), generate disabled (= 6 combos) |
| Submit a carousel request with 7 slides via callable | Backend returns success |
| Submit a carousel request with 8 slides via callable | Backend returns `carousel_limit_exceeded` error |
| Enable retargeting | No plan error; retargeting flow loads |
| Enable fantasy universe | Art direction cards switch to fantasy set |
| Upload a reference ad | Upload area accepts the file |

Evidence for SC-004.

---

## 6. Local smoke — Scale flow

Log in as a Scale test account.

| Check | Expected |
|---|---|
| Enable carousel, slide-count selector | Shows options 2 through 10 |
| Enable batch, UI label | Reads "Up to 36 ads per run" |
| Configure batch: 3 × 4 × 3 combinations | Generate button enabled (= 36 combos, at cap) |
| Configure batch: 4 sizes | UI blocks (C-05 invariant — `maxSizes: 3`) |
| Save a 101st project | Succeeds (saved-project limit is Infinity) |
| Create an 11th team invite | Blocked with `team_limit_exceeded, limit: 10` |

Evidence for SC-005.

---

## 7. Legacy-record verification

Use the Firebase console or a dev Firestore shell to seed two test user documents:

```javascript
// User A
db.collection('users').doc('test_creator_user').set({
  plan: 'creator',
  credits: 500,
  billingStatus: 'active',
  // … other required fields from existing user-doc shape
});

// User B
db.collection('users').doc('test_scaling_user').set({
  plan: 'scaling',
  credits: 4000,
  billingStatus: 'active',
});
```

Log in as each (or call `buildBillingState()` directly in a dev REPL) and assert:

- User A → `billingState.plan === 'pro'`, one `plan.legacy_mapped` log with `{ legacy: 'creator', canonical: 'pro' }`.
- User B → `billingState.plan === 'scale'`, one `plan.legacy_mapped` log with `{ legacy: 'scaling', canonical: 'scale' }`.

Evidence for SC-007.

---

## 8. Over-cap soft-grandfather verification

Seed a Pro user with `savedProjectCount: 45` (above the new 30 cap):

| Action | Expected |
|---|---|
| Load the project list | All 45 projects appear and are editable |
| Click "New Project" | Inline error: "You're already at 45/30 saved projects — delete some or upgrade to save more." Generate new-project flow is blocked. |
| Delete a project (now 44) | Still blocked. Must drop to 29 to unblock. |
| Delete down to 29 | "New Project" button is enabled again |

Evidence for the soft-grandfather clarification.

---

## 9. Paddle webhook sanity (optional, staging only)

If staging access is available, replay a historical Paddle webhook with a legacy Creator-tier price ID:

- Expected: `PADDLE_PRICE_TO_PLAN[<legacy creator price id>]` resolves to `{ plan: 'pro', credits: 2500 }`. The user's `users/{uid}.plan` is written as `'pro'` (not `'creator'`).
- Log inspection: `plan.legacy_mapped` event appears once for the webhook.

---

## 10. Sign-off checklist

- [ ] Section 1 — grep returns zero non-intentional hits
- [ ] Section 2 — frontend + backend both build cleanly
- [ ] Section 3 — fixture tests all pass
- [ ] Section 4 — Starter smoke — all 10 checks green
- [ ] Section 5 — Pro smoke — all 9 checks green
- [ ] Section 6 — Scale smoke — all 6 checks green
- [ ] Section 7 — legacy-record mapping works for both `creator` and `scaling`
- [ ] Section 8 — soft-grandfather behaves correctly
- [ ] Section 9 — (staging only) Paddle webhook replay is clean

When all ten are green, the hotfix is ready for `/speckit.tasks` → `/speckit.implement`.
