// functions/src/copyScoringGate.ts
// Silent copy scoring + rewrite gate (Phase 22 Track 2).
// Sits between copy generation and the copy-fidelity contract. Scores every
// generated on-creative string on 9 dimensions, rewrites below-threshold
// fields (max 2 passes), and hands improved strings to the existing
// contract — which carries them verbatim to the rendered image.
//
// Failure modes all fail open: original copy ships unchanged; the generation
// never errors. The gate is wrapped in a total-isolation boundary so it
// cannot throw out (Contract A1, FR-015, FR-017).
//
// Trace transport (Contract I1, research R1): the audit trace rides the
// HTTP boundary through the response → frontend state → final-ad request
// payload. Module-global survivors are forbidden because
// `serverGenerateTOV` and `serverGenerateFinalAd` run in separate Cloud
// Run containers (see `generators.ts:1389-1398` for the documented
// precedent that motivated this rule).

// ─── Types ────────────────────────────────────────────────────────────

export type CopyDimension =
  | "audienceSpecificity"
  | "painDesireRelevance"
  | "clarity"
  | "scrollStoppingTension"
  | "wordingSpecificity"
  | "offerRelevance"
  | "nonGenericLanguage"
  | "readingLevel"
  | "livedSymptomDepth";

export const ACTIVE_DIMENSIONS: readonly CopyDimension[] = [
  "audienceSpecificity",
  "painDesireRelevance",
  "clarity",
  "scrollStoppingTension",
  "wordingSpecificity",
  "offerRelevance",
  "nonGenericLanguage",
  "readingLevel",
  "livedSymptomDepth",
] as const;

export const DEFERRED_DIMENSIONS: readonly string[] = [
  "hookAngleFit",
  "formatFit",
  "visualCompatibility",
  "ctaStrength",
  "proofStrength",
  "objectionHandling",
] as const;

export type FieldName =
  | "hookText"
  | "subheadText"
  | "ctaName"
  | "benefitText"
  | "slideCaption"
  | "testimonialHook"
  | "testimonialClose";

export type GateStep = "hook" | "carouselSlides" | "testimonial";

export type Language = "ar" | "en";

export type SkipReason =
  | "disabled"
  | "no_credential"
  | "timeout_interaction"
  | "timeout_copyset"
  | "timeout_run"
  | "unreachable"
  | "malformed_response"
  | "out_of_range"
  | "unusable_rewrite";

export interface ScoredField {
  variationId: string;
  fieldName: FieldName;
  original: string;
  scores: Record<CopyDimension, number>;
  average: number;
  passed: boolean;
  failureReasons: string[];
}

export interface RewriteDecision {
  variationId: string;
  fieldName: FieldName;
  pass: 1 | 2;
  diagnosis: string;
  candidate: string;
  candidateScore: number;
  accepted: boolean;
  rejectReason: string | null;
}

export interface CopySet {
  step: GateStep;
  fields: Array<{
    variationId: string;
    fieldName: FieldName;
    value: string;
  }>;
  untouchable: string[];
  rawBlock: string;
}

export interface ScoreResponse {
  fields: Array<{
    variationId: string;
    fieldName: FieldName;
    scores: Record<CopyDimension, number>;
  }>;
}

export interface RewriteResponse {
  rewrites: Array<{
    variationId: string;
    fieldName: FieldName;
    candidate: string;
    claimFlags?: Array<{ text: string; reason: string }>;
  }>;
}

export interface GateInput {
  step: GateStep;
  rawBlock: string;
  language: Language;
  untouchable: string[];
}

export interface GateDeps {
  score: (payload: {
    language: Language;
    step: GateStep;
    fields: Array<{ variationId: string; fieldName: FieldName; value: string }>;
  }) => Promise<ScoreResponse>;
  rewrite: (payload: {
    language: Language;
    step: GateStep;
    failing: Array<{ variationId: string; fieldName: FieldName; value: string; diagnosis: string }>;
    untouchable: string[];
  }) => Promise<RewriteResponse>;
  now: () => number;
}

export interface CopyScoringStepTrace {
  step: GateStep;
  fields: Array<{
    variationId: string;
    fieldName: FieldName;
    scores: Record<string, number>;
    average: number;
    passed: boolean;
  }>;
  rewrites: Array<{
    variationId: string;
    fieldName: FieldName;
    pass: 1 | 2;
    diagnosis: string;
    accepted: boolean;
    rejectReason?: string;
  }>;
  passCount: 0 | 1 | 2;
  gaveUp: boolean;
  interactionCount: number;
}

export interface CopyScoringTrace {
  ran: boolean;
  skipReason?: SkipReason;
  steps?: CopyScoringStepTrace[];
}

// ─── Configuration ────────────────────────────────────────────────────

// Field sets that gate on `livedSymptomDepth` (FR-003a). CTA and benefit
// are scored on it but the score is NOT used for gating (FR-003b).
const LIVED_SYMPTOM_GATED: ReadonlySet<FieldName> = new Set([
  "hookText",
  "subheadText",
  "slideCaption",
  "testimonialHook",
  "testimonialClose",
]);

// ─── Helpers ──────────────────────────────────────────────────────────

function isLivedSymptomGated(name: FieldName): boolean {
  return LIVED_SYMPTOM_GATED.has(name);
}

function isIntInRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

function validDimensionScore(v: unknown): v is number {
  return isIntInRange(v, 1, 10);
}

function isEmptyOrWhitespace(v: unknown): v is string {
  return typeof v === "string" && v.trim().length === 0;
}

/**
 * Inverse of the virtual block built by `generateCarouselSlideCopies`:
 * extract per-slide hookText values keyed by variation id (A..J).
 */
