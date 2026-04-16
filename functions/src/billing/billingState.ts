// functions/src/billing/billingState.ts — server-side billing state resolution, persistence, and idempotency

import { Firestore, type Timestamp, FieldValue } from "firebase-admin/firestore";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface BillingState {
    plan: string;
    isTrial: boolean;
    credits: number;
    creditsPerMonth: number;
    billingStatus: "active" | "past_due" | "cancelled" | "cancelling" | "trialing";
    nextResetDate: { seconds: number; nanoseconds: number } | null;
    paddleCustomerId: string | null;
    paddleSubscriptionId: string | null;
    paddleUpdatePaymentUrl: string | null;
    paddleCancelUrl: string | null;
    canUpgrade: boolean;
    canTopUp: boolean;
    isTeamMember: boolean;
    teamOwnerUid: string | null;
    teamOwnerName: string | null;
    cancelAt: { seconds: number; nanoseconds: number } | null;
    gracePeriodEndsAt: { seconds: number; nanoseconds: number } | null;
    pendingPlan: string | null;
    pendingPlanEffectiveAt: { seconds: number; nanoseconds: number } | null;
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
    paddleCustomerId?: string;
    paddleSubscriptionId?: string;
    paddleUpdatePaymentUrl?: string;
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
    starter: 500,
    creator: 1000,
    pro: 2000,
    scaling: 5000,
};

const TRIAL_CREDITS = 50;

const PLAN_HIERARCHY: Record<string, number> = {
    none: 0,
    starter: 1,
    creator: 2,
    pro: 3,
    scaling: 4,
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
    const plan = data.plan || "none";
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
    const canUpgrade = !isTeamMember && currentRank < PLAN_HIERARCHY["scaling"] && currentRank >= PLAN_HIERARCHY["starter"];
    const canTopUp = !isTeamMember && !isTrial && plan !== "none" && billingStatus !== "cancelled" && billingStatus !== "past_due";

    return {
        plan,
        isTrial,
        credits: rawCredits,
        creditsPerMonth,
        billingStatus,
        nextResetDate: tsToObj(data.nextCreditReset),
        paddleCustomerId: data.paddleCustomerId || null,
        paddleSubscriptionId: data.paddleSubscriptionId || null,
        paddleUpdatePaymentUrl: data.paddleUpdatePaymentUrl || null,
        paddleCancelUrl: data.paddleCancelUrl || null,
        canUpgrade,
        canTopUp,
        isTeamMember,
        teamOwnerUid: data.teamOwnerUid || null,
        teamOwnerName: data.teamOwnerName || null,
        cancelAt: tsToObj(data.cancelAt),
        gracePeriodEndsAt: tsToObj(data.gracePeriodEndsAt),
        pendingPlan: data.pendingPlan || null,
        pendingPlanEffectiveAt: tsToObj(data.pendingPlanEffectiveAt),
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
// Phase 9 FR-018 — dormantPlan write-through
// ═══════════════════════════════════════════════════════════
// When a subscription event fires, propagate plan/credits/URL/status changes
// to any `dormantPlan` snapshots referencing the affected customer. Called from
// both the Stripe webhook (legacy, queryField='stripeCustomerId') and the Paddle
// webhook (queryField='paddleCustomerId') so dormant snapshots stay live for
// users who joined a team mid-subscription. Matches against a nested map subfield
// — Firestore auto-indexes these, no explicit index configuration required.
export async function writeThroughDormantPlan(
    db: Firestore,
    queryField: "stripeCustomerId" | "paddleCustomerId",
    customerId: string,
    fields: Record<string, unknown>,
): Promise<void> {
    if (!customerId) return;
    try {
        const fieldPath = `dormantPlan.${queryField}`;
        const snap = await db.collection("users")
            .where(fieldPath, "==", customerId)
            .limit(10)
            .get();
        if (snap.empty) return;
        for (const doc of snap.docs) {
            const dp = doc.data()?.dormantPlan;
            if (!dp) continue;
            const updates: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fields)) {
                updates[`dormantPlan.${key}`] = value;
            }
            await doc.ref.update(updates);
            console.log(`🔄 dormantPlan write-through: ${doc.id} via ${queryField}`);
        }
    } catch (err) {
        console.warn("⚠️ dormantPlan write-through failed (non-blocking):", err);
    }
}

// ═══════════════════════════════════════════════════════════
// IDEMPOTENCY — paddle_events/{eventId}
// ═══════════════════════════════════════════════════════════

export async function isEventProcessed(eventId: string, db: Firestore): Promise<boolean> {
    const doc = await db.collection("paddle_events").doc(eventId).get();
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
