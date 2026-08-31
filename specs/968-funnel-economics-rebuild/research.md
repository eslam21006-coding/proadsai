# Phase 0 Research: Funnel Economics Rebuild

**Feature**: `968-funnel-economics-rebuild`
**Date**: 2026-08-31

All findings below were verified against the codebase, not assumed. Line references are to the state of the branch at the time of writing.

---

## R-1 — The stored `derived` snapshot defeats the specified gate

**Status**: Blocking problem found in the spec's design. Resolved.

### Finding

The spec's central safety mechanism (FR-041, FR-042) assumes that an incomplete record produces no effective target, so the verdict engine's data gate fires. Verification shows it does not.

`functions/src/metaSync/shared.ts:590-596` loads funnel settings by reading the **stored** `derived` sub-object directly from Firestore. It never recomputes from the input fields:

```ts
const settingsSnap = await settingsRef.get();
if (settingsSnap.exists) {
    const data = settingsSnap.data() as { derived?: unknown };
    if (data && typeof data.derived === "object" && data.derived !== null) {
        funnelSettings = { derived: data.derived as FunnelSettingsForVerdict["derived"] };
    }
}
```

`FunnelSettingsDoc` (`functions/src/funnelSettings.ts:70`) confirms `derived: DerivedTargets` is persisted on the document.

Consequence: an existing record carries `derived.free.effectiveTargetCpl = 630` from its last save. Not backfilling the *input* fields does nothing to that stored *output*. `getEffectiveTarget` returns `630`, the gate never fires, and verdicts continue to be written against the old incorrect target.

### Decision

Version-stamp the derived payload.

- `DerivedTargets` gains a required `economicsVersion: 2`.
- `getEffectiveTarget(derived)` returns `null` unless `derived.economicsVersion === 2`.
- Records written before this phase carry no stamp, so they gate.

### Rationale

The *absence* of a field is the signal, so nothing has to be written to any existing document. This satisfies every constraint the product owner set:

- No backfill, no migration defaults, no implicit values — the Q1 decision holds literally.
- `metaSync/shared.ts` stays out of scope. It already calls `getEffectiveTarget`; the `null` now arrives without touching that file.
- Reverting this phase is code-only. Since nothing was written, there is nothing to restore.
- `getEffectiveTarget` was verified as the sole backend path to the target — `qararEngine.ts:224` and `:247`, and `metaSync/shared.ts:839`. A grep for direct reads of `effectiveTargetCpa` / `effectiveTargetCpl` outside `cpaEconomics.ts` returns only `FunnelSettingsForm.tsx` (display-only, frontend). One change therefore covers every backend consumer.

### Boundary — this is not an epoch

Constitution XII requires deferred scope to stay deferred, and the epoch phase is deferred. The stamp must not be allowed to become one.

| | `economicsVersion` (this phase) | `businessEpoch` (deferred) |
|---|---|---|
| Versions | the shape of a computed payload | the user's business configuration |
| Changes when | the formula set changes, in code | the owner changes funnel type or price materially |
| Affects learning | never | partitions aggregates by epoch |
| Storage paths | none | `learning/{epoch}/...` |
| Threshold rule | none | 25% change rule (OQ-2, deferred) |

The stamp MUST NOT be read by any learning code, MUST NOT appear in any aggregate path, and MUST NOT gain a threshold rule in this phase.

### Alternatives considered

- **Recompute `derived` in the sync from stored inputs** — rejected: requires `metaSync/shared.ts` in scope, which the product owner excluded twice, and duplicates derivation logic into the sync path.
- **One-time script nulling `derived` on all existing records** — rejected: it is a data write, contradicting "no migration", and it makes a revert require data restoration.
- **Treat a missing input field as `null` and have derivation throw** — rejected: the sync reads the stored output and never calls derivation, so this never executes.

---

## R-2 — The `?? Infinity` coercion does not defeat the gate

**Status**: Verified safe. No change needed.

`functions/src/metaSync/shared.ts:838-839`:

```ts
const target = funnelSettings
    ? getEffectiveTarget(funnelSettings.derived) ?? Infinity
    : Infinity;
```

This looked like it could convert a gating `null` into a usable number. It does not. That local `target` feeds only `adSetHittingTarget` (`:846-848`), which is passed to `evaluateVerdict` as an *option*. The engine receives the whole settings object and runs its own null check first (`qararEngine.ts:224`), returning ⏳ before any option is consulted.

**Decision**: leave it untouched. **Rationale**: it is not on the gating path, and changing it would pull an out-of-scope file into the diff for no behavioural gain.

---

## R-3 — Signalling incompleteness as absence would auto-push every owner

**Status**: Trap identified. Forbidden by FR-043 and FR-053.

`src/App.tsx:4283` derives `funnelSettingsHasDoc` from `!!data?.settings`. `src/App.tsx:4348-4358` auto-opens the settings modal when that flag is `false`.

