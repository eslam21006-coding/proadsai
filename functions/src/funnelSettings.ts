// functions/src/funnelSettings.ts — Phase 14 Layer 1 callables
// ═══════════════════════════════════════════════════════════
// Implements `saveFunnelSettings` + `getFunnelSettings` + `dismissAdvisory`
// callables per `specs/phase-14/contracts/funnelSettings.md`. Persists
// FunnelSettings at
//   `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/settings`
// and recomputes `derived` + `advisories` server-side (never trust client
// economics — Constitution XI).
//
// All three callables are thin wrappers around the pure `cpaEconomics.ts`
// module + Firestore reads/writes. The economics module is side-effect
// free so this file owns IO.
//
// Monthly review cadence (spec FR-006): `reviewDueAt = lastReviewedAt +
// 30 days`. `getFunnelSettings` returns `reviewDue: now >= reviewDueAt`
// so the frontend can show the dismissible monthly-review prompt.
//
// 1:1 enforcement (FR-026) — the workspace's `metaConnection.accountId`
// must match the request's `accountId`. We look up the connection
// server-side (never trust client claim).
// ═══════════════════════════════════════════════════════════

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "firebase-functions/v2/https";
import {
    computeAdvisories,
    deriveAll,
    type FunnelInputs,
    type PaidFunnelInputs,
    type FreeWebinarInputs,
    type LeadMagnetCallInputs,
    type Advisories,
    type DerivedTargets,
    LOW_VALUE_THRESHOLD,
} from "./cpaEconomics.js";
import { getDb } from "./firestoreClient.js";

// Review cadence — 30 days. Spec FR-006.
export const REVIEW_CADENCE_MS = 30 * 24 * 60 * 60 * 1000;

// Settings doc shape — additive on top of the contract. Echoed in
// `getFunnelSettings` so the client can render every field.
export interface FunnelSettingsDoc {
    accountId: string;
    accountName?: string;
    funnelType: FunnelInputs["funnelType"];
    aov: number | null;
    hasHto: boolean;
    htoPrice: number;
    htoConversionRate: number;
    roasTarget: 1.0 | 0.65 | 0.5;
    offerPrice: number | null;
    attendanceRate: number | null;
    buyRateFromAttendees: number | null;
    leadToCloseRate: number | null;
    derived: DerivedTargets;
    advisories: Advisories;
    advisoriesDismissed: { noHto: boolean; lowValue: boolean };
    lastReviewedAt: number;
    reviewDueAt: number;
    createdAt: number;
    updatedAt: number;
    schemaVersion: 1;
}

// ─── Internal helpers ────────────────────────────────────────

async function loadMetaConnectionAccountId(
    uid: string,
    workspaceId: string,
): Promise<string | null> {
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("private").doc("metaConnection")
        .get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.metaConnected !== true) return null;
    return typeof data.accountId === "string" ? data.accountId : null;
}

function asNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function asRoas(v: unknown): 1.0 | 0.65 | 0.5 {
    if (v === 1.0 || v === 0.65 || v === 0.5) return v;
    if (v === "1.0" || v === 1) return 1.0;
    if (v === "0.65") return 0.65;
    if (v === "0.5" || v === 0.5) return 0.5;
    throw new Error(`saveFunnelSettings: roasTarget must be 1.0, 0.65, or 0.5; got ${v}`);
}

function asFunnelType(v: unknown): FunnelInputs["funnelType"] {
    if (v === "paid_event" || v === "paid_product" || v === "free_webinar" || v === "lead_magnet_call") return v;
    throw new Error(`saveFunnelSettings: funnelType must be one of paid_event|paid_product|free_webinar|lead_magnet_call; got ${v}`);
}

/**
 * Required-field validator per funnel type (contract §funnelSettings.md —
 * "missing/invalid numeric ⇒ invalid-argument"). Caller has already coerced
 * `funnelType`; we check the per-type required inputs against the raw
 * request payload (BEFORE coercion defaults them to 0). Number fields
 * typed `number | null` are accepted when set; `undefined`, `null`, or
 * missing-from-request all throw. We use this before coercion so the
 * zero-default doesn't silently swallow a missing field.
 *
 * Exported so the Layer 1 contract test
 * (`functions/src/__tests__/funnelSettings.contract.test.ts`) can import
 * the same validator instead of mirroring the rules — keeps production
 * and tests in lockstep (CodeRabbit audit 3524686397).
 */
