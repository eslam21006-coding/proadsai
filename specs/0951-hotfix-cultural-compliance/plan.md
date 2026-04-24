# Implementation Plan: Cultural Compliance Hotfix (Arabic Market Guardrails)

**Branch**: `0951-hotfix-cultural-compliance` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/0951-hotfix-cultural-compliance/spec.md`

## Summary

Pure guardrail hotfix for the Arabic market. No new user-facing features; no changes to English-language behavior. The hotfix retrofits four parallel layers so that an Arabic ad cannot render or deliver haram content end-to-end:

1. **Data layer** (`src/universeDatabase.ts`): add an `arabicSafe: boolean` flag to every universe entry; mark seven entries as not Arabic-safe (`r_wine_cellar`, `r_wine_tasting`, `r_rooftop_bar`, `r_cigar_lounge`, `r_vineyard`, `r_dance_studio`, and the renamed `r_sushi_bar` → `r_sushi_counter`); sanitize the `visualMotifs` array on every entry by replacing any string in a `HARAM_MOTIFS` list with a culturally neutral equivalent (`champagne` → `sparkling drinks`, `cocktails` → `premium beverages`, etc.). All downstream consumers get clean motifs by default.
2. **UI layer** (`src/components/InputForm.tsx`, store / language-switcher wiring): hide `arabicSafe: false` entries from every universe picker when the ad language code begins with `ar`; on mid-session English → Arabic switch, auto-clear only the environment field and show an inline picker prompt (per clarification Q2); on saved-project load under an Arabic configuration, preserve the full project and block only the Generate action until an Arabic-safe environment is chosen (per clarification Q1); silently remap legacy `r_sushi_bar` identifiers to `r_sushi_counter` on load.
3. **Prompt layer** (`functions/src/generators.ts`): inject a `CULTURAL_COMPLIANCE` block into `generateBuildPlan()` and again into `buildFinalImagePrompt()` for every Arabic ad — single, every carousel slide, and every batch item; inject an Arabic wardrobe modesty block into the wardrobe section; neither block is injected when the ad language does not begin with `ar`.
4. **Validation layer** (`functions/src/generators.ts` + `functions/src/resolutionTrace.ts` + `functions/src/types.ts`): after the build plan parses, run a trigger-word scan against a shared `TRIGGER_WORDS` list and replace each hit in **both** the technical-prompt text and the user-facing ad copy (hook, subhead, caption) using a shared substitution table (per clarification Q5); record a `culturalViolation` flag on the resolution trace with matched words and per-layer source annotation (image prompt vs ad copy); keep the signal strictly internal (per clarification Q4).

Arabic-language detection is `adLanguage.startsWith('ar')` uniformly across layers (per clarification Q3). English ads get zero guardrails — no filtering, no compliance block, no wardrobe modesty rules, no trigger-word scan. The nine task rows HFC.1–HFC.9 in `docs/LAUNCH_MATRIX.md` remain the authoritative implementation surface; this plan adds no new tasks, only formalizes their seams and contracts.

## Technical Context

**Language/Version**: TypeScript 5.7 (Firebase Cloud Functions), TypeScript 5.9 (React frontend).
**Primary Dependencies**: React 19, Zustand, Tailwind CSS 3, Vite 7 (frontend); Firebase Cloud Functions v2, Firebase Admin SDK, Firestore, Gemini 3.1 (text + image) (functions). No new dependencies added by this hotfix.
**Storage**: Firestore — `generations/{genId}` collection, existing `resolutionTrace` sub-document is extended with a new optional `culturalViolation` field. No new collections, no schema migrations, no backfill.
**Testing**: Jest via `cd functions && npm test`. Primary fixture file: `functions/src/contractFixtures.test.ts` (HFC.9 adds a cultural-compliance suite of ≥5 fixtures — single, carousel slide, batch item, post-validation image-prompt layer, post-validation ad-copy layer; English-control fixture asserts no block injected).
**Target Platform**: Web application (React SPA on Firebase Hosting) + Firebase Cloud Functions v2 in `europe-west1`.
**Project Type**: Web application (React frontend + Firebase Cloud Functions backend) — Option 2 in the template.
**Performance Goals**: No regression versus pre-hotfix. Post-generation trigger-word scan MUST run synchronously before the image prompt is dispatched; expected overhead is O(|TRIGGER_WORDS| × |prompt_length|) ≈ 18 × ~8 KB ≈ single-pass linear scan, budgeted under 50 ms per generation. Frontend universe filter is O(n) over ~80 entries, already sub-millisecond.
**Constraints**:
- Arabic detection is exactly `adLanguage.startsWith('ar')` in every layer (data filter, UI filter, prompt injection, validation scan). Any other rule is a spec violation (FR-001, clarification Q3).
- Substitution is substitute-not-strip: every haram motif and every trigger word MUST be replaced with an aspirationally-equivalent term; removal alone is a spec violation (Assumptions §3).
- Legacy `r_sushi_bar` identifiers in pre-hotfix saved projects MUST resolve to `r_sushi_counter` on load without error (FR-011). Applied as a read-side map in the saved-project loader — no background migration, no forced save.
- Pre-hotfix saved projects that reference now-blocked environments MUST NOT be force-migrated; the loader must preserve all fields and gate only the Generate action (FR-010, clarification Q1).
- Post-validation replacement is invisible to the end user (FR-024, clarification Q4). The signal lives only on the resolution trace.
- Frontend and backend MUST read the same `arabicSafe` flag and the same trigger list; duplicate-source is a spec violation of Principle XI.
- **`isArabic(adLanguage)` ships as two intentional copies** — one in `functions/src/culturalCompliance.ts` (backend) and one in `src/universeDatabase.ts` (frontend) — because the two packages have separate `tsconfig`s and cannot import from each other. The rule is trivially simple (`adLanguage?.startsWith('ar') ?? false`) and identity is verified by fixture coverage: HFC.9 exercises the backend predicate directly, and the frontend picker filter + language-switch wiring fixtures indirectly assert the same rule via observed behavior (Arabic configs hide blocked universes; English configs show them). Any future change to the rule MUST update both sites in the same commit; a CLAUDE.md note plus a code comment above each copy pin the invariant.
**Scale/Scope**: Hotfix applied to ~80 universe entries, 9 task rows (HFC.1–HFC.9), 4 file regions touched (`universeDatabase.ts`, `InputForm.tsx` + loader wiring, `generators.ts`, `contractFixtures.test.ts`) plus 1 new shared module (`functions/src/culturalCompliance.ts`). 25 functional requirements, 8 success criteria, 5 user stories, 1 clarification session with 5 Q/A. No surface expansion.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | PASS | Strict reduction. The Arabic universe picker loses 7 entries. Visual-motif vocabulary is narrowed by the haram-motif rewrite. No new features added. |
| II. The Selected Mode MUST Be Obeyed | PASS | "Ad language = Arabic" is the selected mode. Every guardrail enforces that selection. The Arabic → wine-cellar-still-renders path is a silent-drift failure this hotfix explicitly closes. |
| III. Launch Surface Is Frozen and Authoritative | PASS | `docs/LAUNCH_MATRIX.md` Section 13 (row 63) + HFC.1–HFC.9 are authoritative. All other sources (legacy motif vocabulary, missing wardrobe rules) are corrected by this hotfix to match that contract. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Explicit pass/fail rules: FR-002 names the seven blocked universes, FR-004 names the eleven haram motif terms, FR-022 names the trigger-word list with ≥ 18 entries, FR-023 defines the substitution table. Contract fixtures (HFC.9) encode each. |
| V. Arabic Quality Is First-Class | PASS | This hotfix IS the explicit Arabic-quality standard for cultural compliance — the first-class treatment the principle demands. Arabic-MSA / Egyptian / Gulf are all served by the uniform `ar*` rule per clarification Q3. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | Every replacement is traceable. `resolutionTrace.culturalViolation` captures the flag, matched word list, and source layer. Motif sanitization is done at the data layer so every read is visibly sanitized, not a hidden transform at prompt time. |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS (with documented exception) | The mid-session environment auto-clear (clarification Q2) has all three: rule (FR-009), user signal (inline picker prompt + disabled Generate), trace (auto-switch event already persisted). The post-validation trigger-word replacement has a documented product rule (FR-022), a documented decision to remain internal (Q4 / FR-024 — "signal to user" replaced by "signal to ops via trace" because customer-facing exposure reads as censorship), and a full trace. The "silent to end user" decision is the deliberate, spec'd behavior — not a hidden override. |
| VIII. Cost Discipline Is Mandatory | PASS | No extra image generations. No retries. The trigger-word scan is a single linear pass over already-produced text; it prevents re-generation (cheaper than re-rendering a contaminated image). The `arabicSafe` filter avoids generating haram renders users couldn't use anyway. Net effect: fewer invalid runs, not more. |
| IX. Proof Is Required for Every Claimed Fix | PASS | Every FR has (a) acceptance scenarios in spec §User Scenarios, (b) a contract fixture in HFC.9, and (c) a post-deploy validation step in quickstart.md. |
| X. Spec Before Code | PASS | Spec has 5 user stories, 25 FRs, 8 SCs, 1 completed clarification session (5 Q/A). This plan precedes any implementation change. |
| XI. Frontend and Backend MUST Agree on Truth | PASS | The `arabicSafe` flag lives in `src/universeDatabase.ts`; the frontend picker reads it directly; the backend cannot receive a haram universe because the frontend cannot submit one. The trigger-word list and substitution table live once in `functions/src/culturalCompliance.ts`; the frontend does not need its own copy because scanning is backend-only. Both sides import the same `isArabic(adLanguage)` predicate. |
| XII. Deferred Scope MUST Remain Deferred | PASS | Dialect-specific strictness tiers (Gulf-only vs Maghreb-light) are explicitly deferred via clarification Q3 and documented in Assumptions. Trigger-word matching on compound/embedded tokens (`barstool`, `wine-dark`) is deferred to a post-launch observation pass (Assumptions §5). Customer-facing exposure of replacements is deferred via clarification Q4. |

**Post-Phase 1 Re-check**: All 12 principles remain PASS after the Phase 1 artifacts below are written. Data model adds exactly one boolean flag and one optional trace sub-object. Contracts formalize existing pipeline seams (`generateBuildPlan`, `buildFinalImagePrompt`, universe loader, resolution trace). No violations introduced by the design pass.

## Project Structure

### Documentation (this feature)

```text
specs/0951-hotfix-cultural-compliance/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (5 user stories, 25 FRs, 8 SCs, 5 clarifications)
├── research.md          # Phase 0 — current-state audit + design decisions
├── data-model.md        # Phase 1 — Universe, AdConfiguration, BuildPlan, ResolutionTrace, AdCopy shapes
├── quickstart.md        # Phase 1 — post-deploy validation walkthrough (8 checks)
├── contracts/
│   ├── cultural-compliance-block.md   # The CULTURAL_COMPLIANCE prompt block: content, insertion points, language gate
│   ├── trigger-word-scan.md           # TRIGGER_WORDS list, SUBSTITUTIONS table, scan/replace contract, trace shape
│   └── universe-arabic-safety.md      # arabicSafe flag semantics, blocked-list invariants, motif-sanitization rules
├── tasks.md             # Phase 2 output (regenerate via /speckit.tasks)
└── checklists/
    └── requirements.md  # Spec quality checklist (post-clarify pass recorded)
