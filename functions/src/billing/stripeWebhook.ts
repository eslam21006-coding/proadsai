// functions/src/billing/stripeWebhook.ts — Stripe webhook handler with 7 event types, idempotency, and refund branches

import type { Request, Response } from "express";
import type Stripe from "stripe";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { createStripeClient, STRIPE_PRICE_TO_PLAN } from "../stripe/stripeClient.js";
import { writeBillingState, markStripeEventProcessed, isStripeEventProcessed } from "./billingState.js";
import { logBillingStep } from "./billingLogger.js";
import type { notifyGHL } from "./ghlBillingSync.js";

const db = admin.firestore();

type NotifyGHLFn = typeof notifyGHL;

let _notifyGHL: NotifyGHLFn | null = null;

export function setNotifyGHL(fn: NotifyGHLFn) {
    _notifyGHL = fn;
}

function getNotifyGHL(): NotifyGHLFn {
    if (!_notifyGHL) {
        throw new Error("notifyGHL not initialized — call setNotifyGHL first");
    }
    return _notifyGHL;
}

const PLAN_CREDITS: Record<string, number> = {
    starter: 800,
    pro: 2500,
    scale: 6500,
};

async function isSubscriptionTrialing(stripe: Stripe, subscriptionId: string): Promise<boolean> {
    try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        return sub.status === "trialing";
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

export async function handleStripeWebhook(
    req: Request,
    res: Response,
    secrets: {
        stripeSecretKey: string;
        stripeWebhookSecret: string;
    },
): Promise<void> {
    const startTime = Date.now();

    // ─── Step 1: Read raw body and verify signature ───
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
    const signature = req.headers["stripe-signature"] as string;

    if (!signature) {
        logBillingStep("stripe_webhook_receive", undefined, "error", "stripe_signature_invalid");
        res.status(400).send("Missing stripe-signature header");
        return;
    }

    const stripe = createStripeClient(secrets.stripeSecretKey);
    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secrets.stripeWebhookSecret);
    } catch (err: any) {
        logBillingStep("stripe_webhook_verify", undefined, "error", "stripe_signature_invalid", {
            error: err.message,
        });
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    logBillingStep("stripe_webhook_verify", event.id, "success", undefined, {
        eventType: event.type,
    });

    // ─── Step 2: Event-ID idempotency check (atomic .create) ───
    try {
        await db.collection("stripe_events").doc(event.id).create({
            eventType: event.type,
            receivedAt: FieldValue.serverTimestamp(),
        });
    } catch (err: any) {
        if (err.code === 6 || err?.message?.includes("ALREADY_EXISTS")) {
            logBillingStep("stripe_event_dedup", event.id, "duplicate", "stripe_event_duplicate", {
                eventType: event.type,
            });
            res.status(200).send("OK (duplicate)");
            return;
        }
        logBillingStep("stripe_event_dedup", event.id, "error", undefined, {
            error: err.message,
        });
    }

    // ─── Step 3: Route by event type ───
    const eventType = event.type;

    try {
        switch (eventType) {
            case "checkout.session.completed":
                await handleCheckoutSessionCompleted(event, stripe);
                break;
            case "customer.subscription.created":
                await handleSubscriptionCreated(event, stripe);
                break;
            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event, stripe);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event, stripe);
                break;
            case "invoice.payment_succeeded":
                await handleInvoicePaymentSucceeded(event, stripe);
                break;
            case "invoice.payment_failed":
                await handleInvoicePaymentFailed(event, stripe);
                break;
            case "charge.refunded":
                await handleChargeRefunded(event, stripe);
                break;
            default:
                logBillingStep("stripe_event_unknown", event.id, "ignored", "stripe_event_unknown", {
                    eventType,
                });
                await markStripeEventProcessed(event.id, eventType, { result: "ignored" }, db);
                res.status(200).send("OK (unknown event)");
                return;
        }

        logBillingStep("stripe_webhook_complete", event.id, "success", undefined, {
            eventType,
            durationMs: Date.now() - startTime,
        });
        res.status(200).send("OK");
    } catch (err: any) {
        logBillingStep("stripe_webhook_error", event.id, "error", undefined, {
            eventType,
            error: err.message,
            durationMs: Date.now() - startTime,
        });
        res.status(500).send("Internal Error");
    }
}

