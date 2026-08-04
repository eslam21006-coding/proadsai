// src/services/geminiService.ts
// ═══════════════════════════════════════════════════════════════════════════
// THIN CLIENT — All prompt logic is server-side.
// This file only sends structured data to Cloud Functions and returns results.
// No API keys, no prompts, no knowledge modules in the browser.
// ═══════════════════════════════════════════════════════════════════════════

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { AdInputs, AspectRatio, CarouselSlideCopy, TextOverride, VisualPolish, SemanticLock, TovEditIntent, RewriteScope } from '../types';

// ─── Cloud Function references ───────────────────────────────────────────
const fnTOV = httpsCallable(functions, 'serverGenerateTOV', { timeout: 120000 });
const fnConcepts = httpsCallable(functions, 'serverGenerateConcepts', { timeout: 120000 });
const fnBuildPlan = httpsCallable(functions, 'serverGenerateBuildPlan', { timeout: 300000 });
const fnFinalAd = httpsCallable(functions, 'serverGenerateFinalAd', { timeout: 300000 });
const fnCarouselAngles = httpsCallable(functions, 'serverGenerateCarouselAngles', { timeout: 120000 });
const fnCarouselCopies = httpsCallable(functions, 'serverGenerateCarouselSlideCopies', { timeout: 120000 });
const fnCaption = httpsCallable(functions, 'serverGenerateCaption', { timeout: 120000 });
const fnVisualPolishes = httpsCallable(functions, 'serverGenerateVisualPolishes', { timeout: 60000 });
const fnGetRankings = httpsCallable(functions, 'serverGetRankings', { timeout: 30000 });
const fnEditRegion = httpsCallable(functions, 'serverEditRegion', { timeout: 120000 });
const fnTestimonialCarousel = httpsCallable(functions, 'serverGenerateTestimonialCarousel', { timeout: 300000 });
// ─── Ranking result types (subset of backend types for frontend use) ────
export interface RankedCandidateCompact {
  family: string;
  key: string;
  verdict: string;
  score: number;
  confidence: number;
  reason: string;
}

export interface RankingResultCompact {
  requestId: string;
  requestFingerprint: string;
  recommendedPair: RankedCandidateCompact | null;
  recommendedTemplate: RankedCandidateCompact | null;
  recommendedUniverseFamilies: RankedCandidateCompact[];
  recommendedHookAngles: RankedCandidateCompact[];
  warnings: { key: string; pattern?: string; reason: string }[];
  exclusions: { family: string; key: string; reason: string }[];
}

// ─── Helper: strip large images from inputs to reduce payload ────────────
function sanitizeInputs(inputs: AdInputs): Record<string, any> {
  const clean = { ...inputs } as any;
  // Personal photos stay empty — they're sent only for image generation
  clean.personalPhotos = [];
  clean.brandLogos = (clean.brandLogos || []).slice(0, 5);
  // Reference image: KEEP for server-side analysis in all steps
  // The base64 adds ~200-500KB per request but enables real metadata extraction
  return clean;
}

// ─── Website suggestion type for Step 1 structured autofill ───────────
export interface WebsiteSuggestions {
  productName: string;
  offerTitle: string;
  description: string;
  featureCandidates: string[];
  brandTone: string;
}

// Phase 20 — Concept Director trace shape (mirrored from
// functions/src/types.ts `ConceptDirectorTraceEntry`). Defined here
// as a minimal local interface so the service boundary stays
// type-safe (no `any` in the public surface). Kept as a discriminated
// union by `ran` to mirror the backend's exact shape — the consumer
// narrows on `ran` to read the counter set or the reason.
//
// Per project convention: `interface` for object shapes, `type` for
// unions / aliases. The two variants are hoisted into named interfaces
// so the shape is reusable and so future fields (e.g. stage timing)
// can be added in one place.
export interface ConceptDirectorTraceRan {
  ran: true;
  enabled: boolean;
  killSwitch: boolean;
  mode: "balanced";
  conceptCount: number;
  fallbackCount: number;
  validatorTriggered: boolean;
  retryCount: number;
  varianceAchieved: boolean;
}

