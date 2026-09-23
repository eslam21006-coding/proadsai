# Dead Exports / Unreachable Callables / Skipped Tests

Inventory of items in `functions/src/` and `src/` that have no callers (or
only stub/comment callers), captured on `main` at HEAD `1995fcb`.

Method: medium-thoroughness - function headers scanned, importers searched
across the repo, deep imports and barrel re-exports checked. Per the
AGENTS.md rule (Rule 0), the on-disk report is the durable record.

---

## 1. Dead / unused exports - `functions/src/`

### 1a. Top-level files with no importers

| File | Line | Export | Reason dead | Verdict |
|---|---|---|---|---|
| `functions/src/emptyFieldFilter.ts` | 9, 39 | `VALUE_STACK_FIELDS`, `filterEmptyValueStackFields` | The same two symbols are duplicated as a local copy inside `creativeResolver.ts:952-1019` and tested via a third inline copy in `contractFixtures.test.ts`. Nothing imports this file. | **Delete** (or merge into `creativeResolver.ts` if the duplication is the actual intent). |
| `functions/src/failureClassification.test.ts` | n/a (test file, ~7.5 KB) | (misnamed test) | Test header claims "tests for `classifyError` and `buildCostEstimate`" - both live in `generators.ts`, **not** in a `failureClassification.ts` module. The `.test.ts` file is the only thing that mentions the name. | **Rename** the file to `failureClassificationContract.test.ts` (current name is misleading), or **delete** if the same assertions already exist in `contractFixtures.test.ts`. |
| `functions/src/reflowImage.ts` | full file (36 KB), 24 export `reflowImageHandler` | Used by `index.ts:48` to feed the **commented-out** `reflowImage` registration (line 5341, inside `/* ... */`). Also tested by `contractFixtures.test.ts:1979`. | The registration is disabled (Phase 17 supersession, see Section 3 below). The module is intentionally kept "for reversibility". | **Keep with the block-comment gate**, OR **delete** if the reversibility window is closed. See Section 3. |
| `functions/src/reflowOutpaint.ts` | full file (8.5 KB) | Pure sharp-based outpaint; only imported by `reflowImage.ts` (the disabled callable) and `contractFixtures.test.ts`. | Same Phase 17 supersession as `reflowImage.ts`. | **Keep** with the block-comment gate or **delete** if Phase 17 is permanent. |
| `functions/src/reflowRerender.ts` | full file (18.6 KB) | `rerenderFromPlan`, `editRecompose`, `NoPlanError`. Only imported by `reflowImage.ts` and `contractFixtures.test.ts`. | Same Phase 17 supersession. | **Keep** with the block-comment gate or **delete** if Phase 17 is permanent. |
| `functions/src/reflowRouter.ts` | 9, 27 (approx) | `RATIO_TO_NUMERIC`, `decideMethod` | Only imported by the disabled `reflowImage.ts` + `reflowOutpaint.ts` and by `contractFixtures.test.ts`. | **Keep** as long as the HOTFIX-F block is preserved; otherwise **delete**. |
| `functions/src/index.ts` (line 51, 8002) | re-exported: `purgeExpiredWorkspaces` | Re-exported by `index.ts` and by `workspaces/index.ts`, but **no `onCall`/`onSchedule` registration** wires it. A skipped test exists (`__tests__/workspace.test.ts:373`, "T026: purgeExpiredWorkspaces -> hard delete") which suggests the scheduler wrapper was never finished. | **Either revive** (add an `onSchedule` registration + un-skip T026) **or delete** the re-export and the skipped test. |

### 1b. `functions/src/billing/` - modules with no importers outside the folder

