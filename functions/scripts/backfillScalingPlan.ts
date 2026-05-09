// functions/scripts/backfillScalingPlan.ts
// One-time backfill script: scans users/* for plan === "scaling" and updates to "scale".
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

const db = admin.firestore();

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

// __dirname-based resolution is REQUIRED — do not "simplify" this back to a
// CWD-relative path like `functions/scripts/...`. The script is invoked via
// `npx tsx` from arbitrary CWDs (commonly from inside functions/ itself), and
// a CWD-relative path silently doubles up to `functions/functions/scripts/...`
// when CWD is already functions/, corrupting the audit trail location. Anchor
// to the script's own directory so the path is stable regardless of CWD.
const logFile = path.resolve(__dirname, `backfill-scaling-${timestamp}.log`);

interface LogEntry {
    uid: string;
    before: string;
    after: string;
    applied: boolean;
}

const entries: LogEntry[] = [];

async function backfill(): Promise<void> {
    console.log(`Backfill: scanning users for plan === "scaling"`);
    console.log(`Mode: ${isApply ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);
    console.log(`Audit log target path: ${logFile}`);
    console.log("");

    const snap = await db.collection("users").where("plan", "==", "scaling").get();

    if (snap.empty) {
        console.log("No documents with plan === 'scaling' found.");
        return;
    }

    console.log(`Found ${snap.size} document(s) with plan === "scaling"\n`);

    for (const doc of snap.docs) {
        const uid = doc.id;
        const before = doc.data()?.plan ?? "(undefined)";
        const entry: LogEntry = { uid, before, after: "scale", applied: false };

        if (isApply) {
            await doc.ref.update({ plan: "scale" });
            entry.applied = true;
            console.log(`  ✅ ${uid}: "scaling" → "scale" (written)`);
        } else {
            console.log(`  🔍 ${uid}: "scaling" → "scale" (dry-run, not written)`);
        }

        entries.push(entry);
    }

    if (isApply) {
        const logContent = JSON.stringify({
            timestamp: new Date().toISOString(),
            mode: "apply",
            totalScanned: snap.size,
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
