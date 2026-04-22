# Implementation Plan: Saved Projects (Phase 13)

**Branch**: `013-saved-projects` | **Date**: 2026-04-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-saved-projects/spec.md`

## Summary

Turn the existing in-app save/load shell into a launch-quality project library. Each saved project carries a derived status (`draft` / `rendered` / `published` — with `published` as a one-way latch), persists a durable thumbnail of its "cover image" (single → the image; carousel → slide 1; batch → item 1), and exposes a step-navigator so users can resume from any completed step rather than always landing on the project's last active step. Per-plan project caps are enforced at save time on both client and server (10 / 30 / unlimited for Starter / Pro / Scale, sourced from `PLANS.savedProjectLimit`). The list panel adds name search, workspace filter, status tabs, and per-card delete with confirmation that cascades to IndexedDB + Firestore + Firebase Storage. A debounced continuous auto-save replaces today's phase-change-only save, with a header indicator that escalates to a persistent non-blocking banner after 3 consecutive cloud-save failures. A new `getUserProjects` callable provides paginated, workspace-scoped listings reusing the Phase-12 workspace-access policy (`assertWorkspaceVisibility` style) so team members only see workspaces they are granted.

The implementation is additive: it extends `SavedProject` with two new fields (`status`, `thumbnailUrl`), wraps the existing `saveProjectToDB` / `saveProjectToFirestore` callsites with a status-deriver and a quota check, swaps the existing inline projects sidebar (currently in `App.tsx` ~lines 4849–4975) for a dedicated `SavedProjectsPanel` component, and introduces a small `useProjectAutoSave` hook that owns debounce + retry + indicator state. Pre-existing projects load with derived `draft` status (FR-022) and upgrade opportunistically on next save — no batch migration.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (functions)
**Primary Dependencies**: React 19, Zustand 4, Tailwind CSS 3, Vite 7 (frontend); Firebase Cloud Functions v2, Firebase Admin SDK, Firebase Auth, Firestore (functions); `firebase/storage` SDK (browser) for thumbnail upload
**Storage**:
- **Firestore** — `users/{uid}/projects/{projectId}` (existing subcollection; new fields `status` and `thumbnailUrl` added; existing 1 MB doc limit + base64-strip behaviour preserved)
- **IndexedDB** — `ProAdsDB_V2` database, `projects` object store keyed by `id`, `userId` index (existing — no schema change required, new fields ride on the same record)
- **Firebase Storage** — `users/{uid}/projects/{projectId}/thumbnail.jpg` for durable thumbnails (new path; storage rules must scope reads to the owner)
**Testing**: Node `assert/strict` fixture tests in `functions/src/__tests__/` and `functions/src/contractFixtures.test.ts` (existing pattern); frontend changes verified manually via `npm run dev` and the spec's user-story Independent Tests (no frontend test runner is in use today)
**Target Platform**: Web app (Chrome/Safari/Firefox latest), Firebase Cloud Functions v2 (Node 20)
**Project Type**: Web application (split frontend `src/` + backend `functions/`)
**Performance Goals**:
- Auto-save coalescing target — ≤ 2 cloud round-trips per 10 edits in 5 s (SC-007)
- Tab-close-to-reachable — ≤ 60 s after a single edit (SC-006)
- Project-list render — list of 30 projects with thumbnails renders in under 1 s after data is in memory (informs SC-003)
- `getUserProjects` server response — page of 50 projects returns in under 800 ms p95 (informs SC-003 list-load budget)
**Constraints**:
- Firestore single-doc 1 MB limit — preserved by the existing `saveProjectToFirestore` base64-strip path; thumbnails MUST be a Storage URL string, not an inline base64 in the project doc
- Local-only persistence MUST keep working when cloud saves fail (FR-017) so users editing offline never lose work
- Plan-cap enforcement MUST be present in both client UX and server callable (Constitution principle XI: frontend and backend must agree on truth) — the client check is for instant feedback, the server check is the authority
- `published` MUST be a one-way latch — never demote on save (FR-002); existing save callsites today recompute everything and would silently demote without an explicit `Math.max(prevStatus, derived)` step
**Scale/Scope**:
- Per-plan caps: 10 (Starter) / 30 (Pro) / unlimited (Scale) — see `src/planconfig.ts` `savedProjectLimit`
- Active user has typically < 50 projects per workspace; pagination page size = 50 default (cursor-opaque)
- Single-user concurrent device count assumed ≤ 3 (laptop + phone + tablet)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The Pro Ads AI Constitution v1.1.0 has 12 core principles. This phase touches the following:

| Principle | Relevance to Phase 13 | Status |
|-----------|-----------------------|--------|
| **I. Reliability Over Feature Count** | The phase deliberately bounds scope (no manual thumbnail re-pick, no archive, no full-text search, no per-slide thumbnail refresh). All cuts recorded in spec Assumptions. | ✅ Pass |
| **II. The Selected Mode MUST Be Obeyed** | Resume-at-target-step (FR-010/FR-011) explicitly preserves the user's intent. Step navigator never jumps the user to a step whose data is missing. | ✅ Pass |
| **III. Launch Surface Frozen** | Status taxonomy is exactly `draft / rendered / published` — no extra states. Per-plan caps come from the existing `PLANS` config, not new tier values. | ✅ Pass |
| **IV. Behavior Contracts Beat Subjective Judgment** | Every FR has a measurable acceptance scenario; SC-001 → SC-010 are quantified. Status latch (FR-002) is a hard rule with an Edge Case test. | ✅ Pass |
| **V. Arabic Quality Is First-Class** | Status badges combine colour + a short text label that ships in Arabic and English (FR-005, Clarification Q1). RTL layout mirrors the existing app shell. | ✅ Pass |
| **VI. Hidden Machine Layers MUST Be Auditable** | Status auto-derivation, thumbnail upload, cap-block events, and the 3-strike auto-save banner each emit a structured log line via the existing `console.info`/`console.warn` instrumentation pattern (no new tracing infra needed). | ✅ Pass |
| **VII. No Silent Override Without Rule, Signal, and Trace** | The published-latch is documented in FR-002 + Edge Case. The 3-strike escalation banner explicitly signals the user (FR-017). The cap-block message names the plan + cap (FR-008). | ✅ Pass |
| **VIII. Cost Discipline** | Auto-save coalesces (SC-007) so we never burn Firestore writes per keystroke. Thumbnail upload happens once per cover-image change (FR-004), not per render. List queries are paginated (FR-019). | ✅ Pass |
| **IX. Proof Required for Every Fix** | Acceptance criteria + SC are testable; Phase 13 will land with `contractFixtures.test.ts` cases for status derivation, latch, cap-enforcement on the callable, and access-deny on workspace visibility. | ✅ Pass |
| **X. Spec Before Code** | Spec ratified by `/speckit.specify` + `/speckit.clarify`. This plan precedes any implementation. | ✅ Pass |
| **XI. Frontend and Backend MUST Agree on Truth** | Both the client save path and the new `saveProjectToFirestore` server-side write path enforce the cap. The status latch is enforced server-side too — the client computes a hint, the server stores authoritative status. Workspace visibility is enforced server-side; client only filters for UX. | ✅ Pass |
| **XII. Deferred Scope MUST Remain Deferred** | "Manual thumbnail re-pick", "archive", "soft delete", "tag search", "per-slide thumbnail refresh" are explicitly out of scope in spec Assumptions. | ✅ Pass |

**Gate result: PASS** — no violations. No entries required in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/013-saved-projects/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output — decisions for thumbnail upload, status latch, debounce window, pagination contract
├── data-model.md        # Phase 1 output — SavedProject extension, ProjectThumbnailAsset, derivation rules
├── quickstart.md        # Phase 1 output — manual end-to-end verification recipe per user story
├── contracts/
│   ├── getUserProjects.md      # Phase 1 — callable contract (request, response, errors, pagination)
│   ├── saved-project-shape.md  # Phase 1 — extended TS interface contract
│   └── storage-rules.md        # Phase 1 — Firebase Storage path + access rule for thumbnails
├── checklists/
│   └── requirements.md         # Already produced by /speckit.specify
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/                                                  # React 19 + Vite 7 frontend (existing)
├── types.ts                                          # ✏️ EXTEND  SavedProject: + status, + thumbnailUrl
├── planconfig.ts                                     # ✓ READ-ONLY  source of truth for savedProjectLimit
├── store.ts                                          # ✓ READ-ONLY  activeWorkspaceId, current saveStatus indicator
├── App.tsx                                           # ✏️ MODIFY  saveProjectToDB / saveProjectToFirestore wrappers + loadProject(targetPhase)
├── lib/
│   ├── projectStatus.ts                              # ➕ NEW  deriveStatus(prev, project) — pure function, monotonic latch
│   ├── projectCoverImage.ts                          # ➕ NEW  resolveCoverImage(project) — single | carousel slide 1 | batch item 1
│   ├── projectThumbnail.ts                           # ➕ NEW  uploadAndPersistThumbnail(uid, projectId, dataUrl) → storage URL
│   └── projectAutoSave.ts                            # ➕ NEW  debounce + 3-strike escalation logic (no React deps)
├── hooks/
│   └── useProjectAutoSave.ts                         # ➕ NEW  React hook over projectAutoSave.ts; owns indicator state
├── components/
│   ├── SavedProjectsPanel/                           # ➕ NEW  dedicated panel (replaces inline list in App.tsx)
│   │   ├── SavedProjectsPanel.tsx                    #         list + filters + search header
│   │   ├── SavedProjectCard.tsx                      #         thumbnail + name + badge + dot navigator + delete
│   │   ├── ProjectStatusBadge.tsx                    #         colour + Arabic/English label
│   │   ├── ProjectStepNavigator.tsx                  #         5 dots, click-to-resume-at-step
│   │   ├── ProjectFilters.tsx                        #         search + workspace dropdown + status tabs
│   │   ├── DeleteProjectDialog.tsx                   #         confirmation modal
│   │   └── SaveStatusIndicator.tsx                   #         header indicator (Saving… / Saved / failure / persistent banner)
│   └── (existing) FavoritesPanel.tsx                 # ✓ READ-ONLY  unaffected; pattern reference for sort/filter
├── i18n/
│   └── savedProjects.ts                              # ➕ NEW  Arabic + English label strings (status badges, dialog copy, banner copy)
└── firebase.ts                                       # ✓ READ-ONLY  storage already exported

functions/                                            # Firebase Cloud Functions v2 backend (existing)
├── src/
│   ├── index.ts                                      # ✏️ MODIFY  export new callable getUserProjects + augment any existing project save callsite to enforce cap + status latch
│   ├── savedProjects/
│   │   ├── getUserProjects.ts                        # ➕ NEW  callable; reuses workspaces/workspacePolicy.assertWorkspaceVisibility
│   │   ├── projectStatus.ts                          # ➕ NEW  server mirror of src/lib/projectStatus.ts (one source of truth wins; both import from a shared declaration if practical)
│   │   ├── projectQuota.ts                           # ➕ NEW  enforceProjectQuota(uid, plan) txn-safe
│   │   └── thumbnailDelete.ts                        # ➕ NEW  storage-side delete helper for cascade on project delete
│   ├── workspaces/
│   │   └── workspacePolicy.ts                        # ✓ READ-ONLY  reuse assertOwner / workspace-visibility helpers
│   └── __tests__/
│       └── savedProjects.test.ts                     # ➕ NEW  Node assert/strict tests: status derivation, latch, cap enforcement, getUserProjects access, pagination

storage.rules                                         # ✏️ MODIFY  add rule: read/write users/{uid}/projects/{projectId}/thumbnail.jpg only by uid
firestore.rules                                       # ✓ READ-ONLY  no change; existing users/{uid}/projects rules already cover the new fields

docs/
└── LAUNCH_MATRIX.md                                  # ✓ READ-ONLY  source of truth — rows 13.1–13.10 implemented; DoD #16 satisfied
```

**Structure Decision**: Web application split (Option 2 from the template). Frontend lives in `src/`, backend in `functions/`, shared types currently duplicated by hand (existing convention). The new `lib/projectStatus.ts` and `functions/src/savedProjects/projectStatus.ts` MUST agree on the latch logic — Phase 0 research will pick the de-duplication strategy (shared file via Vite alias vs. hand-mirror with a shared fixture test). The new `SavedProjectsPanel/` directory groups all UI for the project library together rather than scattering files under `src/components/`. Existing `assertWorkspaceVisibility` from Phase 12 is reused — Phase 13 does not introduce a new access-control layer.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Section intentionally left empty.
