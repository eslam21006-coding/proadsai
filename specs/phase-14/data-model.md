# Data Model: Phase 14 — RAG + Meta Reporting Feedback Loop

**Feature**: `phase-14-rag-meta`
**Scope**: Firestore collections, document schemas, indexes, security. **Additive only** — no destructive migration; all new/extended fields optional so legacy docs keep working.

> **Firebase constraints honored here**
> - Cloud Functions run in `europe-west1` (project `proadsai-saas`).
> - Never call `admin.firestore()` at module load — use a lazy `getDb()` after `initializeApp()`.
> - Derived data travels through request/response payloads, **not** module globals (separate Cloud Run containers).
> - No server-side writes keyed by `genId` inside `serverGenerateFinalAd` — the generation doc is created client-side via `addDoc`; `imageFingerprint` is written after that (FR-014).
> - **Everything is scoped per WORKSPACE and per ad account** (FR-023). The 1:1 workspace↔ad-account mapping (FR-026) means one account doc per workspace.

Collection root for all account data:
`users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/…`

---

## 1. `…/adAccounts/{accountId}/settings` — Funnel Settings *(new)*

Layer 1. Filled once per workspace-account, reviewed monthly. Derived targets recomputed server-side on save and echoed in the response.

```ts
interface FunnelSettings {
  accountId: string;
  accountName?: string;

  // ── Funnel type (closed enum — drives which conditional fields apply) ──
  funnelType: 'paid_event' | 'free_webinar' | 'paid_product' | 'lead_magnet_call';

  // ── Paid funnels only (paid_event, paid_product) ──
  aov: number | null;                        // $ actual incl. bumps + upsells
  hasHto: boolean;                           // "Has HTO?" — false ⇒ htoPrice/htoConversionRate forced to 0
  htoPrice: number;                          // $ — 0 if hasHto=false
  htoConversionRate: number;                 // % (e.g. 3 means 3%) — 0 if hasHto=false
  roasTarget: 1.0 | 0.65 | 0.5;              // break-even / invest-a-bit / invest-more (strict enum — no custom)

  // ── Free webinar / challenge only ──
  offerPrice: number | null;                 // $ sold at the end (also reused by lead_magnet_call)
  attendanceRate: number | null;             // % of registrants who attend
  buyRateFromAttendees: number | null;       // % of attendees who buy

  // ── Lead magnet → Call only (offerPrice reused from above) ──
  leadToCloseRate: number | null;            // % of leads who buy on the call

  // ── Derived (recomputed server-side on save; echoed in response) ──
  derived?: {
    // paid branch
    rawTargetCpa?: number;                   // AOV ÷ roasTarget
    fullBuyerValue?: number;                 // AOV + (htoPrice × htoConversionRate/100); = AOV when hasHto=false
    maxCpa?: number;                         // fullBuyerValue ÷ 2.0
    effectiveTargetCpa?: number;             // min(rawTargetCpa, maxCpa)  ← used everywhere downstream
    capApplied?: boolean;                    // rawTargetCpa > maxCpa (strictly greater)
    // free branch (two-anchor CPL)
    leadValue?: number;                      // free_webinar: offerPrice×(attendanceRate/100)×(buyRateFromAttendees/100)
                                             // lead_magnet_call: offerPrice×(leadToCloseRate/100)
    economicCeilingCpl?: number;             // 0.70 × leadValue (anchor 1 — ceiling)
    effectiveTargetCpl?: number;             // economicCeilingCpl, or 30-day rolling account CPL if lower
    operationalBaselineCpl?: number;         // 30-day rolling account CPL (anchor 2 — daily judgment)
    manualBenchmarkCpl?: number;             // fallback when no history
    computedAt: number;                      // epoch ms (passed in; never Date.now() at module load)
  };

  // ── Advisory flags (informational cards, non-blocking — spec §2.6) ──
  advisories?: {
    noHto?: boolean;                         // paid funnel + hasHto=false
    lowValue?: boolean;                      // aov (paid) or offerPrice (free) < $9
  };
  advisoriesDismissed?: {                    // per-card dismissal persistence (spec §2.6)
    noHto?: boolean;                         // hidden until the trigger condition changes then re-triggers
    lowValue?: boolean;
  };

  // ── Review cadence ──
  lastReviewedAt: number;                    // epoch ms
  reviewDueAt: number;                       // lastReviewedAt + ~30d
  createdAt: number;
  updatedAt: number;
  schemaVersion: 1;
}
```

**Rules**: `derived` is authoritative server output, echoed so the client renders the cap warning without re-deriving. `capApplied === true` ⇒ client shows the cap warning (FR-002); equality does not warn (FR-003). Paid types (`paid_event`/`paid_product`) populate the CPA branch — when `hasHto=false`, `htoPrice`/`htoConversionRate` are forced to 0 so `fullBuyerValue = AOV`. Free types populate the two-anchor CPL branch (FR-004): `free_webinar` requires `attendanceRate`+`buyRateFromAttendees`; `lead_magnet_call` requires `leadToCloseRate`. `advisories` drives the non-blocking Business Advisory Cards (spec §2.6) — computed but never gating; the target is always calculated regardless.

