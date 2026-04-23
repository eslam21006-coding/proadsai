# Contract: Universe Arabic-Safety Flag & Motif Sanitization

**Module**: `src/universeDatabase.ts`
**Consumers**: `src/components/InputForm.tsx` (picker filter), `functions/src/generators.ts` (motif inclusion in prompts).

This document pins the semantics of the `arabicSafe` flag, the invariants on the blocked list, the motif-sanitization rules, and the legacy-id remap for `r_sushi_bar`.

## 1. `arabicSafe: boolean` semantics

- `true` → the universe MAY appear in the picker when `isArabic(adLanguage)` is true; it ALWAYS appears for non-Arabic configurations.
- `false` → the universe MUST NOT appear in the picker when `isArabic(adLanguage)` is true; it DOES appear for non-Arabic configurations.
- The flag is NOT a lock: there is no "upgrade to unlock" affordance. Hidden universes are absent from the DOM in Arabic mode (FR-007).

## 2. Blocked-list invariant

Exactly these seven `id` values MUST have `arabicSafe: false` after the hotfix:

| id | Reason |
|---|---|
| `r_wine_cellar` | Entire universe is a wine cellar. |
| `r_wine_tasting` | Entire universe is a wine-tasting room. |
| `r_rooftop_bar` | Name contains "bar"; motifs include `'cocktails'`. |
| `r_cigar_lounge` | Motifs include `'whiskey'`. |
| `r_vineyard` | Tuscan vineyard with wine barrels. |
| `r_dance_studio` | Culturally sensitive for conservative audiences. |
| `r_sushi_counter` (renamed from `r_sushi_bar`) | Original name contained "bar"; renamed to `Premium Sushi Counter` and flagged off for Arabic. |

Every other id (every entry in `UNIVERSES` whose id is NOT in the list above) MUST have `arabicSafe: true`.

A compile-time invariant (required non-optional field on `Universe`) prevents a new entry from default-allowing itself into the Arabic picker. A fixture-level invariant counts the number of `false` flags and asserts exactly 7.

## 3. Motif sanitization

At module-load time in `src/universeDatabase.ts`, every entry's `visualMotifs` array MUST be rewritten so that no element is in `HARAM_MOTIFS`. Each haram element is replaced per `MOTIF_SUBSTITUTIONS` (see `data-model.md` §3).

The sanitization:

- Applies to EVERY entry regardless of `arabicSafe` — English ads also receive the clean vocabulary, which is an intentional (and harmless) side-effect.
- Is a pure, idempotent transform. Running it twice produces the same output.
- Is authored inside the module (at export time), NOT at consumer time. Consumers receive clean data.

Expected concrete mutations:

| Universe id | `visualMotifs` before | `visualMotifs` after |
|---|---|---|
| `r_private_jet` | `['leather seats', 'clouds', 'champagne', 'laptop']` | `['leather seats', 'clouds', 'sparkling drinks', 'laptop']` |
| `r_rooftop_bar` | `['sunset', 'city skyline', 'cocktails', 'lounge furniture']` | `['sunset', 'city skyline', 'premium beverages', 'lounge furniture']` |
| `r_cigar_lounge` | `['leather chair', 'humidor', 'whiskey', 'wood panels']` | `['leather chair', 'humidor', 'warm lighting', 'wood panels']` |
| `r_networking` | `['cocktail reception', 'name badges', 'conversation groups', 'ambient lighting']` | `['elegant reception', 'name badges', 'conversation groups', 'ambient lighting']` |
| `r_diamond_lounge` | `['velvet chairs', 'private bar', 'soft jazz', 'dim gold']` | `['velvet chairs', 'private lounge area', 'soft jazz', 'dim gold']` |
| `r_harbor_yacht_club` | `['yacht masts', 'sunset dock', 'cocktails', 'harbor lights']` | `['yacht masts', 'sunset dock', 'premium beverages', 'harbor lights']` |
| `r_airport_lounge` | `['lounge chairs', 'runway view', 'ambient lighting', 'premium bar']` | `['lounge chairs', 'runway view', 'ambient lighting', 'premium refreshment area']` |
| `r_vineyard` | `['grapevines', 'hills', 'barrels', 'golden hour']` | `['grapevines', 'hills', 'aged wood casks', 'golden hour']` |
| `r_wine_tasting` | `['glasses', 'bottles', 'cellar', 'tasting notes']` | `['glasses', 'crystal decanters', 'cellar', 'tasting notes']` |

