# Batch 04 — What's Working Dashboard Polish (7 fixes)

**Date:** 2026-07-25
**Branch:** `phase-14-rag-meta`
**Scope:** seven independent dashboard fixes — sync routing, 7-day spend, currency, image-only linking, Link-picker permissions, modal backdrop, cooldown cleanup.

---

## Summary of gates

| Gate | Result |
|---|---|
| `functions` `npm run build` (tsc) | **PASS** — clean compile |
| `functions` `npm test` | **PASS** — 237 pass, 0 fail |
| frontend `npm run build` (tsc + vite) | **PASS** — built in ~12s |
| `node scripts/sc11Guard.mjs` | **PASS** — 79 files scanned, 0 forbidden terms |
| `firebase deploy --only functions` | **PASS** — all functions updated (europe-west1 + `purgeExpiredWorkspaces` us-central1) |
| `firebase deploy --only firestore:indexes` | **PASS** — new `generations` index deployed |
| `firebase deploy --only firestore:rules` | **No change** — rules already up to date (see FIX 5) |

---

## FIX 1 — Dashboard "Sync Now" routes through the working sidebar sync

**Changed:** `src/App.tsx` (dashboard mount), `src/components/WhatsWorkingDashboard.tsx`.

The dashboard's `onSyncNow` previously called `metaService.triggerWorkspaceSync` → `triggerMetaSync`,
which was failing. It now calls `handleSyncMeta()` — the exact handler the sidebar's "Sync Now"
uses (`metaService.syncPerformance` → `metaSyncPerformance`). `handleSyncMeta` already owns its
toasts, `metaSyncing` state, connection refresh, and hook-angle cache invalidation, so the mount
handler is now a one-liner `await handleSyncMeta()`.

To make freshly-synced data appear without a manual reload, `SyncStatusBar`'s `onSync` now awaits
`props.onSyncNow()` and then re-runs the component's `fetchData()` (re-calls
`getWhatsWorkingDashboard`).

> **Architectural caveat (flagged, not silently worked around):** `metaSyncPerformance` writes to
> the **user-level** performance paths, not the **workspace-scoped** `adAccounts/{id}/…` subtree
> that this dashboard reads (sync-status doc, verdicts, angles, spend). So routing the button here
> makes the sync *run reliably*, but the dashboard's own sections will only reflect it once the
> workspace-scoped data is populated. That workspace-scoped write is exactly the previously-held
> "bridge" work (still stashed, not shipped). This fix does what was asked (route to the working
> sync + auto-refetch); closing the display gap needs the bridge or an equivalent workspace-scoped
> write, and remains a separate decision.

## FIX 2 — Spend display switched from 3 days to 7 days (display only)

**Changed:** `functions/src/metaGraph.ts` (none — window already fetched),
`functions/src/metaSync/shared.ts`, `functions/src/whatsWorkingDashboard.ts`,
`src/components/WhatsWorkingDashboard.tsx`, `src/i18n.tsx`.

- The sync already fetches Meta's `last_7d` daily window (`InsightsTimeWindows.last7DaysDaily`).
  Meta's `last_7d` preset **excludes today**, so it is already "7 complete days, no partial day."
- `aggregateAdMetrics` now also returns `spend7d = sum(last7DaysDaily.spend)`; the sync writes
  `spend7d` onto each `adPerformance` doc.
- The dashboard sums `spend7d` across ads into `totalSpend7d` (falling back to `spend3d` on
  legacy docs so the strip never blanks out) and returns `spend7dLabel` (+ raw `totalSpend7d`).
- Labels updated: EN "Spend (last 7 days)", AR "الصرف (آخر 7 أيام)".

> **Qarar engine untouched:** verdicts still run on the internal 3-day rolling window
> (`qararEngine.ts` / `shared.ts` verdict path). Only the display number changed.

## FIX 3 — Ad-account currency

**Changed:** `functions/src/metaGraph.ts`, `functions/src/metaSync/shared.ts`,
`functions/src/metaConnection.ts`, `functions/src/whatsWorkingDashboard.ts`.