// ═══════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleCheckoutSessionCompleted(event: Stripe.Event, stripe: Stripe): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const mode = session.mode;

    if (mode === "subscription") {
        await handleSubscriptionCheckout(session, event, stripe);
    } else if (mode === "payment") {
        await handlePaymentCheckout(session, event, stripe);
    } else {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
    }
}

async function handleSubscriptionCheckout(
    session: Stripe.Checkout.Session,
    event: Stripe.Event,
    stripe: Stripe,
): Promise<void> {
    const clientRefId = session.client_reference_id;
    const customerEmail = session.customer_details?.email?.toLowerCase().trim();
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    let priceId: string | undefined;
    try {
        const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ["line_items"],
        });
        priceId = expandedSession.line_items?.data?.[0]?.price?.id;
    } catch (err: any) {
        logBillingStep("stripe_checkout_expand", event.id, "error", undefined, {
            error: err.message,
        });
    }
    const planInfo = priceId ? STRIPE_PRICE_TO_PLAN[priceId] : undefined;

    if (!planInfo || planInfo.plan === "keep_current") {
        logBillingStep("stripe_checkout_plan", event.id, "error", "stripe_price_unmapped", {
            priceId,
        });
        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId: stripeCustomerId ?? undefined,
            email: customerEmail,
            result: "ignored",
        }, db);
        return;
    }

    const plan = planInfo.plan;
    const billingType = planInfo.billingType as string;
    const isTrial = session.subscription != null && (await isSubscriptionTrialing(stripe, session.subscription as string));
    const credits = isTrial ? 50 : (PLAN_CREDITS[plan] ?? 0);

    if (clientRefId) {
        // ─── In-app authenticated user (Path B) ───
        const uid = clientRefId;
        const userRef = db.collection("users").doc(uid);

        await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            const existing = snap.exists ? snap.data() : {};
            const updateData: Record<string, any> = {
                plan,
                credits,
                isTrial,
                billingType,
                billingStatus: isTrial ? "trialing" : "active",
                planUpdatedAt: FieldValue.serverTimestamp(),
            };

            if (stripeCustomerId && !existing?.stripeCustomerId) {
                updateData.stripeCustomerId = stripeCustomerId;
            }
            if (stripeSubscriptionId) {
                updateData.stripeSubscriptionId = stripeSubscriptionId;
            }

            tx.set(userRef, updateData, { merge: true });
        });

        await writeBillingState(uid, db);
        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId: stripeCustomerId ?? undefined,
            stripeSubscriptionId: stripeSubscriptionId ?? undefined,
            email: customerEmail,
            result: "applied",
        }, db);

        logBillingStep("stripe_checkout_inapp", event.id, "success", undefined, {
            uid,
            plan,
            isTrial,
        });

        // GHL sync — trial.started or subscription.created
        try {
            const notify = getNotifyGHL();
            const eventType = isTrial ? "trial.started" : "subscription.created";
            await notify(uid, eventType, {
                plan,
                billingStatus: isTrial ? "trialing" : "active",
                credits,
                billingType,
                stripeCustomerId: stripeCustomerId ?? null,
                stripeSubscriptionId: stripeSubscriptionId ?? null,
                eventId: event.id,
            });
        } catch { /* fire-and-forget */ }
    } else if (customerEmail) {
        // ─── GHL funnel user (Path A) — write to pending_plans ───
        await db.collection("pending_plans").doc(customerEmail).set({
            email: customerEmail,
            plan,
            credits,
            isTrial,
            billingType,
            stripeCustomerId: stripeCustomerId ?? null,
            stripeSubscriptionId: stripeSubscriptionId ?? null,
            purchasedAt: FieldValue.serverTimestamp(),
            sourceEventId: event.id,
        });

        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId: stripeCustomerId ?? undefined,
            stripeSubscriptionId: stripeSubscriptionId ?? undefined,
            email: customerEmail,
            result: "applied",
        }, db);

        logBillingStep("stripe_checkout_pending", event.id, "success", undefined, {
            email: customerEmail,
            plan,
        });

        // GHL sync for pending user — fire and forget
        try {
            const notify = getNotifyGHL();
            const eventType = isTrial ? "trial.started" : "subscription.created";
            await notify(customerEmail, eventType, {
                plan,
                billingStatus: isTrial ? "trialing" : "active",
                credits,
                billingType,
                stripeCustomerId: stripeCustomerId ?? null,
                stripeSubscriptionId: stripeSubscriptionId ?? null,
                eventId: event.id,
            });
        } catch { /* fire-and-forget */ }
    } else {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
    }
}

