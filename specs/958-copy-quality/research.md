# Phase 0 Research: Copy Quality Upgrade

All unknowns from Technical Context resolved below. Source of truth for rule wording: `specs/_shared/COPY_SYSTEM_REFERENCE.md`. Code coordinates verified against `functions/src/` on branch `958-copy-quality`.

---

## R1 — Where each of the four prompt surfaces actually lives

**Decision:** Inject the rule blocks into the **live prompt strings**, not the same-named imported constants.

**Rationale:** Code audit found that `HOOK_GENERATION_RULES` and `RETARGETING_RULES` are imported into `generators.ts` (line 13) but **never referenced** — their content is hand-inlined into the prompts. Appending blocks to the dead constants would have zero runtime effect. The four surfaces resolve to:

| Spec surface | Real code location | Injection method |
|---|---|---|
| System tone-of-voice (`SYSTEM_TOV`) | `promptConstants.ts` lines 9–17 (definition); consumed as `systemInstruction` at `generators.ts` 2372, 2450, 7194, 7410 | Append blocks + Section-18 instruction **once** to the `SYSTEM_TOV` template literal → propagates to all 4 call sites |
| Hook-generation rules | Live Step-2 hook prompt in `generators.ts` ≈ lines 2200–2279 (cold) and 2245–2279 (retargeting hook block) | Inject `\n${block}\n` block-breaks into the prompt string, mirroring the `CULTURAL_COMPLIANCE_BLOCK` pattern |
| Carousel slide-caption prompt | `generateCarouselSlideCopies()` `generators.ts` ≈ 7340–7404 | Inject block-breaks into the carousel prompt string |
| Retargeting rules | Retargeting `campaignInstruction` branch `generators.ts` ≈ 1447–1525 | Inject block-breaks into the retargeting instruction string |

**Alternatives considered:** (a) Wire the blocks by reviving the dead constants — rejected: the inline prompts are what actually run; reviving constants risks double-injection or silent no-ops. (b) A single shared helper that returns all three blocks concatenated — adopted as a convenience (`COPY_QUALITY_BLOCKS` join is optional; tasks may inject individually). Keep injection explicit per surface for auditability.

---

## R2 — SYSTEM_TOV append (Section 18 Track-1 instruction)

**Decision:** Append the Section-18 verbatim instruction (the four bullets: 6th-grade level, lived symptom, soft fabrication flag, banned-CTA + CTA formula) to the end of the `SYSTEM_TOV` template literal in `promptConstants.ts`. Reference the three new blocks by inlining their text (or by importing them) so SYSTEM_TOV carries the full rule set.

**Rationale:** SYSTEM_TOV is the single system instruction shared by all four `systemInstruction` call sites (hook gen ×2, carousel angle, carousel slide copies). Putting the Track-1 instruction here satisfies FR-010 once and guarantees uniform application (FR-011) without changing field count/structure. `promptConstants.ts` cannot circular-import `copywriting_knowledge.ts` cleanly in all cases → simplest is to inline the Section-18 text directly into SYSTEM_TOV and keep the standalone blocks in `copywriting_knowledge.ts` for the per-surface (non-system) injections. The Section-18 text and the blocks are both transcriptions of the same reference sections, so they stay consistent via the drift rule.

**Alternatives considered:** Importing the blocks into `promptConstants.ts` and interpolating — viable but adds a cross-module dependency; deferred to implementation discretion as long as the rendered SYSTEM_TOV contains the rules. The acceptance test asserts on the *rendered string content*, not the import graph.

---

## R3 — `claimFlag` capture mechanism (model-emitted, parsed, traced)

**Decision:** The `FABRICATION_POLICY_BLOCK` instructs the model to emit, *after* the four copy fields, zero or more lines of the form:
`CLAIM_FLAG: <verbatim fabricated specific> — <one-line reason>`
The TOV response parser (`extractCopyFieldsFromResponse()`, `generators.ts` ≈ 470–519) is extended to (1) detect and **strip** any `CLAIM_FLAG:` lines before the four fields are assembled, and (2) return them as structured entries. The caller records them into `resolutionTrace.claimFlags`.

**Rationale:** The clarification chose a *structured field*, and explicitly excluded an automated claim *detector* (that is the later scoring track). So the model produces the flag; we only parse + persist. Stripping the marker before field assembly is **mandatory** so the `CLAIM_FLAG` text can never appear in `hookText/subheadText/ctaName/benefitText` and therefore can never trip or corrupt `validateCopyFidelity()` (the gate compares the four fields against the rendered image). This keeps the change additive and gate-safe.

**Shape:** `claimFlags?: ClaimFlagEntry[]` where `ClaimFlagEntry = { text: string; reason: string; field?: "hook" | "subhead" | "cta" | "benefit" | "slide" }`. Per-generation array (a single generation may flag multiple specifics across its 4 hooks/slides). Optional + additive → no migration, legacy docs simply lack it.

**Alternatives considered:** (a) Inline prose advisory only — rejected by clarification (chose structured). (b) Post-generation regex detector for numbers/names — rejected: that is the deferred scoring track and risks false positives/compliance overreach. (c) Per-hook nested flags — rejected as over-modeling for Phase 22; a flat array with an optional `field` tag is sufficient and auditable.

