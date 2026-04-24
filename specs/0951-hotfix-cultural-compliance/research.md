# Research: Cultural Compliance Hotfix (Arabic Market Guardrails)

**Feature**: `0951-hotfix-cultural-compliance`
**Date**: 2026-04-23

This document records the current-state audit performed against `main` and the design decisions taken before implementation. Every decision below is already pinned by either the spec's Clarifications session (Q1–Q5) or a direct quote of LAUNCH_MATRIX §13 / HFC.1–HFC.9. Nothing here is still open — there are zero NEEDS CLARIFICATION markers.

## 1. Current-state audit

Audit performed against the files that would be touched by HFC.1–HFC.9, on branch `0951-hotfix-cultural-compliance` at the parent of this change.

### 1.1 Universe library (`src/universeDatabase.ts`, 1,327 lines)

- The file exports a `UNIVERSES` array of ~80 entries. Each entry matches the shape `{ id, name, nameAr, category, styleFamily, tone, businessFit, offerFit, aspirationSignals, credibilitySignals, forbiddenFits, visualMotifs, safeForTextDensity }`. There is no Arabic-safety attribute today.
- The seven entries enumerated in LAUNCH_MATRIX as not Arabic-safe all exist today: `r_wine_cellar` (line 66), `r_wine_tasting` (line 266), `r_rooftop_bar` (line 56), `r_cigar_lounge` (line 260), `r_vineyard` (line 243), `r_dance_studio` (line 171), `r_sushi_bar` (line 270).
- Haram motif strings observed today (verbatim in `visualMotifs` arrays): `'champagne'` in `r_private_jet`, `'cocktails'` in `r_rooftop_bar`, `'whiskey'` in `r_cigar_lounge`, `'cocktail reception'` in `r_networking`, `'private bar'` in `r_diamond_lounge`, `'cocktails'` in `r_harbor_yacht_club`, `'premium bar'` in `r_airport_lounge`, `'barrels'` in `r_vineyard`, `'bottles'` in `r_wine_tasting`. All match the LAUNCH_MATRIX HFC.2 list.
- The file has no `HARAM_MOTIFS` constant and no substitution table. Motifs are inlined as free strings inside each entry's literal object.

### 1.2 Input form (`src/components/InputForm.tsx`, 2,337 lines)

- The form reads `UNIVERSES` unfiltered today. The dropdown shows every entry regardless of `adLanguage`.
- The component already receives `adLanguage` as part of its `inputs` prop.
- There is no current path that handles "environment field was cleared by the language switcher" — because the switcher does not touch the environment today. Adding the clear-and-prompt behavior (FR-009) is a pure addition, not an override of existing logic.

### 1.3 Generators (`functions/src/generators.ts`, 6,946 lines)

- `generateBuildPlan()` is the entry-point for the structured build-plan generation. Language-specific branches already exist: the file references `inputs.adLanguage` and applies `.startsWith('ar')` checks in several places (e.g., lines 1093, 1096, 1102). This is the idiomatic detection rule already used by the codebase, and clarification Q3 pins it as the universal rule for the hotfix.
- `buildFinalImagePrompt()` is defined at line 3848. It assembles the last prompt before the image model is invoked.
- Carousel and batch flows are inside this file. Each slide / each batch item eventually calls the same build-plan generator; the hotfix must ensure the compliance block and wardrobe block are injected on every call, not only the first (HFC.7).
- The file currently has no `CULTURAL_COMPLIANCE` block, no Arabic wardrobe rules, and no trigger-word scan. These are all new additions.

### 1.4 Resolution trace (`functions/src/types.ts`, `functions/src/resolutionTrace.ts`)

- `ResolutionTrace` interface (types.ts line 100) has 25 fields covering resolver results, overrides, and per-slide entries. No cultural-violation field exists today.
- `createTraceBuilder()` in `resolutionTrace.ts` already supports `addAutoSwitchEvent(field, from, to, reason)`. The environment auto-clear on language switch (FR-009) can reuse this mechanism — no new trace shape needed for *that* event. Only the post-validation replacement (FR-024) needs a new field.
- `persistTrace(genId, trace)` writes the trace to `generations/{genId}` via Firestore `set({ resolutionTrace }, { merge: true })`. Adding a new optional field is safe — existing readers that don't know about it will ignore it.

### 1.5 Contract fixtures (`functions/src/contractFixtures.test.ts`, 1,164 lines)

- File is Jest-based and exercises the build-plan pipeline at the contract level. Adding the HFC.9 suite means appending new `describe` blocks; there are no existing cultural-compliance fixtures to refactor.

### 1.6 Saved-project loader (`src/App.tsx` + `src/services/savedProjects*`)

