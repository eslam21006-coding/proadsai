# Contract: `scanAndReplace()` — Post-Validation Trigger-Word Scan

**Module**: `functions/src/culturalCompliance.ts` (exported function)
**Consumers**: `functions/src/generators.ts` — called twice per Arabic generation (once on the parsed technical-prompt text with `sourceLayer: 'imagePrompt'`, once on the assembled ad-copy text with `sourceLayer: 'adCopy'`).

This document pins the function signature, the matching rules, the substitution rules, the aggregation into `ResolutionTrace.culturalViolation`, and the fixture obligations.

## 1. Function signature

```ts
function scanAndReplace(
  text: string,
  sourceLayer: 'imagePrompt' | 'adCopy',
): { cleaned: string; matched: string[] };
```

- **Input `text`**: the text to scan. For the image-pipeline call, this is the parsed technical-prompt text of the build plan. For the ad-copy call, this is the concatenation of hook text, subhead text, and caption text (joined with a newline — separators do not matter for the scan).
- **Input `sourceLayer`**: labels the call site for the trace's `sourceLayer` annotation.
- **Output `cleaned`**: the input text with every trigger-word match replaced per the `SUBSTITUTIONS` table.
- **Output `matched`**: the deduplicated list of trigger words that hit (order-preserving by first occurrence). Empty array means no hit.

## 2. Matching rules

- **Case-insensitivity**: `'COCKTAIL'`, `'Cocktail'`, `'cocktail'`, `'CoCkTaIl'` all match the trigger `'cocktail'`.
- **Whole-word matching**: trigger `'bar'` would NOT match the substring inside `'barstool'` or `'scalable'`. Matching is bounded by `\W` or string start/end. (Trigger `'bar counter'` has an internal space; it matches the literal two-word phrase with one whitespace between — not `'bar  counter'` with two spaces. A pre-matching whitespace-normalization pass is acceptable but not required.)
- **Longest-match-first**: `'bar counter'` (multi-word) MUST be attempted before `'bar'` would be — though `'bar'` is not in the current list, the invariant is encoded to protect future additions.
- **Non-overlapping**: once a region of `text` is matched and replaced, it is removed from the pool — a subsequent trigger cannot match inside the replacement substring.
- **Hyphens and punctuation**: the trigger `'short skirt'` matches `'short skirt'` but NOT `'short-skirt'`. Hyphenated variants are explicitly out of scope for this hotfix (Assumptions §5). The model almost always produces space-separated phrases; hyphenation is rare enough that catching it is deferred.
- **UTF-8 / non-ASCII**: the trigger list is ASCII-only English. The scan does NOT attempt to match Arabic-script haram words directly — Arabic copy that contains the Arabic words for "wine" or "cocktail" (e.g., نبيذ, كوكتيل) is currently out of scope. The scan targets English tokens the language model may leak into any prose (including Arabic copy that interpolates English product nouns). This is a known coverage gap and is tracked in spec Assumptions §5 as a follow-up if leakage data justifies it.

## 3. Substitution rules

- When a trigger is matched, the substring in the output is replaced with the value from `SUBSTITUTIONS` for that trigger.
- Casing of the replacement: the replacement value is used verbatim, lowercase. Upstream text formatting (capitalization at sentence start, title case in headings) is a post-processing concern of the caller and NOT the scan's responsibility. The caller MAY re-case the result with its own rules; this scan does not alter casing.
- The substitution MUST NOT itself contain any trigger word. A startup-time unit test asserts this (no escape-by-substitution loops).
- The substitution tables for motifs and for triggers MAY share keys (e.g., `'wine'`) but the replacement values are independent (`'premium tea'` in both — aligned on purpose). See `data-model.md` §3 for the invariant relationship.

## 4. Aggregation into `ResolutionTrace.culturalViolation`

Per generation, `scanAndReplace` is called twice for Arabic ads:

