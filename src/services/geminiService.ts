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

/**
 * Defensive type guard: is this an unknown value a well-formed
 * `ConceptDirectorTraceEntry`? Phase 20 rides the trace across the
 * Cloud Run container boundary in the HTTP payload (audit fix
 * #30/#32/#33 — round 2), so the backend MUST sanitize any
 * client-supplied payload before merging it into the persisted
 * `_lastResolutionTrace.conceptDirector`. The discriminator is `ran`
 * (boolean) plus the closed enum of allowed `reason` strings. Any
 * value that fails these checks is dropped to `null` and the merge
 * is a no-op (the backend already has its own
 * `ConceptDirectorTraceEntry` type guard in `serverGenerateFinalAd`).
 */
export function isValidConceptDirectorTrace(
    v: unknown,
): v is ConceptDirectorTraceEntry {
    if (typeof v !== "object" || v === null) return false;
    const t = v as Record<string, unknown>;
    if (t.mode !== "balanced") return false;
    if (t.ran === true) {
        // ConceptDirectorTraceRan: the live-run path. Counters are
        // non-negative numbers; enabled/killSwitch are booleans.
        return typeof t.enabled === "boolean"
            && typeof t.killSwitch === "boolean"
            && typeof t.conceptCount === "number" && t.conceptCount >= 0
            && typeof t.fallbackCount === "number" && t.fallbackCount >= 0
            && typeof t.validatorTriggered === "boolean"
            && typeof t.retryCount === "number" && t.retryCount >= 0
            && typeof t.varianceAchieved === "boolean";
    }
    if (t.ran === false) {
        // ConceptDirectorTraceSkipped: the gate-skip / failure path.
        // Counters are 0 (literal), flags are false (literal), reason
        // is one of the 4 canonical values.
        return typeof t.enabled === "boolean"
            && typeof t.killSwitch === "boolean"
            && t.conceptCount === 0
            && t.fallbackCount === 0
            && t.validatorTriggered === false
            && t.retryCount === 0
            && t.varianceAchieved === false
            && (t.reason === "flag-disabled"
                || t.reason === "kill-switch-on"
                || t.reason === "non-initial-mode"
                || t.reason === "director-failed");
    }
    return false;
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
    // no-op.
    conceptDirectorTrace: isValidConceptDirectorTrace(data?.conceptDirectorTrace)
        ? (data!.conceptDirectorTrace as ConceptDirectorTraceEntry)
        : null,
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
  ): Promise<{ image: string | null; storageUrl?: string | null; errorCode?: string; debug?: any; resolutionTrace?: any }> {
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
      // as `undefined`. We re-validate here as a defensive double
      // check (audit fix round 8): the App-level state may have
      // been mutated by another tab / hook, so we never forward a
      // payload that doesn't pass the discriminated-union guard.
      conceptDirectorTrace: isValidConceptDirectorTrace(conceptDirectorTrace)
        ? (conceptDirectorTrace ?? undefined)
        : undefined,
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