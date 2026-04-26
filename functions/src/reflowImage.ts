// functions/src/reflowImage.ts — onCall handler for deterministic aspect ratio reflow (HOTFIX-F)

import type { CallableRequest } from "firebase-functions/v2/https";
import type { AspectRatio } from "./generators.js";
import type {
    ReflowOutcome,
    ReflowHistoryEntry,
    ReflowMethod,
    ReflowScope,
} from "./types.js";
import { decideMethod } from "./reflowRouter.js";
import { rerenderFromPlan, NoPlanError, type RerenderGenData } from "./reflowRerender.js";
import { outpaintReflow, verifyLockedRegion, OUTPAINT_CREDIT_COST } from "./reflowOutpaint.js";

export interface ReflowImageRequest {
    generationId: string;
    targetAspectRatio: string;
    method: ReflowMethod;
    scope: ReflowScope;
    slideIndex?: number;
}

export interface ReflowImageResponse {
    success: true;
    scope: ReflowScope;
    outcomes: ReflowOutcome[];
    totalCreditsCharged: number;
}

export interface ReflowImageDeps {
    db: FirebaseFirestore.Firestore;
    admin: typeof import("firebase-admin");
    geminiApiKey: string;
    openaiApiKey: string;
}

/**
 * Generation document shape used by the reflow handler. Loose by design —
 * generation docs evolved over multiple phases and we read defensively.
 */
export interface ReflowGenerationDoc extends RerenderGenData {
    userId?: string;
    metadata?: { aspectRatio?: AspectRatio };
    output?: RerenderGenData["output"] & {
        imageUrl?: string;
    };
    mockupHistory?: Array<{ url: string; ratio: AspectRatio }>;
}

export class OutpaintDriftError extends Error {
    public readonly fallbackReason = "drift" as const;
    constructor(message: string) {
        super(message);
        this.name = "OutpaintDriftError";
    }
}

export class OutpaintEngineError extends Error {
    public readonly fallbackReason = "engine_error" as const;
    constructor(message: string) {
        super(message);
        this.name = "OutpaintEngineError";
    }
}

const SUPPORTED_RATIOS: AspectRatio[] = ["1:1", "4:5", "3:4", "4:3", "9:16", "16:9"];
const RERENDER_CREDIT_COST = 5;
// OUTPAINT_CREDIT_COST is owned by reflowOutpaint.ts and imported above (single source of truth).

function costForMethod(method: "outpaint" | "rerender"): number {
    return method === "outpaint" ? OUTPAINT_CREDIT_COST : RERENDER_CREDIT_COST;
}

