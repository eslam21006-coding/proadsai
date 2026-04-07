# Data Model: Language Quality Contracts

**Date**: 2026-04-04 | **Branch**: `008-lang-quality-contracts`

## Entities

### CaptionQualityResult

Persisted as `captionQuality` field on `generations/{genId}` Firestore document.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passed` | `boolean` | Yes | True if all checks passed (after repair if applicable) |
| `checks` | `CaptionQualityCheck[]` | Yes | One entry per rule evaluated |
| `repairedAt` | `number \| null` | No | Timestamp (epoch ms) if repair was attempted; null if first attempt passed |
| `locale` | `string` | Yes | Language code that was validated (e.g., `ar_fusha`, `en`) |

### CaptionQualityCheck

Nested in `CaptionQualityResult.checks` array.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rule` | `string` | Yes | Rule identifier (e.g., `headline_word_count`, `arabic_ratio`, `dialect_markers`) |
| `passed` | `boolean` | Yes | Whether this specific check passed |
| `detail` | `string` | Yes | Human-readable explanation (e.g., "Headline: 6 words (max 8)" or "Found Gulf marker 'حلو' in Egyptian caption") |

### LanguageQualityContract

In-memory only (not persisted). Defines the validation rules for one language.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `locale` | `string` | Yes | Language code |
| `checks` | `QualityCheckFn[]` | Yes | Array of check functions to run for this language |

### LanguageQualityInput

Input to `validateLanguageQuality()`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `headline` | `string` | Yes | Generated headline text |
| `subheadline` | `string` | Yes | Generated subheadline text |
| `locale` | `string` | Yes | Selected language code |
| `fullCaption` | `string` | Yes | Full caption text (for Arabic ratio check) |

## Rule Identifiers (per language)

### All Arabic dialects (`ar_*`)

| Rule ID | Description | Applies to |
|---------|-------------|------------|
| `headline_word_count` | Headline ≤ 8 whitespace-separated tokens | All 6 |
| `subheadline_word_count` | Subheadline ≤ 12 whitespace-separated tokens | All 6 |
| `arabic_unicode_ratio` | ≥ 70% Arabic Unicode characters in full caption | All 6 |

### Arabic Fusha (`ar_fusha`) — additional

| Rule ID | Description |
|---------|-------------|
| `hanging_conjunction` | No trailing و / ف / ثم at end of headline or subheadline |
| `weak_opener` | Headline does not start with a blocklisted weak phrase |

### Egyptian Arabic (`ar_egyptian`) — additional

| Rule ID | Description |
|---------|-------------|
| `dialect_markers` | No wrong-dialect markers (Gulf, Levantine, Iraqi, Maghreb) detected |
| `warmth_register` | Caption uses warm/conversational Egyptian advertising tone |

### Gulf Arabic (`ar_gulf`) — additional

| Rule ID | Description |
|---------|-------------|
| `dialect_markers` | No wrong-dialect markers (Egyptian, Levantine, Iraqi, Maghreb) detected |

### English (`en`)

| Rule ID | Description |
|---------|-------------|
| `headline_word_count` | Headline ≤ 8 whitespace-separated tokens |
| `subheadline_word_count` | Subheadline ≤ 12 whitespace-separated tokens |
| `capitalization` | First word of headline and subheadline is capitalized |
| `no_repeated_words` | No consecutive repeated words |
| `complete_sentence` | Subheadline ends with sentence-ending punctuation |
| `cta_clarity` | Contains an action verb or imperative CTA |
| `no_filler_phrases` | No blocklisted filler phrases (e.g., "in order to", "it is important to note that") |

## Dialect Marker Data Structure

File: `functions/src/dialectMarkers.ts`

```typescript
export interface DialectMarkerSet {
  locale: string;
  wrongDialectMarkers: string[];  // Words/phrases that indicate a DIFFERENT dialect
}
```

One `DialectMarkerSet` per validated dialect (`ar_egyptian`, `ar_gulf`). Levantine/Iraqi/Maghreb do not have dialect marker checks at launch.

## Firestore Document Impact

### `generations/{genId}` — new field

```
captionQuality: {
  passed: true,
  checks: [
    { rule: "headline_word_count", passed: true, detail: "Headline: 6 words (max 8)" },
    { rule: "arabic_unicode_ratio", passed: true, detail: "Arabic ratio: 85% (min 70%)" },
    ...
  ],
  repairedAt: null,
  locale: "ar_fusha"
}
```

No index changes required — `captionQuality` is read only when viewing a specific generation's detail, not queried across documents.
