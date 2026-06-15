# Phase 1 Data Model: Phase 23 — Conditional Copy Structure, Anti-Sameness & Variation Carousel

All additions are **additive** — no Firestore migration, no field-count change to the emitted copy fields. New frontend state lives in the Zustand store; new backend data lives in `copyDiversity.ts` (pure structures), `hookAnglesKnowledge.ts` (pool shape), and additive fields on `creativeMemory` records + the `resolutionTrace`.

---

## Frontend (Zustand store + transient UI)

### Entity: VariationCarouselState (23.A) — NEW
Per-card in-card carousel state. Keyed by hook variant.

| Field | Type | Notes |
|---|---|---|
| `variations` | `Record<HookVariantKey, HookVariation[]>` | `HookVariantKey = 'A'\|'B'\|'C'\|'D'`. Ordered list of variations for each reference card. Empty until first "Generate 4 More". |
| `activeIndex` | `Record<HookVariantKey, number>` | Currently displayed position per card. `0` = reference hook; `1..N` = `variations[i-1]`. Defaults to `0`. |
| `capReached` | `Record<HookVariantKey, boolean>` | `true` when the per-card variation array (the value stored within the Record for that HookVariantKey) reaches 11 items (1 reference + 11 = 12 positions). |

**Validation / rules**
- `variations[v].length` MUST NOT exceed 11 (cap = 12 positions incl. reference). FR-005, FR-006.
- The reference hook (position 0) is rendered from its existing `tovText` block and is never stored as a variation and never mutated. FR-002.
- `activeIndex[v]` is clamped to `[0, variations[v].length]`.
- RTL: navigation direction is presentational (next advances leftward when `lang==='ar'`); the underlying index order is unchanged. FR-007.

### Entity: HookVariation (23.A) — NEW
One generated variation inside a card.

| Field | Type | Notes |
|---|---|---|
| `hookText` | `string` | The headline (same field semantics as the existing `HOOK_TEXT`). |
| `subhead` | `string` | `SUBHEADLINE`. |
| `cta` | `string` | `CTA_BUTTON`. |
| `benefit` | `string` | `BENEFIT` (optional). |
| `rawBlock` | `string` | The full `HOOK_START/END` (or `ANGLE_START/END` for carousel) text block, so existing Approve/Edit/Batch handlers can operate on it unchanged. |
| `claimFlags?` | `{ text: string; reason: string }[]` | Carried through from the backend if present (Phase 22 mechanism). |

**Relationships**: belongs to one reference card (`HookVariantKey`); shares that card's resolved hook **angle** and **structure** (FR-008). For carousel-ad projects, a variation is an alternative slide-1 hook backed by its own slide set (FR-011) — `rawBlock` holds the `ANGLE_*` block.

**Action targeting (FR-004)**: Approve / Edit / AI Edit / Batch resolve the "current hook" as `activeIndex===0 ? referenceBlock : variations[activeIndex-1].rawBlock`.

---

## Backend — hook angle pools (23.B)

### Entity: DimensionEntry — NEW (replaces fixed-4 layout in `ANGLE_VARIATION_BLUEPRINTS`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identifier for fingerprinting (e.g., `urgency_financial`, `urgency_momentum`). |
| `label` | `string` | Human dimension name (e.g., "Price increase / value loss"). |
| `psychology` | `string` | The existing dimension psychology text, copied **verbatim** for migrated entries. FR-013. |
| `constraints` | `string` | "Must reference a time element…" style guidance (verbatim where migrated). |
| `feeling` | `string` | Emotional target (verbatim where migrated). |
| `arabicCue?` | `string` | Arabic phrasing, preserved verbatim where present. |

### Entity: AngleDimensionPool — NEW

| Field | Type | Notes |
|---|---|---|
| `angleId` | `string` | e.g., `urgency`, `pain`, `statistics` (existing angle ids, unchanged). |
| `dimensions` | `DimensionEntry[]` | 6–8 entries. The first 4 are the migrated Financial/Time/Status/Skill (verbatim); 2–4 added in the same voice, each satisfying that angle's `ANGLE_HARD_RULES` checkable element (R2). |

**Validation**
- `6 <= dimensions.length <= 8` per angle. FR-013.
- Every dimension, when used, must still be able to satisfy `ANGLE_HARD_RULES[angleId]` (preserved untouched). FR-024.
- The angle id set is unchanged — no new angles, no renamed/removed angles. FR-012.

### Entity: OpeningStructure — NEW (formalizes existing soft list)

| Field | Type | Notes |
|---|---|---|
| `id` | `'percentage'\|'question'\|'imperative'\|'ratio'\|'conditional'\|'direct_address'\|'time_reference'` | The 7 existing opening forms (`generators.ts:2284-2291`). |
| `template` | `string` | The existing one-line pattern text, verbatim. |

