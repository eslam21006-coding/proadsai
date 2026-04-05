# Contract: Language Quality Validation API

**Date**: 2026-04-04 | **Type**: Internal function interface

## validateLanguageQuality()

**Location**: `functions/src/captionValidator.ts`
**Called by**: `generators.ts` → `_generateCaptionInner()` inside the caption retry loop

### Input

```typescript
interface LanguageQualityInput {
  headline: string;       // Generated headline text
  subheadline: string;    // Generated subheadline text
  locale: string;         // One of: ar_fusha, ar_egyptian, ar_gulf, ar_levantine, ar_iraqi, ar_maghreb, en
  fullCaption: string;    // Complete caption text (headline + subheadline + any body)
}
```

### Output

```typescript
interface CaptionQualityResult {
  passed: boolean;                    // True if ALL checks passed
  checks: CaptionQualityCheck[];     // One entry per rule evaluated
  repairedAt: number | null;         // Epoch ms if repair attempted; null otherwise
  locale: string;                    // Echo of input locale
}

interface CaptionQualityCheck {
  rule: string;      // Rule identifier (see data-model.md for full list)
  passed: boolean;   // Whether this check passed
  detail: string;    // Human-readable explanation
}
```

### Repair Prompt

When `passed === false`, the function also returns a repair prompt string via the existing `buildRepairPrompt()` pattern. The caller (`_generateCaptionInner`) appends this to the existing caption repair prompt for the next attempt.

```typescript
interface LanguageQualityValidation {
  result: CaptionQualityResult;
  repairPrompt: string | null;   // Non-null when result.passed === false
}
```

### Behavior Contract

| Condition | Expected behavior |
|-----------|-------------------|
| Unsupported locale (e.g., `fr`) | Return `{ passed: true, checks: [], repairedAt: null }` — no checks, no failure |
| Empty headline/subheadline | Word count check returns `passed: true` (0 words ≤ limit); other checks run normally |
| All checks pass | `passed: true`, all check entries show `passed: true` |
| One or more checks fail | `passed: false`, failing entries show `passed: false` with detail, repair prompt generated |
| Multiple simultaneous failures | All checks run independently (FR-012); repair prompt addresses all failures |

### Check execution per locale

| Locale | Checks run |
|--------|-----------|
| `ar_fusha` | headline_word_count, subheadline_word_count, arabic_unicode_ratio, hanging_conjunction, weak_opener |
| `ar_egyptian` | headline_word_count, subheadline_word_count, arabic_unicode_ratio, dialect_markers, warmth_register |
| `ar_gulf` | headline_word_count, subheadline_word_count, arabic_unicode_ratio, dialect_markers |
| `ar_levantine` | headline_word_count, subheadline_word_count, arabic_unicode_ratio |
| `ar_iraqi` | headline_word_count, subheadline_word_count, arabic_unicode_ratio |
| `ar_maghreb` | headline_word_count, subheadline_word_count, arabic_unicode_ratio |
| `en` | headline_word_count, subheadline_word_count, capitalization, no_repeated_words, complete_sentence, cta_clarity, no_filler_phrases |
