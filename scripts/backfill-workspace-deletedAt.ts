// scripts/backfill-workspace-deletedAt.ts
// One-time backfill: for any workspace doc under users/{uid}/workspaces/{wid}
// where the `deletedAt` field is missing (legacy docs created before the
// soft-delete column was added), set `deletedAt: null` explicitly. Firestore's
// `where('deletedAt', '==', null)` does NOT match docs where the field is
// absent — only docs where the field explicitly equals null. The team-member
// workspace read in firestore.rules requires this predicate in the query
// (where('deletedAt', '==', null)); docs missing the field fail the rule
// and the query returns permission-denied for team members.
//
// Round-13 (CodeRabbit re-review): three fixes from the previous round.
// 1. Process documents in bounded pages via a cursor + startAfter so a
//    single full collection-group snapshot is not materialised in memory.
// 2. The path-validation requirement (`path must match users/{uid}/workspaces/{wid}`)
//    is enforced at the per-doc level before counting or queueing writes.
// 3. The firebase-admin dependency is now declared in the root package.json
//    (`firebase-admin: ^13.6.1`, matching functions/) so `npx tsx
//    scripts/backfill-workspace-deletedAt.ts` from the repository root
//    resolves modules without falling back to the functions/ subproject.
//
// Run with:
//   npx tsx scripts/backfill-workspace-deletedAt.ts
//
// Re-run until `docs missing deletedAt` is 0 to confirm the backfill is
// complete (the script is idempotent — already-equal-to-null docs are not
// touched).
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (or Application Default
// Credentials via `gcloud auth application-default login`) for the Firebase
// Admin SDK to pick up project credentials.

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";

interface BackfillReport {
  pagesProcessed: number;
  docsScanned: number;
  docsMissingDeletedAt: number;
  docsUpdated: number;
  writesAttempted: number;
  errors: Array<{ workspacePath: string; message: string }>;
  skippedPathMismatch: number;
}

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Page size for collectionGroup reads. Firestore caps a single
// query at the document limit; 500 is below the 1k cap and balances
// memory vs. round-trip cost. The choice does not affect correctness.
const PAGE_SIZE = 500;
// Firestore's max commit size is 500 ops.
const MAX_BATCH = 500;

function isMissing(value: unknown): boolean {
  // Firestore Admin SDK surfaces missing fields as `undefined` in the
  // returned object. We treat both undefined and null consistently here —
  // `null` is already a valid value and must NOT be overwritten (we'd
  // trigger a no-op write + log noise).
  return value === undefined;
}

// The user's workspaces live at `users/{uid}/workspaces/{wid}`. The
// collectionGroup read of `workspaces` will also surface any future
// top-level `workspaces/{wid}` doc — e.g. an admin tool's orphan workspace
// store. Round-13 (CodeRabbit re-review): validate every snapshot
// reference against the expected path before counting or queueing a
// write. `users/{uid}/workspaces/{wid}` is the only valid shape; any
// other shape is counted as `skippedPathMismatch` and not touched.
const EXPECTED_PATH = /^users\/[^/]+\/workspaces\/[^/]+$/;

function isUsersWorkspacesPath(path: string): boolean {
  return EXPECTED_PATH.test(path);
}

async function processPage(page: QueryDocumentSnapshot[]): Promise<{
  batchUpdates: Array<{ ref: DocumentReference; missing: number }>;
  skippedMismatch: number;
}> {
  const batchUpdates: Array<{ ref: DocumentReference; missing: number }> = [];
  let skippedMismatch = 0;
  for (const docSnap of page) {
    if (!isUsersWorkspacesPath(docSnap.ref.path)) {
      skippedMismatch++;
      continue;
    }
    const data = docSnap.data();
    if (isMissing(data.deletedAt)) {
      batchUpdates.push({ ref: docSnap.ref, missing: 1 });
    }
  }
  return { batchUpdates, skippedMismatch };
}

async function backfill(): Promise<BackfillReport> {
  const report: BackfillReport = {
    pagesProcessed: 0,
    docsScanned: 0,
    docsMissingDeletedAt: 0,
    docsUpdated: 0,
    writesAttempted: 0,
    errors: [],
    skippedPathMismatch: 0,
  };

  // Build a base query (no orderBy — we don't need a stable sort for a
  // backfill and adding one would force a composite index). The cursor
  // is the last document of the previous page; we restart the query
  // with startAfter(cursor) to advance.
  const baseCollection = db.collectionGroup("workspaces");
  let cursor: QueryDocumentSnapshot | null = null;

  // Outer loop: pages of the collection-group read.
  // Inner loop: batches inside the current page (max 500 commits each).
  // The two-level batching is needed because Firestore caps both the
  // page size (effectively ~1k but we use 500) and the commit size
  // (500 ops) independently.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let pageQuery: Query = baseCollection.limit(PAGE_SIZE);
    if (cursor) {
      pageQuery = pageQuery.startAfter(cursor);
    }
    const pageSnap = await pageQuery.get();
    report.pagesProcessed++;
    if (pageSnap.empty) {
      break;
    }
    const { batchUpdates, skippedMismatch } = await processPage(pageSnap.docs);
    report.docsScanned += pageSnap.size;
    report.skippedPathMismatch += skippedMismatch;
    report.docsMissingDeletedAt += batchUpdates.length;

    for (let i = 0; i < batchUpdates.length; i += MAX_BATCH) {
      const slice = batchUpdates.slice(i, i + MAX_BATCH);
      const batch = db.batch();
      for (const upd of slice) {
        batch.update(upd.ref, { deletedAt: null });
      }
      try {
        await batch.commit();
        report.docsUpdated += slice.length;
        report.writesAttempted += slice.length;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        for (const upd of slice) {
          report.errors.push({ workspacePath: upd.ref.path, message });
        }
        report.writesAttempted += slice.length;
      }
    }

    // Round-13: explicitly cap the page count to avoid an infinite loop
    // in the (shouldn't-happen) case where startAfter the last doc of
    // a non-empty page still returns the same doc.
    if (pageSnap.size < PAGE_SIZE) {
      break;
    }
    cursor = pageSnap.docs[pageSnap.docs.length - 1];
  }

  return report;
}

