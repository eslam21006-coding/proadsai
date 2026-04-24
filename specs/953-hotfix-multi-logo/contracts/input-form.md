# Contract — InputForm Upload (UI Surface)

Scope: `src/components/InputForm.tsx` — the Box B (brand-assets) upload zone.

---

## Required inputs

| Source | Shape | Notes |
|---|---|---|
| File-picker change event | `FileList` with 1+ image files | Triggered by `<input type="file" multiple>` click. |
| Drop event on brand zone | `DataTransferItemList` with 1+ image files | Triggered by drag-and-drop. |
| Existing state | `inputs.brandLogos: string[]` (length 0–5) | Read for current count. |

## Required visible output

| Surface | Expected state |
|---|---|
| Upload-zone capacity badge | Reads **"Max 5"** (English label, matches the `personalPhotos` zone's existing "Max 5" convention). Zero production surfaces show "Max 1" post-hotfix. |
| Section title badge (both zones) | Reads `${N} photos · ${M} logos` where `M` is the current `brandLogos.length`. Use plural **"logos"** (not "logo"). |
| Preview grid | Renders a thumbnail for every logo in `brandLogos`, up to 5, in upload order. Each thumbnail has a hover remove (×) control. Existing thumbnail markup unchanged. |
| Empty-state text | Unchanged ("Drag logo or click to upload" / Arabic equivalent — intentionally singular even when cap is 5, matching the personal-photos zone's existing convention). |

## Upload-handler behavior (CRITICAL — changed by this hotfix)

### Handler: `handleFileUpload(e, 'brand')` (around `InputForm.tsx:836–862`)

```text
Inputs:
  files      ← Array.from(e.target.files)
  max = 5    (was 1)
  current    ← inputs.brandLogos?.length || 0

Procedure:
  1. Compute remaining = max - current.
  2. If files.length ≤ remaining:
       Accept all. Compress + setInputs (existing path). setError(null).
  3. Else if remaining > 0:
       accepted = files.slice(0, remaining)
       rejectedCount = files.length - remaining
       Compress + setInputs with `accepted`.
       setError(`Only ${max} logos allowed — ${rejectedCount} extra file(s) ignored.`)
         (Arabic: "يسمح فقط بـ ${max} شعارات — تم تجاهل ${rejectedCount} ملف(ات) إضافية.")
  4. Else (remaining === 0):
       setError(`Only ${max} logos allowed — ${files.length} extra file(s) ignored.`)
       No setInputs call. Existing array untouched.
```

### Handler: `handleDrop(e, 'brand')` (around `InputForm.tsx:954–975`)

Identical procedure to `handleFileUpload` — share the same 4-step control flow for the brand branch.

### Handler: `removeFile(idx, 'brand')` (around `InputForm.tsx:864–870`)

**No change.** Existing filter-by-index behavior is correct for a multi-logo array.

## Blocked behaviors

- **MUST NOT** silently drop files when count would exceed 5. Every rejected file must be reflected in the surface message count.
- **MUST NOT** reject the entire drop when a partial subset is acceptable. The existing "if (current + newFiles.length > max) return" short-circuit (L843–846, L957–960) must be removed.
- **MUST NOT** preserve the "Max 1" badge text anywhere.
- **MUST NOT** render the section-title badge as singular "logo" (was: `{length} logo`). Use plural "logos".

## Acceptable variation

- Error-message wording may be translated / localized consistently with the rest of the form. Message count (`rejectedCount`) must be accurate.
- The thumbnail grid's CSS `grid-cols-5` is already correct for up to 5 logos — no change needed.
- Arabic/English label copy may be adjusted by the implementer provided the count-semantics are preserved and both languages agree.

## Fail conditions (for manual QA / contract fixtures)

| Scenario | Expected | Fails if |
|---|---|---|
| Upload 3 files into empty Box B | All 3 appear as thumbnails; `brandLogos.length === 3`; no error. | Fewer than 3 accepted; an error is shown. |
| Upload 6 files into empty Box B | First 5 appear; error shows "Only 5 logos allowed — 1 extra file(s) ignored." | Fewer than 5 accepted; error count wrong; entire drop rejected. |
| Box B has 3, user drops 4 more | First 2 of the 4 accepted (total 5); existing 3 untouched; error shows "…2 extra…". | Existing 3 replaced/reordered; fewer than 5 after; wrong count in error. |
| Box B has 5, user drops any more | No new acceptance; existing 5 preserved; error shows count of ignored. | Any existing logo replaced; new logo silently dropped without error. |
| Remove logo at index 1 from 5-logo set | Array becomes length 4, indices 0,2,3,4 remain in that relative order → new indices 0,1,2,3. | Adjacent logos removed; wrong index removed; gap preserved. |
| Saved project with 3 pre-existing logos reloads | `inputs.brandLogos.length === 3` after parse; all 3 thumbnails rendered. | Only 1 thumbnail rendered (parse still slicing to 1). |

## Badge / label specification

| Element | Before | After |
|---|---|---|
| `InputForm.tsx:2297` (brand-section title badge) | `<span>Max 1</span>` | `<span>Max 5</span>` |
| `InputForm.tsx:2272` (top section title badge) | `{N} photos · {M} logo` | `{N} photos · {M} logos` |

## Non-goals in this contract

- No drag-to-reorder control.
- No explicit "primary" picker.
- No per-logo role dropdown.
