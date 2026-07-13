# Implementation Plan: Phase 14 — RAG + Meta Reporting Feedback Loop

**Branch**: `phase-14-rag-meta` | **Date**: 2026-07-04 | **Spec**: `specs/phase-14/spec.md`
**Inputs**: `spec.md`, `research.md`, `data-model.md`, `contracts/`, `qarar-rulebook.md`
**Verdict source of truth**: `specs/phase-14/qarar-rulebook.md`

## Summary

Phase 14 closes the loop between real Meta ad performance and the generation engine so the AI generates from **what actually worked in each user's own Meta ad account**. Seven layers build on each other: (1) Funnel Settings → per-account target CPA/CPL; (2) a 3am scheduled sync (dispatcher + Cloud Tasks worker) that pulls Meta performance; (3) perceptual-hash image matching that attributes Meta ads back to generations; (4/4b) the Qarar verdict engine + two-component (hook / visual) learning, gated by campaign objective; (5) a plain-Arabic "What's Working" dashboard; (6) account-grounded hook-angle icons in Step 1; (7) silent RAG injection + wiring the top-5 recent S1 winners into the Phase 20 Concept Director. Everything is **scoped per workspace and per ad account**, additive to Firestore, fail-open, and degrades to today's exact behavior when Meta data is absent (FR-025 / SC-10).

**Technical approach** (from research): reuse `metaService.ts` for OAuth and `sharp` for a 64-bit dHash; store the long-lived Meta token **KMS-envelope-encrypted in a server-only Firestore doc**; fan the daily sync out as **one Cloud Task per account** with retries + a concurrency cap; implement verdicts/learning/economics/RAG as **pure, unit-testable modules**; append RAG to existing personalization and route any prompt-string addition through the single `buildFinalImagePrompt()` injection point.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: Firebase Cloud Functions v2 (`onSchedule`, `onTaskDispatched`, `onCall`), Firebase Admin SDK, Firestore, Cloud Storage, Cloud Tasks, Cloud KMS, `sharp ^0.33.5`, Meta Graph API; React 19, Zustand, Tailwind CSS 3, Vite 7
**Storage**: Firestore — workspace-scoped subcollections under `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/…` (additive only); Cloud Storage (existing image path)
**Testing**: `vitest` in `functions/` — pure-module unit tables (economics, dHash, verdicts, learning, RAG gating) + contract fixtures; frontend lint QA for SC-11
**Target Platform**: Firebase Cloud Functions `europe-west1` (project `proadsai-saas`) + web frontend
**Project Type**: web (frontend `src/` + backend `functions/src/`)
**Performance Goals**: sync fans out so each per-account task stays within the CF execution limit; concurrency cap (default 5) protects Meta rate limits & CF quota; image-match accuracy **> 90%** for unedited uploads (SC-3)
**Constraints**: additive Firestore (all new fields optional); lazy `getDb()` (never `admin.firestore()` at module load); derived data in request/response payloads (not module globals); **no server-side `genId` writes** in `serverGenerateFinalAd`; single prompt injection point `buildFinalImagePrompt()`; **all Arabic UI copy plain-language, "متوسط" only, zero "ميديان"/"CTR"/"CPM"/"CPA"/percentages** (SC-11); Meta token encrypted at rest, never client-exposed; PowerShell terminal; merges via GitHub UI only
**Scale/Scope**: many workspaces per user, 1 ad account per workspace (1:1); last-7 snapshot retention/account; RAG gate ≥ 10 conversion-matched account-wide; per-angle icon gate ≥ 3 conversion-matched

**Unknowns**: none remaining — the three clarify-deferred decisions (queue backend, token-at-rest store, hash library) are resolved in `research.md` (§B Cloud Tasks, §C KMS-in-Firestore, §A `sharp` dHash). No NEEDS CLARIFICATION.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1 design.*

