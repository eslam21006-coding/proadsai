// functions/src/reflowImage.ts — onCall handler for deterministic aspect ratio reflow (HOTFIX-F)

import type { CallableRequest } from "firebase-functions/v2/https";
import type { AspectRatio } from "./generators.js";
import type {
    ReflowOutcome,
    ReflowHistoryEntry,
    ReflowMethod,
    ReflowScope,
    VariantChip,
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

    const { HttpsError } = await import("firebase-functions/v2/https");

    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required.");
    }
    const callerId = request.auth.uid;

    // Guard request.data before destructuring — a null/non-object payload would otherwise
    // surface as a raw TypeError and reject the callable with a generic 'internal' error.
    if (typeof request.data !== "object" || request.data === null) {
        throw new HttpsError("invalid-argument", "request.data must be an object.");
    }

    const { generationId, targetAspectRatio, method, scope, slideIndex } = request.data;

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
        const sourceUrl = genData.output?.imageUrl;
        if (!sourceUrl) {
            throw new HttpsError("failed-precondition", "legacy_no_original");
        }
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

    // ─── Pre-flight credit check (FR-017): charge by the route the router actually chose ───
    // Reserving the rerender bound for every auto-routed outpaint would falsely reject users
    // who have enough credits for the chosen route but not the higher fallback route. If a
    // fallback is later needed and credits run short, the per-item atomic transaction's
    // commit-time re-check (deductAndPersist) catches it and that single item fails cleanly
    // (best-effort partial persistence), without blocking sibling items.
    const perItemCost = costForMethod(decision.chosenMethod);
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

    // ─── Persist successful outcomes (per-item try/catch so one Firestore commit failure
    //     does not abort delivery of the other items — best-effort partial persistence) ───
    for (let i = 0; i < activeOutcomes.length; i++) {
        const outcome = activeOutcomes[i];
        if (!outcome.success || !outcome.outputUrl) continue;
        try {
            await deductAndPersist({
                db, admin, genRef, userRef,
                creditsCharged: outcome.creditsCharged,
                outputUrl: outcome.outputUrl,
                targetRatio, sourceRatio, decision, outcome,
            });
        } catch (persistErr: unknown) {
            const persistMsg = persistErr instanceof Error ? persistErr.message : String(persistErr);
            console.warn(
                `[reflowImage] persistence failed for gen=${genRef.id} item=${outcome.itemIndex}; ` +
                `route=${outcome.method} reason="${persistMsg}". Item is converted to a failed outcome ` +
                `(no charge, no history entry) so siblings can still ship.`,
            );
            // Convert this item's outcome from success → failure: clear outputUrl, zero out
            // creditsCharged (since the transactional deduction never committed), and surface
            // a clear errorCode/errorMessage to the caller. Mutating the array entry in place
            // keeps slide-order ordering intact for carousel reflows.
            activeOutcomes[i] = {
                itemIndex: outcome.itemIndex,
                success: false,
                method: null,
                fallbackFrom: outcome.fallbackFrom,
                fallbackReason: outcome.fallbackReason,
                outputUrl: null,
                creditsCharged: 0,
                errorCode: "persist_failed",
                errorMessage: persistMsg,
            };
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
            } catch (fallbackError: unknown) {
                // Fallback rerender also failed — keep the original outpaint outcome but
                // log the secondary failure for diagnostics (auto mode, item idx, both reasons).
                const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                console.warn(
                    `[reflowImage] auto-fallback rerender failed after outpaint failure for gen=${generationId} item=${idx}; ` +
                    `outpaint reason="${outcome.errorMessage ?? "unknown"}", rerender reason="${fallbackMsg}". Returning outpaint outcome.`,
                );
            }
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
    // Per-item scopes (itemIndex !== null) MUST NOT fall back to the parent generation's
    // output.imageUrl — that would silently resize the wrong image. Only single scope
    // (itemIndex === null) may use output.imageUrl as a safety net; for items, null
    // sourceImageUrl correctly triggers the per-item `no_source` failure below.
    const sourceImageUrl: string | null =
        overrideSourceUrl ||
        (itemIndex === null ? (genData.output?.imageUrl ?? null) : null);

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
        brandColorReinforced: result.brandColorReinforced,
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
        brandColorReinforced: outcome.brandColorReinforced,
        textReflowOverflow: outcome.textReflowOverflow,
        textReductionSteps: outcome.textReductionSteps,
    };

    await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
        const [genSnap, userSnap] = await Promise.all([tx.get(genRef), tx.get(userRef)]);
        const existing = (genSnap.data()?.resolutionTrace?.reflowHistory as ReflowHistoryEntry[] | undefined) ?? [];
        const currentCredits = (userSnap.data()?.credits as number | undefined) ?? 0;
        if (currentCredits < creditsCharged) {
            throw new Error(`Insufficient credits at commit time (have ${currentCredits}, need ${creditsCharged}).`);
        }

        // Normalize existing chips into a map keyed by ratio, deduping by newest
        // generatedAt (FR-017a invariant: no duplicate ratios at rest). This is
        // defensive against legacy data or any concurrent-write artefacts; the
        // handler is the only writer to variantChips so we re-enforce the shape
        // on every commit.
        const existingChips: VariantChip[] = (genSnap.data()?.variantChips as VariantChip[] | undefined) ?? [];
        const chipMap = new Map<AspectRatio, VariantChip>();
        for (const chip of existingChips) {
            if (!chip || typeof chip.ratio !== "string") continue;
            const prior = chipMap.get(chip.ratio);
            if (!prior || (chip.generatedAt ?? 0) > (prior.generatedAt ?? 0)) {
                chipMap.set(chip.ratio, chip);
            }
        }
        const newChip: VariantChip = { ratio: targetRatio, url: outputUrl, generatedAt: Date.now() };
        chipMap.set(targetRatio, newChip);
        // Emit in canonical SUPPORTED_RATIOS order, dropping any ratios not in
        // the 6-key launch set. Cap is implicit in the key-space (<=6).
        const updatedChips: VariantChip[] = SUPPORTED_RATIOS
            .map(r => chipMap.get(r))
            .filter((c): c is VariantChip => c !== undefined);

        const prevTrace = genSnap.data()?.resolutionTrace ?? {};
        const prevBrandReinforced = prevTrace.brandColorReinforced === true;
        const prevTextOverflow = prevTrace.textReflowOverflow === true;

        tx.set(
            genRef,
            {
                mockupHistory: admin.firestore.FieldValue.arrayUnion({
                    url: outputUrl,
                    ratio: targetRatio,
                }),
                variantChips: updatedChips,
                resolutionTrace: {
                    reflowHistory: [...existing, historyEntry],
                    brandColorReinforced: prevBrandReinforced || (outcome.brandColorReinforced === true),
                    textReflowOverflow: prevTextOverflow || (outcome.textReflowOverflow === true),
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