---

## 2. `…/adAccounts/{accountId}/syncSnapshots/{snapshotId}` — Sync Snapshot *(new)*

Layer 2. Raw fetched data with timestamp. **Retention: keep the last 7 per account; each sync prunes older ones.** Derived data below persists independently and is not pruned.

```ts
interface SyncSnapshot {
  snapshotId: string;
  syncedAt: number;
  trigger: 'scheduled' | 'manual';
  status: 'ok' | 'partial' | 'failed';
  raw: unknown;                    // campaigns/adsets/ads + insights payloads as fetched
  counts: { campaigns: number; adSets: number; ads: number; matched: number; unmatched: number };
  errors?: string[];               // partial-failure notes (never blocks last-good aggregates)
}
```

---

## 3. `…/adAccounts/{accountId}/adPerformance/{adId}` — Ad Performance + Verdict *(new)*

Layer 2 + Layer 4. One doc per Meta ad, across all time windows, with the Qarar verdict embedded (spec §5.5). Verdicts feed the dashboard "recent verdicts" query.

```ts
interface AdPerformanceRecord {
  adId: string;
  adName?: string;
  thumbnailUrl?: string;

  // match
  generationId: string | null;              // null if unmatched
  matchType: 'auto_hash' | 'manual' | null;
  matchDistance?: number;                    // Hamming distance for auto matches
  metadataAvailable: boolean;                // false when a matched generation was later deleted (Edge Case 16)

  // context (three learning dimensions)
  geoTier: 'tier1_gulf' | 'tier2_diaspora' | 'tier3_egypt_na';
  audienceType: 'broad' | 'interest' | 'lookalike' | 'retargeting' | 'advantage_plus';
  campaignObjective: 'conversion' | 'other'; // from Meta objective (fail-safe → other)

  // metrics (per window)
  spend3d: number; spendToday: number; impressions3d: number;
  cpa3d: number | null; ctrLink: number; ctrAll: number;
  conversions3d: number; frequency3d: number; spendSharePct: number; ageDays: number;
  cpm3d?: number; peak1dCtr?: number;

  // verdict (Qarar)
  verdict: '🟢' | '🟡' | '🔴' | '🛟' | '⏳';
  ruleCode: string;                          // "K3", "S1", "CB2", "fatigue", …
  reasonAr: string;                          // Arabic one-liner
  diagnosisAr: string | null;                // Arabic diagnosis-ladder line (for 🔴/🟡)

  evaluatedAt: number;                       // epoch ms — winners ordered by this desc
  schemaVersion: 1;
}
```

**Deleted source generation (Edge Case 16)**: on delete, set `metadataAvailable: false`, revert display to unmatched (`matchType`/`generationId` retained for audit but metadata no longer exposed), and exclude from `pastWinningAds`. The already-applied aggregate contribution is **retained** (not recomputed).

---

## 4. `…/adAccounts/{accountId}/baselines` — Account Baselines *(new, single doc)*

```ts
interface AccountBaselines {
  linkCtr90d: number;      // 90-day متوسط Link CTR (account overall)
  cpm14d: number;          // 14-day متوسط CPM
  cpaCpl30d: number;       // 30-day متوسط CPA/CPL
  cpc30d?: number;         // 30-day متوسط CPC (diagnosis ladder)
  computedAt: number;
}
```

---

## 5. `…/adAccounts/{accountId}/hookPerformance/{angleKey}` — Hook-Angle Aggregate *(new)*

Layer 4b. One doc per **canonical** angle (10 canonical; aliases resolved before write). `byObjective.conversion` is the **only** bucket used for icons / RAG / winners / learning.

```ts
interface HookPerformanceAggregate {
  angleKey: CanonicalHookAngle;              // matches doc id
  sampleSize: number;
  lastUpdated: number;
  byObjective: {
    conversion: { avgLinkCtr: number; count: number; bestVerdictCount: number; worstVerdictCount: number }; // LEARNED
    other:      { avgLinkCtr: number; count: number };                                                      // display-only
  };
  byGeoTier: Record<'tier1' | 'tier2' | 'tier3', { avgCtr: number; count: number }>;      // conversion-only
  byAudienceType: Record<'broad'|'interest'|'lookalike'|'retargeting'|'advantage_plus', { avgCtr: number; count: number }>; // conversion-only
}
```

Also maintained once per account (`_accountOverall` doc): `accountOverallAvgLinkCtr` (conversion-only) + `bestAngles: Array<{ angleKey, avgLinkCtr }>` (top 2–3) — powers the 🔥 selection and the ⚠️ tooltip's "try [best]/[second]".

**Icon gate (spec §8.2)**: an angle needs **≥ 3 conversion-objective matched ads** before any 🔥/✅/⚠️ shows. `⚠️` when the angle's conversion avg Link CTR ≤ 75% of `accountOverallAvgLinkCtr` (≥ 25% below); `🔥` for the single top angle; `✅` otherwise.