async function handlePaymentCheckout(
    session: Stripe.Checkout.Session,
    event: Stripe.Event,
    _stripe: Stripe,
): Promise<void> {
    const isTopUp = session.metadata?.isTopUp === "true";
    if (!isTopUp) {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
        return;
    }

    const uid = session.metadata?.firebaseUid;
    const creditAmount = parseInt(session.metadata?.creditAmount ?? "0", 10);

    if (!uid || !creditAmount) {
        logBillingStep("stripe_topup_metadata", event.id, "error", undefined, {
            metadata: session.metadata,
        });
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
        return;
    }

    const userRef = db.collection("users").doc(uid);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) {
            throw new Error(`User ${uid} not found`);
        }
        const currentCredits = snap.data()?.credits ?? 0;
        tx.update(userRef, {
            credits: currentCredits + creditAmount,
            lastTopup: FieldValue.serverTimestamp(),
            lastTopupPack: `topup_${creditAmount}`,
        });
    });

    await writeBillingState(uid, db);
    await markStripeEventProcessed(event.id, event.type, {
        email: session.metadata?.firebaseUid,
        result: "applied",
    }, db);

    logBillingStep("stripe_topup_applied", event.id, "success", undefined, {
        uid,
        creditAmount,
    });

    // GHL sync — top_up.completed
    try {
        const notify = getNotifyGHL();
        await notify(uid, "top_up.completed", {
            creditAmount,
            eventId: event.id,
        });
    } catch { /* fire-and-forget */ }
}