export interface ConceptDirectorTraceSkipped {
  ran: false;
  enabled: boolean;
  killSwitch: boolean;
  mode: "balanced";
  conceptCount: 0;
  fallbackCount: 0;
  validatorTriggered: false;
  retryCount: 0;
  varianceAchieved: false;
  reason: "flag-disabled" | "kill-switch-on" | "non-initial-mode" | "director-failed";
}

export type ConceptDirectorTraceEntry =
  | ConceptDirectorTraceRan
  | ConceptDirectorTraceSkipped;

const CONCEPT_DIRECTOR_SKIP_REASONS = [
  "flag-disabled",
  "kill-switch-on",
  "non-initial-mode",
  "director-failed",
] as const;

function isNonNegativeCount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

/**
 * Defensive sanitizer for the `conceptDirectorTrace` payload that
 * rides the HTTP boundary from `serverGenerateConcepts` to
 * `serverGenerateFinalAd` (audit fix #30/#32/#33 — round 2). The
 * frontend and the backend MUST both validate the discriminator
 * (`ran` boolean + closed `reason` enum) and DROP any extra keys
 * before the trace touches the persisted `_lastResolutionTrace`. A
 * failed validation returns `null` so the merge in `generateFinalAd`
 * is a no-op. The returned object contains ONLY the allowlisted
 * fields (no extra keys from a tampered request).
 */
const CONCEPT_DIRECTOR_SKIP_REASON_SET: ReadonlySet<string> =
  new Set(CONCEPT_DIRECTOR_SKIP_REASONS);

export function sanitizeConceptDirectorTrace(
  v: unknown,
): ConceptDirectorTraceEntry | null {
  if (typeof v !== "object" || v === null) return null;
  const t = v as Record<string, unknown>;
  if (t.mode !== "balanced") return null;

  if (t.ran === true) {
    if (
      typeof t.enabled !== "boolean" ||
      typeof t.killSwitch !== "boolean" ||
      !isNonNegativeCount(t.conceptCount) ||
      !isNonNegativeCount(t.fallbackCount) ||
      typeof t.validatorTriggered !== "boolean" ||
      // Per FR-015 / SC-005, each concept can be retried at most
      // once in the live run path (no concept retried 2+ times in
      // a single batch). Cap retryCount to 0 or 1 so a forged
      // payload with a large retryCount can't bypass the
      // per-concept retry ceiling.
      (t.retryCount !== 0 && t.retryCount !== 1) ||
      typeof t.varianceAchieved !== "boolean"
    ) {
      return null;
    }
    // Canonicalize: return a NEW object containing ONLY the
    // allowlisted fields (drops any extra keys a tampered
    // request may have added).
    return {
      ran: true,
      enabled: t.enabled,
      killSwitch: t.killSwitch,
      mode: "balanced",
      conceptCount: t.conceptCount,
      fallbackCount: t.fallbackCount,
      validatorTriggered: t.validatorTriggered,
      retryCount: t.retryCount as 0 | 1,
      varianceAchieved: t.varianceAchieved,
    };
  }

  if (t.ran === false) {
    if (
      typeof t.enabled !== "boolean" ||
      typeof t.killSwitch !== "boolean" ||
      t.conceptCount !== 0 ||
      t.fallbackCount !== 0 ||
      t.validatorTriggered !== false ||
      t.retryCount !== 0 ||
      t.varianceAchieved !== false
    ) {
      return null;
    }
    // CONCEPT_DIRECTOR_SKIP_REASON_SET is the single source of
    // truth for the canonical reason union. Built from the same
    // `as const` tuple the type derives its values from.
    if (!CONCEPT_DIRECTOR_SKIP_REASON_SET.has(t.reason as string)) {
      return null;
    }
    return {
      ran: false,
      enabled: t.enabled,
      killSwitch: t.killSwitch,
      mode: "balanced",
      conceptCount: 0,
      fallbackCount: 0,
      validatorTriggered: false,
      retryCount: 0,
      varianceAchieved: false,
      // The Set membership check above narrowed `t.reason` to
      // one of the 4 canonical literal values; CONCEPT_DIRECTOR_SKIP_REASONS
      // is the matching literal tuple.
      reason: t.reason as (typeof CONCEPT_DIRECTOR_SKIP_REASONS)[number],
    };
  }

  return null;
}