```

### Source Code (repository root)

Files touched by this hotfix (audit performed against the current `main` as of 2026-04-23; see `research.md` for full rationale):

```text
functions/
├── src/
│   ├── generators.ts                        # HFC.4 — inject CULTURAL_COMPLIANCE block into generateBuildPlan() before TECHNICAL_PROMPT for Arabic ads only; HFC.5 — inject again inside buildFinalImagePrompt() (currently line 3848); HFC.6 — add Arabic wardrobe modesty block to the wardrobe section; HFC.7 — ensure injection happens per-slide in carousel flow and per-item in batch flow; HFC.8 — post-parse scan-and-replace against TRIGGER_WORDS for BOTH technical-prompt text AND user-facing ad copy (hook, subhead, caption), logged via resolutionTrace
│   ├── culturalCompliance.ts                # NEW FILE — single source of truth for CULTURAL_COMPLIANCE_BLOCK, ARABIC_WARDROBE_BLOCK, TRIGGER_WORDS, SUBSTITUTIONS, isArabic(adLanguage), scanAndReplace(text, layer). Imported by generators.ts. Small enough (< 200 lines) to read in a single pass
│   ├── types.ts                             # Extend ResolutionTrace with optional culturalViolation: { caught: boolean; matchedWords: string[]; sourceLayer: 'imagePrompt' | 'adCopy' | 'both'; }; leave all other fields unchanged
│   ├── resolutionTrace.ts                   # TraceBuilder gains setCulturalViolation({ matchedWords, sourceLayer }); build() emits the new optional field
│   └── contractFixtures.test.ts             # HFC.9 — add cultural-compliance fixture suite: (a) Arabic + r_private_jet → no "champagne" in build plan; (b) Arabic wardrobe section contains modesty rules; (c) English ad → no CULTURAL_COMPLIANCE block injected; (d) Arabic carousel slide 3 contains block; (e) Arabic batch item 2 contains block; (f) Stubbed build plan with "cocktail" → post-validation replaces it AND logs culturalViolation with sourceLayer='imagePrompt'; (g) Stubbed hook with "champagne" → post-validation replaces AND logs with sourceLayer='adCopy'