function logReport(report: BackfillReport): void {
  // Plain console output so the operator running this manually has a
  // single summary to paste into the channel / commit message.
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("=== backfill-workspace-deletedAt summary ===");
  // eslint-disable-next-line no-console
  console.log(`  pages processed:                ${report.pagesProcessed}`);
  // eslint-disable-next-line no-console
  console.log(`  workspaces scanned:             ${report.docsScanned}`);
  // eslint-disable-next-line no-console
  console.log(`  docs missing deletedAt:         ${report.docsMissingDeletedAt}`);
  // eslint-disable-next-line no-console
  console.log(`  docs updated (deletedAt=null):  ${report.docsUpdated}`);
  // eslint-disable-next-line no-console
  console.log(`  writes attempted:               ${report.writesAttempted}`);
  // eslint-disable-next-line no-console
  console.log(`  skipped (path mismatch):        ${report.skippedPathMismatch}`);
  if (report.errors.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  errors:                         ${report.errors.length}`);
    for (const e of report.errors) {
      // eslint-disable-next-line no-console
      console.log(`    - ${e.workspacePath}: ${e.message}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("  errors:                         0");
  }
  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("Re-run until `docs missing deletedAt` is 0 to confirm the");
  // eslint-disable-next-line no-console
  console.log("backfill is complete (the script is idempotent — already-equal-to-null");
  // eslint-disable-next-line no-console
  console.log("docs are not touched).");
  // eslint-disable-next-line no-console
  console.log("");
}

backfill()
  .then((report) => {
    logReport(report);
    process.exit(0);
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("backfill failed:", err);
    process.exit(1);
  });