/**
 * Convenience type guard wrapper around `sanitizeConceptDirectorTrace`.
 * Use this for boolean checks (`if (isValidConceptDirectorTrace(t)) { ... }`).
 * Prefer `sanitizeConceptDirectorTrace` directly when the caller needs
 * the canonical object.
 */
export function isValidConceptDirectorTrace(
  v: unknown,
): v is ConceptDirectorTraceEntry {
  return sanitizeConceptDirectorTrace(v) !== null;
}

export interface GenerationResult {
  text: string;
  rankingRequestId: string | null;
  rankingRequestFingerprint: string | null;
  rankingAppliedSummary: string | null;
  costEstimate: { modelTier: string | null; retryCount: number; estimatedTokens: number } | null;
  // Phase 20 — Concept Director trace (additive optional). The
  // trace rides the HTTP boundary from `serverGenerateConcepts` →
  // frontend state → `serverGenerateFinalAd` request data → merged
  // into the persisted resolution trace. The frontend persists it
  // to the generation doc alongside the render-side trace entries
  // via `feedbackService.saveGeneration(..., resolutionTrace)`.
  conceptDirectorTrace?: ConceptDirectorTraceEntry | null;
  // Phase 22 — Copy Scoring Gate trace (audit D2 fix). The trace
  // rides the HTTP boundary from `serverGenerateTOV` /
  // `serverGenerateCarouselSlideCopies` /
  // `serverGenerateTestimonialCarousel` → frontend state → the next
  // `serverGenerateFinalAd` request → persisted
  // `ResolutionTrace.copyScoring`. Opaque passthrough — the frontend
  // never renders or interprets it; it simply holds the value and
  // forwards it unchanged. Sanitized before being held or forwarded
  // (mirror of the concept-director pattern) so a tampered request
  // cannot inject extra fields.
  copyScoringTrace?: CopyScoringTrace | null;
}

// ─── Copy Scoring Trace sanitizer (Phase 22 / audit D2) ───────────────
//
// Mirror of the concept-director sanitizer pattern: validate the
// discriminator (ran boolean), confirm skipReason is one of the
// closed enum when ran=false, and drop any extra keys. Returns a NEW
// object with only the allowlisted fields so a tampered request
// cannot inject arbitrary strings into the persisted trace.

const COPY_SCORING_SKIP_REASONS = [
  "disabled",
  "no_credential",
  "timeout_interaction",
  "timeout_copyset",
  "timeout_run",
  "unreachable",
  "malformed_response",
  "out_of_range",
  "unusable_rewrite",
] as const;

const COPY_SCORING_STEPS = ["hook", "carouselSlides", "testimonial"] as const;
const COPY_SCORING_FIELD_NAMES = [
  "hookText", "subheadText", "ctaName", "benefitText",
  "slideCaption", "testimonialHook", "testimonialClose",
] as const;
const COPY_SCORING_REWRITE_REASONS = ["scored_lower", "below_threshold"] as const;

