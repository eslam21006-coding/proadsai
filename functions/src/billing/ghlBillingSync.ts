// functions/src/billing/ghlBillingSync.ts — fire-and-forget GHL sync for billing events

import * as admin from "firebase-admin";
import { logBillingStep } from "./billingLogger.js";

const db = admin.firestore();

interface GHLSyncPayload {
    email: string;
    contactName: string;
    plan?: string;
    billingStatus?: string;
    event: string;
    credits?: number;
    paddleSubscriptionId?: string;
    updatePaymentUrl?: string;
}

interface GHLFailedPayload {
    email: string;
    contactName: string;
    event: string;
    updatePaymentUrl?: string;
}

async function resolveIdentifier(
    identifier: string,
): Promise<{ email: string; displayName: string }> {
    if (identifier.includes("@")) {
        return { email: identifier.toLowerCase().trim(), displayName: "" };
    }

    try {
        const doc = await db.collection("users").doc(identifier).get();
        if (doc.exists) {
            const data = doc.data();
            return {
                email: (data?.email || "").toLowerCase().trim(),
                displayName: data?.displayName || data?.email || "",
            };
        }
    } catch {
        // user doc read failed
    }

    return { email: identifier, displayName: "" };
}

export async function notifyGHL(
    identifier: string,
    event: string,
    webhookUrl: string,
    extra?: {
        plan?: string;
        billingStatus?: string;
        credits?: number;
        paddleSubscriptionId?: string;
        updatePaymentUrl?: string;
    },
): Promise<void> {
    try {
        const { email, displayName } = await resolveIdentifier(identifier);
        if (!email) return;

        const payload: GHLSyncPayload = {
            email,
            contactName: displayName,
            event,
            ...extra,
        };

        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            logBillingStep("ghl_sync", undefined, "error", "ghl_sync_failed", {
                event,
                email,
                httpStatus: res.status,
            });
        }
    } catch (err: any) {
        logBillingStep("ghl_sync", undefined, "error", "ghl_sync_failed", {
            event,
            identifier,
            error: err?.message,
        });
    }
}

export async function notifyGHLFailed(
    identifier: string,
    event: string,
    webhookUrl: string,
    updatePaymentUrl?: string,
): Promise<void> {
    try {
        const { email, displayName } = await resolveIdentifier(identifier);
        if (!email) return;

        const payload: GHLFailedPayload = {
            email,
            contactName: displayName,
            event,
            updatePaymentUrl,
        };

        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            logBillingStep("ghl_failed_sync", undefined, "error", "ghl_sync_failed", {
                event,
                email,
                httpStatus: res.status,
            });
        }
    } catch (err: any) {
        logBillingStep("ghl_failed_sync", undefined, "error", "ghl_sync_failed", {
            event,
            identifier,
            error: err?.message,
        });
    }
}
