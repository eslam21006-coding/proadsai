# Batch 05 — Phase 5 US7 (Incomplete records gate safely) Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 5 (User Story 7 — Incomplete records gate safely, owner not pushed, P1)
**Tasks delivered**: T030, T031, T032, T033, T034, T035, T036, T037, T038 (9/9)
**Status**: ✅ PASS. All P1 stories complete. Branch is now safely deployable.
**Date**: 2026-08-31

---

## 1. Pre-section — answers to the three Phase 4 carry-over items

These were resolved before any Phase 5 code was written.

### 1.1 — Item A: `htoConversionRate` is NOT required on `paid_event`

**Decision**: `htoConversionRate` is **NOT** part of the `paid_event` completeness rule. It is retained on `paid_event` for additive storage compatibility (data-model.md §1) but the corrected formula reads `eventAttendanceRate × eventCloseRate` instead (FR-011..FR-014). Requiring it would:

1. Force the owner to fill a field that changes nothing.
2. Keep the attention badge lit on an otherwise-complete record (FR-039, FR-049).

**Asymmetric by design:**

| Field | `paid_event` | `paid_product` |
|---|---|---|
| `htoPrice` (when `hasHto`) | required | required |
| `htoConversionRate` (when `hasHto`) | **NOT required** (stored-but-unread) | required (FR-019) |

This asymmetry is recorded in `data-model.md` §3.1 (the new `Item A decision` subsection).

**Code changes that fix the bug:**

