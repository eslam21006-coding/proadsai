// functions/src/stripe/stripePortal.ts — createStripePortalSession implementation

import { createStripeClient } from "./stripeClient.js";
import * as admin from "firebase-admin";

// NOTE: Do NOT cache `admin.firestore()` at module load — this file is imported
// before `admin.initializeApp()` runs, which fails Firebase deploy analysis.
// Always call inline.

export async function createStripePortalSessionImpl(
    uid: string,
    flow?: "subscription_cancel" | "payment_method_update",
    returnUrl?: string,
    stripeSecretKey?: string,
): Promise<{ portalUrl: string }> {
    if (!stripeSecretKey) {
        throw new Error("stripeSecretKey is required");
    }

    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData: Record<string, any> = userDoc.exists ? (userDoc.data() as Record<string, any>) : {};
    const stripeCustomerId = userData.stripeCustomerId as string | undefined;

    if (!stripeCustomerId) {
        const error = new Error("No stripeCustomerId on user document");
        (error as any).code = "failed-precondition";
        throw error;
    }

    if (flow === "subscription_cancel" && !userData.stripeSubscriptionId) {
        const error = new Error("No stripeSubscriptionId for subscription_cancel flow");
        (error as any).code = "failed-precondition";
        throw error;
    }

    const stripe = createStripeClient(stripeSecretKey);
    const return_url = returnUrl ?? "https://app.proadsai.com/billing";

    const sessionParams: any = {
        customer: stripeCustomerId,
        return_url,
    };

    if (flow === "subscription_cancel") {
        sessionParams.flow_data = {
            type: "subscription_cancel",
            subscription_cancel: { subscription: userData.stripeSubscriptionId },
        };
    } else if (flow === "payment_method_update") {
        sessionParams.flow_data = {
            type: "payment_method_update",
        };
    }

    const session = await stripe.billingPortal.sessions.create(sessionParams);

    return { portalUrl: session.url };
}