export function sanitizeCopyScoringTrace(v: unknown): CopyScoringTrace | null {
  if (typeof v !== "object" || v === null) return null;
  const t = v as Record<string, unknown>;

  if (t.ran === true) {
    if (!Array.isArray(t.steps)) return null;
    const sanitizedSteps = [];
    for (const step of t.steps as unknown[]) {
      if (typeof step !== "object" || step === null) continue;
      const s = step as Record<string, unknown>;
      if (!COPY_SCORING_STEPS.includes(s.step as typeof COPY_SCORING_STEPS[number])) continue;
      if (typeof s.passCount !== "number" || ![0, 1, 2].includes(s.passCount)) continue;
      if (typeof s.gaveUp !== "boolean") continue;
      if (typeof s.interactionCount !== "number") continue;
      if (!Array.isArray(s.fields) || !Array.isArray(s.rewrites)) continue;
      const cleanFields = (s.fields as unknown[]).map((f) => {
        if (typeof f !== "object" || f === null) return null;
        const field = f as Record<string, unknown>;
        if (
          typeof field.variationId === "string"
          && typeof field.fieldName === "string"
          && COPY_SCORING_FIELD_NAMES.includes(field.fieldName as typeof COPY_SCORING_FIELD_NAMES[number])
          && typeof field.average === "number"
          && typeof field.passed === "boolean"
          && field.scores && typeof field.scores === "object"
        ) {
          // Coerce score values to numbers; drop non-numeric entries.
          const scores: Record<string, number> = {};
          for (const [k, v] of Object.entries(field.scores)) {
            if (typeof v === "number") scores[k] = v;
          }
          return {
            variationId: field.variationId,
            fieldName: field.fieldName,
            scores,
            average: field.average,
            passed: field.passed,
          };
        }
        return null;
      }).filter(Boolean);
      const cleanRewrites = (s.rewrites as unknown[]).map((r) => {
        if (typeof r !== "object" || r === null) return null;
        const rw = r as Record<string, unknown>;
        if (
          typeof rw.variationId === "string"
          && typeof rw.fieldName === "string"
          && (rw.pass === 1 || rw.pass === 2)
          && typeof rw.diagnosis === "string"
          && typeof rw.accepted === "boolean"
        ) {
          const rewrite: {
            variationId: string;
            fieldName: string;
            pass: 1 | 2;
            diagnosis: string;
            accepted: boolean;
            rejectReason?: string;
          } = {
            variationId: rw.variationId,
            fieldName: rw.fieldName,
            pass: rw.pass,
            diagnosis: rw.diagnosis,
            accepted: rw.accepted,
          };
          if (typeof rw.rejectReason === "string") rewrite.rejectReason = rw.rejectReason;
          return rewrite;
        }
        return null;
      }).filter(Boolean);
      sanitizedSteps.push({
        step: s.step as typeof COPY_SCORING_STEPS[number],
        fields: cleanFields as Array<{
          variationId: string;
          fieldName: string;
          scores: Record<string, number>;
          average: number;
          passed: boolean;
        }>,
        rewrites: cleanRewrites as Array<{
          variationId: string;
          fieldName: string;
          pass: 1 | 2;
          diagnosis: string;
          accepted: boolean;
          rejectReason?: string;
        }>,
        passCount: s.passCount as 0 | 1 | 2,
        gaveUp: s.gaveUp as boolean,
        interactionCount: s.interactionCount as number,
      });
    }
    const out: CopyScoringTrace = { ran: true, steps: sanitizedSteps };
    return out;
  }
  if (t.ran === false) {
    if (typeof t.skipReason !== "string") return null;
    if (!COPY_SCORING_SKIP_REASONS.includes(t.skipReason as typeof COPY_SCORING_SKIP_REASONS[number])) {
      return null;
    }
    return { ran: false, skipReason: t.skipReason as CopyScoringTrace["skipReason"] };
  }
  return null;
}

// Phase 22 — Copy Scoring Gate trace shape (mirrored from
// `functions/src/types.ts` `ResolutionTrace.copyScoring`). Defined here
// as a minimal local interface so the service boundary stays
// type-safe (no `any` in the public surface). `ran` is the discriminator
// matching the server's `CopyScoringTrace` union.
export interface CopyScoringTrace {
  ran: boolean;
  skipReason?:
    | "disabled"
    | "no_credential"
    | "timeout_interaction"
    | "timeout_copyset"
    | "timeout_run"
    | "unreachable"
    | "malformed_response"
    | "out_of_range"
    | "unusable_rewrite";
  steps?: ReadonlyArray<{
    step: "hook" | "carouselSlides" | "testimonial";
    fields: ReadonlyArray<{
      variationId: string;
      fieldName: string;
      scores: Record<string, number>;
      average: number;
      passed: boolean;
    }>;
    rewrites: ReadonlyArray<{
      variationId: string;
      fieldName: string;
      pass: 1 | 2;
      diagnosis: string;
      accepted: boolean;
      rejectReason?: string;
    }>;
    passCount: 0 | 1 | 2;
    gaveUp: boolean;
    interactionCount: number;
  }>;
}

