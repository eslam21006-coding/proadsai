# Data Model: Cultural Compliance Hotfix (Arabic Market Guardrails)

**Feature**: `0951-hotfix-cultural-compliance`
**Date**: 2026-04-23

This hotfix changes two shapes (`Universe` and `ResolutionTrace`), introduces one module-level constant surface (`functions/src/culturalCompliance.ts`), and leaves every other entity untouched. No new Firestore collections. No schema migration. No backfill.

## 1. `Universe` (extended)

**Source of truth**: `src/universeDatabase.ts`.
**Shape before hotfix** (abbreviated — unchanged fields elided):

```ts
interface Universe {
  id: string;                  // e.g., 'r_private_jet'
  name: string;                // English display name
  nameAr: string;              // Arabic display name
  category: UniverseCategory;
  styleFamily: VisualStyleFamily;
  tone: string;
  businessFit: string[];
  offerFit: string[];
  aspirationSignals: string[];
  credibilitySignals: string[];
  forbiddenFits: string[];
  visualMotifs: string[];      // free strings used in prompt assembly
  safeForTextDensity: boolean;
}
```

**Shape after hotfix**:

```ts
interface Universe {
  id: string;
  name: string;
  nameAr: string;
  category: UniverseCategory;
  styleFamily: VisualStyleFamily;
  tone: string;
  businessFit: string[];
  offerFit: string[];
  aspirationSignals: string[];
  credibilitySignals: string[];
  forbiddenFits: string[];
  visualMotifs: string[];
  safeForTextDensity: boolean;
  arabicSafe: boolean;          // NEW — required, no default. True = may appear in Arabic picker; false = hidden from Arabic picker, visible to English.
}
```

**Validation rules**:

- `arabicSafe` is required on every entry (non-optional). A missing flag MUST cause a TypeScript compile error so a new entry cannot default-allow itself into the Arabic picker.
- The following `id` values MUST have `arabicSafe: false`: `r_wine_cellar`, `r_wine_tasting`, `r_rooftop_bar`, `r_cigar_lounge`, `r_vineyard`, `r_dance_studio`, `r_sushi_counter`. Every other id MUST have `arabicSafe: true`.
- `r_sushi_bar` MUST NOT exist after the hotfix — it is renamed to `r_sushi_counter`. A legacy read-side map in the saved-project loader resolves any stored `r_sushi_bar` to `r_sushi_counter`.
- `visualMotifs` on every entry MUST NOT contain any string in `HARAM_MOTIFS` (see §3 below). The data layer is the point of enforcement — consumers read clean motifs by default.
- The display strings `name` / `nameAr` on the renamed entry MUST NOT contain the substring `bar` (case-insensitive). Post-rename the English name is `Premium Sushi Counter`; Arabic name is updated correspondingly to drop `بار`.

**State transitions**: None. Universes are static module data. The flag does not change at runtime.

## 2. `ResolutionTrace` (extended)

**Source of truth**: `functions/src/types.ts` (interface), `functions/src/resolutionTrace.ts` (builder + persistence).

**Fields before hotfix**: 25 fields already present (resolver results, per-slide entries, auto-switch events, launch-check flags).

**Fields added by hotfix**:

```ts
interface ResolutionTrace {
  // ...all existing fields unchanged...

  culturalViolation?: {
    caught: true;                                      // Only emitted when caught; absence means "no violation"
    matchedWords: string[];                            // Verbatim substrings that triggered the scan, in order of first match
    sourceLayer: 'imagePrompt' | 'adCopy' | 'both';    // Which layer(s) the scan fired on
  };
}
```

**Validation rules**:

- The field MUST remain optional. When no trigger word is matched on either layer during an Arabic generation, the field MUST NOT be emitted — the Firestore document stays slim.
- When emitted, `caught` MUST be the literal `true`. `caught: false` is not a valid emission (equivalent to omitting the field).
- `matchedWords` MUST be non-empty when the field is emitted. Duplicates are allowed (e.g., the same trigger hit in two separate paragraphs) but order-preserving for debuggability.
- `sourceLayer` values:
  - `'imagePrompt'` when only the technical-prompt text triggered replacements.
  - `'adCopy'` when only the hook/subhead/caption text triggered replacements.
  - `'both'` when both layers triggered.
- English ads MUST NOT emit this field. The backend scan is gated by `isArabic(adLanguage)`.

**State transitions**: Absent → emitted-once, at the point `persistTrace()` is called. Never updated after write.

**Backwards compatibility**: Pre-hotfix Firestore documents lack this field. Reading code MUST treat absence as "no violation." No backfill is required.

## 3. `culturalCompliance.ts` module constants (new)

**Source of truth**: `functions/src/culturalCompliance.ts` (new file).

Not a Firestore entity — in-memory constants and pure helpers imported by `generators.ts`. Included here because the values are data-like and their contents are normative.