src/
├── universeDatabase.ts                      # HFC.1 — add arabicSafe: boolean to the interface and every entry; mark r_wine_cellar, r_wine_tasting, r_rooftop_bar, r_cigar_lounge, r_vineyard, r_dance_studio as arabicSafe: false; rename r_sushi_bar → r_sushi_counter (update id AND name/nameAr) and mark arabicSafe: false on the renamed entry. HFC.2 — define HARAM_MOTIFS constant, define MOTIF_SUBSTITUTIONS table, apply substitutions to every entry's visualMotifs array at module load time (pure data transform, no runtime branching)
├── components/
│   └── InputForm.tsx                        # HFC.3 — universe dropdown filter: when inputs.adLanguage starts with 'ar', filter to entries where arabicSafe === true; when adLanguage does not start with 'ar', show all entries. Also: inline picker-prompt banner when environment is cleared by language switch or blocked by saved-project load under Arabic
└── App.tsx (+ saved-project loader path)    # FR-009 wiring — on language switch English→Arabic with a non-safe environment selected, auto-clear only the universe field, preserve everything else, surface inline prompt on picker. FR-010 wiring — on saved-project load under Arabic with a blocked universe, preserve the project fully but block the Generate action with an inline prompt. FR-011 — read-side map r_sushi_bar → r_sushi_counter on load
```

**Structure Decision**: Web application (Option 2) with React frontend (`src/`) + Firebase Cloud Functions backend (`functions/src/`). No new directories. One new file (`functions/src/culturalCompliance.ts`) centralizes the prompt blocks, trigger list, substitution table, and Arabic-detection helper — fulfilling Principle XI (frontend and backend agree) by giving both the prompt-injection sites and the validation scan a single import source for the shared vocabulary. Every other change edits an already-existing file. The three contract documents in `contracts/` encode the seams that frontend, backend, and fixture tests all depend on.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VII "signaled to the user when relevant" is intentionally read as "internal-signal-only" for post-validation replacements. | Product rule (clarification Q4) determined that user-visible notification of the replacement reads as censorship of content the user did not author — the leak is almost always on the model side, not the user side. Silent replacement + internal trace is the higher-trust UX for this narrow case. | Showing a toast ("We adjusted your ad for cultural compliance") was rejected because it damages perceived quality without giving the user an actionable next step. Exposing the matched words was rejected because they are model-side artifacts, not user input. The silent-plus-internal-trace path preserves auditability (Principle VI) without the user-facing cost. |
