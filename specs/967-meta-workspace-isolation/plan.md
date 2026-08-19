# Implementation Plan: Workspace-Aware Meta Integration

**Branch**: `967-meta-workspace-isolation` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/967-meta-workspace-isolation/spec.md`

## Summary

Make the workspace the unit of Meta identity, and make team members first-class operators of the owner's account.

Five connected defects are fixed together: Meta operations act on the caller instead of the account that owns the data; Facebook Page selection is account-global rather than per-workspace; publishing ignores the active workspace and uses the account-global ad account; the workspace selector shows 3 of 9 workspaces; and team members are blocked from linking ad accounts.

**Technical approach.** Route all 15 authenticated Meta entry points through `resolveCallerScope`, honouring its `readDegraded` signal. Add `metaPageId` / `metaPageName` / `metaPageClearedAt` to the workspace document, and resolve both ad account and Page from the workspace server-side, never from `metaConnections`. Resolve the OAuth callback's identity to the owner after reading it, leaving the `state` parameter itself untouched so the deferred state-trust phase stays unblocked. Repair the legacy workspace documents whose missing `deletedAt` field is what actually hides the six workspaces.

Phase 0 completed the FR-025 root-cause investigation and surfaced a second, undocumented defect that blocks the agreed publish fallback (R4).

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, Firestore, React 19, Zustand 4, Tailwind CSS 3, Vite 7
**Storage**: Firestore — `metaConnections/{ownerUid}`, `users/{ownerUid}/workspaces/{id}`, `creativeDeployments/{id}`. Additive fields only; no collection created or removed
**Testing**: `cd functions && npm test` (node:test, TAP); frontend `npm run build` + `npm run lint`
**Target Platform**: Firebase Cloud Functions v2 in `europe-west1`; browser SPA
**Project Type**: Web application — React frontend (`src/`) + Firebase Functions backend (`functions/`)
**Performance Goals**: No new latency budget. Each converted callable adds at most one Firestore read (the caller-scope lookup) already incurred by comparable non-Meta callables
**Constraints**: Publishing behaviour for single-workspace accounts must not change (FR-012b); a code-only revert must restore current behaviour with no data cleanup (FR-029–FR-031); Arabic parity is a release gate (FR-028a)
**Scale/Scope**: 19 server entry points (15 converted, 4 bespoke), 3 new workspace fields, 3 new deployment-record fields, ~6 frontend call sites, 5 new user-facing message pairs

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1.*

| Principle | Assessment | Verdict |
|---|---|---|
| I — Reliability over feature count | Adds no feature surface. Removes an incorrect routing path. | **Pass** |
| II — The selected mode MUST be obeyed | This is the principle the phase enforces: the selected *workspace* is currently ignored at publish time. FR-013/FR-014 make the selection binding. | **Pass** |
| III — Launch surface frozen | No new launch combination. Widens one permission by explicit product decision, recorded in the spec's Clarifications. | **Pass** |
| IV — Behaviour contracts beat judgement | `contracts/callable-contracts.md` defines per-callable inputs, outputs, error reasons, and an 18-row test matrix. | **Pass** |
| V — Arabic quality is first-class | FR-028a–c make paired en/ar a release gate, simple Fusha, no dialect or technical terms. SC-012 measures it. | **Pass** |
| VI — Hidden machine layers auditable | Workspace resolution, Page-source resolution, and caller identity are all traced: `workspaceIdSource`, `pageSource`, `pushedByUid`, `connectedByUid`. | **Pass** |
| VII — No silent override without rule, signal, trace | The FR-011 Page clear has all three: rule (FR-011), signal (FR-011b notice, `pageCleared` in the C2 response), trace (`metaPageClearedAt`). The legacy Page fallback has rule (FR-007) and trace (`pageSource`). | **Pass** |
| VIII — Cost discipline | No new model calls. One extra Firestore read per call; publishing fails earlier (before the Meta upload) when a workspace has no ad account. | **Pass** |
| IX — Proof required for every claimed fix | R1 supplies the failing rule, the controlling file and line, the causal commit, why it happened, and what changes. The remaining fixes carry contract tests. | **Pass — with a caveat** |
| X — Spec before code | Spec + 9 clarifications + research + data model + contracts precede implementation. | **Pass** |
| XI — Frontend and backend agree on truth | The server resolves the ad account and Page and ignores caller-supplied values (FR-013); the frontend sends `workspaceId` but cannot override the outcome. | **Pass** |
| XII — Deferred scope stays deferred | The OAuth state-trust fix, workspace-scoped performance data, and the Page publish gate are each deferred with a written reason (FR-015b records the last one explicitly). | **Pass** |

**Principle IX caveat**: R1's root cause is established from code and commit history and predicts the reported 3-of-9 split, but has **not** been confirmed against live data. Before/after evidence on the nine-workspace account is required for the fix to satisfy IX. Recorded as a gate in `quickstart.md` step 1.

**Gate result: PASS.** No violations to justify; `Complexity Tracking` is therefore omitted.

### Post-Phase 1 re-evaluation

Re-checked after the data model and contracts were written. No new violations. Two design choices were made specifically to hold Principle VII: `metaPageClearedAt` exists so the auto-clear leaves a trace and so a cleared Page cannot silently inherit the global one, and `pageSource` exists so the legacy fallback is never invisible. Principle VI drove `workspaceIdSource` — without it, a server-resolved default workspace would be indistinguishable from a caller-named one in the audit record.

## Project Structure

### Documentation (this feature)

```text
specs/967-meta-workspace-isolation/
├── plan.md                          # This file
├── spec.md                          # Requirements + 9 clarifications
├── research.md                      # Phase 0 — R1..R8, Bug 4 root cause
├── data-model.md                    # Phase 1 — fields, Page state machine
├── quickstart.md                    # Phase 1 — sequencing, verification, traps
├── contracts/
│   └── callable-contracts.md        # Phase 1 — C1..C11, tests T-01..T-18
├── checklists/
│   └── requirements.md              # Spec quality checklist (16/16)
└── tasks.md                         # Phase 2 — created by /speckit.tasks
```

### Source code

```text
functions/src/
├── index.ts                              # 11 Meta entry points (C1–C9)
│   ├── metaOAuthCallback         :3196   # C7 — resolve identity to owner
│   ├── getMetaConnection         :3340   # C6
│   ├── metaSelectAccount         :3366
│   ├── metaSelectPage            :3404   # C1 — becomes workspace-scoped
│   ├── metaDisconnect            :3437   # C8
│   ├── metaSyncPerformance       :3458   # C9 — identity only
│   ├── metaPushCreative          :3686   # C4 — :3709 is the Bug 3 line
│   ├── metaPushCreativePack      :5705   # C5 — :5733 is the fallback to delete
│   ├── createWorkspace           :6470   # R4 — isDefault never true
│   ├── updateWorkspace           :6546   # R7 — extend forbidden list
│   ├── linkMetaAccountToWorkspace:6701   # C2 — drop the team-member block
│   └── unlinkMetaAccount…        :6756   # C3 — clear Page on unlink
├── funnelSettings.ts                     # C10 — 3 callables
├── metaConnection.ts                     # C11 — connect/disconnect
├── metaSync/{trigger,dispatcher,worker}.ts  # C9 + 2 unauthenticated entry points
└── workspaces/
    ├── workspacePolicy.ts        :263    # resolveCallerScope (R3)
    │                             :161    # resolveDefaultWorkspaceId (R4)
    └── metaRoleProbe.ts                  # helper, no uid