All other entries already had haram-free motifs and are untouched by the transform.

## 4. Legacy identifier remap (`r_sushi_bar` → `r_sushi_counter`)

Two locations must handle the rename:

1. **The data file itself**: the entry is authored with `id: 'r_sushi_counter'`, `name: 'Premium Sushi Counter'`, `nameAr: <the Arabic display string with 'بار' removed>`, `arabicSafe: false`. The old id `r_sushi_bar` MUST NOT exist in the post-hotfix file.
2. **The saved-project loader** (and any other surface that deserializes a stored `universeId`): if the stored id is `r_sushi_bar`, map it to `r_sushi_counter` before looking the universe up. This is a read-side map only — no background migration, no forced save. If the user edits and saves the project, the stored id updates naturally.

## 5. Picker filter contract

The `InputForm` picker filter MUST resolve to:

```ts
const visibleUniverses = UNIVERSES.filter(u =>
  isArabic(inputs.adLanguage) ? u.arabicSafe : true
);
```

This is the ONLY place where `arabicSafe` is read at runtime (aside from tests). Adding a second gate site (e.g., a backend submission check) would duplicate truth and violate Principle XI; the picker IS the gate.

## 6. Language-switch wiring contract

When the user flips `adLanguage` from a non-`ar*` locale to an `ar*` locale, the wiring MUST:

1. Check the currently selected `universeId`.
2. Look up the entry's `arabicSafe` flag (applying the legacy remap from §4 if the id is `r_sushi_bar`).
3. If the flag is `false`, auto-clear only the environment field (set the store's `universeId` to `''` or `null`), leaving every other input intact (hook text, subhead text, concept text, copy, reference uploads, build-plan history).
4. Surface an inline prompt on the picker — e.g., `"اختر بيئة متوافقة"` / `"Pick an Arabic-safe environment"` — and keep the Generate button disabled until a new Arabic-safe `universeId` is set.
5. Emit an auto-switch trace event via `addAutoSwitchEvent('universe', <oldId>, '', 'cultural_compliance_language_switch')`.

When the user loads a saved project under an Arabic configuration and the project's stored `universeId` resolves to an `arabicSafe: false` entry, the loader MUST:

1. Preserve every field of the `SavedProject` as-is (hook text, subhead, concept, build-plan history, mockup history, copy). No field is reset.
2. Compute a derived `canGenerate` flag (false when the selected universe fails the Arabic-safety check) and expose it to the Generate button.
3. Surface an inline picker prompt, same as the language-switch case.

No confirmation modal, no forced choice before the project becomes visible — per clarification Q1.

## 7. Fixture obligations (HFC.9)

A passing implementation MUST have contract fixtures that assert:

1. **Motif sanitization assertion**: `UNIVERSES.every(u => u.visualMotifs.every(m => !HARAM_MOTIFS.includes(m)))` is true after the module loads.
2. **Blocked-list count**: exactly 7 entries have `arabicSafe: false`; the count matches the seven ids listed in §2.
3. **Arabic picker filter**: with `adLanguage = 'ar_fusha'`, the filtered universe list does not contain `r_wine_cellar`, `r_wine_tasting`, `r_rooftop_bar`, `r_cigar_lounge`, `r_vineyard`, `r_dance_studio`, or `r_sushi_counter`.
4. **English picker pass-through**: with `adLanguage = 'en'`, every entry in `UNIVERSES` appears in the filtered list.
5. **Rename integrity**: there is no `UNIVERSES` entry with `id === 'r_sushi_bar'`. There IS one with `id === 'r_sushi_counter'`. Neither its `name` nor `nameAr` contains a case-insensitive substring `bar` / `بار`.
6. **Legacy remap**: loading a saved project whose stored `universeId` is `r_sushi_bar` resolves to the `r_sushi_counter` entry without throwing.
