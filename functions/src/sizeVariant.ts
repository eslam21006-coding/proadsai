// functions/src/sizeVariant.ts — onCall handler for Phase 17 independent multi-size
// variant generation. Replaces HOTFIX-F reflow for additional sizes and resize:
// each size is rendered as a fresh native design (no transform of pixels) using
// the parent's saved build plan (NEVER re-runs generateBuildPlan) and a visual
// reference image (anchor for pre-select, own-original for resize, uploaded
// reference takes priority over both). Charges 5 credits upfront per FR-012a,
// refunds on failure per FR-015, idempotency-keyed per FR-014.

import type { CallableRequest } from "firebase-functions/v2/https";
import type { AspectRatio } from "./generators.js";
import {
    resolveCreditOwner,
    SIZE_VARIANT_CREDIT_COST,
    hasOwnerBalanceForVariant,
} from "./entitlements.js";
import { saveBase64ToStorage } from "./storageUpload.js";
import type { GeminiCaller } from "./generators.js";
import { MODEL_PROVIDER } from "./modelConfig.js";
import {
    generateFinalAd,
    setGeminiCaller,
    setOpenAIKey,
} from "./generators.js";
import { validateModeFormatCombination } from "./creativeResolver.js";
import * as admin from "firebase-admin";
import type {
    GenerateSizeVariantRequest,
    GenerateSizeVariantResponse,
    SizeVariant,
    SizeVariantTraceEntry,
    ReferenceSource,
} from "./types.js";

// UI_RATIOS is the single source of truth for allowed sizes. Must match
// src/App.tsx:UI_RATIOS = ['1:1', '3:4', '9:16'] (see contracts/generateSizeVariant.md
// PRE-3 / VR-1).
const UI_RATIOS: ReadonlyArray<AspectRatio> = ["1:1", "3:4", "9:16"];

function isUIRatio(r: string | null | undefined): r is AspectRatio {
    return typeof r === "string" && (UI_RATIOS as readonly string[]).includes(r);
}

export interface SizeVariantDeps {
    db: FirebaseFirestore.Firestore;
    admin: typeof import("firebase-admin");
    geminiCaller: GeminiCaller;
    openaiApiKey: string;
    // Test seam: override the visual provider. Defaults to MODEL_PROVIDER.
    modelProvider?: "openai" | "gemini";
}

// ═══════════════════════════════════════════════════════════
// PRECONDITIONS (PRE-1..6) — return typed HttpsError before any charge
// ═══════════════════════════════════════════════════════════

function checkPreconditions(args: {
    request: CallableRequest<GenerateSizeVariantRequest>;
    data: Partial<GenerateSizeVariantRequest>;
    genDocExists: boolean;
    isOwner: boolean;
}): { ok: true } | { ok: false; code: "unauthenticated" | "permission-denied" | "invalid-argument" | "not-found"; message: string } {
    if (!args.request.auth) {
        return { ok: false, code: "unauthenticated", message: "Login required." };
    }
    const { data } = args;
    if (!data.generationId || typeof data.generationId !== "string") {
        return { ok: false, code: "invalid-argument", message: "generationId is required." };
    }
    if (!isUIRatio(data.targetAspectRatio)) {
        return { ok: false, code: "invalid-argument", message: `Unsupported targetAspectRatio: ${String(data.targetAspectRatio)}. Allowed: ${UI_RATIOS.join(", ")}` };
    }
    if (!["single", "batch", "carousel"].includes(String(data.scope))) {
        return { ok: false, code: "invalid-argument", message: `Invalid scope: ${String(data.scope)}.` };
    }
    // itemIndex must be null for single and a non-negative integer for batch/carousel.
    // Validating here (before any credit charge) prevents a request that would otherwise
    // pass preconditions, get charged, and then silently fail in buildVariantUpdate()
    // because the wrong persistence branch matches (CodeRabbit review: itemIndex validation
    // by scope before charging credits).
    if (data.scope === "single" && data.itemIndex !== null && data.itemIndex !== undefined) {
        return { ok: false, code: "invalid-argument", message: "itemIndex must be null for scope='single'." };
    }
    if ((data.scope === "batch" || data.scope === "carousel")
        && (!Number.isInteger(data.itemIndex) || (data.itemIndex as number) < 0)) {
        return { ok: false, code: "invalid-argument", message: "itemIndex must be a non-negative integer for scope='batch'|'carousel'." };
    }
    if (data.scope === "carousel" && (!data.sourceImageOverride || data.sourceImageOverride.length === 0)) {
        // VR-2: carousel is resize-only. A carousel request without a sourceImageOverride
        // is a pre-select attempt and must be rejected.
        return { ok: false, code: "invalid-argument", message: "Carousel multi-size is available only via the resize flow (sourceImageOverride is required)." };
    }
    if (!args.genDocExists || !args.isOwner) {
        return { ok: false, code: "not-found", message: "Generation not found." };
    }
    return { ok: true };
}