```ts
export const HARAM_MOTIFS: readonly string[] = [
  'cocktails', 'champagne', 'whiskey', 'wine', 'beer', 'spirits',
  'cocktail reception', 'private bar', 'premium bar', 'bottles', 'barrels',
];

export const MOTIF_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  'cocktails':           'premium beverages',
  'champagne':           'sparkling drinks',
  'whiskey':             'warm lighting',
  'wine':                'premium tea',
  'beer':                'artisan refreshments',
  'spirits':             'premium refreshments',
  'cocktail reception':  'elegant reception',
  'private bar':         'private lounge area',
  'premium bar':         'premium refreshment area',
  'bottles':             'crystal decanters',
  'barrels':             'aged wood casks',
};

export const TRIGGER_WORDS: readonly string[] = [
  'wine', 'whiskey', 'cocktail', 'champagne', 'beer', 'alcohol',
  'bar counter', 'nightclub', 'casino', 'gambling',
  'bikini', 'swimsuit', 'lingerie', 'revealing', 'cleavage',
  'short skirt', 'tank top', 'strapless',
];

export const SUBSTITUTIONS: Readonly<Record<string, string>> = {
  'wine':        'premium tea',
  'whiskey':     'artisan coffee',
  'cocktail':    'artisan coffee',
  'champagne':   'sparkling water',
  'beer':        'artisan coffee',
  'alcohol':     'premium refreshments',
  'bar counter': 'service counter',
  'nightclub':   'premium lounge',
  'casino':      'private salon',
  'gambling':    'strategic play',
  'bikini':      'modest swimwear',
  'swimsuit':    'modest swimwear',
  'lingerie':    'elegant attire',
  'revealing':   'elegant',
  'cleavage':    'neckline',
  'short skirt': 'tailored skirt',
  'tank top':    'tailored top',
  'strapless':   'elegant',
};

export function isArabic(adLanguage: string | undefined | null): boolean {
  return typeof adLanguage === 'string' && adLanguage.startsWith('ar');
}

export function scanAndReplace(
  text: string,
  sourceLayer: 'imagePrompt' | 'adCopy',
): { cleaned: string; matched: string[] } { /* pure function — contract in contracts/trigger-word-scan.md */ }

export const CULTURAL_COMPLIANCE_BLOCK: string = /* verbatim block per contracts/cultural-compliance-block.md */;
export const ARABIC_WARDROBE_BLOCK: string      = /* verbatim block per contracts/cultural-compliance-block.md */;
```

**Invariants**:

- Every key in `MOTIF_SUBSTITUTIONS` MUST also appear in `HARAM_MOTIFS`; every item in `HARAM_MOTIFS` MUST have a substitution. A contract-level unit test asserts this.
- Every key in `SUBSTITUTIONS` MUST also appear in `TRIGGER_WORDS`; every item in `TRIGGER_WORDS` MUST have a substitution. A contract-level unit test asserts this.
- `MOTIF_SUBSTITUTIONS` and `SUBSTITUTIONS` may share keys but MUST NOT conflict on the replacement value for shared keys (`'wine'` maps to `'premium tea'` in both; `'whiskey'` diverges — `'warm lighting'` for motifs vs `'artisan coffee'` for prompt/copy — which is intentional because motif context differs from prose context).
- Trigger-word matching is case-insensitive, whole-word (bounded by `\W` or string start/end), and non-overlapping. Longer matches win over shorter ones (e.g., `'bar counter'` is matched before the shorter token `'bar'` would be — though `'bar'` is not itself in the list, so this is a safety invariant against a future additions).
- None of the substitution values is itself a trigger word. (A contract-level unit test asserts this — an escape-by-substitution loop would be a correctness bug.)

## 4. Entities that are NOT changed

The following entities are explicitly *not* modified by this hotfix — confirming Principle I (reliability over feature count):

- `SavedProject` — shape unchanged. The environment field's interpretation is the same; only the universe-id-resolution step in the loader handles the `r_sushi_bar` legacy remap. No new field.
- `GenerationRecord` — shape unchanged. The `resolutionTrace` sub-field's interface is extended (see §2), but the record itself adds no new field.
- `Workspace`, `User`, `Team`, `BillingState` — untouched.
- `BuildPlan` parsed envelope (`StructuredBuildPlanPayload`) — shape unchanged. The cultural-compliance block is injected into the prompt that produces the build plan, not into the parsed shape that comes back.

## 5. Relationships

```
Universe (src/universeDatabase.ts)
  │
  │   (id, arabicSafe, sanitized visualMotifs)
  ▼
InputForm.tsx                              [hides arabicSafe:false when isArabic(adLanguage)]
  │
  │   (selected universeId)
  ▼
generateBuildPlan()  ─── injects CULTURAL_COMPLIANCE_BLOCK + ARABIC_WARDROBE_BLOCK if isArabic(adLanguage)
  │
  ▼
buildFinalImagePrompt()  ─── injects CULTURAL_COMPLIANCE_BLOCK again if isArabic(adLanguage)
  │
  ▼
scanAndReplace(techPromptText, 'imagePrompt')  ┐
scanAndReplace(hookText + subhead + caption, 'adCopy')  │   shared TRIGGER_WORDS + SUBSTITUTIONS
  │                                                     │
  ▼                                                     ▼
ResolutionTrace.culturalViolation = { caught, matchedWords, sourceLayer }  (if any hit)
  │
  ▼
persistTrace(genId, trace) → Firestore generations/{genId}
```
