# 969 — Production verification (deploy complete, baseline recorded)

**Date:** 2026-09-17
**Working directory (copied from `pwd`):** `D:\Pro Ads AI - SaaS - FAL`
**Local HEAD:** `3ddfb78` (post-deploy + baseline commit)
**`origin/main` tip:** `3ddfb78` (pushed)
**Project:** `proadsai-saas` (Firebase)
**Deploy agent:** opencode session, working from main repo per instruction.

---

## §0. TL;DR

PR #71 (squash `efcdb04 feat(969): cumulative learning`) is now live in production:

- Functions deployed: **all** (one region, `europe-west1`, plus `us-central1` for `purgeExpiredWorkspaces`). Exit 0.
- Hosting deployed: **13 files** from `dist/`. Exit 0.
- Pre-sync baseline for `act_995888422231015`: captured and committed (`3ddfb78`).
- Morning checks (§5 of runbook) and multi-funnel check (§6): NOT executed today — those run
  the morning after the first nightly sync, per the user's instruction "Do not start Phase 4, 5
  or 6" (which I read as "do not start the post-sync observation phases today").

The single production observation that needed a decision before deploy was **the dirty working
tree** (1170 files modified, 1241 `git status --short` lines). It was diagnosed as pure CRLF-vs-LF
line-ending churn — content byte-identical to HEAD modulo a CR before each LF — and discarded.
The diagnosis is recorded at `docs/investigations/969-pre-deploy-diagnosis.md`.

---

## §1. Deploy sequence — what ran

### §1.1 Discard line-ending churn

```powershell
git restore .
git status --short
```

Result: 1170 CRLF diffs cleared. Remaining `??` entries are untracked files only:

