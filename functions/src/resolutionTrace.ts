// functions/src/resolutionTrace.ts — trace builder + persistence

import type {
    ResolutionTrace,
    SlideEntry,
    AutoSwitchEvent,
    LogoPipelineEvents,
    ReflowHistoryEntry,
    BrandColorSource,
    BrandColorComplianceEntry,
    ModeCompositionWarning,
    AdaptStateAuditResult,
} from "./types.js";

type Mutable<T> = { -readonly [P in keyof T]: T[P] extends readonly (infer U)[] ? U[] : T[P] };
type ResolutionTraceDraft = Partial<Mutable<ResolutionTrace>> & {
    autoSwitchEvents: AutoSwitchEvent[];
    _culturalViolation?: ResolutionTrace["culturalViolation"];
    _logoPipeline?: LogoPipelineEvents;
    _reflowHistory?: ReflowHistoryEntry[];
    _brandColorSource?: BrandColorSource;
    _brandColorCompliance?: BrandColorComplianceEntry[];
    _modeComposition?: { missing: ModeCompositionWarning[]; reinforced: boolean };
    _adaptStateAudit?: AdaptStateAuditResult;
};

// ═══════════════════════════════════════════════════════════
// TRACE BUILDER
// ═══════════════════════════════════════════════════════════

export interface TraceBuilder {
    setResolved(fields: {
        campaignType: "cold" | "retargeting";
        adMode: "single" | "carousel" | "batch";
        creativeModes: string[];
        styleFamily: "realistic" | "fantasy" | "minimal";
        subStyle: string | null;
    }): TraceBuilder;
    setHookAngle(angle: string | null, nullReason?: string): TraceBuilder;
    setObjection(id: string | null, text: string | null): TraceBuilder;
    setModeCompatibility(result: "ok" | "adapt" | "block", reason?: string): TraceBuilder;
    setReferenceAdOverride(universe?: string, subStyle?: string): TraceBuilder;
    setArtDirectionCleared(reason: string): TraceBuilder;
    setSlideCountOverride(original: number, resolved: number, reason: string): TraceBuilder;
    setEmptyFieldsSkipped(fields: string[]): TraceBuilder;
    addAutoSwitchEvent(field: string, from: string, to: string, reason: string): TraceBuilder;
    setPerSlide(slides: SlideEntry[]): TraceBuilder;
    setLaunchCheck(passed: boolean, blockReason?: string): TraceBuilder;
    setCulturalViolation(params: {
        matchedWords: string[];
        sourceLayer: "imagePrompt" | "adCopy" | "both";
    }): TraceBuilder;
    setLogoPipeline(events: LogoPipelineEvents): TraceBuilder;
    addReflowHistoryEntry(entry: ReflowHistoryEntry): TraceBuilder;
    setBrandColorSource(source: BrandColorSource): TraceBuilder;
    addBrandColorComplianceEntry(entry: BrandColorComplianceEntry): TraceBuilder;
    recordModeCompositionMissing(mode: string, missingElements: string[]): TraceBuilder;
    recordAdaptStateAudit(result: AdaptStateAuditResult): TraceBuilder;
    build(): ResolutionTrace;
}

