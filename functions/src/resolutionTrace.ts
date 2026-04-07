// functions/src/resolutionTrace.ts — trace builder + persistence

import type {
    ResolutionTrace,
    SlideEntry,
    AutoSwitchEvent,
} from "./types.js";

type Mutable<T> = { -readonly [P in keyof T]: T[P] extends readonly (infer U)[] ? U[] : T[P] };
type ResolutionTraceDraft = Partial<Mutable<ResolutionTrace>> & {
    autoSwitchEvents: AutoSwitchEvent[];
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
