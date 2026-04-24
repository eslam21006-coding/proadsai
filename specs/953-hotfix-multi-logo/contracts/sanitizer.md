# Contract — Client-side Sanitizer

Scope: every location on the client that copies `inputs.brandLogos` into a "cleaned" copy before shipping it to the backend.

---

## Sites covered

| File | Line | Current | Change |
|---|---|---|---|
| `src/services/geminiService.ts` | 51 | `clean.brandLogos = (clean.brandLogos || []).slice(0, 1);` | `.slice(0, 5)` |
| `src/services/geminiService.ts` | 263 | `inputsWithPhotos.brandLogos = (inputs.brandLogos || []).slice(0, 1);` | `.slice(0, 5)` |
| `src/App.tsx` | 2100 | `brandLogos: inputs.brandLogos?.slice(0, 1) \|\| []` (AB variations) | `.slice(0, 5)` |
| `src/App.tsx` | 3624 | `brandLogos: inputs.brandLogos?.slice(0, 1) \|\| []` (single-mode concepts) | `.slice(0, 5)` |
| `src/App.tsx` | 3646 | `brandLogos: inputs.brandLogos?.slice(0, 1) \|\| []` (carousel-mode concepts) | `.slice(0, 5)` |
| `src/App.tsx` | 5530 | `brandLogos: inputs.brandLogos?.slice(0, 1) \|\| []` (batch-hooks concepts) | `.slice(0, 5)` |
| `src/components/InputForm.tsx` | 315 | `brandLogos: (raw.brandLogos \|\| []).slice(0, 1)` (saved-project parse) | `.slice(0, 5)` |

**Intentionally left unchanged**: `src/App.tsx:3253` (`brandLogos: []` — concept-generation deliberately sends no logo pixels because the concept layer doesn't benefit from seeing the image, only text context). This is a distinct empty-array assignment, not a truncation.

---

## Contract rules

1. **Identity of cap value**: All 7 sites above MUST use the same numeric cap of 5. No site may use a different cap. No mixed 1 / 3 / 5.
2. **Pass-through for valid inputs**: For any input where `brandLogos.length ≤ 5`, the sanitizer MUST NOT mutate the array length. It is a no-op in the common case.
3. **Deterministic truncation for oversized inputs, with audit trace**: If `brandLogos.length > 5` (should not happen with a compliant frontend, but may occur from a legacy saved project, a test fixture, or a crafted client), truncate to the first 5 AND emit a structured `console.warn` line BEFORE the slice. Required shape:

    ```js
    console.warn(JSON.stringify({
      event: 'brandLogos_truncated',
      received: rawBrandLogos.length,
      keptCount: 5,
      userId: (inputs as any)._userId || null,
    }));
    ```

    No error thrown, no user-visible message — the upstream upload handler already surfaced the user-facing signal, so the backend stays non-disruptive on the happy path. The warn line satisfies Constitution Principle VII: **rule** = Max 5 product cap (documented in spec.md FR-001 and this contract), **signal** = user-facing error from the upload handler (UI path), **trace** = this warn line (non-UI / bypass path). This closes the silent-override concern raised by Principles VI and VII.
4. **No reordering**: Sanitizer MUST preserve the array order unchanged.
5. **No deep mutation**: Sanitizer MUST NOT modify individual logo strings (no re-encoding, no base64 rewriting).

## Fail conditions

| Scenario | Expected | Fails if |
|---|---|---|
| Input with 3 valid logos goes through each of the 7 sites | Output has exactly 3 logos in the same order. | Output length 1 (old bug) or anything other than 3. |
| Input with 0 logos (`undefined` or `[]`) | Output is `[]`. | Output undefined or includes phantom elements. |
| Input with 7 logos (smuggled) | Output is first 5 in order. | Output length differs from 5 or elements reordered. |
| `grep "brandLogos.*slice.*1" src/` after hotfix | Zero results. | Any `slice(0, 1)` remains in src/. |

## Verification

Run after the edit:
```bash
grep -rn "brandLogos.*slice(0, 1)" src/
grep -rn "brandLogos.*slice(0,1)" src/
# Both must return zero matches.
```
