# Research: Language Quality Contracts

**Date**: 2026-04-04 | **Branch**: `008-lang-quality-contracts`

## R1: Existing captionValidator architecture

**Decision**: Extend `captionValidator.ts` with a new `validateLanguageQuality()` function that runs per-language checks and returns a `CaptionQualityResult`. Do not modify the existing `validateCaption()` — call the new function alongside it in the generation pipeline.

**Rationale**: The existing `validateCaption()` (865 lines) handles 10+ checks for general caption quality (CTA, hook angle, mode alignment, numeric consistency, scene leak, etc.). Language-specific checks (word count for headline/subheadline, dialect markers, register, grammar) are a separate concern. Adding them as a separate function keeps the existing validator stable and testable independently.

**Alternatives considered**:
- Modify `validateCaption()` directly: Rejected — it already handles 10+ checks and mixing language-specific rules into the same function increases complexity and risk of regression.
- Create a new file `languageValidator.ts`: Viable but rejected — the function is closely related to caption validation and should live in the same module for discoverability and shared types.

## R2: CaptionValidationResult vs CaptionQualityResult shape

**Decision**: Define a new `CaptionQualityResult` interface for language quality checks, distinct from the existing `CaptionValidationResult`.

**Rationale**: The existing `CaptionValidationResult` uses `{ passed, checks: [{name, passed, detail}], repairPrompt }`. The spec defines `captionQuality` as `{ passed, checks: [{rule, passed, detail}], repairedAt? }`. Key differences: field named `rule` instead of `name`, and `repairedAt` timestamp instead of `repairPrompt` string. These are distinct concerns — caption validation checks (general quality) vs language quality checks (per-language rules).

**Alternatives considered**:
- Reuse `CaptionValidationResult` with `name` field: Rejected — the spec explicitly chose `rule` to distinguish language quality rules from general caption checks, and `repairedAt` is a different concept than `repairPrompt`.

## R3: Integration point in the generation pipeline

**Decision**: Call `validateLanguageQuality()` inside the existing caption retry loop in `generators.ts` (`_generateCaptionInner()`, lines 6380-6449), alongside the existing `validateCaption()` call. Both must pass for the caption to be accepted.

**Rationale**: The existing loop already handles MAX_CAPTION_ATTEMPTS = 2 with repair prompt injection. Language quality failures should produce their own repair prompt additions, which get appended to the existing repair prompt if both validators fail. This avoids a separate retry mechanism (cost discipline — Principle VIII).

**Alternatives considered**:
- Run language quality as a second pass after the existing loop: Rejected — this would require its own retry budget, doubling potential Gemini calls.
- Replace the existing loop entirely: Rejected — the existing loop handles general caption quality; language quality is additive.

## R4: Dialect marker reference lists

**Decision**: Store dialect marker exclusion lists as static TypeScript arrays in a new `dialectMarkers.ts` file. Each dialect has a `wrongDialectMarkers` array listing vocabulary from other dialects that should NOT appear.

**Rationale**: Absence-based validation (per clarification) means we check for wrong-dialect markers, not correct-dialect markers. Static arrays are simple, fast, and easy to curate. The lists will contain 15-30 terms per dialect initially, covering high-confidence distinguishing vocabulary.

**Alternatives considered**:
- Inline marker lists in `captionValidator.ts`: Rejected — marker lists will grow during curation; a dedicated file keeps the validator logic clean.
- JSON config files: Rejected — TypeScript arrays get type checking and are imported directly; no parsing overhead.

## R5: Word count for headline vs subheadline

**Decision**: The language quality validator receives headline and subheadline as separate strings. Word count is whitespace-split (`text.trim().split(/\s+/).length`).

**Rationale**: Per clarification, word count is whitespace-separated tokens. The existing `validateCaption()` operates on the full caption string. The new language quality function needs headline and subheadline separately to enforce the 8/12 limits. The generation pipeline must extract these from the structured caption output.

**Alternatives considered**:
- Validate combined text with heuristic line splitting: Rejected — unreliable for determining which line is headline vs subheadline.

## R6: English-specific checks

**Decision**: English validation includes: (1) word count 8/12, (2) capitalization check (first word of headline/subheadline capitalized), (3) no repeated consecutive words, (4) subheadline is a complete sentence (ends with period/exclamation/question mark), (5) CTA presence (action verb or imperative), (6) filler phrase blocklist.

**Rationale**: Per clarification, "grammar baseline" = heuristic checks only. These 6 checks are implementable as string operations without NLP libraries.

**Alternatives considered**:
- Use a grammar-checking library (e.g., LanguageTool API): Rejected — adds external dependency, network latency, and cost. Heuristic checks are sufficient for ad copy validation.

## R7: captionQuality persistence location

**Decision**: Write `captionQuality` as a top-level field on the `generations/{genId}` Firestore document, alongside the existing `resolutionTrace` field. Not nested inside `resolutionTrace`.

**Rationale**: The `ResolutionTrace` interface (generators.ts:3690-3699) tracks image prompt audit data (Step 4). Caption quality is a Step 5 concern. Keeping it as a sibling field maintains clean separation and avoids modifying the `ResolutionTrace` interface.

**Alternatives considered**:
- Nest inside `resolutionTrace`: Rejected — the spec says "append to existing resolution trace" but the `ResolutionTrace` type is image-focused. A top-level field on the same document achieves the same goal (colocated with the generation record) without type pollution.

## R8: Weak opener detection for Fusha

**Decision**: Implement as a blocklist of Arabic opener patterns (regex). Initial list curated during implementation with ~10-15 common weak openers (e.g., هل تعلم, من المهم, نحن نقدم, etc.).

**Rationale**: Per assumption in spec, the specific list is curated during implementation. A regex blocklist is fast, testable, and easy to extend.

**Alternatives considered**:
- AI-based weak opener detection via Gemini: Rejected — adds latency and cost for a check that can be handled by pattern matching.