export function parseBlockIntoFieldsForSlides(rewrittenBlock: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /HOOK_START_([A-J])\b[\s\S]*?HOOK_TEXT\s*:\s*([^\n]+)[\s\S]*?HOOK_END_[A-J]\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rewrittenBlock)) !== null) {
    out.set(m[1], (m[2] || "").trim());
  }
  return out;
}

/**
 * Parse the raw block into one record per (variationId, fieldName).
 * Recognised variation markers: HOOK_START_A/B/C/D (single, batch,
 * retargeting). For carousel slides the caller pre-parses the block into
 * `slide_<n>: <caption>` lines and passes those directly via `extraFields`.
 *
 * Falls back to single-variation (id="A") on unrecognised block shape.
 */
export function parseBlockIntoFields(
  rawBlock: string,
  extraFields?: Array<{ variationId: string; fieldName: FieldName; value: string }>,
): Array<{ variationId: string; fieldName: FieldName; value: string }> {
  if (extraFields && extraFields.length > 0) {
    return extraFields.filter((f) => typeof f?.value === "string" && f.value.length > 0);
  }
  // HOOK_* parsing — variations A-J cover the maximum carousel size
  // (10 slides) plus the hook step's standard A-D. Hook_START_A/B/C/D
  // is what single / batch / retargeting produce; the carousel path
  // reuses the same marker for slides A-J via `parseBlockIntoFieldsForSlides`.
  const out: Array<{ variationId: string; fieldName: FieldName; value: string }> = [];
  const varRe = /HOOK_START_([A-J])\b([\s\S]*?)(?=HOOK_START_[A-J]\b|HOOK_END_[A-J]\b|$)/g;
  const fieldRe = /\b(HOOK_TEXT|SUBHEADLINE|CTA_BUTTON|BENEFIT)\s*:\s*([^\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(rawBlock)) !== null) {
    const varId = m[1];
    const body = m[2];
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      const label = fm[1];
      const value = (fm[2] || "").trim();
      if (value.length === 0) continue;
      const fieldName: FieldName =
        label === "HOOK_TEXT" ? "hookText"
          : label === "SUBHEADLINE" ? "subheadText"
            : label === "CTA_BUTTON" ? "ctaName"
              : "benefitText";
      out.push({ variationId: varId, fieldName, value });
    }
  }
  if (out.length > 0) return out;
  // Fallback: try a single variation labelled A on bare text
  const fallback: Array<{ variationId: string; fieldName: FieldName; value: string }> = [];
  const fbm = /\b(HOOK_TEXT|SUBHEADLINE|CTA_BUTTON|BENEFIT)\s*:\s*([^\n]*)/g.exec(rawBlock);
  if (fbm) {
    const label = fbm[1];
    const value = (fbm[2] || "").trim();
    if (value.length > 0) {
      const fieldName: FieldName =
        label === "HOOK_TEXT" ? "hookText"
          : label === "SUBHEADLINE" ? "subheadText"
            : label === "CTA_BUTTON" ? "ctaName"
              : "benefitText";
      fallback.push({ variationId: "A", fieldName, value });
    }
  }
  return fallback;
}

// ─── Typed error sentinels ────────────────────────────────────────────
//
// `runInteraction` classifies failures by error identity, not by message
// text (see comments below). Throwing these sentinel errors lets the
// gate emit `malformed_response` instead of `unreachable` for JSON.parse
// failures inside the OpenAI client wrapper.

export class GateTimeoutError extends Error {
  readonly scope: "interaction" | "copyset" | "run";
  constructor(scope: GateTimeoutError["scope"]) {
    super(`gate_timeout_${scope}`);
    this.name = "GateTimeoutError";
    this.scope = scope;
  }
}

export class MalformedModelResponseError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "MalformedModelResponseError";
  }
}

/**
 * Extract the variation markers (`HOOK_START_A`/`HOOK_END_A` etc.) and
 * structural labels from the original block, and substitute the new
 * field values in place. Never lets the model regenerate the block.
 * Returns null if any structural element is missing in the rewrite.
 */
export function substituteFieldsInBlock(
  rawBlock: string,
  fields: Array<{ variationId: string; fieldName: FieldName; value: string }>,
  untouchable: string[],
): { newBlock: string; ok: boolean } {
  // Group by variation so each rewrite is scoped to that variation's
  // body (between HOOK_START_X and HOOK_END_X). A naive global regex
  // would replace every `HOOK_TEXT:` line with the last field's value.
  let out = rawBlock;
  for (const f of fields) {
    const label =
      f.fieldName === "hookText" ? "HOOK_TEXT"
        : f.fieldName === "subheadText" ? "SUBHEADLINE"
          : f.fieldName === "ctaName" ? "CTA_BUTTON"
            : f.fieldName === "benefitText" ? "BENEFIT"
              : null;
    if (!label) continue;
    const varEsc = f.variationId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match the variation body bounded by HOOK_END_<varId>, then
    // substitute the first `<LABEL>:` value inside that body. The
    // label group is non-greedy so it captures only up to the next
    // newline; the body-bound quantifier is greedy up to HOOK_END_<X>.
    // Note: `String.prototype.replace`'s function replacer does NOT
    // interpret $-patterns — `$$` would emit a literal `$$` here.
    // Pass the value through verbatim so currency literals (`$99`)
    // survive untouched.
    const re = new RegExp(
      `HOOK_START_${varEsc}\\b([\\s\\S]*?HOOK_END_${varEsc}\\b)`,
      "i",
    );
    out = out.replace(re, (_body, bodyContent: string) => {
      const labelRe = new RegExp(`(${label}\\s*:)\\s*([^\\n]*)`, "i");
      const newBody = bodyContent.replace(labelRe, (_full2, labelPrefix: string) =>
        `${labelPrefix} ${f.value}`,
      );
      return `HOOK_START_${f.variationId}${newBody}`;
    });
  }
  // Untouched check
  for (const u of untouchable) {
    if (u && u.length > 0 && !out.includes(u)) {
      return { newBlock: rawBlock, ok: false };
    }
  }
  return { newBlock: out, ok: true };
}