The most natural implementation of "this record is incomplete" — returning `settings: null` from `getFunnelSettings` — would therefore auto-open the form for **every existing owner** on their next load, converting the passive signal the product owner asked for into exactly the push they forbade.

**Decision**: incompleteness is carried by a separate `complete: boolean` field on the response. The record itself is always returned when it exists.

**Rationale**: preserves the existing auto-open semantics (which key on existence) untouched, and keeps the new signal orthogonal. `reviewDue` is unaffected — it is destructured at `App.tsx:4281` and discarded, and the review banner renders only inside the form.

---

## R-4 — The terminology guard blocks benchmark copy, and the escape route is evasion

**Status**: Verified against `scripts/sc11Guard.mjs`. Resolved.

The guard's percentage pattern is `/\d+\s*%|percent/gi` — it requires a **digit** immediately before `%`. This explains why existing labels like `'Attendance rate (%)'` pass unexempted while `"typical: 5–10%"` would not. The English word `percent` is banned case-insensitively.

`scripts/.sc11-allowlist` contains `src/i18n.tsx` and `src/App.tsx` as whole-file entries; `src/components/FunnelSettingsForm.tsx` is **not** on it.

**Decision**: omit the percent symbol from all new form copy and carry the unit in the field or group label. Do not add the form to the allowlist. Do not relocate copy into an allowlisted file.

**Rationale**: routing user-facing copy into a file the guard cannot scan would satisfy the linter while defeating the rule's purpose. All 30 new string pairs were machine-checked against the live patterns (0 violations), with negative controls (`"Keep 50%"`, `"Typical range: 5–10%"`, `"Typical: 5 - 10 %"`, `"Keep 50 percent"`) confirmed to trip, proving the check is not vacuously passing.

**Trap noted**: the `marginKept` preset buttons are the likeliest accidental violation. `"Keep 50%"` trips; `"50"` under a group label reading `"Margin you want to keep (%)"` does not. Fixed by FR-025a.

**Alternatives considered**: a scoped inline-marker exemption in `sc11Guard.mjs` — rejected because no exemption turned out to be necessary, and it would have pulled `scripts/` into scope.

---

## R-5 — The report's Arabic hint violates a documented policy the guard does not enforce

**Status**: Deviation from the source report, deliberate.

Report §9 gives the order-value hint as «متوسط ما يدفعه العميل الواحد». The guard's own header documents:

> `"متوسط"` is INTERNAL-ONLY (not in `src/**`). It is NOT in the pattern set here. The user-facing equivalent in stats labels is `"المعدل"` or appropriate Fusha.

Because it is deliberately absent from `PATTERNS`, the report's wording would have shipped past `npm run lint` silently while violating the stated policy.

**Decision**: use «المبلغ الذي يدفعه العميل الواحد عادة». The report's §9 *label* wording «قيمة الطلب» is used unchanged — it already avoids the word.

**Rationale**: same meaning, simple Fusha, honours a policy the tooling cannot enforce. Recorded as spec Assumption A-10 and reversible if the product owner prefers the report's wording.

---

## R-6 — Test conventions and the explicit test manifest

**Status**: Verified.

Backend tests use `node:test` + `node:assert/strict`, compiled to `lib/` and executed as plain node scripts. There is no test runner doing directory discovery: `functions/package.json:34` enumerates **every** test file by path in the `test` script.

**Decision**: the new parity test must be appended to that explicit list.

**Rationale**: a new `__tests__/*.test.ts` file that is not added to the manifest compiles cleanly, passes review, and never runs — a silent hole in exactly the constitution-XI check it exists to provide. Existing precedent for the cross-boundary parity pattern is `functions/src/__tests__/creativeResolverParity.test.ts`.

Relevant existing files to modify rather than duplicate: `cpaEconomics.test.ts` (333 lines, already covers the pre-phase constants and worked examples — its constant assertions for `FULL_FUNNEL_ROAS_FLOOR` and `ECONOMIC_CEILING_MULTIPLIER` must be **removed**, since FR-002 deletes both constants) and `funnelSettings.contract.test.ts`.

---

## R-7 — Frontend/backend duplication is an established pattern here

**Status**: Verified. Follow the precedent.

`creativeResolver.ts` already exists in both `src/` and `functions/src/`, with `creativeResolverParity.test.ts` asserting they agree. The completeness predicate and the economics face the same language-boundary duplication, and constitution XI requires both layers to enforce launch rules.

**Decision**: author the completeness predicate canonically in `functions/src/funnelSettings.ts`, mirror it in the form, and assert agreement with a parity test across every funnel type and every missing-field permutation.

**Alternatives considered**: a shared package consumed by both builds — rejected as disproportionate for one predicate, and inconsistent with the pattern the repository already uses.
