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
// 1:1 enforcement (FR-026) — the workspace's `metaAdAccountId`
// must match the request's `accountId`. We look up the link
// server-side (never trust client claim).
//
// Phase 14 batch 01-funnel-fixes — `loadMetaConnectionAccountId` previously
// read `users/{uid}/workspaces/{workspaceId}/private/metaConnection` (a
// separate subdoc that was never written). The actual link lives on the
// workspace document itself — `linkMetaAccountToWorkspace` writes
// `metaAdAccountId` directly via `wsSnap.ref.update({...})`. The mismatch
// caused every save to throw `permission-denied: "No Meta account
// connected for this workspace."` even after a successful link. The
// helper now reads from the workspace doc, matching the writer.
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
    type MarginKept,
    DEFAULT_COMMISSION_RATE,
    DEFAULT_MARGIN_KEPT,
    DEFAULT_PAID_EVENT_ROAS_TARGET,
} from "./cpaEconomics.js";
import { getDb } from "./firestoreClient.js";
import {
  resolveMetaScope,
  assertWorkspaceAllowed,
} from "./workspaces/metaCallerScope.js";

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
    /**
     * Phase 968 — Item D (Phase 7 carry-over, Phase 9 close-out) +
     * Phase 11 production-bug fix: this field is DEAD at read time on
     * every funnel type as of Phase 11. `paid_event` stopped reading
     * it in Phase 7 Item C (the corrected formula reads
     * `eventAttendanceRate × eventCloseRate` instead — FR-011..FR-014).
     * `paid_product` stopped reading it in Phase 11 (the corrected
     * formula reads `bookingRate × showUpRate × leadToCloseRate` — the
     * chain, the same way lead_magnet_call replaced free_webinar's
     * single close rate with explicit stages). The field is retained
     * on every doc for additive storage compatibility (data-model.md
     * §1) and may carry `null` when the record is brand-new or when
     * the owner never set the legacy upsell-conversion rate. Storage
     * retention preserves null verbatim across saves — see
     * `resolveHtoConversionRateForStorage`.
     */
    htoConversionRate: number | null;
    /**
     * Phase 968 — T045 (US3). paid_event only. Event-attendance rate
     * (percent, 0–100). The corrected formula reads
     * `eventAttendanceRate × eventCloseRate` on the HTO term (FR-011..FR-014).
     * Required for `paid_event` completeness when `hasHto === true`.
     * Round-12 (CodeRabbit round 12 Items 3+5): this field was missing
     * from the doc shape AND was never written by `saveFunnelSettings`,
     * so a reloaded paid_event record lost both rates and was reported
     * as incomplete. Persisted on `paid_event` only — `0` on every
     * other funnel type for the additive-storage compatibility of the
     * legacy fields.
     */
    eventAttendanceRate: number;
    /**
     * Phase 968 — T045 (US3). paid_event only. Event-close rate
     * (percent, 0–100). See `eventAttendanceRate` above.
     */
    eventCloseRate: number;
    roasTarget: 1.0 | 0.65 | 0.5;
    offerPrice: number | null;
    attendanceRate: number | null;
    buyRateFromAttendees: number | null;
    leadToCloseRate: number | null;
    /**
     * Phase 968 — T022. `lead_magnet_call` only. Lead → booked call
     * (percent, 0–100). data-model.md §1. Required for `lead_magnet_call`
     * completeness (FR-039). Stored as `null` on non-lead-magnet-call
     * docs.
     */
    bookingRate: number | null;
    /**
     * Phase 968 — T022. `lead_magnet_call` only. Booked → attended
     * (percent, 0–100). Required for `lead_magnet_call` completeness.
     * Stored as `null` on non-lead-magnet-call docs.
     */
    showUpRate: number | null;
    /**
     * Phase 12 — `paid_product` only. SCOPED to paid_product to keep
     * buyer-side rates separate from lead-side rates. Phase 11
     * overloaded the `bookingRate` / `showUpRate` / `leadToCloseRate`
     * slots with `paid_product` — same field name, different
     * denominator (paying-customer bookings vs free-lead bookings
     * differ by roughly an order of magnitude). Any consumer that
     * reads these fields without carrying `funnelType` alongside
     * would silently average incompatible rates; the deferred epoch
     * work and the learning aggregates both read this document.
     * The `product*` prefix mirrors the `event*` prefix already used
     * by `paid_event` — the codebase's existing convention for
     * funnel-scoped chain fields. Required for `paid_product +
     * hasHto` completeness (FR-039). Stored as `null` on every other
     * funnel type.
     */
    productBookingRate: number | null;
    /**
     * Phase 12 — `paid_product` only. Booked calls that happen
     * (percent, 0–100). See `productBookingRate` for the rationale.
     * Required for `paid_product + hasHto` completeness.
     */
    productShowUpRate: number | null;
    /**
     * Phase 12 — `paid_product` only. Attended calls that buy the
     * high-ticket offer (percent, 0–100). See `productBookingRate`
     * for the rationale. Required for `paid_product + hasHto`
     * completeness.
     */
    productCloseRate: number | null;
    /**
     * Phase 968 — T027. Sales commission (percent, 0–100, FR-027). Required
     * for completeness on every funnel type (data-model.md §3, FR-023).
     * 10 is the new-record default (DEFAULT_COMMISSION_RATE).
     */
    commissionRate: number | null;
    /**
     * Phase 968 — T027. Retained margin (closed enum 50 | 60 | 70,
     * FR-026). Required for completeness on every funnel type
     * (data-model.md §3, FR-024). 60 is the new-record default
     * (DEFAULT_MARGIN_KEPT).
     */
    marginKept: 50 | 60 | 70 | null;
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
    // Read from the workspace document itself — that's where
    // `linkMetaAccountToWorkspace` writes the link via
    // `wsSnap.ref.update({ metaAdAccountId, ... })`. The previous
    // implementation read a separate `private/metaConnection` subdoc that
    // was never written by the linker, so every save failed with
    // "No Meta account connected for this workspace."
    //
    // CR-MAJOR (CodeRabbit review feedback): also reject soft-deleted
    // workspaces here. A doc that retains `metaAdAccountId` after
    // `deletedAt` is set must NOT count as a connected workspace —
    // otherwise `getFunnelSettings` returns the stale settings of a
    // deleted workspace and `saveFunnelSettings` / `dismissAdvisory`
    // write below a deleted marker.
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.deletedAt != null) return null;
    return typeof data.metaAdAccountId === "string" && data.metaAdAccountId.length > 0
        ? data.metaAdAccountId
        : null;
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
 * Non-throwing variant of `asFunnelType`. Returns the literal type
 * value when it matches, or `null` when the input is missing or
 * unrecognized.
 *
 * Round-12 (CodeRabbit round 12 Items 7+8): `missingRequiredFields` calls
 * `asFunnelType(doc.funnelType)` indirectly via the doc-construction
 * path, and the call sites in `getFunnelSettings` (line 711) and
 * `metaSync/shared.ts` (line 615) feed it raw Firestore data. A legacy or
 * partially-written doc with `funnelType: null` or a value outside the
 * four literals would throw at the predicate — turning `getFunnelSettings`
 * into an exception (no response at all) and adding "load funnel settings
 * failed" to the sync error log. The root-cause fix treats an unknown
 * funnelType as `incomplete` rather than letting the throw escape.
 */