export function assertRequiredFieldPresent(
    funnelType: FunnelInputs["funnelType"],
    fieldName: string,
    value: unknown,
): void {
    const isMissing = (v: unknown) => v === undefined || v === null;
    switch (funnelType) {
        case "paid_event":
        case "paid_product":
            if (
                fieldName === "aov"
                || fieldName === "roasTarget"
                || fieldName === "htoPrice"
                || fieldName === "htoConversionRate"
            ) {
                if (isMissing(value)) {
                    throw new Error(`${fieldName} is required for ${funnelType}`);
                }
            }
            return;
        case "free_webinar":
            if (fieldName === "offerPrice" || fieldName === "attendanceRate" || fieldName === "buyRateFromAttendees") {
                if (isMissing(value)) {
                    throw new Error(`${fieldName} is required for free_webinar`);
                }
            }
            return;
        case "lead_magnet_call":
            if (fieldName === "offerPrice" || fieldName === "leadToCloseRate") {
                if (isMissing(value)) {
                    throw new Error(`${fieldName} is required for lead_magnet_call`);
                }
            }
            return;
    }
}

function buildFunnelInputsFromDoc(d: Record<string, unknown>): FunnelInputs {
    const funnelType = asFunnelType(d.funnelType);
    switch (funnelType) {
        case "paid_event":
        case "paid_product": {
            const hasHto = d.hasHto === true;
            // Force htoPrice/htoConversionRate=0 when hasHto=false (contract).
            return {
                funnelType,
                aov: asNumberOrNull(d.aov) ?? 0,
                hasHto,
                htoPrice: hasHto ? (asNumberOrNull(d.htoPrice) ?? 0) : 0,
                htoConversionRate: hasHto ? (asNumberOrNull(d.htoConversionRate) ?? 0) : 0,
                roasTarget: asRoas(d.roasTarget),
            };
        }
        case "free_webinar":
            return {
                funnelType,
                offerPrice: asNumberOrNull(d.offerPrice) ?? 0,
                attendanceRate: asNumberOrNull(d.attendanceRate) ?? 0,
                buyRateFromAttendees: asNumberOrNull(d.buyRateFromAttendees) ?? 0,
            };
        case "lead_magnet_call":
            return {
                funnelType,
                offerPrice: asNumberOrNull(d.offerPrice) ?? 0,
                leadToCloseRate: asNumberOrNull(d.leadToCloseRate) ?? 0,
            };
    }
}

/**
 * Build a typed `FunnelInputs` from the SAVE request payload (NOT from a
 * stored doc — that's `buildFunnelInputsFromDoc`). Coerces / forces HTO=0
 * when hasHto=false. Pre-condition: callers MUST have validated required
 * inputs via `assertRequiredFieldPresent` BEFORE calling this — the
 * coercion here defaults missing fields to 0 and would otherwise swallow
 * the missing-field error.
 */
function buildFunnelInputs(req: SaveFunnelSettingsRequest): FunnelInputs {
    const funnelType = asFunnelType(req.funnelType);
    switch (funnelType) {
        case "paid_event":
        case "paid_product": {
            const hasHto = req.hasHto === true;
            return {
                funnelType,
                aov: asNumberOrNull(req.aov) ?? 0,
                hasHto,
                htoPrice: hasHto ? (asNumberOrNull(req.htoPrice) ?? 0) : 0,
                htoConversionRate: hasHto ? (asNumberOrNull(req.htoConversionRate) ?? 0) : 0,
                roasTarget: asRoas(req.roasTarget),
            } satisfies PaidFunnelInputs;
        }
        case "free_webinar":
            return {
                funnelType,
                offerPrice: asNumberOrNull(req.offerPrice) ?? 0,
                attendanceRate: asNumberOrNull(req.attendanceRate) ?? 0,
                buyRateFromAttendees: asNumberOrNull(req.buyRateFromAttendees) ?? 0,
            } satisfies FreeWebinarInputs;
        case "lead_magnet_call":
            return {
                funnelType,
                offerPrice: asNumberOrNull(req.offerPrice) ?? 0,
                leadToCloseRate: asNumberOrNull(req.leadToCloseRate) ?? 0,
            } satisfies LeadMagnetCallInputs;
    }
}

// ─── saveFunnelSettings ──────────────────────────────────────

