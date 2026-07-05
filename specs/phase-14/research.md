# Research: Phase 14 — RAG + Meta Reporting Feedback Loop

**Feature**: `phase-14-rag-meta`
**Spec**: `specs/phase-14/spec.md` (7 layers, 8 user stories) · **Verdict source of truth**: `specs/phase-14/qarar-rulebook.md`
**Purpose**: Resolve every technical unknown that gates implementation — the three decisions the clarify pass deferred to planning (queue backend, token-at-rest store, perceptual-hash library) plus Meta retrieval, scheduled-function auth, verdict-engine sourcing, and the reuse map.

Each item below follows: **Decision → Rationale → Alternatives rejected**.

---

## A. Perceptual-hashing library (image matching — PRIMARY mechanism)

**Decision**: Compute a **64-bit dHash with `sharp`** (already a dependency: `^0.33.5`, used by `offerOverlay.ts`, `textCompositing.ts`, `reflowOutpaint.ts`). Store as 16-char hex with `hashAlgo: 'dhash64'`. Compare with Hamming distance.

- **Algorithm**: decode → resize to 9×8 grayscale → compare adjacent pixels per row → 64-bit hash.
- **Match threshold** (implementation-time tunable, default): distance **≤ 10 / 64** counts as the same creative surviving JPEG re-upload/quality loss (FR-013). This is *matching*, not dedup — it must be tolerant enough to survive Meta's re-encode yet tight enough to avoid false links.
- **Ambiguity rule (spec §4.2)**: when >1 generation is below threshold, pick the **smallest** Hamming distance; if the top-two candidates are within a **small margin** (default ≤ 2 apart), leave the ad **unmatched** for manual linking rather than mis-attribute. Exact-tie fallback: prefer the most recent generation.
- **pHash (DCT) is the documented upgrade path** if dHash proves too permissive on gradient-heavy creatives — same `sharp` decode, swap the hash step, store `hashAlgo: 'phash64'` so both can coexist during migration.

**Rationale**: Zero new native dependency (native `pHash`/libpHash bindings risk failing the Cloud Functions container build); guaranteed to run in the existing CF image (FR-012); deterministic; consistent with established Sharp usage.

**Alternatives rejected**: `imghash`/`image-hash` (pull in heavy `jimp` when `sharp` is already present); `blockhash-core` (needs a decoder anyway, less battle-tested); native `phash` bindings (CF-container build risk).

**Open risk**: extreme aspect-ratio crops of the same creative (4:5 vs 9:16) may exceed threshold and count as separate creatives — acceptable for v1 (they are legitimately different placements).

---

## B. Daily-sync architecture & queue backend *(clarify-deferred decision #1)*

**Decision**: A **scheduled dispatcher** `metaDailySync` (`onSchedule('0 3 * * *', { timeZone: 'UTC', region: 'europe-west1' })`) enqueues **one Cloud Tasks task per connected account** onto a **`onTaskDispatched` per-account worker** (`metaSyncAccountWorker`). Queue backend = **Cloud Tasks** (Firebase Functions v2 task queues), not Pub/Sub.

- Worker `retryConfig`: `maxAttempts: 3`, exponential backoff; `rateLimits.maxConcurrentDispatches` = the concurrency cap (default 5) so a large user base cannot exhaust Meta rate limits or CF quota.
- **Failure isolation**: each account is its own task; one account failing/retrying never blocks another (spec §3.1).
- The same worker body backs the on-demand `triggerMetaSync` callable (single account, current workspace, 1-hour cooldown).

**Rationale**: The spec's requirements — "retries, a concurrency cap, and per-account failure isolation" — map **directly** onto Cloud Tasks' native per-task `retryConfig` + `rateLimits.maxConcurrentDispatches`. Firebase's `onTaskDispatched` gives all three declaratively. Fan-out of one long job into N independent bounded-concurrency tasks is exactly the task-queue pattern, and it keeps each invocation well within the CF execution limit.

**Alternatives rejected**: **Pub/Sub** — better for high-throughput streaming fan-out but weaker per-message retry/backoff and concurrency-cap ergonomics; would require hand-rolling the concurrency cap and retry accounting. **Single scheduled function looping all accounts** — breaches the CF timeout at scale and gives no per-account isolation (spec explicitly rejects this).

---

## C. Meta token storage — encrypted at rest *(clarify-deferred decision #2)*

**Decision**: Store the **long-lived Meta user token encrypted with Cloud KMS envelope encryption**, persisted in a **server-only, owner-restricted Firestore doc** at `users/{uid}/workspaces/{workspaceId}/private/metaConnection`. Security rules **deny all client access** to the `private` subcollection; only Cloud Functions (Admin SDK) read/decrypt it.

- OAuth exchange (extends `metaService.ts`) obtains the long-lived user token, envelope-encrypts it via `tokenCrypto.ts` (KMS key in `europe-west1`), and writes ciphertext + `expiresAt`.
- The 3am worker decrypts server-side (no user session present), validates, and **proactively refreshes** when `expiresAt` is within a refresh window (`GET /oauth/access_token?grant_type=fb_exchange_token`). Refresh failure → mark `needsReauth` (FR-009), never delete data.

