# Phase 1 Data Model: Funnel Economics Rebuild

**Feature**: `968-funnel-economics-rebuild`
**Date**: 2026-08-31

All changes are **additive**. No field is renamed, cleared, or deleted, and no document is written by a migration.

---

## 1. Settings document

**Path**: `users/{uid}/workspaces/{wsId}/adAccounts/{accId}/settings/current`
**Interface**: `FunnelSettingsDoc` in `functions/src/funnelSettings.ts`

### Existing fields — unchanged

`accountId`, `accountName?`, `funnelType`, `aov`, `hasHto`, `htoPrice`, `htoConversionRate`, `roasTarget`, `offerPrice`, `attendanceRate`, `buyRateFromAttendees`, `leadToCloseRate`, `derived`, `advisories`, `advisoriesDismissed`, `lastReviewedAt`, `reviewDueAt`, `createdAt`, `updatedAt`, `schemaVersion`.

### New fields

| Field | Type | Applies to | Notes |
|---|---|---|---|
| `bookingRate` | `number \| null` | `lead_magnet_call` | Percent, 0–100. Lead → booked call. |
| `showUpRate` | `number \| null` | `lead_magnet_call` | Percent, 0–100. Booked → attended. |
| `eventAttendanceRate` | `number \| null` | `paid_event` | Percent, 0–100. Ticket buyers → attendees. |
| `eventCloseRate` | `number \| null` | `paid_event` | Percent, 0–100. Attendees → high-ticket sale. |
| `commissionRate` | `number \| null` | **all four** | Percent, 0–100. Default 10 for a new record. Includes `paid_product` per the OQ-1 override (FR-018). |
| `marginKept` | `50 \| 60 \| 70 \| null` | **all four** | Closed enum. Default 60 for a new record. Never free-entry (FR-025). |

`null` is the canonical absent value. A field that is `null` or missing makes the record incomplete for its funnel type.

### Field reuse and retirement

| Field | Fate |
|---|---|
| `leadToCloseRate` | **Reused unchanged.** Its meaning was always "close rate on attended calls"; the old formula simply applied it at the wrong stage. No rename, so existing values stay meaningful. |
| `htoConversionRate` | **Retained but unread on `paid_event`.** Superseded there by `eventAttendanceRate` × `eventCloseRate`. Still live and read for `paid_product`. Deliberately not cleared and not deleted — the field's definition is unchanged rather than orphaned, and retaining the value keeps a revert of this phase code-only with no data restoration step. |
| `attendanceRate`, `buyRateFromAttendees` | Unchanged, `free_webinar` only. |

### Fields NOT added

`businessEpoch` and `verdictEpoch` are **deferred** (spec scope boundary, constitution XII). They must not appear.

---

## 2. Derived targets

**Interface**: `DerivedTargets` in `functions/src/cpaEconomics.ts`. Persisted on the settings document as `derived`, and read back **as a stored snapshot** by the sync — see §5.

### New field

| Field | Type | Notes |
|---|---|---|
| `economicsVersion` | `2` | Required. Discriminates payloads produced by the corrected formulas from pre-phase payloads, which carry no stamp. |

### Changed sub-shapes

`PaidDerived` — `maxCpa` is now the **margin-driven** ceiling (`fullBuyerValue × spendShare`) rather than `fullBuyerValue / 2.0`. To support the dual-path results card (FR-032), both component ceilings must remain individually readable: `rawTargetCpa` (ticket-revenue path) and `maxCpa` (projected-value path), with `effectiveTargetCpa` the lower of the two and `capApplied` unchanged in meaning (`raw > ceiling`, strictly).

`FreeDerived` — unchanged in shape. `economicCeilingCpl` is now `leadValue × spendShare`.

### `economicsVersion` is not an epoch

| | `economicsVersion` | `businessEpoch` (deferred) |
|---|---|---|
| Versions | the shape of a computed payload | the owner's business configuration |
| Changes when | the formula set changes, in code | funnel type or price changes materially |
| Affects learning | never | partitions aggregates |
| Storage paths | none | `learning/{epoch}/...` |

It MUST NOT be read by any learning code, MUST NOT appear in any aggregate path, and MUST NOT gain a threshold rule in this phase.

---

## 3. Completeness

Authored once in `functions/src/funnelSettings.ts` (FR-050), mirrored in the form, and held in agreement by a parity test.

A record is **complete** when every field its funnel type requires is present and non-null:

| Funnel type | Required fields |
|---|---|
| `lead_magnet_call` | `offerPrice`, `leadToCloseRate`, `bookingRate`, `showUpRate`, `commissionRate`, `marginKept` |
| `free_webinar` | `offerPrice`, `attendanceRate`, `buyRateFromAttendees`, `commissionRate`, `marginKept` |
| `paid_event` | `aov`, `eventAttendanceRate`, `eventCloseRate`, `commissionRate`, `marginKept`, plus `htoPrice` when `hasHto`. `roasTarget` is **optional** — defaults to `0.5` (FR-016 controlled-loss posture) when omitted. |
| `paid_product` | `aov`, `roasTarget`, `commissionRate`, `marginKept`, plus `htoPrice` and `htoConversionRate` when `hasHto` |

Notes:

- `hasHto === false` forces `htoPrice` and `htoConversionRate` to `0` (existing behaviour) and removes them from the required set — a record without a high-ticket offer is still complete.
- `0` is a **valid, complete** value everywhere. Only `null`/missing means incomplete. A zero commission or a zero rate is a legitimate answer.
- Incompleteness is a **legacy state only** (FR-040a): saving rejects an incomplete submission for every funnel type, so it can be inherited but never newly created.

### Item A decision — `htoConversionRate` on `paid_event` (resolved 2026-08-31)

`htoConversionRate` is **NOT** part of the `paid_event` completeness rule. The field is stored on `paid_event` for additive retention (per §1 above) but the corrected formula reads `eventAttendanceRate × eventCloseRate` instead (FR-011..FR-014). Requiring `htoConversionRate` on `paid_event` would:

1. Force the owner to fill a field that changes nothing.
2. Keep the attention badge lit on an otherwise-complete record (FR-039, FR-049).

The contract asymmetry is intentional and load-bearing:

| Field | `paid_event` | `paid_product` |
|---|---|---|
| `htoPrice` (when `hasHto`) | required | required |
| `htoConversionRate` (when `hasHto`) | **NOT required** (stored but unread) | required (FR-019) |

This rule is enforced by `assertRequiredFieldPresent` in `functions/src/funnelSettings.ts` and verified by `funnelSettings.contract.test.ts` tests 8 and 9 (the paid_event test asserts "does NOT throw"; the paid_product test asserts "throws").

### State transitions

```
Pre-phase record ──(no write)──▶ INCOMPLETE
                                    │
                                    │  owner opens form voluntarily and saves all fields
                                    ▼
                                 COMPLETE ──▶ target derives, verdicts resume next sync
```

There is no automatic transition out of `INCOMPLETE`. Nothing writes the record on the owner's behalf.

---

## 4. Behaviour of an incomplete record

| Consumer | Behaviour |
|---|---|
| `getEffectiveTarget` | Returns `null` — because the stored `derived` carries no `economicsVersion: 2`. |
| `qararEngine.evaluateVerdict` | Existing gate at `qararEngine.ts:224` returns ⏳ with the existing `REASON_DATA_GATE_FUNNEL_MISSING`. Unchanged code. |
| `learningAggregates` | Receives no 🟢/🔴, so `conversionBestCount` / `conversionWorstCount` do not move. |
| `getFunnelSettings` | Returns the record **and** `complete: false`. Never returns `settings: null` for an existing record (FR-043). |
| `App.tsx` | Renders a passive badge. Does **not** auto-open the modal (FR-053). |
| Settings form | Marks the missing fields and states that targets are paused. Renders no results card, since no target derives. |

---

## 5. Why the version stamp is load-bearing

The sync does not recompute targets. `metaSync/shared.ts:592-595` reads the stored `derived` object verbatim:

```ts
const data = settingsSnap.data() as { derived?: unknown };
if (data && typeof data.derived === "object" && data.derived !== null) {
    funnelSettings = { derived: data.derived as FunnelSettingsForVerdict["derived"] };
}
```

Not backfilling the *input* fields therefore does nothing on its own — the stale *output* (`effectiveTargetCpl: 630`) is still sitting on the document and would still be used. The absent `economicsVersion` is what makes `getEffectiveTarget` return `null` without anyone writing to the document.

---

## 6. What is explicitly not touched

- **Learning aggregates** — no path, write, or read changes. `hookPerformance` / `visualPerformance` collections untouched. Regression invariant (FR-046).
- **`metaSync/shared.ts`** — no logic change; gains only the constitution-VI observability log.
- **`qararEngine.ts`** — no change. Its existing gate does the work.
- **Security rules, billing, pricing, plan gating** — untouched.
- **`scripts/sc11Guard.mjs` and `scripts/.sc11-allowlist`** — unchanged. The form must not be added to the allowlist.
