// functions/src/billing/ghlBillingSync.ts — fire-and-forget GHL sync for Stripe billing events (6-URL routing)

import * as admin from "firebase-admin";
import { logBillingStep } from "./billingLogger.js";
import { createStripeClient } from "../stripe/stripeClient.js";

const db = admin.firestore();

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
}

interface ResolvedUser {
    email: string;
    displayName: string | null;
    stripeCustomerId: string | null;
}

async function resolveUser(identifier: string): Promise<ResolvedUser> {
    if (identifier.includes("@")) {
        return {
            email: identifier.toLowerCase().trim(),
            displayName: null,
            stripeCustomerId: null,
        };
    }

    try {
        const doc = await db.collection("users").doc(identifier).get();
        if (doc.exists) {
            const data = doc.data()!;
            return {
                email: (data.email || "").toLowerCase().trim(),
                displayName: data.displayName ?? data.email ?? null,
                stripeCustomerId: data.stripeCustomerId ?? null,
            };
        }
    } catch { /* user doc read failed */ }

    return { email: identifier, displayName: null, stripeCustomerId: null };
}

function splitName(displayName: string | null): { first_name: string | null; last_name: string | null } {
    if (!displayName) return { first_name: null, last_name: null };
    const idx = displayName.indexOf(" ");
    if (idx === -1) return { first_name: displayName, last_name: null };
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
            email: user.email,
            first_name,
            last_name,
            plan: payloadFields.plan ?? "none",
            billing_status: payloadFields.billingStatus ?? "none",
            is_trial: payloadFields.billingStatus === "trialing",
            credits: payloadFields.credits ?? 0,
            billing_type: payloadFields.billingType ?? "monthly",
            currency: "USD",
            amount: payloadFields.amount ?? 0,
            trial_end_date: null,
            trial_end_date_human: null,
            next_billing_date: null,
            next_billing_date_human: null,
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

// ─── Backward compat for paddleWebhook (Paddle code still imports these) ───
// These will be removed in Phase 13 when Paddle code is deleted.

export async function notifyGHLFailed(
    _identifier: string,
    _event: string,
    _webhookUrl: string,
    _updatePaymentUrl?: string,
): Promise<void> {
    // No-op: Paddle GHL sync replaced by Stripe-based notifyGHL
}
