// scripts/patch-paid-funnels.mjs
// Phase 11 — One-off patch to add bookingRate / showUpRate / leadToCloseRate
// to every PaidFunnelInputs literal in the test fixtures. Phase 11 added
// these three fields to PaidFunnelInputs (cpaEconomics.ts) because the
// paid_product chain now reads them; this script ensures every existing
// test fixture that constructs a PaidFunnelInputs carries the new
// fields with default values (0). The script is intentionally idempotent:
// it skips any htoConversionRate line that is immediately followed by a
// `bookingRate` line (the chain fields would already be there). Re-run
// safely.
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
    "functions/src/__tests__/cpaEconomics.test.ts",
    "functions/src/__tests__/funnelSettings.contract.test.ts",
];

const CHAIN = "        bookingRate: 0,\n        showUpRate: 0,\n        leadToCloseRate: 0,\n";

for (const f of FILES) {
    const src = readFileSync(f, "utf8");
    // Idempotent: skip lines where the chain fields are already
    // present (the line immediately following `htoConversionRate`
    // starts with whitespace + `bookingRate`).
    let patched = 0;
    let skipped = 0;
    const out = src.replace(
        /^(\s*)htoConversionRate: \d+,?[^\n]*\n/gm,
        (m, indent, offset) => {
            // Look at the line AFTER the match to see if `bookingRate`
            // is already there.
            const nextLineStart = offset + m.length;
            const nextLineEnd = src.indexOf("\n", nextLineStart);
            const nextLine = src.slice(nextLineStart, nextLineEnd === -1 ? undefined : nextLineEnd);
            if (/^\s*bookingRate:/.test(nextLine)) {
                skipped++;
                return m;
            }
            patched++;
            return m + CHAIN;
        },
    );
    if (patched === 0 && skipped === 0) {
        console.log(`No htoConversionRate lines found in ${f}`);
        continue;
    }
    writeFileSync(f, out);
    console.log(`Patched ${patched} htoConversionRate lines in ${f} (skipped ${skipped} already-patched)`);
}