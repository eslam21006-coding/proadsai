// functions/src/billing/billingState.ts — server-side billing state resolution, persistence, and idempotency

import { Firestore, type Timestamp, FieldValue } from "firebase-admin/firestore";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type BillingStatus = "trialing" | "active" | "past_due" | "cancelling" | "cancelled" | "none";

export interface BillingState {
    plan: string;
    isTrial: boolean;
    credits: number;
    creditsPerMonth: number;
    billingStatus: BillingStatus;
    nextResetDate: { seconds: number; nanoseconds: number } | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    canUpgrade: boolean;
    canTopUp: boolean;
    isTeamMember: boolean;
    teamOwnerUid: string | null;
    teamOwnerName: string | null;
    cancelAt: { seconds: number; nanoseconds: number } | null;
    gracePeriodEndsAt: { seconds: number; nanoseconds: number } | null;
    pendingPlan: string | null;
    pendingPlanEffectiveAt: { seconds: number; nanoseconds: number } | null;
    /** @deprecated Paddle field — kept for backward compat during migration, removed in M5 */
    paddleCustomerId?: string | null;
    /** @deprecated Paddle field — kept for backward compat during migration, removed in M5 */
    paddleSubscriptionId?: string | null;
    /** @deprecated Paddle field — kept for backward compat during migration, removed in M5 */
    paddleUpdatePaymentUrl?: string | null;
    /** @deprecated Paddle field — kept for backward compat during migration, removed in M5 */
    paddleCancelUrl?: string | null;
}

interface UserData {
    plan?: string;
    credits?: number;
    isTrial?: boolean;
    billingStatus?: string;
    billingType?: string;
    isTeamMember?: boolean;
    teamOwnerUid?: string;
    teamOwnerName?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    /** @deprecated Paddle field */
    paddleCustomerId?: string;
    /** @deprecated Paddle field */
    paddleSubscriptionId?: string;
    /** @deprecated Paddle field */
    paddleUpdatePaymentUrl?: string;
    /** @deprecated Paddle field */
    paddleCancelUrl?: string;
    cancelAtPeriodEnd?: boolean;
    cancelAt?: Timestamp | null;
    pendingPlan?: string;
    pendingPlanEffectiveAt?: Timestamp | null;
    gracePeriodEndsAt?: Timestamp | null;
    nextCreditReset?: Timestamp | null;
    cancelledAt?: Timestamp | null;
}

const PLAN_CREDITS: Record<string, number> = {
    starter: 800,
    pro: 2500,
    scale: 6500,
};

const TRIAL_CREDITS = 50;

const PLAN_HIERARCHY: Record<string, number> = {
    none: 0,
    starter: 1,
    pro: 2,
    scale: 3,
};

// ═══════════════════════════════════════════════════════════
// buildBillingState — pure function, no Firestore dependency
// ═══════════════════════════════════════════════════════════

function tsToObj(ts: Timestamp | null | undefined): { seconds: number; nanoseconds: number } | null {
    if (!ts) return null;
    if (typeof (ts as any).seconds === "number") {
        return { seconds: (ts as Timestamp).seconds, nanoseconds: (ts as Timestamp).nanoseconds };
    }
    return null;
}

