# Feature Specification: Language Quality Contracts

**Feature Branch**: `008-lang-quality-contracts`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "Phase 6: Language Quality Contracts — per-language validation rules for all 7 launch languages (6 Arabic dialects + English) enforced after caption generation, before delivery to the user."

## Clarifications

### Session 2026-04-04

- Q: What is the shape of the `captionQuality` field persisted on the generation document? → A: Aggregate result — `{ passed: bool, captionChecks: [{ rule, passed, detail }], languageChecks: [{ rule, passed, detail }], repairedAt?: number, locale: string }`. `captionChecks` from general caption validation, `languageChecks` from per-language quality rules.
- Q: What is the LTR bleed threshold for lighter Arabic dialects? → A: All 6 Arabic dialects enforce RTL and the same 70% Arabic Unicode minimum (FR-003 applies universally). English enforces LTR. No separate LTR bleed threshold — FR-003 is the single rule for all Arabic.
- Q: How is "word count" defined for Arabic? → A: Whitespace-separated tokens (simple split on spaces). Clitics attached to words count as part of that word, not separately.

### Session 2026-04-03

- Q: Should English captions have the same word count limits as Arabic (8 headline / 12 subheadline)? → A: Yes, same 8/12 limits for English.
- Q: What does the user see when repair fails after max 1 retry? → A: Caption delivered normally; quality failure logged internally only (no user-visible warning).
- Q: Should dialect marker validation be presence-based, absence-based, or both? → A: Absence-based only — reject if wrong-dialect markers detected, no minimum for correct markers.
- Q: Where should validation results be stored? → A: Top-level `captionQuality` field on `generations/{genId}` document, alongside the existing `resolutionTrace` field.
- Q: What does "grammar baseline" mean for English validation? → A: Heuristic checks only — proper capitalization, no repeated consecutive words, subheadline must be a complete sentence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arabic Fusha Caption Validation (Priority: P1)

A user generates an ad in Arabic Fusha. After the AI produces the headline and subheadline, the system automatically validates the output: headline must not exceed 8 words, subheadline must not exceed 12 words, Arabic script characters must constitute at least 70% of all script characters (Arabic + Latin letters only — spaces, digits, and punctuation are excluded from the denominator), no hanging conjunctions at line ends, and no weak openers. If any check fails, the system triggers a repair prompt and regenerates without user intervention. The user only sees the final, validated caption.

**Why this priority**: Arabic Fusha is the primary UI language and the most commonly selected ad copy language. Quality failures here affect the largest share of users and brand credibility.

**Independent Test**: Can be fully tested by generating a Fusha caption and asserting all five quality checks pass or trigger structured repair. Delivers value by ensuring every Fusha ad meets editorial standards.

**Acceptance Scenarios**:

1. **Given** a generated Fusha headline of 6 words with 85% Arabic characters, **When** validation runs, **Then** all checks pass and the caption is delivered as-is.
2. **Given** a generated Fusha headline of 11 words, **When** validation runs, **Then** the word count check fails, a repair prompt is issued, and the regenerated headline is 8 words or fewer.
3. **Given** a generated Fusha subheadline ending with the conjunction "و", **When** validation runs, **Then** the hanging conjunction check fails and repair is triggered.
4. **Given** a generated Fusha headline with only 50% Arabic characters (rest is English brand names), **When** validation runs, **Then** the Arabic Unicode ratio check fails.

---

### User Story 2 - Egyptian Arabic Dialect Validation (Priority: P2)

A user generates an ad in Egyptian Arabic dialect. The system validates the output for correct dialect markers (Egyptian-specific vocabulary and expressions), warmth register appropriate for Egyptian advertising tone, and the same word count rules as Fusha. Captions that use Gulf or Levantine markers instead of Egyptian ones are flagged and repaired.

**Why this priority**: Egyptian Arabic is the most widely understood Arabic dialect and the most likely second choice after Fusha, making it the highest-impact dialect to validate.