/**
 * Re-parse a rewritten block and verify the variation count + label
 * structure still match the original. Returns false on any structural
 * degradation — the gate must keep the original block in that case
 * (FR-000c, SC-006b).
 *
* No label the original has may be dropped in the rewrite. The current
  * check allows additional labels to appear in the rewritten block (no
  // upper-bound check); substituteFieldsInBlock does not introduce new
  // labels today, so this is a safety net rather than a hard contract.
 */
export function blockStructurePreserved(
  original: string,
  rewritten: string,
): boolean {
  const countMatches = (s: string) => (s.match(/\bHOOK_START_[A-J]\b/g) || []).length;
  const endMatches = (s: string) => (s.match(/\bHOOK_END_[A-J]\b/g) || []).length;
  if (countMatches(original) !== countMatches(rewritten)) return false;
  if (endMatches(original) !== endMatches(rewritten)) return false;
  // Required labels: HOOK_TEXT and CTA_BUTTON always appear in single
  // / retargeting / batch blocks. Slide-caption and testimonial blocks
  // may have only HOOK_TEXT — see `parseBlockIntoFields` for context.
  const requiredLabels: readonly RegExp[] = [
    /\bHOOK_TEXT\s*:/i,
  ];
  for (const re of requiredLabels) {
    if (re.test(original) && !re.test(rewritten)) return false;
  }
  // Labels present in the rewritten must also be present in the
  // original (no new labels).
  const labelPatterns = [
    /\bHOOK_TEXT\s*:/g,
    /\bSUBHEADLINE\s*:/g,
    /\bCTA_BUTTON\s*:/g,
    /\bBENEFIT\s*:/g,
  ];
  for (const re of labelPatterns) {
    const origCount = (original.match(re) || []).length;
    const rewrCount = (rewritten.match(re) || []).length;
    if (rewrCount < origCount) return false;
  }
  return true;
}

/**
 * Apply existing cultural substitution rules (scanAndReplace) to a string
 * for the active language. Arabic only; English passes through. Returns
 * the cleaned string (or the original when no change is needed). FR-012a.
 */
export function applyCulturalSubstitution(
  value: string,
  language: Language,
): string {
  if (language !== "ar") return value;
  try {
    // Lazy import to keep this module side-effect-free (per build order 2 in quickstart.md).
    // The preceding `language !== "ar"` guard makes the redundant
    // `isArabic(language)` check unnecessary; the Arabic substitution
    // table is language-agnostic and only fires on the Arabic pass.
    const { scanAndReplace } = require("./culturalCompliance.js") as typeof import("./culturalCompliance.js");
    const r = scanAndReplace(value, "adCopy");
    return r.cleaned;
  } catch (e: unknown) {
    // Log the failure so silent bypass is debuggable — but never let a
    // cultural-substitution error block a rewrite (FR-015, fail-open).
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("⚠️ applyCulturalSubstitution failed (non-blocking):", msg);
    return value;
  }
}

/**
 * Per-field threshold evaluator. Returns { passed, failureReasons,
 * average }. The CTA / benefit path averages over 8 dimensions
 * (livedSymptomDepth is recorded but not gated, FR-003b). Every other
 * field averages over 9 dimensions (FR-006).
 */
export function evaluateThreshold(
  scores: Record<CopyDimension, number>,
  fieldName: FieldName,
): { passed: boolean; failureReasons: string[]; average: number } {
  const failures: string[] = [];
  if (scores.readingLevel < 7) failures.push("readingLevel<7");
  if (isLivedSymptomGated(fieldName) && scores.livedSymptomDepth < 7) {
    failures.push("livedSymptomDepth<7");
  }
  const otherSeven: CopyDimension[] = [
    "audienceSpecificity",
    "painDesireRelevance",
    "clarity",
    "scrollStoppingTension",
    "wordingSpecificity",
    "offerRelevance",
    "nonGenericLanguage",
  ];
  for (const dim of otherSeven) {
    if (scores[dim] < 6) failures.push(`${dim}<6`);
  }
  // Per-field average over gating dimensions only (FR-006, FR-003b).
  const dimsToAverage: CopyDimension[] = isLivedSymptomGated(fieldName)
    ? [...otherSeven, "readingLevel", "livedSymptomDepth"]
    : [...otherSeven, "readingLevel"];
  const sum = dimsToAverage.reduce((s, d) => s + scores[d], 0);
  const average = sum / dimsToAverage.length;
  if (average < 8) failures.push("average<8");
  return { passed: failures.length === 0, failureReasons: failures, average };
}

function diagnosisForFailure(failures: string[]): string {
  if (failures.includes("readingLevel<7")) return "Above 6th grade";
  if (failures.includes("livedSymptomDepth<7")) return "Surface-level";
  if (failures.includes("average<8")) return "Too generic";
  return "Too vague";
}

/**
 * Apply cultural substitution + length cap to a rewrite candidate. Returns
 * null if the candidate is unusable (Contract D9 / D10).
 */
