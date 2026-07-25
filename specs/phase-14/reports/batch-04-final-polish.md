# Batch 04 — Final Polish (Link picker modal + empty state)

**Date:** 2026-07-25
**Branch:** `phase-14-rag-meta`
**Commit:** `64acb46` (pushed)
**Scope:** two Link-picker fixes + the dashboard Sync-Now routing revert, frontend-only.

---

## FIX 1 — Link picker modal transparency

**File:** `src/components/LinkAdPickerModal.tsx`

### What was already true
The panel was already a **solid** `bg-slate-950` card, and the backdrop was
`bg-black/80 backdrop-blur-sm` at `z-[300]` (above the What's Working dashboard at `z-[200]`).
A solid `bg-slate-*` has no alpha, so the panel itself could never be see-through. The modal is
also mounted at the App root (a sibling of the dashboard overlay, not nested inside it), so its
`fixed inset-0` covers the full viewport.

### What changed (to match the requested pattern exactly)
- The opaque overlay now lives **directly on the fixed full-screen div**
  (`fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4`),
  replacing the separate `absolute inset-0` backdrop child. Same coverage, the exact single-div
  pattern requested.
- The panel is a **solid dark card** `bg-slate-900 border border-slate-700` — deliberately one
  step lighter than the `slate-950` dashboard behind it, so the panel reads as a distinct solid
  surface (the empty-state case is a large mostly-empty panel, which is what made it *feel*
  washed-out against the dark dashboard).

### Why NOT `bg-white dark:bg-slate-900`
The suggested `bg-white dark:bg-slate-900` is unsafe **in this app**: there is no
`darkMode: 'class'` in the Tailwind config (it defaults to `media` = the OS preference), the app
defaults to **light** mode and manages theme via **explicit conditional classes**, not Tailwind's
`dark:` variant (only that one `dark:` usage existed in all of `src`). So `dark:bg-slate-900`
tracks the user's OS theme, not the app's — on a light-OS user it would render a **white** panel,
and this modal's content (white headings, slate borders, a blue-900 gradient header) is built for
a dark surface, so a white panel would show white-on-white text. The Link picker only ever opens
from inside the always-dark What's Working dashboard, so a solid dark panel is the correct match.
`MetaAccountPickerModal` gets theme-awareness from an `isDarkMode` **prop**, not `dark:` classes —
the same reason this modal stays explicitly dark.

## FIX 2 — Empty-state message

**Files:** `src/components/LinkAdPickerModal.tsx`, `src/i18n.tsx`

The picker queries **generations** (with `imageFingerprint != null`), but its empty state reused
`whats_working.unmatched.empty` — "No unmatched ads" / "لا توجد إعلانات غير مربوطة" — which is
**also** the dashboard's "Ads That Need Linking" empty text. Changing that shared key would have
mislabeled the dashboard too.

Added a **new, picker-specific** key and pointed the modal at it (the dashboard key is unchanged):

| Key | EN | AR |
|---|---|---|
| `whats_working.link_picker.empty` | "No generations with fingerprints found. Generate a new image to start matching." | "لا توجد تصميمات مع بصمة. أنشئ تصميماً جديداً لبدء المطابقة." |

## Also in this commit — dashboard Sync Now routing

`src/App.tsx`: the dashboard "Sync Now" was routed **back** to `metaService.triggerWorkspaceSync`
(`triggerMetaSync`), the workspace-scoped sync that writes the paths the dashboard reads. Its
earlier failure causes (act_ double-prefix, first-sync null-safety crash) are already fixed and
deployed (commit `f8441a1`). The sidebar keeps its own `handleSyncMeta` (`metaSyncPerformance`)
path. The dashboard still auto-refetches after the sync resolves.

---

## Gates

| Gate | Result |
|---|---|
| `npm run build` (frontend, tsc + vite) | **PASS** (~26s) |
| `npm run dev` | Running on `http://localhost:5174/` (5173 in use); HMR applied all edits |

Frontend-only change — no backend build/deploy. No test file touched.

## Verification status

- **Verified:** compiles; HMR applied; empty-state key is picker-specific (dashboard text
  unchanged); panel is a solid, opaque dark card at a z-index above the dashboard.
- **Not machine-verifiable here (needs a human glance at `localhost:5174`):** the final rendered
  look of the modal. If it still reads as washed-out, the remaining lever is backdrop opacity
  (`/80` → `/90`), since the panel itself is provably opaque. Trivially reversible on this branch.
