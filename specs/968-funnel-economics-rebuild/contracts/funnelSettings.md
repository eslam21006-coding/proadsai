# Contract: `functions/src/funnelSettings.ts` callables

**Feature**: `968-funnel-economics-rebuild`

---

## 1. `saveFunnelSettings`

### Request — new optional fields

```ts
interface SaveFunnelSettingsRequest {
  // ... existing fields unchanged ...
  bookingRate?: number | null;          // lead_magnet_call
  showUpRate?: number | null;           // lead_magnet_call
  eventAttendanceRate?: number | null;  // paid_event
  eventCloseRate?: number | null;       // paid_event
  commissionRate?: number | null;       // all four
  marginKept?: 50 | 60 | 70 | null;     // all four
}
```

### Validation

| Rule | Behaviour on violation |
|---|---|
| Every field required by `funnelType` present and non-null (FR-040a) | Reject, naming **all** missing fields |
| Rates within `0..100` | Reject, naming the field |
| Prices `>= 0` and finite | Reject, naming the field |
| `marginKept` ∈ `{50, 60, 70}` (FR-026) | Reject |
| `commissionRate` ∈ `0..100` (FR-027) | Reject |

Applies to **all four** funnel types, not only `lead_magnet_call`. Incompleteness therefore becomes a legacy-only state: inheritable, never newly creatable.

### Write behaviour

- Persists the new fields plus a `derived` payload stamped `economicsVersion: 2`.
- `hasHto === false` continues to force `htoPrice` and `htoConversionRate` to `0`.
- **Does not** clear or delete `htoConversionRate` on `paid_event`. Retained but unread — see `data-model.md` §1.
- Writes **no** epoch field of any kind.

---

## 2. `getFunnelSettings`

### Response

```ts
{
  ok: true,
  settings: FunnelSettingsDoc | null,
  reviewDue: boolean,
  complete: boolean          // NEW — FR-049
}
```

### Rules

| Rule | Detail |
|---|---|
| `complete` is computed server-side | Never trusted from the client, matching how `derived` and `advisories` are already handled |
| `complete` reflects the **stored** record | Evaluated against required fields for the stored `funnelType` |
| Absent record | `settings: null`, `complete: false` |
| **Incomplete record** | `settings: <the record>`, `complete: false` — the record is **always** returned when it exists |

### ⚠ Forbidden implementation

> **Returning `settings: null` for an incomplete record is forbidden (FR-043).**
>
> `src/App.tsx:4283` sets `funnelSettingsHasDoc` from `!!data?.settings`, and `src/App.tsx:4348-4358` auto-opens the settings modal when that flag is `false`. Signalling incompleteness as absence would auto-push **every existing owner** into the form on their next load, converting the passive signal into exactly the push FR-044 forbids.
>
> Existence and completeness are orthogonal signals and must stay that way.

`reviewDue` keeps its current meaning and must not be influenced by `complete` (FR-053).

---

## 3. Completeness predicate

Canonical definition, exported for reuse and for the parity test (FR-050):

```ts
export function isSettingsComplete(doc: Partial<FunnelSettingsDoc>): boolean;
export function missingRequiredFields(doc: Partial<FunnelSettingsDoc>): string[];
```

Required fields per funnel type are specified in `data-model.md` §3.

| Rule | Detail |
|---|---|
| `null` or missing → incomplete | The only two incomplete signals |
| `0` → **complete** | A zero commission or zero rate is a legitimate answer, not an absence |
| `hasHto === false` | Removes `htoPrice` / `htoConversionRate` from the required set |

`missingRequiredFields` returns stable, ordered field names so the form can mark them and the observability log can name them.

---

## 4. `dismissAdvisory`

Unchanged. `advisoriesDismissed.{noHto,lowValue}` keeps its shape; only the `lowValue` **trigger** changes (FR-028), not its dismissal.

---

## 5. Consumers not changed by this contract

| Consumer | Why it needs no change |
|---|---|
| `qararEngine.ts` | Its existing gate (`:224`) already returns ⏳ on a null target |
| `metaSync/shared.ts` | Already calls `getEffectiveTarget`; the null now arrives on its own (R-1). Gains only the observability log below |
| `learningAggregates.ts` | Never sees a 🟢/🔴 for a gated account |

---

## 6. Observability (constitution VI/VII)

When an account's settings gate a sync, emit **one** structured log line per account per sync — never per ad:

```
funnel_settings_incomplete  workspaceId=<id> accountId=<id> funnelType=<type> missing=[bookingRate,showUpRate,commissionRate,marginKept]
```

Constitution VI forbids a hidden layer that suppresses behaviour without a trace; this is what lets an operator answer "why did this account stop producing verdicts?". One line per account keeps it from becoming spam across a large sync.
