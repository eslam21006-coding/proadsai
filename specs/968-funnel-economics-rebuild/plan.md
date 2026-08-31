# Implementation Plan: Funnel Economics Rebuild

**Branch**: `968-funnel-economics-rebuild` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/968-funnel-economics-rebuild/spec.md`
**Source of truth**: `docs/investigations/funnel-economics-investigation.md`

## Summary

Replace the incorrect funnel economics models with ones that reflect the real funnel chains, and surface the two previously hidden business decisions — sales commission and retained margin — as owner-controlled inputs. Items 1–10 of report §11, plus the OQ-1 override.

The correction moves a lead-magnet-to-call target from **$630 to $12.76**. Because epoch work is deferred, that correction must not be allowed to re-judge historical ads and flood the learning aggregates with failing verdicts. The spec's answer is a completeness gate: existing records are never backfilled, so they are incomplete, so they yield no target, so the verdict engine's **existing** data gate returns ⏳ and writes nothing.

Phase 0 research surfaced one blocking problem with that design as literally specified, and resolved it. See **R-1** below and `research.md`.

**Technical approach**: `cpaEconomics.ts` stays pure and gains the corrected formulas plus a version discriminator on its derived output. `funnelSettings.ts` owns the single completeness predicate and exposes it on the retrieval response. The form gains the new inputs, benchmark hints, and missing-field marking. `App.tsx` renders a passive badge from a flag it already has the round-trip for.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, React 19, Tailwind CSS 3, Vite 7
**Storage**: Firestore — `users/{uid}/workspaces/{wsId}/adAccounts/{accId}/settings/current` (single document, additive fields only, no migration)
**Testing**: `node:test` + `node:assert/strict`, compiled to `lib/` and run via `cd functions && npm test`; frontend guarded by `npm run lint` (ESLint + `scripts/sc11Guard.mjs`)
**Target Platform**: Node 20 Cloud Functions + evergreen browsers
**Project Type**: Web application — existing `src/` frontend and `functions/src/` backend
**Performance Goals**: None. `cpaEconomics.ts` is arithmetic on a handful of numbers; no measurable performance surface.
**Constraints**: `cpaEconomics.ts` MUST stay pure (no Firestore, no network). All new user-facing copy MUST clear `scripts/sc11Guard.mjs` without allowlisting `FunnelSettingsForm.tsx`. Backend callables cannot be verified by `npm run dev` — they need a deploy.
**Scale/Scope**: 4 funnel types, ~8 new input fields, 30 new string pairs, 5 files.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1.*

| Principle | Assessment | Status |
|---|---|---|
| **IV — Behavior contracts beat subjective judgment** | 59 FRs with explicit pass/fail rules; every §6 worked example becomes a fixture; boundary fixture at raw 0.4999; negative controls prove the guard check discriminates. | **PASS** |
| **VI — Hidden machine layers MUST be auditable** | The completeness gate silently suppresses verdicts. Constitution requires a trace. A structured log is added where the gate fires (**Gate observability** below), under the bounded scope approval of 2026-08-31. | **PASS** |
| **VII — No silent override without rule, signal, and trace** | Rule: FR-039–FR-045. Signal: passive badge (FR-051) + in-form notice (FR-052) + existing ⏳ reason. Trace: the structured log above. All three legs present. | **PASS** |
| **IX — Proof required for every claimed fix** | Failing rule, controlling file, cause, change, before/after ($630 → $12.76), and reproducible fixtures are all specified. | **PASS** |
| **X — Spec before code** | Spec + 5 clarifications complete before this plan. | **PASS** |
| **XI — Frontend and backend MUST agree on truth** | The completeness rule and the economics both exist on two sides of a language boundary. Mitigated by a parity test mirroring the existing `creativeResolverParity.test.ts` precedent. See **Cross-boundary parity**. | **PASS with added requirement** |
| **XII — Deferred scope MUST remain deferred** | Epoch work stays out. **Risk noted**: R-1's version discriminator could be mistaken for a partial epoch. It is not — see the explicit boundary in **R-1**. | **PASS** |
| **V — Arabic quality is first-class** | All 30 pairs authored in simple Fusha, machine-checked, with one deliberate deviation from the report recorded (A-10). | **PASS** |

No violations requiring justification. Complexity Tracking table omitted.

### Bounded scope approval — `metaSync/shared.ts` (2026-08-31)

Approved for the **FR-042 observability log statement ONLY**. No other change to that file: no logic change, no target recomputation, no alteration of the `?? Infinity` coercion at `:838-839`.

Rationale for not relocating it: the log must be emitted where the suppression occurs. Moving it to an in-scope file would place the trace somewhere that cannot observe the event — satisfying the file boundary while defeating the constitution VI requirement it exists to meet.

### Gate observability (constitution VI/VII)

When `getEffectiveTarget` returns null because a record is incomplete, the sync MUST emit one structured log line per account per sync — not per ad — naming the workspace, the account, and the missing fields. Without it, an operator cannot answer "why did this account stop producing verdicts?", which Principle VI forbids. One line per account keeps this from becoming log spam across a large sync.

### Cross-boundary parity (constitution XI)

`FunnelSettingsForm.tsx` must not let an owner save something the backend will reject, and must not show a target the backend would not derive. The completeness predicate is authored in `functions/src/funnelSettings.ts` and mirrored in the form. A parity test asserts the two agree across every funnel type and every missing-field permutation, following the existing `creativeResolverParity.test.ts` pattern.

## Phase 0 findings that changed the design

### R-1 — The stored `derived` snapshot defeats the specified gate (blocking, resolved)

**Problem.** The spec assumes an incomplete record yields no effective target. It does not. `metaSync/shared.ts:592-595` reads the **stored** `derived` sub-object straight from Firestore and never recomputes it:

```ts
const data = settingsSnap.data() as { derived?: unknown };
if (data && typeof data.derived === "object" && data.derived !== null) {
    funnelSettings = { derived: data.derived as FunnelSettingsForVerdict["derived"] };
}
```

An existing record still carries `derived.free.effectiveTargetCpl = 630` from its last save. `getEffectiveTarget` returns `630`, not `null`. The data gate never fires, verdicts keep being written against the old wrong target, and FR-041/FR-042 are unmet. Nothing in the spec as written prevents this.

**Resolution.** Version-stamp the derived payload. `DerivedTargets` gains a required `economicsVersion: 2`, and `getEffectiveTarget` returns `null` when the stamp is absent or not `2`. Records written before this phase have no stamp, so they gate correctly — the *absence* of a field is the signal, which costs no write.

**Why this fits every constraint:**

- No data migration. No backfill. Nothing is written to any existing document. Honours the Q1 decision exactly.
- `metaSync/shared.ts` needs no *logic* change. It already calls `getEffectiveTarget`; the null now arrives on its own. It is in scope only for the FR-042 log statement (see the bounded approval below).
- `getEffectiveTarget` is verified as the **only** backend path to the target (`qararEngine.ts:224,247` and `metaSync/shared.ts:839`), so one change covers every consumer.
- Reverting the phase restores the old behaviour with no data restoration step, because nothing was written.

**Why this is not an epoch (constitution XII).** A business epoch versions the *user's business* and partitions *learning data* by it. This stamps the *shape of a computed payload* and is invisible to learning. It has no bearing on funnel-type changes, no threshold rule, no aggregate path change, and it never partitions anything. It is a schema discriminator, and it must not be extended into an epoch in this phase.

### R-2 — `?? Infinity` does not defeat the gate (verified safe)

`metaSync/shared.ts:838-839` coerces a null target to `Infinity`. That value feeds **only** `adSetHittingTarget`, passed as an option. `evaluateVerdict` receives the whole settings object and runs its own null check first (`qararEngine.ts:224`), so the gate wins. No change needed.

### R-3 — Returning `settings: null` for an incomplete record would auto-push every owner (verified trap)

`App.tsx:4283` sets `funnelSettingsHasDoc` from `!!data?.settings`, and `App.tsx:4354` auto-opens the form when that is false. Signalling incompleteness by returning a null record would trip it. FR-043 and FR-053 forbid this; the plan carries it as an explicit implementation constraint.

## Project Structure

### Documentation (this feature)

```text
specs/968-funnel-economics-rebuild/
├── spec.md                      # Feature specification (59 FRs)
├── plan.md                      # This file
├── research.md                  # Phase 0 — R-1..R-6 with decisions
├── data-model.md                # Phase 1 — document shape, completeness rule
├── quickstart.md                # Phase 1 — build, test, deploy, verify
├── contracts/
│   ├── cpaEconomics.md          # Pure module contract + all fixtures
│   ├── funnelSettings.md        # Callable request/response contract
│   └── uiCopy.md                # All 30 string pairs, guard-verified
├── checklists/
│   └── requirements.md          # Spec quality checklist (passing)
└── tasks.md                     # Phase 2 — created by /speckit.tasks, NOT here
```

### Source code (repository root)

```text
functions/src/
├── cpaEconomics.ts              # MODIFIED — corrected formulas, economicsVersion, completeness-aware getEffectiveTarget
├── funnelSettings.ts            # MODIFIED — new fields, completeness predicate, `complete` on response
├── qararEngine.ts               # UNCHANGED — existing data gate already handles a null target
├── metaSync/shared.ts           # IN SCOPE, BOUNDED — FR-042 observability log statement ONLY; no logic change
├── learningAggregates.ts        # UNCHANGED — regression invariant only
└── __tests__/
    ├── cpaEconomics.test.ts     # MODIFIED — §6 fixtures, boundary case, version gate
    ├── funnelSettings.contract.test.ts  # MODIFIED — completeness, `complete` flag, save rejection
    └── funnelEconomicsParity.test.ts    # NEW — frontend/backend completeness parity