**Independent Test**: Can be tested by generating an Egyptian caption and verifying dialect marker presence, warmth register, and word count compliance.

**Acceptance Scenarios**:

1. **Given** a generated Egyptian Arabic caption using correct Egyptian markers (e.g., colloquial Egyptian vocabulary), **When** validation runs, **Then** dialect check passes.
2. **Given** a generated Egyptian Arabic caption that uses Gulf dialect markers instead, **When** validation runs, **Then** the dialect marker check fails and repair is triggered.
3. **Given** a generated Egyptian Arabic headline of 9 words, **When** validation runs, **Then** word count check fails.

---

### User Story 3 - Gulf Arabic Dialect Validation (Priority: P3)

A user generates an ad in Gulf Arabic. The system validates the output for Gulf-specific dialect markers and the same word count and RTL compliance rules. Captions with wrong-dialect markers are flagged.

**Why this priority**: Gulf Arabic is a key market dialect, but lower volume than Egyptian. Same validation pattern, different dialect markers.

**Independent Test**: Can be tested by generating a Gulf Arabic caption and verifying dialect markers and word count rules.

**Acceptance Scenarios**:

1. **Given** a generated Gulf Arabic caption with correct Gulf dialect markers, **When** validation runs, **Then** all checks pass.
2. **Given** a generated Gulf Arabic caption with Egyptian markers, **When** validation runs, **Then** dialect check fails and repair is triggered.

---

### User Story 4 - Levantine, Iraqi, and Maghreb Dialect Minimum Checks (Priority: P4)

A user generates an ad in Levantine, Iraqi, or Maghreb Arabic. The system applies minimum quality checks: word count limits, RTL compliance, and no LTR (Latin) text bleed beyond acceptable thresholds. These dialects receive lighter validation than Fusha, Egyptian, or Gulf.

**Why this priority**: These three dialects are supported at launch but with minimum viable validation — enough to prevent broken output, not full dialect correctness.

**Independent Test**: Can be tested by generating a caption in any of these three dialects and verifying word count, RTL direction, and absence of LTR bleed.

**Acceptance Scenarios**:

1. **Given** a generated Levantine caption within word count limits and no LTR bleed, **When** validation runs, **Then** all checks pass.
2. **Given** a generated Maghreb caption with only 50% Arabic Unicode characters, **When** validation runs, **Then** the Arabic Unicode ratio check (FR-003) fails.
3. **Given** a generated Iraqi caption with a headline of 10 words, **When** validation runs, **Then** the word count check fails.

---

### User Story 5 - English Caption Validation (Priority: P5)

A user generates an ad in English. The system validates grammar heuristics (proper capitalization, no repeated consecutive words, subheadline is a complete sentence), CTA (call-to-action) clarity, absence of filler phrases, and word count (same 8/12 limits as Arabic). English captions that fail any check are flagged and repaired.

**Why this priority**: English is a supported launch language but secondary to Arabic for this product's target audience. Still essential for quality.

**Independent Test**: Can be tested by generating an English caption and verifying grammar, CTA presence, and filler phrase absence.

**Acceptance Scenarios**:

1. **Given** a generated English caption with clear CTA and no filler, **When** validation runs, **Then** all checks pass.
2. **Given** a generated English caption with no CTA, **When** validation runs, **Then** the CTA clarity check fails and repair is triggered.
3. **Given** a generated English caption containing filler phrases like "in order to" or "it is important to note that", **When** validation runs, **Then** the filler phrase check fails.

---

### User Story 6 - Per-Language Unit Test Coverage (Priority: P6)

A developer adds or modifies language quality rules. For every supported language, a unit test suite exists containing at minimum: one passing caption, one failing caption (word count violation), and one failing caption for a language-specific rule (e.g., hanging conjunction for Arabic, missing CTA for English). This ensures regressions are caught immediately.

**Why this priority**: Without automated test coverage, quality rules degrade over time. This story exists to guarantee the validation system is itself validated.