function asFunnelTypeOrNull(v: unknown): FunnelInputs["funnelType"] | null {
    if (v === "paid_event" || v === "paid_product" || v === "free_webinar" || v === "lead_magnet_call") return v;
    return null;
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
            // FR-011..FR-014 — paid_event reads `eventAttendanceRate` and
            // `eventCloseRate`, NOT `htoConversionRate`. The latter is
            // retained on paid_event for additive storage compatibility
            // (data-model.md §1, §3) but is NOT part of the completeness
            // rule — requiring it would force owners to fill a field
            // that changes nothing. The attention badge would stay lit
            // until they do, even though their record is otherwise
            // complete (FR-039, FR-049). See Item A decision in
            // batch-05-report.md.
            if (
                fieldName === "aov"
                || fieldName === "roasTarget"
                || fieldName === "htoPrice"
                || fieldName === "eventAttendanceRate"
                || fieldName === "eventCloseRate"
                || fieldName === "commissionRate"
                || fieldName === "marginKept"
            ) {
                if (isMissing(value)) {
                    throw new Error(`${fieldName} is required for ${funnelType}`);
                }
            }
            return;
case "paid_product":
            // Phase 11 + Phase 12 — paid_product no longer reads
            // `htoConversionRate`. The chain
            // (productBookingRate × productShowUpRate × productCloseRate)
            // replaces it (Phase 11) and uses dedicated
            // `product*`-prefixed slots to keep buyer-side rates
            // separate from lead-side rates (Phase 12). The chain
            // rates are required when hasHto=true (matches
            // lead_magnet_call's completeness rule shape). htoConversionRate
            // is NOT required on any funnel type now (paid_event
            // dropped it in Phase 7 Item C; paid_product drops it
            // here).
            //
            // The per-field validator throws on the FIRST missing
            // field; the canonical `missingRequiredFields` predicate
            // (which lists all of them in declaration order) is the
            // source of truth for the save-time error message
            // (data-model.md §3, FR-040a).
            if (
                fieldName === "aov"
                || fieldName === "roasTarget"
                || fieldName === "htoPrice"
                || fieldName === "productBookingRate"
                || fieldName === "productShowUpRate"
                || fieldName === "productCloseRate"
                || fieldName === "commissionRate"
                || fieldName === "marginKept"
            ) {
                if (isMissing(value)) {
                    throw new Error(`${fieldName} is required for ${funnelType}`);
                }
            }
            return;
        case "free_webinar":
            if (
                fieldName === "offerPrice"
                || fieldName === "attendanceRate"
                || fieldName === "buyRateFromAttendees"
                || fieldName === "commissionRate"
                || fieldName === "marginKept"
            ) {
                if (isMissing(value)) {
                    throw new Error(`${fieldName} is required for free_webinar`);
                }
            }
            return;
        case "lead_magnet_call":
            if (
                fieldName === "offerPrice"
                || fieldName === "leadToCloseRate"
                || fieldName === "bookingRate"
                || fieldName === "showUpRate"
                || fieldName === "commissionRate"
                || fieldName === "marginKept"
            ) {
                if (isMissing(value)) {
                    throw new Error(`${fieldName} is required for lead_magnet_call`);
                }
            }
            return;
    }
}

