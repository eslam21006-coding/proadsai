# Quickstart — HOTFIX-D Manual QA

End-to-end smoke for the multi-logo hotfix. Follow the steps after all source edits from `contracts/*.md` are in place.

## Setup

```bash
# Frontend
npm install
npm run dev            # http://localhost:5173

# Backend (in a second shell)
cd functions
npm install
npm run build
cd ..
firebase emulators:start --only functions,firestore,storage
```

Prepare three distinct PNG files on disk (≤500 KB each):
- `logo-company.png` (e.g. your company mark)
- `logo-cert.png` (e.g. a certification badge)
- `logo-partner.png` (e.g. a partner logo)

---

## S1. Upload UI — sanity (Story 1, SC-001/SC-002)

1. Open the app, start a new ad, reach Step 1 (Input Form).
2. Scroll to the Brand Assets zone (Box B).
3. **Assert**: The capacity badge reads **"Max 5"** (not "Max 1").
4. **Assert**: The top-section summary badge reads "`N photos · M logos`" (plural).
5. Click the Box B upload zone and select `logo-company.png`, `logo-cert.png`, `logo-partner.png` together.
6. **Assert**: Three thumbnails render in the 5-column grid.
7. **Assert**: The summary badge updates to "… · 3 logos".
8. Click the × on the middle thumbnail.
9. **Assert**: Two thumbnails remain, in their original order (company, partner).

## S2. Overflow UX (Story 1 scenario 4, FR-004)

1. Still on the Input Form. Re-upload to reach exactly 3 logos in Box B.
2. Drag-and-drop 4 more PNG files onto the Box B zone in one action.
3. **Assert**: Box B now has exactly 5 thumbnails (original 3 + first 2 of the new drop).
4. **Assert**: A visible error message reads: "Only 5 logos allowed — 2 extra file(s) ignored." (Arabic equivalent when `appLang === 'ar'`.)
5. **Assert**: The original 3 thumbnails are still in their original upload order at positions 0, 1, 2.

## S3. Single-ad render — 3 logos (Story 1, SC-003, SC-005)

1. Configure Step 1 with a minimal valid setup (avatar, hook angle, universe) and 3 logos in Box B.
2. Advance to Step 4 (Render).
3. Trigger a single ad render.
4. **Assert (UI)**: The render completes without error.
5. **Assert (visual)**: The rendered image shows three distinct brand marks, at comparable size, no single logo dominant over the others.
6. Open browser devtools → Network → inspect the `generateImage` call payload: `input.brandLogos` has length 3.
7. In the Firebase Emulator UI (Firestore) → `generations/{latestGenId}` → `input.brandLogos` array has length 3.

## S4. Carousel render — 2 logos, 5 slides (Story 2 scenario 1)

1. Back to Step 1. Set `adMode: 'carousel'`, `slideCount: 5`. Upload 2 logos.
2. Run through to Step 4 and trigger the carousel render.
3. **Assert (UI)**: All 5 slides complete.
4. **Assert (visual)**: Every slide shows both logos as equal peers.
5. In Firestore → each slide's persisted generation record → `input.brandLogos` array has length 2.

## S5. Batch render — 3 logos, 4 variants (Story 2 scenario 2)

1. On a Pro+ account (see CLAUDE.md plan config), set up a batch of 4 variants with 3 logos in Box B.
2. Trigger the batch run.
3. **Assert**: Every variant renders with all 3 logos.
4. In Firestore → each batch-item generation record → `input.brandLogos.length === 3`.

## S6. Zero-logo case (Story 3 scenario 3, FR-011)

1. New ad. Upload zero logos.
2. Render a single ad.
3. **Assert (visual)**: No invented logos. No placeholder brand marks. No fake "SHRM-like" text on props.
4. Inspect the generated build-plan JSON: no `BRANDING_LOGIC` content describing logos; the branding section reads "No logos provided."

## S7. Arabic prompt path — 2 logos (Story 3 scenario 4, Constitution V)

1. Set `adLanguage: 'ar_fusha'`.
2. Upload 2 logos. Render.
3. In Firestore → latest generation record → `resolutionTrace` → `finalPrompt` (or fetch from logs if not persisted): search for the Arabic phrase **`بحجم متماثل`**.
4. **Assert**: The Arabic equal-peer phrase is present. The old singular phrase **`شعار Box B إن وجد`** is absent.

## S8. Backward compatibility — pre-hotfix saved project (SC-007)

1. In Firestore Emulator, manually create a `users/{uid}/projects/{id}` document with `inputs.brandLogos: ['data:image/png;base64,<valid>']` (1 entry — mimicking a pre-hotfix save).
2. In the app, load that saved project via the project list.
3. **Assert**: The form re-hydrates with exactly 1 logo in Box B. No error. No truncation.
4. Upload 2 more logos — total 3.
5. Re-save and re-load.
6. **Assert**: All 3 persist across reload.

## S9. Contract fixtures (Phase 1 test harness)

```bash
cd functions
npm test -- --run contractFixtures
```

**Assert**: The 5 HFD-* fixtures (HFD.T1 through HFD.T5 in `contracts/generator.md`) all pass. Existing cultural-compliance fixtures (HFC-*) still pass.

## S10. Regression — single-logo visual parity (SC-006)

1. Upload 1 logo only. Render.
2. Compare visually against a pre-hotfix render of the same ad with the same 1 logo (from git main before this branch).
3. **Assert**: No meaningful visual regression in how the single logo is positioned / sized / rendered. (Minor stylistic variation is acceptable — the prompt is non-deterministic — but no structural regression.)

---

## Exit criteria

- S1–S10 all pass.
- No console errors in the browser during any step.
- No exceptions in the Functions emulator logs.
- `grep -rn "brandLogos.*slice(0, 1)" src/ functions/src/` returns zero matches.
- `grep -n "Max 1" src/components/InputForm.tsx` returns zero matches.
- `grep -n "ONLY logo allowed" functions/src/generators.ts` returns zero matches.
- `grep -n "render that image once" functions/src/generators.ts` returns zero matches.