async function handleSubscriptionCreated(event: Stripe.Event, stripe: Stripe): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const firebaseUid = subscription.metadata?.firebaseUid;
    const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    const stripeSubscriptionId = subscription.id;

    const priceId = subscription.items.data[0]?.price?.id;
    const planInfo = priceId ? STRIPE_PRICE_TO_PLAN[priceId] : undefined;

    if (firebaseUid) {
        // ─── Application-level dedup ───
        const userDoc = await db.collection("users").doc(firebaseUid).get();
        if (userDoc.exists && userDoc.data()?.stripeSubscriptionId === stripeSubscriptionId) {
            logBillingStep("stripe_sub_created_dedup", event.id, "duplicate", "stripe_event_duplicate", {
                uid: firebaseUid,
                subId: stripeSubscriptionId,
            });
            await markStripeEventProcessed(event.id, event.type, {
                stripeCustomerId: stripeCustomerId ?? undefined,
                stripeSubscriptionId,
                result: "noop_dual_event",
            }, db);
            return;
        }

        if (!planInfo || planInfo.plan === "keep_current") {
            await markStripeEventProcessed(event.id, event.type, {
                stripeCustomerId: stripeCustomerId ?? undefined,
                stripeSubscriptionId,
                result: "ignored",
            }, db);
            return;
        }

        const plan = planInfo.plan;
        const billingType = planInfo.billingType as string;
        const isTrial = subscription.status === "trialing";
        const credits = isTrial ? 50 : (PLAN_CREDITS[plan] ?? 0);

        const userRef = db.collection("users").doc(firebaseUid);
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            const existing = snap.exists ? snap.data() : {};
            const updateData: Record<string, any> = {
                plan,
                credits,
                isTrial,
                billingType,
                billingStatus: isTrial ? "trialing" : "active",
                planUpdatedAt: FieldValue.serverTimestamp(),
            };
            if (stripeCustomerId && !existing?.stripeCustomerId) {
                updateData.stripeCustomerId = stripeCustomerId;
            }
            if (stripeSubscriptionId) {
                updateData.stripeSubscriptionId = stripeSubscriptionId;
            }
            tx.set(userRef, updateData, { merge: true });
        });

        await writeBillingState(firebaseUid, db);
        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId: stripeCustomerId ?? undefined,
            stripeSubscriptionId,
            email: undefined,
            result: "applied",
        }, db);

        logBillingStep("stripe_sub_created_inapp", event.id, "success", undefined, {
            uid: firebaseUid,
            plan,
        });
    } else if (stripeCustomerId) {
        // ─── No firebaseUid — GHL path — write to pending_plans ───
        let email: string | undefined;
        try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            email = (customer as Stripe.Customer).email?.toLowerCase().trim();
        } catch { /* customer lookup failed */ }

        if (email && planInfo && planInfo.plan !== "keep_current") {
            const plan = planInfo.plan;
            const billingType = planInfo.billingType as string;
            const isTrial = subscription.status === "trialing";
            const credits = isTrial ? 50 : (PLAN_CREDITS[plan] ?? 0);

            await db.collection("pending_plans").doc(email).set({
                email,
                plan,
                credits,
                isTrial,
                billingType,
                stripeCustomerId,
                stripeSubscriptionId,
                purchasedAt: FieldValue.serverTimestamp(),
                sourceEventId: event.id,
            });

            await markStripeEventProcessed(event.id, event.type, {
                stripeCustomerId,
                stripeSubscriptionId,
                email,
                result: "applied",
            }, db);
        } else {
            await markStripeEventProcessed(event.id, event.type, {
                stripeCustomerId,
                stripeSubscriptionId,
                email,
                result: "ignored",
            }, db);
        }
    } else {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
    }
}