| File | Line | Export | Reason dead | Verdict |
|---|---|---|---|---|
| `functions/src/billing/billingLogger.ts` | 3, 16, 28 | `BillingErrorCode`, `BillingLogEntry`, `logBillingStep` | Not imported anywhere in `functions/src/` (no test file imports it). | **Delete** (or wire in: it looks like it was intended to be used by `stripeWebhook`/`ghlBillingSync` but never got connected). |
| `functions/src/billing/billingStateShape.ts` | 6, 8, 16, 18, 38, 48, 50, 63, 65, 74 | `Plan`, `BillingStatus`, `BillingType`, `BillingStateShape`, `STRIPE_WEBHOOK_EVENTS`, `StripeWebhookEvent`, `STRIPE_ERROR_CODES`, `StripeErrorCode`, `StripeEventRecord`, `PendingPlanRecord` | Not imported anywhere. The "live" types live in `billingState.ts` (`BillingStatus`, `UserPlanValue`, `BillingState`). `billingStateShape.ts` looks like an early draft that was superseded by `billingState.ts`. | **Delete** (deduplicate against `billingState.ts`). |

### 1c. `functions/src/stripe/` and `functions/src/paddle/`

| Path | Status | Verdict |
|---|---|---|
| `functions/src/paddle/` | **Directory does not exist.** Zero paddle imports anywhere in `functions/src/` or `src/`. Paddle was fully removed (Phase 13-14). | **Already clean.** |
| `functions/src/stripe/stripeClient.ts` | 2 importers (`billing/ghlBillingSync.ts`, `billing/stripeWebhook.ts`). | **Keep.** |
| `functions/src/stripe/stripeCheckout.ts` | 1 importer (`index.ts:53`). Wraps `createStripeCheckoutSession`, `createStripeTopUpSession` (both used). | **Keep.** |
| `functions/src/stripe/stripePortal.ts` | 1 importer (`index.ts:54`). Wraps `createStripePortalSession` (used). | **Keep.** |

### 1d. `functions/src/learning/` barrel