export async function reflowImageHandler(
    request: CallableRequest<ReflowImageRequest>,
    deps: ReflowImageDeps,
): Promise<ReflowImageResponse> {
    const { db, admin, geminiApiKey, openaiApiKey } = deps;

    if (!request.auth) {
        const { HttpsError } = await import("firebase-functions/v2/https");
        throw new HttpsError("unauthenticated", "Login required.");
    }
    const callerId = request.auth.uid;

    const { generationId, targetAspectRatio, method, scope, slideIndex } = request.data;

    const { HttpsError } = await import("firebase-functions/v2/https");

    if (!generationId || typeof generationId !== "string") {
        throw new HttpsError("invalid-argument", "generationId is required.");
    }
    if (!SUPPORTED_RATIOS.includes(targetAspectRatio as AspectRatio)) {
        throw new HttpsError(
            "invalid-argument",
            `Unsupported target ratio: ${targetAspectRatio}. Supported: ${SUPPORTED_RATIOS.join(", ")}`,
        );
    }
    if (!["auto", "outpaint", "rerender"].includes(method)) {
        throw new HttpsError("invalid-argument", `Invalid method: ${method}.`);
    }
    if (!["single", "batch_all", "carousel_all", "carousel_slide"].includes(scope)) {
        throw new HttpsError("invalid-argument", `Invalid scope: ${scope}.`);
    }

    const { resolveCreditOwner } = await import("./entitlements.js");
    const { creditOwnerUid, teamRole } = await resolveCreditOwner(callerId);
    if (teamRole === "viewer") {
        throw new HttpsError("permission-denied", "Viewers cannot perform credit-consuming actions.");
    }

    const genRef = db.collection("generations").doc(generationId);
    const genDoc = await genRef.get();
    if (!genDoc.exists) {
        throw new HttpsError("not-found", "Generation not found.");
    }
    const genData = genDoc.data() as ReflowGenerationDoc;
    if (genData.userId !== creditOwnerUid) {
        throw new HttpsError("not-found", "Generation not found.");
    }

    const targetRatio = targetAspectRatio as AspectRatio;
    const sourceRatio = (genData.metadata?.aspectRatio as AspectRatio) || "1:1";

    // ─── Build item list based on scope ───
    interface ReflowItem {
        itemIndex: number | null;
        sourceImageUrl: string | null;
        buildPlan: string | undefined;
    }
    let items: ReflowItem[] = [];

    if (scope === "single") {
        const sourceUrl = genData.output?.imageUrl ||
            (genData.mockupHistory && genData.mockupHistory.length > 0
                ? genData.mockupHistory[genData.mockupHistory.length - 1].url
                : null);
        items = [{ itemIndex: null, sourceImageUrl: sourceUrl, buildPlan: genData.output?.buildPlan }];
    } else if (scope === "carousel_all") {
        const slides = genData.output?.carouselSlides;
        if (!Array.isArray(slides) || slides.length === 0) {
            throw new HttpsError("failed-precondition", "Source generation has no carousel slides.");
        }
        items = slides.map((s, i) => ({
            itemIndex: i,
            sourceImageUrl: s.imageUrl || null,
            buildPlan: s.buildPlan || undefined,
        }));
    } else if (scope === "carousel_slide") {
        if (typeof slideIndex !== "number" || !Number.isInteger(slideIndex) || slideIndex < 0) {
            throw new HttpsError("invalid-argument", "slideIndex is required for carousel_slide scope.");
        }
        const slides = genData.output?.carouselSlides;
        if (!Array.isArray(slides) || slideIndex >= slides.length) {
            throw new HttpsError("failed-precondition", `slideIndex ${slideIndex} out of range.`);
        }
        const slide = slides[slideIndex];
        items = [{ itemIndex: slideIndex, sourceImageUrl: slide.imageUrl || null, buildPlan: slide.buildPlan || undefined }];
    } else if (scope === "batch_all") {
        const batchResults = genData.output?.batchResults;
        if (!Array.isArray(batchResults) || batchResults.length === 0) {
            throw new HttpsError("failed-precondition", "Source generation has no batch results.");
        }
        items = batchResults.map((r, i) => ({
            itemIndex: i,
            sourceImageUrl: r.url || null,
            buildPlan: r.buildPlan || undefined,
        }));
    }

    // ─── No-op short-circuit (FR-005) — per item ───
    const isNoop = sourceRatio === targetRatio;
    const noopItems = isNoop ? items : [];
    const activeItems = isNoop ? [] : items;

    const noopOutcomes: ReflowOutcome[] = noopItems.map(it => ({
        itemIndex: it.itemIndex,
        success: true as const,
        method: null,
        fallbackFrom: null,
        fallbackReason: null,
        outputUrl: it.sourceImageUrl,
        creditsCharged: 0,
    }));

    // ─── Decide route first so credit pre-check uses the correct per-route cost ───
    const decision = decideMethod(sourceRatio, targetRatio, method);

    // ─── Pre-flight credit check (FR-017): charge by chosen route, not by upper bound ───
    // For auto-routed runs that may fall back, the worst-case cost is the rerender cost
    // (a fallback either ends at outpaint or rerender, both bounded by RERENDER_CREDIT_COST).
    // For user-override runs, no fallback occurs, so the cost is exactly the chosen route's cost.
    const perItemCost = decision.isUserOverride
        ? costForMethod(decision.chosenMethod)
        : RERENDER_CREDIT_COST;
    const maxCost = perItemCost * activeItems.length;
    const userRef = db.collection("users").doc(creditOwnerUid);
    if (maxCost > 0) {
        const userDoc = await userRef.get();
        const currentCredits = userDoc.data()?.credits || 0;
        if (currentCredits < maxCost) {
            throw new HttpsError("resource-exhausted", `Insufficient credits. Need ${maxCost}.`);
        }
    }

    const activeOutcomes = await runWithConcurrency(
        activeItems,
        5,
        async (item) => {
            return executeItemReflow({
                item,
                generationId,
                targetRatio,
                sourceRatio,
                genData,
                decision,
                geminiApiKey,
                openaiApiKey,
            });
        },
    );

    // ─── Persist successful outcomes ───
    for (const outcome of activeOutcomes) {
        if (outcome.success && outcome.outputUrl) {
            await deductAndPersist({
                db, admin, genRef, userRef,
                creditsCharged: outcome.creditsCharged,
                outputUrl: outcome.outputUrl,
                targetRatio, sourceRatio, decision, outcome,
            });
        }
    }

    const allOutcomes = [...noopOutcomes, ...activeOutcomes];
    const totalCreditsCharged = allOutcomes.reduce((sum, o) => sum + o.creditsCharged, 0);

    return {
        success: true,
        scope,
        outcomes: allOutcomes,
        totalCreditsCharged,
    };
}