```ts
const { cleaned: cleanedTechPrompt, matched: imageMatched } =
  scanAndReplace(techPromptText, 'imagePrompt');

const adCopy = [hookText, subheadText, captionText].filter(Boolean).join('\n');
const { cleaned: cleanedAdCopy, matched: copyMatched } =
  scanAndReplace(adCopy, 'adCopy');
```

Trace aggregation:

| `imageMatched` | `copyMatched` | Trace field emitted |
|---|---|---|
| empty | empty | (no field — trace.culturalViolation remains undefined) |
| non-empty | empty | `{ caught: true, matchedWords: imageMatched, sourceLayer: 'imagePrompt' }` |
| empty | non-empty | `{ caught: true, matchedWords: copyMatched, sourceLayer: 'adCopy' }` |
| non-empty | non-empty | `{ caught: true, matchedWords: [...imageMatched, ...copyMatched-minus-dupes], sourceLayer: 'both' }` |

The merged `matchedWords` list deduplicates (a word that hit on both layers appears once) while preserving first-occurrence order; image-layer matches precede ad-copy-layer matches to keep the ordering stable for tests.

## 5. Gate

The scan runs if and only if `isArabic(adLanguage)` returns `true`. Otherwise, neither call is made and the trace field is never emitted.

## 6. Visibility

The `culturalViolation` field on the trace is strictly internal. Per clarification Q4 and FR-024:

- It MUST be persisted to Firestore via `persistTrace`.
- It MUST NOT appear in any response payload returned to the client.
- It MUST NOT be logged in a way that routes to user-facing dashboards.
- It MUST NOT trigger a toast, banner, inline notification, or any other user-facing UI affordance.

Internal ops dashboards / BigQuery exports that consume the `resolutionTrace` document MAY surface this field — but that is ops tooling, not customer-facing.

## 7. Fixture obligations (HFC.9)

A passing implementation MUST have contract fixtures that assert:

1. **Image-layer replacement**: Given a stubbed build plan whose `TECHNICAL_PROMPT` section contains the word `"cocktail"`, an Arabic generation produces a sent-to-image-model prompt that does NOT contain `"cocktail"` and DOES contain `"artisan coffee"` in the replaced position. The persisted trace has `culturalViolation: { caught: true, matchedWords: ['cocktail'], sourceLayer: 'imagePrompt' }`.

2. **Ad-copy-layer replacement**: Given a stubbed hook whose text contains `"champagne"`, an Arabic generation produces a returned `hookText` that does NOT contain `"champagne"` and DOES contain `"sparkling water"` in the replaced position. The persisted trace has `culturalViolation: { caught: true, matchedWords: ['champagne'], sourceLayer: 'adCopy' }`.

3. **Both-layer aggregation**: Given a stub where BOTH the technical prompt contains `"wine"` AND the caption contains `"cocktail"`, the trace has `culturalViolation: { caught: true, matchedWords: ['wine', 'cocktail'], sourceLayer: 'both' }`.

4. **English no-op**: Given an English ad whose technical prompt contains `"wine"` and whose caption contains `"champagne"`, the returned text is UNCHANGED and the trace has no `culturalViolation` field.

5. **Case-insensitivity**: Given an Arabic technical prompt containing `"Wine"` (title case), the replacement fires and the trace records `matchedWords: ['wine']` (lowercased, matching the trigger list).

6. **Table invariants**: Startup / module-load assertions: every `TRIGGER_WORDS` entry has a key in `SUBSTITUTIONS`; no substitution value is itself a trigger word; every `HARAM_MOTIFS` entry has a key in `MOTIF_SUBSTITUTIONS`.

## 8. Error handling

- If `text` is the empty string, return `{ cleaned: '', matched: [] }` — do not throw.
- If `text` is `undefined` or non-string, throw a `TypeError` — callers are expected to pre-filter nullish inputs. (This is a programmer-error guard, not a user-input path.)
- The function is pure and synchronous. It does NOT touch Firestore, the file system, or the network.
