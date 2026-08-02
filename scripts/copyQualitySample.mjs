#!/usr/bin/env node
// scripts/copyQualitySample.mjs
// Paired-run capture harness for Phase 22 sign-off (T075).
//
// Runs a fixed input set twice against a deployed Cloud Functions backend:
// once with COPY_SCORING_ENABLED=true (gate-on), once with =false (gate-off).
// Persists the on-creative strings, language, field name, wall-clock duration,
// credit cost, and the copyScoring trace for each run to a single JSON
// artifact under specs/966-copy-scoring-gate/validation/.
//
// Per research R10 + Constitution Principle IX, this script makes LIVE
// model calls. Run against a non-production project with a funded key, not
// in CI. The companion `copyQualityJudge.mjs` judges the captured sample
// using Gemini + a different prompt (SC-002a forbids the gate's own
// scorer from certifying the gate's output).
//
// Inputs are the FIXED reproduction set. The harness NEVER generates a new
// sample per run — reproducibility is the entire point (Principle IX).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve repo root by walking up from this script
const REPO_ROOT = join(__dirname, "..", "..");
const SPEC_DIR = join(REPO_ROOT, "specs", "966-copy-scoring-gate");
const VALIDATION_DIR = join(SPEC_DIR, "validation");
const INPUTS_PATH = join(VALIDATION_DIR, "sample-inputs.json");

// ─── CLI args ───────────────────────────────────────────────────────

function parseArgs(argv) {
    const out = {
        backend: "https://us-central1-pro-ads-pro.cloudfunctions.net", // prod default
        region: "europe-west1",
        outputs: VALIDATION_DIR,
        sampleSize: 50,
        dryRun: false,
        seed: "phase22-v1",
    };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--backend") out.backend = argv[++i];
        else if (arg === "--region") out.region = argv[++i];
        else if (arg === "--outputs") out.outputs = argv[++i];
        else if (arg === "--sample-size") out.sampleSize = parseInt(argv[++i], 10);
        else if (arg === "--dry-run") out.dryRun = true;
        else if (arg === "--seed") out.seed = argv[++i];
    }
    return out;
}

// ─── Auth ──────────────────────────────────────────────────────────

// Prefer Application Default Credentials (already configured in CI /
// local emulators). For a fresh checkout, set GOOGLE_APPLICATION_CREDENTIALS
// or `firebase login` first.

async function getIdToken(targetAudience) {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(targetAudience);
    return client.getRequestHeaders();
}

// ─── Single-run capture ───────────────────────────────────────────

async function captureOneRun({ baseUrl, callableName, payload, gateEnabled, sampleIndex, language, offerType, dryRun }) {
    const url = `${baseUrl}/${callableName}`;
    const startMs = Date.now();
    let responseText = null;
    let copyScoringTrace = null;
    let creditCost = null;
    let errorCode = null;
    try {
        const headers = await getIdToken(url);
        if (dryRun) {
            return {
                sampleIndex,
                language,
                offerType,
                gateEnabled,
                callableName,
                durationMs: 0,
                creditCost: null,
                fields: null,
                copyScoringTrace: null,
                error: "dry-run",
            };
        }
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                ...headers,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                data: { ...payload, copyScoringOverrideEnabled: gateEnabled },
            }),
        });
        const durationMs = Date.now() - startMs;
        if (!resp.ok) {
            errorCode = `http_${resp.status}`;
        } else {
            const body = await resp.json();
            responseText = body?.result?.data?.text || null;
            copyScoringTrace = body?.result?.data?.copyScoringTrace || null;
            creditCost = body?.result?.data?.costEstimate?.total || null;
        }
        return {
            sampleIndex,
            language,
            offerType,
            gateEnabled,
            callableName,
            durationMs,
            creditCost,
            fields: parseFieldsFromText(responseText),
            copyScoringTrace,
            error: errorCode,
        };
    } catch (e) {
        return {
            sampleIndex,
            language,
            offerType,
            gateEnabled,
            callableName,
            durationMs: Date.now() - startMs,
            creditCost: null,
            fields: null,
            copyScoringTrace: null,
            error: e?.message || String(e),
        };
    }
}

function parseFieldsFromText(text) {
    if (!text) return null;
    const out = {};
    const grab = (label) => {
        const re = new RegExp(`${label}\\s*:\\s*([^\\n]*)`, "i");
        const m = text.match(re);
        return m ? m[1].trim() : null;
    };
    out.hookText = grab("HOOK_TEXT");
    out.subheadText = grab("SUBHEADLINE");
    out.ctaName = grab("CTA_BUTTON");
    out.benefitText = grab("BENEFIT");
    return out;
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
    const opts = parseArgs(process.argv);

    // Ensure outputs directory exists
    await mkdir(opts.outputs, { recursive: true });

    // Load the fixed input set
    let inputs;
    try {
        const raw = await readFile(INPUTS_PATH, "utf8");
        inputs = JSON.parse(raw);
    } catch (e) {
        console.error(`❌ Could not read ${INPUTS_PATH}: ${e.message}`);
        console.error(`Create the input set first — see quickstart.md and plan.md for the schema.`);
        process.exit(2);
    }

    if (!Array.isArray(inputs?.samples) || inputs.samples.length === 0) {
        console.error(`❌ Input set at ${INPUTS_PATH} must be a JSON object with a 'samples' array.`);
        process.exit(2);
    }

    const sampleSize = Math.min(opts.sampleSize, inputs.samples.length);
    console.log(`📊 Phase 22 sample capture — ${sampleSize} samples × 2 (gate-on + gate-off)`);
    console.log(`   backend: ${opts.backend}`);
    console.log(`   output:  ${opts.outputs}`);
    if (opts.dryRun) {
        console.log(`   (dry-run mode — no live calls will be made)`);
    }

    const results = [];
    for (let i = 0; i < sampleSize; i++) {
        const s = inputs.samples[i];
        // Paired runs — same input, two gate states
        for (const gateEnabled of [true, false]) {
            const r = await captureOneRun({
                baseUrl: opts.backend,
                callableName: "serverGenerateTOV",
                payload: s.payload,
                gateEnabled,
                sampleIndex: i,
                language: s.language,
                offerType: s.offerType,
                dryRun: opts.dryRun,
            });
            results.push(r);
            console.log(
                `  ${i + 1}/${sampleSize} gate=${gateEnabled ? "on" : "off"} ${r.error ? `✗ ${r.error}` : "✓"} (${r.durationMs}ms)`,
            );
        }
    }

    // Persist artifact
    const stamp = new Date().toISOString().split("T")[0];
    const artifactPath = join(opts.outputs, `sample-${stamp}.json`);
    const artifact = {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        seed: opts.seed,
        sampleSize,
        backend: opts.backend,
        inputSetPath: INPUTS_PATH,
        results,
    };
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
    console.log(`✅ Wrote ${results.length} runs to ${artifactPath}`);
}

main().catch((e) => {
    console.error("copyQualitySample failed:", e);
    process.exit(1);
});