// ─── Completeness predicate (FR-039, FR-049, FR-050, data-model.md §3) ─────
//
// Single canonical definition of "is this settings doc complete?" — the
// retrieval response, the target derivation, and the interface all
// consult the same definition. Two independent implementations of
// "complete" MUST NOT exist.
//
// Rules:
//   - null / missing ⇒ incomplete (data-model.md §1)
//   - 0 ⇒ COMPLETE (a zero commission or zero rate is a legitimate answer)
//   - hasHto === false drops the high-ticket fields from the required set
//   - stored-but-unread fields are not part of the rule (Item A decision:
//     paid_event does not require `htoConversionRate` even when hasHto=true)

type FunnelSettingsLike = {
    funnelType?: unknown;
    aov?: number | null;
    htoPrice?: number | null;
    htoConversionRate?: number | null;
    hasHto?: boolean | null;
    roasTarget?: number | null;
    eventAttendanceRate?: number | null;
    eventCloseRate?: number | null;
    offerPrice?: number | null;
    attendanceRate?: number | null;
    buyRateFromAttendees?: number | null;
    leadToCloseRate?: number | null;
    bookingRate?: number | null;
    showUpRate?: number | null;
    // Phase 12 — paid_product's buyer-side chain. SCOPED to
    // paid_product; null on every other funnel type. See the
    // FunnelSettingsDoc docstring for `productBookingRate` for the
    // rationale (Phase 11 overloaded these slots with
    // lead_magnet_call's lead-side chain — different denominators,
    // same field name was a cross-funnel aggregate hazard).
    productBookingRate?: number | null;
    productShowUpRate?: number | null;
    productCloseRate?: number | null;
    commissionRate?: number | null;
    marginKept?: number | null;
};