function parseGenerationResult(data: any): GenerationResult {
  return {
    text: data?.text || '',
    rankingRequestId: data?.rankingRequestId || null,
    rankingRequestFingerprint: data?.rankingRequestFingerprint || null,
    rankingAppliedSummary: data?.rankingAppliedSummary || null,
    costEstimate: data?.costEstimate || null,
    // Phase 20 — Concept Director trace (audit fix round 8): the
    // frontend sanitizes any client-supplied payload via
    // `isValidConceptDirectorTrace` before holding it in state or
    // forwarding it back. This is the second line of defense — the
    // primary guard lives server-side (in `serverGenerateFinalAd`
    // and `generateFinalAd`). The discriminator is the `ran` boolean
    // plus the closed enum of `reason` strings on the skip path; any
    // shape that fails is dropped to `null` and the merge is a
    // no-op. `sanitizeConceptDirectorTrace` returns a NEW object
    // with only the allowlisted fields (audit fix round 9) so extra
    // keys from a tampered request never reach the persisted trace.
    conceptDirectorTrace: sanitizeConceptDirectorTrace(data?.conceptDirectorTrace),
    // Phase 22 — Copy Scoring Gate trace (audit D2 fix). Mirror of
    // the concept-director sanitizer pattern. Validated by
    // `sanitizeCopyScoringTrace`; dropped to `null` on any shape
    // mismatch so a tampered request cannot inject extra fields into
    // the persisted trace. The frontend NEVER interprets the trace —
    // it only holds it in opaque state and forwards it unchanged.
    copyScoringTrace: sanitizeCopyScoringTrace(data?.copyScoringTrace),
  };
}

export interface BuildPlanResult {
  text: string;
  warningCode?: string;
  failedFields?: string[];
}

export class GeminiService {