---

## R4 — Banned-CTA scope vs. the user's literal CTA (Principle II)

**Decision:** `BANNED_CTA_LIST` is applied as **prompt guidance for model-authored CTA wording** — the benefit/connector line (`generators.ts` 2205/2251), carousel CTA slide, and any place the model composes CTA text. It does **not** override the user's literal `inputs.cta` string, which the current 4-field model uses verbatim as `ctaName`.

**Rationale:** In the current pipeline `ctaName = inputs.cta` (user input), and the model only authors the trailing benefit connector. Constitution Principle II ("The Selected Mode MUST Be Obeyed") forbids silently rewriting an explicit user input. The banned list therefore steers the *generated* portions and discourages the model from proposing generic CTA phrasing where it has latitude, satisfying the spec's intent (no generic CTAs in generated copy) without violating Principle II. Enforcement is prompt-only this phase (clarification Q3); no post-gen reject/replace.

**Alternatives considered:** Hard post-generation filter that rewrites a banned `inputs.cta` — rejected: violates Principle II and exceeds the "prompt-only" clarification; deferred to a future track if ever desired (with user signal + trace per Principle VII).

---

## R5 — Constant shapes

**Decision:**
- `READING_LEVEL_BLOCK`, `LIVED_SYMPTOM_BLOCK`, `FABRICATION_POLICY_BLOCK` → `string` template literals (prompt-injectable blocks), matching the existing `*_BLOCK` convention in `culturalCompliance.ts`.
- `BANNED_CTA_LIST` → `readonly string[]` of the five exact phrases (matches the name "LIST" and lets the prompt render them and a test assert membership). A derived prompt sentence can be built from the array at the injection site.
- `COPY_SCORING_DIMENSIONS` → `string` block transcribing the Section-12 rubric (15 dimensions + hard-dimension/pass rules). Defined now, **not imported** by any runtime path (FR-014).
- `COPY_REWRITE_DIAGNOSES` → `string` block transcribing the Section-13 diagnosis→fix table + max-2-pass rule. Defined now, **not imported** by any runtime path (FR-014).

**Rationale:** Blocks-as-strings inject cleanly with the proven `\n${BLOCK}\n` pattern. `BANNED_CTA_LIST` as an array is the most testable representation and the only one whose name implies a collection. Keeping the two future constants as strings (not wired) honors "defined-but-unconsumed" and lets a later track import them as-is.

**Alternatives considered:** Structured objects for scoring/diagnoses — rejected for Phase 22: nothing consumes them yet, and the later scoring engine can shape its own parsing; a faithful text transcription is the minimal, drift-checkable form now.

---

## R6 — Drift-control header

**Decision:** Add to the top of `functions/src/copywriting_knowledge.ts` (after the existing version comment):
`// Implements specs/_shared/COPY_SYSTEM_REFERENCE.md — edit the reference first, then sync these constants.`

**Rationale:** Exact wording mandated by the reference "Drift rule" and FR-015. Satisfies Principle VI/auditability and prevents silent divergence.

---

## R7 — Frontend mirror (`src/copywriting_knowledge.ts`) scope

**Decision:** Leave the frontend mirror **untouched**.

**Rationale:** `src/knowledge/index.ts` re-exports only pre-existing names from the frontend mirror; the six new constants are consumed exclusively by `functions/src/generators.ts` at generation time (server-side). Phase 22 has no UI work (FR-013, FR-017). Adding the constants to the frontend file would be dead code and widen scope. The two files are independent; only the backend one is the runtime truth for these constants (per the reference's "constants are the runtime truth" note).

**Alternatives considered:** Mirror to frontend for symmetry — rejected (dead code, scope creep, violates "Deferred Scope Remains Deferred" spirit).

---

## R8 — Testing approach

**Decision:** New `functions/src/__tests__/copyQuality.test.ts`, modeled on `culturalCompliance.test.ts` (plain assertions, throws on failure, compiled then run via `node lib/...`). Add it to the `test` script chain in `functions/package.json`.

**Test cases:**
1. All six constants are exported and non-empty; `BANNED_CTA_LIST` contains exactly the five phrases.
2. The drift-control header line is present in the file source.
3. Rendered `SYSTEM_TOV` contains the Section-18 rule signals (reading-level, lived-symptom, fabrication-flag, banned-CTA cues).
4. For each of the four surfaces, the assembled prompt string contains the three block markers (assert on a representative prompt-builder output or on the injected substrings).
5. `claimFlag` parsing: given a TOV model response containing `CLAIM_FLAG:` lines, the parser returns the four fields **without** the marker text and returns the structured flags; given no marker, `claimFlags` is empty/undefined and fields are unchanged. (No-leak assertion protects the fidelity gate.)

**Rationale:** Matches existing repo test idiom (no jest/vitest; compiled-Node scripts). Provides the Principle-IX before/after evidence and Principle-IV behavior-contract coverage.

**Alternatives considered:** Live model-call integration test — rejected for cost/flakiness (Principle VIII); deterministic string + parser assertions are sufficient for Phase 22's prompt-and-capture scope.