async function handleSubscriptionUpdated(event: Stripe.Event, _stripe: Stripe): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    const stripeSubscriptionId = subscription.id;
    const status = subscription.status;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end;
    const currentPeriodEnd = subscription.items.data[0]?.current_period_end as number | undefined;
    const priceId = subscription.items.data[0]?.price?.id;
    const planInfo = priceId ? STRIPE_PRICE_TO_PLAN[priceId] : undefined;

    // Find user by stripeCustomerId
    const usersSnap = await db.collection("users")
        .where("stripeCustomerId", "==", stripeCustomerId)
        .limit(1)
        .get();

    if (usersSnap.empty) {
        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId: stripeCustomerId ?? undefined,
            stripeSubscriptionId,
            result: "ignored",
        }, db);
        return;
    }

    const userDoc = usersSnap.docs[0];
    const uid = userDoc.id;
    const existingData = userDoc.data();
    const previousStatus = existingData.billingStatus as string;
    const previousIsTrial = existingData.isTrial === true;

    const updateData: Record<string, any> = {};

    // ─── Trial → Active conversion ───
    if (previousIsTrial && status === "active") {
        const plan = planInfo?.plan ?? existingData.plan;
        updateData.isTrial = false;
        updateData.billingStatus = "active";
        updateData.plan = plan;
        updateData.credits = PLAN_CREDITS[plan] ?? existingData.credits;
        updateData.planUpdatedAt = FieldValue.serverTimestamp();
    }
    // ─── Price change (plan change) ───
    else if (planInfo && planInfo.plan !== "keep_current" && !previousIsTrial) {
        const newPlan = planInfo.plan;
        if (newPlan !== existingData.plan) {
            updateData.plan = newPlan;
            updateData.credits = PLAN_CREDITS[newPlan] ?? 0;
            updateData.billingType = planInfo.billingType as string;
            updateData.planUpdatedAt = FieldValue.serverTimestamp();
        }
    }

    // ─── cancel_at_period_end toggle ───
    if (cancelAtPeriodEnd && status !== "canceled") {
        updateData.cancelAtPeriodEnd = true;
        updateData.billingStatus = "cancelling";
        const periodEndMs = (currentPeriodEnd ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60) * 1000;
        updateData.cancelAt = admin.firestore.Timestamp.fromDate(new Date(periodEndMs));
    } else if (!cancelAtPeriodEnd && previousStatus === "cancelling") {
        updateData.cancelAtPeriodEnd = false;
        updateData.billingStatus = "active";
        updateData.cancelAt = FieldValue.delete();
    }

    if (Object.keys(updateData).length > 0) {
        await db.collection("users").doc(uid).update(updateData);
        await writeBillingState(uid, db);
    }

    await markStripeEventProcessed(event.id, event.type, {
        stripeCustomerId: stripeCustomerId ?? undefined,
        stripeSubscriptionId,
        result: "applied",
    }, db);

    // GHL sync — subscription.created on trial→active conversion
    if (previousIsTrial && status === "active") {
        try {
            const notify = getNotifyGHL();
            await notify(uid, "subscription.created", {
                plan: updateData.plan ?? existingData.plan,
                billingStatus: "active",
                credits: updateData.credits ?? existingData.credits,
                eventId: event.id,
            });
        } catch { /* fire-and-forget */ }
    }

    logBillingStep("stripe_sub_updated", event.id, "success", undefined, {
        uid,
        status,
        cancelAtPeriodEnd,
    });
}

async function handleSubscriptionDeleted(event: Stripe.Event, _stripe: Stripe): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

    const usersSnap = await db.collection("users")
        .where("stripeCustomerId", "==", stripeCustomerId)
        .limit(1)
        .get();

    if (usersSnap.empty) {
        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId: stripeCustomerId ?? undefined,
            stripeSubscriptionId: subscription.id,
            result: "ignored",
        }, db);
        return;
    }

    const uid = usersSnap.docs[0].id;

    await db.collection("users").doc(uid).update({
        plan: "none",
        credits: 0,
        billingStatus: "cancelled",
        isTrial: false,
        stripeSubscriptionId: FieldValue.delete(),
        cancelAtPeriodEnd: FieldValue.delete(),
        cancelAt: FieldValue.delete(),
        cancelledAt: FieldValue.serverTimestamp(),
        planUpdatedAt: FieldValue.serverTimestamp(),
    });

    await writeBillingState(uid, db);
    await markStripeEventProcessed(event.id, event.type, {
        stripeCustomerId: stripeCustomerId ?? undefined,
        stripeSubscriptionId: subscription.id,
        result: "applied",
    }, db);

    logBillingStep("stripe_sub_deleted", event.id, "success", undefined, { uid });

    // GHL sync — subscription.cancelled
    try {
        const notify = getNotifyGHL();

        // Look for cancellation_logs for this uid to get reason
        let cancellationReason: string | null = null;
        let cancelAt: string | null = null;
        try {
            const logsSnap = await db.collection("cancellation_logs")
                .where("uid", "==", uid)
                .orderBy("createdAt", "desc")
                .limit(1)
                .get();
            if (!logsSnap.empty) {
                const logData = logsSnap.docs[0].data();
                cancellationReason = logData.reason ?? null;
                cancelAt = logData.cancelAt
                    ? new Date((logData.cancelAt as any).seconds * 1000).toISOString()
                    : null;
            }
        } catch { /* non-critical */ }

        await notify(uid, "subscription.cancelled", {
            plan: "none",
            billingStatus: "cancelled",
            credits: 0,
            cancelAt,
            cancellationReason,
            eventId: event.id,
        });
    } catch { /* fire-and-forget */ }
}

