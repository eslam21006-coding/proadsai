# Quickstart — Cumulative Learning for Ad Performance

**Branch**: `969-cumulative-learning`

## Build and test

```bash
cd functions
npm ci            # node_modules is not checked in; ci installs from the lockfile
npm test          # builds, then runs the whole chain
```

Every new test file **MUST** be registered by path in `functions/package.json`
(FR-050) — both as its own `test:*` script and in the `test` chain. A test that
compiles and reviews cleanly but never runs provides no protection, and this project
has shipped that failure twice.

Verify the chain reached its end, not just that it started:

```bash
npm test 2>&1 | tail -5     # must end at the last chained file, not partway
```

## Run a real sync

The learning write is reached by **two** routes, and they are not interchangeable:

| Route | Entry | Leased by Phase 970? |
|---|---|---|
| Manual, inline | `metaSyncPerformance` / `triggerMetaSync` → `runFullSync` | yes (per **owner**) |
| Cloud Tasks fan-out and the 03:00 cycle | `metaSyncAccountWorker` → `runSyncForAccount` | **no** |

Testing only the first route exercises none of the lease requirement (SC-043).

## Verifying the three things most likely to be got wrong

### 1. Lease placement

```bash
# the new lease must be called from inside runSyncForAccount, not the orchestrator
grep -n "acquireLearningLease" functions/src/metaSync/shared.ts     # expect a hit
grep -n "acquireLearningLease" functions/src/metaSync/orchestrator.ts  # expect none

# Phase 970's guard must be untouched
git diff --stat main -- functions/src/metaSync/lease.ts             # expect empty
```

### 2. Commit ordering (FR-060a)

Operational status writes **commit before** the lease attempt. Read the order in
`runSyncForAccount` directly — the natural implementation order is the reverse.

### 3. `matchType` gained no new value (FR-074f)

```bash
# after a sync that performs propagation, distinct stored values must remain
# exactly: "auto_hash", "manual", null
```

This is what SC-045 asserts. A new enum value would silently drop propagated rows out
of the owner-facing "needs linking" list at `whatsWorkingDashboard.ts:719`, which
filters `matchType === null`.

## Inspecting production data

`firebase-admin` is not installed in this repo's `functions/node_modules` by default
and the scripts used during investigation lived outside the repo. Run one-offs from a
scratch directory with:

```bash
GOOGLE_CLOUD_PROJECT=proadsai-saas GOOGLE_CLOUD_QUOTA_PROJECT=proadsai-saas node script.cjs
```

`GOOGLE_CLOUD_QUOTA_PROJECT` is required — the local ADC file carries no quota
project.

Useful baselines, measured 2026-09-04:

| Fact | Value |
|---|---|
| Workspace-scoped ad rows | 1008 across 2 accounts |
| Creatives (grouped by `imageHash`) | 146 — fan-out 6.90:1 |
| `act_995888422231015` | 383 rows → 52 creatives (7.37:1), largest 55 rows, **0 linked** |
| Rows carrying a `generationId` | **5 of 1008** — all `auto_hash`, all `matchDistance: 1` |
| Rows carrying `metaAdId` | **0** — the field is absent, not null |

The `generationId` path is therefore **inert** on the larger account today. Fixtures
must **construct** the linked, merged and propagated cases; they cannot be sampled.

## What NOT to build

All four are locked decisions:

- **No near-hash clustering** — rejected as non-transitive (FR-074b).
- **No epoch partitioning** — aggregates carry all-time evidence (FR-015).
- **No backfill** — sub-version records read as absent (FR-043).
- **No migration** — first write replaces in full (FR-044, FR-045).

And three limitations are **accepted and undetectable by construction**. Do not
attempt to close them: FR-074b's unlinked split, FR-074e's hashless propagated row,
FR-051e's unenforced governed-metric guard.

## After deployment

FR-083 carries a **post-implementation verification**: once per-day figures are being
stored, compare a day's recorded value across successive syncs while it remains
inside the window, and report whether the platform revises conversions downward and
at what magnitude. This quantifies the cost the upward-only rule accepts, which is
currently visible but unmeasured. A material rate is grounds to revisit the decision
deliberately — never to reverse it silently.
