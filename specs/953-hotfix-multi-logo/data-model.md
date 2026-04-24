# Phase 1 Data Model — HOTFIX-D

This hotfix does **not** introduce a new schema or modify persisted-record structure. The only entity involved (`brandLogos`) already exists in `src/types.ts` as `brandLogos?: string[]` with an accurate "(Max 5)" comment. The hotfix corrects runtime behavior to honor the schema.

---

## Entities

### Brand Logo Set

The ordered collection of 0–5 base64-encoded image data-URLs a user has attached to a project's brand-assets slot ("Box B").

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `brandLogos` | `string[]` (optional) | `0 ≤ length ≤ 5`; each element is a valid `data:image/...;base64,...` URL | Existing field on `AdInputs`. No change. |

**Ordering semantics** *(clarified 2026-04-24)*:
- The array order is a **display/storage order only**. It is preserved for deterministic UI behavior (preview thumbnails render in upload order, removal by index is stable, reload restores the same order).
- The array order **does NOT** carry visual-prominence meaning. No element is "primary"; all uploaded logos are rendered as equal peers. This invariant is enforced at the prompt layer (see `contracts/generator.md`).

**Validation rules**:
| Rule | Enforcement point | Violation handling |
|---|---|---|
| `length ≤ 5` | Frontend upload handler (`InputForm.tsx::handleFileUpload` / `handleDrop`) | Accept first `(5 − currentLength)` files; reject remainder with user-visible message naming the count ignored. |
| `length ≤ 5` | Backend sanitizer (`generators.ts:4192`) | Silent `.slice(0, 5)` — defence-in-depth. Must not throw. |
| Each element a valid data-URL | Frontend upload handler via `compressImage` | Existing behavior — unchanged. Invalid files caught by `compressImage` throw path. |
| Non-image MIME | Frontend upload handler file-filter | Existing behavior — unchanged. |

**Lifecycle**:
- **Create**: User drops/clicks to upload one or more image files. Each is base64-encoded via `compressImage` and appended to the array.
- **Read**: Re-hydrated from Firestore `generations/{genId}.input.brandLogos` or IndexedDB `SavedProject.inputs.brandLogos` on project reload. Passed through unchanged except for the defence-in-depth sanitize.
- **Update — remove**: `removeFile(idx, 'brand')` filters the array by index; the slot closes (array shrinks), upload capacity increases by 1.
- **Update — add more**: User uploads additional files; array grows up to cap 5. Beyond cap = partial-accept per overflow rule.
- **Delete**: Removing all logos leaves `brandLogos: []`. Rendering falls into the "zero logos = zero branding marks" branch.

**State transitions**: None beyond array grow/shrink. No named states.

---

## Relationships

**`brandLogos` is embedded in**:
- `AdInputs` (frontend type, `src/types.ts:272`) — passed to every generator call.
- `SavedProject.inputs.brandLogos` (via `SavedProject.inputs: AdInputs`) — persisted in IndexedDB and Firestore `users/{uid}/projects/{projectId}`.
- `generations/{genId}.input.brandLogos` — persisted per-generation alongside the resolution trace.

No cross-entity joins, no references, no cascade behaviors. The array is self-contained.

---

## Derived / computed properties

None. The hotfix explicitly rejects any "primary logo" derived property (see `spec.md` Out of Scope). The upload-order list is the only semantic structure.

---

## Scale / volume assumptions

| Dimension | Value | Notes |
|---|---|---|
| Max logos per project | 5 | Hotfix cap. |
| Max bytes per logo | Governed by existing `compressImage` | Typically ≤100 KB post-compression. Unchanged. |
| Total bytes of a 5-logo set | ≤ ~500 KB | Still well within Firestore document limits (1 MB) when persisted inline. Within Gemini 3.1 image-input budget. |
| Saved-project growth | +~400 KB (worst case delta vs 1-logo) | Acceptable; no new storage path needed. |

---

## Non-goals (explicitly deferred to other hotfixes / future work)

- Any `LogoPlacement` entity — deferred to **HOTFIX-E** (deterministic compositing).
- Any `primaryLogoIndex` / user-controlled ordering metadata — deferred indefinitely; spec Out-of-Scope.
- Any per-logo metadata (alt text, vendor, role) — not requested.
- Any Storage-URL-based storage instead of inline base64 — orthogonal concern, not in this hotfix.
