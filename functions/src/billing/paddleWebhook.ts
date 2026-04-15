// functions/src/billing/paddleWebhook.ts — Paddle webhook handler with signature verification, idempotency, and event routing

import { Response, Request } from "express";
import { Paddle } from "@paddle/paddle-node-sdk";
import { Firestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { isEventProcessed, markEventProcessed, writeBillingState } from "./billingState.js";
import { logBillingStep } from "./billingLogger.js";
import { notifyGHL, notifyGHLFailed } from "./ghlBillingSync.js";

export interface PaddleWebhookDeps {
    db: Firestore;
    paddleApiKey: string;
    webhookSecret: string;
    ghlSyncUrl: string;
    ghlFailedUrl: string;
    priceToPlan: Record<string, { plan: string; credits: number }>;
    topupPrices: Record<string, { priceId: string; credits: number }>;
}

const SUPPORTED_EVENTS = [
    "subscription.created",
    "subscription.updated",
    "subscription.canceled",
    "subscription.past_due",
    "transaction.completed",
    "transaction.payment_failed",
];

export async function handlePaddleWebhook(
    req: Request,
    res: Response,
    deps: PaddleWebhookDeps,
): Promise<void> {
    if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
    }

    const signature = req.headers["paddle-signature"] as string;
    if (!signature) {
        logBillingStep("webhook_received", undefined, "error", "paddle_signature_invalid");
        res.status(400).send("Missing paddle-signature header");
        return;
    }

    const raw = (req as any).rawBody;
    const rawBody = typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
            ? raw.toString("utf-8")
            : JSON.stringify(req.body);

    let eventData: any;
    try {
        const paddle = new Paddle(deps.paddleApiKey);
        eventData = paddle.webhooks.unmarshal(rawBody, deps.webhookSecret, signature);
    } catch (err: any) {
        logBillingStep("webhook_received", undefined, "error", "paddle_signature_invalid", {
            error: err?.message,
        });
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    const eventType = eventData.eventType as string;
    const eventId = eventData.eventId as string;

    logBillingStep("signature_verified", eventId, "success", undefined, { eventType });

    if (await isEventProcessed(eventId, deps.db)) {
        logBillingStep("duplicate_check", eventId, "duplicate", "paddle_event_duplicate", { eventType });
        res.status(200).send("Duplicate event — already processed");
        return;
    }

    if (!SUPPORTED_EVENTS.includes(eventType)) {
        logBillingStep("event_routing", eventId, "ignored", "paddle_event_unknown", { eventType });
        await markEventProcessed(eventId, eventType, { result: "ignored" }, deps.db);
        res.status(200).send("Ignored — unknown event type");
        return;
    }

    const start = Date.now();

    try {
        switch (eventType) {
            case "subscription.created":
                await handleSubscriptionCreated(eventData, deps);
                break;
            case "subscription.updated":
                await handleSubscriptionUpdated(eventData, deps);
                break;
            case "subscription.canceled":
                await handleSubscriptionCanceled(eventData, deps);
                break;
            case "subscription.past_due":
                await handleSubscriptionPastDue(eventData, deps);
                break;
            case "transaction.completed":
                await handleTransactionCompleted(eventData, deps);
                break;
            case "transaction.payment_failed":
                await handleTransactionPaymentFailed(eventData, deps);
                break;
        }

        const durationMs = Date.now() - start;
        logBillingStep("event_processed", eventId, "success", undefined, { eventType, durationMs });
        await markEventProcessed(eventId, eventType, {
            paddleCustomerId: eventData.data?.customerId,
            paddleSubscriptionId: eventData.data?.id,
            email: eventData.data?.customerEmail || eventData.data?.customData?.email,
            result: "applied",
        }, deps.db);

        res.status(200).send("OK");
    } catch (err: any) {
        const durationMs = Date.now() - start;
        logBillingStep("event_processed", eventId, "error", "billing_state_write_failed", {
            eventType,
            durationMs,
            error: err?.message,
        });
        res.status(500).send("Internal error");
    }
}

// ═══════════════════════════════════════════════════════════
// T021 — subscription.created
// Dual-write: firebaseUid → users/{uid}, no firebaseUid → pending_plans/{email}
// ═══════════════════════════════════════════════════════════

async function handleSubscriptionCreated(event: any, deps: PaddleWebhookDeps): Promise<void> {
    const sub = event.data;
    const customData = sub.customData || {};
    const firebaseUid: string | undefined = customData.firebaseUid;
    const email: string = sub.customer?.email || customData.email || "";
    const priceId = sub.items?.[0]?.price?.id;
    const paddleSubscriptionId = sub.id;
    const paddleCustomerId = sub.customerId;
    const managementUrls = sub.managementUrls || {};
    const isTrial = sub.billingCycle?.interval === "trial" || sub.status === "trialing";

    const planMapping = deps.priceToPlan[priceId];
    if (!planMapping) {
        logBillingStep("subscription_created", event.eventId, "error", "paddle_price_unmapped", {
            priceId,
        });
        return;
    }

    const updateFields: Record<string, any> = {
        plan: planMapping.plan,
        credits: planMapping.credits,
        isTrial,
        billingStatus: "active",
        paddleCustomerId,
        paddleSubscriptionId,
        paddleUpdatePaymentUrl: managementUrls.updatePaymentMethod || null,
        paddleCancelUrl: managementUrls.cancel || null,
        planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (firebaseUid) {
        logBillingStep("subscription_created_user", event.eventId, "success", undefined, {
            uid: firebaseUid,
            plan: planMapping.plan,
        });
        await deps.db.collection("users").doc(firebaseUid).update(updateFields);
        await writeBillingState(firebaseUid, deps.db);
        notifyGHL(firebaseUid, "subscription.created", deps.ghlSyncUrl, {
            plan: planMapping.plan,
            billingStatus: "active",
            credits: planMapping.credits,
            paddleSubscriptionId,
            updatePaymentUrl: managementUrls.updatePaymentMethod,
        }).catch(() => {});
    } else if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        logBillingStep("subscription_created_pending", event.eventId, "success", undefined, {
            email: normalizedEmail,
            plan: planMapping.plan,
        });
        await deps.db.collection("pending_plans").doc(normalizedEmail).set({
            email: normalizedEmail,
            ...updateFields,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourceEventId: event.eventId,
        }, { merge: true });
        notifyGHL(normalizedEmail, "subscription.created", deps.ghlSyncUrl, {
            plan: planMapping.plan,
            billingStatus: "active",
            credits: planMapping.credits,
            paddleSubscriptionId,
        }).catch(() => {});
    }
}

// ═══════════════════════════════════════════════════════════
// T022 — subscription.updated
// Locate user by paddleSubscriptionId, refresh plan + managementUrls
// ═══════════════════════════════════════════════════════════

async function handleSubscriptionUpdated(event: any, deps: PaddleWebhookDeps): Promise<void> {
    const sub = event.data;
    const paddleSubscriptionId = sub.id;
    const managementUrls = sub.managementUrls || {};
    const priceId = sub.items?.[0]?.price?.id;

    const userSnap = await deps.db.collection("users")
        .where("paddleSubscriptionId", "==", paddleSubscriptionId)
        .limit(1)
        .get();

    if (userSnap.empty) {
        logBillingStep("subscription_updated", event.eventId, "error", "user_doc_missing", {
            paddleSubscriptionId,
        });
        return;
    }

    const userDoc = userSnap.docs[0];
    const uid = userDoc.id;
    const userData = userDoc.data();
    const updateFields: Record<string, any> = {
        paddleUpdatePaymentUrl: managementUrls.updatePaymentMethod || null,
        paddleCancelUrl: managementUrls.cancel || null,
        planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const planMapping = deps.priceToPlan[priceId];
    if (planMapping && planMapping.plan !== userData.plan) {
        updateFields.plan = planMapping.plan;
        updateFields.credits = planMapping.credits;
        logBillingStep("subscription_updated_plan_change", event.eventId, "success", undefined, {
            uid,
            oldPlan: userData.plan,
            newPlan: planMapping.plan,
        });
    }

    if (sub.status === "active" && userData.gracePeriodEndsAt) {
        updateFields.billingStatus = "active";
        updateFields.gracePeriodEndsAt = admin.firestore.FieldValue.delete();
        updateFields.billingIssueAt = admin.firestore.FieldValue.delete();
    }

    await deps.db.collection("users").doc(uid).update(updateFields);
    await writeBillingState(uid, deps.db);
    notifyGHL(uid, "subscription.updated", deps.ghlSyncUrl, {
        plan: updateFields.plan || userData.plan,
        billingStatus: updateFields.billingStatus || userData.billingStatus || "active",
        credits: updateFields.credits || userData.credits,
        paddleSubscriptionId,
        updatePaymentUrl: managementUrls.updatePaymentMethod,
    }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// T023 — subscription.canceled
// Set plan='none', billingStatus='cancelled', credits=0
// ═══════════════════════════════════════════════════════════

async function handleSubscriptionCanceled(event: any, deps: PaddleWebhookDeps): Promise<void> {
    const sub = event.data;
    const paddleSubscriptionId = sub.id;

    const userSnap = await deps.db.collection("users")
        .where("paddleSubscriptionId", "==", paddleSubscriptionId)
        .limit(1)
        .get();

    if (userSnap.empty) {
        logBillingStep("subscription_canceled", event.eventId, "error", "user_doc_missing", {
            paddleSubscriptionId,
        });
        return;
    }

    const uid = userSnap.docs[0].id;

    await deps.db.collection("users").doc(uid).update({
        plan: "none",
        billingStatus: "cancelled",
        credits: 0,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logBillingStep("subscription_canceled", event.eventId, "success", undefined, { uid });
    await writeBillingState(uid, deps.db);
    notifyGHL(uid, "subscription.canceled", deps.ghlSyncUrl, {
        plan: "none",
        billingStatus: "cancelled",
        credits: 0,
        paddleSubscriptionId,
    }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// T024 — subscription.past_due
// Set billingStatus='past_due', gracePeriodEndsAt=now+2days. Do NOT zero credits.
// ═══════════════════════════════════════════════════════════

async function handleSubscriptionPastDue(event: any, deps: PaddleWebhookDeps): Promise<void> {
    const sub = event.data;
    const paddleSubscriptionId = sub.id;
    const managementUrls = sub.managementUrls || {};

    const userSnap = await deps.db.collection("users")
        .where("paddleSubscriptionId", "==", paddleSubscriptionId)
        .limit(1)
        .get();

    if (userSnap.empty) {
        logBillingStep("subscription_past_due", event.eventId, "error", "user_doc_missing", {
            paddleSubscriptionId,
        });
        return;
    }

    const uid = userSnap.docs[0].id;
    const graceEnd = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    );

    await deps.db.collection("users").doc(uid).update({
        billingStatus: "past_due",
        billingIssueAt: admin.firestore.FieldValue.serverTimestamp(),
        gracePeriodEndsAt: graceEnd,
    });

    logBillingStep("subscription_past_due", event.eventId, "success", undefined, { uid });
    await writeBillingState(uid, deps.db);
    notifyGHLFailed(uid, "past_due", deps.ghlFailedUrl, managementUrls.updatePaymentMethod).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// T025 — transaction.completed
// If customData.isTopUp, add credits via Firestore transaction
// ═══════════════════════════════════════════════════════════

async function handleTransactionCompleted(event: any, deps: PaddleWebhookDeps): Promise<void> {
    const tx = event.data;
    const customData = tx.customData || {};

    if (customData.isTopUp !== true) {
        logBillingStep("transaction_completed", event.eventId, "success", undefined, {
            note: "ignored — not a top-up",
        });
        return;
    }

    const firebaseUid: string | undefined = customData.firebaseUid;
    const creditAmount: number = parseInt(customData.creditAmount || "0", 10);

    if (!firebaseUid || !creditAmount) {
        logBillingStep("transaction_completed_topup", event.eventId, "error", "user_doc_missing", {
            firebaseUid,
            creditAmount,
        });
        return;
    }

    const userRef = deps.db.collection("users").doc(firebaseUid);

    await deps.db.runTransaction(async (firestoreTx) => {
        const snap = await firestoreTx.get(userRef);
        if (!snap.exists) return;

        const currentCredits = snap.data()?.credits || 0;
        firestoreTx.update(userRef, {
            credits: currentCredits + creditAmount,
            lastTopup: admin.firestore.FieldValue.serverTimestamp(),
            lastTopupPack: `topup_${creditAmount}`,
        });
    });

    logBillingStep("transaction_completed_topup", event.eventId, "success", undefined, {
        uid: firebaseUid,
        creditAmount,
    });
    await writeBillingState(firebaseUid, deps.db);
    notifyGHL(firebaseUid, "topup", deps.ghlSyncUrl, {
        credits: creditAmount,
    }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════
// T026 — transaction.payment_failed
// Locate user by customerId, set past_due + grace period
// ═══════════════════════════════════════════════════════════

async function handleTransactionPaymentFailed(event: any, deps: PaddleWebhookDeps): Promise<void> {
    const tx = event.data;
    const paddleCustomerId = tx.customerId;
    if (!paddleCustomerId) return;

    const userSnap = await deps.db.collection("users")
        .where("paddleCustomerId", "==", paddleCustomerId)
        .limit(1)
        .get();

    if (userSnap.empty) {
        logBillingStep("transaction_payment_failed", event.eventId, "error", "user_doc_missing", {
            paddleCustomerId,
        });
        return;
    }

    const uid = userSnap.docs[0].id;
    const userData = userSnap.docs[0].data();

    const updateFields: Record<string, any> = {
        billingStatus: "past_due",
        billingIssueAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!userData.gracePeriodEndsAt) {
        updateFields.gracePeriodEndsAt = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        );
    }

    await deps.db.collection("users").doc(uid).update(updateFields);

    logBillingStep("transaction_payment_failed", event.eventId, "success", undefined, { uid });
    await writeBillingState(uid, deps.db);
    notifyGHLFailed(uid, "payment_failed", deps.ghlFailedUrl, userData.paddleUpdatePaymentUrl).catch(() => {});
}