| Principle | Compliance |
|---|---|
| **I. Reliability over feature count** | Every layer degrades gracefully; no-Meta / below-threshold path is byte-identical to today (FR-025, SC-10). Idempotent sync; 7-snapshot pruning. **PASS** |
| **II. Selected mode obeyed** | Icons are informational only; never block/alter the user's chosen angle (FR-020). RAG is "inform, not rigidly copy". **PASS** |
| **III. Launch surface authoritative** | Additive; touches no launch-lane combination rules. **PASS** |
| **IV. Behavior contracts** | Qarar rules have explicit ordered pass/fail (spec §5.2, `qararVerdict.md`); acceptance scenarios per story; SC-1…SC-12 measurable. **PASS** |
| **V. Arabic first-class** | All user-facing copy plain Arabic; "متوسط" only; SC-11 lint gate. **PASS** |
| **VI. Hidden layers auditable** | Sync snapshots, per-ad verdict+diagnosis, `resolutionTrace.performanceContext`, match type/distance all traced. **PASS** |
| **VII. No silent override without rule+signal+trace** | Cap warning signaled (FR-002); match precedence explicit + logged; RAG fail-open logged; 1:1 conflict shows a plain-Arabic reason (FR-026). **PASS** |
| **VIII. Cost discipline** | RAG gate ≥ 10; fail-open (no wasted retries); idempotent sync; async insights + backoff; snapshot pruning. **PASS** |
| **IX. Proof for every fix** | Pure modules unit-tested against rulebook worked examples; quickstart supplies reproducible inputs. **PASS** |
| **X. Spec before code** | Full spec + clarifications complete before this plan. **PASS** |
| **XI. Frontend/backend agree** | 1:1 mapping + funnel gating enforced server-side (never trust client `derived`/verdicts); icons computed server-side. **PASS** |
| **XII. Deferred scope stays deferred** | Copy/caption learning explicitly out of v1; art-direction gaze override deferred (Phase 19). **PASS** |

**Result: PASS — no violations. Complexity Tracking empty.**

## Project Structure

### Documentation (this feature)

```text
specs/phase-14/
├── plan.md                      # this file
├── research.md                  # Phase 0 — decisions (hash, queue, token store, retrieval, verdicts, reuse)
├── data-model.md                # Phase 1 — Firestore schemas, indexes, security (workspace-scoped)
├── quickstart.md                # Phase 1 — per-layer end-to-end verification
├── qarar-rulebook.md            # verdict source of truth (existing)
├── contracts/
│   ├── funnelSettings.md        # save/getFunnelSettings (Layer 1)
│   ├── metaSyncAndConnection.md # connect/disconnect, metaDailySync, worker, triggerMetaSync (Layer 2)
│   ├── imageMatching.md         # fingerprint, sync match, linkUnmatchedAd, backfill (Layer 3)
│   ├── qararVerdict.md          # verdict engine + two-component learning (Layer 4/4b)
│   ├── dashboardAndIcons.md     # dashboard + hook-angle icons (Layer 5/6)
│   └── ragAndWinners.md         # RAG injection + getPastWinningAds (Layer 7)
├── checklists/requirements.md
└── tasks.md                     # 66 tasks by user story (generated by /speckit.tasks; current)
```

### Source Code (repository root)

```text
functions/src/                         # backend (TS 5.7)
├── cpaEconomics.ts          (new)      # pure — CPA/CPL derivation (rulebook §2.2–2.3)
├── perceptualHash.ts        (new)      # pure — sharp 64-bit dHash + Hamming + ambiguity rule
├── campaignObjective.ts     (new)      # pure — Meta objective → conversion|other (fail-safe)
├── targetingContext.ts      (new)      # pure — geo tier + audience type classifiers
├── qararEngine.ts           (new)      # pure — ordered verdict rules + diagnosis ladder
├── learningAggregates.ts    (new)      # hook/visual aggregate updates (byObjective)
├── ragContext.ts            (new)      # getRAGContext + PERFORMANCE_CONTEXT blocks
├── tokenCrypto.ts           (new)      # KMS envelope encrypt/decrypt for Meta token
├── metaGraph.ts             (new)      # Graph API fetch helpers (hierarchy, insights, async)
├── metaSync/                (new)      # metaDailySync (onSchedule) + metaSyncAccountWorker (onTaskDispatched)
├── backfillImageFingerprints.ts (new) # one-time migration
├── index.ts                 (extend)   # register callables; route winners into Concept Director
├── generators.ts            (extend)   # append RAG at hook + build-plan points via buildFinalImagePrompt
├── conceptDirector.ts       (extend)   # consume pastWinningAds (already parameterized)
└── metaService.ts           (extend)   # long-lived token capture + 1:1 connect/disconnect

src/                                    # frontend (TS 5.9)
├── components/FunnelSettingsForm.tsx (new)   # Layer 1 — 4-type funnel form, cap warning, advisory cards, monthly review
├── components/WhatsWorkingDashboard.tsx (new)# Layer 5 sidebar dashboard (6 sections)
├── components/InputForm.tsx (extend)         # Layer 6 hook-angle icons in Step 1/2
└── services/metaService.ts  (extend)         # connect/disconnect + sync-now wiring

firestore.indexes.json (extend) · firestore.rules (extend, server-only private/**)
```

