// functions/scripts/backfillScalingPlan.ts
// One-time backfill script: scans users/* for plan === "scaling" and updates to "scale".
// Dry-run mode by default. Use --apply flag for actual writes.
// Audit log written to functions/scripts/backfill-scaling-{timestamp}.log.
//
// Usage:
//   npx ts-node functions/scripts/backfillScalingPlan.ts             # dry-run
//   npx ts-node functions/scripts/backfillScalingPlan.ts --apply     # actual writes

import * as admin from "firebase-admin";

const isApply = process.argv.includes("--apply");

admin.initializeApp({
    projectId: "proadsai-saas",
    storageBucket: "proadsai-saas.firebasestorage.app",
});

const db = admin.firestore();

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = `functions/scripts/backfill-scaling-${timestamp}.log`;

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

    const logContent = JSON.stringify({
        timestamp: new Date().toISOString(),
        mode: isApply ? "apply" : "dry-run",
        totalScanned: snap.size,
        totalAffected: entries.length,
        entries,
    }, null, 2);

    const fs = await import("fs");
    fs.writeFileSync(logFile, logContent, "utf-8");
    console.log(`\nAudit log written to: ${logFile}`);
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