**Independent Test**: Can be tested by running the unit test suite and verifying all expected pass/fail results.

**Acceptance Scenarios**:

1. **Given** the test suite for `ar_fusha`, **When** tests run, **Then** at least 3 test cases execute: one pass, one word count fail, one hanging conjunction fail.
2. **Given** the test suite for `en`, **When** tests run, **Then** at least 3 test cases execute: one pass, one word count fail, one missing CTA fail.
3. **Given** a code change that accidentally removes the Arabic ratio check, **When** the test suite runs, **Then** a test case fails, alerting the developer.

---

### Edge Cases

- What happens when a caption contains mixed Arabic and English (e.g., a brand name in English within Arabic text)? The Arabic ratio check must account for legitimate brand name inclusions while still catching excessive English leakage.
- What happens when the AI generates a caption that is entirely punctuation or emoji with no actual words? Word count validation must handle zero-word edge cases.
- What happens when a dialect's markers overlap with another dialect (e.g., shared vocabulary between Egyptian and Levantine)? Dialect validation must use dialect-specific markers, not shared ones.
- How does the system handle a caption that passes word count but fails multiple other checks simultaneously? All checks must run independently, and the repair prompt must address all failures at once.
- What happens when the repair prompt also produces a failing caption? The existing architecture allows max 1 retry — after that, the caption is delivered normally to the user with no visible warning; the quality failure is logged internally for monitoring.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST validate every generated caption against language-specific quality rules before delivering it to the user.
- **FR-002**: System MUST enforce headline maximum of 8 words and subheadline maximum of 12 words for all 7 launch languages (all Arabic dialects and English).
- **FR-003**: System MUST enforce a minimum 70% Arabic Unicode character ratio for all 6 Arabic dialect captions, where ratio = (Arabic script characters in ranges U+0600–U+06FF, U+0750–U+077F, U+FB50–U+FDFF, U+FE70–U+FEFF) / (Arabic script characters + Latin letters A–Z/a–z). Spaces, digits, and punctuation are excluded from the denominator. This is the single RTL compliance check for all Arabic — no separate LTR bleed threshold exists.
- **FR-004**: System MUST detect and reject hanging conjunctions (e.g., "و", "ف", "ثم") at the end of headline or subheadline lines for Arabic Fusha.
- **FR-005**: System MUST detect weak openers in Arabic Fusha captions (e.g., starting with generic phrases that lack impact).
- **FR-006**: System MUST validate Egyptian Arabic captions using absence-based dialect checking — reject if wrong-dialect markers (Gulf, Levantine, etc.) are detected — and validate warmth register. Register validation is scoped to Egyptian only at launch; other dialects do not have register-specific checks.
- **FR-007**: System MUST validate Gulf Arabic captions using absence-based dialect checking — reject if wrong-dialect markers (Egyptian, Levantine, etc.) are detected.
- **FR-008**: System MUST validate Levantine, Iraqi, and Maghreb Arabic captions for word count and the 70% Arabic Unicode ratio (FR-003). These three dialects receive lighter validation — no dialect-marker or register checks, only word count and script compliance.
- **FR-009**: System MUST validate English captions for grammar heuristics (proper capitalization, no repeated consecutive words, subheadline is a complete sentence), CTA clarity, and absence of filler phrases.
- **FR-010**: System MUST produce a structured repair prompt when any quality check fails, specifying exactly which rules were violated.
- **FR-011**: System MUST support exactly 7 languages at launch: `ar_fusha`, `ar_egyptian`, `ar_gulf`, `ar_levantine`, `ar_iraqi`, `ar_maghreb`, and `en`.
- **FR-012**: System MUST run all quality checks for a given language independently — a failure in one check does not skip other checks.
- **FR-013**: System MUST include per-language unit tests with at minimum 3 test cases per language: one passing, one word-count failure, and one language-specific rule failure.
- **FR-014**: System MUST persist caption validation results (pass/fail per check, detail messages) as a top-level `captionQuality` field on the `generations/{genId}` Firestore document, alongside (not nested inside) the existing `resolutionTrace` field.
- **FR-015**: When validation fails after max 1 repair retry, system MUST deliver the caption without any user-visible warning and log the quality failure internally for monitoring.