- `loadProject(p)` restores application state from a `SavedProject`. No path currently checks the loaded environment against an `arabicSafe` flag (the flag didn't exist). Adding the "block only Generate" gate (FR-010) is purely additive: a derived `canGenerate` flag in the store that is `false` when `adLanguage.startsWith('ar') && !selectedUniverse.arabicSafe`.
- No current path maps `r_sushi_bar` to any other identifier. The FR-011 read-side remap is a new two-line shim at load time (and in any other surface that resolves a universe id to an entry — only the loader does today, since the picker binds directly to the exported `UNIVERSES`).

### 1.7 Summary

The hotfix adds one new file (`functions/src/culturalCompliance.ts`), extends two types (`ResolutionTrace`, `Universe`), and edits four files (`universeDatabase.ts`, `InputForm.tsx`, `App.tsx`, `generators.ts`) plus the fixture file. There are no collisions with other in-flight features. The four-layer design aligns cleanly with existing seams: data exports, UI props, prompt assembly, and trace builder.

## 2. Design decisions

### Decision D-1 — Single source of truth for Arabic detection

**Decision**: Export `isArabic(adLanguage: string | undefined): boolean` from `functions/src/culturalCompliance.ts` and import it wherever a layer decides whether to enforce Arabic guardrails.

**Rationale**: Clarification Q3 pinned the rule as `adLanguage.startsWith('ar')`, identical across layers. Inlining that literal in five places creates a future drift risk (someone forgets to update one site). A single named function is (a) grep-able, (b) the natural extension point if the rule ever needs to expand (e.g., to include `ar_fusha` literal which is the current default fallback in `generators.ts` line 1093), and (c) cheap.

**Alternatives considered**: Inline `adLanguage?.startsWith('ar') ?? false` at every site. Rejected — drift risk and Principle XI (frontend and backend agree) is better served by a shared predicate than by a shared literal. (Note: the frontend can call `isArabic()` via a frontend-local helper that mirrors the backend's rule; the rule is stable enough — one-line string-prefix check — that re-implementing it on the frontend side is acceptable and avoids a frontend → functions import that the build does not support.)

### Decision D-2 — New shared module `functions/src/culturalCompliance.ts`

**Decision**: Create one new file centralizing: `isArabic()`, `CULTURAL_COMPLIANCE_BLOCK` (the verbatim block from HFC.4), `ARABIC_WARDROBE_BLOCK` (verbatim from HFC.6), `TRIGGER_WORDS` (18 entries from HFC.8 + the three wardrobe terms `revealing`, `cleavage`, `strapless`), `SUBSTITUTIONS` (the map from HFC.8), and `scanAndReplace(text, sourceLayer): { cleaned, matched }`. The file is pure data + one pure function; no I/O, no Firestore, no dynamic state.

**Rationale**: (a) Principle XI — one source of truth. (b) Testability — the scan/replace function is independently unit-testable without touching the generator pipeline. (c) Isolation — tightens the surface that a future contributor must change when new haram patterns are observed (one module, not five call sites).

**Alternatives considered**: Put the constants inline inside `generators.ts`. Rejected — `generators.ts` is already 6,946 lines and scanning it for cultural-compliance constants later would be painful. A small, focused module is easier to keep correct.

### Decision D-3 — `arabicSafe: boolean` as a required field on every universe entry

**Decision**: Make `arabicSafe` a required (non-optional) boolean on the `Universe` interface so that a new universe entry added in the future cannot accidentally default-allow itself in Arabic by omission.

**Rationale**: Clarification Q3 pinned the rule as uniform across dialects, which means every entry needs an explicit answer. TypeScript's structural typing will refuse to compile a new entry that omits the flag — a cheap compile-time invariant.

**Alternatives considered**: Make it optional, default to `true` if undefined. Rejected — silent default-allow is a Principle VII violation ("no silent override"); a compile error is cheaper than a post-deploy haram-render bug.

### Decision D-4 — Data-layer motif sanitization, not prompt-time rewriting

**Decision**: Apply `HARAM_MOTIFS` → `MOTIF_SUBSTITUTIONS` at module load time inside `src/universeDatabase.ts`, producing a sanitized `UNIVERSES` export. Downstream consumers read clean motifs and do not need to know the rule exists.

**Rationale**: HFC.2 is explicit about this ("These replacements apply at the data level so ALL downstream prompts receive clean motifs"). The data-layer approach also benefits English ads: an English advertiser using the private-jet universe receives `sparkling drinks` in the motif list too — which is a stylistic upgrade, not a restriction. (If that ever needs to be reverted for the English market, the substitution can be gated behind `isArabic()` at the consumer site. Not needed today.)

**Alternatives considered**: Leave the data raw and rewrite motifs only at prompt-assembly time when `isArabic()`. Rejected — the substitution logic would then live at every motif-consuming site (build plan, final prompt, carousel slide, batch item), multiplying the surface to keep consistent. Data-layer is fewer places to get wrong.

### Decision D-5 — Rename `r_sushi_bar` → `r_sushi_counter` with read-side legacy map

**Decision**: Rename the identifier AND the display name (`Premium Sushi Bar` → `Premium Sushi Counter`, nameAr updated correspondingly). Persist the renamed entry with `arabicSafe: false` (per HFC.1) — so it is hidden from Arabic pickers regardless. Add a one-shot legacy map in the saved-project loader that rewrites stored `universeId === 'r_sushi_bar'` to `'r_sushi_counter'` on read.

**Rationale**: HFC.1 is explicit about removing "bar" from the name even in its Arabic-safe sibling. Marking the renamed entry `arabicSafe: false` also means Arabic users never see it, even after the rename — which is the stricter reading of LAUNCH_MATRIX row 63's "minor but flagged" note. English users will see `Premium Sushi Counter` going forward and the label change alone is a product upgrade (less US-casual, more international). Legacy saved projects must still load — hence the read-side map (FR-011).

**Alternatives considered**: (a) Rename the identifier but keep `arabicSafe: true`. Rejected — clarification thread and LAUNCH_MATRIX both treat the whole entry as culturally sensitive, not just the word "bar". (b) Keep the id, rename only the display name. Rejected — inconsistent data and the id surfaces in support logs and analytics.

### Decision D-6 — Post-validation scan on both image prompt and ad copy with shared substitution table

**Decision**: The scan-and-replace in `scanAndReplace()` is called twice per Arabic generation: once against the parsed technical-prompt text (image-pipeline layer) and once against the generated ad copy (hook + subhead + caption, ad-copy layer). Both calls use the identical `TRIGGER_WORDS` list and identical `SUBSTITUTIONS` table. The matched-words sets from both calls are merged on the trace with a `sourceLayer` of `'imagePrompt' | 'adCopy' | 'both'`.

**Rationale**: Clarification Q5. A haram word in the caption is as commercially unusable as a wine glass in the image. The shared table is already decided in Q5's answer and in HFC.8's design — duplicating the table is a correctness risk.

**Alternatives considered**: (a) Scan only the image prompt. Rejected by Q5. (b) Scan both layers but with separate tables (stricter rules for copy). Rejected — introduces an unforced taxonomy (the trigger list is already exhaustive enough for both uses, and the product-facing meaning is identical: "do not ship haram content to an Arabic viewer"). (c) Scan the full build-plan JSON rather than the parsed sections. Rejected — false-positive risk on metadata fields that happen to contain trigger words (e.g., a field called `wineAllowed: false`).

### Decision D-7 — `culturalViolation` as an optional extension to `ResolutionTrace`

**Decision**: Extend the existing `ResolutionTrace` interface with an optional `culturalViolation?: { caught: boolean; matchedWords: string[]; sourceLayer: 'imagePrompt' | 'adCopy' | 'both' }` field. Populate only when a replacement fires. Do not emit the field when nothing was caught (keeps the Firestore document slim).

**Rationale**: The trace already has the right semantics for "things that happened during resolution." Adding a parallel top-level field inside the `generations` document would fragment the debugging story. Making it optional preserves write-compatibility for anything reading existing traces.

**Alternatives considered**: (a) Always emit `culturalViolation: { caught: false, ... }` for Arabic ads. Rejected — noisy; `caught: false` adds no information. (b) Top-level `generations/{genId}.culturalViolation` field outside the trace. Rejected — same reason: debugging story fragmentation.

### Decision D-8 — Environment auto-clear on English → Arabic switch piggybacks on existing `autoSwitchEvents`

**Decision**: The FR-009 environment auto-clear event is recorded using the trace builder's existing `addAutoSwitchEvent(field, from, to, reason)` method with `field='universe', from=<old id>, to='', reason='cultural_compliance_language_switch'`. No new trace field is introduced for this case.

**Rationale**: The trace builder already has this shape and several other auto-switches use it. Adding a second mechanism for the same conceptual event is needless. Principle VI (auditability) is fully served by the existing mechanism.

**Alternatives considered**: Introduce a dedicated `environmentClearedOnLanguageSwitch` trace field. Rejected — extra surface for no additional signal.

### Decision D-9 — Frontend does not run the trigger-word scan

**Decision**: The post-validation scan runs only on the backend (inside the Cloud Function that generates the ad). The frontend does not re-scan the returned copy before displaying it.

**Rationale**: By the time the ad copy reaches the frontend, it has already been cleaned by the backend scan. Re-scanning on the frontend would duplicate the canonical substitution table, introduce drift risk (Principle XI), and provide no additional protection — if the backend scan missed something, the frontend scan would have to use the same table to catch it. Frontend responsibility is strictly display.

**Alternatives considered**: Belt-and-braces scan on both sides. Rejected — principle XI violation (two sources of truth for the trigger list) and Principle VIII violation (duplicated work).

## 3. Open questions

None. All five clarifications from the spec session are pinned to concrete implementation rules above. No new ambiguities surfaced during the audit.

## 4. Dependencies and sequencing

- D-3 (interface change on `Universe`) must land in the same PR as D-4 (data-layer sanitization) and D-5 (sushi rename). Partial landing would leave the file uncompilable.
- D-2 (new `culturalCompliance.ts`) must land before or with the generator edits that import it; the ordering is trivial within a single PR.
- D-6 (dual scan) depends on D-2 exporting `scanAndReplace`.
- D-7 + D-8 (trace shape) must land before or with the generator edits that call the new `setCulturalViolation`.
- The contract fixture updates (HFC.9) land last in the same PR, since they exercise the full end-to-end path.

No external dependencies, no service migrations, no Paddle / Meta / Firestore-rules changes required.
