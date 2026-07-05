# Quickstart: Phase 14 — RAG + Meta Reporting Feedback Loop

**Feature**: `phase-14-rag-meta` · project `proadsai-saas` · region `europe-west1`
**Audience**: a developer picking up implementation. Verifies each layer end-to-end. PowerShell syntax throughout.

---

## 0. Prerequisites (gate before production)

- Phase 10 (Favorites & Workspace) and Phase 12 (Workspace Logic) merged to main.
- **Verify generations persist `workspaceId`** when created inside a workspace (spec §12 prerequisite gate) — Phase 14's isolation depends on it.
- `sharp ^0.33.5` present (it is — used by `offerOverlay.ts` et al.).
- A Cloud KMS key ring + key in `europe-west1` for Meta-token envelope encryption.
- A Cloud Tasks queue (Firebase Functions v2 task queue) for `metaSyncAccountWorker`.

```powershell
cd D:\proads-worktrees\phase-14-rag-meta
npm install ; cd functions ; npm install ; cd ..
```

---

## 1. Layer 1 — Funnel Settings & CPA cap (US1)

1. Connect a Meta account and select it → the required **Funnel Settings** form appears before any performance data.
2. Enter **AOV 43 / HTO 3500 / HTO conversion 3 / ROAS 1.0** → expect Target CPA **$43**, fullBuyerValue **$148**, maxCPA **$74**, no cap warning.
3. Change ROAS to **0.5** → raw **$86** capped to **$74**, cap warning shown, `effectiveTargetCPA = $74`.
4. Choose archetype **free lead-magnet** → two conditional fields (`attendanceRate`, `buyRateFromAttendees`) appear; CPL two-anchor model replaces the CPA cap.
5. Reload → all values + derived targets persist (per workspace-account). After 30 days a dismissible Arabic review prompt appears.

```powershell
cd functions ; npm test -- cpaEconomics ; cd ..
```

## 2. Layer 2 — Daily sync (US2)

1. Click **"Sync Now"** → `triggerMetaSync` runs the worker for this workspace; verify `adPerformance` docs, `baselines`, a `syncSnapshots` entry, and `metaConnection.lastMetaSyncAt`.
2. Button greys for **1 hour** after sync.
3. The 3am dispatcher (`metaDailySync`) enqueues one Cloud Task per `metaConnected` account; the worker retries with a concurrency cap and isolates failures.
4. Run sync twice with unchanged data → identical result (idempotent). Force a partial fetch failure → last-good aggregates intact, snapshot `status:'partial'`.
5. Expire the token → account flagged `needsReauth`, re-auth prompt shown, **no data deleted**. Confirm `syncSnapshots` never exceeds **7** per account.

## 3. Layer 3 — Image matching (US3)

1. Generate an image → confirm `imageFingerprint` on the generation doc + an `imageFingerprints/{hash}` index entry (client-written after `addDoc`).
2. Upload that image unedited to Meta → sync → **auto-match** (`auto_hash`); metadata (hook angle, visual pattern, layout, art direction, universe, modes) is exposed.
3. Upload an unrelated image → appears **unmatched**; link it via the dashboard picker (same-workspace generations only); manual link persists and locks.
4. Run `backfillImageFingerprints` → pre-Phase-14 generations gain fingerprints and auto-match; re-run → idempotent (skips fingerprinted).
5. Delete a matched generation → its ad reverts to unmatched for display; aggregates unchanged (Edge Case 16).

## 4. Layer 4 / 4b — Verdicts & learning (US4 / US5)

1. Feed Link CTR **0.4% @ 2,000 imp** → `🔴 K3 الهوك ميت — محدش بيوقف` + a diagnosis line.
2. Feed CPA ≤ effectiveTargetCPA (3-day) + Link CTR > account متوسط → `🟢 S1`.
3. Awareness/reach/engagement campaign with 0 conversions → **no kill verdict** (SC-12); only K3/K4 can fire.
4. Same image in two ad sets (win Gulf/broad, lose diaspora/retargeting) → two records, creative judged by best, hook×geo×audience aggregates updated (conversion bucket only).

```powershell
cd functions ; npm test -- qararEngine ; npm test -- learningAggregates ; cd ..
```

## 5. Layer 5 / 6 — Dashboard & icons (US6 / US7)

1. Open **"What's Working"** → six sections render with the user's own numbers; **no** "متوسط"/"CTR"/"CPM"/"CPA"/percentages anywhere (SC-11).
2. Seed data where `logical_authority` underperforms and `urgency` is top → Step 1 shows `⚠️` on authority, `🔥` on urgency; tapping `⚠️` shows a plain-Arabic tooltip naming best angles, no numbers.
3. Angle with < 3 conversion-matched ads → **no icon**. No Meta connection → no icons anywhere.

```powershell
npm run lint   # SC-11 QA check: zero forbidden terms in user-facing copy
```

## 6. Layer 7 — RAG & Phase 20 (US8)

1. With **< 10** conversion-matched creatives → generation is byte-identical to today (no injection).
2. With **≥ 10** → a `PERFORMANCE_CONTEXT` block appends at hook + visual-plan points, and up to **5 most-recent S1 winners** reach the Concept Director's `pastWinningAds`.
3. Force a winners-fetch failure → `pastWinningAds:[]`, generation proceeds (fail-open).

---

## 7. Full regression gate

```powershell
npm run build ; cd functions ; npm test ; cd ..
```
Confirm **SC-10** (no-Meta users unchanged), **SC-11** (no forbidden UI terms), **SC-12** (no kills on non-conversion campaigns). Merge via GitHub UI only.