async function executeItemReflow(args: {
    item: { itemIndex: number | null; sourceImageUrl: string | null; buildPlan: string | undefined };
    generationId: string;
    targetRatio: AspectRatio;
    sourceRatio: AspectRatio;
    genData: ReflowGenerationDoc;
    decision: { magnitude: number; chosenMethod: "outpaint" | "rerender"; isUserOverride: boolean };
    geminiApiKey: string;
    openaiApiKey: string;
}): Promise<ReflowOutcome> {
    const { item, generationId, targetRatio, sourceRatio, genData, decision, geminiApiKey, openaiApiKey } = args;
    const idx = item.itemIndex;

    if (decision.chosenMethod === "outpaint") {
        let outcome = await executeOutpaint(genData, sourceRatio, targetRatio, idx, item.sourceImageUrl);

        if (!outcome.success && !decision.isUserOverride) {
            console.log(`⚠️ Outpaint failed (auto), falling back to rerender for ${generationId} item ${idx}`);
            try {
                const rerenderOutcome = await executeRerender(generationId, targetRatio, genData, geminiApiKey, openaiApiKey, idx);
                if (rerenderOutcome.success) {
                    outcome = {
                        ...rerenderOutcome,
                        itemIndex: idx,
                        fallbackFrom: "outpaint",
                        fallbackReason: outcome.errorMessage?.includes("drift") ? "drift" : "engine_error",
                    };
                }
            } catch { /* fallback also failed, keep outpaint outcome */ }
        }
        return outcome;
    }

    try {
        return await executeRerender(generationId, targetRatio, genData, geminiApiKey, openaiApiKey, idx);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (decision.isUserOverride) {
            return {
                itemIndex: idx, success: false, method: null,
                fallbackFrom: null, fallbackReason: null,
                outputUrl: null, creditsCharged: 0,
                errorCode: "rerender_failed", errorMessage,
            };
        }
        if (error instanceof NoPlanError || errorMessage.includes("No saved buildPlan")) {
            console.log(`⚠️ Rerender failed (no plan), falling back to outpaint for ${generationId} item ${idx}`);
            const outpaintOutcome = await executeOutpaint(genData, sourceRatio, targetRatio, idx, item.sourceImageUrl);
            if (outpaintOutcome.success) {
                return { ...outpaintOutcome, itemIndex: idx, fallbackFrom: "rerender", fallbackReason: "no_plan" };
            }
            return {
                itemIndex: idx, success: false, method: null,
                fallbackFrom: null, fallbackReason: null,
                outputUrl: null, creditsCharged: 0,
                errorCode: "no_plan", errorMessage: "This generation predates plan persistence and cannot be reflowed.",
            };
        }
        return {
            itemIndex: idx, success: false, method: null,
            fallbackFrom: null, fallbackReason: null,
            outputUrl: null, creditsCharged: 0,
            errorCode: "rerender_failed", errorMessage,
        };
    }
}

async function runWithConcurrency<T extends { itemIndex: number | null }>(
    items: T[],
    cap: number,
    worker: (item: T) => Promise<ReflowOutcome>,
): Promise<ReflowOutcome[]> {
    const results: ReflowOutcome[] = new Array(items.length);
    let nextIdx = 0;

    async function runNext(): Promise<void> {
        while (nextIdx < items.length) {
            const idx = nextIdx++;
            try {
                results[idx] = await worker(items[idx]);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                // Use the item's logical itemIndex so carousel_slide (where idx=0 but logical
                // index could be 5) reports correctly. Fall back to array position if absent.
                const logicalItemIndex = items[idx].itemIndex ?? idx;
                results[idx] = {
                    itemIndex: logicalItemIndex, success: false, method: null,
                    fallbackFrom: null, fallbackReason: null,
                    outputUrl: null, creditsCharged: 0,
                    errorCode: "unexpected", errorMessage: message,
                };
            }
        }
    }

    const workers = Array.from({ length: Math.min(cap, items.length) }, () => runNext());
    await Promise.all(workers);
    return results;
}