export function validateRewriteCandidate(
  candidate: string,
  language: Language,
  original: string,
): { ok: boolean; cleaned: string; rejectReason: string | null } {
  if (!candidate || candidate.trim().length === 0) {
    return { ok: false, cleaned: original, rejectReason: "empty" };
  }
  // The candidate is written into a single-line `<LABEL>: value` slot
  // (the field regex captures `([^\n]*)`). A newline therefore splits
  // the variation body and inserts a stray unlabelled line that
  // `blockStructurePreserved` cannot detect (it only counts markers
  // and labels, neither of which changes). Reject any candidate
  // containing CR/LF or block markers.
  if (/[\r\n]/.test(candidate)) {
    return { ok: false, cleaned: original, rejectReason: "multiline_candidate" };
  }
  // Reject any candidate containing a structural block marker
  // (`HOOK_START_*` / `HOOK_END_*`) or a label keyword (`SUBHEADLINE`,
  // `CTA_BUTTON`, `BENEFIT`, `HOOK_TEXT`). The regex allows the marker
  // to be followed by ANY non-letter/digit so `HOOK_END_A` (where
  // `\b` doesn't match between `D` and `_`) is correctly rejected.
  const BLOCK_MARKER = /(?:^|\W)(HOOK_(?:START|END)|SUBHEADLINE|CTA_BUTTON|BENEFIT|HOOK_TEXT)/i;
  if (BLOCK_MARKER.test(candidate)) {
    return { ok: false, cleaned: original, rejectReason: "marker_injection" };
  }
  // Cap each rewrite at 2x the original length so the rewrite can never
  // explode into something the rendered zone can't fit.
  if (candidate.length > original.length * 2 + 40) {
    return { ok: false, cleaned: original, rejectReason: "length_cap" };
  }
  const cleaned = applyCulturalSubstitution(candidate, language);
  if (cleaned.trim().length === 0) {
    return { ok: false, cleaned: original, rejectReason: "cultural_substitution_failed" };
  }
  return { ok: true, cleaned, rejectReason: null };
}

// ─── Core entry — gated, never-throws ─────────────────────────────────

export const GATE_INTERACTION_TIMEOUT_MS = 8_000;
export const GATE_COPYSET_TIMEOUT_MS = 20_000;
export const GATE_RUN_TIMEOUT_MS = 60_000;
export const MAX_REWRITE_PASSES = 2;
export const MAX_INTERACTIONS_PER_COPYSET = 5;

/**
 * Outcome of a single gate invocation. `ran: false` carries the canonical
 * `skipReason` so the audit trail records WHY the gate did not run
 * (timeout, no credential, malformed response, etc.). `ran: true` means
 * the gate scored and possibly rewrote the block; `stepTrace` carries
 * the per-step details.
 */
export interface GateOutcome {
  block: string;
  ran: boolean;
  skipReason?: SkipReason;
  stepTrace: CopyScoringStepTrace;
}

export async function gateCopySet(
  input: GateInput,
  deps: GateDeps,
  runStartMs?: number,
): Promise<GateOutcome> {
  const copySetStart = deps.now();
  const runStart = typeof runStartMs === "number" ? runStartMs : copySetStart;

  // Total-isolation boundary — every code path resolves to a GateOutcome
  try {
    return await gateCopySetInner(input, deps, copySetStart, runStart);
  } catch (e: unknown) {
    // Log the caught error before falling back so silent bypasses are
    // debuggable. Preserve the fail-open return (original block + empty
    // step trace) so the gate never converts a generation into a
    // failure (FR-015, FR-017).
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("⚠️ gateCopySet failed (non-blocking):", msg);
    return {
      block: input.rawBlock,
      ran: false,
      skipReason: "unreachable",
      stepTrace: emptyStepTrace(input.step),
    };
  }
}

function emptyStepTrace(step: GateStep): CopyScoringStepTrace {
  return {
    step,
    fields: [],
    rewrites: [],
    passCount: 0,
    gaveUp: false,
    interactionCount: 0,
  };
}