interface SaveFunnelSettingsRequest {
    workspaceId: string;
    accountId: string;
    funnelType: FunnelInputs["funnelType"];
    // Paid
    aov?: number | null;
    hasHto?: boolean;
    htoPrice?: number;
    htoConversionRate?: number;
    roasTarget?: 1.0 | 0.65 | 0.5;
    // Free
    offerPrice?: number | null;
    attendanceRate?: number | null;
    buyRateFromAttendees?: number | null;
    leadToCloseRate?: number | null;
    clientNowMs: number;
}

export const saveFunnelSettings = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const callerUid = request.auth.uid;
        const req = request.data as SaveFunnelSettingsRequest;

        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }
        if (typeof req.clientNowMs !== "number" || !Number.isFinite(req.clientNowMs)) {
            throw new HttpsError("invalid-argument", "clientNowMs is required (number).");
        }

        // 1:1 enforcement — workspace's connected Meta account must match.
        const connAccountId = await loadMetaConnectionAccountId(callerUid, req.workspaceId);
        if (!connAccountId) {
            throw new HttpsError("permission-denied", "No Meta account connected for this workspace.");
        }
        if (connAccountId !== req.accountId) {
            throw new HttpsError("permission-denied", "accountId does not match the workspace's connected Meta account.");
        }

        // Build the typed FunnelInputs from the coerced request. Wrapped in a
        // single try/catch so every failure surface as `invalid-argument`
        // per the contract — required-input validation, type coercion, and
        // derivation errors all share one error path.
        // Required-field validation + derivation, all wrapped so every
        // failure surfaces as `invalid-argument` per the contract.
        let inputs: FunnelInputs;
        try {
            // Required-input validation BEFORE coercion (coercion defaults to
            // 0 and would silently swallow a missing field). Only funnel-
            // type-relevant fields are required; irrelevant fields are
            // ignored.
            assertRequiredFieldPresent(req.funnelType, "aov", req.aov);
            assertRequiredFieldPresent(req.funnelType, "roasTarget", req.roasTarget);
            // When the user opts into HTO, BOTH HTO fields are required —
            // buildFunnelInputs would otherwise default them to 0 and the
            // server would silently treat the ad as having no HTO at all.
            if (req.hasHto === true) {
                assertRequiredFieldPresent(req.funnelType, "htoPrice", req.htoPrice);
                assertRequiredFieldPresent(req.funnelType, "htoConversionRate", req.htoConversionRate);
            }
            assertRequiredFieldPresent(req.funnelType, "offerPrice", req.offerPrice);
            assertRequiredFieldPresent(req.funnelType, "attendanceRate", req.attendanceRate);
            assertRequiredFieldPresent(req.funnelType, "buyRateFromAttendees", req.buyRateFromAttendees);
            assertRequiredFieldPresent(req.funnelType, "leadToCloseRate", req.leadToCloseRate);

            inputs = buildFunnelInputs(req);
            // Sanity-check the coerced inputs against the derivation engine.
            deriveAll(inputs, req.clientNowMs);
            computeAdvisories(inputs);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new HttpsError("invalid-argument", msg);
        }

        // Recompute derived + advisories server-side (post-validation).
        const derived = deriveAll(inputs, req.clientNowMs);
        const advisories = computeAdvisories(inputs);

        // Persist atomically so a concurrent `dismissAdvisory` write cannot
        // be clobbered by our read-then-overwrite. We snapshot the existing
        // doc inside the transaction and preserve `advisoriesDismissed` +
        // `createdAt` from that snapshot.
        const settingsRef = getDb()
            .collection("users").doc(callerUid)
            .collection("workspaces").doc(req.workspaceId)
            .collection("adAccounts").doc(req.accountId)
            .collection("settings").doc("current");

        const next: FunnelSettingsDoc = await getDb().runTransaction(async (tx) => {
            const snap = await tx.get(settingsRef);
            const prevDismissed = (snap.get("advisoriesDismissed") || {}) as { noHto?: boolean; lowValue?: boolean };
            const doc: FunnelSettingsDoc = {
                accountId: req.accountId,
                funnelType: inputs.funnelType,
                aov: inputs.funnelType === "paid_event" || inputs.funnelType === "paid_product" ? inputs.aov : null,
                hasHto: inputs.funnelType === "paid_event" || inputs.funnelType === "paid_product" ? inputs.hasHto : false,
                htoPrice: inputs.funnelType === "paid_event" || inputs.funnelType === "paid_product" ? inputs.htoPrice : 0,
                htoConversionRate: inputs.funnelType === "paid_event" || inputs.funnelType === "paid_product" ? inputs.htoConversionRate : 0,
                roasTarget: inputs.funnelType === "paid_event" || inputs.funnelType === "paid_product" ? inputs.roasTarget : 1.0,
                offerPrice: inputs.funnelType === "free_webinar" || inputs.funnelType === "lead_magnet_call" ? inputs.offerPrice : null,
                attendanceRate: inputs.funnelType === "free_webinar" ? inputs.attendanceRate : null,
                buyRateFromAttendees: inputs.funnelType === "free_webinar" ? inputs.buyRateFromAttendees : null,
                leadToCloseRate: inputs.funnelType === "lead_magnet_call" ? inputs.leadToCloseRate : null,
                derived,
                advisories,
                advisoriesDismissed: {
                    noHto: prevDismissed.noHto === true,
                    lowValue: prevDismissed.lowValue === true,
                },
                lastReviewedAt: req.clientNowMs,
                reviewDueAt: req.clientNowMs + REVIEW_CADENCE_MS,
                createdAt: snap.get("createdAt") || req.clientNowMs,
                updatedAt: req.clientNowMs,
                schemaVersion: 1,
            };
            tx.set(settingsRef, doc, { merge: false });
            return doc;
        });

        // Build the optional warning object per contract.
        const warning = derived.paid?.capApplied
            ? {
                code: "CPA_CAP_APPLIED" as const,
                messageAr: `تم تطبيق سقف التكلفة — التكلفة المستهدفة ${derived.paid.rawTargetCpa} دولار تم تخفيضها إلى ${derived.paid.maxCpa} دولار.`,
                rawTargetCpa: derived.paid.rawTargetCpa,
                cappedTo: derived.paid.maxCpa,
            }
            : undefined;

        return {
            ok: true as const,
            derived,
            advisories,
            reviewDueAt: next.reviewDueAt,
            warning,
        };
    },
);

