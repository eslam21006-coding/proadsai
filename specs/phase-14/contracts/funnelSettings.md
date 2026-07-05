# Contract: Funnel Settings & CPA Cap (Layer 1)

**Feature**: `phase-14-rag-meta` · **US1**
**Transport**: Firebase callables (`europe-west1`). Derived economics computed server-side, returned in the response (never read from module globals).
**Scope**: `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/settings`.

---

## `saveFunnelSettings` (callable)

### Request
```ts
{
  workspaceId: string;
  accountId: string;
  funnelType: 'paid_event' | 'free_webinar' | 'paid_product' | 'lead_magnet_call';

  // Paid funnels (paid_event | paid_product)
  aov?: number;
  hasHto?: boolean;                  // false ⇒ server forces htoPrice/htoConversionRate to 0
  htoPrice?: number;
  htoConversionRate?: number;        // % (3 = 3%)
  roasTarget?: 1.0 | 0.65 | 0.5;          // break-even / invest-a-bit / invest-more (strict enum — no custom)

  // Free webinar / challenge
  offerPrice?: number;               // also reused by lead_magnet_call
  attendanceRate?: number;           // % — required iff free_webinar
  buyRateFromAttendees?: number;     // % — required iff free_webinar

  // Lead magnet → Call
  leadToCloseRate?: number;          // % — required iff lead_magnet_call

  clientNowMs: number;               // client timestamp (no Date.now() at module load)
}
```

### Response
```ts
{
  ok: true;
  derived: {
    // paid branch
    rawTargetCpa?: number; fullBuyerValue?: number; maxCpa?: number;
    effectiveTargetCpa?: number; capApplied?: boolean;
    // free branch
    leadValue?: number; economicCeilingCpl?: number; effectiveTargetCpl?: number;
    operationalBaselineCpl?: number; manualBenchmarkCpl?: number;
    computedAt: number;
  };
  advisories: {                      // spec §2.6 — informational, non-blocking
    noHto: boolean;                  // paid funnel + hasHto=false
    lowValue: boolean;               // aov (paid) or offerPrice (free) < 9
  };
  reviewDueAt: number;
  warning?: {                        // present iff derived.capApplied
    code: 'CPA_CAP_APPLIED';
    messageAr: string;               // plain Arabic — cap applied at maxCPA
    rawTargetCpa: number;
    cappedTo: number;                // = maxCpa
  };
}
```

### Server rules
- Validate numerics; reject negative prices; percentages in a sane range.
- **Paid** (`paid_event` | `paid_product`): if `hasHto=false`, force `htoPrice=0` and `htoConversionRate=0`. `rawTargetCpa = aov / roasTarget`; `fullBuyerValue = aov + htoPrice*(htoConversionRate/100)` (= `aov` when no HTO); `maxCpa = fullBuyerValue/2`; `effectiveTargetCpa = min(raw, max)`; `capApplied = raw > max` (strictly greater — FR-003).
- **Free webinar** (`free_webinar`): require `offerPrice`+`attendanceRate`+`buyRateFromAttendees`; `leadValue = offerPrice*(attendanceRate/100)*(buyRateFromAttendees/100)`.
- **Lead magnet → Call** (`lead_magnet_call`): require `offerPrice`+`leadToCloseRate`; `leadValue = offerPrice*(leadToCloseRate/100)`.
- Free (both): `economicCeilingCpl = 0.7*leadValue`; `effectiveTargetCpl = economicCeilingCpl` (or `operationalBaselineCpl` — 30-day rolling — if lower, once data exists; `manualBenchmarkCpl` fallback) (FR-004).
- **Advisories** (§2.6, computed but never gating): `noHto = paid && hasHto===false`; `lowValue = (paid ? aov : offerPrice) < 9`. Both can be true at once; the target is always still calculated.
- Recompute all `derived`/`advisories` server-side; ignore any client-supplied derived values (Constitution XI).
- `lastReviewedAt = clientNowMs`; `reviewDueAt = clientNowMs + ~30d`.

### Errors
| Code | When |
|---|---|
| `unauthenticated` | no auth |
| `invalid-argument` | missing/invalid numeric, or a funnel type missing its required inputs (paid: `aov`+`roasTarget`; `free_webinar`: `attendanceRate`+`buyRateFromAttendees`; `lead_magnet_call`: `leadToCloseRate`; free: `offerPrice`) |
| `permission-denied` | caller not a member of `workspaceId`, or `accountId` not the workspace's connected account |

---

## Business Advisory Cards (frontend, spec §2.6)

Rendered ABOVE the results card from the `advisories` flags — informational, dismissible, non-blocking:
- **`noHto`** → title "ملاحظة مهمة عن مسار المبيعات الخاص بك"; body about High-Ticket value limits; CTA "احجز مكالمة" → `https://eslamsalah.com/team-discovery-call` (new tab).
- **`lowValue`** → same title; body about AOV/offer < $9 making paid ads hard; same book-a-call CTA.
- Both may show simultaneously. The target CPA/CPL still renders normally.
- **Dismissal persists** per card via `advisoriesDismissed.{noHto,lowValue}` on the settings doc: a dismissed card stays hidden across reloads/re-saves until the user edits settings so the trigger condition changes and then re-triggers. A dedicated write (e.g. a `dismissAdvisory` action or a field on `saveFunnelSettings`) sets the flag; the server never clears it except when recomputing settings whose condition no longer holds.

---

## `getFunnelSettings` (callable)

### Request
```ts
{ workspaceId: string; accountId: string }
```

### Response
```ts
{ ok: true; settings: FunnelSettings | null; reviewDue: boolean }
```
`reviewDue = now >= reviewDueAt` → drives the monthly-review prompt (FR-006, dismissible/non-blocking). `null` when never configured — the app then requires the form before showing any performance data (spec §2.1).