**Structure Decision**: existing **web app** layout (`src/` + `functions/src/`). Phase 14 adds pure backend modules + three Cloud Function entry types (scheduled, task-dispatched, callable) and two new frontend surfaces, extending — never rewriting — the modules listed in spec §12.

## Implementation Phasing (layer-aligned, independently shippable)

Each phase maps to a user story, is behind a lightweight capability check, and is reversible on its own.

- **Phase A — Layer 1 (US1, P1, MVP)**: `cpaEconomics.ts` (derivation for all **4 funnel types** — paid CPA w/ optional HTO, `free_webinar` + `lead_magnet_call` CPL — plus `computeAdvisories`) + `saveFunnelSettings`/`getFunnelSettings` + the settings form (funnelType-branched fields, strict 3-option ROAS enum, cap warning, **§2.6 advisory cards** with book-a-call CTA and persisted per-card dismissal) + monthly review. Standalone value; no Meta data needed. *Reversible: remove the route + callables.*
- **Phase B — Layer 2/3 (US2+US3, P1)**: `tokenCrypto.ts`, `metaGraph.ts`, `perceptualHash.ts`, `targetingContext.ts`, `campaignObjective.ts`, the `metaDailySync` dispatcher + `metaSyncAccountWorker`, `triggerMetaSync`, 1:1 connect/disconnect, fingerprint write-path + `backfillImageFingerprints`, `linkUnmatchedAd`. Populates the data the rest consumes. *Reversible: sync is additive; disabling it leaves Phase A intact.*
- **Phase C — Layer 4/4b (US4+US5, P2)**: `qararEngine.ts` + `learningAggregates.ts` wired into the worker; writes verdicts + aggregates. *Reversible: skip the verdict/aggregate write step.*
- **Phase D — Layer 5/6 (US6+US7, P3)**: `getWhatsWorkingDashboard` + dashboard UI; `getHookAnglePerformance` + Step-1 icons. *Reversible: hide the surfaces; short-circuit callables.*
- **Phase E — Layer 7 (US8, P3)**: `ragContext.ts` appended at three injection points + `getPastWinningAds` into the Concept Director. *Reversible: pass `[]` / return `insufficient` to restore byte-identical generation (SC-10).*

## Cross-cutting constraints (every phase)

- CF region `europe-west1`, project `proadsai-saas`; lazy `getDb()`.
- Workspace-scoped isolation everywhere; **no cross-workspace fingerprint search / linking** (FR-023, Edge Case 13).
- No server-side `genId` writes; fingerprint written client-side after `addDoc`.
- Prompt additions only via `buildFinalImagePrompt()`; RAG appended to existing personalization, never replacing.
- All Arabic UI copy plain-language, "متوسط" only; CI/QA asserts zero forbidden terms (SC-11).
- Meta token KMS-encrypted, server-only; refresh proactively; refresh failure → `needsReauth`, never delete data.

## Testing strategy

| Phase | Key tests |
|---|---|
| A | `cpaEconomics` table — all 4 types (paid $86→$74 cap, equality-no-warn, paid no-HTO $47→$23.50, `lead_magnet_call` $105, `free_webinar` $22.33) + advisory triggers (noHto, value<$9); persistence round-trip; per-card dismissal persistence; review-due |
| B | dHash survives JPEG re-upload (match) + distinct images (no match) + ambiguity→unmatched; token encrypt/decrypt round-trip; dispatcher enqueues per connected account; idempotent + partial-failure isolation; backfill idempotent; 1:1 conflict blocked |
| C | verdict order/first-match table (⏳/CB2/K3/S1 + diagnosis); objective gating (SC-12: no kills on awareness/reach); same-image-multi-context best-result; alias resolution |
| D | dashboard section shapes; SC-11 zero-forbidden-terms; icon gate (<3 → none) + 🔥/✅/⚠️ thresholds + tooltip has no numbers; informational (non-blocking) |
| E | RAG gate (<10 skip = byte-identical; ≥10 inject at both points); winners = 5 most-recent S1, deleted-gen excluded; fail-open → `[]` |

## Complexity Tracking

> No Constitution violations — no entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