// ═══════════════════════════════════════════════════════════
// IDEMPOTENCY KEY (FR-014 / INV-2) — genId:scope:itemIndex:ratio
// ═══════════════════════════════════════════════════════════

export function buildIdempotencyKey(
    generationId: string,
    scope: GenerateSizeVariantRequest["scope"],
    itemIndex: number | null,
    targetAspectRatio: AspectRatio,
): string {
    return `${generationId}:${scope}:${itemIndex ?? "null"}:${targetAspectRatio}`;
}

// ═══════════════════════════════════════════════════════════
// PARENT DOC SHAPE (loose by design; legacy docs read defensively)
// ═══════════════════════════════════════════════════════════

interface SizeVariantParentDoc {
    userId?: string;
    creditOwnerUid?: string;
    inputs?: any; // AdInputs (loose)
    resolvedUniverse?: string;
    output?: {
        buildPlan?: string;
        approvedTov?: string;
        imageUrl?: string;
        carouselSlides?: Array<{
            imageUrl?: string;
            buildPlan?: string;
            sizeVariants?: Record<string, SizeVariant>;
        }>;
        batchResults?: Array<{
            url?: string;
            buildPlan?: string;
            sizeVariants?: Record<string, SizeVariant>;
        }>;
    };
    referenceImage?: string | null;
    metadata?: { aspectRatio?: AspectRatio };
    mockupHistory?: Array<{ url: string; ratio: AspectRatio }>;
    sizeVariants?: Record<string, SizeVariant>; // single-scope map
    resolutionTrace?: { sizeVariantTrace?: SizeVariantTraceEntry[] };
}

// Read the source-of-truth inputs/buildPlan/approvedTov for the (scope, itemIndex).
function readParentContext(
    parent: SizeVariantParentDoc,
    scope: GenerateSizeVariantRequest["scope"],
    itemIndex: number | null,
): {
    inputs: any;
    buildPlan: string;
    approvedTov: string;
    sourceImageUrl: string | null;
    existingSizeVariants: Record<string, SizeVariant> | undefined;
    parentSourceRatio: AspectRatio;
} {
    const inputs = parent.inputs ?? {};
    let buildPlan = parent.output?.buildPlan ?? "";
    let approvedTov = parent.output?.approvedTov ?? "";
    let sourceImageUrl: string | null = parent.output?.imageUrl ?? null;
    let existingSizeVariants: Record<string, SizeVariant> | undefined = parent.sizeVariants;
    const parentSourceRatio: AspectRatio = parent.metadata?.aspectRatio ?? "1:1";

    if (scope === "batch" && typeof itemIndex === "number") {
        const item = parent.output?.batchResults?.[itemIndex];
        if (item) {
            buildPlan = item.buildPlan ?? buildPlan;
            sourceImageUrl = item.url ?? sourceImageUrl;
            existingSizeVariants = item.sizeVariants;
        }
    } else if (scope === "carousel" && typeof itemIndex === "number") {
        const slide = parent.output?.carouselSlides?.[itemIndex];
        if (slide) {
            buildPlan = slide.buildPlan ?? buildPlan;
            sourceImageUrl = slide.imageUrl ?? sourceImageUrl;
            existingSizeVariants = slide.sizeVariants;
        }
    }

    return { inputs, buildPlan, approvedTov, sourceImageUrl, existingSizeVariants, parentSourceRatio };
}