async function gateCopySetInner(
  input: GateInput,
  deps: GateDeps,
  copySetStart: number,
  runStart: number,
): Promise<GateOutcome> {
  // Run-budget exhausted → fail open for this step. Items already gated
  // in this run keep their improved copy (FR-016a).
  if (deps.now() - runStart > GATE_RUN_TIMEOUT_MS) {
    return {
      block: input.rawBlock,
      ran: false,
      skipReason: "timeout_run",
      stepTrace: { ...emptyStepTrace(input.step) },
    };
  }

  // Parse the raw block into present (variationId, fieldName, value) records.
  const presentFields = parseBlockIntoFields(input.rawBlock);
  if (presentFields.length === 0) {
    // Nothing to gate — preserve original block. The audit trail records
    // ran:true with empty fields so the absence is distinguishable from
    // a fail-open (FR-020, ran:true with zero fields = "no fields to
    // gate", ran:false with skipReason = "gate did not execute").
    return {
      block: input.rawBlock,
      ran: true,
      stepTrace: { ...emptyStepTrace(input.step), interactionCount: 0 },
    };
  }

  let currentFields = presentFields.map((f) => ({ ...f }));
  let workingBlock = input.rawBlock;
  const scoredFields: Array<{
    variationId: string;
    fieldName: FieldName;
    scores: Record<CopyDimension, number>;
    average: number;
    passed: boolean;
  }> = [];
  const rewrites: Array<{
    variationId: string;
    fieldName: FieldName;
    pass: 1 | 2;
    diagnosis: string;
    accepted: boolean;
    rejectReason?: string;
  }> = [];
  let passCount: 0 | 1 | 2 = 0;
  let gaveUp = false;
  let interactionCount = 0;

  // ── Initial score ──────────────────────────────────────────────────
  const initialScoreOutcome = await runInteraction(async () => {
    return deps.score({
      language: input.language,
      step: input.step,
      fields: currentFields.map((f) => ({
        variationId: f.variationId,
        fieldName: f.fieldName,
        value: f.value,
      })),
    });
  }, deps, copySetStart, runStart);
  interactionCount += 1;

  if (initialScoreOutcome.kind === "fail-open") {
    return {
      block: input.rawBlock,
      ran: false,
      skipReason: initialScoreOutcome.reason,
      stepTrace: {
        step: input.step,
        fields: scoredFields,
        rewrites,
        passCount: 0,
        gaveUp: false,
        interactionCount,
      },
    };
  }

  const validatedScore = validateScoreResponse(initialScoreOutcome.value, currentFields);
  if (!validatedScore.ok) {
    // Malformed / out-of-range / references deferred dimensions → fail open
    return {
      block: input.rawBlock,
      ran: false,
      skipReason: validatedScore.reason ?? "malformed_response",
      stepTrace: {
        step: input.step,
        fields: scoredFields,
        rewrites,
        passCount: 0,
        gaveUp: false,
        interactionCount,
      },
    };
  }

  const scored: ScoredField[] = [];
  for (const f of currentFields) {
    const scores = validatedScore.scoresByField.get(fieldKey(f.variationId, f.fieldName));
    if (!scores) continue;
    const evald = evaluateThreshold(scores, f.fieldName);
    scored.push({
      variationId: f.variationId,
      fieldName: f.fieldName,
      original: f.value,
      scores,
      average: evald.average,
      passed: evald.passed,
      failureReasons: evald.failureReasons,
    });
    scoredFields.push({
      variationId: f.variationId,
      fieldName: f.fieldName,
      scores: { ...scores },
      average: evald.average,
      passed: evald.passed,
    });
  }

  // ── Rewrite loop (max 2 passes) ───────────────────────────────────
  // Local flag so a fail-open mid-loop breaks out of BOTH the inner
  // failing-field loop AND the outer pass loop. Setting `gaveUp` alone
  // doesn't stop iteration (the outer `for` would keep running passes),
  // and a bare `break` only exits one level.
  let haltPasses = false;

  for (let pass = 1; pass <= MAX_REWRITE_PASSES; pass++) {
    if (haltPasses) break;

    const failing = scored.filter((s) => !s.passed && s.original.length > 0);
    if (failing.length === 0) break;

    // Per-copy-set interaction ceiling (FR-018)
    if (interactionCount >= MAX_INTERACTIONS_PER_COPYSET) break;

    const rewriteOutcome = await runInteraction(async () => {
      return deps.rewrite({
        language: input.language,
        step: input.step,
        failing: failing.map((f) => ({
          variationId: f.variationId,
          fieldName: f.fieldName,
          value: f.original,
          diagnosis: diagnosisForFailure(f.failureReasons),
        })),
        untouchable: input.untouchable,
      });
    }, deps, copySetStart, runStart);
    interactionCount += 1;

    if (rewriteOutcome.kind === "fail-open") {
      gaveUp = true;
      haltPasses = true;
      break;
    }

    const rewritesByField = validateRewriteResponse(rewriteOutcome.value);
    // First pass: validate every rewrite candidate locally (length cap,
    // cultural compliance, untouchable). Record a decision for any
    // candidate that fails local validation; queue the rest for a
    // single BATCHED re-score interaction.
    const candidatesForReScore: Array<{
      failingField: typeof failing[number];
      cleaned: string;
      k: string;
    }> = [];
    for (const failingField of failing) {
      if (haltPasses) break;
      const k = fieldKey(failingField.variationId, failingField.fieldName);
      const rw = rewritesByField.get(k);
      if (!rw) {
        // No rewrite returned for this field → unchanged, no decision.
        continue;
      }
      const validation = validateRewriteCandidate(
        rw.candidate,
        input.language,
        failingField.original,
      );
      if (!validation.ok) {
        rewrites.push({
          variationId: failingField.variationId,
          fieldName: failingField.fieldName,
          pass: pass as 1 | 2,
          diagnosis: diagnosisForFailure(failingField.failureReasons),
          accepted: false,
          rejectReason: validation.rejectReason || "unusable_rewrite",
        });
        continue;
      }
      candidatesForReScore.push({
        failingField,
        cleaned: validation.cleaned,
        k,
      });
    }

    // Single re-score interaction for the whole batch (FR-018 ceiling
    // preserved: 1 score + 1 rewrite + 1 re-score + 1 rewrite + 1
    // re-score = 5 per copy set). Per-field re-scoring would burn N
    // interactions for N failing fields and breach the ceiling.
    let reScoresByField: Map<string, Record<CopyDimension, number>> = new Map();
    // Per-copy-set interaction ceiling (FR-018). If the ceiling has
    // already been reached by the score + rewrite calls above, the
    // re-score is skipped; the candidates are recorded as below-threshold
    // so the audit trail reflects the gate gave up rather than silently
    // exceeding the contract.
    if (
      candidatesForReScore.length > 0
      && !haltPasses
      && interactionCount < MAX_INTERACTIONS_PER_COPYSET
    ) {
      const reScoreOutcome = await runInteraction(async () => {
        return deps.score({
          language: input.language,
          step: input.step,
          fields: candidatesForReScore.map((c) => ({
            variationId: c.failingField.variationId,
            fieldName: c.failingField.fieldName,
            value: c.cleaned,
          })),
        });
      }, deps, copySetStart, runStart);
      interactionCount += 1;
      if (reScoreOutcome.kind === "fail-open") {
        gaveUp = true;
        haltPasses = true;
      } else {
        const reVal = validateScoreResponse(
          reScoreOutcome.value,
          candidatesForReScore.map((c) => ({
            variationId: c.failingField.variationId,
            fieldName: c.failingField.fieldName,
            value: c.cleaned,
          })),
        );
        if (reVal.ok) {
          reScoresByField = reVal.scoresByField;
        } else {
          // Mark all candidates as malformed for this pass.
          for (const c of candidatesForReScore) {
            rewrites.push({
              variationId: c.failingField.variationId,
              fieldName: c.failingField.fieldName,
              pass: pass as 1 | 2,
              diagnosis: diagnosisForFailure(c.failingField.failureReasons),
              accepted: false,
              rejectReason: "malformed_response",
            });
          }
        }
      }
    } else if (candidatesForReScore.length > 0 && interactionCount >= MAX_INTERACTIONS_PER_COPYSET) {
      // Ceiling reached — record every candidate as below-threshold so
      // the audit trail reflects the gate gave up rather than silently
      // exceeding the contract.
      for (const c of candidatesForReScore) {
        rewrites.push({
          variationId: c.failingField.variationId,
          fieldName: c.failingField.fieldName,
          pass: pass as 1 | 2,
          diagnosis: diagnosisForFailure(c.failingField.failureReasons),
          accepted: false,
          rejectReason: "below_threshold",
        });
      }
      gaveUp = true;
      haltPasses = true;
    }

    // Second pass: apply best-of decisions using the batched scores.
    for (const c of candidatesForReScore) {
      if (haltPasses) break;
      const { failingField, cleaned, k } = c;
      const reScores = reScoresByField.get(k);
      if (!reScores) {
        // Already recorded a malformed_response entry above; nothing more
        // to do.
        continue;
      }
      const reEvald = evaluateThreshold(reScores, failingField.fieldName);
      // Best-of selection across the original AND every prior accepted
      // rewrite in this copy set (FR-010). Accept the rewrite only if
      // it (a) meets threshold AND (b) scored strictly higher than the
      // currently-recorded average for that field. On acceptance, update
      // the scored entry so subsequent passes compare against the
      // accepted pass-1 result, not the original.
      const prevAvg = failingField.average;
      const isBetter = reEvald.average > prevAvg;
      const passes = reEvald.passed;
      if (passes && isBetter) {
        rewrites.push({
          variationId: failingField.variationId,
          fieldName: failingField.fieldName,
          pass: pass as 1 | 2,
          diagnosis: diagnosisForFailure(failingField.failureReasons),
          accepted: true,
        });
        // Update working fields + block
        const idx = currentFields.findIndex((x) => fieldKey(x.variationId, x.fieldName) === k);
        if (idx >= 0) {
          currentFields[idx] = { ...currentFields[idx], value: cleaned };
        }
        scoredFields.push({
          variationId: failingField.variationId,
          fieldName: failingField.fieldName,
          scores: { ...reScores },
          average: reEvald.average,
          passed: reEvald.passed,
        });
        // Update the local scored view so the next pass and the next
        // failing-field iteration in this pass see the new average as
        // the best-of baseline (FR-010). Without this, pass 2 compares
        // the pass-2 candidate against the original average, which can
        // replace a strictly-better pass-1 candidate.
        const scoredIdx = scored.findIndex((s) => fieldKey(s.variationId, s.fieldName) === k);
        if (scoredIdx >= 0) {
          scored[scoredIdx] = {
            ...scored[scoredIdx],
            original: cleaned,
            average: reEvald.average,
            passed: reEvald.passed,
            failureReasons: [],
            scores: reScores,
          };
        }
      } else {
        rewrites.push({
          variationId: failingField.variationId,
          fieldName: failingField.fieldName,
          pass: pass as 1 | 2,
          diagnosis: diagnosisForFailure(failingField.failureReasons),
          accepted: false,
          rejectReason: passes ? "scored_lower" : "below_threshold",
        });
      }
    }

    // Update the canonical block by value substitution
    const sub = substituteFieldsInBlock(
      workingBlock,
      currentFields.map((f) => ({
        variationId: f.variationId,
        fieldName: f.fieldName,
        value: f.value,
      })),
      input.untouchable,
    );
    if (sub.ok && blockStructurePreserved(input.rawBlock, sub.newBlock)) {
      workingBlock = sub.newBlock;
    }

    passCount = pass as 0 | 1 | 2;
  }

  // gaveUp iff we used all passes AND at least one field still fails
  // after them. Fields rejected for non-quality reasons (e.g. rewritten
  // but scored lower) are not counted as "still failing".
  if (passCount === MAX_REWRITE_PASSES) {
    const stillFailingKeys = new Set<string>();
    for (const r of rewrites) {
      if (r.accepted) continue;
      // scored_lower / below_threshold / malformed_response / empty /
      // cultural_substitution_failed / length_cap / untouchable_mutated
      // / unusable_rewrite / block_unparseable are quality / structure
      // failures; the field is still failing.
      stillFailingKeys.add(`${r.variationId}::${r.fieldName}`);
    }
    // A field is "still failing" iff its last-known scored state is
    // !passed AND it was not successfully rewritten on the last pass.
    let anyStillFailing = false;
    for (const s of scored) {
      const k = `${s.variationId}::${s.fieldName}`;
      if (s.passed) continue;
      if (!stillFailingKeys.has(k)) continue;
      anyStillFailing = true;
      break;
    }
    if (anyStillFailing) gaveUp = true;
  }

  return {
    block: workingBlock,
    ran: true,
    stepTrace: {
      step: input.step,
      fields: scoredFields,
      rewrites,
      passCount,
      gaveUp,
      interactionCount,
    },
  };
}