// ─── getFunnelSettings ───────────────────────────────────────

interface GetFunnelSettingsRequest {
    workspaceId: string;
    accountId: string;
}

export const getFunnelSettings = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const callerUid = request.auth.uid;
        const req = request.data as GetFunnelSettingsRequest;

        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }

        const connAccountId = await loadMetaConnectionAccountId(callerUid, req.workspaceId);
        if (connAccountId && connAccountId !== req.accountId) {
            throw new HttpsError("permission-denied", "accountId does not match the workspace's connected Meta account.");
        }

        const snap = await getDb()
            .collection("users").doc(callerUid)
            .collection("workspaces").doc(req.workspaceId)
            .collection("adAccounts").doc(req.accountId)
            .collection("settings").doc("current")
            .get();

        if (!snap.exists) {
            return { ok: true as const, settings: null, reviewDue: false };
        }

        const doc = snap.data() as Record<string, unknown>;
        const reviewDueAt = Number(doc.reviewDueAt) || 0;
        const reviewDue = Date.now() >= reviewDueAt;

        return {
            ok: true as const,
            settings: doc as unknown as FunnelSettingsDoc,
            reviewDue,
        };
    },
);

// ─── dismissAdvisory ─────────────────────────────────────────

interface DismissAdvisoryRequest {
    workspaceId: string;
    accountId: string;
    /** "noHto" | "lowValue" */
    advisoryKey: "noHto" | "lowValue";
    /** Pass `false` to clear a dismissal (e.g. user re-edits settings and the condition no longer holds). */
    dismissed: boolean;
}

export const dismissAdvisory = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const callerUid = request.auth.uid;
        const req = request.data as DismissAdvisoryRequest;

        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }
        if (req.advisoryKey !== "noHto" && req.advisoryKey !== "lowValue") {
            throw new HttpsError("invalid-argument", "advisoryKey must be 'noHto' or 'lowValue'.");
        }
        if (typeof req.dismissed !== "boolean") {
            throw new HttpsError("invalid-argument", "dismissed must be a boolean.");
        }

        const connAccountId = await loadMetaConnectionAccountId(callerUid, req.workspaceId);
        if (!connAccountId || connAccountId !== req.accountId) {
            throw new HttpsError("permission-denied", "accountId does not match the workspace's connected Meta account.");
        }

        const settingsRef = getDb()
            .collection("users").doc(callerUid)
            .collection("workspaces").doc(req.workspaceId)
            .collection("adAccounts").doc(req.accountId)
            .collection("settings").doc("current");

        await settingsRef.set(
            {
                advisoriesDismissed: { [req.advisoryKey]: req.dismissed },
                updatedAt: Date.now(),
            },
            { merge: true },
        );

        return { ok: true as const };
    },
);