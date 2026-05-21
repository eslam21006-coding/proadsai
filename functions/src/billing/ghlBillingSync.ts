// functions/src/billing/ghlBillingSync.ts — fire-and-forget GHL sync for Stripe billing events (6-URL routing)

import * as admin from "firebase-admin";
import { logBillingStep } from "./billingLogger.js";
import { createStripeClient } from "../stripe/stripeClient.js";

// NOTE: Do NOT cache `admin.firestore()` at module load — this file is imported
// before `admin.initializeApp()` runs, which fails Firebase deploy analysis
// with "The default Firebase app does not exist". Always call inline.

export type GHLEventType =
    | "trial.started"
    | "subscription.created"
    | "payment.recovered"
    | "payment.failed"
    | "subscription.cancelled"
    | "top_up.completed";

interface GHLPayloadFields {
    plan?: string;
    billingStatus?: string;
    credits?: number;
    billingType?: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    cancelAt?: string | null;
    cancellationReason?: string | null;
    creditAmount?: number;
    eventId?: string;
    amount?: number;
    /** ISO date string — rendered into trial_end_date_human via formatDateHuman. */
    trialEndDate?: string | null;
    /** ISO date string — rendered into next_billing_date_human via formatDateHuman. */
    nextBillingDate?: string | null;
    previousPlan?: string | null;
}

interface ResolvedUser {
    email: string;
    displayName: string | null;
    stripeCustomerId: string | null;
    ghlContactId: string | null;
}

async function resolveUser(identifier: string): Promise<ResolvedUser> {
    if (identifier.includes("@")) {
        return {
            email: identifier.toLowerCase().trim(),
            displayName: null,
            stripeCustomerId: null,
            ghlContactId: null,
        };
    }

    try {
        const doc = await admin.firestore().collection("users").doc(identifier).get();
        if (doc.exists) {
            const data = doc.data()!;
            return {
                email: (data.email || "").toLowerCase().trim(),
                displayName: data.displayName ?? null,
                stripeCustomerId: data.stripeCustomerId ?? null,
                ghlContactId: data.ghlContactId ?? null,
            };
        }
    } catch { /* user doc read failed */ }

    // No user doc found for this UID — return an empty email (NOT the UID) so callers
    // like notifyGHL skip the sync path instead of poisoning GHL with a UID-as-email.
    return { email: "", displayName: null, stripeCustomerId: null, ghlContactId: null };
}

function splitName(displayName: string | null): { first_name: string; last_name: string } {
    if (!displayName) return { first_name: "", last_name: "" };
    const idx = displayName.indexOf(" ");
    if (idx === -1) return { first_name: displayName, last_name: "" };
    return { first_name: displayName.substring(0, idx), last_name: displayName.substring(idx + 1) };
}

function formatDateHuman(isoDate: string | null): string | null {
    if (!isoDate) return null;
    try {
        const d = new Date(isoDate);
        return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
    } catch {
        return null;
    }
}

export async function notifyGHL(
    identifier: string,
    eventType: GHLEventType,
    payloadFields: GHLPayloadFields,
    secrets?: {
        stripeSecretKey?: string;
        urlByEvent?: Record<GHLEventType, () => string>;
    },
): Promise<void> {
    try {
        const user = await resolveUser(identifier);
        if (!user.email) return;

        const { first_name, last_name } = splitName(user.displayName);
        const stripeCustomerId = payloadFields.stripeCustomerId ?? user.stripeCustomerId;

        let portal_url: string | null = null;
        if (stripeCustomerId && secrets?.stripeSecretKey) {
            try {
                const stripe = createStripeClient(secrets.stripeSecretKey);
                const portalSession = await stripe.billingPortal.sessions.create({
                    customer: stripeCustomerId,
                    return_url: "https://app.proadsai.com/billing",
                });
                portal_url = portalSession.url;
            } catch (err: any) {
                logBillingStep("ghl_portal_generation", undefined, "error", "portal_session_generation_failed", {
                    error: err.message,
                });
            }
        }

        const urlByEvent = secrets?.urlByEvent;
        if (!urlByEvent) return;
        const urlFn = urlByEvent[eventType];
        if (!urlFn) return;
        const url = urlFn();

        const payload: Record<string, any> = {
            event_type: eventType,
            event_id: payloadFields.eventId ?? "",
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: payloadFields.stripeSubscriptionId ?? null,
            contact_id: user.ghlContactId,
            email: user.email,
            first_name,
            last_name,
            plan: payloadFields.plan ?? "none",
            previous_plan: payloadFields.previousPlan ?? null,
            billing_status: payloadFields.billingStatus ?? "none",
            is_trial: payloadFields.billingStatus === "trialing",
            credits: payloadFields.credits ?? 0,
            billing_type: payloadFields.billingType ?? "monthly",
            currency: "USD",
            amount: payloadFields.amount ?? 0,
            trial_end_date: payloadFields.trialEndDate ?? null,
            trial_end_date_human: formatDateHuman(payloadFields.trialEndDate ?? null),
            next_billing_date: payloadFields.nextBillingDate ?? null,
            next_billing_date_human: formatDateHuman(payloadFields.nextBillingDate ?? null),
            portal_url,
            cancel_at: payloadFields.cancelAt ?? null,
            cancellation_reason: payloadFields.cancellationReason ?? null,
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            logBillingStep("ghl_sync", undefined, "error", "ghl_sync_failed", {
                eventType,
                email: user.email,
                httpStatus: res.status,
            });
        }
    } catch (err: any) {
        logBillingStep("ghl_sync", undefined, "error", "ghl_sync_failed", {
            eventType,
            identifier,
            error: err.message,
        });
    }
}

export const URL_BY_EVENT_TEMPLATE: Record<GHLEventType, string> = {
    "trial.started": "GHL_TRIAL_STARTED_URL",
    "subscription.created": "GHL_PAYMENT_RECEIVED_URL",
    "payment.recovered": "GHL_RECOVERED_URL",
    "payment.failed": "GHL_OVERDUE_FAILED_URL",
    "subscription.cancelled": "GHL_CANCELLED_URL",
    "top_up.completed": "GHL_TOPUP_URL",
};