// ─── Time-budget runner (Promise.race) ────────────────────────────────

interface InteractionOk<T> { kind: "ok"; value: T }
interface InteractionFail { kind: "fail-open"; reason: SkipReason }
type InteractionOutcome<T> = InteractionOk<T> | InteractionFail;

async function runInteraction<T>(
  fn: () => Promise<T>,
  deps: GateDeps,
  copySetStart: number,
  runStart: number,
): Promise<InteractionOutcome<T>> {
  const now = deps.now();
  // Run-budget check before starting
  if (now - runStart > GATE_RUN_TIMEOUT_MS) {
    return { kind: "fail-open", reason: "timeout_run" };
  }
  // Copy-set-budget check before starting
  if (now - copySetStart > GATE_COPYSET_TIMEOUT_MS) {
    return { kind: "fail-open", reason: "timeout_copyset" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const interactionStart = deps.now();
    const result = await Promise.race([
      Promise.resolve().then(() => fn()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new GateTimeoutError("interaction")),
          GATE_INTERACTION_TIMEOUT_MS,
        );
      }),
    ]);
    if (deps.now() - interactionStart > GATE_INTERACTION_TIMEOUT_MS) {
      return { kind: "fail-open", reason: "timeout_interaction" };
    }
    return { kind: "ok", value: result };
  } catch (e: unknown) {
    // Classify failures by error identity (not by message text). A
    // model-client error whose message happens to contain "timeout_run"
    // is then correctly reported as `unreachable`, and a JSON.parse
    // failure carrying `MalformedModelResponseError` is reported as
    // `malformed_response` rather than `unreachable`.
    if (e instanceof GateTimeoutError) {
      return { kind: "fail-open", reason: `timeout_${e.scope}` as SkipReason };
    }
    if (e instanceof MalformedModelResponseError) {
      return { kind: "fail-open", reason: "malformed_response" };
    }
    return { kind: "fail-open", reason: "unreachable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Response validators ──────────────────────────────────────────────

function fieldKey(variationId: string, fieldName: FieldName): string {
  return `${variationId}::${fieldName}`;
}

interface ValidatedScore {
  ok: boolean;
  reason?: SkipReason;
  scoresByField: Map<string, Record<CopyDimension, number>>;
}

function validateScoreResponse(
  resp: unknown,
  fields: Array<{ variationId: string; fieldName: FieldName; value: string }>,
): ValidatedScore {
  if (!resp || typeof resp !== "object") {
    return { ok: false, reason: "malformed_response", scoresByField: new Map() };
  }
  const r = resp as { fields?: unknown };
  if (!Array.isArray(r.fields)) {
    return { ok: false, reason: "malformed_response", scoresByField: new Map() };
  }
  const out = new Map<string, Record<CopyDimension, number>>();

  // Coverage check — every requested field must appear exactly once in
  // the response, and no field the gate never sent may appear. The
  // previous implementation ignored `fields`, so a response scoring a
  // field the gate never requested (or omitting a requested field)
  // would still be treated as valid.
  const requestedKeys = new Set(fields.map((f) => fieldKey(f.variationId, f.fieldName)));
  const seenKeys = new Set<string>();

  for (const entry of r.fields) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, reason: "malformed_response", scoresByField: new Map() };
    }
    const e = entry as {
      variationId?: unknown;
      fieldName?: unknown;
      scores?: unknown;
    };
    if (typeof e.variationId !== "string" || typeof e.fieldName !== "string") {
      return { ok: false, reason: "malformed_response", scoresByField: new Map() };
    }
    const k = fieldKey(e.variationId, e.fieldName as FieldName);
    if (!requestedKeys.has(k)) {
      // Scored a field the gate never sent — malformed.
      return { ok: false, reason: "malformed_response", scoresByField: new Map() };
    }
    if (seenKeys.has(k)) {
      // Duplicate scoring for the same field — malformed.
      return { ok: false, reason: "malformed_response", scoresByField: new Map() };
    }
    seenKeys.add(k);
    if (!e.scores || typeof e.scores !== "object") {
      return { ok: false, reason: "malformed_response", scoresByField: new Map() };
    }
    const raw = e.scores as Record<string, unknown>;
    // Reject any deferred-dimension key (FR-002a)
    for (const dimKey of Object.keys(raw)) {
      if (!(ACTIVE_DIMENSIONS as readonly string[]).includes(dimKey)) {
        return {
          ok: false,
          reason: "malformed_response",
          scoresByField: new Map(),
        };
      }
    }
    const scores: Record<string, number> = {};
    for (const dim of ACTIVE_DIMENSIONS) {
      if (!validDimensionScore(raw[dim])) {
        return { ok: false, reason: "out_of_range", scoresByField: new Map() };
      }
      scores[dim] = raw[dim] as number;
    }
    out.set(k, scores as Record<CopyDimension, number>);
  }
  // Every requested field must be present.
  for (const k of requestedKeys) {
    if (!seenKeys.has(k)) {
      return { ok: false, reason: "malformed_response", scoresByField: new Map() };
    }
  }
  return { ok: true, scoresByField: out };
}

