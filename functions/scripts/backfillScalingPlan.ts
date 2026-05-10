// functions/scripts/backfillScalingPlan.ts
// One-time backfill script: scans users/* for plan === "scaling" (or the
// nested billingState.plan === "scaling") and rewrites both fields to "scale".
//
// IMPORTANT — TWO-FIELD NATURE OF `plan`:
// A user document carries the plan value in TWO places that must agree:
//   1. Top-level   users/{uid}.plan
//   2. Nested      users/{uid}.billingState.plan  (derived sub-object written
//                                                  by writeBillingState())
// Either field can be stale independently. The first version of this script
// only touched the top-level field, which left some docs in a half-migrated
// state (top-level "scale", nested still "scaling"). This version detects and
// rewrites BOTH. Future maintainers: if you add another plan-bearing field,
// extend the detection queries and the per-doc update map below — do not
// "simplify" away the dual-query, dual-update pattern.
//
// Dry-run mode by default. Use --apply flag for actual writes.
// Audit log written to functions/scripts/backfill-scaling-{timestamp}.log
// only when --apply is passed; dry-run prints the would-be path without writing.
//
// Usage:
//   npx tsx scripts/backfillScalingPlan.ts             # dry-run (no writes, no log)
//   npx tsx scripts/backfillScalingPlan.ts --apply     # actual writes + audit log

import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";

const isApply = process.argv.includes("--apply");

admin.initializeApp({
    projectId: "proadsai-saas",
    storageBucket: "proadsai-saas.firebasestorage.app",
});

// Print the resolved project ID up front so the operator can sanity-check
// they are pointed at the right project (dev vs live) before any data
// mutation. Kept permanently — this is the last line of defense against
// running --apply against the wrong Firebase project, especially during
// Phase 15 (live cutover) when the same script runs against production.
console.log(`Connecting to Firebase project: ${admin.app().options.projectId}`);

const db = admin.firestore();

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

// __dirname-based resolution is REQUIRED — do not "simplify" this back to a
// CWD-relative path like `functions/scripts/...`. The script is invoked via
// `npx tsx` from arbitrary CWDs (commonly from inside functions/ itself), and
// a CWD-relative path silently doubles up to `functions/functions/scripts/...`
// when CWD is already functions/, corrupting the audit trail location. Anchor
// to the script's own directory so the path is stable regardless of CWD.
const logFile = path.resolve(__dirname, `backfill-scaling-${timestamp}.log`);

interface FieldSnapshot {
    plan: string;
    "billingState.plan": string;
}

interface LogEntry {
    uid: string;
    before: FieldSnapshot;
    after: FieldSnapshot;
    applied: boolean;
}

const entries: LogEntry[] = [];

async function backfill(): Promise<void> {
    console.log(`Backfill: scanning users for plan === "scaling" OR billingState.plan === "scaling"`);
    console.log(`Mode: ${isApply ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
    console.log(`Audit log target path: ${logFile}`);
    console.log("");

    // Two queries because Firestore can't OR across different fields cheaply
    // without composite indexes. Run both, dedupe by uid.
    const [topSnap, nestedSnap] = await Promise.all([
        db.collection("users").where("plan", "==", "scaling").get(),
        db.collection("users").where("billingState.plan", "==", "scaling").get(),
    ]);

    const docsByUid = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of topSnap.docs) docsByUid.set(doc.id, doc);
    for (const doc of nestedSnap.docs) docsByUid.set(doc.id, doc);

    if (docsByUid.size === 0) {
        console.log("No documents with plan === 'scaling' (top-level or nested) found.");
        return;
    }

    console.log(`Found ${docsByUid.size} document(s) needing migration (top: ${topSnap.size}, nested: ${nestedSnap.size}, deduped union: ${docsByUid.size})\n`);

    for (const [uid, doc] of docsByUid) {
        const data = doc.data() ?? {};
        const topBefore: string = data.plan ?? "(undefined)";
        const nestedBefore: string = data.billingState?.plan ?? "(undefined)";

        // Build idempotent update map — only fields that are actually "scaling"
        // get rewritten. Fields already "scale" or other values are left alone.
        const updates: Record<string, string> = {};
        if (topBefore === "scaling") updates["plan"] = "scale";
        if (nestedBefore === "scaling") updates["billingState.plan"] = "scale";

        const topAfter: string = updates["plan"] ?? topBefore;
        const nestedAfter: string = updates["billingState.plan"] ?? nestedBefore;

        const fieldsToWrite = Object.keys(updates);
        const entry: LogEntry = {
            uid,
            before: { plan: topBefore, "billingState.plan": nestedBefore },
            after: { plan: topAfter, "billingState.plan": nestedAfter },
            applied: false,
        };

        if (isApply) {
            // Single transaction per doc so both field updates are atomic.
            // Re-read inside the tx to guard against concurrent writes
            // (e.g., a webhook landing while the migration is mid-flight).
            await db.runTransaction(async (tx) => {
                const fresh = await tx.get(doc.ref);
                const freshData = fresh.data() ?? {};
                const freshUpdates: Record<string, string> = {};
                if (freshData.plan === "scaling") freshUpdates["plan"] = "scale";
                if (freshData.billingState?.plan === "scaling") freshUpdates["billingState.plan"] = "scale";
                if (Object.keys(freshUpdates).length > 0) {
                    tx.update(doc.ref, freshUpdates);
                }
            });
            entry.applied = true;
            const fields = fieldsToWrite.length > 0 ? fieldsToWrite.join(", ") : "(none — already migrated by concurrent writer)";
            console.log(`  ✅ ${uid}: updated [${fields}] → "scale" (written)`);
        } else {
            const fields = fieldsToWrite.length > 0 ? fieldsToWrite.join(", ") : "(none — already migrated)";
            console.log(`  🔍 ${uid}: would update [${fields}] (dry-run, not written)`);
        }

        entries.push(entry);
    }

    if (isApply) {
        const logContent = JSON.stringify({
            timestamp: new Date().toISOString(),
            mode: "apply",
            totalScanned: docsByUid.size,
            totalAffected: entries.length,
            entries,
        }, null, 2);

        fs.writeFileSync(logFile, logContent, "utf-8");
        console.log(`\nAudit log written to: ${logFile}`);
    } else {
        console.log(`\nDry-run: no audit log written. Would have written to: ${logFile}`);
    }
}

backfill()
    .then(() => {
        console.log("\nDone.");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Backfill failed:", err);
        process.exit(1);
    });
