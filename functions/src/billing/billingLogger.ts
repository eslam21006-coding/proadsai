// functions/src/billing/billingLogger.ts — structured logging for all billing pipeline steps

export type BillingErrorCode =
    // Stripe-era codes (FR-026 vocabulary)
    | "stripe_signature_invalid"
    | "stripe_event_duplicate"
    | "stripe_event_unknown"
    | "stripe_price_unmapped"
    | "ghl_sync_failed"
    | "portal_session_generation_failed"
    | "user_doc_missing"
    | "pending_plan_write_failed"
    | "billing_state_write_failed"
    | "refund_processed";

export interface BillingLogEntry {
    step: string;
    eventId?: string;
    eventType?: string;
    userId?: string;
    email?: string;
    status: "success" | "error" | "ignored" | "duplicate";
    errorCode?: BillingErrorCode;
    durationMs?: number;
    extra?: Record<string, unknown>;
}

export function logBillingStep(
    step: string,
    eventId: string | undefined,
    status: BillingLogEntry["status"],
    errorCode?: BillingErrorCode,
    extra?: Record<string, unknown>,
): void {
    const entry: BillingLogEntry = {
        step,
        eventId,
        status,
        ...(errorCode && { errorCode }),
        ...(extra && { extra }),
    };

    const emoji = status === "error" ? "🔥" : status === "duplicate" ? "⚠️" : status === "ignored" ? "⏭️" : "✅";
    const label = errorCode ? `[${errorCode}]` : "";
    console.log(`${emoji} BILLING ${step} ${label} ${status}`, JSON.stringify(entry));
}