function validateRewriteResponse(
  resp: unknown,
): Map<string, { candidate: string; claimFlags?: Array<{ text: string; reason: string }> }> {
  const out = new Map<string, { candidate: string; claimFlags?: Array<{ text: string; reason: string }> }>();
  if (!resp || typeof resp !== "object") return out;
  const r = resp as { rewrites?: unknown };
  if (!Array.isArray(r.rewrites)) return out;
  for (const entry of r.rewrites) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as {
      variationId?: unknown;
      fieldName?: unknown;
      candidate?: unknown;
      claimFlags?: unknown;
    };
    if (typeof e.variationId !== "string" || typeof e.fieldName !== "string") continue;
    if (typeof e.candidate !== "string" || e.candidate.length === 0) continue;
    const k = fieldKey(e.variationId, e.fieldName as FieldName);
    const flags: Array<{ text: string; reason: string }> = [];
    if (Array.isArray(e.claimFlags)) {
      for (const f of e.claimFlags) {
        if (!f || typeof f !== "object") continue;
        const flag = f as { text?: unknown; reason?: unknown };
        if (typeof flag.text === "string" && typeof flag.reason === "string") {
          flags.push({ text: flag.text, reason: flag.reason });
        }
      }
    }
    out.set(k, { candidate: e.candidate, claimFlags: flags });
  }
  return out;
}