### Key Entities

- **Language Quality Contract**: A set of validation rules specific to one language, including word count limits, character ratio requirements, dialect markers, register rules, and language-specific checks. Each of the 7 launch languages has exactly one contract.
- **Caption Validation Result**: The outcome of running both caption validation and language quality validation against a generated caption. Shape: `{ passed: bool, captionChecks: [{ rule: string, passed: bool, detail: string }], languageChecks: [{ rule: string, passed: bool, detail: string }], repairedAt?: number, locale: string }`. `captionChecks` contains entries from general caption validation (CTA presence, hook angle, mode alignment, etc.) and `languageChecks` contains entries from per-language quality rules (word count, Arabic ratio, dialect markers, etc.). `passed` is true only when both sets pass. `repairedAt` is set only if a repair retry was attempted and succeeded. Persisted as the `captionQuality` field on the generation document.
- **Repair Prompt**: A structured instruction generated when validation fails, describing the exact violations so the AI can regenerate a compliant caption.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of generated captions pass through language-specific quality validation before reaching the user — no caption bypasses the validation step.
- **SC-002**: At least 80% of captions pass validation on first generation attempt (before any repair), indicating the generation prompts are well-tuned.
- **SC-003**: After repair (max 1 retry), at least 95% of captions pass all quality checks for their selected language.
- **SC-004**: Every launch language (all 7) has a dedicated unit test suite with at least 3 test cases, and all tests pass.
- **SC-005**: Arabic captions delivered to users contain at least 70% Arabic Unicode characters, with zero tolerance for captions below this threshold reaching the user.
- **SC-006**: No Arabic caption is delivered with a headline exceeding 8 words or a subheadline exceeding 12 words.
- **SC-007**: English captions delivered to users always contain a clear call-to-action.

## Assumptions

- The existing caption generation and validation pipeline (`generateCaption() → validateCaption() → repair loop`) is reused and extended, not rebuilt.
- The existing `captionValidator.ts` file already handles Arabic character ratio and basic language checks — this feature extends it with per-dialect and per-language granularity.
- Dialect markers (lists of dialect-specific vocabulary/expressions) will be curated as static reference lists, not dynamically learned.
- The max 1 retry architecture for repair is unchanged — if the repair also fails, the caption is delivered normally (no user-visible warning); the failure is logged internally.
- Word count rules (8 headline / 12 subheadline) apply uniformly to all 7 launch languages (all Arabic dialects and English). "Word" is defined as a whitespace-separated token — no clitic-aware tokenization.
- Dialect marker validation is absence-based: the system checks for presence of wrong-dialect markers, not for presence of correct-dialect markers. This reduces false positives.
- Validation results are persisted as a top-level `captionQuality` field on the `generations/{genId}` document, alongside (not nested inside) the existing `resolutionTrace` field.
- French, Spanish, German, Turkish, and Portuguese are explicitly excluded (deferred per LAUNCH_MATRIX Section 3) and will not have quality contracts at launch.
- "Weak opener detection" for Fusha refers to headlines starting with low-impact words/phrases (e.g., equivalents of "Did you know..." or "It is important to...") — the specific list will be curated during implementation.
- FR-014 (`captionQuality` persistence) and FR-010/FR-015 (repair prompt and retry behavior) extend beyond the LAUNCH_MATRIX Phase 6 task list — they make explicit what the matrix assumes implicitly via the existing repair loop architecture.
- All 6 Arabic dialects enforce RTL via the same 70% Arabic Unicode ratio (FR-003). English enforces LTR. There is no separate "LTR bleed" threshold — FR-003 is the universal Arabic script compliance check.