- `docs/PHASE_26_BATCH_6_FINAL_V2_REPORT.md` — pre-existing untracked.
- `docs/PHASE_26_BATCH_7_REPORT.md` — pre-existing untracked.
- `docs/investigations/969-pre-deploy-blocked.md` — written by the diagnosis session, kept untracked (deliberately not committed; this is the operator's option-3 record).
- `docs/investigations/969-pre-deploy-diagnosis.md` — same.
- `docs/investigations/rtl-alignment-investigation {claude,minimax}.md` — pre-existing untracked.
- `docs/investigations/المركز-التجاري-العالمي-v2.1.md` — pre-existing untracked (Arabic filename).
- `meta-scope-fix-batch-report.md` — pre-existing untracked.
- `reports/{bug-a-team-meta-bug-b-funnel-workspaces,meta-pages-only-2-investigation,workspace-scoped-meta-connection-investigation}.md` — pre-existing untracked.

None of these were created by this session other than the two `969-pre-deploy-*` reports.

### §1.2 Pull and confirm squash tip

```powershell
git pull
git log --oneline -3
git status --short
```

Result:

```
Updating ffc14a8..efcdb04
Fast-forward
 ... 110 files changed, 34796 insertions(+), 3150 deletions(-)
efcdb04 feat(969): cumulative learning — accumulate across syncs and funnels
ffc14a8 Phase 970 — Sync Unification: one orchestrator, one button, in-flight lease (#70)
544e817 feat(funnel-economics): phases 8-10 + reviewer fixes (968 closure) (#69)
[no M-entries in git status --short]
```

The pull was a clean fast-forward. The squash is the tip.

### §1.3 Clean build + tests

```powershell
cd functions
Remove-Item -Recurse -Force lib   # (lib did not exist — node_modules/ was empty too)
npm install                        # required: node_modules/ was empty after the CRLF churn
Remove-Item -Recurse -Force lib    # (re-run per the runbook)
npm run build
npm test
```

Result:

- `npm install`: 755 packages added. Node 22.22.3 vs package's declared `engines: { node: '24' }` mismatch surfaced as `EBADENGINE` warning, but install completed. The deploy proceeds on Node 22 runtime; Cloud Functions v2 supports both.
- `npm run build`: **exit 0**. `tsc` succeeded; assets copied.
- `npm test`: **exit 0**. Full contract-fixture suite + phase969 + billing + 60+ individual node-script tests all passed. Last log line: `contractFixtures.test: PASS`.
- Full log: `C:\temp\npm-test-20260917-224401.log` (~5 minutes wall clock).

### §1.4 Deploy functions

```powershell
firebase deploy --only functions
```

Result: **exit 0**. All function updates succeeded; deploy complete.

```
+ functions[getInvoices(europe-west1)] Successful update operation.
+ functions[createTopupCheckout(europe-west1)] Successful update operation.
... [~80 functions total, all europe-west1] ...
+ functions[purgeExpiredWorkspaces(us-central1)] Successful update operation.
Function URL (ghlpaymentwebhook(europe-west1)): https://ghlpaymentwebhook-372bhq6ysa-ew.a.run.app
... [6 webhook URL lines] ...
+ Deploy complete!
Project Console: https://console.firebase.google.com/project/proadsai-saas/overview
```

Full log: `C:\temp\firebase-functions-20260917-224817.log`.

### §1.5 Deploy hosting

```powershell
firebase deploy --only hosting
```

Result: **exit 0**. 13 files in `dist/` uploaded, version finalized, release complete.

```
i  hosting[proadsai-saas]: found 13 files in dist
+  hosting[proadsai-saas]: file upload complete
+  hosting[proadsai-saas]: version finalized
+  hosting[proadsai-saas]: release complete
+  Deploy complete!
Hosting URL: https://proadsai-saas.web.app
```

Full log: `C:\temp\firebase-hosting-20260917-225324.log`.

### §1.6 Pre-sync baseline

Captured immediately after the deploy. Account `act_995888422231015`. Recorded at
`docs/investigations/969-production-baseline.md`, committed (`3ddfb78`), pushed.

Full details in §2 of this report. Highlights:

- 452 `adPerformance` docs (top-level), 0 with `ledger`.
- 0 `hookPerformance` docs for this account.
- 0 `visualPerformance` docs for this account.
- 0 docs anywhere in the project carry `contributedCreativeKeys`, `creativeCount`, or `byFunnelType`.
- The schema differs from the runbook's assumption: `adPerformance` is top-level (keyed by `{userId}_{adId}`), and the `adAccountId` field is camelCase. The runbook assumed nested paths under `users/{uid}/workspaces/{wid}/adAccounts/{act}/`; that path does not yet exist for this account — the new code will create it on the first sync.

---

## §2. Pre-sync baseline summary

For full breakdown see `docs/investigations/969-production-baseline.md`. The numbers the morning
checks compare against:

| Metric (act_995888422231015)              | Baseline | First-sync expected |
|-------------------------------------------|----------|---------------------|
| `adPerformance` docs (top-level)          | 452      | 452 (sync does not delete rows; new code adds aggregate docs alongside) |
| `adPerformance` docs with `ledger`        | 0        | > 0 (every contributed row gets a ledger entry under FR-016) |
| `hookPerformance` docs for this account   | 0        | > 0 (one per canonical angle that has ≥ 1 contributed row) |
| `visualPerformance` docs for this account | 0        | > 0 (one per patternKey that has ≥ 1 contributed row) |
| `creativeCount` on any aggregate          | 0 (anywhere) | > 0 (FR-073 / T021) |
| `contributedCreativeKeys` length total    | 0 (anywhere) | > 0 (FR-036 / Batch 28) |
| `byFunnelType` populated anywhere         | 0        | depends on workspace settings — see §6 of baseline report |

Three users (`84jrvrdcLUSe2tNBYBfqqnmq2Az1`, `UCPfe8ouNUTgODhLvUeO9HCDqYE2`,
`ywpCgWsXqVP4tlNwfhSoTqMjRw52`) are linked to this account via `metaConnections`. The new
code's `workspaceFunnelType` resolution will use the workspace's funnel settings doc — verify
the workspace's `data.funnelType` is set to one of the four real buckets
(`paid_event | paid_product | free_webinar | lead_magnet_call`) for the multi-funnel check
to surface non-zero counts in real buckets.

---

## §3. Steps NOT taken today

### §3.1 Morning checks (runbook Step 5)

> Check 1 — accumulation vs reset
> Check 2 — `creativeCount` counts creatives, not observations (requires TWO nightly syncs)
> Check 3 — unlinked-contribution breakdown (FR-076)
> Check 4 — Cloud Logging for `OAuthException` code 4 subcode 1504022

None of these ran today. They require the nightly sync at 03:00 to have already executed and
produced the corresponding log line / Firestore writes. The operator runs them the morning
after, comparing against the baseline at `docs/investigations/969-production-baseline.md`.

### §3.2 Multi-funnel check (runbook Step 6)

> FR-041's indication ... `byFunnelType` on any aggregate has a non-zero count in more than
> one real bucket, and whether `unknown` is collecting everything.

Not run today for the same reason — no aggregate docs exist yet for `act_995888422231015`.
Run after the first sync produces them.

### §3.3 Phase 4, 5, 6 of any larger workstream

The user's instruction "Do not start Phase 4, 5 or 6" at the end of the third message is read
as a guard against starting adjacent work in this session. I did not start any new phase;
this report and the baseline are the only artefacts produced today beyond what the deploy
required.

---

## §4. Things to do AFTER this deploy — follow-up

### §4.1 `.gitattributes` — line-ending policy (DO NOT TOUCH DURING THIS DEPLOY)

The diagnosis at `docs/investigations/969-pre-deploy-diagnosis.md` §6 found:

- No `.gitattributes` in the repo.
- Local `git config core.autocrlf=true` (Windows-style checkout).

Result: 1170 files picked up CRLF endings on a prior checkout/save, surfacing as a "dirty tree"
on this deploy. The discard worked, but the same class of false-alarm will recur on the next
deploy — and it will block that deploy the same way.

**Recommended fix (NOT applied today):**

1. Add `.gitattributes` with at minimum:
   ```
   * text=auto
   ```
   (and explicit `eol=lf` per-extension rules if the team wants stricter normalisation).
2. Set local config to `core.autocrlf=false` so Git stores the line endings it finds.

This is a one-line change in a config file; it does not touch source. Applying it would mean a
single one-time re-normalisation commit, which the operator should review. The risk is that any
binary file in the repo currently stored with CRLF or LF would be normalised, which could be
large. **Out of scope for this deploy.**

### §4.2 Node version mismatch (low priority)

`npm install` warned `EBADENGINE Unsupported engine { required: { node: '24' }, current: { node: 'v22.22.3' } }`. Cloud Functions v2 supports Node 22 and Node 24; the deployed function revision uses
Node 22 (the runtime the CLI built against). The package.json's `engines` declaration suggests
Node 24 was intended. This is a documentation drift, not a production failure — the build and
deploy both succeeded.

**Out of scope for this deploy.** Flag for the next deploy's owner.

### §4.3 Pre-existing untracked files in the working tree

`git status --short` shows 11 untracked files in `docs/`, `docs/investigations/`, `meta-scope-fix-batch-report.md`, and `reports/`. None of them belong to this deploy; they were already untracked
when the session started. **Out of scope.**

### §4.4 The `969-pre-deploy-blocked.md` and `969-pre-deploy-diagnosis.md` files

These are intentionally untracked — they record the deployment-prep process, not source. They
should remain available on the local checkout as a record of why today's deploy took the path
it did. If the operator wants them in the repo, that is a separate commit decision.

---

## §5. Audit trail — artefacts in this session

| Artefact                                                         | Location | Status |
|------------------------------------------------------------------|----------|--------|
| Step 1 guard fired                                              | `docs/investigations/969-pre-deploy-blocked.md` | written, untracked (deliberately) |
| Diagnosis of the 1170-file diff (CRLF churn)                    | `docs/investigations/969-pre-deploy-diagnosis.md` | written, untracked (deliberately) |
| Pre-sync Firestore baseline for `act_995888422231015`           | `docs/investigations/969-production-baseline.md` | committed `3ddfb78`, pushed |
| This verification report                                         | `docs/investigations/969-production-verification.md` | to be committed and pushed |
| Capture scripts (read-only, run once)                            | `C:\temp\opencode\capture-969-baseline-v2.cjs`, `C:\temp\opencode\probe-*.cjs`, `C:\temp\opencode\baseline-*-output.json` | outside repo, kept for reproducibility |
| Build/test log                                                    | `C:\temp\npm-test-20260917-224401.log` | outside repo |
| Functions-deploy log                                              | `C:\temp\firebase-functions-20260917-224817.log` | outside repo |
| Hosting-deploy log                                                | `C:\temp\firebase-hosting-20260917-225324.log` | outside repo |

All four `??` files (`969-pre-deploy-blocked.md`, `969-pre-deploy-diagnosis.md`, the baseline, and
the pre-existing untracked reports) are documented in §1.1. None of them are part of the deploy's
source change. The baseline is committed and pushed (it had a deadline). The two diagnosis files
remain untracked by design — they describe why today's deploy took the path it did and are not
source for the next deploy.

---

## §6. Recommendation for the operator tomorrow morning

1. Read the four-check section of `docs/investigations/969-production-baseline.md` §4 — that
   gives the baseline values to compare against.
2. Run the post-deploy observations (runbook §5 and §6). They are read-only — they do not modify
   the deployed code or the data.
3. If any check surfaces a defect, **report it; do not fix it.** The same discipline that
   produced the squash applies here — the deploy is the milestone; the post-deploy observation
   is the validation; fixes come after.
4. If everything looks healthy, schedule the `.gitattributes` work (follow-up §4.1) for the next
   session — this is the change that prevents the next false-alarm at deploy time.