function requiredFieldsForDoc(funnelType: FunnelInputs["funnelType"], hasHto: boolean): ReadonlyArray<keyof FunnelSettingsLike> {
    switch (funnelType) {
        case "paid_event":
            // FR-011..FR-014 — paid_event reads eventAttendanceRate and
            // eventCloseRate; it does NOT read htoConversionRate.
            // Phase 968 — T041 (FR-016): roasTarget is OPTIONAL for
            // paid_event — the save defaults to 0.5 (the
            // controlled front-end loss posture). paid_product
            // still requires an explicit choice.
            return hasHto
                ? ["aov", "htoPrice", "eventAttendanceRate", "eventCloseRate", "commissionRate", "marginKept"]
                : ["aov", "eventAttendanceRate", "eventCloseRate", "commissionRate", "marginKept"];
        case "paid_product":
            // Phase 11 + Phase 12 — the chain
            // (productBookingRate × productShowUpRate × productCloseRate)
            // replaces the legacy htoConversionRate on paid_product.
            // All three chain rates are required when hasHto=true
            // (matches lead_magnet_call's completeness rule shape).
            // The fields use the `product*` prefix (Phase 12) to keep
            // buyer-side rates separate from lead-side rates — see
            // the FunnelSettingsDoc docstring for `productBookingRate`.
            return hasHto
                ? ["aov", "roasTarget", "htoPrice", "productBookingRate", "productShowUpRate", "productCloseRate", "commissionRate", "marginKept"]
                : ["aov", "roasTarget", "commissionRate", "marginKept"];
        case "free_webinar":
            return ["offerPrice", "attendanceRate", "buyRateFromAttendees", "commissionRate", "marginKept"];
        case "lead_magnet_call":
            return ["offerPrice", "leadToCloseRate", "bookingRate", "showUpRate", "commissionRate", "marginKept"];
    }
}

/**
 * Returns the list of field names that are required but missing/null on
 * this doc. The empty list means the doc is complete.
 *
 * Exported so the frontend parity test (T058) and the structured
 * observability log (T037) can both consult the same definition.
 */
export function missingRequiredFields(doc: FunnelSettingsLike): ReadonlyArray<string> {
    // Round-12 (CodeRabbit round 12 Items 7+8): a raw doc read from
    // Firestore can have an unrecognized or missing `funnelType` (legacy
    // doc, partially-saved doc, future schema bump). The previous code
    // threw via `asFunnelType`, which propagated up through
    // `getFunnelSettings` (line 711) and `metaSync/shared.ts` (line 615)
    // and surfaced as a sync failure. Treat an unknown funnelType as
    // incomplete: returning `["funnelType"]` forces
    // `isSettingsComplete` to `false` via its length check, while leaving
    // the doc's other fields alone (they're still typed correctly by
    // Firestore). The single-field return keeps the audit-log line in
    // `metaSync/shared.ts` sensible.
    const funnelType = asFunnelTypeOrNull(doc.funnelType);
    if (funnelType === null) {
        return ["funnelType"];
    }
    const hasHto = doc.hasHto === true;
    const fields = requiredFieldsForDoc(funnelType, hasHto);
    const missing: string[] = [];
    for (const f of fields) {
        const v = doc[f];
        if (v === undefined || v === null) {
            missing.push(String(f));
        }
    }
    return missing;
}

/**
 * Single canonical completeness predicate (FR-039, FR-050).
 * Returns true iff every required field for the doc's funnel type is
 * present and non-null. `0` is a valid complete value.
 */
export function isSettingsComplete(doc: FunnelSettingsLike): boolean {
    return missingRequiredFields(doc).length === 0;
}

