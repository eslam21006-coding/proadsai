// functions/src/paddle/paddleSubscriptions.ts — subscription CRUD via Paddle

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { Firestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { createPaddleClient, findUserByPaddleCustomerId, findUserByEmail } from "./paddleClient.js";
import { writeBillingState } from "../billing/billingState.js";

async function resolvePaddleCustomerId(uid: string, paddle: any, db: Firestore): Promise<string> {
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) throw new HttpsError("not-found", "User not found.");

    if (userData.paddleCustomerId) return userData.paddleCustomerId;

    const email = userData.email;
    if (!email) throw new HttpsError("not-found", "No email on account.");

    try {
            const customers = await paddle.customers.list({ email: [email.toLowerCase().trim()], perPage: 1 });
            const items = await customers.next();
            if (items && items.length > 0) {
                const customerId = items[0].id;
                await db.collection("users").doc(uid).update({ paddleCustomerId: customerId });
                return customerId;
            }
    } catch {
        // fall through
    }

    throw new HttpsError("not-found", "No Paddle customer found. Contact support.");
}

export async function paddleGetSubscription(request: CallableRequest, apiKey: string, db: Firestore) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const paddle = createPaddleClient(apiKey);
    const customerId = await resolvePaddleCustomerId(request.auth.uid, paddle, db);

    try {
        const subs = await paddle.subscriptions.list({ customerId: [customerId], perPage: 1 });
        const subItems = await subs.next();
        if (!subItems || subItems.length === 0) {
            return { status: "none", plan: "none" };
        }

        const sub = subItems[0];
        const nextBill = sub.nextBilledAt
            ? Math.floor(new Date(sub.nextBilledAt).getTime() / 1000)
            : null;
        const startedAt = sub.startedAt
            ? Math.floor(new Date(sub.startedAt).getTime() / 1000)
            : null;

        return {
            subscriptionId: sub.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.scheduledChange?.action === "cancel",
            currentPeriodEnd: nextBill,
            currentPeriodStart: startedAt,
            priceId: sub.items?.[0]?.price?.id || "",
            amount: Number(sub.items?.[0]?.price?.unitPrice?.amount || 0) / 100,
            interval: sub.billingCycle?.interval || "month",
            paymentMethod: null,
        };
    } catch (err: any) {
        console.error("Paddle get subscription error:", err.message);
        throw new HttpsError("internal", "Failed to fetch subscription: " + err.message);
    }
}

export async function paddleCancelSubscription(
    request: CallableRequest,
    apiKey: string,
    ghlCancelUrl: string | undefined,
    db: Firestore,
) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { reason, feedback } = request.data || {};
    const uid = request.auth.uid;

    const callerDoc = await db.collection("users").doc(uid).get();
    const callerData = callerDoc.data();
    if (callerData?.isTeamMember) {
        throw new HttpsError("failed-precondition", "Team members cannot cancel.");
    }

    const paddle = createPaddleClient(apiKey);
    const customerId = await resolvePaddleCustomerId(uid, paddle, db);

    try {
        const subs = await paddle.subscriptions.list({ customerId: [customerId], perPage: 1 });
        const subItems = await subs.next();
        if (!subItems || subItems.length === 0) {
            throw new HttpsError("not-found", "No active subscription found.");
        }

        const sub = subItems[0];
        const effectiveAt = sub.nextBilledAt || new Date().toISOString();

        await paddle.subscriptions.cancel(sub.id, { effectiveFrom: "next_billing_period" });

        await db.collection("users").doc(uid).update({
            cancelAtPeriodEnd: true,
            billingStatus: "cancelling",
            cancelAt: admin.firestore.Timestamp.fromDate(new Date(effectiveAt)),
            cancellationReason: reason || "",
            cancellationFeedback: feedback || "",
            cancellationDate: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (ghlCancelUrl) {
            try {
                await fetch(ghlCancelUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: callerData?.email || "",
                        contact_id: callerData?.ghlContactId || "",
                        action: "cancellation_requested",
                        reason: reason || "",
                        feedback: feedback || "",
                        plan: callerData?.plan || "",
                        source: "paddle",
                    }),
                });
            } catch (ghlErr: any) {
                console.warn(`⚠️ GHL notification failed (non-critical): ${ghlErr.message}`);
            }
        }

        await writeBillingState(uid, db);
        console.log(`❌ Paddle cancellation scheduled: ${uid}`);
        return { success: true, currentPeriodEnd: Math.floor(new Date(effectiveAt).getTime() / 1000) };
    } catch (err: any) {
        if (err instanceof HttpsError) throw err;
        console.error("Paddle cancel error:", err.message);
        throw new HttpsError("internal", "Failed to cancel: " + err.message);
    }
}