// ═══════════════════════════════════════════════════════════
// REFERENCE RESOLUTION (R3 / FR-003 / FR-007 / FR-008 / FR-005a)
// Priority: uploaded > sourceImageOverride (own_original) > anchor > none
// ═══════════════════════════════════════════════════════════

function resolveReference(
    parent: SizeVariantParentDoc,
    data: GenerateSizeVariantRequest,
    anchorSucceeded: boolean,
): { source: ReferenceSource; image: string | null } {
    if (parent.referenceImage) {
        return { source: "uploaded", image: parent.referenceImage };
    }
    if (data.sourceImageOverride) {
        return { source: "own_original", image: data.sourceImageOverride };
    }
    if (parent.output?.imageUrl && anchorSucceeded) {
        return { source: "anchor", image: parent.output.imageUrl };
    }
    return { source: "none", image: null };
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

export async function generateSizeVariantHandler(
    request: CallableRequest<GenerateSizeVariantRequest>,
    deps: SizeVariantDeps,
): Promise<GenerateSizeVariantResponse> {
    const { db, geminiCaller, openaiApiKey } = deps;
    const { HttpsError } = await import("firebase-functions/v2/https");

    // ── PRE-1: authentication ──
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required.");
    }
    const callerId = request.auth.uid;

    if (typeof request.data !== "object" || request.data === null) {
        throw new HttpsError("invalid-argument", "request.data must be an object.");
    }
    const data = request.data as GenerateSizeVariantRequest;

    // ── PRE-1b: resolve team credit owner ──
    const { creditOwnerUid, teamRole } = await resolveCreditOwner(callerId);
    if (teamRole === "viewer") {
        throw new HttpsError("permission-denied", "Viewers cannot perform credit-consuming actions.");
    }

    // ── Read parent generation doc + ownership check ──
    const genRef = db.collection("generations").doc(data.generationId);
    const genDoc = await genRef.get();
    if (!genDoc.exists) {
        throw new HttpsError("not-found", "Generation not found.");
    }
    const parent = genDoc.data() as SizeVariantParentDoc;
    const isOwner = parent.userId === creditOwnerUid;
    const pre = checkPreconditions({
        request, data, genDocExists: true, isOwner,
    });
    if (!pre.ok) {
        throw new HttpsError(pre.code, pre.message);
    }

    // ── Read parent context BEFORE any charge ──
    const ctx = readParentContext(parent, data.scope, data.itemIndex);
    // itemIndex bounds: the integer check above ensures a non-negative number,
    // but a value past the end of the batch/carousel array would silently
    // fall back to the parent's first batchResults[0]/carouselSlides[0] entry
    // and charge credits for a wrong/no-op render. Reject pre-charge
    // (CodeRabbit review: itemIndex bounds validation).
    if (data.scope === "batch") {
        const batchLen = Array.isArray(parent.output?.batchResults) ? parent.output!.batchResults!.length : 0;
        if (typeof data.itemIndex !== "number" || data.itemIndex >= batchLen) {
            throw new HttpsError(
                "invalid-argument",
                `Invalid batch itemIndex: ${String(data.itemIndex)}. Parent has ${batchLen} batch result(s).`,
            );
        }
    } else if (data.scope === "carousel") {
        const carouselLen = Array.isArray(parent.output?.carouselSlides) ? parent.output!.carouselSlides!.length : 0;
        if (typeof data.itemIndex !== "number" || data.itemIndex >= carouselLen) {
            throw new HttpsError(
                "invalid-argument",
                `Invalid carousel itemIndex: ${String(data.itemIndex)}. Parent has ${carouselLen} slide(s).`,
            );
        }
    }
    if (!ctx.buildPlan || ctx.buildPlan.length === 0) {
        throw new HttpsError(
            "failed-precondition",
            "Parent generation has no saved build plan; cannot generate variant.",
        );
    }
    if (!ctx.approvedTov || ctx.approvedTov.length === 0) {
        throw new HttpsError(
            "failed-precondition",
            "Parent generation has no saved approvedTov; cannot generate variant.",
        );
    }

    // ── Idempotency key (FR-014) ──
    const idempotencyKey = buildIdempotencyKey(
        data.generationId, data.scope, data.itemIndex, data.targetAspectRatio,
    );

    // ── VR-3 / FR-011: same-size already succeeded → no-op short-circuit ──
    const existing = ctx.existingSizeVariants?.[data.targetAspectRatio];
    if (existing && existing.status === "succeeded") {
        const noOpVariant: SizeVariant = {
            ...existing,
            noOp: true,
            creditsCharged: 0,
            idempotencyKey,
            updatedAt: Date.now(),
        };
        console.log(`ℹ️ sizeVariant no-op (already succeeded): ${idempotencyKey}`);
        return { success: true, variant: noOpVariant, netCreditsCharged: 0 };
    }

    // ── Reference resolution (R3) ──
    const ref = resolveReference(parent, data, ctx.sourceImageUrl != null);

    // ── Mode/format gate (Phase 17 — CodeRabbit review: enforce on size-variant
    // callables before any credit deduction, mirroring the pattern in
    // serverGenerateFinalAd and the other generation callables in index.ts).
    // The adFormat MUST match the parent's scope — a carousel-only creative
    // mode (e.g. `testimonial_carousel`) would be incorrectly rejected by a
    // hardcoded "single" format. Map scope→adFormat for the gate.
    const adFormat: "single" | "batch" | "carousel" =
        data.scope === "carousel" ? "carousel"
        : data.scope === "batch" ? "batch"
        : "single";
    const fmtCheck = validateModeFormatCombination({
        modes: (ctx.inputs as any)?.offerCreativeMode || ["standard_hero"],
        adFormat,
        campaignType: ((ctx.inputs as any)?.campaignType as "cold" | "retargeting" | undefined) ?? "cold",
    });
    if (!fmtCheck.valid) {
        throw new HttpsError("invalid-argument", fmtCheck.reason, { code: "invalid_mode_format" });
    }

    // ── PRE-6: owner balance ≥ SIZE_VARIANT_CREDIT_COST ──
    const userRef = db.collection("users").doc(creditOwnerUid);
    const preflightUser = await userRef.get();
    const preflightBalance = (preflightUser.data()?.credits as number | undefined) ?? 0;
    if (!hasOwnerBalanceForVariant(preflightBalance)) {
        throw new HttpsError(
            "resource-exhausted",
            `Insufficient credits. Need ${SIZE_VARIANT_CREDIT_COST}, have ${preflightBalance}.`,
        );
    }

    // ── Charge 5 credits upfront + write pending variant in a single transaction ──
    const now = Date.now();
    const pendingVariant: SizeVariant = {
        ratio: data.targetAspectRatio,
        status: "pending",
        url: null,
        referenceSource: ref.source,
        creditsCharged: 0, // charged-but-not-yet-succeeded → will be 5 on success or 0 on refund
        idempotencyKey,
        updatedAt: now,
    };

    try {
        await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
            // Re-read the gen doc inside the transaction so we can detect a
            // concurrent retry against the same idempotency key (CodeRabbit
            // review: idempotency enforced at debit time, not just computed
            // and ignored). If a previous attempt already wrote a variant
            // with the SAME idempotency key and status "pending", we are the
            // second concurrent caller — reject. If status is "succeeded",
            // short-circuit to no-op (already covered above, but re-checked
            // here for races). If a different key already exists for the
            // same (scope, itemIndex, ratio) we treat it as a new run (the
            // caller would not normally re-call with the same params).
            const [userSnap, genSnap] = await Promise.all([tx.get(userRef), tx.get(genRef)]);
            const latestParent = genSnap.data() as SizeVariantParentDoc | undefined;
            if (latestParent) {
                const latestCtx = readParentContext(latestParent, data.scope, data.itemIndex);
                const existingLatest = latestCtx.existingSizeVariants?.[data.targetAspectRatio];
                if (existingLatest && existingLatest.idempotencyKey === idempotencyKey) {
                    if (existingLatest.status === "pending") {
                        // A previous concurrent attempt is still in-flight; refuse
                        // to double-charge by aborting this transaction.
                        throw new HttpsError(
                            "aborted",
                            "Variant generation already in progress for this (genId, scope, itemIndex, ratio).",
                        );
                    }
                    if (existingLatest.status === "succeeded") {
                        // Race: this caller just re-entered after a previous
                        // success. Surface as already-exists so the caller
                        // can short-circuit (the frontend will read this as
                        // a no-op result via the existing no-op check).
                        throw new HttpsError(
                            "already-exists",
                            "Variant already generated for this ratio.",
                        );
                    }
                }
            }
            const userBalance = (userSnap.data()?.credits as number | undefined) ?? 0;
            if (userBalance < SIZE_VARIANT_CREDIT_COST) {
                throw new Error(
                    `Insufficient credits at commit time (have ${userBalance}, need ${SIZE_VARIANT_CREDIT_COST}).`,
                );
            }
            tx.update(userRef, {
                credits: admin.firestore.FieldValue.increment(-SIZE_VARIANT_CREDIT_COST),
                lastActivity: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Mirror the pending variant into the parent doc's sizeVariants map so
            // a concurrent retry sees it (the in-flight idempotency-key reservation
            // is implicit in the deduction above). The pending status is replaced by
            // a terminal succeeded/failed status at the end of generation.
            const update = buildVariantUpdate(data, ctx, pendingVariant);
            tx.update(genRef, update);
        });
    } catch (chargeErr: unknown) {
        // Preserve intentional HttpsError throws (idempotency race guards
        // HttpsError('aborted') + HttpsError('already-exists'), plus the
        // pre-condition re-throws). Only convert UNEXPECTED errors or the
        // race-on-balance InsufficientCredits string into a typed HttpsError
        // (CodeRabbit review: preserve transaction idempotency error codes
        // instead of rewriting them).
        if (chargeErr instanceof HttpsError) {
            throw chargeErr;
        }
        const msg = chargeErr instanceof Error ? chargeErr.message : String(chargeErr);
        if (msg.includes("Insufficient credits at commit time")) {
            throw new HttpsError("resource-exhausted", msg);
        }
        throw new HttpsError("internal", `Credit deduction failed: ${msg}`);
    }

    // ── Build the inputs copy for the target aspect ratio ──
    // The build plan, approvedTov, and inputs are reused unchanged from the parent.
    // We override the aspect ratio on the inputs so generateFinalAd rebuilds the
    // layout contract for the TARGET ratio (per research.md R1).
    const variantInputs = {
        ...ctx.inputs,
        aspectRatio: data.targetAspectRatio,
    };

    setGeminiCaller(geminiCaller);
    setOpenAIKey(openaiApiKey);

    let succeeded = false;
    let url: string | null = null;
    let errorCode: string | undefined;
    let copyFidelityPasses = 0;
    const provider: "openai" | "gemini" = (deps.modelProvider ?? MODEL_PROVIDER) === "openai" ? "openai" : "gemini";

    try {
        const result = await generateFinalAd(
            ctx.buildPlan,
            ctx.approvedTov,
            variantInputs,
            ctx.inputs?.resolvedUniverse ?? parent.resolvedUniverse ?? "default",
            data.targetAspectRatio,
            undefined,        // editInstruction — NOT set (per FR-019a: variant is not a reflow)
            ref.image ?? undefined, // base64ToEdit — visual reference for the target canvas
            ref.image ?? undefined, // styleReference — same as base64ToEdit
        );
        copyFidelityPasses = 1;
        if (result.image) {
            try {
                url = await saveBase64ToStorage(result.image, `users/${callerId}/renders`);
            } catch (uploadErr: unknown) {
                console.warn("sizeVariant: storage upload failed (non-blocking):", uploadErr);
                url = null;
            }
            if (url) {
                succeeded = true;
            } else {
                errorCode = "storage_upload_failed";
            }
        } else {
            errorCode = (result as { errorCode?: string }).errorCode ?? "no_image_returned";
        }
    } catch (err: unknown) {
        errorCode = err instanceof Error ? err.message : String(err);
        console.error("sizeVariant generation failed:", err);
    }

    // ── Persist the terminal variant state + trace + credit reconciliation ──
    const traceEntry: SizeVariantTraceEntry = {
        ratio: data.targetAspectRatio,
        scope: data.scope,
        itemIndex: data.itemIndex,
        referenceSource: ref.source,
        provider,
        copyFidelityPasses,
        succeeded,
        errorCode: succeeded ? undefined : errorCode,
        charged: SIZE_VARIANT_CREDIT_COST,
        refunded: succeeded ? 0 : SIZE_VARIANT_CREDIT_COST,
        timestamp: Date.now(),
    };

    if (succeeded && url) {
        const successVariant: SizeVariant = {
            ratio: data.targetAspectRatio,
            status: "succeeded",
            url,
            referenceSource: ref.source,
            creditsCharged: SIZE_VARIANT_CREDIT_COST,
            idempotencyKey,
            updatedAt: Date.now(),
        };
        const update: Record<string, unknown> = buildVariantUpdate(data, ctx, successVariant);
        // Use dot-notation for nested updates — object replacement of resolutionTrace
        // would erase sibling properties (reflowHistory, brandColorReinforced, etc.)
        // that may have been set by other operations on this generation doc
        // (CodeRabbit review: destructive Firestore map replacements).
        update["resolutionTrace.sizeVariantTrace"] = admin.firestore.FieldValue.arrayUnion(traceEntry);
        update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await genRef.update(update);
        return { success: true, variant: successVariant, netCreditsCharged: SIZE_VARIANT_CREDIT_COST };
    }

    // Failure path: refund the 5 credits and persist the failed variant.
    const failedVariant: SizeVariant = {
        ratio: data.targetAspectRatio,
        status: "failed",
        url: null,
        referenceSource: ref.source,
        creditsCharged: 0,
        errorCode,
        idempotencyKey,
        updatedAt: Date.now(),
    };
    const update: Record<string, unknown> = buildVariantUpdate(data, ctx, failedVariant);
    // Use dot-notation for the trace update (CodeRabbit review: destructive
    // Firestore map replacements) — see the success-path comment above.
    update["resolutionTrace.sizeVariantTrace"] = admin.firestore.FieldValue.arrayUnion(traceEntry);
    update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await genRef.update(update);
    // Refund the credit owner.
    const refundOwnerUid = parent.creditOwnerUid ?? parent.userId ?? creditOwnerUid;
    const refundRef = db.collection("users").doc(refundOwnerUid);
    try {
        await refundRef.update({
            credits: admin.firestore.FieldValue.increment(SIZE_VARIANT_CREDIT_COST),
            lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (refundErr: unknown) {
        // Refund failure is logged but not thrown — the failed variant + trace are
        // already persisted, and a follow-up reconciliation pass can pick up the
        // dangling balance.
        console.warn(`sizeVariant: refund failed for ${refundOwnerUid}:`, refundErr);
    }
    return { success: false, variant: failedVariant, netCreditsCharged: 0 };
}

// ═══════════════════════════════════════════════════════════
// VARIANT PERSISTENCE — additive, no migration
// ═══════════════════════════════════════════════════════════

function buildVariantUpdate(
    data: GenerateSizeVariantRequest,
    _ctx: ReturnType<typeof readParentContext>,
    variant: SizeVariant,
): Record<string, unknown> {
    if (data.scope === "single") {
        // Use dot-notation to update only the specific ratio's entry in the
        // sizeVariants map — replacing the whole map would erase variants at
        // other aspect ratios (CodeRabbit review: destructive Firestore map
        // replacements). Matches the dot-notation pattern already used for
        // batch/carousel scopes below.
        const update: Record<string, unknown> = {
            [`sizeVariants.${variant.ratio}`]: variant,
        };
        if (variant.status === "succeeded" && variant.url) {
            // Mirror the variant into the existing mockupHistory for the single-image
            // happy path (FR-005: the single-image display reads mockupHistory).
            update.mockupHistory = admin.firestore.FieldValue.arrayUnion({
                url: variant.url,
                ratio: variant.ratio,
            });
        }
        return update;
    }
    if (data.scope === "batch" && typeof data.itemIndex === "number") {
        return {
            [`output.batchResults.${data.itemIndex}.sizeVariants.${variant.ratio}`]: variant,
        };
    }
    if (data.scope === "carousel" && typeof data.itemIndex === "number") {
        return {
            [`output.carouselSlides.${data.itemIndex}.sizeVariants.${variant.ratio}`]: variant,
        };
    }
    return {};
}
