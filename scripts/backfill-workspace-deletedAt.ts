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
// Round-13 (operator bug): written in response to ISSUE-D where the
// workspace onSnapshot query in src/App.tsx added where('deletedAt', '==',
// null) — which immediately broke the team-member path until legacy docs
// were backfilled.
//
// This script is NOT run automatically. Invoke manually with:
//   npx tsx scripts/backfill-workspace-deletedAt.ts
//   # or
//   npx firebase functions:secrets:set-backfill && ts-node scripts/backfill-workspace-deletedAt.ts
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (or Application Default
// Credentials via `gcloud auth application-default login`) for the Firebase
// Admin SDK to pick up project credentials.

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

interface BackfillReport {
  usersScanned: number;
  docsScanned: number;
  docsMissingDeletedAt: number;
  docsUpdated: number;
  writesAttempted: number;
  errors: Array<{ workspacePath: string; message: string }>;
}

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

function isMissing(value: unknown): boolean {
  // Firestore Admin SDK surfaces missing fields as `undefined` in the
  // returned object. We treat both undefined and null consistently here —
  // `null` is already a valid value and must NOT be overwritten (we'd
  // trigger a no-op write + log noise).
  return value === undefined;
}

async function backfill(): Promise<BackfillReport> {
  const report: BackfillReport = {
    usersScanned: 0,
    docsScanned: 0,
    docsMissingDeletedAt: 0,
    docsUpdated: 0,
    writesAttempted: 0,
    errors: [],
  };

  // collectionGroup('workspaces') walks every workspaces subcollection
  // across every user without needing to enumerate top-level users first.
  const wsGroup = db.collectionGroup("workspaces");
  const snap = await wsGroup.get();

  // Batch the updates — Firestore's max commit size is 500.
  const MAX_BATCH = 500;
  let batch = db.batch();
  let pending = 0;

  for (const docSnap of snap.docs) {
    report.docsScanned++;
    const data = docSnap.data();
    if (isMissing(data.deletedAt)) {
      report.docsMissingDeletedAt++;
      batch.update(docSnap.ref, { deletedAt: null });
      pending++;
      report.writesAttempted++;
      if (pending >= MAX_BATCH) {
        await batch.commit();
        report.docsUpdated += pending;
        pending = 0;
        batch = db.batch();
      }
    }
  }

  if (pending > 0) {
    await batch.commit();
    report.docsUpdated += pending;
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
  console.log(`  workspaces scanned:           ${report.docsScanned}`);
  // eslint-disable-next-line no-console
  console.log(`  docs missing deletedAt:       ${report.docsMissingDeletedAt}`);
  // eslint-disable-next-line no-console
  console.log(`  docs updated (deletedAt=null): ${report.docsUpdated}`);
  if (report.errors.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  errors:                       ${report.errors.length}`);
    for (const e of report.errors) {
      // eslint-disable-next-line no-console
      console.log(`    - ${e.workspacePath}: ${e.message}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("  errors:                       0");
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
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("backfill failed:", err);
    process.exit(1);
  });