// ─── Storage retention — paid_event htoConversionRate ─────────
//
// Phase 968 — Item D (Phase 7 carry-over, Phase 9 close-out).
// `paid_event` retains `htoConversionRate` on the doc for additive
// storage compatibility (data-model.md §1) but never reads it (the
// corrected formula reads `eventAttendanceRate × eventCloseRate`).
// `paid_product` reads `htoConversionRate` for derivation (FR-019).
//
// Storage retention (data-model.md §1) requires the field to be
// preserved verbatim across a save round-trip — including a stored
// `null`. Sending `0` instead of `null` would overwrite a pre-existing
// value with `0`, breaking the revert-stays-code-only property
// (data-model.md §1: "nothing is written to any existing document";
// the deferred epoch phase will touch the same document again).
//
// This helper resolves which value lands in the persisted doc for a
// given save. Pure: takes the funnel type, the request's supplied
// value (number / null / undefined), and the derivation's coerced
// numeric value, and returns what the doc should hold.
//
// Behaviour:
//   paid_event:  preserve `reqValue` verbatim — `null` stays `null`,
//                a number stays a number, `undefined` collapses to
//                `null` (no value to preserve ⇒ doc carries null).
//   paid_product: the derivation's coerced numeric value wins. The
//                 form has validated that this is a number; the
//                 coercion in `buildFunnelInputs` defaults missing
//                 fields to `0`, which is a legitimate answer for
//                 paid_product (a zero upsell-conversion rate ⇒ no
////                  HTO revenue contribution).
//
// Exported for the same test that the callable uses — keeps the contract
// pinned against drift (constitution XI).
export function resolveHtoConversionRateForStorage(
    funnelType: FunnelInputs["funnelType"],
    reqValue: number | null | undefined,
    derived: number,
): number | null {
    if (funnelType === "paid_event") {
        return reqValue ?? null;
    }
    // paid_product (other funnel types land here too but never store
    // the field on non-paid docs — the doc construction handles that).
    return derived;
}

/**
 * Build a typed `FunnelInputs` from the SAVE request payload. Coerces /
 * forces HTO=0 when hasHto=false. Pre-condition: callers MUST have
 * validated required inputs via `assertRequiredFieldPresent` BEFORE
 * calling this — the coercion here defaults missing fields to 0 and
 * would otherwise swallow
 * the missing-field error.
 */
function buildFunnelInputs(req: SaveFunnelSettingsRequest): FunnelInputs {
    const funnelType = asFunnelType(req.funnelType);
    const commissionRate = asNumberOrNull(req.commissionRate) ?? DEFAULT_COMMISSION_RATE;
    const marginKept = (asNumberOrNull(req.marginKept) ?? DEFAULT_MARGIN_KEPT) as MarginKept;
    switch (funnelType) {
        case "paid_event":
        case "paid_product": {
            const hasHto = req.hasHto === true;
            // Phase 11 + Phase 12 — paid_product reads the chain
            // (productBookingRate × productShowUpRate × productCloseRate)
            // on the HTO term. The fields are accepted on the request
            // payload for both paid types; the validator at line 230+
            // ignores them on paid_event (they're stored-but-unread
            // there) and requires them on paid_product + hasHto.
            // paid_event passes them through at 0 to satisfy the
            // derivation engine's range assertions; the chain is
            // multiplied on paid_product only. The `product*` prefix
            // is for the same-scoped reason as `event*` — keep
            // buyer-side rates distinct from lead-side rates.
            const productBookingN = asNumberOrNull(req.productBookingRate) ?? 0;
            const productShowUpN = asNumberOrNull(req.productShowUpRate) ?? 0;
            const productCloseN = asNumberOrNull(req.productCloseRate) ?? 0;
            return {
                funnelType,
                aov: asNumberOrNull(req.aov) ?? 0,
                hasHto,
                htoPrice: hasHto ? (asNumberOrNull(req.htoPrice) ?? 0) : 0,
                // Phase 11 — htoConversionRate is dead at read time on
                // every funnel type. The field is coerced to a number
                // for the typed input shape but the derivation ignores
                // it. The doc slot is preserved verbatim by the doc
                // construction below.
                htoConversionRate: asNumberOrNull(req.htoConversionRate) ?? 0,
                eventAttendanceRate: asNumberOrNull(req.eventAttendanceRate) ?? 0,
                eventCloseRate: asNumberOrNull(req.eventCloseRate) ?? 0,
                productBookingRate: productBookingN,
                productShowUpRate: productShowUpN,
                productCloseRate: productCloseN,
                commissionRate,
                marginKept,
                // Phase 968 — T041 (FR-016): paid_event defaults roasTarget
                // to 0.5 (controlled front-end loss posture) when the
                // request omits it. paid_product keeps the existing
                // explicit-required behaviour.
                //
                // Round-12 (CodeRabbit round 12 Item 6): the prior code
                // used `(req.roasTarget ?? DEFAULT_PAID_EVENT_ROAS_TARGET)`
                // which skipped `asRoas()`'s runtime validation — an
                // arbitrary string or number from the untyped request
                // body would land in `deriveTargetCpa` and alter the
                // computed target. Run the default through `asRoas` so the
                // closed enum invariant holds regardless of what the
                // client sent. The non-paid_event branch already used
                // `asRoas`, so this preserves parity between both arms.
                roasTarget: req.funnelType === "paid_event"
                    ? asRoas(req.roasTarget ?? DEFAULT_PAID_EVENT_ROAS_TARGET)
                    : asRoas(req.roasTarget),
            } satisfies PaidFunnelInputs;
        }
        case "free_webinar":
            return {
                funnelType,
                offerPrice: asNumberOrNull(req.offerPrice) ?? 0,
                attendanceRate: asNumberOrNull(req.attendanceRate) ?? 0,
                buyRateFromAttendees: asNumberOrNull(req.buyRateFromAttendees) ?? 0,
                commissionRate,
                marginKept,
            } satisfies FreeWebinarInputs;
        case "lead_magnet_call":
            return {
                funnelType,
                offerPrice: asNumberOrNull(req.offerPrice) ?? 0,
                leadToCloseRate: asNumberOrNull(req.leadToCloseRate) ?? 0,
                bookingRate: asNumberOrNull(req.bookingRate) ?? 0,
                showUpRate: asNumberOrNull(req.showUpRate) ?? 0,
                commissionRate,
                marginKept,
            } satisfies LeadMagnetCallInputs;
    }
}

