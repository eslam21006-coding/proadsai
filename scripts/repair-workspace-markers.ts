// scripts/repair-workspace-markers.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — combined legacy-record repair (R1 Option A + R4 Option A).
//
// Defects fixed by this script:
//   R1 — workspace records written before commit 1f23d5e (2026-05-21) were
//        created client-side WITHOUT a `deletedAt` key. Firestore's
//        `where('deletedAt','==',null)` does not match absent fields, so
//        the new server-side query at src/App.tsx:2685 returns those docs
//        in neither the owner nor the team-member path — which is exactly
//        the "3 of 9 workspaces" defect (FR-025, SC-004).
//   R4 — `createWorkspace` hard-codes `isDefault: false`, and no server
//        path has ever written `isDefault: true`. `resolveDefaultWorkspaceId`
//        therefore throws `not-found` on every account created after
//        2026-05-21 — which is the publish-fallback bug that breaks FR-012
//        for the multi-workspace owner.
//
// Both are executed as ONE repair pass over the same documents. They share
// one Admin-SDK scan because pass 2 (isDefault) needs pass 1's writes to
// have settled for the account it evaluates (data-model.md §5 ordering).
//
// Idempotence (FR-026e):
//   - Pass 1: a doc whose `deletedAt` is `null` (already repaired) is
//     skipped. A doc whose `deletedAt` is a non-null timestamp is
//     skipped (FR-024 — soft-deleted stays soft-deleted).
//   - Pass 2: an account with at least one `isDefault: true` workspace
//     is skipped. A re-encountered account always sees at least itself.
//   Re-running writes nothing once the first run completes.
//
// Repair NEVER writes a Page value (FR-026f). Page adoption stays lazy
// under FR-010.
//
// Records repaired before a revert remain valid afterwards (FR-026g,
// FR-030): the pre-967 client filter `ws.deletedAt == null` accepts an
// explicit null just as it accepted an absent field.
//
// Run with:
//   npx tsx scripts/repair-workspace-markers.ts --dry-run
//   npx tsx scripts/repair-workspace-markers.ts --apply
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (or Application Default
// Credentials via `gcloud auth application-default login`) for the
// Firebase Admin SDK to pick up project credentials. The script also
// honours GOOGLE_CLOUD_QUOTA_PROJECT and NODE_PATH per spec quickstart.md.
// ═══════════════════════════════════════════════════════════════════════════

import { getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

// ─── CLI ─────────────────────────────────────────────────────────────────────

type Mode = "dry-run" | "apply";

function parseMode(argv: string[]): Mode {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  if (flags.has("--dry-run") && flags.has("--apply")) {
    throw new Error("repair: --dry-run and --apply are mutually exclusive.");
  }
  if (flags.has("--apply")) return "apply";
  // Default to --dry-run so an operator who forgets the flag still sees a
  // safe, non-mutating summary (FR-026e / SC-014 evidence flow).
  return "dry-run";
}

// ─── Init ────────────────────────────────────────────────────────────────────

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Page size for the collectionGroup read. 500 sits comfortably below
// Firestore's effective ~1k single-query cap and balances memory vs.
// round-trip cost. The choice does not affect correctness.
const PAGE_SIZE = 500;
// Hard ceiling on page iterations. The expected fleet size is single-
// digit accounts; 100k pages at 500 docs/page is 50M docs, well above
// any realistic workspaces installation. If the loop ever hits this, an
// operator must inspect before re-running.
const PAGE_COUNT_CEILING = 100000;
// Firestore's max commit batch is 500 ops.
const MAX_BATCH = 500;

// Only `users/{uid}/workspaces/{wid}` is a valid workspace path. Any
// other shape is counted as a path-mismatch and not touched.
const EXPECTED_PATH = /^users\/([^/]+)\/workspaces\/([^/]+)$/;

// ─── Per-account state ───────────────────────────────────────────────────────

interface AccountState {
  uid: string;
  workspaces: QueryDocumentSnapshot[];
}

interface Report {
  mode: Mode;
  pagesProcessed: number;
  docsScanned: number;
  skippedPathMismatch: number;
  // Pass 1 — deletedAt repair (FR-026c)
  accountsEvaluatedPass1: number;
  pass1DocsMissingDeletedAt: number;
  pass1DocsUpdated: number;
  pass1WritesAttempted: number;
  pass1Errors: Array<{ workspacePath: string; message: string }>;
  // Pass 2 — isDefault repair (FR-026d)
  accountsEvaluatedPass2: number;
  accountsSkippedPass2AlreadyDefault: number;
  accountsWithNoActiveWorkspace: number;
  pass2DocsMarkedDefault: number;
  pass2WritesAttempted: number;
  pass2Errors: Array<{ workspacePath: string; message: string }>;
}

function emptyReport(mode: Mode): Report {
  return {
    mode,
    pagesProcessed: 0,
    docsScanned: 0,
    skippedPathMismatch: 0,
    accountsEvaluatedPass1: 0,
    pass1DocsMissingDeletedAt: 0,
    pass1DocsUpdated: 0,
    pass1WritesAttempted: 0,
    pass1Errors: [],
    accountsEvaluatedPass2: 0,
    accountsSkippedPass2AlreadyDefault: 0,
    accountsWithNoActiveWorkspace: 0,
    pass2DocsMarkedDefault: 0,
    pass2WritesAttempted: 0,
    pass2Errors: [],
  };
}

// ─── Scan helpers ───────────────────────────────────────────────────────────

function isUsersWorkspacesPath(path: string): boolean {
  return EXPECTED_PATH.test(path);
}

function accountUidFromPath(path: string): string | null {
  const match = EXPECTED_PATH.exec(path);
  return match ? match[1] : null;
}

function isMissing(value: unknown): boolean {
  // Firestore Admin SDK surfaces absent fields as `undefined` in the
  // returned object. We treat undefined as missing and any explicit
  // value (including null) as already-present — a doc with
  // `deletedAt === null` is exactly what pass 1 produces and is
  // therefore not re-touched (FR-026e).
  return value === undefined;
}

// ─── Page collector ─────────────────────────────────────────────────────────
//
// Buffers docs across pages so pass 2 can run on a stable per-account
// snapshot. The buffer is bounded by the page size; a 500-doc page
// holds at most 500 workspace docs in memory, which is fine.

interface Page {
  docs: QueryDocumentSnapshot[];
  skippedMismatch: number;
}

async function scanAllWorkspaces(): Promise<Page[]> {
  const pages: Page[] = [];
  const baseCollection = db.collectionGroup("workspaces");
  let cursor: QueryDocumentSnapshot | null = null;

  while (true) {
    let pageQuery: Query = baseCollection.limit(PAGE_SIZE);
    if (cursor) {
      pageQuery = pageQuery.startAfter(cursor);
    }
    const pageSnap = await pageQuery.get();
    if (pageSnap.empty) break;

    const docs: QueryDocumentSnapshot[] = [];
    let skippedMismatch = 0;
    for (const docSnap of pageSnap.docs) {
      if (!isUsersWorkspacesPath(docSnap.ref.path)) {
        skippedMismatch++;
        continue;
      }
      docs.push(docSnap);
    }
    pages.push({ docs, skippedMismatch });

    if (pageSnap.size < PAGE_SIZE) break;
    if (pages.length >= PAGE_COUNT_CEILING) {
       
      console.warn(
        `repair: hit PAGE_COUNT_CEILING (${PAGE_COUNT_CEILING}); stopping scan. Inspect before re-running.`,
      );
      break;
    }
    cursor = pageSnap.docs[pageSnap.docs.length - 1];
  }

  return pages;
}

// ─── Pass 1 — deletedAt backfill (FR-026c) ──────────────────────────────────

async function applyPass1(
  accounts: Map<string, AccountState>,
  report: Report,
  mode: Mode,
): Promise<Map<string, QueryDocumentSnapshot[]>> {
  // Returns the *post-pass-1* per-account snapshot so pass 2 sees the
  // settled deletedAt values (data-model.md §5 ordering). In dry-run we
  // simulate the same shape without writing.
  const postPass1ByAccount = new Map<string, QueryDocumentSnapshot[]>();

  // Group docs by account, then commit per-account batches so the write
  // surface is one commit per account (bounded by MAX_BATCH just in case
  // a single account ever exceeds the 500-doc cap — not realistic but
  // cheap to defend against).
  for (const [uid, state] of accounts) {
    report.accountsEvaluatedPass1++;
    const updates: Array<{ ref: DocumentReference }> = [];

    for (const docSnap of state.workspaces) {
      const data = docSnap.data();
      // Pass 1 fires ONLY when the key is absent. `deletedAt === null`
      // (already repaired) and `deletedAt === <timestamp>` (soft-deleted)
      // are both left alone (FR-024, FR-026e).
      if (isMissing(data.deletedAt)) {
        updates.push({ ref: docSnap.ref });
      }
    }

    report.pass1DocsMissingDeletedAt += updates.length;

    if (mode === "apply" && updates.length > 0) {
      for (let i = 0; i < updates.length; i += MAX_BATCH) {
        const slice = updates.slice(i, i + MAX_BATCH);
        const batch = db.batch();
        for (const upd of slice) {
          batch.update(upd.ref, { deletedAt: null });
        }
        try {
          await batch.commit();
          report.pass1DocsUpdated += slice.length;
          report.pass1WritesAttempted += slice.length;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          for (const upd of slice) {
            report.pass1Errors.push({ workspacePath: upd.ref.path, message });
          }
          report.pass1WritesAttempted += slice.length;
        }
      }
    } else if (updates.length > 0) {
      // Dry-run still counts the writes that *would* happen — that's the
      // evidence T009/T010 record against the nine-workspace account.
      report.pass1WritesAttempted += updates.length;
    }

    // Build the post-pass-1 snapshot by overlaying the simulated
    // deletedAt: null on every doc that pass 1 would have repaired.
    const simulated: QueryDocumentSnapshot[] = state.workspaces.map((docSnap) => {
      const data = docSnap.data();
      if (isMissing(data.deletedAt)) {
        return {
          ...docSnap,
          // Synthesize a snapshot-like object whose .data() returns the
          // pre-existing fields plus `deletedAt: null`. The downstream
          // pass 2 only reads .id and .data() — both work on this shape.
          data: () => ({ ...data, deletedAt: null }),
        } as unknown as QueryDocumentSnapshot;
      }
      return docSnap;
    });
    postPass1ByAccount.set(uid, simulated);
  }

  return postPass1ByAccount;
}

// ─── Pass 2 — isDefault marker (FR-026d) ────────────────────────────────────

function isAlreadyDefault(snapshot: QueryDocumentSnapshot): boolean {
  return snapshot.data()?.isDefault === true;
}

function isActiveAfterRepair(snapshot: QueryDocumentSnapshot): boolean {
  // Post-pass-1 contract: active means deletedAt == null. Both explicit
  // null and a missing key would qualify, but pass 1 has already
  // promoted every missing key to null — so this reduces to a null
  // equality check. The check is written defensively (==) to accept
  // either shape, so a future pass 1 regression doesn't silently flip
  // the default to a soft-deleted workspace (FR-024).
  const deletedAt = snapshot.data()?.deletedAt;
  return deletedAt == null;
}

async function applyPass2(
  postPass1ByAccount: Map<string, QueryDocumentSnapshot[]>,
  report: Report,
  mode: Mode,
): Promise<void> {
  for (const [, docs] of postPass1ByAccount) {
    report.accountsEvaluatedPass2++;

    if (docs.some(isAlreadyDefault)) {
      report.accountsSkippedPass2AlreadyDefault++;
      continue;
    }

    const active = docs.filter(isActiveAfterRepair);
    if (active.length === 0) {
      // All workspaces soft-deleted (or the account has none). Nothing
      // to mark — the account holds no candidate for the default role.
      report.accountsWithNoActiveWorkspace++;
      continue;
    }

    // "Oldest active workspace by `createdAt` ascending" (FR-026d). When
    // `createdAt` is missing on a legacy doc we fall back to the doc id
    // as a stable, monotonic tiebreaker — Firestore doc ids are not
    // strictly time-ordered but they are deterministic within an
    // account, which is all pass 2 needs to remain idempotent.
    const sorted = [...active].sort((a, b) => {
      const aCreated = a.data()?.createdAt;
      const bCreated = b.data()?.createdAt;
      if (typeof aCreated === "number" && typeof bCreated === "number") {
        return aCreated - bCreated;
      }
      if (typeof aCreated === "number") return -1;
      if (typeof bCreated === "number") return 1;
      return a.id.localeCompare(b.id);
    });

    const oldest = sorted[0];

    if (mode === "apply") {
      try {
        await oldest.ref.update({ isDefault: true });
        // CR-MINOR (CodeRabbit review feedback): only count a doc as
        // marked-default AFTER a successful write. The previous code
        // incremented pass2DocsMarkedDefault before the write, which
        // made a failed write look like progress in dry-run reports.
        report.pass2DocsMarkedDefault++;
        report.pass2WritesAttempted++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        report.pass2Errors.push({
          workspacePath: oldest.ref.path,
            message,
        });
        report.pass2WritesAttempted++;
      }
    } else {
      // Dry-run: count the docs that WOULD be marked. The operator
      // instructions tell them to re-run until pass2DocsMarkedDefault
      // reaches zero; counting would-marks here keeps that loop
      // idempotent.
      report.pass2DocsMarkedDefault++;
      report.pass2WritesAttempted++;
    }
  }
}

// ─── Orchestration ──────────────────────────────────────────────────────────

async function repair(mode: Mode): Promise<Report> {
  const report = emptyReport(mode);

  const pages = await scanAllWorkspaces();
  report.pagesProcessed = pages.length;

  // Materialise the per-account buffer from the scanned pages. We
  // intentionally keep this as a Map<uid, AccountState> so pass 2 sees a
  // complete per-account view (not a per-page view) — a workspace
  // collection that spans two pages would otherwise risk being evaluated
  // for the default marker with only the first page in hand.
  const accounts = new Map<string, AccountState>();
  for (const page of pages) {
    report.docsScanned += page.docs.length;
    report.skippedPathMismatch += page.skippedMismatch;
    for (const docSnap of page.docs) {
      const uid = accountUidFromPath(docSnap.ref.path);
      if (!uid) continue; // already filtered, but be defensive
      let state = accounts.get(uid);
      if (!state) {
        state = { uid, workspaces: [] };
        accounts.set(uid, state);
      }
      state.workspaces.push(docSnap);
    }
  }

  const postPass1 = await applyPass1(accounts, report, mode);
  await applyPass2(postPass1, report, mode);

  return report;
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function logReport(report: Report): void {
  const dry = report.mode === "dry-run";
   
  console.log("");
   
  console.log("=== repair-workspace-markers summary ===");
   
  console.log(`  mode:                           ${report.mode}${dry ? " (no writes performed)" : ""}`);
   
  console.log(`  pages processed:                ${report.pagesProcessed}`);
   
  console.log(`  workspaces scanned:             ${report.docsScanned}`);
   
  console.log(`  skipped (path mismatch):        ${report.skippedPathMismatch}`);
   
  console.log("");
   
  console.log("  -- Pass 1: deletedAt backfill (FR-026c) --");
   
  console.log(`  accounts evaluated:             ${report.accountsEvaluatedPass1}`);
   
  console.log(`  docs missing deletedAt:         ${report.pass1DocsMissingDeletedAt}`);
   
  console.log(`  docs updated (deletedAt=null):  ${report.pass1DocsUpdated}${dry ? " (would update)" : ""}`);
   
  console.log(`  writes attempted:               ${report.pass1WritesAttempted}`);
   
  console.log(`  errors:                         ${report.pass1Errors.length}`);
  for (const e of report.pass1Errors) {
     
    console.log(`    - ${e.workspacePath}: ${e.message}`);
  }
   
  console.log("");
   
  console.log("  -- Pass 2: isDefault marker (FR-026d) --");
   
  console.log(`  accounts evaluated:             ${report.accountsEvaluatedPass2}`);
   
  console.log(`  skipped (already has default):  ${report.accountsSkippedPass2AlreadyDefault}`);
   
  console.log(`  no-active-workspace accounts:   ${report.accountsWithNoActiveWorkspace}`);
   
  console.log(`  docs marked default:            ${report.pass2DocsMarkedDefault}${dry ? " (would mark)" : ""}`);
   
  console.log(`  writes attempted:               ${report.pass2WritesAttempted}`);
   
  console.log(`  errors:                         ${report.pass2Errors.length}`);
  for (const e of report.pass2Errors) {
     
    console.log(`    - ${e.workspacePath}: ${e.message}`);
  }
   
  console.log("");
   
  console.log("Re-run until `docs missing deletedAt` and `docs marked default`");
   
  console.log("are both 0 to confirm the repair is complete. The script is");
   
  console.log("idempotent — already-equal-to-null and already-defaulted");
   
  console.log("records are not touched.");
   
  console.log("");
}

// ─── Entry point ────────────────────────────────────────────────────────────

repair(parseMode(process.argv.slice(2)))
  .then((report) => {
    logReport(report);
    const hasErrors = report.pass1Errors.length > 0 || report.pass2Errors.length > 0;
    process.exit(hasErrors ? 2 : 0);
  })
  .catch((err: unknown) => {
     
    console.error("repair failed:", err);
    process.exit(1);
  });
