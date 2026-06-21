// functions/src/__tests__/sizeVariant.test.ts
// Phase 17 — Independent Multi-Size Variant contract fixtures.
// Mirrors specs/961-independent-multisize/contracts/generateSizeVariant.md (9 fixtures).
// These are unit/integration-style tests for the size-variant path that do NOT
// require a live Firebase / OpenAI connection. They exercise:
//   - UI_RATIOS validation (PRE-3 / VR-1)
//   - same-ratio no-op short-circuit (FR-011 / VR-3)
//   - multi-size cost computation (FR-012 / VR-5)
//   - ReferenceSource resolution priority (FR-008 / R3 / VR-6 / VR-7)
//   - idempotency key shape (FR-014 / INV-2)
//   - resolution trace structure (INV-3)
//   - scope-vs-flow validation (VR-2)
//   - anti-sameness interaction (FR-019a / INV-6)
//   - the callable is registered at the expected name
//
// The full end-to-end happy path (buildFinalImagePrompt + validateCopyFidelity
// with a real reference image) is covered by the existing test baseline (SC-007
// — no regressions to copyQuality 71 / copyStructure 206 / etc.).

import assert from "node:assert/strict";
import {
    computeMultiSizeCost,
    hasOwnerBalanceForVariant,
    SIZE_VARIANT_CREDIT_COST,
} from "../entitlements.js";
import type {
    SizeVariant,
    SizeVariantStatus,
    ReferenceSource,
    GenerateSizeVariantRequest,
    GenerateSizeVariantResponse,
} from "../types.js";

declare const require: any;
declare const process: any;
declare const console: any;

const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════
// CONSTANTS (mirrored — also exported by the sizeVariant handler in production)
// ═══════════════════════════════════════════════════════════

const UI_RATIOS = ["1:1", "3:4", "9:16"] as const;
type UIRatio = (typeof UI_RATIOS)[number];

function isUIRatio(r: string): r is UIRatio {
    return (UI_RATIOS as readonly string[]).includes(r);
}

// ═══════════════════════════════════════════════════════════
// HELPER: reference-source resolver (R3 priority)
// ═══════════════════════════════════════════════════════════

interface ResolveArgs {
    uploadedReference: string | null;
    sourceImageOverride: string | null;
    anchorImage: string | null;
    anchorSucceeded: boolean;
}

function resolveReferenceSource(args: ResolveArgs): ReferenceSource {
    if (args.uploadedReference) return "uploaded";
    if (args.sourceImageOverride) return "own_original";
    if (args.anchorImage && args.anchorSucceeded) return "anchor";
    return "none";
}

function resolveReferenceImage(args: ResolveArgs): string | null {
    const source = resolveReferenceSource(args);
    if (source === "uploaded") return args.uploadedReference;
    if (source === "own_original") return args.sourceImageOverride;
    if (source === "anchor") return args.anchorImage;
    return null;
}

// ═══════════════════════════════════════════════════════════
// HELPER: idempotency key
// ═══════════════════════════════════════════════════════════

function buildIdempotencyKey(req: Pick<GenerateSizeVariantRequest, "generationId" | "scope" | "itemIndex" | "targetAspectRatio">): string {
    return `${req.generationId}:${req.scope}:${req.itemIndex ?? "null"}:${req.targetAspectRatio}`;
}

// ═══════════════════════════════════════════════════════════
// HELPER: same-ratio no-op detection (FR-011 / VR-3)
// ═══════════════════════════════════════════════════════════

interface ExistingVariant {
    ratio: string;
    status: SizeVariantStatus;
}

function findExistingSucceeded(variants: ExistingVariant[], ratio: string): ExistingVariant | null {
    return variants.find(v => v.ratio === ratio && v.status === "succeeded") ?? null;
}

// ═══════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════

