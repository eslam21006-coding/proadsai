// functions/src/stripe/stripeCheckout.ts — createStripeCheckoutSession + createStripeTopUpSession implementations

import type Stripe from "stripe";
import * as admin from "firebase-admin";
import { createStripeClient, STRIPE_PRICE_TO_PLAN, STRIPE_TOPUP_PRICES } from "./stripeClient.js";

const db = admin.firestore();

export async function createStripeCheckoutSessionImpl(
    uid: string,
    email: string,
    priceId: string,
    stripeSecretKey: string,
): Promise<{ checkoutUrl: string }> {
    const planInfo = STRIPE_PRICE_TO_PLAN[priceId];
    if (!planInfo || planInfo.plan === "keep_current") {
        throw new Error("Invalid priceId");
    }

    const stripe = createStripeClient(stripeSecretKey);
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const existingCustomerId = userData?.stripeCustomerId as string | undefined;

    const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: uid,
        metadata: { firebaseUid: uid },
        subscription_data: {
            trial_period_days: 7,
            metadata: { firebaseUid: uid },
        },
        automatic_tax: { enabled: true },
        ...(existingCustomerId
            ? { customer: existingCustomerId }
            : { customer_email: email.toLowerCase().trim() }),
        success_url: "https://app.proadsai.com/billing?paid=1",
        cancel_url: "https://app.proadsai.com/billing?canceled=1",
    });

    return { checkoutUrl: session.url! };
}

export async function createStripeTopUpSessionImpl(
    uid: string,
    email: string,
    creditAmount: number,
    priceId: string,
    stripeSecretKey: string,
): Promise<{ checkoutUrl: string }> {
    if (![100, 300, 800].includes(creditAmount)) {
        throw new Error("Invalid creditAmount");
    }

    if (!Object.values(STRIPE_TOPUP_PRICES).includes(priceId)) {
        throw new Error("Invalid top-up priceId");
    }

    // Enforce creditAmount ↔ priceId pairing — otherwise a caller could pay for the
    // 100-credit pack but request 800 credits in metadata, and the refund/audit trail
    // would be inconsistent with what Stripe actually charged.
    const expectedPriceId = STRIPE_TOPUP_PRICES[creditAmount];
    if (expectedPriceId !== priceId) {
        throw new Error("Credit amount does not match price ID");
    }

    const stripe = createStripeClient(stripeSecretKey);
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const existingCustomerId = userData?.stripeCustomerId as string | undefined;

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
            firebaseUid: uid,
            isTopUp: "true",
            creditAmount: String(creditAmount),
        },
        payment_intent_data: {
            metadata: {
                firebaseUid: uid,
                isTopUp: "true",
                creditAmount: String(creditAmount),
            },
        },
        automatic_tax: { enabled: true },
        ...(existingCustomerId
            ? { customer: existingCustomerId }
            : { customer_email: email.toLowerCase().trim() }),
        success_url: "https://app.proadsai.com/billing?topup=1",
        cancel_url: "https://app.proadsai.com/billing?topup_canceled=1",
    });

    return { checkoutUrl: session.url! };
}