export function createTraceBuilder(): TraceBuilder {
    const state: ResolutionTraceDraft = {
        autoSwitchEvents: [],
    };

    const builder: TraceBuilder = {
        setResolved(fields) {
            state.resolvedCampaignType = fields.campaignType;
            state.resolvedAdMode = fields.adMode;
            state.resolvedCreativeModes = fields.creativeModes;
            state.resolvedStyleFamily = fields.styleFamily;
            state.resolvedSubStyle = fields.subStyle;
            return builder;
        },
        setHookAngle(angle, nullReason) {
            state.hookAngle = angle;
            state.hookAngleNullReason = nullReason;
            return builder;
        },
        setObjection(id, text) {
            state.objectionId = id;
            state.effectiveObjectionText = text;
            return builder;
        },
        setModeCompatibility(result, reason) {
            state.modeCompatibilityResult = result;
            state.modeCompatibilityReason = reason;
            return builder;
        },
        setReferenceAdOverride(universe, subStyle) {
            state.referenceAdOverrideActive = true;
            state.overriddenUniverse = universe;
            state.overriddenSubStyle = subStyle;
            return builder;
        },
        setArtDirectionCleared(reason) {
            state.artDirectionCleared = true;
            state.artDirectionClearedReason = reason;
            return builder;
        },
        setSlideCountOverride(original, resolved, reason) {
            state.slideCountOverride = true;
            state.originalSlideCount = original;
            state.resolvedSlideCount = resolved;
            state.slideCountOverrideReason = reason;
            return builder;
        },
        setEmptyFieldsSkipped(fields) {
            state.valueStackEmptyFieldsSkipped = fields;
            return builder;
        },
        addAutoSwitchEvent(field, from, to, reason) {
            state.autoSwitchEvents.push({ field, from, to, reason });
            return builder;
        },
        setPerSlide(slides) {
            state.perSlide = slides;
            return builder;
        },
        setLaunchCheck(passed, blockReason) {
            state.launchMatrixCheckPassed = passed;
            state.launchMatrixBlockReason = blockReason;
            return builder;
        },
        setCulturalViolation(params) {
            state._culturalViolation = {
                caught: true,
                matchedWords: params.matchedWords,
                sourceLayer: params.sourceLayer,
            };
            return builder;
        },
        setLogoPipeline(events) {
            state._logoPipeline = {
                perLogo: events.perLogo.map(e => ({ ...e })),
                autoShifts: events.autoShifts.map(e => ({ ...e })),
                drops: events.drops.map(e => ({
                    ...e,
                    candidatesExhausted: [...e.candidatesExhausted],
                })),
                clamps: events.clamps.map(e => ({ ...e })),
                softWarnings: events.softWarnings.map(e => ({ ...e })),
            };
            return builder;
        },
        addReflowHistoryEntry(entry) {
            if (!state._reflowHistory) state._reflowHistory = [];
            state._reflowHistory.push({ ...entry });
            return builder;
        },
        setBrandColorSource(source) {
            state._brandColorSource = source;
            return builder;
        },
        addBrandColorComplianceEntry(entry) {
            if (!state._brandColorCompliance) state._brandColorCompliance = [];
            state._brandColorCompliance.push({ ...entry });
            return builder;
        },
        recordModeCompositionMissing(mode, missingElements) {
            if (!state._modeComposition) {
                state._modeComposition = { missing: [], reinforced: false };
            }
            state._modeComposition.missing.push({
                mode,
                missingElements: [...missingElements],
                reinforcementInjected: true,
                detectedAt: "post_build_plan",
            });
            state._modeComposition.reinforced = true;
            return builder;
        },
        recordAdaptStateAudit(result) {
            state._adaptStateAudit = {
                ...result,
                entries: result.entries.map(e => ({
                    ...e,
                    triggerWordsFound: Array.isArray(e.triggerWordsFound)
                        ? [...e.triggerWordsFound]
                        : e.triggerWordsFound,
                })),
            };
            return builder;
        },
        build(): ResolutionTrace {
            if (!state.resolvedCampaignType) throw new Error("TraceBuilder: resolvedCampaignType not set");
            if (!state.resolvedAdMode) throw new Error("TraceBuilder: resolvedAdMode not set");
            if (!state.resolvedCreativeModes) throw new Error("TraceBuilder: resolvedCreativeModes not set");
            if (!state.resolvedStyleFamily) throw new Error("TraceBuilder: resolvedStyleFamily not set");
            if (state.resolvedSubStyle === undefined) throw new Error("TraceBuilder: resolvedSubStyle not set");

            return Object.freeze({
                resolvedCampaignType: state.resolvedCampaignType!,
                resolvedAdMode: state.resolvedAdMode!,
                resolvedCreativeModes: [...(state.resolvedCreativeModes ?? [])],
                resolvedStyleFamily: state.resolvedStyleFamily!,
                resolvedSubStyle: state.resolvedSubStyle!,
                referenceAdOverrideActive: state.referenceAdOverrideActive ?? false,
                overriddenUniverse: state.overriddenUniverse,
                overriddenSubStyle: state.overriddenSubStyle,
                artDirectionCleared: state.artDirectionCleared,
                artDirectionClearedReason: state.artDirectionClearedReason,
                hookAngle: state.hookAngle ?? null,
                hookAngleNullReason: state.hookAngleNullReason,
                objectionId: state.objectionId ?? null,
                effectiveObjectionText: state.effectiveObjectionText ?? null,
                modeCompatibilityResult: state.modeCompatibilityResult ?? "ok",
                modeCompatibilityReason: state.modeCompatibilityReason,
                slideCountOverride: state.slideCountOverride,
                originalSlideCount: state.originalSlideCount,
                resolvedSlideCount: state.resolvedSlideCount,
                slideCountOverrideReason: state.slideCountOverrideReason,
                valueStackEmptyFieldsSkipped: state.valueStackEmptyFieldsSkipped ? [...state.valueStackEmptyFieldsSkipped] : undefined,
                autoSwitchEvents: [...(state.autoSwitchEvents ?? [])],
                perSlide: state.perSlide ? [...state.perSlide] : undefined,
                launchMatrixCheckPassed: state.launchMatrixCheckPassed ?? false,
                launchMatrixBlockReason: state.launchMatrixBlockReason,
                culturalViolation: state._culturalViolation,
                logoPipeline: state._logoPipeline ? {
                    perLogo: state._logoPipeline.perLogo.map((e) => ({ ...e })),
                    autoShifts: state._logoPipeline.autoShifts.map((e) => ({ ...e })),
                    drops: state._logoPipeline.drops.map((e) => ({ ...e, candidatesExhausted: [...e.candidatesExhausted] })),
                    clamps: state._logoPipeline.clamps.map((e) => ({ ...e })),
                    softWarnings: state._logoPipeline.softWarnings.map((e) => ({ ...e })),
                } : undefined,
                reflowHistory: state._reflowHistory ? state._reflowHistory.map(e => ({ ...e })) : undefined,
                brandColorSource: state._brandColorSource,
                brandColorCompliance: state._brandColorCompliance
                    ? state._brandColorCompliance.map(e => ({ ...e }))
                    : undefined,
                modeComposition: state._modeComposition
                    ? { missing: state._modeComposition.missing.map(e => ({ ...e })), reinforced: state._modeComposition.reinforced }
                    : undefined,
                adaptStateAudit: state._adaptStateAudit,
            });
        },
    };

    return builder;
}

// ═══════════════════════════════════════════════════════════
// PERSIST TRACE (fire-and-forget)
// ═══════════════════════════════════════════════════════════

export async function persistTrace(genId: string, trace: ResolutionTrace): Promise<void> {
    try {
        const admin = await import("firebase-admin");
        const db = admin.firestore();
        await db.collection("generations").doc(genId).set({ resolutionTrace: trace }, { merge: true });
    } catch (error) {
        console.warn(`⚠️ Trace persistence failed for ${genId}:`, error);
    }
}