async function handleInvoicePaymentSucceeded(event: Stripe.Event, _stripe: Stripe): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const billingReason = invoice.billing_reason;

    // Skip initial subscription_create — credits already set by checkout.session.completed
    if (billingReason === "subscription_create") {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
        return;
    }

    // Only reset credits on subscription_cycle renewals
    if (billingReason !== "subscription_cycle") {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
        logBillingStep("stripe_payment_succeeded_skip", event.id, "ignored", undefined, {
            billingReason: billingReason ?? "unknown",
        });
        return;
    }

    const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!stripeCustomerId) {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
        return;
    }

    const usersSnap = await db.collection("users")
        .where("stripeCustomerId", "==", stripeCustomerId)
        .limit(1)
        .get();

    if (usersSnap.empty) {
        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId,
            result: "ignored",
        }, db);
        return;
    }

    const uid = usersSnap.docs[0].id;
    const userData = usersSnap.docs[0].data();
    const previousStatus = userData.billingStatus as string;

    const plan = userData.plan as string;
    const credits = PLAN_CREDITS[plan] ?? 0;
    const periodEnd = invoice.lines?.data?.[0]?.period?.end || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const nextResetDate = admin.firestore.Timestamp.fromDate(new Date(periodEnd * 1000));

    await db.collection("users").doc(uid).update({
        credits,
        nextCreditReset: nextResetDate,
        lastCreditReset: FieldValue.serverTimestamp(),
    });

    // Clear past_due if this is a recovery
    if (previousStatus === "past_due") {
        await db.collection("users").doc(uid).update({
            billingStatus: "active",
            billingIssueAt: FieldValue.delete(),
            billingIssueType: FieldValue.delete(),
            gracePeriodEndsAt: FieldValue.delete(),
        });
    }

    await writeBillingState(uid, db);
    await markStripeEventProcessed(event.id, event.type, {
        stripeCustomerId,
        result: "applied",
    }, db);

    logBillingStep("stripe_payment_succeeded", event.id, "success", undefined, {
        uid,
        billingReason: billingReason ?? "unknown",
    });

    // GHL sync — payment.recovered if was past_due
    if (previousStatus === "past_due") {
        try {
            const notify = getNotifyGHL();
            await notify(uid, "payment.recovered", {
                plan,
                billingStatus: "active",
                credits,
                eventId: event.id,
                amount: invoice.amount_paid ? invoice.amount_paid / 100 : undefined,
            });
        } catch { /* fire-and-forget */ }
    }
}

async function handleInvoicePaymentFailed(event: Stripe.Event, _stripe: Stripe): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

    if (!stripeCustomerId) {
        await markStripeEventProcessed(event.id, event.type, { result: "ignored" }, db);
        return;
    }

    const usersSnap = await db.collection("users")
        .where("stripeCustomerId", "==", stripeCustomerId)
        .limit(1)
        .get();

    if (usersSnap.empty) {
        await markStripeEventProcessed(event.id, event.type, {
            stripeCustomerId,
            result: "ignored",
        }, db);
        return;
    }

    const uid = usersSnap.docs[0].id;
    const gracePeriodEndsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    await db.collection("users").doc(uid).update({
        billingStatus: "past_due",
        billingIssueAt: FieldValue.serverTimestamp(),
        billingIssueType: "payment_failed",
        gracePeriodEndsAt: admin.firestore.Timestamp.fromDate(gracePeriodEndsAt),
    });

    await writeBillingState(uid, db);
    await markStripeEventProcessed(event.id, event.type, {
        stripeCustomerId,
        result: "applied",
    }, db);

    logBillingStep("stripe_payment_failed", event.id, "success", undefined, { uid });

    // GHL sync — payment.failed
    try {
        const notify = getNotifyGHL();
        await notify(uid, "payment.failed", {
            billingStatus: "past_due",
            eventId: event.id,
            amount: invoice.amount_due ? invoice.amount_due / 100 : undefined,
        });
    } catch { /* fire-and-forget */ }
}