// ─── OpenAI client factory (production-side; gate module exposes only the
// pure function, the production wiring lives in `generators.ts`) ─────────

/**
 * Build the production score/rewrite clients from an OpenAI key. Used by
 * the attach points in `generators.ts`. The client throws on network
 * errors; the gate's wrapper catches and converts them to fail-open.
 *
 * `maxRetries: 0` keeps the OpenAI SDK from spawning its own retry loop
 * on top of the gate's interaction budget — the gate owns the timeout.
 * `timeout` is set BELOW `GATE_INTERACTION_TIMEOUT_MS` so the SDK fires
 * its timeout before the gate's Promise.race gives up, freeing the
 * connection slot.
 */
export function createOpenAIClients(openaiApiKey: string): Pick<GateDeps, "score" | "rewrite"> {
  // Dynamic import to keep this module side-effect-free in tests.
  // The `openai` package is already a direct dependency (R2).
  type OpenAIModule = typeof import("openai");
  const OpenAIMod = require("openai") as OpenAIModule;
  const OpenAI = OpenAIMod.default;
  // 1s safety margin under the gate's per-interaction ceiling (FR-016),
  // derived so the two values cannot drift apart if the constant changes.
  const client = new OpenAI({
    apiKey: openaiApiKey,
    maxRetries: 0,
    timeout: Math.max(1_000, GATE_INTERACTION_TIMEOUT_MS - 1_000),
  });

  function safeParse(raw: string, kind: "score" | "rewrite"): unknown {
    try {
      return JSON.parse(raw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`⚠️ createOpenAIClients: ${kind} JSON.parse failed (non-blocking):`, msg);
      // Throw a typed error so runInteraction can map it to
      // `malformed_response` instead of `unreachable`. The gate's
      // generic catch would otherwise misreport a parse failure as a
      // network error.
      throw new MalformedModelResponseError(`malformed ${kind} JSON`);
    }
  }

  async function score(payload: {
    language: Language;
    step: GateStep;
    fields: Array<{ variationId: string; fieldName: FieldName; value: string }>;
  }): Promise<ScoreResponse> {
    const sys = `You are an advertising copy quality judge.
Score every field on EXACTLY these 9 integer dimensions from 1 to 10:
audienceSpecificity, painDesireRelevance, clarity, scrollStoppingTension,
wordingSpecificity, offerRelevance, nonGenericLanguage, readingLevel,
livedSymptomDepth.

Return JSON in this exact shape:
{ "fields": [ { "variationId": "A", "fieldName": "hookText", "scores": { ... } } ] }

Do NOT return any other dimensions. Do NOT return prose. JSON only.`;
    const user = JSON.stringify(payload);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    const raw = completion?.choices?.[0]?.message?.content || "{}";
    return safeParse(raw, "score") as ScoreResponse;
  }

  async function rewrite(payload: {
    language: Language;
    step: GateStep;
    failing: Array<{ variationId: string; fieldName: FieldName; value: string; diagnosis: string }>;
    untouchable: string[];
  }): Promise<RewriteResponse> {
    const sys = `You are an advertising copy rewriter.
Rewrite ONLY the listed failing fields. Preserve every other byte verbatim
(including advertiser literals, brand names, claim-flag lines). The
"diagnosis" tells you which rule to apply.

Return JSON in this exact shape:
{ "rewrites": [ { "variationId": "A", "fieldName": "hookText", "candidate": "...", "claimFlags": [ { "text": "...", "reason": "..." } ] } ] }

If you introduce any fabricated verifiable specific (named person,
exact statistic, hard date, star rating), include a single claimFlags
entry describing it. Do NOT include any field you were not asked to
rewrite. Do NOT include any prose. JSON only.`;
    const user = JSON.stringify(payload);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    const raw = completion?.choices?.[0]?.message?.content || "{}";
    return safeParse(raw, "rewrite") as RewriteResponse;
  }

  return { score, rewrite };
}

// ─── Observability helper ─────────────────────────────────────────────

/**
 * One structured log line per gate outcome (FR-020a, Contract J1).
 * Caller is responsible for the structured logger. A single run may
 * gate multiple copy-producing steps (hook + carousel slides + testimonial
 * in the worst case). Aggregate passCount / interactionCount / gaveUp
 * across every step so the alertable signal reflects the whole run,
 * not just the first step.
 */
export function formatGateLogLine(
  step: GateStep,
  trace: CopyScoringTrace,
): string {
  const steps = trace.steps ?? [];
  const aggregate = steps.reduce(
    (acc, s) => {
      acc.passCount = Math.max(acc.passCount, s.passCount);
      acc.interactionCount += s.interactionCount;
      acc.gaveUp = acc.gaveUp || s.gaveUp;
      return acc;
    },
    { passCount: 0, interactionCount: 0, gaveUp: false },
  );
  const summary = {
    event: "copy_scoring_gate",
    step,
    ran: trace.ran,
    skipReason: trace.skipReason ?? null,
    stepCount: steps.length,
    passCount: aggregate.passCount,
    interactionCount: aggregate.interactionCount,
    gaveUp: aggregate.gaveUp,
    stepSummaries: steps.map((s) => ({
      step: s.step,
      passCount: s.passCount,
      interactionCount: s.interactionCount,
      gaveUp: s.gaveUp,
    })),
  };
  return JSON.stringify(summary);
}