src/
├── components/FunnelSettingsForm.tsx   # MODIFIED — new inputs, hints, margin preset, dual-path card, missing-field marking
├── App.tsx                             # MODIFIED — STRICTLY LIMITED: read `complete`, render passive badge
└── i18n.tsx                            # MODIFIED — badge string only

scripts/
├── sc11Guard.mjs                # UNCHANGED — must not be weakened
└── .sc11-allowlist              # UNCHANGED — FunnelSettingsForm.tsx must NOT be added
```

**Structure Decision**: Existing repository layout. No new top-level directories. The one new backend test file follows the established `functions/src/__tests__/*.test.ts` convention and must be appended to the `test` script in `functions/package.json`, which enumerates every test file explicitly.

## Implementation sequencing

### Batch 1 — Terminology guard (STANDS ALONE, blocking)

Approved scope expansion into `scripts/sc11Guard.mjs` and `scripts/sc11Guard.test.mjs`. **No funnel work begins until this batch is reported and cleared.**

1. **Strengthen `PERCENT_SIGN`** to `/[\d٠-٩۰-۹]+\s*[%٪]|percent/gi`, closing three of the four ways to write a percentage in Arabic copy (Arabic-Indic digits, the `٪` character, and their combination).
2. **Add a per-line suppression mechanism** — see the contract below.
3. **Tests** covering all four percentage forms plus the negative cases: bare `(%)` labels, bare `50` preset buttons, and a suppression with a missing or empty reason (**must hard-fail**).
4. **Run the guard across the whole repo and STOP.** Report the full hit list before any funnel work starts.

**Pre-verified by dry run (2026-08-31)**: with the allowlist active, both the current and the strengthened pattern PASS at 0 hits across 81 files. With the allowlist disabled, both produce an identical 68 hits across 10 files — **0 added, 0 removed**. The strengthening introduces no new hits in the current codebase; it is purely forward-looking.

> **Consequence**: because CI passes identically either way, the strengthening **cannot be validated by `npm run lint`**. Its correctness rests entirely on step 3's unit tests. A silently-broken pattern would be indistinguishable from a working one.

**Condition — pre-existing violations are REPORTED, NOT SUPPRESSED.** Any hit outside this phase's file list is pre-existing and must be left alone for separate triage. The new per-line mechanism MUST NOT be applied to code not written in this phase. The 68 known hits (27 in `App.tsx`, largely CSS values like `translateX(-50%)`) are already covered by pre-existing file-level allowlist entries; those entries are not modified and gain no additions.

#### Per-line suppression contract

```
// sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported metric"
```

| Rule | Enforcement |
|---|---|
| Must name a specific pattern code | Bare `sc11-allow` is **rejected** — no blanket form |
| Suppresses only that code, only on that physical line | No multi-line, no next-line, no block form |
| `reason="…"` mandatory and non-empty | Missing or empty reason is a **hard failure**, not a warning |
| Unknown pattern code | Hard failure |
| No file-level or directory-level variant | `.sc11-allowlist` is untouched and gains no entries |
| Every suppression is printed in guard output with its reason | Exceptions stay visible on every run, never silent |

### Batch 2 — Funnel economics

Hard dependency spine; nothing downstream is verifiable until the pure module is correct.

1. **`cpaEconomics.ts` first.** Pure, fully testable locally, consumed by everything else. Corrected formulas, `economicsVersion`, removal of both hardcoded constants. **`computeAdvisories`'s breaking signature change lands in the foundational phase**, not with the advisory story — deferring it would leave Phases 4–7 building against a signature that later changes, breaking the build between the change and its call-site updates.
2. **Fixtures alongside.** Every §6 worked example, the three margin rows, the three advisory rows, the 0.4999 boundary, and a case proving an unstamped payload gates.
3. **`funnelSettings.ts`.** Completeness predicate (single definition), new field validation, `complete` on the retrieval response, save rejection for every funnel type.
4. **Form.** New inputs, benchmark hints (now carrying `%` / `٪` honestly, each with a reasoned per-line suppression), margin preset, dual-path results card, missing-field marking.
5. **`App.tsx` badge.** Smallest change, strictly bounded.
6. **Observability log** in the sync (constitution VI).
7. **Parity test** (constitution XI).

Steps 1–2 deliver User Stories 1–2 and are independently shippable. Steps 3–5 deliver Stories 3–7.

## Verification strategy

**Locally verifiable**: the entire pure module, all fixtures, the guard, the parity test, and the form's rendering. This is the majority of the phase.

**Requires a deploy** (per report §13): `saveFunnelSettings` and `getFunnelSettings` behaviour, including the `complete` flag round-trip and the incomplete-record gate end to end. Rebuild sequence before deploy:

```powershell
Remove-Item -Recurse -Force functions/lib
cd functions; npm run build
firebase deploy --only functions
```

**The migration-safety check that matters most** (SC-010) can only be run post-deploy, against a workspace holding both a pre-existing settings record and pre-existing learning aggregates: confirm a full sync writes zero pass/fail verdicts, changes zero aggregates, shows the badge, and opens no modal by itself.

## Verification gaps found during analysis

Two independent gaps, either of which alone would let the guard hardening ship unverified:

1. **`scripts/sc11Guard.test.mjs` is executed by nothing.** `vitest.config.ts:11` restricts discovery to `src/**`; root `package.json` `test` is `vitest run`; `lint` runs the guard but not its tests. The file is referenced only by its own header comment. Every guard test written today would silently not run.
2. **CI cannot fail on the guard.** `.github/workflows/ci.yml:34` runs `npm run lint || true`, explicitly labelled "advisory — does not fail the pipeline".

Combined with the finding that `npm run lint` passes identically before and after the strengthening (dry run: 0 hit-count change), the guard's correctness would rest entirely on tests that never execute, behind a step that cannot fail. FR-059, FR-060, and FR-061 address this. Gap 2 is **reported, not fixed** — making CI blocking is a product decision outside this phase.

## Risks

| Risk | Mitigation |
|---|---|
| R-1's version stamp is mistaken for an epoch and extended | Explicitly bounded in R-1 and in `data-model.md`; constitution XII check calls it out by name |
| Implementer signals incompleteness by returning a null record, auto-pushing every owner | FR-043/FR-053 + R-3; called out in `contracts/funnelSettings.md` as a forbidden implementation |
| New copy lands in an allowlisted file and escapes the guard | FR-035a; `contracts/uiCopy.md` fixes the exact strings and their home file |
| Frontend and backend completeness rules drift | Parity test (constitution XI) |
| New test file omitted from the explicit `test` script list and silently never runs | Called out in Project Structure and `quickstart.md` |

## Complexity Tracking

No constitution violations require justification.