async function handleChargeRefunded(event: Stripe.Event, stripe: Stripe): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const isFullRefund = charge.amount_refunded === charge.amount;
    const refundAmount = charge.amount_refunded / 100;

    if (!isFullRefund) {
        // ─── Partial refund — log only ───
        logBillingStep("stripe_refund_partial", event.id, "success", "refund_processed", {
            chargeId: charge.id,
            amount: refundAmount,
            source: "partial",
        });
        await markStripeEventProcessed(event.id, event.type, {
            result: "partial_refund_logged",
        }, db);
        return;
    }

    // ─── Determine if subscription or top-up ───
    const metadata = charge.metadata || {};
    const isTopUp = metadata.isTopUp === "true";

    if (isTopUp) {
        // ─── Full top-up refund — deduct credits ───
        const uid = metadata.firebaseUid;
        const creditAmount = parseInt(metadata.creditAmount ?? "0", 10);

        if (uid && creditAmount > 0) {
            let deducted = 0;
            await db.runTransaction(async (tx) => {
                const userRef = db.collection("users").doc(uid);
                const snap = await tx.get(userRef);
                if (!snap.exists) return;
                const currentCredits = snap.data()?.credits ?? 0;
                deducted = Math.min(currentCredits, creditAmount);
                tx.update(userRef, { credits: currentCredits - deducted });
            });

            await writeBillingState(uid, db);

            // Write refund_logs
            await db.collection("refund_logs").doc(`${uid}_${Date.now()}`).set({
                uid,
                email: metadata.email ?? null,
                chargeId: charge.id,
                paymentIntentId: charge.payment_intent as string ?? null,
                sessionId: metadata.sessionId ?? null,
                creditAmountDeducted: deducted,
                amount: refundAmount,
                reason: metadata.reason ?? null,
                createdAt: FieldValue.serverTimestamp(),
                sourceEventId: event.id,
            });

            logBillingStep("stripe_refund_topup", event.id, "success", "refund_processed", {
                chargeId: charge.id,
                amount: refundAmount,
                source: "topup",
                creditAmountDeducted: deducted,
            });
        }
        // NO GHL POST for top-up refunds
        await markStripeEventProcessed(event.id, event.type, { result: "applied" }, db);
    } else {
        // ─── Full subscription refund ───
        const stripeCustomerId = typeof charge.customer === "string" ? charge.customer : undefined;
        let uid: string | undefined;

        if (stripeCustomerId) {
            const usersSnap = await db.collection("users")
                .where("stripeCustomerId", "==", stripeCustomerId)
                .limit(1)
                .get();
            if (!usersSnap.empty) {
                uid = usersSnap.docs[0].id;
            }
        }

        if (uid) {
            // Write cancellation_logs BEFORE cancelling (so GHL can read reason)
            await db.collection("cancellation_logs").doc(`${uid}_${Date.now()}`).set({
                uid,
                email: metadata.email ?? null,
                plan: (await db.collection("users").doc(uid).get()).data()?.plan ?? "none",
                reason: "refund",
                feedback: metadata.reason ?? null,
                cancelAt: null,
                createdAt: FieldValue.serverTimestamp(),
            });

            // Cancel subscription via Stripe API → customer.subscription.deleted fires → GHL POST
            const stripeSubscriptionId = (await db.collection("users").doc(uid).get()).data()?.stripeSubscriptionId;
            if (stripeSubscriptionId) {
                try {
                    await stripe.subscriptions.cancel(stripeSubscriptionId);
                } catch (err: any) {
                    logBillingStep("stripe_refund_cancel_sub", event.id, "error", undefined, {
                        error: err.message,
                    });
                }
            }
        }

        logBillingStep("stripe_refund_subscription", event.id, "success", "refund_processed", {
            chargeId: charge.id,
            amount: refundAmount,
            source: "subscription",
        });
        await markStripeEventProcessed(event.id, event.type, { result: "applied" }, db);
    }
}