// ─── saveFunnelSettings ──────────────────────────────────────
//
// Phase 967 (FR-001, contract C10) — owner-scoped write. All
// workspace settings live under the resolved owner; a team member
// acts on the owner's account (FR-004a all-access policy).

interface SaveFunnelSettingsRequest {
    workspaceId: string;
    accountId: string;
    funnelType: FunnelInputs["funnelType"];
    // Paid
    aov?: number | null;
    hasHto?: boolean;
    htoPrice?: number;
    /**
     * Phase 968 — Item D (Phase 9 close-out): accepts `null` for
     * `paid_event` so the form can pass through a stored `null`
     * verbatim (storage retention — data-model.md §1). For `paid_product`
     * the field is required and the form sends a number.
     */
    htoConversionRate?: number | null;
    eventAttendanceRate?: number | null;
    eventCloseRate?: number | null;
    roasTarget?: 1.0 | 0.65 | 0.5;
    // Free
    offerPrice?: number | null;
    attendanceRate?: number | null;
    buyRateFromAttendees?: number | null;
    leadToCloseRate?: number | null;
    // Phase 968 — T022. Sent for `lead_magnet_call` only (lead-side
    // chain). Backend validator accepts null on every other funnel
    // type.
    bookingRate?: number | null;
    showUpRate?: number | null;
    // Phase 12 — `paid_product` only (buyer-side chain). See the
    // FunnelSettingsDoc docstring for `productBookingRate` for the
    // rationale. Sent for `paid_product + hasHto`; ignored on every
    // other funnel type.
    productBookingRate?: number | null;
    productShowUpRate?: number | null;
    productCloseRate?: number | null;
    // Shared Phase 968 inputs (FR-026, FR-027)
    commissionRate?: number | null;
    marginKept?: 50 | 60 | 70 | null;
    clientNowMs: number;
}