src/
├── App.tsx                       :2668   # workspace subscription — R1 root cause
│                                 :12664  # Funnel Settings selector
│                                 :3785   # Page picker call site
├── components/
│   ├── MetaPagePickerModal.tsx           # pass workspaceId
│   ├── FunnelSettingsForm.tsx            # no change expected after R1
│   └── LinkAdPickerModal.tsx             # surface pageCleared notice
├── services/metaService.ts       :234    # pushCreative — send workspaceId
│                                 :287    # pushCreativePack — rename param
└── i18n.tsx                              # paired en/ar keys (FR-028a)

firestore.rules                   :86     # workspaces — members read-only (R6)
```

**Structure Decision**: The existing frontend/backend split is used unchanged. No new module is introduced: the caller-scope helper, the workspace policy guards, and the i18n mechanism all already exist, and this phase extends their reach rather than adding a layer. That directly serves FR-029 — a code-only revert restores current behaviour because nothing new has to be unwound.

## Phase 0 — Research

**Complete.** See [research.md](./research.md).

Headline findings:

- **R1 (blocking)** — The workspace query at `src/App.tsx:2685-2689` combines `where('deletedAt','==',null)` with `orderBy('createdAt','desc')`. Firestore's `== null` matches only documents where the field **exists** and is null. Workspaces created before commit `1f23d5e` (2026-05-21) were written client-side without a `deletedAt` key and are therefore excluded from the result set entirely — before any client-side filter runs. That is why PR #65's filter removal changed nothing, and it predicts the reported 3-of-9 split. The pre-`1f23d5e` code filtered client-side, where JavaScript's `undefined == null` quietly did the right thing; moving the predicate into the query changed its meaning.
- **R4 (blocking)** — No server path writes `isDefault: true`; `createWorkspace` hard-codes `false`. `resolveDefaultWorkspaceId` therefore throws on every account onboarded after 2026-05-21, which breaks the FR-012 default-workspace fallback agreed during clarification.
- **R2** — 19 entry points confirmed: 15 authenticated (convert to `resolveCallerScope`), 4 without a caller (OAuth callback, data deletion, scheduled sync, task worker).
- **R6** — Security rules give team members **read-only** access to workspace documents, so FR-017/FR-018 must be delivered through callables. No rules change is needed.

## Phase 1 — Design & Contracts

**Complete.** [data-model.md](./data-model.md) · [contracts/callable-contracts.md](./contracts/callable-contracts.md) · [quickstart.md](./quickstart.md)

- **Data model** — three new workspace fields, three new deployment-record fields, a four-state Page lifecycle (`NEVER_SET → SET → CLEARED → SET`). `metaPageClearedAt` is load-bearing: it separates "never chosen" (legacy fallback applies) from "deliberately cleared" (it must not), which is what makes FR-011a enforceable.
- **Contracts** — C1–C11 with request shapes, resolution order, error reasons, and responses; a universal preamble that fixes the `readDegraded` handling in one place; 18 contract tests mapped to requirements.
- **Agent context** — `update-agent-context` targets an `opencode`-configured project (`.specify/init-options.json`) and has no `CLAUDE.md` variant to update here. `CLAUDE.md` should gain this phase's entry at implementation time, matching the existing "Recent Changes" convention.

## Phase 2 — Task planning approach

`tasks.md` resolves the tension between dependency order and user-story priority by absorbing the blocking work into a **Foundational phase**, after which the story phases run in priority order. The generated structure is:

| Phase | Contents | Tasks |
|---|---|---|
| 1 — Setup | Shared type and string scaffolding | T001–T004 |
| 2 — Foundational ⚠️ | The R1 + R4 repair, the `createWorkspace` source fix, the Page field-write lock, and the shared caller-scope guard | T005–T022 |
| 3 — US1 (P1) 🎯 | Publish routing, plus the single-workspace-plan regression check | T023–T043 |
| 4 — US2 (P2) | Per-workspace Page, plus the legacy-fallback regression check | T044–T056 |
| 5 — US3 (P3) | The caller-identity conversions and the OAuth callback | T057–T075 |
| 6 — US4 (P4) | Team-member linking and Page clearing | T076–T085 |
| 7 — US5 (P5) | Listing verification and Principle IX evidence | T086–T091 |
| 8 — Polish | Language parity, rollback verification, build gates | T092–T099 |

**Why User Story 5 has no implementation phase**: its root cause is the legacy-record defect (R1), which also hides the workspaces every other story depends on, and the same repair supplies the default marker User Story 1's publish fallback needs (R4). The repair therefore belongs in Foundational, where it blocks everything. Phase 7 is US5's verification and evidence capture, not its fix.

**Why the story phases are in priority order despite the dependency note in `quickstart.md`**: once Foundational lands, US1 through US4 are genuinely independent of one another. `quickstart.md` sequences by *implementation convenience*; `tasks.md` sequences by *deliverable value*, with the true blockers hoisted into Phase 2. Both orderings preserve the same dependency graph — see the Dependencies section of `tasks.md` for the two edges that survive (T051→T060 on `getMetaConnection`, and T031 before US4's clearing writes).

Every story phase lands behind its own contract tests (24 of them, T-01–T-24), so stopping after any checkpoint leaves a coherent, shippable state.

## Resolved decisions

Both blocking decisions were answered by the product owner on 2026-08-18. No open decisions remain.

| # | Decision | Outcome |
|---|---|---|
| 1 | Does the "no backfill script" non-goal cover repairing legacy workspace documents missing `deletedAt`? | **No — repair is in scope.** The non-goal covers the Page migration only, which stays lazy. Repairing structurally malformed records is a defect fix. R1 **Option A**. Spec non-goal reworded; FR-026c added. |
| 2 | How is "the default workspace" defined, given `isDefault: true` is never written? | **Fix at source and repair.** `createWorkspace` marks the first workspace on an account as default; existing accounts get their oldest active workspace marked. R4 **Option A**. FR-026d added. |

Both are executed as **one repair pass** over the same documents (`data-model.md` §5), gated on the ordering constraint recorded there: the `deletedAt` repair must land for an account before its default is chosen, since the legacy documents are precisely the ones a `deletedAt`-constrained read cannot see.

The source fix must sit **inside** the existing `createWorkspaceWithLimit` transaction. Outside it, two concurrent creations on a fresh account can both claim the default. Without it, the repair decays — every account created afterwards would again have none.