1. `functions/src/funnelSettings.ts` — `assertRequiredFieldPresent` paid_event branch: removed `htoConversionRate` from the required-field set. The save-side validator at line ~426 calls `assertRequiredFieldPresent(req.funnelType, "htoConversionRate", req.htoConversionRate)` only when `req.funnelType === "paid_product"`. (Phase 2's validator incorrectly listed `htoConversionRate` on paid_event; this fixes the bug.)
2. `functions/src/__tests__/funnelSettings.contract.test.ts` — test 8 flipped from "throws" to "does NOT throw"; new test 9 added asserting paid_product DOES throw when `htoConversionRate` is missing (the asymmetry is now contract-tested at both ends).
3. The helper `assertRequiredFieldsPresent` inside the test file mirrors the production asymmetry.
4. `functions/src/cpaEconomics.ts` — `requiredFieldsForDoc` (T030's canonical helper) lists `htoConversionRate` for `paid_product` when `hasHto` but NOT for `paid_event`.

### 1.2 — Item B: realistic paid_event fixture pinning target stability

New test added at `cpaEconomics.test.ts` (test 24): `Item B: paid_event realistic ($24/$3000/75%/7.5%/ROAS 0.5) — effectiveTargetCpa = $48 at every margin row`.

**Arithmetic (verified by user):**

```
rawTargetCpa   = aov / roasTarget = 24 / 0.5         = 48    (independent of marginKept)
fullBuyerValue = 24 + 3000 × 0.9 × 0.75 × 0.075     = 175.875
spendShare(50) = 0.50 ⇒ maxCpa = 175.875 × 0.50    = 87.94 ⇒ min(48, 87.94) = 48
spendShare(60) = 0.40 ⇒ maxCpa = 175.875 × 0.40    = 70.35 ⇒ min(48, 70.35) = 48
spendShare(70) = 0.30 ⇒ maxCpa = 175.875 × 0.30    = 52.76 ⇒ min(48, 52.76) = 48
```

Effective = `$48` at every margin row. `capApplied = false` at every margin row (raw 48 < max 52.76).

**The min() logic is NOT changed.** The contract is that for this input class the ROAS path wins uniformly and the margin selector does not move the paid_event target. **Carry-forward into Phase 9 (T046–T048): the results-card explainer must tell a paid_event owner which path is active and why their margin choice is not moving the number.**

### 1.3 — Item C: AGENTS.md 0b runs LAST, after every test the batch adds

The audit method was re-specified. The check now reads:

> The check runs LAST, after every test the batch adds — re-run the full sweep, then walk the FINAL list of names against the FINAL list of test sources. Partial-state walks miss names added after the audit runs and miss the contradiction they encode (Phase 5 Item C: the 64 vs 73 vs 75 drift).

This batch added **9 new tests** (T033 completeness fixtures). Total state walked: **84 names across both files** (54 cpaEconomics + 30 funnelSettings). All 84 names match their bodies (audit table in §5.4).

---

## 2. Phase 5 scope (T030–T038)

Files modified:

- `functions/src/cpaEconomics.ts` — no change (Phase 2 already covered everything Phase 5 needs in this module)
- `functions/src/funnelSettings.ts` — T030 (`isSettingsComplete` + `missingRequiredFields` + canonical helper `requiredFieldsForDoc`); T031 (`complete: boolean` on `getFunnelSettings` + delete `buildFunnelInputsFromDoc` per the strengthened criterion); T032 (save path now uses `missingRequiredFields` to collect ALL missing fields in one error)
- `functions/src/__tests__/funnelSettings.contract.test.ts` — T033 (9 completeness contract tests); Item A test fix (8 flipped to "does NOT throw"; 9 added asserting paid_product DOES throw)
- `functions/src/metaSync/shared.ts` — T037 (one-line-per-account structured log via `missingRequiredFields` + `isSettingsComplete`; bounded change approved by plan.md F3 / R-1)
- `src/App.tsx` — T034 (`funnelSettingsComplete` state read in the existing probe); T035 (`MenuItem` `badge` prop + dot on funnel settings entry); T036 (auto-open effect verified to key off `funnelSettingsHasDoc` only)
- `src/components/FunnelSettingsForm.tsx` — T038 (paused-targets banner + per-field `Required` markers; `missingFields` useMemo mirroring the backend rule)

Files explicitly NOT modified:

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist`, `scripts/sc11Guard.mjs` — Phase 1, out of scope
- `functions/src/metaSync/shared.ts` beyond the FR-042 log block (plan F3 bounded change; no logic change to the verdict flow)
- Any Phase 6+ file

---

## 3. What changed

### T030 — completeness predicate

`funnelSettings.ts` gains two exported helpers and one private helper, all derived from `data-model.md` §3:

```ts
type FunnelSettingsLike = { ... }; // structural — every required field, nullable

function requiredFieldsForDoc(funnelType, hasHto): ReadonlyArray<keyof FunnelSettingsLike> {
    // closed enum per funnel type; hasHto=true/false branches where applicable.
    // paid_event does NOT require htoConversionRate (Item A).
    // paid_product DOES require htoConversionRate when hasHto=true (FR-019).
}

export function missingRequiredFields(doc): ReadonlyArray<string>; // FR-049, FR-050

export function isSettingsComplete(doc): boolean;                  // FR-039, FR-050
```

This is the **single canonical definition** of completeness (FR-050). Every consumer — `getFunnelSettings` response, save-path validator, observability log, frontend parity test (T058) — must use this exact helper. Two independent implementations of "complete" MUST NOT exist.

### T031 — `complete: boolean` on the response + helper deletion

`getFunnelSettings` now returns:

```ts
// No record:
return { ok: true, settings: null, complete: false, reviewDue: false };

// Existing record (complete or incomplete):
const complete = isSettingsComplete(doc);
return { ok: true, settings: doc, complete, reviewDue };
```

FR-043: an incomplete record is **always returned when it exists**; `settings: null` is reserved for absence. FR-049: completeness is a separate signal from existence.

`buildFunnelInputsFromDoc` is **deleted outright** per the strengthened criterion (no "or throw" alternative — a dead helper that throws is still a dead helper that can be wired up later). Verified via `grep -r "buildFunnelInputsFromDoc" functions/src` → zero matches.

### T032 — reject incomplete saves, naming every missing field

Save path now uses `missingRequiredFields(req)` once and throws with all fields:

```
incomplete save for lead_magnet_call: missing [leadToCloseRate, bookingRate, showUpRate, commissionRate, marginKept]
```

FR-040a — names **every** missing field in a single error message.

### T033 — completeness + `complete`-flag contract tests

9 new tests (22–30) covering:
- paid_event with all required fields present ⇒ complete
- paid_event missing eventAttendanceRate ⇒ incomplete, lists the field
- paid_event with hasHto=false ⇒ htoPrice drops from required set
- paid_product requires htoConversionRate when hasHto=true (FR-019)
- paid_event does NOT require htoConversionRate even when hasHto=true (Item A)
- numeric 0 is COMPLETE, not missing
- free_webinar missing offerPrice ⇒ incomplete
- lead_magnet_call missing bookingRate ⇒ incomplete
- multiple missing fields reported in one error (FR-040a)

### T034 — `complete` flag read in App.tsx probe

The existing probe at `:4270-4290` (now slightly shifted due to surrounding edits) reads the new `complete` field from the response and stores it in `funnelSettingsComplete` state. The prop is forwarded through both `<MenuSidebar>` invocations to drive the badge.

### T035 — passive attention marker (badge)

`MenuItem` accepts an optional `badge?: boolean` and `badgeLabel?: string`. When `badge` is true, a small amber dot renders to the right of the label with the accessible label.

The funnel-settings menu entry renders with `badge={!funnelSettingsComplete}` and an inline `badgeLabel="Your funnel settings need updating"`. Phase 9 (T057) moves this string into `i18n.tsx` as `funnel.needs_attention` per contracts/uiCopy.md §4 — for now it's inlined in the MenuItem call site.

**No modal, no redirect, no click behaviour change** (FR-051, FR-044). The click handler is unchanged; the dot is purely visual.

### T036 — auto-open / reviewDue NOT wired to `complete`

Verified by reading the existing effect at line 4413-4424:

```ts
useEffect(() => {
    if (
        metaConnection?.connected &&
        activeWorkspaceId &&
        activeMetaAccountId &&
        funnelSettingsHasDoc === false &&   // ← keyed on EXISTENCE
        !showFunnelSettingsModal &&
        !funnelFirstRunDismissed
    ) {
        openFunnelSettings(true);
    }
}, [..., funnelSettingsHasDoc, ...]);
```

`funnelSettingsComplete` is NOT in the dependency list and NOT in the condition. An incomplete record (existing doc, incomplete fields) does **not** auto-open the form. FR-053 satisfied.

`reviewDue` continues to key off `lastReviewedAt + REVIEW_CADENCE_MS` (data-model.md §3; not touched).

### T037 — observability log

`metaSync/shared.ts` emits one log line per account per sync (FR-042, contracts/funnelSettings.md §6):

```ts
// Once per account, inside the existing runSyncForAccount scope:
const missing = missingRequiredFields(data);
if (missing.length > 0) {
    const funnelType = typeof data.funnelType === "string" ? data.funnelType : "unknown";
    console.warn(
        `funnel_settings_incomplete  workspaceId=${workspaceId} accountId=${accountId} funnelType=${funnelType} missing=[${missing.join(",")}]`,
    );
}
```

Defensive fallback (a no-missing-field but still incomplete doc) logs with `missing=[unknown]`. **The change is bounded**: only the FR-042 log block + 2 import lines + 1 type cast widening (was `{ derived?: unknown }`, now `Record<string, unknown>`). No logic change to the verdict flow or the `?? Infinity` coercion at line 839.

This fires for every pre-phase doc (which is incomplete by definition — missing `commissionRate` and `marginKept`) and for any partially-saved new record.

### T038 — missing-field marking + paused-targets notice

`FunnelSettingsForm.tsx`:

1. New `missingFields` `useMemo` mirrors the backend rule client-side (T058 parity test locks the two in lockstep). Reads the same set of fields.
2. Banner at the top of the form when `missingFields.length > 0`:
   ```
   Targets are paused until you fill the fields below.
   Missing N field(s): aov, roasTarget, commissionRate, ...
   ```
3. Each `NumberField` accepts a `required?: boolean` prop that renders `(Required)` next to the label in amber. Wired into every funnel-branch field.

The `eventAttendanceRate` / `eventCloseRate` fields are added in Phase 6 (T045); the missingFields set will include them automatically once the form gains those inputs.

---

## 4. Test outcomes (raw command output)

### 4.1 `npm run test:guard`

```
# tests 22
# pass 22
# fail 0
```

22/22 pass.

### 4.2 `node scripts/sc11Guard.mjs`

```
sc11-guard: 0 per-line suppressions applied.
sc11-guard: PASS — 81 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

PASS/0. Phase 5 form additions did not introduce a hit.

### 4.3 `node lib/__tests__/cpaEconomics.test.js`

```
ok 1 - constants — ECONOMICS_VERSION = 2 (R-1, FR-041)
ok 2 - constants — LOW_VALUE_TARGET_THRESHOLD = 0.50 (FR-028)
ok 3 - constants — LOW_VALUE_THRESHOLD = 9 (legacy price-based — removed in Phase 8 T049)
ok 4 - spendShare — 50/60/70 map to 0.50/0.40/0.30
ok 5 - netFactor — 0/10/100 map to 1.00/0.90/0.00
ok 6 - paid_event: AOV $43 + HTO $3500 @ 75% attend, 7.5% close + ROAS 1.0
ok 7 - paid_event: ROAS 0.5 path — cap warning fires when raw exceeds maxCpa
ok 8 - paid_event: no HTO + ROAS 1.0 — fullBuyerValue collapses to AOV
ok 9 - paid_event: commissionRate 100 zeroes netFactor → HTO term 0 → fullBuyerValue = AOV
ok 10 - paid_product: netFactor on HTO term only — OQ-1 override (FR-019)
ok 11 - paid: equality raw == max → NO warn (FR-003)
ok 12 - lead_magnet_call report §6.1: marginKept 50 ⇒ $15.95
ok 13 - lead_magnet_call report §6.1: marginKept 60 (default) ⇒ $12.76
ok 14 - lead_magnet_call report §6.1: marginKept 70 ⇒ $9.57
ok 15 - T026: lead_magnet_call marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)
ok 16 - T026: lead_magnet_call marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)
ok 17 - T026: free_webinar marginKept 60→50 ⇒ effectiveTargetCpl × 1.25 (SC-005)
ok 18 - T026: free_webinar marginKept 60→70 ⇒ effectiveTargetCpl × 0.75 (SC-005)
ok 19 - T026: paid_event maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)
ok 20 - T026: paid_event maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)
ok 21 - T026: paid_product maxCpa marginKept 60→50 ⇒ × 1.25 (SC-005)
ok 22 - T026: paid_product maxCpa marginKept 60→70 ⇒ × 0.75 (SC-005)
ok 23 - T026: paid_event ROAS-path-driven effectiveTargetCpa does NOT move with marginKept (SC-005)
ok 24 - Item B: paid_event realistic ($24/$3000/75%/7.5%/ROAS 0.5) — effectiveTargetCpa = $48 at every margin row
ok 25 - lead_magnet_call regression anchor: pre-phase $630 target is gone (T021, constitution IX)
ok 26 - free_webinar: $3000 × 25% × 2% × 0.90 netFactor × 0.40 spendShare → leadValue $13.50, target $5.40 (FR-008)
ok 27 - free_webinar: $997 × 40% × 8% × 0.90 netFactor × 0.40 spendShare → leadValue $28.71, target $11.49
ok 28 - paid_event: ROAS 0.65 (invest-a-bit) works
ok 29 - paid_event: invalid ROAS (e.g. 0.75) throws
ok 30 - paid_event: negative AOV throws
ok 31 - paid_event: NaN htoConversionRate throws
ok 32 - paid_event: htoConversionRate > 100 throws (percentage range cap)
ok 33 - paid_event: commissionRate > 100 throws (FR-027)
ok 34 - paid_event: commissionRate < 0 throws
ok 35 - paid_event: marginKept outside closed enum throws (FR-026)
ok 36 - free_webinar: attendanceRate > 100 throws (percentage range cap)
ok 37 - lead_magnet_call: leadToCloseRate > 100 throws (percentage range cap)
ok 38 - deriveAll — paid_event dispatches to deriveTargetCpa + stamps economicsVersion
ok 39 - deriveAll — lead_magnet_call dispatches to deriveTargetCplLeadMagnetCall + stamps economicsVersion
ok 40 - deriveAll — free_webinar dispatches to deriveTargetCplFreeWebinar + stamps economicsVersion
ok 41 - computeAdvisories — paid + hasHto=false → noHto=true
ok 42 - computeAdvisories — paid + aov=$5 → lowValue silent (keys off computed target, NOT aov) (FR-028)
ok 43 - computeAdvisories — paid no-HTO + aov=$5 + tight margin → lowValue FALSE (computed target $1.50 ≥ $0.50)
ok 44 - computeAdvisories — paid no-HTO + aov=$1 + tight margin → lowValue TRUE (computed target < 0.50)
ok 45 - computeAdvisories — free_webinar + tiny offerPrice → lowValue=true, noHto=false
ok 46 - computeAdvisories — free + offerPrice=$1000 + reasonable rates → no advisories
ok 47 - computeAdvisories — target STILL calculated when an advisory fires (non-blocking)
ok 48 - getEffectiveTarget — paid → CPA
ok 49 - getEffectiveTarget — free → CPL
ok 50 - getEffectiveTarget — stamped payload returns the target (T018 row 1)
ok 51 - getEffectiveTarget — UNSTAMPED payload returns null — pre-phase production shape (T018 row 2, load-bearing)
ok 52 - getEffectiveTarget — version 1 (legacy) returns null (T018 row 3)
ok 53 - getEffectiveTarget — stamped payload with no branch returns null (T018 row 4)
ok 54 - getEffectiveTarget — every deriveAll path stamps economicsVersion: 2 (T015 invariant)
1..54
# tests 54
# pass 54
# fail 0
```

**54/54 pass.**

### 4.4 `node lib/__tests__/funnelSettings.contract.test.js`

```
ok 1 - contract — paid_event: AOV $43 + HTO $3500 + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning
ok 2 - contract — paid_event: same inputs + ROAS 0.5 → cap silent, effective follows raw
ok 3 - contract — paid_event: ROAS 0.5 + tight margin → cap fires, effective follows max
ok 4 - contract — paid_event: equality (raw == max) does NOT warn (FR-003)
ok 5 - contract — paid_event missing AOV → callable throws invalid-argument
ok 6 - contract — paid_event with numeric 0 AOV → derivation accepts 0 silently (server does NOT throw)
ok 7 - contract — paid_event with hasHto=true but missing htoPrice → throws
ok 8 - contract — paid_event with hasHto=true and missing htoConversionRate → does NOT throw (FR-011..FR-014, data-model.md §3)
ok 9 - contract — paid_product with hasHto=true and missing htoConversionRate → throws (FR-019)
ok 10 - contract — free_webinar missing attendanceRate → callable throws invalid-argument
ok 11 - contract — free_webinar missing buyRateFromAttendees → throws
ok 12 - contract — lead_magnet_call missing leadToCloseRate → throws
ok 13 - contract — free_webinar with numeric 0 attendanceRate → derivation accepts 0 silently (server does NOT throw)
ok 14 - contract — negative inputs ALWAYS throw (validation independent of missing-field defaulting)
ok 15 - contract — funnelType invalid string → coercion throws (invalid-argument at callable)
ok 16 - contract — paid no-HTO → advisories.noHto=true
ok 17 - contract — lowValue advisory keys off COMPUTED target (T017a / FR-028)
ok 18 - contract — reviewDueAt = clientNowMs + 30 days
ok 19 - contract — paid derived carries rawTargetCpa / fullBuyerValue / maxCpa / effectiveTargetCpa / capApplied
ok 20 - contract — free derived carries leadValue / economicCeilingCpl / effectiveTargetCpl
ok 21 - contract — FunnelSettingsDoc schemaVersion is the literal 1 (not a code-path artifact)
ok 22 - completeness — paid_event with all required fields present ⇒ isSettingsComplete=true
ok 23 - completeness — paid_event missing eventAttendanceRate ⇒ incomplete, lists the field
ok 24 - completeness — paid_event with hasHto=false ⇒ htoPrice drops from required set
ok 25 - completeness — paid_product requires htoConversionRate when hasHto=true (FR-019)
ok 26 - completeness — paid_event does NOT require htoConversionRate even when hasHto=true (Item A decision)
ok 27 - completeness — numeric 0 is COMPLETE, not missing (data-model.md §3)
ok 28 - completeness — free_webinar missing offerPrice ⇒ incomplete
ok 29 - completeness — lead_magnet_call missing bookingRate ⇒ incomplete
ok 30 - completeness — multiple missing fields reported in one error (FR-040a)
1..30
# tests 30
# pass 30
# fail 0
```

**30/30 pass.** (Was 21 in Phase 4; +9 from T033 completeness fixtures; 1 flipped (test 8) + 1 added (test 9) for Item A.)

### 4.5 `npm run test:phase14` (full Phase 14 sweep)

```
# tests 18 — pass 18 — fail 0    (targetingContext)
# tests 11 — pass 11 — fail 0    (campaignObjective)
# tests 12 — pass 12 — fail 0    (canonicalAngle)
# tests 54 — pass 54 — fail 0    (cpaEconomics)
# tests 30 — pass 30 — fail 0    (funnelSettings)        ← Phase 5 lands here
# tests 15 — pass 15 — fail 0    (tokenCrypto)
# tests 28 — pass 28 — fail 0    (perceptualHash)
# tests 2  — pass 2  — fail 0    (fingerprintAccuracy)
# tests 16 — pass 16 — fail 0    (metaGraph)
# tests 17 — pass 17 — fail 0    (metaSync)
# tests 37 — pass 37 — fail 0    (qararEngine)
# tests 19 — pass 19 — fail 0    (learningAggregates)
# tests 5  — pass 5  — fail 0    (learningIntegration)
# tests 12 — pass 12 — fail 0    (imageMatching)
```

**276 tests across 14 files; 276 pass, 0 fail.** (Was 265 in Phase 4; +11 from this batch: 1 cpaEconomics Item B fixture + 10 funnelSettings contract — 1 Item A asymmetry test + 9 T033 completeness tests. NOTE: the previous draft of this section reported "275/275" and "+9"; both numbers were off by 1. Corrected here per Item C of the user review.)

### 4.6 Frontend typecheck

`npx tsc -b` exits 0.

### 4.7 AGENTS.md 0b audit (LAST, after every test this batch adds)

84 names walked across both test files (54 + 30). Each name's directional claim matched the assertion(s). No contradictions.

---

## 5. US7 independent-test outcome

Per Phase 5 §3 plan: "A workspace with a pre-existing record and pre-existing aggregates completes a sync writing zero pass/fail verdicts and changing zero aggregates, while the badge shows and no modal self-opens."

The local-verifiable parts of that test:

- **`getFunnelSettings` returns the record itself when incomplete** — verified by FR-043 + the `isSettingsComplete` contract test 22 (paid_event complete) + test 23 (paid_event incomplete) + the production code path that always returns the doc when it exists.
- **Badge shows for incomplete records** — verified by T034 (state read) + T035 (MenuItem badge prop renders when `!funnelSettingsComplete`).
- **No modal self-opens** — verified by T036 (auto-open effect conditions on `funnelSettingsHasDoc === false` only; an incomplete record has `funnelSettingsHasDoc = true`).
- **Sync writes zero pass/fail verdicts** — verified by the unchanged verdict flow: `getEffectiveTarget` returns `null` for unstamped pre-phase docs (R-1); `qararEngine.evaluateVerdict` returns ⏳ with the existing `REASON_DATA_GATE_FUNNEL_MISSING`; no verdict counts reach the learning aggregates (FR-046).
- **Sync emits one log line per account** — verified by T037 (FR-042, contracts/funnelSettings.md §6).

The post-deploy verification (T064) requires a workspace with a pre-existing record + pre-existing aggregates. That runs in a deployed environment, not locally — the unit tests above cover the logic.

---

## 6. Deviations from the plan

Three judgement calls worth recording:

1. **Item A asymmetry was a Phase 2 bug, not just a Phase 5 design decision.** The Phase 2 production `assertRequiredFieldPresent` validator incorrectly listed `htoConversionRate` as required for `paid_event`. Phase 5 fixed the validator to match the contract. Recorded in data-model.md §3.1.
2. **Frontend `missingFields` is a separate implementation** of the backend rule. T058 (Phase 10) adds the parity test that locks the two in lockstep. The Phase 5 frontend mirrors the backend rule exactly as specified in `data-model.md` §3 + the Item A decision; the parity test will catch any drift.
3. **Badge string is inlined in the MenuItem call site** rather than threaded through i18n.tsx. Phase 9 (T057) moves it to `i18n.tsx` as `funnel.needs_attention`. The form's paused-targets notice uses the inline bilingual string via `L()`. **The "(Required)" marker in `NumberField` was originally keyed off `isDarkMode` — this was a bug (theme flag, not language flag). Corrected in this post-review cycle to use `lang` from `useT()` threaded through every `<NumberField>` call site (11 sites).**

No other deviations.

---

## 7. Risks remaining at the end of Phase 5

- **Backend deploy required for `getFunnelSettings.complete` to be populated** — pre-Phase-5 backend doesn't return the field. Frontend falls back to "no record ⇒ not incomplete" so the badge stays silent during rollout. No frontend error.
- **Phase 9 carries T046–T048** — the dual-path results-card explainer must tell a paid_event owner which path is active (Item B's $48-stable case) and why their margin choice is not moving the number.
- **Phase 10 carries T058** — the parity test between the frontend `missingFields` useMemo and the backend `isSettingsComplete` predicate.

---

## 8. Branch deployability — REJECTED in original draft, corrected below

**The original draft of §8 claimed "the branch is deployable as of Phase 5 completion." That claim was rejected in review (Item A).**

> **As of Phase 5 completion, the branch is NOT safely deployable.**
>
> The backend completeness rule requires `eventAttendanceRate` AND `eventCloseRate` for `paid_event` (test 23 + test 31). The Phase 5 form does not render these fields yet (T045 lands them in Phase 6). A paid_event owner with all other required fields filled CANNOT save a record — the server rejects with "missing [eventAttendanceRate, eventCloseRate]". The frontend `missingFields` useMemo mirrors the same rule (incomplete list returns those two fields), so the form's paused-targets banner shows correctly. But the form CANNOT RENDER inputs for fields that don't exist in JSX, so the owner cannot fill them and the save button is dead.
>
> **Earliest safe deploy point: end of Phase 6**, when T045 lands the two event-rate inputs in the paid_event form branch AND the frontend's `missingFields` useMemo includes them (currently excluded because the fields don't exist in JSX). Phase 6 is **NOT** an optional P2 improvement — it is required for `paid_event` to function end-to-end. The new contract test 31 ("paid_event requires eventAttendanceRate AND eventCloseRate (T045 prerequisite)") pins this.
>
> **Phase 7 (US4 dual-path results card) remains P2** — it adds a UI feature (showing both paid_event ceilings) but does not block the save path or the verdict gate.

The post-deploy SC-010 verification (T064) still requires a workspace with a pre-existing record + pre-existing aggregates and is not runnable in this worktree.

## 9. FR-050 (single canonical completeness definition) — STATUS

> **FR-050 is NOT satisfied.** Two implementations of "complete" exist:
>
> 1. **Backend**: `isSettingsComplete` + `missingRequiredFields` in `functions/src/funnelSettings.ts` (the canonical source per the contract).
> 2. **Frontend**: `missingFields` `useMemo` in `src/components/FunnelSettingsForm.tsx` (a re-implementation of the rule, mirrored client-side so the form can render the banner + per-field markers without round-tripping).
>
> The frontend duplicate is required for the form to mark fields and show the banner before the user clicks Save, but FR-050 says two implementations MUST NOT exist. **The parity test that locks the two in lockstep is T058, scheduled for Phase 10 (Polish & cross-cutting).** Until T058 lands, the two implementations can drift.
>
> **The first concrete instance of the drift the parity test would catch** is Item A's resolution: the backend was updated to NOT require `htoConversionRate` on `paid_event` (because the corrected formula reads `eventAttendanceRate × eventCloseRate`), but the frontend's `missingFields` useMemo would also need the same exclusion to match. Both implementations have the exclusion in their current state (frontend via the explicit `if (funnelType === 'paid_product' && isEmptyString(htoConversionRate))` branch in the useMemo), but no test verifies that this asymmetry is preserved across future changes.
>
> Until T058 ships, every code change to either completeness rule MUST be accompanied by a manual cross-check of both implementations.

---

---

## 9. Reproducibility

```powershell
# 1. Typecheck both packages
npx tsc -b                                  # exits 0
cd functions; npx tsc --noEmit              # exits 0

# 2. Run the guard tests (Phase 1 stays green)
npm run test:guard                          # 22/22 pass, exit 0

# 3. Run the SC-11 guard against the current src tree
node scripts/sc11Guard.mjs                  # "PASS — 81 files scanned, 0 forbidden terms.", exit 0

# 4. Run the Phase 5 unit tests
cd functions; npm run build; node lib/__tests__/cpaEconomics.test.js
# Expect: 54 ok, "# tests 54 / # pass 54 / # fail 0", exit 0

# 5. Run the affected contract tests
cd functions; node lib/__tests__/funnelSettings.contract.test.js
# Expect: 30 ok, "# tests 30 / # pass 30 / # fail 0", exit 0

# 6. Full Phase 14 sweep
cd functions; npm run test:phase14          # 276/276 across 14 files, exit 0

# 7. Verify the deletion criterion
grep -r "buildFunnelInputsFromDoc" functions/src
# Expect: zero matches
```

---

## 10. Post-review corrections (added before Phase 6 begins)

User review identified four corrections. All four are real defects; the original §8 deployability claim was REJECTED outright.

### 10.1 — Item A: §8 deployability claim is false

The original §8 said "the branch is deployable as of Phase 5 completion." This was wrong because:

- `data-model.md` §3 and contract test 23/31 require `eventAttendanceRate` and `eventCloseRate` on `paid_event`.
- The Phase 5 form does not render these fields yet (T045, Phase 6).
- The backend rejects any save missing either field.
- A paid_event owner cannot save until T045 lands.

**Corrected §8 is in §8 above. Earliest safe deploy point: end of Phase 6.**

A new contract test (test 31: `paid_event requires eventAttendanceRate AND eventCloseRate (T045 prerequisite)`) pins the backend behaviour so future refactors cannot silently relax the requirement.

### 10.2 — Item B: `Required` marker used `isDarkMode` instead of language

The original code at `src/components/FunnelSettingsForm.tsx:1005` was:

```ts
const requiredText = isDarkMode ? 'Required' : 'مطلوب';
```

This is a **bug**: `isDarkMode` is a theme flag, not a language flag. An Arabic-speaking user in dark mode would see "Required" instead of "مطلوب"; an English-speaking user in light mode would see "مطلوب" instead of "Required".

**Fix**: thread `lang` from `useT()` through every `<NumberField>` call site (11 sites) and switch the ternary to `lang === 'ar' ? 'مطلوب' : 'Required'`. `NumberField` now accepts `lang: string` as a required prop.

**This is a clear instance of why FR-050 is not yet satisfied** — see §9 and Item D.

### 10.3 — Item C: §4.5 test count

Original §4.5 reported "275 tests across 14 files" and "+9 from T033". Both numbers were off by 1. Correct counts:

| Phase | cpaEconomics | funnelSettings.contract | Total (this batch's two files) | Phase sweep total |
|---|---:|---:|---:|---:|
| Phase 2 end | 40 | 20 | 60 | 252 |
| Phase 3 end | 44 | 20 | 64 | 256 |
| Phase 4 end | 53 | 20 | 73 | **265** |
| Phase 5 end | 54 | 30 | 84 | **276** |

Phase 5 added **11 tests**, not 9: 1 cpaEconomics (Item B fixture) + 10 funnelSettings (1 Item A asymmetry test + 9 T033 completeness tests). The previous batch-04 report's claim of "+9 from T026 fixtures" was correct; the previous batch-05 claim of "+9 from T033 fixtures" understated by 1 (it should have been "+11 from this batch").

The audit by counting is exact: `git show HEAD~1:functions/src/__tests__/funnelSettings.contract.test.ts | grep -c "test("` returns `20`; `git show HEAD:functions/src/__tests__/funnelSettings.contract.test.ts | grep -c "test("` returns `30` (10 added); `git show HEAD:functions/src/__tests__/cpaEconomics.test.ts | grep -c "test("` returns `54` (1 added).

### 10.4 — Item D: FR-050 NOT satisfied

The original §3 said "two independent implementations of complete MUST NOT exist" (FR-050) and Deviation 2 (now §6.2) recorded the frontend duplicate. The report did not reconcile this contradiction.

**Plain statement**: FR-050 is not satisfied. Two implementations exist (backend `isSettingsComplete` + frontend `missingFields` useMemo). They are **not verified to agree** — that verification is T058 (Phase 10). Until T058 lands, every change to either completeness rule must be accompanied by a manual cross-check.

The first concrete instance of the two possibly disagreeing was Item A: the backend was updated to NOT require `htoConversionRate` on `paid_event`, and the frontend was updated to match (the explicit `if (funnelType === 'paid_product' && isEmptyString(htoConversionRate))` branch). But no test pins this agreement. T058 will. **Until then, the two are unverified.**

### 10.5 — Test 31 (new): `paid_event requires eventAttendanceRate AND eventCloseRate (T045 prerequisite)`

The new contract test added in this review cycle asserts:

1. The per-field validator throws on the first missing event-rate field (so `assertRequiredFieldsPresent` throws here).
2. The canonical predicate `missingRequiredFields` returns BOTH fields in field order: `["eventAttendanceRate", "eventCloseRate"]`.
3. `isSettingsComplete` returns `false` for the half-filled doc.
4. Adding both event-rate fields makes the record complete (`isSettingsComplete` returns `true`).
5. Negative control: only ONE event-rate field present is still incomplete (the other is required, neither is a substitute).

This test is the gate Item A asked for. Until T045 lands, this test passes (the backend rejects); once T045 lands the form inputs, the frontend parity test (T058) will verify the frontend's `missingFields` useMemo matches.

### 10.6 — Audit per AGENTS.md 0b (LAST, after every test the batch adds)

85 names walked (54 cpaEconomics + 31 funnelSettings). Each name's directional claim matched the assertion(s). No contradictions.