**Rules**: a per-project rotation assigns which openings the 4 hooks use; no opening is permanently banned (FR-015, FR-017).

---

## Backend — anti-repetition memory (23.B/23.C)

### Entity: `AngleFingerprint` — NEW (additive, single canonical storage)
Recorded per generation; read back (recent ~10 per user, then caller filters by `angleKey`) to bias new draws. Schema field names and the storage path are **fixed** by the contract at `specs/959-copy-structure-variation/contracts/anti-repetition-memory.md`; the data model and code match that contract verbatim.

| Field | Type | Notes |
|---|---|---|
| `userId` | `string` | Scope key (no cross-user leakage). Stored alongside the fingerprint (writer adds it; reader is keyed on the collection path). |
| `angleKey` | `string` | Locked hook angle (single) or `carousel-cold` / `carousel-retargeting` (carousel). |
| `dimensionIds` | `string[]` | The `DimensionEntry.id`s drawn (single-hook path). |
| `openingIds?` | `string[]` | The opening-structure ids drawn (single-hook path). |
| `storyFamilies?` | `string[]` | The 4-of-7 carousel families drawn (carousel path). 23.C. |
| `timestamp` | `FirebaseFirestore.Timestamp` (read) | Server timestamp. Write-time `FieldValue.serverTimestamp()`; reader receives a Firestore `Timestamp` (callers can convert with `.toMillis()`). Always set by the writer — callers should NOT supply it. |

**Storage** (single canonical home — matches the contract):
- Collection: `creativeMemoryFingerprints/{userId}/entries/{entryId}`
- Each entry stores one `AngleFingerprint` plus the inherited `userId` field.
- No migration: legacy `creativeMemory/{creativeId}` records continue to work as before; they simply lack the fingerprint fields and contribute no bias (FR-016 ages out / absent = no bias).

**Validation / rules**
- Reads are scoped by the writer's `userId` (encoded in the collection path), ordered by `timestamp` desc, limited to `FINGERPRINT_WINDOW = 10`. Callers then filter by `angleKey` (FIFO oldest-first; oldest entry at index 0).
- Bias **down-weights** recent ids; never excludes. If all options are recent → least-recently-used selection. FR-017, SC-008.
- First-ever project: zero fingerprints → rotation-only selection, no error. Edge case + SC-008.

---

## Backend — carousel slide plan (23.C)

### Entity: SlideEntry — EXISTING (`slidePlanEngine.ts`), behavior changed not shape
Shape unchanged: `{ slide, role, hasCTA, narrativeAngle, photoInjection }`.

**Changed behavior**
- Middle assignment: `pool[i % pool.length]` → `pool[(i + offset) % pool.length]`, `offset` from the per-project seed (D9, D10).
- `buildSlidePlan` becomes **wired into** the live carousel path (currently unused).

**Invariants (re-verified post-rotation, unchanged from contract)**
- `slideCount` 2–9 (throws otherwise).
- CTA on slide 1 and last only.
- Photo injection on slide 1 only.
- No two adjacent middle slides share an angle.
- FR-021; contract `carousel-slide-count-plan.md` updated in lockstep (FR-022).

### Entity: CarouselStoryDirectionDraw — NEW (logical, produced by `rotateCarouselAngles`)

| Field | Type | Notes |
|---|---|---|
| `campaignType` | `'cold'\|'retargeting'` | Selects the 7-angle pool. |
| `families` | `string[]` (length 4) | 4-of-7 drawn, rotated + memory-biased per project. Feeds `generateCarouselAngles` block selection (`ANGLE_START_A..D`). FR-019. |

---

## Audit trace (additive)

### Entity: resolutionTrace.copyDiversity — NEW sub-object (Principle VI)

| Field | Type | Notes |
|---|---|---|
| `seed` | `string` | The project rotation seed used. |
| `angle` | `string` | Locked angle / campaign type. |
| `drawnDimensionIds?` | `string[]` | Single-hook draw result. |
| `openingIds?` | `string[]` | Opening rotation result. |
| `storyDirectionFamilies?` | `string[]` | Carousel picker draw. |
| `middleAngleOrder?` | `string[]` | Rotated middle-slide sequence. |
| `memoryBiasApplied` | `boolean` | Whether recent fingerprints influenced the draw. |
| `fingerprintsConsidered` | `number` | Count of recent fingerprints read (≤ ~10). |

Purely additive to the existing `ResolutionTrace`; no consumer is required to read it (FR-031 keeps scoring/rewrite out of the loop).