| File | Line | Symbol | Reason dead | Verdict |
|---|---|---|---|---|
| `functions/src/learning/index.ts` | 11-30 | All `export * from ...` lines | **The barrel is imported by nothing.** All call sites use deep imports (`"../learning/sealedContext.js"` from `metaSync/shared.ts:95` etc.) or `"../../learning/..."` from tests. The `efficiencyFigure.js` line (line 30) is explicitly **commented out** and the file is unused anyway. | **Either revive** as the canonical entry point (per the header's note: "Every module added in a later phase MUST be re-exported here") **or delete**. As written, it is dead. |
| `functions/src/learning/efficiencyFigure.ts` | full file (19 KB) | `computeEfficiencyFigure` + helpers | **The file exists but is not imported.** `learning/index.ts` line 30 has the re-export commented out, and nothing else imports it. The sibling `learning/efficiencyAggregate.ts` is imported and used. | **Delete** the `efficiencyFigure.ts` module and uncomment the re-export line in `learning/index.ts` (then immediately delete that line too if the file is gone), OR **revive** it and re-add the re-export. |

### 1e. `functions/src/savedProjects/`

| File | Line | Status | Verdict |
|---|---|---|---|
| `savedProjects/projectCoverImage.ts` | 1 (only its own header) | - no importers in `functions/src/` or in tests. | **Delete** (or revive if cover-image upload was a planned feature). |
| `savedProjects/thumbnailDelete.ts` | 1 (only its own header) | - no importers. | **Delete.** |
| `savedProjects/getUserProjects.ts` | 9 (exposed via `index.ts:45`) | Used. | **Keep.** |
| `savedProjects/projectQuota.ts`, `projectStatus.ts`, `projectStepsData.ts` | Used (`index.ts:41-42`, `getUserProjects.ts:6`). | **Keep.** |

### 1f. `functions/src/metaConnection.ts`

| File | Line | Export | Reason dead | Verdict |
|---|---|---|---|---|
| `metaConnection.ts` | 349 | `disconnectMetaAccount` (callable) | **No frontend caller** in `src/`. The frontend uses `metaDisconnect` (Phase 967, `index.ts:3715`) instead, which clears the OAuth-callback's `metaConnections/{ownerUid}` doc. The unused `disconnectMetaAccount` operates on the workspace-private connection doc (FR-026 path) - a redundant teardown path that was never wired into the UI. Still tested via `metaConnection.test.ts:230+` and re-exported from `index.ts:80`. | **Delete the callable** (keep `connectMetaAccount`); update `index.ts:80` to re-export only `connectMetaAccount`. |

---

## 2. Unreachable Firebase callable / onRequest / onSchedule functions

Searched every `export const X = onCall|onRequest|onSchedule` in `functions/src/index.ts` (83 hits). Items that are unreachable from `src/` are categorised below.

### 2a. Genuinely unused - no caller anywhere (frontend OR scheduled)

| Callable | Line | Verdict |
|---|---|---|
| `serverGetVerdict` | 4506 | **Delete.** Quick-verdict lookup. No frontend reference. Not invoked by other callables (only `rankingEngine.ts` is used internally and doesn't depend on it). |
| `serverTrackRecommendationEvent` | 4531 | **Delete.** Telemetry tracker. No frontend reference. |
| `serverGetRecommendationEvents` | 4551 | **Delete.** Audit/debug readback. No frontend reference. |
| `generateVariants` | 5734 | **Delete.** A/B variant generation. No frontend reference (only used by `contractFixtures.test.ts` and the dynamic-imported `variantEngine.ts`). |
| `evaluateVariants` | 5771 | **Delete.** A/B winner evaluation. No frontend reference. (The variant engine module itself, `variantEngine.ts`, is also unused outside `contractFixtures.test.ts` - see Section 1a.) |
| `patternSummariesIncremental` | 4402 | **Delete** OR **revive** as an admin tool. Manual/admin hook for `runIncrementalRollup`. Never called from `src/`. The scheduled `scheduledPatternRollup` already covers the production path. |
| `patternSummariesReconcile` | 4420 | **Delete** OR **revive** as an admin tool. Same as above for full reconciliation. The scheduled `scheduledPatternReconcile` covers the production path. |
| `generateCreative` | 199 | **Delete.** Superseded by `serverGenerateFinalAd` (App.tsx/geminiService.ts all call the named `serverGenerateXxx` family). The `COSTS['generateImage']`/`COSTS['polishImage']` action keys at lines 177-179 are also unused; `ACTION_FEATURE_MAP` still has `generateImage: 'visualPolishes'` / `polishImage: 'visualPolishes'`, but those keys no longer reach `generateCreative` (the action map is checked by `deductCreditsServer`). |
| `createTopupCheckout` | 1355 | **Delete.** Deprecated and replaced by `createStripeTopUpSession` (which is live and used by `src/components/billing/TopUpSelector.tsx`). No frontend reference to `createTopupCheckout`. |
| `backfillStripeCustomerIds` | 1275 | **Delete** (one-time backfill; its own header at line 1273 says "After running it once, you can DELETE this function and redeploy"). |
| `createTeamMember` | 2971 | **Delete.** Legacy redirect to `createTeamInvite`. Comment at line 2976 confirms it. No `src/` caller (`src/pages/Team.tsx` uses `createTeamInvite` directly). |
| `restoreWorkspace` (backend callable) | 7114 | **Delete.** No frontend caller in `src/services/workspaceService.ts:74-78` - `workspaceService.restoreWorkspace` is defined but never invoked. The `WorkspaceSettingsModal` does not surface a restore button. |
| `disconnectMetaAccount` | (see `metaConnection.ts:349`, re-exported `index.ts:80`) | **Delete.** See Section 1f. |
| `reflowImage` | (registration is **commented out**, see Section 3) | Already disabled; cleanup tracked in Section 3. |

### 2b. External-trigger callables - no frontend caller BY DESIGN

These are correct and live; they are invoked by external systems, not by the frontend. Listed for completeness.

| Callable | Line | Trigger | Verdict |
|---|---|---|---|
| `ghlpaymentwebhook` | 364 | GHL POST (Route-3 hybrid; fires for GHL's own Stripe charges) | **Keep.** |
| `ghlCancellationWebhook` | 642 | GHL POST (final cancellation) | **Keep.** |
| `ghlPaymentFailedWebhook` | 771 | GHL POST (dunning) | **Keep.** |
| `ghlPaymentRecoveredWebhook` | 877 | GHL POST (retry success) | **Keep.** |
| `stripeWebhook` | 2452 | Stripe POST (Checkout + subscription lifecycle) | **Keep.** |
| `metaOAuthCallback` | 3367 | Meta OAuth redirect (GET) | **Keep.** |
| `metaDataDeletion` | 6514 | Meta user-data-deletion POST (compliance) | **Keep.** |
| `monthlyCreditsReset` | 570 | Scheduled (`0 0 1 * *`) | **Keep.** |
| `scheduledPatternRollup` | 4437 | Scheduled (`0 */6 * * *`) | **Keep.** |
| `scheduledPatternReconcile` | 4448 | Scheduled (`0 3 * * *`) | **Keep.** |
| `metaLegacySync` | 6251 | Scheduled (`0 4 * * *`) | **Keep** - comment at line 6242-6250 says "TEMPORARY: feeds the existing PerformanceDashboard and creativeMemory until Phase 14 Batch 04 replaces them ... REMOVE after Batch 04 ships." Batch 04 did ship (Phase 970), so this is **a candidate to delete now**. The dashboard still reads the user-level `adPerformance` collection though - verify no consumer reads from this path before deleting. |
| `metaRefreshTokens` | 6467 | Scheduled (`0 4 1,15 * *`) | **Keep.** |
| `disconnectMetaAccount` | (above) | (callable, not scheduled) | See Section 1f. |
| `getSubscription` | 1909 | Deprecated Stripe portal lookup. No frontend reference. | **Delete** (superseded by `createStripePortalSession`). |
| `cancelSubscription` | 1952 | Deprecated Stripe cancel-at-period-end. No frontend reference. | **Delete** (Stripe portal handles cancellation now). |
| `reactivateSubscription` | 2033 | Deprecated. Only referenced by an i18n **string key** `billing.reactivateSubscription` (not an actual call). | **Delete** callable; the i18n key is repurposed as a label for the new Stripe portal flow. |
| `applyRetentionDiscount` | 2089 | Used (`App.tsx:3212` - cancellation discount flow). | **Keep.** |
| `getInvoices` | 2151 | Deprecated Stripe invoice list. No frontend reference. | **Delete** (Stripe portal surfaces invoices). |
| `retryInvoice` | 2183 | Deprecated. No frontend reference. | **Delete.** |
| `createSetupIntent` | 2218 | Deprecated. No frontend reference. | **Delete.** |
| `updatePaymentMethod` | 2238 | Deprecated. No frontend reference. | **Delete.** |
| `changePlan` | 2288 | Deprecated. No frontend reference. | **Delete.** |
| `connectMetaAccount` | (re-export `index.ts:80` from `metaConnection.ts:78`) | Frontend uses it once via `src/pages/...` - actually the only caller is `src/services/metaService.ts` etc. - **verified live**. | **Keep.** |
| `getFunnelSettings`, `saveFunnelSettings`, `dismissAdvisory` | 78 (re-exports) | Used (`src/components/FunnelSettingsForm.tsx`). | **Keep.** |
| `triggerMetaSync`, `metaDailySync`, `metaSyncAccountWorker` | 81-83 | `triggerMetaSync` is used (`src/services/metaService.ts:264`). `metaDailySync` and `metaSyncAccountWorker` are scheduled / Cloud-Tasks workers, never called from frontend. | **Keep.** |
| `onGenerationDeleted` | 89 (re-export) | Firestore **document trigger**, not a callable - must be re-exported from `index.ts` for Firebase to deploy it. Not "dead". | **Keep** (reclassification: not in the dead-callable count). |
| `backfillImageFingerprints` | 88 (re-export) | Admin callable, no frontend caller. | **Keep** as an admin tool (can be removed if no operator uses it; not currently dead). |
| `purgeExpiredWorkspaces` (re-export at line 8002) | n/a | No `onCall`/`onSchedule` registration wires it. Skipped test at `__tests__/workspace.test.ts:373`. | **Revive or delete** (see Section 1a). |

---

## 3. Commented-out callable registrations

| Location | Section | Reason | Verdict |
|---|---|---|---|
| `functions/src/index.ts` lines **5332-5350** | `/* export const reflowImage = onCall({...}) */` | "Superseded by Phase 17 independent multi-size generation ... no longer invoked by the frontend (US1, US2, US3 in spec/961-independent-multisize all route through `generateSizeVariant`). The registration is commented out below to keep the function out of the Cloud Functions deploy list while preserving the module body for any future revert. To re-enable, uncomment the block AND restore the frontend callers (App.tsx handleRescale and the multi-size fan-out loops)." | **Keep the block as-is.** The comment + the live `reflowImage.ts` module exist as a revert path. The supporting modules (`reflowOutpaint.ts`, `reflowRerender.ts`, `reflowRouter.ts`, `reflowImage.ts`) are also kept. **If the team decides the revert path is closed**, all five files can be deleted together with the block comment (see Section 1a). |
| `functions/src/learning/index.ts` line **30** | `// export * from "./efficiencyFigure.js"; // FR-002, FR-002a, FR-003, FR-077-FR-080, FR-087` | The `efficiencyFigure.ts` module is referenced in spec but never wired into any caller. | **Either revive `efficiencyFigure.ts`** (and uncomment the line) **or delete the file and the comment** (see Section 1d). |
| `functions/src/modelConfig.ts` lines **22-23** | `// export const CREATIVE_MODEL_PRO: string = "gemini-3.1-pro-preview"; // export const CREATIVE_MODEL_LITE: string = "gemini-3.1-pro-preview";` | Model swap prep. Two candidates are commented out; the actual model names live at lines 24+ (uncommented). | **Delete the comments** if the swap is decided, **or keep** as a recipe. |
| `functions/src/index.ts` lines **5977-5979** | Comment-only note about the removed `designCritique` callable (GPT-4o-mini quality gate, removed 2026-05-30). | No commented-out code; the body was deleted outright. | **Keep the historical note** (matches AGENTS.md historical-precedent rule) - no action needed. |
| Frontend (`src/App.tsx` line 69, line 7106, etc) | Several "ReflowPreview lazy-import removed 2026-05-..." comments. The `ReflowPreview` component itself is still exported (`src/components/ReflowPreview.tsx:44`) but has zero importers (only its own definition). | **Delete `src/components/ReflowPreview.tsx`** - the comment at `App.tsx:69` already says the lazy-import was removed. |
| `functions/src/__tests__/workspace.test.ts` lines **361-373** | `skip("T016: updateWorkspace partial...")` etc. - 13 `skip()` calls. These are a local custom helper (`function skip(name, _fn?)` at line 33) that prints the name but does **not run** the assertion. | The harness is a Phase-967 contract-test pattern; the skipped tests are placeholder names for emulator-only paths that can't run in unit tests. | **Keep.** Not a "skipped jest test" - the local `skip()` prints only. No production impact. |
| `functions/src/metaSync/orchestrator.ts:73` (and others) | All `/* ... */` markers found by the regex are JSDoc comment blocks (`/** ... */`), not block-disabled code. | No action. | - |

---

## 4. Disabled test cases - `describe.skip` / `it.skip` / `xit` / `todo` markers

| File | Status |
|---|---|
| `functions/src/**/*.test.ts` | **No jest/vitest-style `describe.skip` / `it.skip` / `xit` / `test.skip` / `todo()` / `fit` / `fdescribe` markers found.** Confirmed by regex `^\s*(it|test|describe)\.(skip|todo|only)\(|^\s*(xit|xtest|xdescribe|fit|fdescribe)\(` returning zero hits. |
| `functions/src/__tests__/workspace.test.ts:33-37` | Local custom `function skip(name, _fn?)` - prints but does **not run** any assertion (intentional placeholder for emulator-only paths). 13 call sites at lines 361-373. Not a standard test runner marker. |
| `src/__tests__/**/*.test.ts(x)` | **No jest/vitest-style skip markers** - confirmed zero hits. |
| TODO comments (informational, not skipped tests) | `metaConnection.ts:543,557`, `whatsWorkingDashboard.ts:512`, `learning/applyLearningWrites.ts:94,122`. None of them disable a test. |

**Verdict: nothing to action.** The Phase 967 contract-test suite uses a custom `skip()` placeholder that prints the name without running the assertion - that is by design and not a "disabled" jest test. If the rule "no disabled test cases" is interpreted strictly, all 13 placeholder names should be moved out of the contract test runner into a `pendingTests.ts` file; if interpreted loosely (a name printed but no assertion = not a test), the codebase is clean.

---

## 5. Dead / unused exports - `src/` (frontend)

### 5a. `src/components/` - components with no importers

| File | Line | Symbol | Reason dead | Verdict |
|---|---|---|---|---|
| `src/components/ReflowPreview.tsx` | 21, 44 | `ReflowPreview` (default export) | Not imported anywhere in `src/`. The header comment at `App.tsx:69` says "ReflowPreview lazy-import removed 2026-05-...". | **Delete.** |

All other `src/components/*.tsx` exports are used (verified by `\bX\b` counts across `src/`): `BrandColorSwatchPreview` (3), `FavoritesPanel` (14), `FeedbackButtons` (5), `FunnelSettingsForm` (24), `GenerationHistory` (5), `HookAngleIcon` (6), `InputForm` (9), `LinkAdPickerModal` (3), `MagicSelector` (3), `MetaAccountPickerModal` (8), `MetaPagePickerModal` (4), `PerformanceDashboard` (5), `PricingTable` (4), `WhatsWorkingDashboard` (10), `WorkspaceAccessAuditPanel` (3), `WorkspaceSettingsModal` (5), `WorkspaceSwitcher` (12). The `ErrorBoundary` count (370) is the React lifecycle noise inside its own file, not real usage - but `ErrorBoundary` is wrapped around `<App />` in `src/main.tsx` (verified by file presence).

### 5b. `src/utils/` - utilities

All public exports from `src/utils/*.ts` are used inside `src/App.tsx` or `src/__tests__/`. Module-internal helpers `HookValidationResult`, `parseCanonicalHooks`, `SyncOutcomeInput`, `wcagLumin` are exported but only used inside their own module - could be made non-`export` without loss:

| File | Symbol | Usage | Verdict |
|---|---|---|---|
| `src/utils/hookPayload.ts:16` | `interface HookValidationResult` | Defined + used only inside `hookPayload.ts` (return type of `validateCanonicalHooks`). | Optional cleanup - drop the `export` (public API surface, not behaviour). |
| `src/utils/hookPayload.ts:52` | `function parseCanonicalHooks` | Defined + used only inside `hookPayload.ts`. | Optional cleanup. |
| `src/utils/syncResultKey.ts:34` | `interface SyncOutcomeInput` | Defined + used only inside `syncResultKey.ts`. | Optional cleanup. |
| `src/utils/wcagContrast.ts:3` | `function wcagLuminance` | Defined + used only inside `wcagContrast.ts` (helper for `ctaTextColor`). | Optional cleanup. |

All other utility exports (`resolveHtoConversionRateForSave`, `isValidHookPayload`, `getHookValidationSummary`, `parseHookVariation`/`parseHookVariations`, `buildInlineEditedBlock`, `SnapshotShape`, `isEmptySnapshot`, `SyncResultKey`, `computeSyncResultKey`, `getSection`, `getConceptBlock`, `ctaTextColor`) are imported and used from `App.tsx` and/or `src/__tests__/`.

### 5c. `src/hooks/` - hooks

| File | Line | Symbol | Reason dead | Verdict |
|---|---|---|---|---|
| `src/hooks/useBillingState.ts:135` | `function useCanUse(feature)` | Defined + used only inside `useBillingState.ts` (not exported externally - the export is the unused `export function`; the only hit is its own definition line). | **Delete the `export`** (or delete the function entirely if no plans to use it). It returns the same shape as `useBillingState().featureChecks` already. |

All other hooks (`useBillingState`, `useFavorites`, `useGenerationHistory`, `useHookAngleIcons`, `useProjectAutoSave`) are imported by `src/App.tsx` or their respective components.

### 5d. `src/services/workspaceService.ts`

| Line | Symbol | Verdict |
|---|---|---|
| `workspaceService.ts:74` | `restoreWorkspace` | **Delete.** Wrapper around the dead backend `restoreWorkspace` callable. Not invoked anywhere in `src/`. |

All other `workspaceService.*` methods (`createWorkspace`, `updateWorkspace`, `deleteWorkspace`, `linkMetaAccountToWorkspace`, `getWorkspaceAccessAuditLog`, `getUserProjects`) are called from `src/App.tsx` or `src/components/WorkspaceSettingsModal.tsx` or `src/components/MetaAccountPickerModal.tsx` or `src/components/WorkspaceAccessAuditPanel.tsx`.

### 5e. `src/types.ts` - type-only exports

The legacy `ReflowImage*` types (`ReflowMethod`, `ReflowScope`, `ReflowFallbackReason`, `ReflowHistoryEntry`, `ReflowOutcome`, `ReflowImageRequest`, `ReflowImageResponse` - lines 651-708) are exported but unused (the `reflowImage` callable is commented out at `functions/src/index.ts:5341`). The cost entry `CREDIT_COSTS.reflowImage` in `src/planconfig.ts:26` **is** still read in `App.tsx:11107` for the cost label, so the cost constant stays even though the callable is dead.

| Line | Symbol | Verdict |
|---|---|---|
| `src/types.ts:651-708` | `ReflowMethod`, `ReflowScope`, `ReflowFallbackReason`, `ReflowHistoryEntry`, `ReflowOutcome`, `ReflowImageRequest`, `ReflowImageResponse` | **Delete** if the HOTFIX-F revert path is closed (see Section 3). **Keep** otherwise. |
| `src/planconfig.ts:26` | `CREDIT_COSTS.reflowImage = 5` | **Keep** - referenced by `App.tsx:11107` for cost label even though the callable is dead. |

---

## 6. Paddle directory status (sanity check)

- `functions/src/paddle/` - directory does not exist.
- Zero imports of `paddle`, `Paddle`, or `PADDLE` (the SDK / API class names) in `functions/src/` or `src/`.
- Only matches for the word "paddle" in source: `src/universeDatabase.ts` lines 263, 302, 619, 634 - these are `visualMotifs: ['auction paddle', ...]` strings inside the universe database (i.e. an auction paddle, not the Paddle billing provider).
- **Stripe is the live billing provider; Paddle is fully removed.** Per AGENTS.md "Recent Changes" (Phase 13-14), this matches SC-016 (zero Paddle refs).

---

## 7. Summary of recommended deletions (lowest-risk first)

If the goal is purely "delete what's provably dead":

| Symbol | File | Risk |
|---|---|---|
| `src/components/ReflowPreview.tsx` (entire file) | `src/components/ReflowPreview.tsx` | Low (App.tsx comment confirms removal) |
| `workspaceService.restoreWorkspace` | `src/services/workspaceService.ts:74-78` | Low (wrapper for dead backend) |
| `functions/src/emptyFieldFilter.ts` (entire file) | `functions/src/emptyFieldFilter.ts` | Low (duplicated in `creativeResolver.ts`) |
| `functions/src/billing/billingLogger.ts` (entire file) | `functions/src/billing/billingLogger.ts` | Low (zero importers) |
| `functions/src/billing/billingStateShape.ts` (entire file) | `functions/src/billing/billingStateShape.ts` | Low (superseded by `billingState.ts`) |
| `functions/src/savedProjects/projectCoverImage.ts` (entire file) | `functions/src/savedProjects/projectCoverImage.ts` | Low |
| `functions/src/savedProjects/thumbnailDelete.ts` (entire file) | `functions/src/savedProjects/thumbnailDelete.ts` | Low |
| `useCanUse` (drop `export`) | `src/hooks/useBillingState.ts:135` | Cosmetic |
| `HookValidationResult`, `parseCanonicalHooks` (drop `export`) | `src/utils/hookPayload.ts` | Cosmetic |
| `SyncOutcomeInput` (drop `export`) | `src/utils/syncResultKey.ts` | Cosmetic |
| `wcagLuminance` (drop `export`) | `src/utils/wcagContrast.ts` | Cosmetic |
| `createTopupCheckout` callable | `functions/src/index.ts:1355-1431` | Low (replaced by `createStripeTopUpSession`) |
| `backfillStripeCustomerIds` callable | `functions/src/index.ts:1275-1328` | Low (one-time backfill per its own header) |
| `generateCreative` callable | `functions/src/index.ts:199-257` | Medium - also remove the orphaned `COSTS` + `ACTION_FEATURE_MAP` entries for `generateImage`/`polishImage` at lines 177-190 if nothing else uses them. |
| `createTeamMember` callable | `functions/src/index.ts:2971-3066` | Low |
| `restoreWorkspace` callable | `functions/src/index.ts:7114-7161` | Low |
| `disconnectMetaAccount` callable | `functions/src/metaConnection.ts:349` + `index.ts:80` re-export | Low |
| `disconnectMetaAccountImpl` export | `functions/src/metaConnection.ts:363` | Low (used only by the callable and the contract test) |
| `getSubscription`, `cancelSubscription`, `reactivateSubscription`, `getInvoices`, `retryInvoice`, `createSetupIntent`, `updatePaymentMethod`, `changePlan` callables | `functions/src/index.ts:1909-2343` | Medium - these all say "DEPRECATED: preserved for reference only". Stripe portal + top-up sessions supersede them. |
| `serverGetVerdict`, `serverTrackRecommendationEvent`, `serverGetRecommendationEvents`, `generateVariants`, `evaluateVariants`, `patternSummariesIncremental`, `patternSummariesReconcile` callables | `functions/src/index.ts:4402-4477, 4506-4549, 5734-5793` | Low-Medium - recommendation/variant telemetry; only used by `contractFixtures.test.ts` for the dynamic-imported engines. The `variantEngine.ts` module and `learning/efficiencyFigure.ts` would also be removed if these are deleted. |
| `applyRetentionDiscount` callable | `functions/src/index.ts:2089-2148` | Medium - only `App.tsx:3212` uses it; the i18n strings at `src/i18n.tsx:733, 1702` use "billing.reactivateSubscription" as a label, not as a callable reference, so they survive. The retention flow may have been a product decision to retire. |
| `metaLegacySync` scheduled | `functions/src/index.ts:6242-6464` | Medium - header says "REMOVE after Batch 04 ships"; the `adPerformance` user-level collection it writes to is still read by `creativeMemory.ts`/`principleVault.ts` and by tests. Verify downstream readers before deletion. |

If the goal is "revive what's deferred":

- `purgeExpiredWorkspaces` - wire into `onSchedule`, un-skip `workspace.test.ts:373`.
- `patternSummariesIncremental` / `patternSummariesReconcile` - keep as admin tools (call via gcloud / shell).
- `learning/index.ts` barrel + `learning/efficiencyFigure.ts` - finish wiring `efficiencyFigure.ts` and re-add the re-export line.

---

## 8. What the AGENTS.md local-report rule says

This file is the durable record of the investigation (`docs/investigations/dead-exports-unreachable-callables.md`). It must be committed alongside any deletion batch. The chat reply is the ephemeral view; this file is the audit trail. Per Rule 0:

> The chat output is ephemeral; the local file is the durable record of what was done, why, and what risks remain.