- New `fetchAdAccountCurrency()` — one cheap `GET /{act_id}?fields=currency`.
- The sync fetches it **best-effort** (a failure only pushes an error string, never breaks the
  sync) and persists it via `patchStoredConnection({ currency })` onto the workspace-private
  connection doc. It only writes when a value was actually returned, so a transient failure never
  clears a good code.
- The dashboard reads `connData.currency` (default `"USD"` for accounts synced before the field
  existed — with a `TODO` to also capture currency during the Meta connect flow).
- New `formatMoney()` / `makeSpend7dLabel()` render the amount in-currency:
  `USD → $1,835.90`, others → `1,835.90 AED` / `1,835.90 SAR` / `1,835.90 EGP`.

## FIX 4 — "Ads That Need Linking" filtered to image creatives

**Changed:** `functions/src/metaGraph.ts`, `functions/src/metaSync/shared.ts`,
`functions/src/whatsWorkingDashboard.ts`.

- `HIERARCHY_AD_FIELDS` now also requests `creative{…,object_type,video_id}`.
- New `deriveCreativeType(creative)` → `"image" | "video" | "unknown"` (video when
  `object_type === "VIDEO"` or a `video_id` is present). Stored as `creativeType` on each
  `adPerformance` doc.
- The dashboard's unmatched (Section E) list now excludes `creativeType === "video"`. Legacy docs
  without the field (`"unknown"`) are **kept**, so no linkable image ad is hidden on older data.
- Video ads still appear in **Recent Verdicts** and are still counted in the **summary strip** —
  they are only removed from the linking list, where they could never match a Pro Ads AI
  generation. The 20-item cap is unchanged (now 20 most-recent unmatched **image** ads).

## FIX 5 — Link-picker "Missing or insufficient permissions"

**Changed:** `src/components/LinkAdPickerModal.tsx`, `firestore.indexes.json`.
**Not changed:** `firestore.rules` (already correct — see below).

Root cause was **not** a missing rule. The `generations` read rule already requires
`resource.data.userId == request.auth.uid` (firestore.rules:196–200). The picker's query filtered
by `workspaceId` + `imageFingerprint` but **not** `userId`, and Firestore rejects any query it
cannot prove satisfies the read rule → "Missing or insufficient permissions."

- The query now adds `where("userId", "==", auth.currentUser.uid)` as the first filter (with an
  early bail-out when there is no signed-in uid).
- Added the matching composite index to `firestore.indexes.json`
  (`userId ASC, workspaceId ASC, imageFingerprint DESC, timestamp DESC`) and deployed it. The
  index builds in the background; the picker works once it finishes (seconds-to-minutes for this
  collection size).
- `firestore.rules` needed no edit; the rules deploy reported "already up to date."

## FIX 6 — Link-picker modal backdrop

**Changed:** `src/components/LinkAdPickerModal.tsx`.

The panel was already a solid `bg-slate-950` card mounted at the app root (so `fixed` covers the
viewport). The backdrop was `bg-black/60`, which let page content show through. Bumped to
`bg-black/80 backdrop-blur-sm` so background content is not visible through the modal, matching the
`MetaAccountPickerModal` overlay pattern.

## FIX 7 — Cooldown restored to 1 hour

**Changed:** `functions/src/metaSync/trigger.ts`.

`COOLDOWN_MS` restored from the temporary `60 * 1000` (1 minute, testing) back to
`60 * 60 * 1000` (1 hour). Cleanup only.

---

## Notes

- **Held work untouched:** the previously-stashed sync "bridge" (`stash@{0}`) was **not** applied,
  deployed, or committed. See the FIX 1 caveat for why it still matters to the dashboard's data
  sections.
- **New backend fields are additive:** `adPerformance.spend7d`, `adPerformance.creativeType`, and
  `private/metaConnection.currency` are all optional/back-compatible; the dashboard degrades
  gracefully on docs written before this batch (spend7d → spend3d fallback; creativeType absent →
  treated as linkable; currency absent → USD).

## Verification status

- **Verified:** compile, unit tests (237/0), frontend build, SC-11 guard, function + index deploys.
- **Not verified end-to-end against live Meta:** a real "Sync Now" + Link-picker open on a real
  workspace still confirms (a) spend7d/currency/creativeType populate on real docs, and (b) the
  Link picker query succeeds once the new index finishes building.