export function buildBillingState(data: UserData): BillingState {
    let plan = data.plan || "none";

    // ── Legacy read-time mapping (creator → pro, scaling → scale) ──
    if (plan === "creator") {
        console.log(JSON.stringify({ event: "plan.legacy_mapped", uid: "unknown", legacy: "creator", canonical: "pro" }));
        plan = "pro";
    } else if (plan === "scaling") {
        console.log(JSON.stringify({ event: "plan.legacy_mapped", uid: "unknown", legacy: "scaling", canonical: "scale" }));
        plan = "scale";
    }

    const isTrial = data.isTrial === true;
    const isTeamMember = data.isTeamMember === true;
    const rawCredits = data.credits ?? 0;
    const planCredits = PLAN_CREDITS[plan] ?? 0;
    const creditsPerMonth = isTrial ? TRIAL_CREDITS : planCredits;

    let billingStatus: BillingState["billingStatus"] = "active";

    if (data.gracePeriodEndsAt) {
        billingStatus = "past_due";
    } else if (data.cancelAtPeriodEnd || data.cancelAt) {
        billingStatus = "cancelling";
    }

    if (data.billingStatus === "cancelled") {
        billingStatus = "cancelled";
    }

    if (plan === "none" && rawCredits === 0 && !isTrial) {
        billingStatus = "cancelled";
    }

    if (isTrial && rawCredits <= 0) {
        billingStatus = "cancelled";
    }

    const currentRank = PLAN_HIERARCHY[plan] ?? 0;
    const canUpgrade = !isTeamMember && currentRank < PLAN_HIERARCHY["scale"] && currentRank >= PLAN_HIERARCHY["starter"];
    const canTopUp = !isTeamMember && !isTrial && plan !== "none" && billingStatus !== "cancelled" && billingStatus !== "past_due";

    return {
        plan,
        isTrial,
        credits: rawCredits,
        creditsPerMonth,
        billingStatus,
        nextResetDate: tsToObj(data.nextCreditReset),
        stripeCustomerId: data.stripeCustomerId || null,
        stripeSubscriptionId: data.stripeSubscriptionId || null,
        canUpgrade,
        canTopUp,
        isTeamMember,
        teamOwnerUid: data.teamOwnerUid || null,
        teamOwnerName: data.teamOwnerName || null,
        cancelAt: tsToObj(data.cancelAt),
        gracePeriodEndsAt: tsToObj(data.gracePeriodEndsAt),
        pendingPlan: data.pendingPlan || null,
        pendingPlanEffectiveAt: tsToObj(data.pendingPlanEffectiveAt),
        paddleCustomerId: data.paddleCustomerId || null,
        paddleSubscriptionId: data.paddleSubscriptionId || null,
        paddleUpdatePaymentUrl: data.paddleUpdatePaymentUrl || null,
        paddleCancelUrl: data.paddleCancelUrl || null,
    };
}

// ═══════════════════════════════════════════════════════════
// writeBillingState — reads user doc, computes state, writes to embedded billingState sub-object
// ═══════════════════════════════════════════════════════════

export async function writeBillingState(uid: string, db: Firestore): Promise<void> {
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) return;

        const data = snap.data() as UserData;
        const state = buildBillingState(data);

        tx.update(userRef, { billingState: state });
    });
}

// ═══════════════════════════════════════════════════════════
// IDEMPOTENCY — paddle_events/{eventId} (legacy) + stripe_events/{eventId} (new)
// ═══════════════════════════════════════════════════════════

export async function isEventProcessed(eventId: string, db: Firestore): Promise<boolean> {
    const doc = await db.collection("paddle_events").doc(eventId).get();
    return doc.exists;
}

export async function isStripeEventProcessed(eventId: string, db: Firestore): Promise<boolean> {
    const doc = await db.collection("stripe_events").doc(eventId).get();
    return doc.exists;
}

export async function markEventProcessed(
    eventId: string,
    eventType: string,
    metadata: {
        paddleCustomerId?: string;
        paddleSubscriptionId?: string;
        email?: string;
        result: "applied" | "duplicate" | "ignored";
    },
    db: Firestore,
): Promise<void> {
    await db.collection("paddle_events").doc(eventId).set({
        eventType,
        processedAt: FieldValue.serverTimestamp(),
        paddleCustomerId: metadata.paddleCustomerId || null,
        paddleSubscriptionId: metadata.paddleSubscriptionId || null,
        email: metadata.email || null,
        result: metadata.result,
    });
}

export async function markStripeEventProcessed(
    eventId: string,
    eventType: string,
    metadata: {
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
        email?: string;
        result: "applied" | "duplicate" | "noop_dual_event" | "ignored" | "partial_refund_logged";
    },
    db: Firestore,
): Promise<void> {
    await db.collection("stripe_events").doc(eventId).set({
        eventType,
        processedAt: FieldValue.serverTimestamp(),
        stripeCustomerId: metadata.stripeCustomerId || null,
        stripeSubscriptionId: metadata.stripeSubscriptionId || null,
        email: metadata.email || null,
        result: metadata.result,
    });
}
