#!/usr/bin/env node
// scripts/copyQualityJudge.mjs
// Independent judge for Phase 22 sign-off (T076).
//
// Scores each captured string on two questions:
//   1. Does it read at or below a 6th-grade level? (yes / no)
//   2. Does it name a concrete lived moment, not an abstract category? (yes / no)
//
// Per SC-002a, this script MUST NOT share the gate's scoring prompt and
// SHOULD run on a different model — Gemini instead of OpenAI. Different
// prompt + different model removes both sources of circularity at once
// (research R10).
//
// Arabic strings are judged against the "simple spoken-style فصحى a
// 12-year-old would say out loud" standard from READING_LEVEL_BLOCK,
// never against an English readability formula (FR-005, SC-002a).
//
// The judge emits one verdict per captured string. The companion
// validation/results.md file records both the judge's verdicts and the
// product-owner spot-check verdicts (T079). Where they disagree, the
// human verdict wins; the judge prompt is corrected and the sample is
// re-scored before the final figures ship.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const VALIDATION_DIR = join(REPO_ROOT, "specs", "966-copy-scoring-gate", "validation");

// ─── Judge prompt (DIFFERENT from gate's scorer — SC-002a) ─────────

const SYSTEM_PROMPT = `You are an independent advertising copy reviewer.
You will see one on-creative string (a headline, subheadline, CTA, benefit, or slide caption).
You MUST answer two questions about it. Return your answer as JSON only — no prose, no explanation.

Question 1 — readingLevel6thGradeOrBelow (yes / no):
Does this string read at or below a 6th-grade reading level?
- Short everyday words. Short sentences. No jargon. No abstract nouns.
- If the language is Arabic: simple spoken-style فصحى — nothing a 12-year-old would not say. Avoid bookish vocabulary, formal government register, stiff news-paper phrasing.
- If the language is English: an English readability standard appropriate to a 6th-grader (≈ Lexile 600–800, Flesch-Kincaid grade ≤ 6).
- Numbers, concrete things, and one-idea-per-sentence all push toward "yes". Abstract nouns, multi-clause sentences, and bookish vocabulary push toward "no".

Question 2 — livedSymptomOrConcreteMoment (yes / no):
Does this string name a concrete lived moment the audience actually experiences (a scene, a time of day, a recognizable detail) — rather than an abstract problem category?
- "yes" examples: "Staring at the phone at 11pm, still no reply." · "Every Monday you tell yourself 'this week I'll post every day' — and by Wednesday it's gone." · "Saying yes to the cheap client again because the calendar is empty."
- "no" examples: "Struggling with lead generation." · "Feeling overwhelmed by marketing." · "Having trouble growing your business."

Return JSON in this exact shape:
{
  "readingLevel6thGradeOrBelow": "yes" | "no",
  "livedSymptomOrConcreteMoment": "yes" | "no"
}`;

// ─── Gemini client (lazy) ──────────────────────────────────────────

let _genai = null;
async function getGenAI() {
    if (_genai) return _genai;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required for the independent judge.");
    }
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    _genai = new GoogleGenerativeAI(apiKey);
    return _genai;
}

async function judgeOne({ text, language, model }) {
    const genai = await getGenAI();
    const m = genai.getGenerativeModel({
        model,
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
        systemInstruction: SYSTEM_PROMPT,
    });
    const userPrompt = `Language: ${language}\nString: ${text}`;
    const result = await m.generateContent(userPrompt);
    const raw = result?.response?.text() || "{}";
    try {
        const parsed = JSON.parse(raw);
        return {
            readingLevel6thGradeOrBelow: parsed.readingLevel6thGradeOrBelow === "yes",
            livedSymptomOrConcreteMoment: parsed.livedSymptomOrConcreteMoment === "yes",
            rawResponse: parsed,
        };
    } catch {
        return null; // malformed → treat as worst case (no / no)
    }
}

// ─── Aggregation ──────────────────────────────────────────────────

function aggregate(runs, judgeVerdicts) {
    // Group by gateEnabled × language × fieldName
    const buckets = {};
    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        const verdict = judgeVerdicts[i];
        if (!run.fields || !verdict) continue;
        for (const [fieldName, value] of Object.entries(run.fields)) {
            if (typeof value !== "string" || value.length === 0) continue;
            const key = `${run.gateEnabled ? "on" : "off"}|${run.language}|${fieldName}`;
            if (!buckets[key]) {
                buckets[key] = { gateEnabled: run.gateEnabled, language: run.language, fieldName, items: [] };
            }
            buckets[key].items.push({ value, verdict });
        }
    }
    const summary = [];
    for (const b of Object.values(buckets)) {
        const total = b.items.length;
        const reading = b.items.filter((x) => x.verdict.readingLevel6thGradeOrBelow).length;
        const lived = b.items.filter((x) => x.verdict.livedSymptomOrConcreteMoment).length;
        summary.push({
            gateEnabled: b.gateEnabled,
            language: b.language,
            fieldName: b.fieldName,
            total,
            shareReadingLevelOk: total > 0 ? reading / total : null,
            shareLivedSymptom: total > 0 ? lived / total : null,
        });
    }
    return summary;
}

// ─── CLI ──────────────────────────────────────────────────────────

function parseArgs(argv) {
    const out = {
        samplePath: null,
        outputs: VALIDATION_DIR,
        model: "gemini-2.5-flash-lite",
        concurrency: 4,
        spotCheckSize: 10,
        limit: null,
    };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--sample") out.samplePath = argv[++i];
        else if (arg === "--outputs") out.outputs = argv[++i];
        else if (arg === "--model") out.model = argv[++i];
        else if (arg === "--concurrency") out.concurrency = parseInt(argv[++i], 10);
        else if (arg === "--spot-check-size") out.spotCheckSize = parseInt(argv[++i], 10);
        else if (arg === "--limit") out.limit = parseInt(argv[++i], 10);
    }
    return out;
}

async function main() {
    const opts = parseArgs(process.argv);
    if (!opts.samplePath) {
        console.error("Usage: node scripts/copyQualityJudge.mjs --sample <path-to-sample.json>");
        process.exit(2);
    }
    await mkdir(opts.outputs, { recursive: true });

    const raw = await readFile(opts.samplePath, "utf8");
    const sample = JSON.parse(raw);
    const runs = opts.limit ? sample.results.slice(0, opts.limit) : sample.results;

    console.log(`📐 Judging ${runs.length} runs against model ${opts.model}`);
    const verdicts = [];
    let idx = 0;
    for (const run of runs) {
        if (!run.fields) {
            verdicts.push(null);
            idx++;
            continue;
        }
        const verdict = {};
        for (const [fieldName, value] of Object.entries(run.fields)) {
            if (typeof value === "string" && value.length > 0) {
                verdict[fieldName] = await judgeOne({
                    text: value,
                    language: run.language,
                    model: opts.model,
                });
            } else {
                verdict[fieldName] = null;
            }
        }
        verdicts.push(verdict);
        idx++;
        if (idx % 10 === 0) console.log(`  judged ${idx}/${runs.length}`);
    }

    const summary = aggregate(runs, verdicts);
    const stamp = new Date().toISOString().split("T")[0];
    const outPath = join(opts.outputs, `judge-${stamp}.json`);
    await writeFile(outPath, JSON.stringify({
        schemaVersion: 1,
        samplePath: opts.samplePath,
        judgedAt: new Date().toISOString(),
        model: opts.model,
        summary,
    }, null, 2), "utf8");
    console.log(`✅ Wrote judge results to ${outPath}`);
}

main().catch((e) => {
    console.error("copyQualityJudge failed:", e);
    process.exit(1);
});