export async function paddleReactivateSubscription(request: CallableRequest, apiKey: string, db: Firestore) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;
    const callerDoc = await db.collection("users").doc(uid).get();
    const callerData = callerDoc.data();
    if (callerData?.isTeamMember) {
        throw new HttpsError("failed-precondition", "Team members cannot manage billing.");
    }
    if (!callerData?.cancelAtPeriodEnd && callerData?.billingStatus !== "cancelling") {
        throw new HttpsError("failed-precondition", "No pending cancellation to reactivate.");
    }

    const paddle = createPaddleClient(apiKey);
    const customerId = await resolvePaddleCustomerId(uid, paddle, db);

    try {
        const subs = await paddle.subscriptions.list({ customerId: [customerId], perPage: 1 });
        const subItems = await subs.next();
        if (!subItems || subItems.length === 0) {
            throw new HttpsError("not-found", "No subscription found.");
        }

        await paddle.subscriptions.update(subItems[0].id, {
            scheduledChange: null,
        });

        await db.collection("users").doc(uid).update({
            billingStatus: "active",
            cancelAtPeriodEnd: false,
            cancelledAt: admin.firestore.FieldValue.delete(),
            cancellationReason: admin.firestore.FieldValue.delete(),
            cancellationFeedback: admin.firestore.FieldValue.delete(),
            cancellationDate: admin.firestore.FieldValue.delete(),
            billingIssueAt: admin.firestore.FieldValue.delete(),
            billingIssueType: admin.firestore.FieldValue.delete(),
            gracePeriodEndsAt: admin.firestore.FieldValue.delete(),
        });

        await writeBillingState(uid, db);
        console.log(`✅ Paddle reactivated: ${uid}`);
        return { success: true };
    } catch (err: any) {
        if (err instanceof HttpsError) throw err;
        throw new HttpsError("internal", "Failed to reactivate: " + err.message);
    }
}

export async function paddleChangePlan(request: CallableRequest, apiKey: string, db: Firestore) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { newPriceId } = request.data || {};
    if (!newPriceId) throw new HttpsError("invalid-argument", "Missing newPriceId.");

    const uid = request.auth.uid;
    const paddle = createPaddleClient(apiKey);
    const customerId = await resolvePaddleCustomerId(uid, paddle, db);

    try {
        const subs = await paddle.subscriptions.list({ customerId: [customerId], status: ["active"], perPage: 1 });
        const subItems = await subs.next();
        if (!subItems || subItems.length === 0) {
            throw new HttpsError("not-found", "No active subscription found.");
        }

        const sub = subItems[0];
        if (!sub.items || sub.items.length === 0) throw new HttpsError("internal", "Subscription has no items.");

        await paddle.subscriptions.update(sub.id, {
            items: [{ priceId: newPriceId, quantity: 1 }],
            prorationBillingMode: "prorated_immediately",
            scheduledChange: null,
        });

        await db.collection("users").doc(uid).update({
            cancelAtPeriodEnd: false,
        });

        console.log(`🔄 Paddle plan changed: ${uid} → ${newPriceId}`);
        return { success: true, newPriceId };
    } catch (err: any) {
        if (err instanceof HttpsError) throw err;
        throw new HttpsError("internal", "Failed to change plan: " + err.message);
    }
}