async function executeOutpaint(
    genData: ReflowGenerationDoc,
    sourceRatio: AspectRatio,
    targetRatio: AspectRatio,
    itemIndex: number | null = null,
    overrideSourceUrl: string | null = null,
): Promise<ReflowOutcome> {
    const history = genData.mockupHistory;
    const sourceImageUrl: string | null = overrideSourceUrl ||
        genData.output?.imageUrl ||
        (Array.isArray(history) && history.length > 0
            ? history[history.length - 1].url
            : null);

    if (!sourceImageUrl) {
        return {
            itemIndex, success: false, method: null,
            fallbackFrom: null, fallbackReason: null,
            outputUrl: null, creditsCharged: 0,
            errorCode: "no_source", errorMessage: "No source image URL found.",
        };
    }

    try {
        const outpaintResult = await outpaintReflow({
            sourceImageUrl, sourceRatio, targetRatio,
        });

        const verification = await verifyLockedRegion(
            outpaintResult.sourceBuffer, outpaintResult.outputBuffer,
        );

        if (!verification.ok) {
            return {
                itemIndex, success: false, method: null,
                fallbackFrom: null, fallbackReason: null,
                outputUrl: null, creditsCharged: 0,
                errorCode: "drift", errorMessage: `Outpaint verification failed: ${verification.reason}`,
            };
        }

        return {
            itemIndex, success: true, method: "outpaint",
            fallbackFrom: null, fallbackReason: null,
            outputUrl: outpaintResult.outputUrl,
            creditsCharged: outpaintResult.creditsCharged,
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            itemIndex, success: false, method: null,
            fallbackFrom: null, fallbackReason: null,
            outputUrl: null, creditsCharged: 0,
            errorCode: "engine_error", errorMessage,
        };
    }
}

async function executeRerender(
    generationId: string,
    targetRatio: AspectRatio,
    genData: ReflowGenerationDoc,
    geminiApiKey: string,
    openaiApiKey: string,
    itemIndex: number | null = null,
): Promise<ReflowOutcome> {
    const result = await rerenderFromPlan({
        generationId, targetRatio, itemIndex,
        genData, geminiApiKey, openaiApiKey,
    });

    return {
        itemIndex, success: true, method: "rerender",
        fallbackFrom: null, fallbackReason: null,
        outputUrl: result.outputUrl,
        creditsCharged: result.creditsCharged,
    };
}

async function deductAndPersist(args: {
    db: FirebaseFirestore.Firestore;
    admin: typeof import("firebase-admin");
    genRef: FirebaseFirestore.DocumentReference;
    userRef: FirebaseFirestore.DocumentReference;
    creditsCharged: number;
    outputUrl: string;
    targetRatio: AspectRatio;
    sourceRatio: AspectRatio;
    decision: { magnitude: number; chosenMethod: "outpaint" | "rerender"; isUserOverride: boolean };
    outcome: ReflowOutcome;
}): Promise<void> {
    const { db, admin, genRef, userRef, creditsCharged, outputUrl, targetRatio, sourceRatio, decision, outcome } = args;

    const historyEntry: ReflowHistoryEntry = {
        timestamp: Date.now(),
        sourceRatio,
        targetRatio,
        magnitude: decision.magnitude,
        method: outcome.method as "outpaint" | "rerender",
        userOverride: decision.isUserOverride ? (outcome.method as "outpaint" | "rerender") : null,
        fallbackFrom: outcome.fallbackFrom,
        fallbackReason: outcome.fallbackReason,
        itemIndex: outcome.itemIndex,
        outputUrl,
        creditsCharged,
    };

    // Single atomic transaction: history + credit deduction succeed-or-rollback together (FR-017).
    await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
        const [genSnap, userSnap] = await Promise.all([tx.get(genRef), tx.get(userRef)]);
        const existing = (genSnap.data()?.resolutionTrace?.reflowHistory as ReflowHistoryEntry[] | undefined) ?? [];
        const currentCredits = (userSnap.data()?.credits as number | undefined) ?? 0;
        if (currentCredits < creditsCharged) {
            // Concurrent reflow drained credits between pre-flight and now; abort cleanly.
            throw new Error(`Insufficient credits at commit time (have ${currentCredits}, need ${creditsCharged}).`);
        }

        tx.set(
            genRef,
            {
                mockupHistory: admin.firestore.FieldValue.arrayUnion({
                    url: outputUrl,
                    ratio: targetRatio,
                }),
                resolutionTrace: {
                    reflowHistory: [...existing, historyEntry],
                },
            },
            { merge: true },
        );

        tx.update(userRef, {
            credits: admin.firestore.FieldValue.increment(-creditsCharged),
            lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

    console.log(`✅ Reflow ${sourceRatio}→${targetRatio} (${outcome.method}) for gen ${genRef.id}, charged ${creditsCharged}`);
}