**Rationale**: The token count scales **per workspace-account** (potentially many per user). Firestore + KMS envelope encryption is the standard Firebase pattern for many rotating per-user secrets, co-locates the token with its connection metadata (clean workspace-deletion cascade, Edge Case 15), and stays inside the existing Firestore security model. Client never sees the token beyond the OAuth exchange (spec Technical Constraints).

**Alternatives rejected**: **Google Secret Manager** — one secret per workspace-account doesn't scale cleanly (per-secret quota/cost), and rotation + the workspace-deletion purge become cross-service bookkeeping. Kept as a fallback if org policy mandates Secret Manager for all credentials. **Plaintext in Firestore** — violates "encrypted at rest" (spec Technical Constraints); rejected outright.

---

## D. Meta performance-data retrieval

**Decision**: Fetch via the Meta Graph API through the (refreshed) stored token, exactly as enumerated in spec §3.1:

1. **Hierarchy**: `campaigns` → `adsets` → `ads` (with `campaign.objective` for classification).
2. **Insights** across three windows: 3-day rolling, today (`date_preset=today`, circuit-breaker only), last-7-days daily (`time_increment=1`). Fields: `impressions,reach,frequency,clicks,inline_link_clicks,ctr,inline_link_click_ctr,spend,cpm,cpc,actions,action_values,cost_per_action_type,date_start,date_stop`.
3. **Baselines** once/sync: 90-day Link CTR, 14-day CPM, 30-day CPA/CPL (+ 30-day CPC).
4. **Large accounts**: async insights (`POST /{id}/insights` → poll `report_run_id`); rate limits → exponential backoff (FR-008).

**Attribution caveat (rulebook §6, March 2026)**: reported conversions dropped 20–40% with no equivalent real drop after the click-only attribution change. **Link CTR (a click metric) is unaffected** and drives hook learning/icons; surface the one-line Arabic banner (Edge Case 11) for periods straddling the change. Do not build kill logic on reported-conversion counts alone beyond the rulebook's spend-based circuit breakers.

**Alternatives considered**: Meta Ads MCP read access — viable but the app already owns the OAuth path in `metaService.ts`; reusing it avoids a second auth surface and keeps the token model (Section C) singular.

---

## E. Image-matching binding across the HTTP boundary

**Decision**: Server computes the perceptual hash **after** the image is uploaded to Storage in `serverGenerateFinalAd` and **returns it in the response payload**; the **client** writes `imageFingerprint` onto the generation doc it creates via `addDoc`, then writes the workspace-scoped index `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` (FR-014/FR-015).

**Rationale**: The generation doc does not exist server-side during the handler (created client-side after return) — the server cannot write to it by `genId` (Technical Constraint). This mirrors the established trace-persistence-across-HTTP-boundary pattern.

**One-time backfill** (`backfillImageFingerprints`): download each existing generation's stored image, compute + write `imageFingerprint` and the index. Idempotent (skips already-fingerprinted); missing-source generations stay unmatched; **only workspace-assigned generations** are processed — unassigned legacy generations are manual-link-only (Edge Case 13).

---

## F. Qarar verdict engine — sourcing & objective gating

**Decision**: Implement `qararEngine.ts` as **pure, side-effect-free functions** transcribing the creative-level rules from `qarar-rulebook.md` in **exact order, first-match-wins** (spec §5.2): data gates → circuit breaker (CB1/CB2) → kill (K3/K4/K5) → fatigue → continue/scale (S1). Output shape = spec §5.5.

**Campaign-objective gating (spec §5.6)**: classify each ad via `campaignObjective.ts` (`OUTCOME_SALES/CONVERSIONS/LEAD_GENERATION/OUTCOME_LEADS → conversion`; everything else incl. unknown → `other`, fail-safe). For `other`, only **K3** and **K4** fire (dead-hook / decay are creative-quality checks that hold regardless); CB1/CB2/K1/K2/K5/K6/K7/fatigue/S1 are disabled, and `other` never becomes a winner and never feeds learning/RAG/`pastWinningAds`.

**Rationale**: Rulebook is the single source of truth (Constitution: behavior contracts beat judgment). Pure functions are unit-testable against fixtures (SC-4, SC-12). Fail-safe unknown→`other` guarantees an unrecognized objective can never pollute conversion learning.

---

## G. Two-component learning aggregation

**Decision**: `learningAggregates.ts` maintains exactly two aggregate families — **hook angle** (judged by Link CTR) and **visual pattern** (judged by CPM + Link CTR) — each keyed and tagged by three context dimensions (**geo tier**, **audience type**, **campaign objective**), with a `byObjective.conversion` bucket that is the *only* bucket feeding icons/RAG/winners and a `byObjective.other` display-only bucket. Same-image-multiple-contexts → separate records, creative judged by its **best** context (spec §6.3). Aliases resolved to canonical before aggregation (`shocking_stat→statistics`, `fear_of_missing_out→urgency`, `future_pacing→future_based`). Copy/caption **not** tracked in v1.