export const saveFunnelSettings = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        // Universal preamble (FR-001, FR-003).
        const scope = await resolveMetaScope(request);
        const req = request.data as SaveFunnelSettingsRequest;

        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }
        if (typeof req.clientNowMs !== "number" || !Number.isFinite(req.clientNowMs)) {
            throw new HttpsError("invalid-argument", "clientNowMs is required (number).");
        }

        // FR-004 / FR-021 — workspace authorisation first, before any
        // side effect. `assertWorkspaceAllowed` is a no-op for verified
        // team members (all-access) and for owners.
        assertWorkspaceAllowed(scope, req.workspaceId);

        // 1:1 enforcement — workspace's connected Meta account must match.
        const connAccountId = await loadMetaConnectionAccountId(scope.ownerUid, req.workspaceId);
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
            // FR-040a — reject incomplete saves, naming EVERY missing field.
            // The save payload and the persisted doc share the same field
            // shape, so the canonical completeness predicate from T030 is
            // reused here (FR-050 — single source of truth). This replaces
            // the per-field asserts below which threw on the first miss.
            const missing = missingRequiredFields({
                funnelType: req.funnelType,
                aov: req.aov,
                htoPrice: req.htoPrice,
                htoConversionRate: req.htoConversionRate,
                hasHto: req.hasHto,
                roasTarget: req.roasTarget,
                eventAttendanceRate: req.eventAttendanceRate,
                eventCloseRate: req.eventCloseRate,
                offerPrice: req.offerPrice,
                attendanceRate: req.attendanceRate,
                buyRateFromAttendees: req.buyRateFromAttendees,
                leadToCloseRate: req.leadToCloseRate,
                bookingRate: req.bookingRate,
                showUpRate: req.showUpRate,
                // Phase 12 — paid_product's chain. Carried through to
                // the completeness predicate so `paid_product +
                // hasHto` requires all three `product*` fields.
                productBookingRate: req.productBookingRate,
                productShowUpRate: req.productShowUpRate,
                productCloseRate: req.productCloseRate,
                commissionRate: req.commissionRate,
                marginKept: req.marginKept,
            });
            if (missing.length > 0) {
                throw new Error(`incomplete save for ${req.funnelType}: missing [${missing.join(", ")}]`);
            }

            inputs = buildFunnelInputs(req);
            // Sanity-check the coerced inputs against the derivation engine.
            const probeDerived = deriveAll(inputs, req.clientNowMs);
            computeAdvisories(inputs, probeDerived);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new HttpsError("invalid-argument", msg);
        }

        // Recompute derived + advisories server-side (post-validation).
        // T017a: computeAdvisories now takes the derived targets as its
        // second argument because the low-value advisory keys off the
        // computed target (FR-028), not the entered price.
        const derived = deriveAll(inputs, req.clientNowMs);
        const advisories = computeAdvisories(inputs, derived);

        // Persist atomically so a concurrent `dismissAdvisory` write cannot
        // be clobbered by our read-then-overwrite. We snapshot the existing
        // doc inside the transaction and preserve `advisoriesDismissed` +
        // `createdAt` from that snapshot.
        const settingsRef = getDb()
            .collection("users").doc(scope.ownerUid)
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
                // Phase 968 — Item D (Phase 9 close-out): the doc's
                // `htoConversionRate` is preserved verbatim from the
                // request on paid_event, including `null`. The previous
                // implementation coerced null → 0 through `inputs`,
                // which broke storage retention. `paid_product` uses
                // the derivation's coerced numeric value (the form has
                // validated that the field is a number). Non-paid funnel
                // types carry `0` for the additive-storage compatibility
                // of legacy fields.
                htoConversionRate: inputs.funnelType === "paid_event" || inputs.funnelType === "paid_product"
                    ? resolveHtoConversionRateForStorage(
                        inputs.funnelType,
                        req.htoConversionRate,
                        inputs.htoConversionRate,
                    )
                    : 0,
                roasTarget: inputs.funnelType === "paid_event" || inputs.funnelType === "paid_product" ? inputs.roasTarget : 1.0,
                offerPrice: inputs.funnelType === "free_webinar" || inputs.funnelType === "lead_magnet_call" ? inputs.offerPrice : null,
                attendanceRate: inputs.funnelType === "free_webinar" ? inputs.attendanceRate : null,
                buyRateFromAttendees: inputs.funnelType === "free_webinar" ? inputs.buyRateFromAttendees : null,
                // Phase 968 — T022. The lead-side chain lives on
                // `lead_magnet_call` only. The `lead_magnet_call` slots
                // measure leads → close. Phase 12 separates them from
                // paid_product's buyer-side chain (which lives on the
                // dedicated `product*` slots below).
                leadToCloseRate: inputs.funnelType === "lead_magnet_call"
                    ? inputs.leadToCloseRate
                    : null,
                bookingRate: inputs.funnelType === "lead_magnet_call"
                    ? inputs.bookingRate
                    : null,
                showUpRate: inputs.funnelType === "lead_magnet_call"
                    ? inputs.showUpRate
                    : null,
                // Phase 12 — paid_product's buyer-side chain. SCOPED
                // to paid_product to keep buyer-side rates distinct
                // from lead-side rates (see the FunnelSettingsDoc
                // docstring for `productBookingRate`).
                productBookingRate: inputs.funnelType === "paid_product"
                    ? inputs.productBookingRate
                    : null,
                productShowUpRate: inputs.funnelType === "paid_product"
                    ? inputs.productShowUpRate
                    : null,
                productCloseRate: inputs.funnelType === "paid_product"
                    ? inputs.productCloseRate
                    : null,
                // Phase 968 — T045 (US3). paid_event event rates must be
                // persisted on the doc so a reloaded record stays
                // complete. Round-12 (CodeRabbit round 12 Items 3+5):
                // the prior construction omitted both fields, so a
                // reloaded paid_event document lost both rates, the
                // backend's `missingRequiredFields` listed them as
                // missing, and the form re-substituted 75/7.5 on
                // hydration. Persist the derivation's coerced values
                // (the request payload has been validated above).
                eventAttendanceRate: inputs.funnelType === "paid_event" ? inputs.eventAttendanceRate : 0,
                eventCloseRate: inputs.funnelType === "paid_event" ? inputs.eventCloseRate : 0,
                // Phase 968 — T027. commissionRate + marginKept apply to all
                // four funnel types per FR-023/FR-024/OQ-1.
                commissionRate: inputs.commissionRate,
                marginKept: inputs.marginKept,
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
        // Universal preamble (FR-001, FR-003).
        const scope = await resolveMetaScope(request);
        const req = request.data as GetFunnelSettingsRequest;

        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }

        // FR-004 / FR-021 — workspace authorisation first.
        assertWorkspaceAllowed(scope, req.workspaceId);

        const connAccountId = await loadMetaConnectionAccountId(scope.ownerUid, req.workspaceId);
        // CR-MAJOR (CodeRabbit review feedback): the previous check
        // only rejected a *mismatch* — when the workspace has no
        // linked ad account (`connAccountId` is null after unlink), the
        // condition was false and the call returned whatever settings
        // were stored for any prior account. `saveFunnelSettings` and
        // `dismissAdvisory` already require a current matching
        // account; `getFunnelSettings` must too — otherwise a stale
        // read leaks the previous client's settings.
        if (!connAccountId || connAccountId !== req.accountId) {
            throw new HttpsError("permission-denied", "accountId does not match the workspace's connected Meta account.");
        }

        const snap = await getDb()
            .collection("users").doc(scope.ownerUid)
            .collection("workspaces").doc(req.workspaceId)
            .collection("adAccounts").doc(req.accountId)
            .collection("settings").doc("current")
            .get();

        if (!snap.exists) {
            // No record yet — the doc is by definition incomplete (FR-049,
            // FR-043). Returning `settings: null` is correct here: the
            // record does not exist. The flag distinguishes absence from
            // incompleteness (FR-049) so the interface never auto-pushes
            // (FR-044, R-3): with no record, the user has not yet
            // committed anything to lose.
            return { ok: true as const, settings: null, complete: false, reviewDue: false };
        }

        const doc = snap.data() as Record<string, unknown>;
        const reviewDueAt = Number(doc.reviewDueAt) || 0;
        const reviewDue = Date.now() >= reviewDueAt;

        // FR-043, FR-049: an incomplete record is ALWAYS returned when
        // it exists, with `complete: false` next to it. Returning
        // `settings: null` here would trip the first-run auto-open
        // effect (`App.tsx:4283`), pushing every existing owner into
        // the form on their next load (R-3). Existence and completeness
        // are orthogonal signals (contracts/funnelSettings.md).
        const complete = isSettingsComplete(doc);

        return {
            ok: true as const,
            settings: doc as unknown as FunnelSettingsDoc,
            complete,
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
        // Universal preamble (FR-001, FR-003).
        const scope = await resolveMetaScope(request);
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

        // FR-004 / FR-021 — workspace authorisation first.
        assertWorkspaceAllowed(scope, req.workspaceId);

        const connAccountId = await loadMetaConnectionAccountId(scope.ownerUid, req.workspaceId);
        if (!connAccountId || connAccountId !== req.accountId) {
            throw new HttpsError("permission-denied", "accountId does not match the workspace's connected Meta account.");
        }

        const settingsRef = getDb()
            .collection("users").doc(scope.ownerUid)
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