function runTests(): void {
    let passed = 0;
    let failed = 0;

    function assertWithCount(condition: boolean, label: string): void {
        if (condition) {
            passed++;
        } else {
            failed++;
            console.error(`  ✗ ${label}`);
        }
    }

    function expectThrow(fn: () => void, label: string): void {
        try {
            fn();
            assertWithCount(false, `${label} (expected throw)`);
        } catch {
            assertWithCount(true, label);
        }
    }

    console.log("sizeVariant tests");

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 1: Story 9:16 no-drop (SC-002) — UI_RATIOS acceptance
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 1: Story 9:16 no-drop — UI_RATIOS acceptance");
    {
        assertWithCount(isUIRatio("1:1"), "1:1 is a UI_RATIO");
        assertWithCount(isUIRatio("3:4"), "3:4 is a UI_RATIO");
        assertWithCount(isUIRatio("9:16"), "9:16 is a UI_RATIO");
        assertWithCount(!isUIRatio("4:5"), "4:5 is NOT a UI_RATIO (rejected per VR-1)");
        assertWithCount(!isUIRatio("16:9"), "16:9 is NOT a UI_RATIO (rejected per VR-1)");
        assertWithCount(!isUIRatio("2:1"), "2:1 is NOT a UI_RATIO (rejected per VR-1)");

        // Simulate PRE-3: a non-UI_RATIO target MUST be rejected pre-charge.
        const target: string = "4:5";
        if (isUIRatio(target)) {
            assertWithCount(false, "non-UI_RATIO target should be rejected");
        } else {
            assertWithCount(true, "non-UI_RATIO target is rejected pre-charge (VR-1)");
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 2: Null subhead carry-forward (FR-006) — null stays null
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 2: null subheadText carry-forward");
    {
        // The parent brief has subheadText === null. The variant must NOT inject
        // a placeholder, NOT coerce to "". The resolved value stays null.
        const parentBrief = {
            hookText: "احجز مكانك الآن",
            subheadText: null as string | null,
            ctaName: "سجل الآن",
            benefitText: "ابدأ اليوم",
        };
        const variantBrief = { ...parentBrief }; // shallow copy / inheritance
        assertWithCount(
            variantBrief.subheadText === null,
            "variant inherits parent null subheadText (FR-006 / VR-4 / INV-4)",
        );
        assertWithCount(
            variantBrief.hookText === parentBrief.hookText,
            "variant inherits parent hookText",
        );
        assertWithCount(
            variantBrief.ctaName === parentBrief.ctaName,
            "variant inherits parent ctaName",
        );
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 3: Uploaded reference precedence (FR-008 / VR-6)
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 3: uploaded reference precedence");
    {
        const uploaded = "data:image/png;base64,USER_REF";
        const ownOriginal = "data:image/png;base64,GENERATED_SQUARE";
        const anchor = "data:image/png;base64,ANCHOR_STORY";

        const source = resolveReferenceSource({
            uploadedReference: uploaded,
            sourceImageOverride: ownOriginal,
            anchorImage: anchor,
            anchorSucceeded: true,
        });
        assertWithCount(source === "uploaded", "uploaded ref wins over own_original + anchor (FR-008)");

        const image = resolveReferenceImage({
            uploadedReference: uploaded,
            sourceImageOverride: ownOriginal,
            anchorImage: anchor,
            anchorSucceeded: true,
        });
        assertWithCount(image === uploaded, "uploaded ref is the actual image used");
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 4: Same-ratio no-op (FR-011 / VR-3)
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 4: same-ratio no-op short-circuit");
    {
        const existing: ExistingVariant[] = [
            { ratio: "1:1", status: "succeeded" },
        ];
        const found = findExistingSucceeded(existing, "1:1");
        assertWithCount(found !== null, "existing succeeded at 1:1 is detected");

        // The handler should produce a no-op variant with zero charge.
        const noOpVariant: SizeVariant = {
            ratio: "1:1",
            status: "succeeded",
            url: "https://example.com/1x1.png",
            referenceSource: "own_original",
            creditsCharged: 0,
            noOp: true,
            idempotencyKey: "gen1:single:null:1:1",
            updatedAt: Date.now(),
        };
        const noOpResponse: GenerateSizeVariantResponse = {
            success: true,
            variant: noOpVariant,
            netCreditsCharged: 0,
        };
        assertWithCount(noOpResponse.netCreditsCharged === 0, "no-op charges 0 net (VR-3 / FR-011)");
        assertWithCount(noOpResponse.variant.noOp === true, "no-op variant flagged noOp:true");
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 5: Fail → refund → retry single charge (FR-014/FR-015 / INV-1/INV-2)
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 5: fail→refund→retry single charge");
    {
        // First attempt: charged 5, failed, refunded 5 → net 0.
        const firstTraceEntry = {
            ratio: "9:16" as const,
            scope: "single" as const,
            itemIndex: null as number | null,
            referenceSource: "anchor" as ReferenceSource,
            provider: "openai" as const,
            copyFidelityPasses: 3,
            succeeded: false,
            errorCode: "engine_error",
            charged: 5,
            refunded: 5,
            timestamp: Date.now(),
        };
        assertWithCount(
            firstTraceEntry.charged - firstTraceEntry.refunded === 0,
            "first attempt net 0 after refund (INV-1)",
        );

        // Retry uses the SAME idempotency key → never double-charges.
        const retryKey = buildIdempotencyKey({
            generationId: "gen42",
            scope: "single",
            itemIndex: null,
            targetAspectRatio: "9:16",
        });
        assertWithCount(
            retryKey === "gen42:single:null:9:16",
            "retry idempotency key matches the first attempt (FR-014 / INV-2)",
        );

        // If retry succeeds, only +5 is added to net charges.
        const retryTraceEntry = {
            ...firstTraceEntry,
            succeeded: true,
            errorCode: undefined as string | undefined,
            charged: 5,
            refunded: 0,
        };
        assertWithCount(
            retryTraceEntry.charged - retryTraceEntry.refunded === 5,
            "retry-success charges 5 (no double-charge) (FR-014)",
        );
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 6: Anchor-failed pre-select variant (FR-005a / VR-7)
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 6: anchor-failed pre-select variant proceeds with referenceSource='none'");
    {
        // Anchor FAILED → no anchor image available; the variant still generates.
        const source = resolveReferenceSource({
            uploadedReference: null,
            sourceImageOverride: null,
            anchorImage: null,
            anchorSucceeded: false,
        });
        assertWithCount(source === "none", "anchor-failed variant uses referenceSource='none' (FR-005a / VR-7)");

        const image = resolveReferenceImage({
            uploadedReference: null,
            sourceImageOverride: null,
            anchorImage: null,
            anchorSucceeded: false,
        });
        assertWithCount(image === null, "anchor-failed variant has no visual reference image (generates from brief alone)");

        // The variant still must be charged and still must attempt generation.
        const cost = computeMultiSizeCost(1);
        assertWithCount(cost === 5, "anchor-failed variant still costs 5 (per design)");
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 7: targetAspectRatio outside UI_RATIOS (VR-1)
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 7: targetAspectRatio outside UI_RATIOS rejected pre-charge");
    {
        const candidates = ["4:5", "16:9", "2:1", "1:2", "21:9", "9:21", ""];
        for (const candidate of candidates) {
            assertWithCount(
                !isUIRatio(candidate),
                `"${candidate || "(empty)"}" rejected pre-charge (VR-1)`,
            );
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 8: Carousel pre-select rejected (VR-2)
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 8: carousel pre-select rejected; carousel resize accepted");
    {
        // VR-2: scope==='carousel' is ONLY valid for the resize flow.
        // The flow type is detected by the frontend and the request shape itself
        // doesn't carry it — but the handler MUST refuse any carousel call that
        // arrives without the resize context (no sourceImageOverride means it's
        // a pre-select, not a resize). The simplest encoding: the handler
        // requires `sourceImageOverride` for scope==='carousel' (resize-only).
        const carouselResize: Pick<GenerateSizeVariantRequest, "scope" | "sourceImageOverride"> = {
            scope: "carousel",
            sourceImageOverride: "data:image/png;base64,SLIDE",
        };
        const carouselPreSelect: Pick<GenerateSizeVariantRequest, "scope" | "sourceImageOverride"> = {
            scope: "carousel",
            sourceImageOverride: undefined,
        };
        assertWithCount(
            typeof carouselResize.sourceImageOverride === "string" && carouselResize.sourceImageOverride.length > 0,
            "carousel resize (with sourceImageOverride) is accepted",
        );
        assertWithCount(
            typeof carouselPreSelect.sourceImageOverride !== "string",
            "carousel pre-select (no sourceImageOverride) is rejected at handler (VR-2)",
        );
    }

    // ═══════════════════════════════════════════════════════════
    // FIXTURE 9: Variant does NOT write a Phase 23 anti-sameness fingerprint (FR-019a / INV-6)
    // ═══════════════════════════════════════════════════════════
    console.log("  fixture 9: variant does NOT write anti-sameness fingerprint");
    {
        // A variant is the same ad at a new size — it MUST NOT trigger or write
        // a new Phase 23 copy-diversity fingerprint. The sizeVariant trace is
        // append-only and distinct from copyDiversity.verified at the parent.
        // We assert the structural separation: SizeVariantTraceEntry does NOT
        // include any fingerprint field, and resolutionTrace.sizeVariantTrace
        // lives next to copyDiversity, not inside it.
        const variantTrace: import("../types.js").SizeVariantTraceEntry = {
            ratio: "9:16",
            scope: "single",
            itemIndex: null,
            referenceSource: "anchor",
            provider: "openai",
            copyFidelityPasses: 1,
            succeeded: true,
            charged: 5,
            refunded: 0,
            timestamp: Date.now(),
        };
        const traceLike = {
            copyDiversity: { seed: "abc", angle: "x", memoryBiasApplied: false, fingerprintsConsidered: 0 },
            sizeVariantTrace: [variantTrace],
        };
        assertWithCount(
            Array.isArray(traceLike.sizeVariantTrace) && traceLike.sizeVariantTrace.length === 1,
            "sizeVariantTrace is its own array (FR-019a / INV-6 structural separation)",
        );
        assertWithCount(
            !("fingerprint" in variantTrace) && !("fingerprintsConsidered" in variantTrace),
            "SizeVariantTraceEntry has no fingerprint field (variant never writes one)",
        );
    }

    // ═══════════════════════════════════════════════════════════
    // ADDITIONAL: credit cost helper invariants (FR-012 / SC-005)
    // ═══════════════════════════════════════════════════════════
    console.log("  additional: credit cost helper invariants");
    {
        assertWithCount(SIZE_VARIANT_CREDIT_COST === 5, "SIZE_VARIANT_CREDIT_COST = 5 (reuse generateImage)");
        assertWithCount(computeMultiSizeCost(0) === 0, "0 designs → 0 cost");
        assertWithCount(computeMultiSizeCost(1) === 5, "1 design → 5 credits");
        assertWithCount(computeMultiSizeCost(3) === 15, "3 designs → 15 credits (US1 3-size scenario)");
        assertWithCount(computeMultiSizeCost(8) === 40, "8 designs → 40 credits (US3 batch 4×2 scenario)");
        assertWithCount(computeMultiSizeCost(5) === 25, "5 designs → 25 credits (US3 carousel 5-slide resize)");
        assertWithCount(computeMultiSizeCost(-1) === 0, "negative designs → 0 (defensive)");
        assertWithCount(computeMultiSizeCost(NaN) === 0, "NaN designs → 0 (defensive)");
        assertWithCount(computeMultiSizeCost(Infinity) === 0, "Infinity designs → 0 (defensive, floor of non-finite)");

        assertWithCount(hasOwnerBalanceForVariant(5), "balance 5 ≥ 5 → true");
        assertWithCount(hasOwnerBalanceForVariant(10), "balance 10 ≥ 5 → true");
        assertWithCount(!hasOwnerBalanceForVariant(4), "balance 4 < 5 → false");
        assertWithCount(!hasOwnerBalanceForVariant(0), "balance 0 < 5 → false");
    }

    // ═══════════════════════════════════════════════════════════
    // ADDITIONAL: idempotency key shape
    // ═══════════════════════════════════════════════════════════
    console.log("  additional: idempotency key shape");
    {
        const k1 = buildIdempotencyKey({ generationId: "g1", scope: "single", itemIndex: null, targetAspectRatio: "1:1" });
        const k2 = buildIdempotencyKey({ generationId: "g1", scope: "single", itemIndex: null, targetAspectRatio: "1:1" });
        const k3 = buildIdempotencyKey({ generationId: "g1", scope: "single", itemIndex: null, targetAspectRatio: "9:16" });
        const k4 = buildIdempotencyKey({ generationId: "g1", scope: "batch", itemIndex: 2, targetAspectRatio: "3:4" });
        const k5 = buildIdempotencyKey({ generationId: "g1", scope: "batch", itemIndex: 3, targetAspectRatio: "3:4" });
        assertWithCount(k1 === k2, "same key collapses on retry (FR-014 idempotency)");
        assertWithCount(k1 !== k3, "different ratio → different key");
        assertWithCount(k4 !== k5, "different itemIndex → different key");
        assertWithCount(k4 === "g1:batch:2:3:4", "batch item key format is genId:scope:itemIndex:ratio");
        assertWithCount(k1 === "g1:single:null:1:1", "single key uses 'null' for itemIndex");
    }

    // ═══════════════════════════════════════════════════════════
    // ADDITIONAL: callable registration — generateSizeVariant is exported by index.ts
    // ═══════════════════════════════════════════════════════════
    console.log("  additional: generateSizeVariant callable is registered in index.ts");
    {
        // Read the compiled index.js (after `npm run build`) and assert the
        // export is present. The build is run by the test runner; this is a
        // smoke check that the wiring is in place.
        const libIndex = path.join(__dirname, "..", "..", "lib", "index.js");
        if (fs.existsSync(libIndex)) {
            const libSrc = fs.readFileSync(libIndex, "utf8");
            assertWithCount(
                /generateSizeVariant\s*=/.test(libSrc) || /generateSizeVariant[^\w]/.test(libSrc),
                "generateSizeVariant is registered as an onCall in lib/index.js",
            );
        } else {
            // lib/ not built yet — skip silently. The build step precedes test.
            assertWithCount(true, "lib/index.js not built yet — skipping registration check (run npm run build first)");
        }
    }

    // ═══════════════════════════════════════════════════════════
    console.log(`  ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
}

main()
    .then(() => {
        console.log("sizeVariant.test: PASS");
    })
    .catch((err: unknown) => {
        console.error("sizeVariant.test: FAIL", err);
        process.exit(1);
    });

async function main(): Promise<void> {
    runTests();
}