---

## 6. `…/adAccounts/{accountId}/visualPerformance/{patternKey}` — Visual-Pattern Aggregate *(new)*

```ts
interface VisualPerformanceAggregate {
  patternKey: string;                        // hash of layoutTemplate + creativeMode + artDirection + universe
  sampleSize: number;
  lastUpdated: number;
  byObjective: {
    conversion: { avgCpm: number; avgLinkCtr: number; count: number; bestVerdictCount: number; worstVerdictCount: number }; // LEARNED
    other:      { count: number };           // display-only
  };
  byGeoTier: Record<string, { avgCpm: number; avgCtr: number; count: number }>;
  byAudienceType: Record<string, { avgCpm: number; avgCtr: number; count: number }>;
}
```

---

## 7. `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` — Fingerprint Index *(new)*

Layer 3. Workspace-scoped queryable index written client-side after the generation doc is created (FR-015).

```ts
interface FingerprintIndexEntry {
  hash: string;                              // doc id (dHash hex)
  hashAlgo: 'dhash64' | 'phash64';
  generationId: string;
  createdAt: number;
}
```

Match at sync time compares the Meta ad's hash against this workspace-scoped index only — **cross-workspace matching is forbidden** (Edge Case 13, FR-023).

---

## 8. `users/{uid}/workspaces/{workspaceId}/private/metaConnection` — Meta Connection *(new, server-only)*

Layer 2. One per workspace (1:1 with its single ad account). **Client access denied by security rules**; only Cloud Functions (Admin SDK) read/decrypt.

```ts
interface MetaConnection {
  metaConnected: boolean;
  accountId?: string;                        // the single connected ad account (1:1)
  accountName?: string;
  encryptedToken?: string;                   // KMS envelope-encrypted long-lived user token
  tokenExpiresAt?: number;                   // for proactive refresh
  needsReauth: boolean;                      // set on refresh failure (FR-009) — data retained
  lastMetaSyncAt?: number;
  nextScheduledSyncAt?: number;
  lastSyncStatus?: 'ok' | 'partial' | 'failed';
  updatedAt: number;
}
```

**Lifecycle (Edge Case 15)**: **disconnect** → delete `encryptedToken`/`tokenExpiresAt`, set `metaConnected:false`, halt syncs, **retain** performance data + aggregates. **Workspace deletion** → cascade purge of settings, snapshots, adPerformance, baselines, hook/visual aggregates, fingerprint index, and this doc.

**1:1 enforcement (FR-026)**: connect is blocked if this workspace already has `accountId`, or if the chosen `accountId` appears on any other workspace's `metaConnection` for the same user.

---

## 9. Extended existing docs *(additive, optional)*

- **`generations/{genId}`** — gains `imageFingerprint?: string` + `imageFingerprintAlgo?` (written client-side after `addDoc`, FR-014) and reuses the existing `workspaceId`. Also gains an optional trace of RAG application:
  ```ts
  resolutionTrace.performanceContext?: {
    injected: boolean;                       // false below the 10-match gate (identical to today)
    sampleSize: number;
    hookInjected: boolean; visualInjected: boolean;
    pastWinningAdCount: number;              // winners fed to Concept Director (0..5)
  }
  ```
- **`creativeMemory/{creativeId}`** — reuse existing schema; winners identified from S1 verdicts + recency. No new required fields.

---

## 10. Indexes (`firestore.indexes.json`)

| Collection (group) | Fields | Purpose |
|---|---|---|
| `adPerformance` (collection) | `evaluatedAt DESC` | recent-verdicts feed (dashboard §F) + winners recency order |
| `adPerformance` (collection) | `campaignObjective ASC`, `verdict ASC`, `evaluatedAt DESC` | S1 winners scoped to conversion objective (`pastWinningAds`) |
| `adPerformance` (collection) | `matchType ASC` (null) | unmatched-ads list (dashboard §E) |
| `settings` (collection group) | `reviewDueAt ASC` | monthly-review sweep (FR-006) |
| `metaConnection` (collection group) | `metaConnected ASC` | dispatcher enumerates connected accounts at 3am |
| `imageFingerprints` (collection) | doc-id read by `hash` | match lookup (no composite needed) |

Most aggregate reads are single-doc by id (angle/pattern/settings/baselines) and need no composite index.

---

## 11. Security rules (sketch)

- `users/{uid}/workspaces/{workspaceId}/adAccounts/**`, `.../imageFingerprints/**`: read/write only when `request.auth.uid == uid` **and** the caller is a member of `{workspaceId}` (reuse Phase 10/12 membership check).
- `users/{uid}/workspaces/{workspaceId}/private/**`: **deny all client access** — server-only (Meta token lives here).
- Derived economics + verdicts are recomputed server-side; client-supplied derived/verdict values are never trusted for gating (Constitution XI — backend enforces).
- No user-facing field stores "ميديان"; averages use "متوسط" (FR-024).