---

## H. RAG injection & Phase 20 wiring

**Decision**: `ragContext.ts` exposes `getRAGContext({ userId, workspaceId, adAccountId, inputs })` → `{ topPerformers, avoid, insights, sampleSize, insufficient }`. Injected at three points, **appended** to the existing `retrieveCreativePatterns()` / `buildPersonalizationContext()` output (never replacing it): hook generation, build-plan/visual, and the Concept Director. Any prompt-string addition routes through the single `buildFinalImagePrompt()` injection point.

- **Activation gate**: ≥ **10 conversion-objective matched** creatives account-wide; below → skipped silently, generation byte-identical to today (FR-025 / SC-10). Conservative language: "Use this to inform — but not rigidly copy…".
- **Phase 20**: `getPastWinningAds` returns the **5 most recently evaluated S1 winners** (order by `evaluatedAt` desc — clarified), excluding any referencing a **deleted** generation (Edge Case 16); passed to the Concept Director's `pastWinningAds` (defaults `[]`). Any fetch failure → `[]`, generation proceeds (fail-open, FR / §10.4).

---

## I. Economic formulas — source of truth (unchanged, rulebook §2.2–2.3)

Four funnel types (spec §2.2): two paid (`paid_event`, `paid_product`) → CPA branch; two free (`free_webinar`, `lead_magnet_call`) → two-anchor CPL branch.

**Paid funnels (`paid_event`, `paid_product`):**
```
rawTargetCPA       = AOV ÷ roasTarget
fullBuyerValue     = AOV + (htoPrice × htoConversionRate/100)   // htoConversionRate entered as percent (3 = 3%)
                                                                // hasHto=false ⇒ htoPrice=htoConversionRate=0 ⇒ fullBuyerValue = AOV
maxCPA             = fullBuyerValue ÷ 2.0                    // Full-Funnel ROAS floor = 2.0 (fixed)
effectiveTargetCPA = min(rawTargetCPA, maxCPA)
capApplied         = rawTargetCPA > maxCPA                   // strictly greater; equality does NOT warn
```
Worked examples: (a) AOV $43, HTO $3,500 @ 3% → fullBuyerValue $148, maxCPA $74. ROAS 0.5 ⇒ raw $86 > $74 ⇒ **cap applied, effective $74**. ROAS 1.0 ⇒ raw $43 ≤ $74 ⇒ no warning. (b) Paid product AOV $47, **no HTO**, ROAS 1.0 → fullBuyerValue $47, maxCPA $23.50, raw $47 ⇒ **cap applied, effective $23.50** + no-HTO advisory card.

**Free funnels — two anchors:**
```
// free_webinar:
leadValue           = offerPrice × (attendanceRate/100) × (buyRateFromAttendees/100)   // rates entered as percent
// lead_magnet_call:
leadValue           = offerPrice × (leadToCloseRate/100)

economicCeilingCPL  = 0.70 × leadValue                       // anchor 1 — ceiling
effectiveTargetCPL  = economicCeilingCPL                     // or 30-day rolling account CPL if lower, once data exists
operationalBaseline = rolling 30-day account CPL             // anchor 2 — daily judgment
                      ↳ fallback: manual market benchmark when no history
```
Worked examples: `lead_magnet_call` offer $3,000 @ 5% → leadValue $150, ceiling $105. `free_webinar` offer $997, 40% attend, 8% buy → leadValue $31.90, ceiling $22.33.

**Business advisory cards (spec §2.6, non-blocking):** `noHto` when a paid funnel has `hasHto=false`; `lowValue` when `aov` (paid) or `offerPrice` (free) < $9. Both may fire together; the target is still calculated. Calculation inputs are **closed enums / numbers** (a bare "2026" must never parse as a price).

---

## J. Reuse map — extend, do not rebuild (spec §12)

| Existing module | Role in Phase 14 |
|---|---|
| `metaService.ts` | OAuth popup, account picker, connection status → extended with 1:1-enforced connect/disconnect + long-lived-token capture |
| `creativeMemory.ts` | per-creative records + angle metadata; join target for matched ads |
| `rankingEngine.ts` | scoring helpers reused where useful; winners for `pastWinningAds` come from S1 verdicts + recency |
| `recommendationTracking.ts` | optional accept/dismiss of surfaced guidance |
| `patternSummaries.ts` | natural-language account pattern text for the dashboard |
| `retrieveCreativePatterns()` / `buildPersonalizationContext()` (`generators.ts`) | existing retrieval; Phase 14 RAG block **appended** after them |
| Concept Director (Phase 20, `conceptDirector.ts`) | consumes `pastWinningAds` |
| Workspace system (Phase 10 / 12) | `workspaceId` on every generation; all Phase 14 data is workspace-scoped |

**Prerequisite gate**: verify Phase 10/12 generations correctly persist `workspaceId` before Phase 14 production (spec §12).
