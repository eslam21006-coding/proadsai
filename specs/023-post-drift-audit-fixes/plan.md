# Implementation Plan: Post-Phase-21 Drift Audit Remediation

**Branch**: `023-post-drift-audit-fixes` | **Date**: 2026-05-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-post-drift-audit-fixes/spec.md`

## Summary

Remediate every finding from the post-Phase-21 drift audit (recorded authoritatively in `MANUAL_QA_LOG.md`) in three sequential tiers: **Tier 1** launch blockers (user-facing — team invites, credit refunds, testimonial pipeline, copy-fidelity banner, per-workspace Meta routing, reflow face-stretch, plan-naming leaks, cultural-violation persistence, logo clamps), **Tier 2** system integrity (resolver inputs, CI wiring, team-access model, favorites quality, resolver parity), **Tier 3** post-launch observability (the keystone resolution-trace persistence, lane-fixture strength, prompt-assembly + storage). The technical approach is **wiring, not new features**: most fixes cross the `functions/src/index.ts` response-shaping / client-dispatch boundary (the systemic blind spot the audit identified) or persist a value that is currently computed-then-discarded. The `reflowImage` callable (`reflowImage.ts:492-519`) is the working reference implementation for the trace-persistence keystone. Every fix's Done condition is proven by end-to-end evidence per the 2026-05-21 proof protocol, and a new CI workflow (FR-216) gates the regression suites that previously never ran.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend `src/`), TypeScript 5.7 (backend `functions/src/`)
**Primary Dependencies**: React 19 + Zustand + Tailwind CSS 3 + Vite 7 (frontend); Firebase Cloud Functions v2 (onCall), Firebase Admin SDK, Firestore, Firebase Storage, Sharp ^0.33.5 (backend); Gemini 3.1 (text + image), Meta Marketing API (per-workspace ad-account routing)
**Storage**: Firestore (`generations/{genId}`, `users/{uid}` + subcollections `team`, `workspaces`, `projects`, `workspace_access_audit`, `creativeMemory`), Firebase Storage (`users/{uid}/projects/{projectId}/thumbnail.*`, `users/{uid}/reflows/*`)
**Testing**: Node `node:assert/strict` fixtures via `npm test` (backend, `functions/`); Vitest + axe (frontend a11y, `src/`); Firebase Local Emulator Suite for callable/Firestore integration verification; manual smoke for UI-render fixes (per the proof protocol)
**Target Platform**: Web app (browser frontend served from hosting; backend on Cloud Functions, region `europe-west1`)
**Project Type**: Web application (split frontend `src/` + backend `functions/`) — existing monorepo; remediation edits existing files, adds tests + a CI workflow, no new top-level structure
**Performance Goals**: No new performance targets — remediation preserves existing behavior. Cost discipline (Principle VIII) is advanced: Phase 7 stops charging for failed generations; FR-136 enforces server-side batch caps to prevent runaway runs
**Constraints**: Done conditions are end-to-end-proven (cross-boundary grep + real-data UI smoke + dead-code-reference grep + re-audit); doc-shape changes MUST be additive (no legacy-read breakage); production deploys are owner-performed (this branch is code-ready + emulator-verified); tiers are sequential gates (Tier 2 after SC-101, Tier 3 after SC-201)
**Scale/Scope**: 58 atomic fix requirements (FR-101…138 / 201…216 / 301…304) across ~15 frontend files, ~10 backend files, `functions/package.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, and a new `.github/workflows/ci.yml`. **Sequencing input resolved**: Phase 21 / Stripe-migration is confirmed merged, deployed, and smoke-tested (2026-05-21); the billing-touching fixes (FR-107/108 refund, FR-134/136 plan-gating) proceed against current code as specified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This remediation **advances** the constitution rather than competing with it — every tier closes existing violations. Gate status per principle:

| Principle | Status | How this work satisfies it |
|-----------|--------|----------------------------|
| I. Reliability over feature count | ✅ PASS | No new features; purely de-risks the existing surface. |
| II. The selected mode MUST be obeyed | ✅ ADVANCES | Phase 4 (testimonial pipeline actually runs), Phase 12 (workspace Meta routing), Phase 15 (brand inheritance), HOTFIX-F (deterministic reflow) make user selections actually execute instead of silently drifting. |
| III. Launch surface frozen/authoritative | ✅ PASS | MANUAL_QA_LOG.md is the authoritative source; no scope expansion. |
| IV. Behavior contracts beat judgment | ✅ ADVANCES | Every FR has an explicit Done condition; FR-302 strengthens lane fixtures to assert acceptance behavior. |
| V. Arabic quality first-class | ✅ ADVANCES | FR-113/114/131/135 add the missing **bilingual (EN+AR)** strings (toasts, notices, over-limit messages). |
| VI. Hidden machine layers auditable | ✅ ADVANCES | Tier-3 keystone FR-301 persists the resolution trace; FR-137 persists `culturalViolation`; FR-304 persists blueprint/resolved-prompt. |
| VII. No silent override w/o rule, signal, trace | ✅ ADVANCES | Phase 5 banner (FR-117), Phase 4 toast (FR-113), HOTFIX-F fallback notice (FR-131) add the missing user signals; FR-301 adds the trace. |
| VIII. Cost discipline | ✅ ADVANCES | Phase 7 (FR-108) stops charging for failed generations; FR-136 enforces server-side batch caps. |
| IX. Proof required for every fix | ✅ ADVANCES | The 2026-05-21 proof protocol binds every FR; FR-216 adds the CI gate; FR-205/206/214/215 make suites real and runnable. |
| X. Spec before code | ✅ PASS | This spec + plan precede implementation; clarifications recorded. |
| XI. Frontend and backend agree on truth | ✅ ADVANCES | FR-119/124/213 align client dispatch with deployed backend; FR-215 adds the resolver parity test. |
| XII. Deferred scope remains deferred | ✅ PASS | No deferred feature is activated; remediation only. |

**Gate result (pre-Phase-0): PASS, zero violations.** Complexity Tracking is empty (nothing to justify). One advisory: FR-009's silent-at-user-surface reinforcement (from the prior Phase-16 work) remains a documented Principle-VII deviation already justified upstream; this spec does not change it.

**Post-design re-check (after Phase 1): PASS, unchanged.** The Phase-0/Phase-1 artifacts introduce no new violations: all Firestore changes are additive (data-model §1, no migration), the design adds CI enforcement (Principle IX) and persists previously-discarded traces/signals (Principles VI/VII), and no new product surface or deferred scope is activated (Principles I/III/XII). There are no outstanding items: the Stripe-migration sequencing input (research R7) is resolved — Phase 21 is confirmed merged, deployed, and smoke-tested (2026-05-21).

## Project Structure

### Documentation (this feature)

```text
specs/023-post-drift-audit-fixes/
├── plan.md              # This file (/speckit.plan)
├── spec.md              # Feature spec (3 tiers, 58 FRs, clarifications)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   ├── team-invite-callables.md
│   ├── generation-failure-and-cost.md
│   ├── testimonial-dispatch.md
│   ├── copy-fidelity-warning.md
│   ├── workspace-meta-and-access.md
│   └── resolution-trace-persistence.md
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

This is an existing web-app monorepo; remediation edits existing files in place and adds tests + a CI workflow. No new top-level structure.

```text
src/                                  # Frontend (React 19 / Vite / TS 5.9)
├── main.tsx                          # FR-101 (/join route)
├── App.tsx                           # FR-105/106/110/112/113/114/117/121/124/125/126/129..133/134/207..210/213 + reflow dispatch
├── store.ts                          # FR-121 (hasInProgressWork selector)
├── i18n.tsx                          # FR-113/114/131/135 bilingual strings
├── creativeResolver.ts              # FR-215 parity target (frontend mirror)
├── components/
│   ├── InputForm.tsx                 # FR-115/126/134/135
│   ├── FeedbackButtons.tsx           # FR-207
│   ├── WorkspaceSwitcher.tsx         # FR-121
│   ├── WorkspaceSettingsModal.tsx    # FR-125
│   ├── WorkspaceAccessAuditPanel.tsx # FR-120 (wire in)
│   ├── Team page surface             # FR-119 (access matrix)
│   └── SavedProjectsPanel/*          # FR-208/209
├── pages/JoinTeam.tsx                # FR-102
└── services/
    ├── geminiService.ts              # FR-111 (register testimonial callable)
    ├── teamService.ts                # FR-103/104 client wrappers (already present)
    └── workspaceService.ts / project listing → FR-213

functions/                            # Backend (Cloud Functions v2 / TS 5.7)
├── package.json                      # FR-203/204/205/214 (test scripts)
└── src/
    ├── index.ts                      # FR-103/104/107/108/109/116/118/122/124/136 + boundary response shapes
    ├── generators.ts                 # FR-127/128/137/201/202/303/304
    ├── creativeResolver.ts          # FR-215 parity target (backend source of truth)
    ├── creativeScoringEngine.ts      # FR-128 (applyBrandColorDeduction)
    ├── reflowImage.ts                # FR-301 reference implementation (trace persistence)
    ├── workspaces/workspacePolicy.ts # FR-211 (resolveCallerScope team model)
    └── __tests__/                    # FR-205/214/215 + strengthened fixtures

firestore.rules                       # FR-122 (workspace/audit) + FR-212 (storage handled in storage.rules)
firestore.indexes.json                # FR-122 (composite indexes)
storage.rules                         # FR-212 (thumbnail size/ext cap)
.github/workflows/ci.yml              # FR-216 (NEW — build + npm test gate)
```

**Structure Decision**: Web-application monorepo (existing). No new modules or layers are introduced; the work is surgical edits to the files mapped above plus test additions and one CI workflow. This matches the audit's framing — the defects are integration/wiring gaps at the `index.ts` boundary and unpersisted values, not missing subsystems.

## Complexity Tracking

> No constitution violations — this section is intentionally empty. The remediation reduces complexity (removes dead code paths, dual-write bypasses, and unwired duplicates) rather than adding it.