  // ─── Website Context (runs client-side via CORS proxy — no secret needed) ───
  async fetchWebsiteContext(url: string): Promise<string> {
    if (!url || !url.startsWith('http')) return '';
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return '';
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const title = doc.querySelector('title')?.textContent?.trim() || '';
      const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
      const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || '';
      const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';
      const h1Text = doc.querySelector('h1')?.textContent?.trim() || '';
      const keywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content')?.trim() || '';
      const description = metaDesc || ogDesc || '';
      const pageTitle = ogTitle || title || '';
      if (!pageTitle && !description && !h1Text) return '';
      return `
WEBSITE ANALYSIS (scraped from ${url}):
- Page Title: ${pageTitle}
- Main Heading: ${h1Text}
- Description: ${description}
${keywords ? `- Keywords: ${keywords}` : ''}
Use this information to better understand the brand's positioning, tone, and target audience.`;
    } catch { return ''; }
  }

  /**
   * Extract structured Step 1 suggestions from a website URL.
   * Returns editable suggestions — never invents numeric values.
   * Throws typed errors for actionable UI feedback.
   */
  async fetchWebsiteSuggestions(url: string): Promise<{ data: WebsiteSuggestions | null; error?: string }> {
    if (!url || !url.startsWith('http')) {
      return { data: null, error: 'invalid_url' };
    }

    // Try multiple CORS proxies for reliability
    const proxies = [
      (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    ];

    let html = '';
    let fetchSucceeded = false;

    for (const makeProxy of proxies) {
      try {
        const proxyUrl = makeProxy(url);
        const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          html = await response.text();
          if (html && html.length > 100) {
            fetchSucceeded = true;
            break;
          }
        }
      } catch {
        // Try next proxy
      }
    }

    if (!fetchSucceeded || !html) {
      return { data: null, error: 'fetch_failed' };
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const title = doc.querySelector('title')?.textContent?.trim() || '';
      const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';
      const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
      const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || '';
      const h1 = doc.querySelector('h1')?.textContent?.trim() || '';
      const h2s = Array.from(doc.querySelectorAll('h2')).map(el => el.textContent?.trim() || '').filter(t => t.length > 3).slice(0, 6);
      const listItems = Array.from(doc.querySelectorAll('li')).map(el => el.textContent?.trim() || '').filter(t => t.length > 5 && t.length < 100).slice(0, 8);

      const productName = ogTitle || h1 || title || '';
      const description = metaDesc || ogDesc || '';

      if (!productName && !description && !h1) {
        return { data: null, error: 'empty_content' };
      }

      // Extract features/benefits from h2s and list items
      const featureCandidates = [...h2s, ...listItems].filter(t => t.length > 5 && t.length < 80).slice(0, 6);

      // Detect brand tone from language
      const bodyText = (description + ' ' + featureCandidates.join(' ')).toLowerCase();
      let brandTone = '';
      if (bodyText.includes('luxury') || bodyText.includes('premium') || bodyText.includes('exclusive')) brandTone = 'luxury';
      else if (bodyText.includes('fun') || bodyText.includes('easy') || bodyText.includes('simple')) brandTone = 'friendly';
      else if (bodyText.includes('proven') || bodyText.includes('expert') || bodyText.includes('authority')) brandTone = 'authority';
      else if (bodyText.includes('transform') || bodyText.includes('change') || bodyText.includes('results')) brandTone = 'results-driven';

      return {
        data: {
          productName: productName.substring(0, 100),
          offerTitle: (h1 || ogTitle || '').substring(0, 100),
          description: description.substring(0, 200),
          featureCandidates,
          brandTone,
        }
      };
    } catch {
      return { data: null, error: 'parse_failed' };
    }
  }

  // ─── HOOK GENERATION ───────────────────────────────────────────────────
  async generateTOV(
    inputs: AdInputs, resolvedUniverse: string,
    mode: 'initial' | 'refresh' | 'precision' = 'initial',
    previousOutput?: string, globalRefinement?: string,
    editFeedback?: string, editIndex?: string,
    editIntent?: TovEditIntent, rewriteScope?: RewriteScope, semanticLock?: SemanticLock,
    activeWorkspaceId?: string
  ): Promise<GenerationResult> {
    const result = await fnTOV({
      inputs: sanitizeInputs(inputs), resolvedUniverse, mode,
      previousOutput, globalRefinement, editFeedback, editIndex,
      editIntent, rewriteScope, semanticLock, activeWorkspaceId,
    });
    return parseGenerationResult(result.data);
  }

  // ─── CONCEPT GENERATION ────────────────────────────────────────────────
  async generateConcepts(
    approvedTov: string, inputs: AdInputs, resolvedUniverse: string,
    mode: 'initial' | 'refresh' | 'precision' = 'initial',
    previousOutput?: string, globalRefinement?: string,
    editFeedback?: string, editIndex?: string,
    activeWorkspaceId?: string
  ): Promise<GenerationResult> {
    const result = await fnConcepts({
      approvedTov, inputs: sanitizeInputs(inputs), resolvedUniverse,
      mode, previousOutput, globalRefinement, editFeedback, editIndex, activeWorkspaceId,
    });
    return parseGenerationResult(result.data);
  }

  // ─── BUILD PLAN GENERATION ─────────────────────────────────────────────
  async generateBuildPlan(
    conceptRaw: string, selectedTov: string, inputs: AdInputs,
    resolvedUniverse: string, currentAspectRatio: AspectRatio,
    textOverride?: TextOverride,
    activeWorkspaceId?: string
  ): Promise<BuildPlanResult> {
    const result = await fnBuildPlan({
      conceptRaw, selectedTov, inputs: sanitizeInputs(inputs),
      resolvedUniverse, currentAspectRatio, textOverride, activeWorkspaceId,
    });
    const data = result.data as { text?: string; success?: boolean; errorCode?: string | null; warningCode?: string; failedFields?: string[] };
    return {
      text: data.text || '',
      warningCode: data.warningCode,
      failedFields: data.failedFields,
    };
  }

  // ─── FINAL AD IMAGE GENERATION ─────────────────────────────────────────
  async generateFinalAd(
    buildPlan: string, approvedTov: string, inputs: AdInputs,
    resolvedUniverse: string, currentAspectRatio: AspectRatio,
    editInstruction?: string, base64ToEdit?: string,
    styleReference?: string, textOverride?: TextOverride,
    activeWorkspaceId?: string, batchTotal?: number,
    // Phase 20 — Concept Director trace (audit fix #30/#32/#33 —
    // round 2): the trace rides the HTTP boundary from
    // `serverGenerateConcepts` (the gate + 3× Director loop + ≤1
    // retry) and is now merged into the persisted resolution trace
    // server-side. Field absence means the gate was never evaluated
    // (legacy / pre-Phase-20 / new flag-off) — the backend just
    // skips the merge.
    conceptDirectorTrace?: ConceptDirectorTraceEntry | null,
    // Phase 22 — Copy Scoring Gate trace (audit D2 fix). The trace
    // rides the HTTP boundary from `serverGenerateTOV` /
    // `serverGenerateCarouselSlideCopies` /
    // `serverGenerateTestimonialCarousel` → frontend state → the
    // next `serverGenerateFinalAd` request → persisted
    // `ResolutionTrace.copyScoring`. Opaque passthrough — never
    // rendered or interpreted by the frontend. Sanitized before
    // forwarding so a tampered request cannot inject extra fields.
    copyScoringTrace?: CopyScoringTrace | null,
  ): Promise<{ image: string | null; storageUrl?: string | null; imageFingerprint?: string | null; errorCode?: string; debug?: unknown; resolutionTrace?: unknown }> {
    const inputsWithPhotos = { ...inputs } as any;
    inputsWithPhotos.personalPhotos = (inputs.personalPhotos || []).slice(0, 5);
    inputsWithPhotos.brandLogos = (inputs.brandLogos || []).slice(0, 5);

    const result = await fnFinalAd({
      buildPlan, approvedTov, inputs: inputsWithPhotos,
      resolvedUniverse, currentAspectRatio,
      editInstruction, base64ToEdit, styleReference, textOverride, activeWorkspaceId,
      _batchTotal: batchTotal,
      // Forward the trace to the backend so it can be merged into
      // the resolution trace at render-stage. `undefined` is
      // stripped by the callable so the backend sees a clean
      // `request.data.conceptDirectorTrace` either as the trace or
      // as `undefined`. We re-validate + canonicalize here (audit
      // fix round 9): the App-level state may have been mutated by
      // another tab / hook, so we never forward a payload that
      // doesn't pass the discriminated-union guard OR a payload with
      // extra fields a tampered request may have added.
      conceptDirectorTrace: sanitizeConceptDirectorTrace(conceptDirectorTrace) ?? undefined,
      // Phase 22 — Copy Scoring Gate trace (audit D2 fix). Opaque
      // passthrough; sanitized before forwarding. Same pattern as
      // concept-director above. Without this, the chain is severed
      // and `ResolutionTrace.copyScoring` is never written.
      copyScoringTrace: sanitizeCopyScoringTrace(copyScoringTrace) ?? undefined,
    });
    const data = result.data as any;
    if (import.meta.env.DEV && data.debug) {
      console.warn('serverGenerateFinalAd debug', data.debug);
    }
    const raw = data.imageBase64 || null;
    // Validate: must be a data URL string starting with data:image/ to render in <img>
    const image = (typeof raw === 'string' && raw.startsWith('data:image/')) ? raw : null;
    return {
      image,
      // Storage URL persisted server-side (admin SDK). The frontend stores THIS in the
      // generations doc instead of the base64, and reflow uses it as the source image.
      storageUrl: (typeof data.storageUrl === 'string' && data.storageUrl) ? data.storageUrl : null,
      // Phase 14 — Layer 3 (FR-014): perceptual hash returned by the server
      // so the client can write it onto the generation doc + index entry
      // (server can't write by genId — Technical Constraint).
      imageFingerprint: (typeof data.imageFingerprint === 'string' && data.imageFingerprint) ? data.imageFingerprint : null,
      errorCode: data.errorCode || (raw && !image ? 'invalid_image_format' : undefined),
      debug: data.debug || null,
      resolutionTrace: data.resolutionTrace || null,
    };
  }

  // ─── CAROUSEL ANGLE GENERATION ─────────────────────────────────────────
  async generateCarouselAngles(
    inputs: AdInputs, resolvedUniverse: string,
    slideCount: number, globalRefinement?: string,
    activeWorkspaceId?: string
  ): Promise<GenerationResult> {
    const result = await fnCarouselAngles({
      inputs: sanitizeInputs(inputs), resolvedUniverse,
      slideCount, globalRefinement, activeWorkspaceId,
    });
    return parseGenerationResult(result.data);
  }

  async generateCarouselSlideCopies(
    approvedTov: string, inputs: AdInputs,
    slideCount: number, resolvedUniverse: string,
    refinement?: string,
    activeWorkspaceId?: string
  ): Promise<CarouselSlideCopy[]> {
    const result = await fnCarouselCopies({
      approvedTov, inputs: sanitizeInputs(inputs),
      slideCount, resolvedUniverse, refinement, activeWorkspaceId,
    });
    return (result.data as any).copies || [];
  }

  async generateCaption(
    mockupUrl: string, inputs: AdInputs,
    visualMetaphor: string, approvedTov: string,
    refinement?: string, carouselContext?: string, buildPlan?: string,
    activeWorkspaceId?: string
  ): Promise<GenerationResult> {
    const result = await fnCaption({
      mockupUrl, inputs: sanitizeInputs(inputs),
      visualMetaphor, approvedTov, refinement, carouselContext, buildPlan, activeWorkspaceId,
    });
    return parseGenerationResult(result.data);
  }

  // ─── VISUAL POLISH GENERATION ──────────────────────────────────────────
  async generateVisualPolishes(
    currentRender: string, inputs: AdInputs
  ): Promise<VisualPolish[]> {
    const result = await fnVisualPolishes({
      currentRender, inputs: sanitizeInputs(inputs),
    });
    return (result.data as any).polishes || [];
  }

  async fetchRankings(context: {
    userId: string; niche?: string; offerType?: string; funnelStage?: string;
    language?: string; aspectRatio?: string; selectedModes?: string[];
    universeCategory?: string; referenceAdUsed?: boolean;
    hookAngleCandidates?: string[]; pairCandidates?: string[];
    templateCandidates?: string[]; universeFamilyCandidates?: string[];
  }): Promise<RankingResultCompact | null> {
    try {
      const result = await fnGetRankings(context);
      return result.data as RankingResultCompact;
    } catch (e) {
      console.warn('Ranking fetch failed (non-blocking):', e);
      return null;
    }
  }

  async editRegion(
    imageBase64: string,
    region: { xPct: number; yPct: number; wPct: number; hPct: number },
    editMode: 'text' | 'erase' | 'style' | 'describe',
    editPayload: { newText?: string; action?: string; styleAction?: string; colorHex?: string; freeInstruction?: string },
    ratio: string,
    // FIX C (ISSUE 2): hero photos (Box A) sent as face anchors so edits never drift the face.
    personalPhotos?: string[]
  ): Promise<{ image: string | null; errorCode?: string }> {
    const result = await fnEditRegion({ imageBase64, region, editMode, editPayload, ratio, personalPhotos });
    const data = result.data as any;
    const raw = data.imageBase64 || null;
    const image = (typeof raw === 'string' && raw.startsWith('data:image/')) ? raw : null;
    return { image, errorCode: data.errorCode || (!image ? 'edit_failed' : undefined) };
  }

  // ─── TESTIMONIAL CAROUSEL GENERATION ───────────────────────────────────
  async generateTestimonialCarousel(
    inputs: AdInputs,
    screenshots: string[],
    activeWorkspaceId?: string
  ): Promise<{ text: string; platform?: string; mockupFrames?: any[]; costEstimate: any | null }> {
    const result = await fnTestimonialCarousel({
      inputs: sanitizeInputs(inputs), screenshots, activeWorkspaceId,
    });
    const data = result.data as any;
    return {
      text: data.text || '',
      platform: data.platform,
      mockupFrames: data.mockupFrames,
      costEstimate: data.costEstimate || null,
    };
  }
}

export const gemini = new GeminiService();