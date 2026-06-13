/**
 * functions/src/index.ts
 * COMPLETE BACKEND: AI + Payment + Monthly Reset
 * FIXED: Explicit Project ID connection to solve "5 NOT_FOUND"
 */
import { onCall, onRequest, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Stripe from "stripe";
import * as crypto from "crypto";
import {
    resolveFirestoreEntitlement, checkFeature, checkCarouselSlides,
    checkAspectRatio, resolveCreditOwner,
    PLAN_CREDITS, TRIAL_CREDITS,
    type GatedFeature, type ResolvedEntitlement,
} from "./entitlements.js";
import { validateSelector } from "./selectorLimits.js";
import { writeBillingState } from "./billing/billingState.js";
import { assertOwner, assertWorkspaceActive, createWorkspaceWithLimit, resolveDefaultWorkspaceId } from "./workspaces/workspacePolicy.js";
import { enforceProjectQuota } from "./savedProjects/projectQuota.js";
import { deriveStatus } from "./savedProjects/projectStatus.js";
import { isArabic, scanAndReplace } from "./culturalCompliance.js";
// Re-export so Firebase deploys the callable from this module (main: lib/index.js).
export { getUserProjects } from "./savedProjects/getUserProjects.js";
import { probeMetaRole } from "./workspaces/metaRoleProbe.js";
import { writeAuditEntry } from "./workspaces/auditLog.js";
import { reflowImageHandler } from "./reflowImage.js";
import { purgeExpiredWorkspaces, cascadeReassignOnDelete, cascadeRevertOnRestore } from "./workspaces/workspacePurge.js";
import { handleStripeWebhook, setNotifyGHL } from "./billing/stripeWebhook.js";
import { createStripeCheckoutSessionImpl, createStripeTopUpSessionImpl } from "./stripe/stripeCheckout.js";
import { createStripePortalSessionImpl } from "./stripe/stripePortal.js";
import { notifyGHL, URL_BY_EVENT_TEMPLATE } from "./billing/ghlBillingSync.js";
import type { GHLEventType } from "./billing/ghlBillingSync.js";
import { STRIPE_PRICE_TO_PLAN } from "./stripe/stripeClient.js";
import { createOpenAIImageCaller } from "./openAIImageCaller.js";
import { MODEL_PROVIDER, OPENAI_VISUAL_MODEL } from "./modelConfig.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1. INITIALIZE APP (THE FIX IS HERE)
// ═══════════════════════════════════════════════════════════════════════════
admin.initializeApp({
    projectId: "proadsai-saas", // <--- THIS LINE FIXES THE "5 NOT_FOUND" ERROR
    storageBucket: "proadsai-saas.firebasestorage.app"
});

// Ignore `undefined` field values on ALL Firestore writes across the functions
// codebase (instead of throwing "Cannot use undefined as a Firestore value").
// Must be set once, before any Firestore operation — module load, immediately after
// initializeApp, is the correct and only safe place. Covers optional fields such as
// resolutionTrace.reflowHistory[].textReflowOverflow that may be omitted.
admin.firestore().settings({ ignoreUndefinedProperties: true });

// NOTE: Do NOT cache `admin.firestore()` at module load — this file is imported
// before `admin.initializeApp()` runs in Firebase deploy analysis, which fails
// with "The default Firebase app does not exist". Always call inline.

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const ghlWebhookSecret = defineSecret("GHL_WEBHOOK_SECRET");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const metaAppId = defineSecret("META_APP_ID");
const ghlTeamInviteUrl = defineSecret("GHL_TEAM_INVITE_WEBHOOK_URL");
const metaAppSecret = defineSecret("META_APP_SECRET");
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const falApiKey = defineSecret("FAL_API_KEY");

// ─── STRIPE SECRETS ──────────────────────────────────────────────────────────
// stripeWebhookSecret is declared later near the deprecated stripeWebhook function
// and reused by the new Stripe webhook handler.
const ghlTrialStartedUrl = defineSecret("GHL_TRIAL_STARTED_URL");
const ghlPaymentReceivedUrl = defineSecret("GHL_PAYMENT_RECEIVED_URL");
const ghlRecoveredUrl = defineSecret("GHL_RECOVERED_URL");
const ghlOverdueFailedUrl = defineSecret("GHL_OVERDUE_FAILED_URL");
const ghlCancelledUrl = defineSecret("GHL_CANCELLED_URL");
const ghlTopupUrl = defineSecret("GHL_TOPUP_URL");

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
// Monthly credit allocation per paid-plan tier. Used by the GHL Route-3 webhooks
// to populate `creditsPerMonth` on user docs / pending_plans so the frontend
// progress bar has a non-zero denominator even before the first Stripe renewal
// invoice lands. Trial users still get `creditsPerMonth` of their target plan
// (not the 50-credit trial pool) so the bar reads as "50 of 800" etc.
const CREDITS_PER_MONTH: Record<string, number> = {
    starter: 800,
    pro: 2500,
    scale: 6500,
};

const PLAN_MAP: Record<string, { plan: string; credits: number; isTrial?: boolean; billingType: 'monthly' | 'annual' | 'one_time' }> = {
    // Simple names (for GHL automations)
    'starter': { plan: 'starter', credits: 800, billingType: 'monthly' },
    'pro': { plan: 'pro', credits: 2500, billingType: 'monthly' },
    'scale': { plan: 'scale', credits: 6500, billingType: 'monthly' },
    // Trial plans — full features, 50 credits
    'starter_trial': { plan: 'starter', credits: 50, isTrial: true, billingType: 'monthly' },
    'pro_trial': { plan: 'pro', credits: 50, isTrial: true, billingType: 'monthly' },
    'scale_trial': { plan: 'scale', credits: 50, isTrial: true, billingType: 'monthly' },
    // Full names
    'starter_monthly': { plan: 'starter', credits: 800, billingType: 'monthly' },
    'starter_annual': { plan: 'starter', credits: 800, billingType: 'annual' },
    'pro_monthly': { plan: 'pro', credits: 2500, billingType: 'monthly' },
    'pro_annual': { plan: 'pro', credits: 2500, billingType: 'annual' },
    'scale_monthly': { plan: 'scale', credits: 6500, billingType: 'monthly' },
    'scale_annual': { plan: 'scale', credits: 6500, billingType: 'annual' },
    // GHL display-name variants (Title Case with space) — sent verbatim by some GHL product configs
    'Starter Monthly': { plan: 'starter', credits: 800, billingType: 'monthly' },
    'Starter Annual': { plan: 'starter', credits: 800, billingType: 'annual' },
    'Pro Monthly': { plan: 'pro', credits: 2500, billingType: 'monthly' },
    'Pro Annual': { plan: 'pro', credits: 2500, billingType: 'annual' },
    'Scale Monthly': { plan: 'scale', credits: 6500, billingType: 'monthly' },
    'Scale Annual': { plan: 'scale', credits: 6500, billingType: 'annual' },
    // Top-ups
    'topup_100': { plan: 'keep_current', credits: 100, billingType: 'one_time' },
    'topup_300': { plan: 'keep_current', credits: 300, billingType: 'one_time' },
    'topup_800': { plan: 'keep_current', credits: 800, billingType: 'one_time' },
};

// All costs are strictly linear: unit cost × count. No bundling, no discounts.
// Must stay in sync with src/planconfig.ts CREDIT_COSTS.
const COSTS: Record<string, number> = {
    generateHooks: 4, refreshHooks: 4, editOneHook: 1,
    generateCarouselCopies: 1, generateConcepts: 3, editOneConcept: 1,
    buildPlan: 0, generateImage: 5, polishImage: 5, reflowImage: 5,
    analyzePolishes: 1, generateCaption: 1, refineCaption: 1,
    editRegion: 5,
    competitorResearch: 5,
    brandUrlScraping: 3,
};

const ACTION_FEATURE_MAP: Record<string, string> = {
    competitorResearch: "competitorResearch",
    brandUrlScraping: "brandUrlScraping",
    generateImage: "visualPolishes",
    polishImage: "visualPolishes",
    reflowImage: "visualPolishes",
    editRegion: "regionEditing",
};

// ─── MODEL CONSTANTS (single source of truth) ───────────────────────────
const CREATIVE_MODEL_PRO = "gemini-3.1-pro-preview"; // First generation
const CREATIVE_MODEL_LITE = "gemini-3.1-pro-preview"; // Regenerations
const LOGIC_MODEL = "gemini-2.5-flash-lite";
const VISUAL_MODEL = "gemini-3.1-flash-image";

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE AI GENERATOR (Don't lose this!)
// ═══════════════════════════════════════════════════════════════════════════
export const generateCreative = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "2GiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const callerId = request.auth.uid;
    const { action, modelName, prompt, imageBase64, jsonSchema, mimeType } = request.data;
    const cost = COSTS[action] || 1;

    // ═══ ENTITLEMENT: Resolve team member → owner credit pool ═══
    const { creditOwnerUid, teamRole } = await resolveCreditOwner(callerId);
    if (teamRole === 'viewer') {
        throw new HttpsError("permission-denied", "Viewers cannot perform credit-consuming actions.");
    }

    try {
        // Transaction: Deduct Credits from correct account (owner for team members)
        await admin.firestore().runTransaction(async (transaction) => {
            const userRef = admin.firestore().collection("users").doc(creditOwnerUid);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new HttpsError("not-found", "User not found.");

            const currentCredits = userDoc.data()?.credits || 0;
            if (currentCredits < cost) throw new HttpsError("resource-exhausted", "Insufficient credits.");

            transaction.update(userRef, {
                credits: currentCredits - cost,
                lastActivity: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        // Call Gemini
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({ model: modelName });
        let result;

        if (imageBase64) {
            result = await model.generateContent([
                prompt, { inlineData: { mimeType: mimeType || "image/png", data: imageBase64 } }
            ]);
        } else if (jsonSchema) {
            const structuredModel = genAI.getGenerativeModel({
                model: modelName, generationConfig: { responseMimeType: "application/json", responseSchema: jsonSchema }
            });
            result = await structuredModel.generateContent(prompt);
        } else {
            result = await model.generateContent(prompt);
        }

        return { success: true, data: result.response.text(), costDeducted: cost };
    } catch (error: any) {
        console.error("AI Error:", error);
        throw new HttpsError("internal", "AI Failed: " + error.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers for Route 3 hybrid (GHL native trigger → Firebase → GHL inbound)
// ═══════════════════════════════════════════════════════════════════════════
// Split a Firestore-stored displayName on the first space.
// If there is no space, first_name = full string, last_name = null.
// If displayName is null/undefined, both are null.
function splitDisplayName(displayName: string | undefined | null): {
    first_name: string | null;
    last_name: string | null;
} {
    if (!displayName) return { first_name: null, last_name: null };
    const idx = displayName.indexOf(" ");
    if (idx === -1) return { first_name: displayName, last_name: null };
    return { first_name: displayName.substring(0, idx), last_name: displayName.substring(idx + 1) };
}

// Pre-signup purchases live in pending_plans/{email} (keyed by lowercase email) until the
// customer creates an account. The GHL cancel/failed/recovered webhooks read users/{uid}
// for their payload fields; when no auth user exists yet, fall back to this so those events
// still carry the real plan/billing_type instead of empty defaults.
interface PendingPlanDoc {
    plan?: string;
    credits?: number;
    isTrial?: boolean;
    billingType?: string;
    ghlContactId?: string;
}

async function loadPendingPlan(normalizedEmail: string): Promise<PendingPlanDoc | null> {
    // No blanket catch: a missing doc returns null, while a real Firestore failure propagates to
    // the caller's handler-level try/catch so lookup failures are surfaced, not silently hidden.
    const snap = await admin.firestore().collection("pending_plans").doc(normalizedEmail).get();
    return snap.exists ? (snap.data() as PendingPlanDoc) : null;
}

// Build the canonical 21-field GHL inbound payload and POST it fire-and-forget.
// Caller must handle: any user-doc reads, plan/credits resolution, and stripeCustomerId
// lookup. This helper is intentionally dumb — it just shapes and sends.
async function postGHLInboundPayload(opts: {
    url: string;
    event_type: string;
    email: string;
    plan: string;
    credits: number;
    billing_status: string;
    is_trial: boolean;
    amount: number;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    ghl_contact_id?: string | null;
    billing_type?: string;
    first_name?: string | null;
    last_name?: string | null;
    previous_plan?: string | null;
    cancel_at?: string | null;
    cancellation_reason?: string | null;
}): Promise<void> {
    try {
        const payload = {
            event_type: opts.event_type,
            event_id: "ghl_" + Date.now(),
            stripe_customer_id: opts.stripe_customer_id ?? null,
            stripe_subscription_id: opts.stripe_subscription_id ?? null,
            contact_id: opts.ghl_contact_id ?? null,
            email: opts.email,
            first_name: opts.first_name ?? null,
            last_name: opts.last_name ?? null,
            plan: opts.plan,
            previous_plan: opts.previous_plan ?? null,
            billing_status: opts.billing_status,
            is_trial: opts.is_trial,
            credits: opts.credits,
            billing_type: opts.billing_type ?? "monthly",
            currency: "USD",
            amount: opts.amount,
            trial_end_date: null,
            trial_end_date_human: null,
            next_billing_date: null,
            next_billing_date_human: null,
            portal_url: null,
            cancel_at: opts.cancel_at ?? null,
            cancellation_reason: opts.cancellation_reason ?? null,
        };
        const res = await fetch(opts.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            console.warn(`⚠️ GHL inbound notify failed (${res.status}) for ${opts.email} [${opts.event_type}]`);
        } else {
            console.log(`📤 GHL inbound notify sent: ${opts.event_type} for ${opts.email}`);
        }
    } catch (err: any) {
        console.warn(`⚠️ GHL inbound notify error (${opts.event_type}, non-critical):`, err?.message ?? err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. THE GHL PAYMENT WEBHOOK (The "Cash Register")
// ═══════════════════════════════════════════════════════════════════════════
// Route 3 hybrid: GHL order forms charge via GHL's own Stripe connection (our
// stripeWebhook never fires), so this function still runs in production and must
// be exported. The "DEPRECATED" note below predates the Route-3 design.
// DEPRECATED: replaced by Stripe webhook + notifyGHL
export const ghlpaymentwebhook = onRequest({
    region: "europe-west1",
    cors: true,
    secrets: [ghlWebhookSecret, stripeSecretKey, ghlTrialStartedUrl, ghlPaymentReceivedUrl, ghlTopupUrl],
}, async (req, res) => {
    // ═══ SECURITY: Only accept POST with valid secret ═══
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    const secret = req.headers['x-ghl-secret'];
    if (secret !== ghlWebhookSecret.value()) {
        console.error('Webhook auth failed — invalid or missing secret.');
        res.status(401).send('Unauthorized');
        return;
    }

    const data = req.body;
    console.log("💰 Webhook Received:", JSON.stringify(data));

    // GHL sends custom fields inside customData — extract from both places
    const customData = data.customData || {};
    const email = data.email || customData.email || '';
    const productId = data.product_id || customData.product_id || '';
    const contactId = data.contact_id || customData.contact_id || '';
    const rawCredits = data.credits || customData.credits || 0;

    if (!email) {
        res.status(400).send({ status: "FAIL", message: "Missing email" });
        return;
    }

    // Map GHL Product to Credits
    let finalCredits = typeof rawCredits === 'string' ? parseInt(rawCredits) || 0 : rawCredits;
    let finalPlan = data.plan || customData.plan || 'starter';
    let isTopup = false;
    let billingTypeValue: 'monthly' | 'annual' | 'one_time' = 'monthly';

    // Check if GHL sends trial flag directly — parse as string OR boolean (GHL
    // serializes booleans as the literal strings "true"/"false" in customData).
    // `let` because the PLAN_MAP block below can still flip this to true when
    // the product itself is a trial SKU.
    const rawIsTrial = data.is_trial ?? customData.is_trial ?? false;
    let isTrial = rawIsTrial === true || rawIsTrial === 'true';

    if (productId && PLAN_MAP[productId]) {
        const mapped = PLAN_MAP[productId];
        finalCredits = mapped.credits;
        billingTypeValue = mapped.billingType;
        if (mapped.isTrial) isTrial = true;
        if (mapped.plan === 'keep_current') {
            isTopup = true;
        } else {
            finalPlan = mapped.plan;
        }
    }
    if (finalCredits === 0) finalCredits = isTrial ? 50 : 800; // Trial=50, otherwise fallback to starter

    const normalizedEmail = email.toLowerCase().trim();

    // ═══ AUTO-LOOKUP STRIPE CUSTOMER ID ═══
    // GHL uses Stripe to process payments. We look up the Stripe customer
    // by email so we can save it in Firestore for the Customer Portal.
    let stripeCustomerId = data.stripe_customer_id || ""; // GHL might send it
    if (!stripeCustomerId) {
        try {
            const stripe = new Stripe(stripeSecretKey.value());
            const customers = await stripe.customers.list({ email: normalizedEmail, limit: 1 });
            if (customers.data.length > 0) {
                stripeCustomerId = customers.data[0].id;
                console.log(`🔗 Found Stripe customer: ${stripeCustomerId} for ${normalizedEmail}`);
            }
        } catch (stripeErr: any) {
            console.warn("⚠️ Stripe customer lookup failed (non-critical):", stripeErr.message);
        }
    }

    try {
        // Check if user already has a Firebase Auth account
        let existingUser: admin.auth.UserRecord | null = null;
        try {
            existingUser = await admin.auth().getUserByEmail(normalizedEmail);
        } catch {
            // No Firebase account yet — that's fine
        }

        if (existingUser) {
            // ═══ User already signed into app → update "users" collection directly ═══
            const userRef = admin.firestore().collection("users").doc(existingUser.uid);

            if (isTopup) {
                const topupData: Record<string, any> = {
                    credits: admin.firestore.FieldValue.increment(finalCredits),
                    lastTopup: admin.firestore.FieldValue.serverTimestamp(),
                };
                if (stripeCustomerId) topupData.stripeCustomerId = stripeCustomerId;
                await userRef.update(topupData);
                console.log(`Top-up: +${finalCredits} credits for ${normalizedEmail}`);
                await writeBillingState(existingUser.uid, admin.firestore());
            } else {
                await userRef.set({
                    plan: finalPlan,
                    credits: finalCredits,
                    creditsPerMonth: CREDITS_PER_MONTH[finalPlan] ?? 0,
                    isTrial: isTrial,
                    billingStatus: 'active',
                    billingType: billingTypeValue,
                    planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ghlContactId: contactId,
                    ...(stripeCustomerId ? { stripeCustomerId } : {}),
                }, { merge: true });
                console.log(`Plan set: ${normalizedEmail} → ${finalPlan}${isTrial ? ' (trial)' : ''} (${finalCredits} credits)${stripeCustomerId ? ` [Stripe: ${stripeCustomerId}]` : ''}`);
                await writeBillingState(existingUser.uid, admin.firestore());
            }
        } else {
            // ═══ User hasn't signed into app yet → save to "pending_plans" ═══
            // App.tsx checks this collection on first sign-in
            await admin.firestore().collection("pending_plans").doc(normalizedEmail).set({
                plan: isTopup ? "none" : finalPlan,
                credits: finalCredits,
                creditsPerMonth: CREDITS_PER_MONTH[isTopup ? "none" : finalPlan] ?? 0,
                isTopup: isTopup,
                isTrial: isTrial,
                billingType: billingTypeValue,
                ghlContactId: contactId,
                ...(stripeCustomerId ? { stripeCustomerId } : {}),
                purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Pending plan saved: ${normalizedEmail} → plan:${finalPlan}, credits:${finalCredits}, product_id:${productId}`);
        }

        // ═══ Route 3: notify GHL inbound webhook so CRM automations fire ═══
        // GHL order forms charge through their own Stripe connection, so our
        // stripeWebhook handler never sees these events and notifyGHL() is never
        // called. Replicate that hop here with the full 21-field payload.
        // Fire-and-forget — log on failure but never block the 200 response.
        let firstName: string | null = null;
        let lastName: string | null = null;
        let stripeSubscriptionId: string | null = null;
        let ghlContactIdValue: string | null = contactId || null;
        if (existingUser) {
            try {
                const snap = await admin.firestore().collection("users").doc(existingUser.uid).get();
                const userData = snap.data() ?? {};
                const split = splitDisplayName(userData.displayName);
                firstName = split.first_name;
                lastName = split.last_name;
                stripeSubscriptionId = userData.stripeSubscriptionId ?? null;
                ghlContactIdValue = userData.ghlContactId ?? ghlContactIdValue;
            } catch { /* non-critical — fields stay null */ }
        }

        let ghlInboundUrl: string;
        let eventType: string;
        let billingStatus: string;
        if (isTrial) {
            ghlInboundUrl = ghlTrialStartedUrl.value();
            eventType = "trial.started";
            billingStatus = "trialing";
        } else if (isTopup) {
            ghlInboundUrl = ghlTopupUrl.value();
            eventType = "top_up.completed";
            billingStatus = "active";
        } else {
            ghlInboundUrl = ghlPaymentReceivedUrl.value();
            eventType = "payment.received";
            billingStatus = "active";
        }

        const rawAmount = data.amount || customData.amount || 0;
        const amount = typeof rawAmount === "number"
            ? rawAmount
            : (parseFloat(rawAmount ?? "0") || 0);

        await postGHLInboundPayload({
            url: ghlInboundUrl,
            event_type: eventType,
            email: normalizedEmail,
            plan: finalPlan,
            credits: finalCredits,
            billing_status: billingStatus,
            is_trial: isTrial,
            amount,
            stripe_customer_id: stripeCustomerId || null,
            stripe_subscription_id: stripeSubscriptionId,
            ghl_contact_id: ghlContactIdValue,
            billing_type: billingTypeValue,
            first_name: firstName,
            last_name: lastName,
        });

        res.status(200).send({ success: true, email: normalizedEmail, credits: finalCredits, plan: finalPlan });

    } catch (error: any) {
        console.error("🔥 DB Write Failed:", error);
        res.status(200).send({
            status: "DB_ERROR",
            message: "Could not write to Firestore",
            details: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MONTHLY CREDIT RESET
// ═══════════════════════════════════════════════════════════════════════════
export const monthlyCreditsReset = onSchedule({
    schedule: '0 0 1 * *',
    timeZone: 'UTC',
    region: 'europe-west1'
}, async () => {
    const PLAN_LIMITS: Record<string, number> = {
        starter: 800, pro: 2500, scale: 6500
    };

    // ═══ RESET PAID USERS ═══
    const usersSnap = await admin.firestore().collection('users')
        .where('plan', 'in', ['starter', 'pro', 'scale'])
        .get();

    if (!usersSnap.empty) {
        const batchSize = 500;
        const docs = usersSnap.docs;

        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = admin.firestore().batch();
            const chunk = docs.slice(i, i + batchSize);

            for (const userDoc of chunk) {
                const data = userDoc.data();
                const plan = data.plan;
                // Skip team members — they don't have their own credits.
                if (data.isTeamMember) continue;
                // Skip trial users — paid-plan monthly refill does NOT apply to trials.
                // Trial credits run out once; continued access requires upgrading.
                if (data.isTrial === true) continue;
                if (PLAN_LIMITS[plan]) {
                    batch.update(userDoc.ref, {
                        credits: PLAN_LIMITS[plan],
                        lastCreditReset: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }

            await batch.commit();
            for (const userDoc of chunk) {
                const data = userDoc.data();
                if (!data.isTeamMember && data.isTrial !== true && PLAN_LIMITS[data.plan]) {
                    await writeBillingState(userDoc.id, admin.firestore()).catch((e: any) =>
                        console.warn(`⚠️ writeBillingState failed for ${userDoc.id}:`, e.message)
                    );
                }
            }
            console.log(`Reset batch ${i / batchSize + 1}: ${chunk.length} users`);
        }

        console.log(`Monthly reset complete: ${docs.length} paid users refilled.`);
    }

    // NOTE: Trial users (isTrial=true) do NOT get credits reset.
    // Once trial credits run out, user must upgrade to continue using the platform.
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. GHL CANCELLATION WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════
// GHL calls this ONLY for FINAL cancellation (after grace period expires).
// Sets billingStatus = 'cancelled', plan = 'none', credits = 0.
// Account and history are preserved — user can still log in but sees reactivate screen.
//
// GHL Workflow setup:
//   Trigger: Final cancellation workflow (after 2-day grace period)
//   Action: HTTP POST to your-function-url/ghlCancellationWebhook
//   Headers: x-ghl-secret: YOUR_SECRET
//   Body: { "email": "{{contact.email}}" }
// ═══════════════════════════════════════════════════════════════════════════
// Route 3 hybrid: still wired up for the GHL cancellation flow.
// DEPRECATED: replaced by Stripe webhook + notifyGHLFailed
export const ghlCancellationWebhook = onRequest({
    region: "europe-west1",
    cors: true,
    secrets: [ghlWebhookSecret, ghlCancelledUrl],
}, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    const secret = req.headers['x-ghl-secret'];
    if (secret !== ghlWebhookSecret.value()) {
        res.status(401).send('Unauthorized');
        return;
    }

    // GHL sends custom fields inside customData — extract from both places
    const data = req.body;
    const customData = data.customData || {};
    const email = data.email || customData.email || '';
    const contactId = data.contact_id || customData.contact_id || '';
    if (!email) {
        res.status(400).send({ status: "FAIL", message: "Missing email" });
        return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log(`❌ FINAL cancellation received for: ${normalizedEmail} (contact: ${contactId})`);

    try {
        let existingUser: admin.auth.UserRecord | null = null;
        try {
            existingUser = await admin.auth().getUserByEmail(normalizedEmail);
        } catch {
            // User not found in Firebase Auth
        }

        let firstName: string | null = null;
        let lastName: string | null = null;
        let stripeSubscriptionId: string | null = null;
        let stripeCustomerId: string | null = null;
        let ghlContactIdValue: string | null = contactId || null;
        let billingTypeValue: string = 'monthly';

        let previousPlan: string | null = null;

        if (existingUser) {
            const userRef = admin.firestore().collection("users").doc(existingUser.uid);

            // Capture pre-update state for GHL previous_plan + identity fields.
            try {
                const snap = await userRef.get();
                const userData = snap.data() ?? {};
                previousPlan = (userData.plan as string) ?? null;
                const split = splitDisplayName(userData.displayName);
                firstName = split.first_name;
                lastName = split.last_name;
                stripeSubscriptionId = userData.stripeSubscriptionId ?? null;
                stripeCustomerId = userData.stripeCustomerId ?? null;
                ghlContactIdValue = userData.ghlContactId ?? ghlContactIdValue;
                billingTypeValue = userData.billingType ?? billingTypeValue;
            } catch { /* non-critical — fields stay null */ }

            await userRef.update({
                billingStatus: 'cancelled',
                plan: "none",
                credits: 0,
                isTrial: false,
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Cancelled ${normalizedEmail} → billingStatus: cancelled, plan: none.`);
            await writeBillingState(existingUser.uid, admin.firestore());
        } else {
            // Pre-signup cancellation — pull previous_plan/billing_type from the pending purchase
            // before removing it, so GHL gets accurate fields (state itself stays cancelled: none/0).
            const pending = await loadPendingPlan(normalizedEmail);
            if (pending) {
                previousPlan = (pending.plan as string) ?? previousPlan;
                billingTypeValue = (pending.billingType as string) ?? billingTypeValue;
                if (pending.ghlContactId) ghlContactIdValue = pending.ghlContactId;
            }
            await admin.firestore().collection("pending_plans").doc(normalizedEmail).delete();
            console.log(`Removed pending plan for ${normalizedEmail}`);
        }

        const cancellationReasonInbound: string | null =
            customData.reason ?? customData.cancellation_reason ?? data.cancellation_reason ?? null;
        const cancelAtInbound: string | null =
            customData.cancel_at ?? data.cancel_at ?? null;

        // ═══ Route 3: notify GHL inbound webhook so CRM automations fire ═══
        await postGHLInboundPayload({
            url: ghlCancelledUrl.value(),
            event_type: "subscription.cancelled",
            email: normalizedEmail,
            plan: "none",
            credits: 0,
            billing_status: "cancelled",
            is_trial: false,
            amount: 0,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            ghl_contact_id: ghlContactIdValue,
            billing_type: billingTypeValue,
            first_name: firstName,
            last_name: lastName,
            previous_plan: previousPlan,
            cancel_at: cancelAtInbound,
            cancellation_reason: cancellationReasonInbound,
        });

        res.status(200).json({ success: true, email: normalizedEmail, action: "cancelled" });
    } catch (error: any) {
        console.error("🔥 Final cancellation failed:", error);
        res.status(200).send({ status: "ERROR", details: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// FAILED PAYMENT WEBHOOK — Non-destructive, sets past_due + grace period
// ═══════════════════════════════════════════════════════════════════════════
//
// GHL Workflow setup:
//   Trigger: "Payment Failed" event
//   Action: HTTP POST to your-function-url/ghlPaymentFailedWebhook
//   Headers: x-ghl-secret: YOUR_SECRET
//   Body: { "email": "{{contact.email}}" }
// ═══════════════════════════════════════════════════════════════════════════
// Route 3 hybrid: still wired up for the GHL dunning flow.
// DEPRECATED: replaced by Stripe webhook + notifyGHLFailed
export const ghlPaymentFailedWebhook = onRequest({
    region: "europe-west1",
    cors: true,
    secrets: [ghlWebhookSecret, ghlOverdueFailedUrl],
}, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    const secret = req.headers['x-ghl-secret'];
    if (secret !== ghlWebhookSecret.value()) { res.status(401).send('Unauthorized'); return; }

    // GHL sends custom fields inside customData — extract from both places
    const data = req.body;
    const customData = data.customData || {};
    const email = data.email || customData.email || '';
    const contactId = data.contact_id || customData.contact_id || '';
    if (!email) { res.status(400).send({ status: "FAIL", message: "Missing email" }); return; }

    const normalizedEmail = email.toLowerCase().trim();
    console.log(`⚠️ Payment failed for: ${normalizedEmail} (contact: ${contactId})`);

    try {
        let existingUser: admin.auth.UserRecord | null = null;
        try { existingUser = await admin.auth().getUserByEmail(normalizedEmail); } catch { /* not found */ }

        let firstName: string | null = null;
        let lastName: string | null = null;
        let stripeSubscriptionId: string | null = null;
        let stripeCustomerId: string | null = null;
        let plan = "none";
        let credits = 0;
        let isTrial = false;
        let ghlContactIdValue: string | null = contactId || null;
        let billingTypeValue: string = 'monthly';

        if (existingUser) {
            const gracePeriodEndsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
            await admin.firestore().collection("users").doc(existingUser.uid).update({
                billingStatus: 'past_due',
                billingIssueAt: admin.firestore.FieldValue.serverTimestamp(),
                billingIssueType: 'payment_failed',
                gracePeriodEndsAt: admin.firestore.Timestamp.fromDate(gracePeriodEndsAt),
            });
            console.log(`Set ${normalizedEmail} → billingStatus: past_due, grace until ${gracePeriodEndsAt.toISOString()}`);
            await writeBillingState(existingUser.uid, admin.firestore());

            try {
                const snap = await admin.firestore().collection("users").doc(existingUser.uid).get();
                const userData = snap.data() ?? {};
                const split = splitDisplayName(userData.displayName);
                firstName = split.first_name;
                lastName = split.last_name;
                stripeSubscriptionId = userData.stripeSubscriptionId ?? null;
                stripeCustomerId = userData.stripeCustomerId ?? null;
                plan = userData.plan ?? "none";
                credits = typeof userData.credits === "number" ? userData.credits : 0;
                isTrial = userData.isTrial === true;
                ghlContactIdValue = userData.ghlContactId ?? ghlContactIdValue;
                billingTypeValue = userData.billingType ?? billingTypeValue;
            } catch { /* non-critical — fields stay at defaults */ }
        } else {
            // Pre-signup payment failure — populate plan/credits/trial/billing_type from the
            // pending purchase so GHL reflects the real subscription, not empty defaults.
            const pending = await loadPendingPlan(normalizedEmail);
            if (pending) {
                plan = (pending.plan as string) ?? plan;
                credits = typeof pending.credits === "number" ? pending.credits : credits;
                isTrial = pending.isTrial === true;
                billingTypeValue = (pending.billingType as string) ?? billingTypeValue;
                if (pending.ghlContactId) ghlContactIdValue = pending.ghlContactId;
            }
        }

        // ═══ Route 3: notify GHL inbound webhook so CRM automations fire ═══
        await postGHLInboundPayload({
            url: ghlOverdueFailedUrl.value(),
            event_type: "payment.failed",
            email: normalizedEmail,
            plan,
            credits,
            billing_status: "past_due",
            is_trial: isTrial,
            amount: 0,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            ghl_contact_id: ghlContactIdValue,
            billing_type: billingTypeValue,
            first_name: firstName,
            last_name: lastName,
        });

        res.status(200).json({ success: true, email: normalizedEmail, action: "past_due" });
    } catch (error: any) {
        console.error("🔥 Payment failed webhook error:", error);
        res.status(200).send({ status: "ERROR", details: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT RECOVERED WEBHOOK — Clears past_due, restores active
// ═══════════════════════════════════════════════════════════════════════════
//
// GHL Workflow setup:
//   Trigger: "Payment Recovered" / successful retry
//   Action: HTTP POST to your-function-url/ghlPaymentRecoveredWebhook
//   Headers: x-ghl-secret: YOUR_SECRET
//   Body: { "email": "{{contact.email}}" }
// ═══════════════════════════════════════════════════════════════════════════
export const ghlPaymentRecoveredWebhook = onRequest({
    region: "europe-west1",
    cors: true,
    secrets: [ghlWebhookSecret, ghlRecoveredUrl],
}, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    const secret = req.headers['x-ghl-secret'];
    if (secret !== ghlWebhookSecret.value()) { res.status(401).send('Unauthorized'); return; }

    // GHL sends custom fields inside customData — extract from both places
    const data = req.body;
    const customData = data.customData || {};
    const email = data.email || customData.email || '';
    const contactId = data.contact_id || customData.contact_id || '';
    if (!email) { res.status(400).send({ status: "FAIL", message: "Missing email" }); return; }

    const normalizedEmail = email.toLowerCase().trim();
    console.log(`✅ Payment recovered for: ${normalizedEmail} (contact: ${contactId})`);

    try {
        let existingUser: admin.auth.UserRecord | null = null;
        try { existingUser = await admin.auth().getUserByEmail(normalizedEmail); } catch { /* not found */ }

        let firstName: string | null = null;
        let lastName: string | null = null;
        let stripeSubscriptionId: string | null = null;
        let stripeCustomerId: string | null = null;
        let plan = "none";
        let credits = 0;
        let isTrial = false;
        let ghlContactIdValue: string | null = contactId || null;
        let billingTypeValue: string = 'monthly';

        if (existingUser) {
            const userRef = admin.firestore().collection("users").doc(existingUser.uid);

            // Read user data BEFORE the recovery update so we can compute
            // creditsPerMonth from the user's current plan and bundle it into
            // the same write.
            try {
                const snap = await userRef.get();
                const userData = snap.data() ?? {};
                const split = splitDisplayName(userData.displayName);
                firstName = split.first_name;
                lastName = split.last_name;
                stripeSubscriptionId = userData.stripeSubscriptionId ?? null;
                stripeCustomerId = userData.stripeCustomerId ?? null;
                plan = userData.plan ?? "none";
                credits = typeof userData.credits === "number" ? userData.credits : 0;
                isTrial = userData.isTrial === true;
                ghlContactIdValue = userData.ghlContactId ?? ghlContactIdValue;
                billingTypeValue = userData.billingType ?? billingTypeValue;
            } catch { /* non-critical — fields stay at defaults */ }

            await userRef.update({
                billingStatus: 'active',
                billingIssueAt: admin.firestore.FieldValue.delete(),
                billingIssueType: admin.firestore.FieldValue.delete(),
                gracePeriodEndsAt: admin.firestore.FieldValue.delete(),
                lastPaymentRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
                creditsPerMonth: CREDITS_PER_MONTH[plan] ?? 0,
            });
            console.log(`Restored ${normalizedEmail} → billingStatus: active`);
            await writeBillingState(existingUser.uid, admin.firestore());
        } else {
            // Pre-signup recovery — populate plan/credits/trial/billing_type from the pending
            // purchase so GHL reflects the real subscription, not empty defaults.
            const pending = await loadPendingPlan(normalizedEmail);
            if (pending) {
                plan = (pending.plan as string) ?? plan;
                credits = typeof pending.credits === "number" ? pending.credits : credits;
                isTrial = pending.isTrial === true;
                billingTypeValue = (pending.billingType as string) ?? billingTypeValue;
                if (pending.ghlContactId) ghlContactIdValue = pending.ghlContactId;
            }
        }

        // ═══ Route 3: notify GHL inbound webhook so CRM automations fire ═══
        await postGHLInboundPayload({
            url: ghlRecoveredUrl.value(),
            event_type: "payment.recovered",
            email: normalizedEmail,
            plan,
            credits,
            billing_status: "active",
            is_trial: isTrial,
            amount: 0,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            ghl_contact_id: ghlContactIdValue,
            billing_type: billingTypeValue,
            first_name: firstName,
            last_name: lastName,
        });

        res.status(200).json({ success: true, email: normalizedEmail, action: "recovered" });
    } catch (error: any) {
        console.error("🔥 Recovery webhook error:", error);
        res.status(200).send({ status: "ERROR", details: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. COMPETITOR RESEARCH (Ultimate + Agency only)
// ═══════════════════════════════════════════════════════════════════════════
// Takes user's product info → searches Google → scrapes competitors →
// AI generates differentiation angles and attack hooks.
// ═══════════════════════════════════════════════════════════════════════════
export const competitorResearch = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 90,
    memory: "512MiB",
}, async (request: CallableRequest) => {
    // Auth check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required.");
    }
    const uid = request.auth.uid;

    // ═══ ENTITLEMENT: Check competitor research access ═══
    const entitlement = await resolveFirestoreEntitlement(uid);
    const featureCheck = checkFeature(entitlement, 'competitorResearch');
    if (!featureCheck.allowed) {
        throw new HttpsError("permission-denied", JSON.stringify({
            code: featureCheck.code,
            feature: featureCheck.feature,
            requiredPlan: featureCheck.requiredPlan,
            message: `Competitor Research requires ${featureCheck.requiredPlan} plan or higher.`,
        }));
    }

    // Credit check — use the resolved credit owner
    const creditOwnerRef = admin.firestore().collection("users").doc(entitlement.creditOwnerUid);
    const creditOwnerDoc = await creditOwnerRef.get();
    const creditOwnerData = creditOwnerDoc.data();
    const competitorCost = COSTS['competitorResearch'] || 5;
    if (!creditOwnerData || (creditOwnerData.credits || 0) < competitorCost) {
        throw new HttpsError("resource-exhausted", `Not enough credits. Need ${competitorCost}.`);
    }

    const { productName, productCategory, targetAudience, challenges, transformation, adLanguage } = request.data;
    if (!productName || !targetAudience || !productCategory) {
        throw new HttpsError("invalid-argument", "Product name, category, and target audience required.");
    }

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());

        // ── Step 0: Translate category to English if needed ──
        const baseModel = genAI.getGenerativeModel({ model: LOGIC_MODEL });
        let englishCategory = productCategory;
        try {
            const transResult = await baseModel.generateContent({
                contents: [{ role: "user", parts: [{ text: `Translate the following product category/niche to English. If it is already in English, return it as-is. Return ONLY the English translation, nothing else. No quotes, no explanation.\n\nInput: ${productCategory}` }] }],
            });
            const translated = transResult.response.text().trim();
            if (translated && translated.length < 200) {
                englishCategory = translated;
            }
        } catch (e) {
            console.warn("Translation step failed, using original:", e);
        }
        console.log(`🌐 Category: "${productCategory}" → English: "${englishCategory}"`);

        // ── Build the research prompt ──
        const researchPrompt = `You are an elite competitive intelligence analyst with deep knowledge of global markets. Your task: identify real competitors and generate differentiation angles.

ABOUT MY PRODUCT:
- Brand Name: ${productName}
- Niche/Category: ${englishCategory}
- Target Audience: ${targetAudience}
- Challenges Solved: ${challenges || 'Not specified'}
- Transformation Promised: ${transformation || 'Not specified'}

YOUR TASK:
1. Identify 3-5 REAL, well-known companies/products that compete in the "${englishCategory}" space globally.
   - Think of the biggest players, popular alternatives, and rising competitors.
   - Include their REAL website URLs (you must be confident these are correct).
   - Describe what each actually offers in 1 line.

2. Analyze the competitive landscape and find gaps my product can exploit.

3. Generate differentiation angles and attack hooks.

LANGUAGE RULES:
- The user's ad language is: "${adLanguage || 'ar_fusha'}"
- "title" and "explanation": Write in ${(adLanguage || 'ar_fusha').startsWith('ar') ? 'Arabic (فصحى تسويقية)' : 'English'}.
- "hookSuggestion" and "attackHooks": Write in ${(adLanguage || 'ar_fusha').startsWith('ar') ? 'Professional Marketing Fusha Arabic' : adLanguage === 'en' ? 'English' : 'English'}.
- Competitor "name" and "url": Keep in their original language.
- Competitor "description": Write in ${(adLanguage || 'ar_fusha').startsWith('ar') ? 'Arabic' : 'English'}.

Return ONLY this JSON structure (no markdown, no backticks, no explanation before or after):
{
  "competitors": [
    {"name": "Real Company Name", "url": "https://real-url.com", "description": "What they actually offer (1 line, English)"}
  ],
  "angles": [
    {
      "title": "Angle name (3-5 words)",
      "explanation": "Why my product is uniquely better (1-2 sentences)",
      "hookSuggestion": "Ready-to-use ad hook in Professional Marketing Fusha Arabic"
    }
  ],
  "attackHooks": [
    "Arabic hook #1 positioning against competitor weakness",
    "Arabic hook #2 with different competitive angle"
  ]
}

CRITICAL:
- Return 3-5 REAL competitors with REAL URLs (not made up)
- Return exactly 3 differentiation angles
- Return exactly 2 attack hooks in Arabic
- Hooks should be provocative but professional
- Focus on GAPS competitors have that my product fills
- Return ONLY valid JSON, nothing else`;

        // ── Try with Google Search grounding first, fall back to standard ──
        let responseText = '';
        try {
            const groundedModel = genAI.getGenerativeModel({
                model: LOGIC_MODEL,
                tools: [{ googleSearch: {} } as any],
            });
            const result = await groundedModel.generateContent({
                contents: [{ role: "user", parts: [{ text: researchPrompt }] }],
            });
            responseText = result.response.text();
            console.log("✅ Used Google Search grounding");
        } catch (groundingError: any) {
            console.warn("⚠️ Google Search grounding failed, using standard model:", groundingError.message);
            // Fallback: standard Gemini (uses training knowledge — still good for well-known niches)
            const result = await baseModel.generateContent({
                contents: [{ role: "user", parts: [{ text: researchPrompt }] }],
            });
            responseText = result.response.text();
            console.log("✅ Used standard model fallback");
        }

        // ── Parse response ──
        let analysis;
        try {
            const cleaned = responseText.replace(/```json|```/g, '').trim();
            analysis = JSON.parse(cleaned);
        } catch {
            // Try extracting JSON from mixed response
            const jsonMatch = responseText.match(/\{[\s\S]*"competitors"[\s\S]*"angles"[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            } else {
                console.error("Failed to parse response:", responseText.substring(0, 500));
                throw new HttpsError("internal", "Failed to parse research results. Try again.");
            }
        }

        // Validate structure
        if (!analysis.competitors || !analysis.angles) {
            throw new HttpsError("internal", "Incomplete research results. Try again.");
        }

        // Deduct credits (server-side, onSnapshot updates client)
        // Use entitlement.creditOwnerUid for team member support
        await admin.firestore().collection("users").doc(entitlement.creditOwnerUid).update({
            credits: admin.firestore.FieldValue.increment(-(COSTS['competitorResearch'] || 5)),
        });

        console.log(`🔍 Competitor research for ${uid}: ${analysis.competitors?.length || 0} found in niche "${productCategory}".`);

        return {
            competitors: analysis.competitors || [],
            angles: analysis.angles || [],
            attackHooks: analysis.attackHooks || [],
            timestamp: Date.now(),
        };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        console.error("🔥 Competitor research failed:", error);
        throw new HttpsError("internal", "Research failed: " + (error.message || "Unknown error"));
    }
});
// ═══════════════════════════════════════════════════════════════════════════
// @LEGACY — STRIPE BILLING (7–19)
// These functions use Stripe and are preserved for backward compatibility.
// ═══════════════════════════════════════════════════════════════════════════
// 7. STRIPE CUSTOMER PORTAL
// ═══════════════════════════════════════════════════════════════════════════
// Called from App.tsx when user clicks "Manage Billing" or "Manage Subscription".
// Creates a Stripe Customer Portal session and returns the URL.
//
// SETUP:
// 1. cd functions && npm install stripe
// 2. firebase functions:secrets:set STRIPE_SECRET_KEY
//    (paste your sk_live_... key when prompted)
// 3. Enable portal: https://dashboard.stripe.com/settings/billing/portal
// 4. Deploy: cd functions && npm run deploy
//
// The stripeCustomerId is automatically saved when GHL webhook fires (see section 3 above).
// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED: preserved for reference only
const _deprecatedCreateStripePortalSession = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    // 1. Verify user is authenticated
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required.");
    }

    const uid = request.auth.uid;
    let stripeCustomerId = request.data?.stripeCustomerId;

    console.log(`Portal request from uid=${uid}, provided stripeCustomerId=${stripeCustomerId}`);

    // 2. Get user doc
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
        throw new HttpsError("not-found", "User not found in Firestore.");
    }

    // Use stripe without pinning to a specific API version — let the SDK use its default
    const stripe = new Stripe(stripeSecretKey.value());

    // 3. Auto-lookup: if client doesn't have stripeCustomerId, find it by email
    let resolvedStripeId: string | null = null;
    if (!stripeCustomerId || stripeCustomerId === "__auto_lookup__") {
        // First check Firestore (might have been saved by webhook or manual entry)
        if (userData.stripeCustomerId) {
            stripeCustomerId = userData.stripeCustomerId;
            console.log(`Found stripeCustomerId in Firestore: ${stripeCustomerId}`);
        } else {
            // Look up in Stripe by email
            const email = userData.email || request.auth.token?.email;
            if (!email) {
                throw new HttpsError("failed-precondition", "No email on account. Contact support.");
            }
            console.log(`Looking up Stripe customer by email: ${email}`);
            try {
                const customers = await stripe.customers.list({
                    email: email.toLowerCase().trim(),
                    limit: 1,
                });
                if (customers.data.length > 0) {
                    stripeCustomerId = customers.data[0].id;
                    resolvedStripeId = stripeCustomerId;
                    // Save for future use
                    await admin.firestore().collection("users").doc(uid).update({ stripeCustomerId });
                    console.log(`Auto-resolved Stripe ID for ${email}: ${stripeCustomerId}`);
                } else {
                    console.error(`No Stripe customer found for email: ${email}`);
                    throw new HttpsError(
                        "not-found",
                        "No Stripe account found for your email. If you subscribed recently, please contact support."
                    );
                }
            } catch (err: any) {
                if (err instanceof HttpsError) throw err;
                console.error("Stripe customer lookup failed:", err.message, err.type);
                throw new HttpsError("internal", "Could not look up billing account: " + err.message);
            }
        }
    } else {
        // Verify the provided Stripe ID belongs to this user
        if (userData.stripeCustomerId && userData.stripeCustomerId !== stripeCustomerId) {
            throw new HttpsError("permission-denied", "Stripe customer ID does not match your account.");
        }
    }

    // 4. Create the portal session
    console.log(`Creating portal session for customer: ${stripeCustomerId}`);
    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: "https://app.proadsai.com",
        });

        console.log(`Portal session created: ${session.url?.substring(0, 50)}...`);
        return { url: session.url, resolvedStripeId };
    } catch (error: any) {
        console.error("Stripe portal session error:", error.message, error.type, error.code);
        throw new HttpsError("internal", "Failed to create billing portal: " + error.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. ONE-TIME BACKFILL: Add stripeCustomerId to existing users
// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED: Stripe backfill — no longer needed.
// Run this ONCE after deploying by visiting:
//   https://europe-west1-proadsai-saas.cloudfunctions.net/backfillStripeCustomerIds
//
// It goes through every user in Firestore who has an email but no stripeCustomerId,
// looks them up in Stripe by email, and saves the ID.
//
// After running it once, you can DELETE this function and redeploy.
// ═══════════════════════════════════════════════════════════════════════════
export const backfillStripeCustomerIds = onRequest({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    timeoutSeconds: 300,
}, async (req, res) => {
    const stripe = new Stripe(stripeSecretKey.value());

    const usersSnap = await admin.firestore().collection("users").get();
    let updated = 0;
    let skipped = 0;
    let notFound = 0;
    const results: string[] = [];

    for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();

        // Skip if already has stripeCustomerId
        if (data.stripeCustomerId) {
            skipped++;
            continue;
        }

        // Skip if no email
        const email = data.email;
        if (!email) {
            skipped++;
            continue;
        }

        // Look up in Stripe
        try {
            const customers = await stripe.customers.list({
                email: email.toLowerCase().trim(),
                limit: 1,
            });

            if (customers.data.length > 0) {
                const stripeId = customers.data[0].id;
                await userDoc.ref.update({ stripeCustomerId: stripeId });
                updated++;
                results.push(`✅ ${email} → ${stripeId}`);
            } else {
                notFound++;
                results.push(`❌ ${email} → not found in Stripe`);
            }
        } catch (err: any) {
            results.push(`⚠️ ${email} → error: ${err.message}`);
        }
    }

    const summary = `Backfill complete: ${updated} updated, ${skipped} skipped, ${notFound} not found in Stripe.`;
    console.log(summary);
    res.status(200).send(`<pre>${summary}\n\n${results.join('\n')}</pre>`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. IN-APP TOPUP: Stripe Checkout Sessions
// ═══════════════════════════════════════════════════════════════════════════
// Creates a Stripe Checkout Session for credit top-ups.
// User clicks "Buy 100 credits" → this function creates a session →
// user is redirected to Stripe's hosted page → pays → webhook adds credits.
//
// If user has a saved payment method, Stripe pre-fills it (one-click).
//
// SETUP:
// 1. Create 3 products in Stripe Dashboard with these metadata keys:
//    - Product "100 Credits" → Price: $7 → metadata: { topup_credits: "100" }
//    - Product "300 Credits" → Price: $17 → metadata: { topup_credits: "300" }
//    - Product "800 Credits" → Price: $39 → metadata: { topup_credits: "800" }
// 2. Copy each Price ID (price_XXXX) and put them in TOPUP_PRICES below
// 3. Set up Stripe webhook (see section 10 below)
// ═══════════════════════════════════════════════════════════════════════════

const TOPUP_PRICES: Record<string, { priceId: string; credits: number }> = {
    'topup_100': { priceId: 'price_1T4zi74MIh5WD4bvGqCI8GR3', credits: 100 },
    'topup_300': { priceId: 'price_1T4zhl4MIh5WD4bvR5PgBYRH', credits: 300 },
    'topup_800': { priceId: 'price_1T4zgC4MIh5WD4bvYtG2UB4K', credits: 800 },
};

// DEPRECATED: replaced by createStripeTopUpSession
export const createTopupCheckout = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required.");
    }

    const uid = request.auth.uid;
    const packId = request.data?.packId; // 'topup_100', 'topup_300', 'topup_800'

    const pack = TOPUP_PRICES[packId];
    if (!pack) {
        throw new HttpsError("invalid-argument", `Invalid pack: ${packId}`);
    }

    // Get user doc for stripeCustomerId and email
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
        throw new HttpsError("not-found", "User not found.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const email = userData.email || request.auth.token?.email;
    let customerId = userData.stripeCustomerId;

    // Auto-create or find Stripe customer
    if (!customerId) {
        // Try to find existing
        const existing = await stripe.customers.list({ email: email?.toLowerCase().trim(), limit: 1 });
        if (existing.data.length > 0) {
            customerId = existing.data[0].id;
        } else {
            // Create new Stripe customer
            const newCustomer = await stripe.customers.create({
                email: email?.toLowerCase().trim(),
                metadata: { firebaseUid: uid },
            });
            customerId = newCustomer.id;
        }
        // Save to Firestore
        await admin.firestore().collection("users").doc(uid).update({ stripeCustomerId: customerId });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [{
                price: pack.priceId,
                quantity: 1,
            }],
            metadata: {
                firebaseUid: uid,
                packId: packId,
                credits: String(pack.credits),
            },
            success_url: 'https://app.proadsai.com?topup=success&credits=' + pack.credits,
            cancel_url: 'https://app.proadsai.com?topup=cancelled',
            // Allow saved payment methods for returning customers
            payment_method_options: {
                card: {
                    setup_future_usage: 'on_session',
                },
            },
        });

        console.log(`Checkout session created: ${session.id} for ${email} (${packId})`);
        return { url: session.url };
    } catch (error: any) {
        console.error("Checkout session error:", error.message);
        throw new HttpsError("internal", "Failed to create checkout: " + error.message);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. STRIPE WEBHOOK: Handle completed checkouts
// ═══════════════════════════════════════════════════════════════════════════
// This receives events from Stripe when a checkout session completes.
//
// SETUP:
// 1. Go to https://dashboard.stripe.com/webhooks
// 2. Click "Add endpoint"
// 3. URL: https://europe-west1-proadsai-saas.cloudfunctions.net/stripeWebhook
// 4. Events to listen to: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
// 5. Copy the "Signing secret" (whsec_...)
// 6. Run: firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//    Paste the whsec_... secret
// ═══════════════════════════════════════════════════════════════════════════

const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// DEPRECATED: replaced by stripeWebhook
const _deprecatedStripeWebhook = onRequest({
    region: "europe-west1",
    secrets: [stripeSecretKey, stripeWebhookSecret],
}, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const sig = req.headers['stripe-signature'];

    if (!sig) {
        res.status(400).send('Missing stripe-signature header');
        return;
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            stripeWebhookSecret.value()
        );
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const uid = session.metadata?.firebaseUid;
        const credits = parseInt(session.metadata?.credits || '0', 10);
        const packId = session.metadata?.packId || '';

        if (!uid || !credits) {
            console.error('Missing metadata in checkout session:', session.id);
            res.status(200).send('OK (missing metadata)');
            return;
        }

        // Verify payment was successful
        if (session.payment_status !== 'paid') {
            console.log(`Checkout ${session.id} not yet paid, skipping.`);
            res.status(200).send('OK (not paid)');
            return;
        }

        try {
            // Add credits to user
            const userRef = admin.firestore().collection("users").doc(uid);
            await userRef.update({
                credits: admin.firestore.FieldValue.increment(credits),
                lastTopup: admin.firestore.FieldValue.serverTimestamp(),
                lastTopupPack: packId,
                stripeCustomerId: session.customer || '',
            });

            console.log(`✅ Topup success: +${credits} credits for uid=${uid} (${packId})`);
            res.status(200).send('OK');

            // Update billing state asynchronously — DB write already succeeded
            try {
                await writeBillingState(uid, admin.firestore());
            } catch (bsErr: any) {
                console.warn(`⚠️ writeBillingState failed after topup for ${uid}:`, bsErr.message);
            }
        } catch (err: any) {
            console.error('Failed to add credits:', err.message);
            res.status(500).send('Failed to process');
        }

        // ═══ Handle plan changes from Stripe Customer Portal ═══
    } else if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object as any;
        const stripeCustomerId = subscription.customer;
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const status = subscription.status; // 'active', 'past_due', 'canceled', etc.

        if (!stripeCustomerId || !priceId) {
            console.log('Subscription update missing customer or price, skipping.');
            res.status(200).send('OK');
            return;
        }

        // Only process active subscriptions (ignore past_due, incomplete, etc.)
        if (status === 'past_due') {
            // Grace period: 7 days from now (Stripe manages dunning/retries separately)
            const graceEnd = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
            try {
                const usersSnap = await admin.firestore().collection("users")
                    .where("stripeCustomerId", "==", stripeCustomerId)
                    .limit(1).get();
                if (!usersSnap.empty) {
                    const userDoc = usersSnap.docs[0];
                    await userDoc.ref.update({
                        billingStatus: 'past_due',
                        gracePeriodEndsAt: graceEnd,
                    });
                    await writeBillingState(userDoc.id, admin.firestore());
                    console.log(`⚠️ Subscription past_due: ${userDoc.id}`);
                }
            } catch (e: any) {
                console.error('Failed to handle past_due:', e.message);
            }
            res.status(200).send('OK');
            return;
        }
        if (status !== 'active') {
            console.log(`Subscription ${subscription.id} status is "${status}", skipping.`);
            res.status(200).send('OK');
            return;
        }

        // ─── MAP STRIPE PRICE IDs TO PLANS ───
        // IMPORTANT: Replace these with your actual Stripe price IDs from your Products page
        // Go to Stripe Dashboard → Products → click each plan → copy the price ID (starts with "price_")
        const STRIPE_PRICE_TO_PLAN: Record<string, { plan: string; credits: number }> = {
            // Monthly prices
            'price_1T4Ul84MIh5WD4bv1B1IjpfP': { plan: 'starter', credits: 800 },
            'price_1T4UkA4MIh5WD4bvc55rCOVO': { plan: 'pro', credits: 2500 },
            'price_1T4Uj84MIh5WD4bv8VmCYHMW': { plan: 'scale', credits: 6500 },
            // Annual prices
            'price_1T4UkA4MIh5WD4bvQXOGG7xF': { plan: 'starter', credits: 800 },
            'price_1T4Uk94MIh5WD4bvBY7366k9': { plan: 'pro', credits: 2500 },
            'price_1T4Uj84MIh5WD4bvL656TLHR': { plan: 'scale', credits: 6500 },
        };

        const planInfo = STRIPE_PRICE_TO_PLAN[priceId];
        if (!planInfo) {
            console.log(`Unknown price ID from portal: ${priceId}, skipping plan update.`);
            res.status(200).send('OK');
            return;
        }

        try {
            // Find user by stripeCustomerId
            const usersSnap = await admin.firestore().collection("users")
                .where("stripeCustomerId", "==", stripeCustomerId)
                .limit(1)
                .get();

            if (usersSnap.empty) {
                const stripe = new Stripe(stripeSecretKey.value());
                const customer = await stripe.customers.retrieve(stripeCustomerId) as any;
                if (customer.email) {
                    const userRecord = await admin.auth().getUserByEmail(customer.email.toLowerCase().trim());
                    await admin.firestore().collection("users").doc(userRecord.uid).update({
                        plan: planInfo.plan,
                        credits: planInfo.credits,
                        isTrial: false,
                        billingStatus: 'active',
                        billingIssueAt: admin.firestore.FieldValue.delete(),
                        billingIssueType: admin.firestore.FieldValue.delete(),
                        gracePeriodEndsAt: admin.firestore.FieldValue.delete(),
                        planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        planSource: 'stripe_portal',
                    });
                    console.log(`✅ Portal plan change (via email): ${customer.email} → ${planInfo.plan} (${planInfo.credits} credits)`);
                    await writeBillingState(userRecord.uid, admin.firestore());
                } else {
                    console.error(`No user found for stripeCustomerId: ${stripeCustomerId}`);
                }
            } else {
                const userDoc = usersSnap.docs[0];
                await userDoc.ref.update({
                    plan: planInfo.plan,
                    credits: planInfo.credits,
                    isTrial: false,
                    billingStatus: 'active',
                    billingIssueAt: admin.firestore.FieldValue.delete(),
                    billingIssueType: admin.firestore.FieldValue.delete(),
                    gracePeriodEndsAt: admin.firestore.FieldValue.delete(),
                    planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    planSource: 'stripe_portal',
                });
                console.log(`✅ Portal plan change: ${userDoc.id} → ${planInfo.plan} (${planInfo.credits} credits)`);
                await writeBillingState(userDoc.id, admin.firestore());
            }
            res.status(200).send('OK');
        } catch (err: any) {
            console.error('Failed to process portal plan change:', err.message);
            res.status(500).send('Failed');
        }

        // ═══ Handle subscription cancellations ═══
    } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as any;
        const stripeCustomerId = subscription.customer;

        if (!stripeCustomerId) {
            res.status(200).send('OK');
            return;
        }

        try {
            const usersSnap = await admin.firestore().collection("users")
                .where("stripeCustomerId", "==", stripeCustomerId)
                .limit(1)
                .get();

            if (!usersSnap.empty) {
                const userDoc = usersSnap.docs[0];
                await userDoc.ref.update({
                    billingStatus: 'cancelled',
                    plan: 'none',
                    credits: 0,
                    isTrial: false,
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    planSource: 'stripe_cancellation',
                });
                console.log(`✅ Subscription cancelled: ${userDoc.id} → none (0 credits)`);
                await writeBillingState(userDoc.id, admin.firestore());
            } else {
                // Fallback via email
                const stripe = new Stripe(stripeSecretKey.value());
                const customer = await stripe.customers.retrieve(stripeCustomerId) as any;
                if (customer.email) {
                    try {
                        const userRecord = await admin.auth().getUserByEmail(customer.email.toLowerCase().trim());
                        await admin.firestore().collection("users").doc(userRecord.uid).update({
                            billingStatus: 'cancelled',
                            plan: 'none',
                            credits: 0,
                            isTrial: false,
                            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                            planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            planSource: 'stripe_cancellation',
                        });
                        console.log(`✅ Subscription cancelled (via email): ${customer.email} → none`);
                        await writeBillingState(userRecord.uid, admin.firestore());
                    } catch { console.error(`No Firebase user for: ${customer.email}`); }
                }
            }
            res.status(200).send('OK');
        } catch (err: any) {
            console.error('Failed to process cancellation:', err.message);
            res.status(500).send('Failed');
        }

    } else {
        // Unhandled event type
        console.log(`Unhandled event type: ${event.type}`);
        res.status(200).send('OK');
    }
});
// ═══════════════════════════════════════════════════════════════════════════
export const deductCreditsServer = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const callerId = request.auth.uid;
    const { action, onBehalfOf, count: rawCount } = request.data;
    const count = Math.max(1, Math.floor(Number(rawCount) || 1));
    const unitCost = COSTS[action as string];
    if (unitCost === undefined) throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
    const cost = unitCost * count;

    // If team member, deduct from owner's account (verify membership first)
    let targetUid = callerId;
    if (onBehalfOf && onBehalfOf !== callerId) {
        const callerDoc = await admin.firestore().collection("users").doc(callerId).get();
        const callerData = callerDoc.data();
        if (!callerData?.isTeamMember || callerData?.teamOwnerUid !== onBehalfOf) {
            throw new HttpsError("permission-denied", "Not authorized to use this team's credits.");
        }
        if (callerData?.teamRole === 'viewer') {
            throw new HttpsError("permission-denied", "Viewers cannot perform credit-consuming actions.");
        }
        targetUid = onBehalfOf;
    }

    // ═══ PLAN-GATE (fast-fail outside transaction) ═══
    const gatedFeature = ACTION_FEATURE_MAP[action as string] as GatedFeature | undefined;
    const entitlement = await resolveFirestoreEntitlement(callerId);
    if (gatedFeature) {
        const featureCheck = checkFeature(entitlement, gatedFeature);
        if (!featureCheck.allowed) {
            throw new HttpsError("failed-precondition", "Feature requires a higher plan", {
                code: "plan_downgraded",
                requiredPlan: featureCheck.requiredPlan,
                currentPlan: entitlement.basePlan,
            });
        }
    }

    const newBalance = await admin.firestore().runTransaction(async (tx) => {
        const userRef = admin.firestore().collection("users").doc(targetUid);
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new HttpsError("not-found", "User not found.");
        const userData = snap.data()!;

        const current = userData.credits ?? 0;

        // ═══ AUTHORITATIVE RE-CHECK inside transaction ═══
        // Plan or trial status may have changed since the fast-fail above.
        const txPlan = userData.plan || "none";
        const txIsTrial = userData.isTrial === true;

        if (gatedFeature) {
            // Re-resolve entitlement from transactional data
            const txEntitlement = await resolveFirestoreEntitlement(callerId);
            const txCheck = checkFeature(txEntitlement, gatedFeature);
            if (!txCheck.allowed) {
                throw new HttpsError("failed-precondition", "Feature requires a higher plan", {
                    code: "plan_downgraded",
                    requiredPlan: txCheck.requiredPlan,
                    currentPlan: txEntitlement.basePlan,
                });
            }
        }

        // ═══ TRIAL EXPIRY: Block if trial user has zero credits ═══
        if (txIsTrial && current <= 0) {
            throw new HttpsError("failed-precondition", "Trial expired — upgrade to continue", {
                code: "trial_expired",
            });
        }

        if (current < cost) {
            throw new HttpsError("resource-exhausted", `Need ${cost} credits but only have ${current}.`);
        }
        const after = current - cost;
        tx.update(userRef, { credits: after });
        return after;
    });

    await writeBillingState(targetUid, admin.firestore());
    return { success: true, creditsRemaining: newBalance, deducted: cost };
});

export const refundCreditsServer = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const callerId = request.auth.uid;
    const { action, onBehalfOf, count: rawCount } = request.data;
    const count = Math.max(1, Math.floor(Number(rawCount) || 1));
    const unitCost = COSTS[action as string];
    if (unitCost === undefined) throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
    const cost = unitCost * count;

    // If team member, refund to owner's account
    let targetUid = callerId;
    if (onBehalfOf && onBehalfOf !== callerId) {
        const callerDoc = await admin.firestore().collection("users").doc(callerId).get();
        if (callerDoc.data()?.isTeamMember && callerDoc.data()?.teamOwnerUid === onBehalfOf) {
            targetUid = onBehalfOf;
        }
    }

    const newBalance = await admin.firestore().runTransaction(async (tx) => {
        const userRef = admin.firestore().collection("users").doc(targetUid);
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new HttpsError("not-found", "User not found.");

        const current = snap.data()?.credits ?? 0;
        const after = current + cost;
        tx.update(userRef, { credits: after });
        return after;
    });

    await writeBillingState(targetUid, admin.firestore());
    return { success: true, creditsRemaining: newBalance, refunded: cost };
});

// ═══════════════════════════════════════════════════════════════════════════
// MILESTONE CREDIT AWARD (Server-side — client can't increase credits)
// ═══════════════════════════════════════════════════════════════════════════
const MILESTONE_REWARDS: Record<string, number> = {
    watchVideo: 5, hooksGenerated: 5, conceptsGenerated: 10,
    designGenerated: 10, copyGenerated: 10, allComplete: 10,
};

export const awardMilestoneServer = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const userId = request.auth.uid;
    const { milestone } = request.data;
    const reward = MILESTONE_REWARDS[milestone as string];
    if (!reward && reward !== 0) throw new HttpsError("invalid-argument", `Unknown milestone: ${milestone}`);

    const result = await admin.firestore().runTransaction(async (tx) => {
        const userRef = admin.firestore().collection("users").doc(userId);
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new HttpsError("not-found", "User not found.");

        const data = snap.data() || {};
        const milestones = data.milestones || {};

        // Already earned this milestone — no double rewards
        if (milestones[milestone as string]) {
            return { alreadyEarned: true, creditsRemaining: data.credits ?? 0, reward: 0 };
        }

        // Mark milestone as earned
        milestones[milestone as string] = true;
        let totalReward = reward;

        // Check if all 5 regular milestones done → award jackpot
        const regularDone = milestones.watchVideo && milestones.hooksGenerated &&
            milestones.conceptsGenerated && milestones.designGenerated && milestones.copyGenerated;
        if (regularDone && !milestones.allComplete) {
            milestones.allComplete = true;
            totalReward += MILESTONE_REWARDS.allComplete;
        }

        const newCredits = (data.credits ?? 0) + totalReward;
        tx.update(userRef, { milestones, credits: newCredits });
        return { alreadyEarned: false, creditsRemaining: newCredits, reward: totalReward };
    });

    if (!result.alreadyEarned) {
        await writeBillingState(userId, admin.firestore());
    }
    return { success: true, ...result };
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. BILLING: GET SUBSCRIPTION DETAILS
// ═══════════════════════════════════════════════════════════════════════════
// Returns current plan details from Stripe: status, renewal date, payment method, etc.
// Called from the "Manage Subscription" screen in the app.
// ═══════════════════════════════════════════════════════════════════════════

async function resolveStripeCustomerId(uid: string, stripe: Stripe): Promise<string> {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) throw new HttpsError("not-found", "User not found.");

    // If already cached in Firestore
    if (userData.stripeCustomerId) return userData.stripeCustomerId;

    // Fallback: look up by email
    const email = userData.email;
    if (!email) throw new HttpsError("not-found", "No email on account.");

    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 1 });
    if (customers.data.length > 0) {
        const customerId = customers.data[0].id;
        await admin.firestore().collection("users").doc(uid).update({ stripeCustomerId: customerId });
        return customerId;
    }

    throw new HttpsError("not-found", "No Stripe customer found. If you subscribed recently, please contact support.");
}

// DEPRECATED: preserved for reference only — getSubscription
export const getSubscription = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(request.auth.uid, stripe);

    // Get subscriptions (active, past_due, or canceling)
    const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
        return { status: 'none', plan: 'none' };
    }

    const sub = subscriptions.data[0] as any;
    const pm = sub.default_payment_method as Stripe.PaymentMethod | null;

    return {
        subscriptionId: sub.id,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodEnd: sub.current_period_end,
        currentPeriodStart: sub.current_period_start,
        priceId: sub.items?.data?.[0]?.price?.id || '',
        amount: ((sub.items?.data?.[0]?.price?.unit_amount || 0) as number) / 100,
        interval: sub.items?.data?.[0]?.price?.recurring?.interval || 'month',
        paymentMethod: pm?.card ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
        } : null,
    };
});

// DEPRECATED: preserved for reference only — cancelSubscription
export const cancelSubscription = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { reason, feedback } = request.data || {};
    const uid = request.auth.uid;

    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(uid, stripe);

    // Find active subscription
    const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 1,
    });

    if (subscriptions.data.length === 0) {
        throw new HttpsError("not-found", "No active subscription found.");
    }

    const sub = subscriptions.data[0];

    // 1. Tell Stripe to cancel at period end
    const updated = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
    }) as any;

    // 2. Get user data for GHL
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data() || {};

    // 3. Save cancellation data to Firestore
    await admin.firestore().collection("users").doc(uid).update({
        cancelAtPeriodEnd: true,
        billingStatus: 'cancelling',
        cancelAt: admin.firestore.Timestamp.fromDate(new Date(updated.current_period_end * 1000)),
        cancellationReason: reason || '',
        cancellationFeedback: feedback || '',
        cancellationDate: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. Notify GHL so CRM automations fire (emails, tags, pipeline)
    const ghlUrl = process.env.GHL_CANCEL_WEBHOOK_URL || '';
    if (ghlUrl) {
        try {
            await fetch(ghlUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: userData.email || '',
                    contact_id: userData.ghlContactId || '',
                    action: 'cancellation_requested',
                    reason: reason || '',
                    feedback: feedback || '',
                    plan: userData.plan || '',
                    cancelAt: updated.current_period_end,
                }),
            });
            console.log(`📧 GHL notified of cancellation for ${userData.email}`);
        } catch (ghlErr: any) {
            // Non-critical — don't fail the cancellation if GHL is down
            console.warn(`⚠️ GHL notification failed (non-critical): ${ghlErr.message}`);
        }
    }

    console.log(`❌ Cancellation scheduled: ${userData.email} → ends ${new Date(updated.current_period_end * 1000).toISOString()}`);

    await writeBillingState(uid, admin.firestore());

    return {
        success: true,
        cancelAt: updated.current_period_end,
        currentPeriodEnd: updated.current_period_end,
    };
});

// DEPRECATED: preserved for reference only — reactivateSubscription
export const reactivateSubscription = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;

    const callerDoc = await admin.firestore().collection("users").doc(uid).get();
    const callerData = callerDoc.data();
    if (callerData?.isTeamMember) {
        throw new HttpsError("failed-precondition", "Team members cannot manage billing.");
    }

    if (!callerData?.cancelAtPeriodEnd && callerData?.billingStatus !== 'cancelling') {
        throw new HttpsError("failed-precondition", "No pending cancellation to reactivate.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(uid, stripe);

    const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
    });

    if (subscriptions.data.length === 0) {
        throw new HttpsError("not-found", "No subscription found.");
    }

    const sub = subscriptions.data[0];

    // Remove the scheduled cancellation
    await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: false,
    });

    await admin.firestore().collection("users").doc(uid).update({
        billingStatus: 'active',
        cancelAtPeriodEnd: false,
        cancelledAt: admin.firestore.FieldValue.delete(),
        cancellationReason: admin.firestore.FieldValue.delete(),
        cancellationFeedback: admin.firestore.FieldValue.delete(),
        cancellationDate: admin.firestore.FieldValue.delete(),
        billingIssueAt: admin.firestore.FieldValue.delete(),
        billingIssueType: admin.firestore.FieldValue.delete(),
        gracePeriodEndsAt: admin.firestore.FieldValue.delete(),
    });

    console.log(`✅ Reactivated subscription for uid=${uid}`);
    await writeBillingState(uid, admin.firestore());
    return { success: true };
});

// DEPRECATED: preserved for reference only — applyRetentionDiscount
export const applyRetentionDiscount = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { couponId } = request.data || {};
    if (!couponId) throw new HttpsError("invalid-argument", "Missing couponId.");

    // Only allow known retention coupons
    const allowedCoupons = ['retention_50_3mo', 'retention_25_forever'];
    if (!allowedCoupons.includes(couponId)) {
        throw new HttpsError("invalid-argument", "Invalid coupon.");
    }

    const uid = request.auth.uid;

    // Check if user already used a retention discount (prevent abuse)
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (userData?.retentionCouponUsed) {
        throw new HttpsError("already-exists", "You've already used a retention discount.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(uid, stripe);

    const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
    });

    if (subscriptions.data.length === 0) {
        throw new HttpsError("not-found", "No subscription found.");
    }

    const sub = subscriptions.data[0];

    // Apply coupon AND cancel the pending cancellation
    await stripe.subscriptions.update(sub.id, {
        discounts: [{ coupon: couponId }],
        cancel_at_period_end: false,
    });

    await admin.firestore().collection("users").doc(uid).update({
        retentionCouponUsed: true,
        retentionCouponId: couponId,
        cancelAtPeriodEnd: false,
        billingStatus: 'active',
        cancelAt: admin.firestore.FieldValue.delete(),
        cancellationReason: admin.firestore.FieldValue.delete(),
        cancellationFeedback: admin.firestore.FieldValue.delete(),
        cancellationDate: admin.firestore.FieldValue.delete(),
    });

    await writeBillingState(uid, admin.firestore());
    console.log(`💰 Retention coupon applied: ${couponId} for uid=${uid}`);
    return { success: true, couponApplied: couponId };
});

// DEPRECATED: preserved for reference only — getInvoices
export const getInvoices = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(request.auth.uid, stripe);

    const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 12,
    });

    return {
        invoices: invoices.data.map((inv) => ({
            id: inv.id,
            number: inv.number,
            status: inv.status,                      // 'paid', 'open', 'void', 'draft', 'uncollectible'
            amount: (inv.amount_due || 0) / 100,
            currency: inv.currency?.toUpperCase() || 'USD',
            date: inv.created,                       // Unix timestamp
            periodStart: inv.period_start,
            periodEnd: inv.period_end,
            pdfUrl: inv.invoice_pdf || null,          // Direct PDF download
            hostedUrl: inv.hosted_invoice_url || null, // Stripe-hosted payment page (for open invoices)
        })),
    };
});

// DEPRECATED: preserved for reference only — retryInvoice
export const retryInvoice = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { invoiceId } = request.data || {};
    if (!invoiceId) throw new HttpsError("invalid-argument", "Missing invoiceId.");

    const stripe = new Stripe(stripeSecretKey.value());

    // Verify this invoice belongs to the user
    const customerId = await resolveStripeCustomerId(request.auth.uid, stripe);
    const invoice = await stripe.invoices.retrieve(invoiceId);

    if (invoice.customer !== customerId) {
        throw new HttpsError("permission-denied", "This invoice does not belong to your account.");
    }

    if (invoice.status !== 'open') {
        throw new HttpsError("failed-precondition", `Invoice is ${invoice.status}, not payable.`);
    }

    try {
        const paid = await stripe.invoices.pay(invoiceId);
        console.log(`✅ Invoice ${invoiceId} paid successfully for uid=${request.auth.uid}`);
        return { success: true, status: paid.status };
    } catch (err: any) {
        console.error(`Payment retry failed for ${invoiceId}:`, err.message);
        throw new HttpsError("internal", "Payment failed: " + (err.message || "Card declined."));
    }
});

// DEPRECATED: preserved for reference only — createSetupIntent
export const createSetupIntent = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(request.auth.uid, stripe);

    const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
    });

    console.log(`🔧 SetupIntent created for uid=${request.auth.uid}: ${setupIntent.id}`);
    return { clientSecret: setupIntent.client_secret };
});

// DEPRECATED: preserved for reference only — updatePaymentMethod
export const updatePaymentMethod = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { paymentMethodId } = request.data || {};
    if (!paymentMethodId) throw new HttpsError("invalid-argument", "Missing paymentMethodId.");

    const uid = request.auth.uid;
    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(uid, stripe);

    // Set as default payment method on the customer
    await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Also set on the subscription
    const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
    });

    if (subscriptions.data.length > 0) {
        await stripe.subscriptions.update(subscriptions.data[0].id, {
            default_payment_method: paymentMethodId,
        });
    }

    // Get new card details to save to Firestore
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    await admin.firestore().collection("users").doc(uid).update({
        paymentMethodLast4: pm.card?.last4 || '',
        paymentMethodBrand: pm.card?.brand || '',
        paymentMethodExpiry: `${pm.card?.exp_month}/${pm.card?.exp_year}`,
    });

    console.log(`💳 Payment method updated for uid=${uid}: ${pm.card?.brand} ****${pm.card?.last4}`);
    return {
        success: true,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
    };
});

// DEPRECATED: preserved for reference only — changePlan
export const changePlan = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { newPriceId } = request.data || {};
    if (!newPriceId) throw new HttpsError("invalid-argument", "Missing newPriceId.");

    const uid = request.auth.uid;
    const stripe = new Stripe(stripeSecretKey.value());
    const customerId = await resolveStripeCustomerId(uid, stripe);

    const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 1,
    });

    if (subscriptions.data.length === 0) {
        throw new HttpsError("not-found", "No active subscription found.");
    }

    const sub = subscriptions.data[0] as any;
    const currentItemId = sub.items?.data?.[0]?.id;

    if (!currentItemId) {
        throw new HttpsError("internal", "Subscription has no items.");
    }

    // Update the subscription with the new price (immediate proration)
    const updated = await stripe.subscriptions.update(sub.id, {
        items: [{
            id: currentItemId,
            price: newPriceId,
        }],
        proration_behavior: 'create_prorations',
        // Also remove any pending cancellation if they're upgrading
        cancel_at_period_end: false,
    });

    // The Stripe webhook (customer.subscription.updated) will update Firestore
    // with the new plan and credits, so we don't need to do it here.
    // But let's clear cancellation flags just in case.
    await admin.firestore().collection("users").doc(uid).update({
        cancelAtPeriodEnd: false,
    });

    console.log(`🔄 Plan changed for uid=${uid}: ${newPriceId}`);
    return {
        success: true,
        newPriceId,
        status: updated.status,
    };
});
// ═══════════════════════════════════════════════════════════════════════════
// @END LEGACY STRIPE BILLING
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE BILLING
// ═══════════════════════════════════════════════════════════════════════════

const ghlUrlByEvent: Record<GHLEventType, () => string> = {
    "trial.started": () => ghlTrialStartedUrl.value(),
    "subscription.created": () => ghlPaymentReceivedUrl.value(),
    "payment.recovered": () => ghlRecoveredUrl.value(),
    "payment.failed": () => ghlOverdueFailedUrl.value(),
    "subscription.cancelled": () => ghlCancelledUrl.value(),
    "top_up.completed": () => ghlTopupUrl.value(),
};

setNotifyGHL((identifier: string, eventType: GHLEventType, payloadFields: any) => {
    return notifyGHL(identifier, eventType, payloadFields, {
        stripeSecretKey: stripeSecretKey.value(),
        urlByEvent: ghlUrlByEvent,
    });
});

export const createStripeCheckoutSession = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;
    const email = request.auth.token?.email;
    const priceId = request.data?.priceId as string;
    if (!priceId) throw new HttpsError("invalid-argument", "Missing priceId.");

    const planInfo = STRIPE_PRICE_TO_PLAN[priceId];
    if (!planInfo || planInfo.plan === "keep_current") {
        throw new HttpsError("invalid-argument", "Invalid priceId.");
    }

    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    if (userDoc.data()?.isTeamMember) {
        throw new HttpsError("failed-precondition", "Team members cannot subscribe directly.");
    }

    try {
        return await createStripeCheckoutSessionImpl(uid, email ?? "", priceId, stripeSecretKey.value());
    } catch (err: any) {
        throw new HttpsError("internal", err.message);
    }
});

export const createStripeTopUpSession = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;
    const email = request.auth.token?.email;
    const creditAmount = request.data?.creditAmount as number;
    const priceId = request.data?.priceId as string;

    if (![100, 300, 800].includes(creditAmount)) {
        throw new HttpsError("invalid-argument", "Invalid creditAmount.");
    }

    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (userData?.isTeamMember) {
        throw new HttpsError("failed-precondition", "Team members cannot purchase top-ups.");
    }
    if (userData?.billingStatus === "past_due") {
        throw new HttpsError("failed-precondition", "Resolve payment issue first.");
    }
    if (!userData?.stripeSubscriptionId && !userData?.plan || userData?.plan === "none") {
        throw new HttpsError("failed-precondition", "Active subscription required for top-ups.");
    }

    try {
        return await createStripeTopUpSessionImpl(uid, email ?? "", creditAmount, priceId, stripeSecretKey.value());
    } catch (err: any) {
        throw new HttpsError("internal", err.message);
    }
});

export const createStripePortalSession = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login required.");
    }

    const uid = request.auth.uid;
    const flow = request.data?.flow as "subscription_cancel" | "payment_method_update" | undefined;
    const returnUrl = request.data?.returnUrl as string | undefined;

    try {
        return await createStripePortalSessionImpl(uid, flow, returnUrl, stripeSecretKey.value());
    } catch (err: any) {
        throw new HttpsError(err.code === "failed-precondition" ? "failed-precondition" : "internal", err.message);
    }
});

export const stripeWebhook = onRequest({
    region: "europe-west1",
    secrets: [stripeSecretKey, stripeWebhookSecret, ghlTrialStartedUrl, ghlPaymentReceivedUrl, ghlRecoveredUrl, ghlOverdueFailedUrl, ghlCancelledUrl, ghlTopupUrl],
    cors: true,
}, async (req, res) => {
    await handleStripeWebhook(req, res, {
        stripeSecretKey: stripeSecretKey.value(),
        stripeWebhookSecret: stripeWebhookSecret.value(),
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT: Create Team Member
// ═══════════════════════════════════════════════════════════════════════════
export const PLAN_TEAM_LIMITS: Record<string, number> = {
    none: 0, starter: 1, pro: 3, scale: 10,
};

// ═══════════════════════════════════════════════════════════════════════════
// TEAM INVITE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════
// Collection: team_invites
// Statuses: pending → sent → accepted | failed | revoked | expired
// Final membership created only on acceptance/claim.
// ═══════════════════════════════════════════════════════════════════════════

export const INVITE_EXPIRY_DAYS = 7;
export const OPEN_INVITE_STATUSES = ['pending', 'sent', 'failed'];

export function canCreateInvite(plan: string, currentMembers: number, openInvites: number): { allowed: boolean; reason?: string } {
    const max = PLAN_TEAM_LIMITS[plan] ?? 0;
    if (max === 0) return { allowed: false, reason: "Team invites not available on this plan." };
    if (currentMembers + openInvites >= max) {
        return { allowed: false, reason: `Your ${plan} plan allows ${max} members.` };
    }
    return { allowed: true };
}

export function isClaimable(invite: { inviteeEmailNormalized: string; status: string; expiresAt: number }, callerEmail: string, now: number): { claimable: boolean; reason?: string } {
    if (invite.inviteeEmailNormalized !== callerEmail) {
        return { claimable: false, reason: "Email mismatch." };
    }
    if (!OPEN_INVITE_STATUSES.includes(invite.status)) {
        return { claimable: false, reason: `Invite is ${invite.status}.` };
    }
    if (invite.expiresAt < now) {
        return { claimable: false, reason: "Expired." };
    }
    return { claimable: true };
}

export function deductCreditsViewerCheck(isTeamMember: boolean, teamRole: string | null): { allowed: boolean } {
    if (isTeamMember && teamRole === "viewer") {
        return { allowed: false };
    }
    return { allowed: true };
}

export function getInviteDetailsLogic(invite: { status: string; expiresAt: number } | null, now: number): { success: boolean; status?: string; message?: string } {
    if (!invite) {
        return { success: false, status: "not_found", message: "Invite not found" };
    }
    if (invite.status === "revoked") {
        return { success: false, status: "revoked", message: "This invite is no longer valid" };
    }
    if (invite.status === "accepted") {
        return { success: false, status: "accepted", message: "This invite has already been claimed" };
    }
    if (invite.expiresAt < now) {
        return { success: false, status: "expired", message: "This invite has expired" };
    }
    return { success: true };
}

interface TeamInvite {
    inviteId: string;
    ownerId: string;
    ownerEmail: string;
    ownerName: string;
    inviteeEmail: string;
    inviteeEmailNormalized: string;
    inviteeName: string;
    role: 'editor' | 'viewer';
    teamPlan: string;
    status: 'pending' | 'sent' | 'failed' | 'accepted' | 'revoked' | 'expired';
    createdAt: number;
    updatedAt: number;
    sentAt: number | null;
    acceptedAt: number | null;
    revokedAt: number | null;
    expiresAt: number;
    deliveryAttemptCount: number;
    lastDeliveryError: string | null;
    ghlDeliveryStatus: string | null;
    claimedByUserId: string | null;
}

async function countReservedSeats(ownerUid: string): Promise<number> {
    // Active members
    const teamSnap = await admin.firestore().collection("users").doc(ownerUid).collection("team").get();
    const activeMembers = teamSnap.size;

    // Open invites (pending/sent/failed)
    const inviteSnap = await admin.firestore().collection("team_invites")
        .where("ownerId", "==", ownerUid)
        .where("status", "in", OPEN_INVITE_STATUSES)
        .get();
    const openInvites = inviteSnap.size;

    return activeMembers + openInvites;
}

async function sendGhlInviteWebhook(invite: TeamInvite, isNewUser: boolean, webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
        const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inviteId: invite.inviteId,
                inviteeName: invite.inviteeName,
                inviteeEmail: invite.inviteeEmailNormalized,
                role: invite.role,
                ownerName: invite.ownerName,
                ownerEmail: invite.ownerEmail,
                teamPlan: invite.teamPlan,
                isNewUser,
            }),
        });
        if (!resp.ok) {
            return { success: false, error: `HTTP ${resp.status}: ${resp.statusText}` };
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Network error' };
    }
}

// ─── CREATE / SEND INVITE ────────────────────────────────────────────────
export const createTeamInvite = onCall({
    region: "europe-west1",
    cors: true,
    secrets: [ghlTeamInviteUrl],
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

    const { name, email, role } = request.data;
    const ownerUid = request.auth.uid;

    if (!name || !email || !role) throw new HttpsError("invalid-argument", "Name, email, and role are required.");
    if (!["editor", "viewer"].includes(role)) throw new HttpsError("invalid-argument", "Role must be editor or viewer.");

    const normalizedEmail = email.toLowerCase().trim();
    const auth = admin.auth();
    const ownerDoc = await admin.firestore().collection("users").doc(ownerUid).get();
    const ownerData = ownerDoc.data();
    if (!ownerData) throw new HttpsError("not-found", "Owner account not found.");

    const ownerPlan = ownerData.plan || "none";
    const maxMembers = PLAN_TEAM_LIMITS[ownerPlan] ?? 0;
    if (maxMembers === 0) throw new HttpsError("permission-denied", "Your plan does not support team members.");

    // Prevent inviting yourself
    const ownerRecord = await auth.getUser(ownerUid);
    if (ownerRecord.email?.toLowerCase() === normalizedEmail) throw new HttpsError("invalid-argument", "You cannot invite yourself.");

    // Seat limit including open invites — owner-inclusive (per spec FR-005, clarification Q1).
    // maxMembers is TOTAL seats including the owner; `reserved` counts non-owner members + open invites.
    // Proposed size after this new invite = reserved + 1 (owner) + 1 (new invite) = reserved + 2.
    // Block when that would exceed the total cap.
    if (maxMembers !== -1) {
        const reserved = await countReservedSeats(ownerUid);
        const proposedSize = reserved + 2;
        if (proposedSize > maxMembers) {
            const currentSize = reserved + 1; // owner + active + pending
            throw new HttpsError("resource-exhausted", `Your ${ownerPlan} plan allows ${maxMembers} seat(s) (owner + team). You're at ${currentSize}/${maxMembers}. Remove someone or upgrade.`);
        }
    }

    // Check if already an active team member of THIS owner
    const existingMember = await admin.firestore().collection("users").doc(ownerUid).collection("team")
        .where("email", "==", normalizedEmail).get();
    if (!existingMember.empty) throw new HttpsError("already-exists", "This person is already on your team.");

    // Check if already an active team member of ANY other owner (one-team-per-user model)
    const existingMembership = await admin.firestore().collection("teamMemberships").doc(normalizedEmail).get();
    if (existingMembership.exists) {
        const mData = existingMembership.data();
        if (mData && mData.ownerUid !== ownerUid) {
            throw new HttpsError("already-exists", "This person is already a member of another team.");
        }
    }

    // Dedupe: check for existing open invite
    const existingInvites = await admin.firestore().collection("team_invites")
        .where("ownerId", "==", ownerUid)
        .where("inviteeEmailNormalized", "==", normalizedEmail)
        .where("status", "in", OPEN_INVITE_STATUSES)
        .get();

    let inviteId: string;
    let inviteRef: admin.firestore.DocumentReference;
    const now = Date.now();
    const expiresAt = now + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    if (!existingInvites.empty) {
        // Update and resend existing open invite
        inviteRef = existingInvites.docs[0].ref;
        inviteId = existingInvites.docs[0].id;
        await inviteRef.update({
            inviteeName: name,
            role,
            teamPlan: ownerPlan,
            updatedAt: now,
            expiresAt,
            status: 'pending',
        });
    } else {
        // Create new invite
        inviteRef = admin.firestore().collection("team_invites").doc();
        inviteId = inviteRef.id;
        const invite: TeamInvite = {
            inviteId,
            ownerId: ownerUid,
            ownerEmail: ownerRecord.email || '',
            ownerName: ownerRecord.displayName || ownerRecord.email?.split('@')[0] || '',
            inviteeEmail: email.trim(),
            inviteeEmailNormalized: normalizedEmail,
            inviteeName: name,
            role,
            teamPlan: ownerPlan,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            sentAt: null,
            acceptedAt: null,
            revokedAt: null,
            expiresAt,
            deliveryAttemptCount: 0,
            lastDeliveryError: null,
            ghlDeliveryStatus: null,
            claimedByUserId: null,
        };
        await inviteRef.set(invite);
    }

    // Check if user already exists in Firebase Auth
    let isNewUser = false;
    try { await auth.getUserByEmail(normalizedEmail); } catch { isNewUser = true; }

    // Send via GHL webhook (backend-owned)
    const inviteData = (await inviteRef.get()).data() as TeamInvite;
    const webhookUrl = ghlTeamInviteUrl.value();
    const delivery = await sendGhlInviteWebhook(inviteData, isNewUser, webhookUrl);

    if (delivery.success) {
        await inviteRef.update({
            status: 'sent',
            sentAt: now,
            updatedAt: now,
            deliveryAttemptCount: admin.firestore.FieldValue.increment(1),
            ghlDeliveryStatus: 'delivered',
            lastDeliveryError: null,
        });
    } else {
        await inviteRef.update({
            status: 'failed',
            updatedAt: now,
            deliveryAttemptCount: admin.firestore.FieldValue.increment(1),
            lastDeliveryError: delivery.error || 'Unknown error',
            ghlDeliveryStatus: 'failed',
        });
    }

    console.log(`👥 Team invite ${delivery.success ? 'sent' : 'FAILED'}: ${normalizedEmail} (${role}) for owner ${ownerRecord.email}, inviteId=${inviteId}`);

    return {
        success: true,
        inviteId,
        deliverySuccess: delivery.success,
        deliveryError: delivery.error || null,
        message: delivery.success
            ? `Invite sent to ${normalizedEmail}!`
            : `Invite created but email delivery failed. You can resend later.`,
    };
});

// ─── RESEND INVITE ───────────────────────────────────────────────────────
export const resendTeamInvite = onCall({
    region: "europe-west1",
    cors: true,
    secrets: [ghlTeamInviteUrl],
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { inviteId } = request.data;
    if (!inviteId) throw new HttpsError("invalid-argument", "inviteId required.");

    const inviteRef = admin.firestore().collection("team_invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) throw new HttpsError("not-found", "Invite not found.");

    const invite = inviteSnap.data() as TeamInvite;
    if (invite.ownerId !== request.auth.uid) throw new HttpsError("permission-denied", "Only the team owner can resend.");
    if (!OPEN_INVITE_STATUSES.includes(invite.status)) throw new HttpsError("failed-precondition", `Cannot resend invite with status: ${invite.status}`);

    // Refresh expiry
    const now = Date.now();
    const expiresAt = now + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    let isNewUser = false;
    try { await admin.auth().getUserByEmail(invite.inviteeEmailNormalized); } catch { isNewUser = true; }

    const delivery = await sendGhlInviteWebhook(invite, isNewUser, ghlTeamInviteUrl.value());

    await inviteRef.update({
        status: delivery.success ? 'sent' : 'failed',
        sentAt: delivery.success ? now : invite.sentAt,
        updatedAt: now,
        expiresAt,
        deliveryAttemptCount: admin.firestore.FieldValue.increment(1),
        lastDeliveryError: delivery.error || null,
        ghlDeliveryStatus: delivery.success ? 'delivered' : 'failed',
    });

    return { success: delivery.success, message: delivery.success ? 'Invite resent!' : `Resend failed: ${delivery.error}` };
});

// ─── REVOKE INVITE ───────────────────────────────────────────────────────
export const revokeTeamInvite = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { inviteId } = request.data;
    if (!inviteId) throw new HttpsError("invalid-argument", "inviteId required.");

    const inviteRef = admin.firestore().collection("team_invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) throw new HttpsError("not-found", "Invite not found.");

    const invite = inviteSnap.data() as TeamInvite;
    if (invite.ownerId !== request.auth.uid) throw new HttpsError("permission-denied", "Only the team owner can revoke.");
    if (invite.status === 'accepted') throw new HttpsError("failed-precondition", "Cannot revoke an already accepted invite. Remove the team member instead.");
    if (invite.status === 'revoked') throw new HttpsError("failed-precondition", "Invite is already revoked.");

    await inviteRef.update({
        status: 'revoked',
        revokedAt: Date.now(),
        updatedAt: Date.now(),
    });

    return { success: true, message: 'Invite revoked.' };
});

// ─── CLAIM INVITE (auto-claim on login) ──────────────────────────────────
export const claimTeamInvite = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const callerUid = request.auth.uid;
    const callerEmail = request.auth.token.email?.toLowerCase().trim();
    if (!callerEmail) throw new HttpsError("failed-precondition", "No email on account.");

    // Check if already on a team (one-team-per-user model)
    const existingMembership = await admin.firestore().collection("teamMemberships").doc(callerEmail).get();
    if (existingMembership.exists) {
        return { success: false, claimed: 0, message: 'Already a member of a team.' };
    }

    const invites = await admin.firestore().collection("team_invites")
        .where("inviteeEmailNormalized", "==", callerEmail)
        .where("status", "in", OPEN_INVITE_STATUSES)
        .get();

    if (invites.empty) return { success: false, claimed: 0, message: 'No open invites found.' };

    // Sort by createdAt ascending — claim the earliest valid invite only
    const sorted = invites.docs
        .map(d => ({ doc: d, data: d.data() as TeamInvite }))
        .sort((a, b) => a.data.createdAt - b.data.createdAt);

    // Expire stale invites first
    const valid: typeof sorted = [];
    for (const entry of sorted) {
        if (entry.data.expiresAt < Date.now()) {
            await entry.doc.ref.update({ status: 'expired', updatedAt: Date.now() });
        } else {
            valid.push(entry);
        }
    }

    if (valid.length === 0) return { success: false, claimed: 0, message: 'All invites have expired.' };

    // Claim exactly the first valid invite
    const target = valid[0];
    let claimed = 0;

    try {
        await admin.firestore().runTransaction(async (txn) => {
            // Re-read invite inside transaction to prevent race
            const freshSnap = await txn.get(target.doc.ref);
            if (!freshSnap.exists) return;
            const freshInvite = freshSnap.data() as TeamInvite;

            // Already claimed by someone (race guard)
            if (freshInvite.status === 'accepted' || freshInvite.status === 'revoked' || freshInvite.status === 'expired') return;

            // Double-check reverse lookup inside transaction
            const membershipSnap = await txn.get(admin.firestore().collection("teamMemberships").doc(callerEmail));
            if (membershipSnap.exists) return; // another claim won the race

            // Check if caller is already an active member for this owner (duplicate guard)
            const existingMember = await txn.get(
                admin.firestore().collection("users").doc(freshInvite.ownerId).collection("team")
                    .where("email", "==", callerEmail).limit(1)
            );
            if (!existingMember.empty) {
                // Already a member — just mark invite accepted, don't create duplicate
                txn.update(target.doc.ref, { status: 'accepted', acceptedAt: Date.now(), updatedAt: Date.now(), claimedByUserId: callerUid });
                return;
            }

            // Create team member doc
            const memberRef = admin.firestore().collection("users").doc(freshInvite.ownerId).collection("team").doc();
            txn.set(memberRef, {
                name: freshInvite.inviteeName,
                email: freshInvite.inviteeEmailNormalized,
                role: freshInvite.role,
                uid: callerUid,
                status: "active",
                invitedAt: freshInvite.createdAt,
                joinedAt: Date.now(),
                inviteId: freshInvite.inviteId,
            });

            // Create reverse-lookup
            const membershipRef = admin.firestore().collection("teamMemberships").doc(freshInvite.inviteeEmailNormalized);
            txn.set(membershipRef, {
                ownerUid: freshInvite.ownerId,
                ownerEmail: freshInvite.ownerEmail,
                ownerName: freshInvite.ownerName,
                role: freshInvite.role,
                teamPlan: freshInvite.teamPlan,
                joinedAt: Date.now(),
                memberId: memberRef.id,
            });

            // Mark user as team member
            const userRef = admin.firestore().collection("users").doc(callerUid);
            txn.set(userRef, {
                plan: "none", credits: 0,
                teamOwnerUid: freshInvite.ownerId,
                teamRole: freshInvite.role,
                isTeamMember: true,
                displayName: freshInvite.inviteeName,
                email: freshInvite.inviteeEmailNormalized,
            }, { merge: true });

            // Mark invite accepted
            txn.update(target.doc.ref, {
                status: 'accepted',
                acceptedAt: Date.now(),
                updatedAt: Date.now(),
                claimedByUserId: callerUid,
            });
        });
        claimed = 1;
    } catch (e) {
        console.warn(`Claim transaction failed for invite ${target.data.inviteId}:`, e);
    }

    // Clean up remaining open invites from other owners to free their reserved seats
    if (claimed > 0 && valid.length > 1) {
        const remaining = valid.slice(1);
        for (const entry of remaining) {
            try {
                await entry.doc.ref.update({
                    status: 'revoked',
                    revokedAt: Date.now(),
                    updatedAt: Date.now(),
                    lastDeliveryError: 'Auto-revoked: invitee joined a different team.',
                });
            } catch (e) {
                console.warn(`Auto-revoke failed for invite ${entry.data.inviteId}:`, e);
            }
        }
    }

    return { success: claimed > 0, claimed, message: claimed > 0 ? 'Joined a team!' : 'No valid invites to claim.' };
});

// ─── GET INVITES (for owner UI) ──────────────────────────────────────────
export const getTeamInvites = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const ownerUid = request.auth.uid;

    const snap = await admin.firestore().collection("team_invites")
        .where("ownerId", "==", ownerUid)
        .get();

    const invites = snap.docs.map(d => {
        const inv = d.data() as TeamInvite;
        // Auto-expire stale invites on read
        if (OPEN_INVITE_STATUSES.includes(inv.status) && inv.expiresAt < Date.now()) {
            d.ref.update({ status: 'expired', updatedAt: Date.now() });
            return { ...inv, status: 'expired' as const };
        }
        return inv;
    });

    return { success: true, invites };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT: Legacy createTeamMember (redirects to invite flow)
// ═══════════════════════════════════════════════════════════════════════════
export const createTeamMember = onCall({
    region: "europe-west1",
    cors: true,
    secrets: [ghlTeamInviteUrl],
}, async (request: CallableRequest) => {
    // Legacy compat: redirect to invite flow
    // Frontend may still call this — treat it as createTeamInvite
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { name, email, role } = request.data;
    const ownerUid = request.auth.uid;
    if (!name || !email || !role) throw new HttpsError("invalid-argument", "Name, email, and role are required.");
    if (!["editor", "viewer"].includes(role)) throw new HttpsError("invalid-argument", "Role must be editor or viewer.");

    // Delegate to the same logic
    const normalizedEmail = email.toLowerCase().trim();
    const authSvc = admin.auth();
    const ownerDoc = await admin.firestore().collection("users").doc(ownerUid).get();
    const ownerData = ownerDoc.data();
    if (!ownerData) throw new HttpsError("not-found", "Owner account not found.");
    const ownerPlan = ownerData.plan || "none";
    const maxMembers = PLAN_TEAM_LIMITS[ownerPlan] ?? 0;
    if (maxMembers === 0) throw new HttpsError("permission-denied", "Your plan does not support team members.");
    const ownerRecord = await authSvc.getUser(ownerUid);
    if (ownerRecord.email?.toLowerCase() === normalizedEmail) throw new HttpsError("invalid-argument", "You cannot invite yourself.");
    if (maxMembers !== -1) {
        const reserved = await countReservedSeats(ownerUid);
        const proposedSize = reserved + 2; // owner + existing + new invite (owner-inclusive per FR-005)
        if (proposedSize > maxMembers) {
            const currentSize = reserved + 1;
            throw new HttpsError("resource-exhausted", `Your ${ownerPlan} plan allows ${maxMembers} seat(s) (owner + team). You're at ${currentSize}/${maxMembers}. Upgrade for more.`);
        }
    }

    // Check already active on this team
    const existingMember = await admin.firestore().collection("users").doc(ownerUid).collection("team")
        .where("email", "==", normalizedEmail).get();
    if (!existingMember.empty) throw new HttpsError("already-exists", "This person is already on your team.");

    // Check already active on another team (one-team-per-user model)
    const existingMembership = await admin.firestore().collection("teamMemberships").doc(normalizedEmail).get();
    if (existingMembership.exists) {
        const mData = existingMembership.data();
        if (mData && mData.ownerUid !== ownerUid) {
            throw new HttpsError("already-exists", "This person is already a member of another team.");
        }
    }

    // Create invite
    const existingInvites = await admin.firestore().collection("team_invites")
        .where("ownerId", "==", ownerUid)
        .where("inviteeEmailNormalized", "==", normalizedEmail)
        .where("status", "in", OPEN_INVITE_STATUSES)
        .get();

    const now = Date.now();
    const expiresAt = now + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let inviteId: string;
    let inviteRef: admin.firestore.DocumentReference;

    if (!existingInvites.empty) {
        inviteRef = existingInvites.docs[0].ref;
        inviteId = existingInvites.docs[0].id;
        await inviteRef.update({ inviteeName: name, role, teamPlan: ownerPlan, updatedAt: now, expiresAt, status: 'pending' });
    } else {
        inviteRef = admin.firestore().collection("team_invites").doc();
        inviteId = inviteRef.id;
        await inviteRef.set({
            inviteId, ownerId: ownerUid, ownerEmail: ownerRecord.email || '', ownerName: ownerRecord.displayName || '',
            inviteeEmail: email.trim(), inviteeEmailNormalized: normalizedEmail, inviteeName: name,
            role, teamPlan: ownerPlan, status: 'pending', createdAt: now, updatedAt: now,
            sentAt: null, acceptedAt: null, revokedAt: null, expiresAt,
            deliveryAttemptCount: 0, lastDeliveryError: null, ghlDeliveryStatus: null, claimedByUserId: null,
        });
    }

    let isNewUser = false;
    try { await authSvc.getUserByEmail(normalizedEmail); } catch { isNewUser = true; }

    const inviteData = (await inviteRef.get()).data() as TeamInvite;
    const delivery = await sendGhlInviteWebhook(inviteData, isNewUser, ghlTeamInviteUrl.value());
    await inviteRef.update({
        status: delivery.success ? 'sent' : 'failed',
        sentAt: delivery.success ? now : null,
        updatedAt: now,
        deliveryAttemptCount: admin.firestore.FieldValue.increment(1),
        lastDeliveryError: delivery.error || null,
        ghlDeliveryStatus: delivery.success ? 'delivered' : 'failed',
    });

    return {
        success: true, inviteId, isNewUser: isNewUser,
        deliverySuccess: delivery.success,
        deliveryError: delivery.error || null,
        message: delivery.success ? `Invite sent to ${normalizedEmail}!` : 'Invite created but email failed. Resend later.',
    };
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT: Remove Team Member
// ═══════════════════════════════════════════════════════════════════════════
export const removeTeamMember = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

    const { memberId } = request.data;
    const ownerUid = request.auth.uid;

    if (!memberId) throw new HttpsError("invalid-argument", "Member ID required.");

    // Get member doc
    const memberDoc = await admin.firestore().collection("users").doc(ownerUid).collection("team").doc(memberId).get();
    if (!memberDoc.exists) throw new HttpsError("not-found", "Team member not found.");

    const memberData = memberDoc.data()!;
    const memberEmail = memberData.email;

    // Delete team doc
    await admin.firestore().collection("users").doc(ownerUid).collection("team").doc(memberId).delete();

    // Delete reverse-lookup
    try {
        await admin.firestore().collection("teamMemberships").doc(memberEmail).delete();
    } catch (e) { /* non-blocking */ }

    // Remove team flags from member's user doc
    if (memberData.uid) {
        await admin.firestore().collection("users").doc(memberData.uid).update({
            isTeamMember: admin.firestore.FieldValue.delete(),
            teamOwnerUid: admin.firestore.FieldValue.delete(),
            teamRole: admin.firestore.FieldValue.delete(),
        });
    }

    console.log(`👥 Team member removed: ${memberEmail} from owner ${ownerUid}`);
    return { success: true, message: `${memberData.name} has been removed from your team.` };
});

// ─── GET INVITE DETAILS (public, for join page) ──────────────────────────
export const getInviteDetails = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    const { inviteId } = request.data;
    if (!inviteId) throw new HttpsError("invalid-argument", "inviteId is required.");

    const inviteDoc = await admin.firestore().collection("team_invites").doc(inviteId).get();
    if (!inviteDoc.exists) {
        return { success: false, status: "not_found", message: "Invite not found" };
    }
    const invite = inviteDoc.data() as TeamInvite;
    const now = Date.now();

    if (invite.status === "revoked") {
        return { success: false, status: "revoked", message: "This invite is no longer valid" };
    }
    if (invite.status === "accepted") {
        return { success: false, status: "accepted", message: "This invite has already been claimed" };
    }
    if (invite.expiresAt < now) {
        // Persist the expiry (lazy-expire, same pattern as claimTeamInvite) so
        // countReservedSeats() no longer counts this invite as a reserved seat.
        if (invite.status !== "expired") {
            await inviteDoc.ref.update({ status: "expired", updatedAt: Date.now() });
        }
        return { success: false, status: "expired", message: "This invite has expired" };
    }

    return {
        success: true,
        ownerName: invite.ownerName,
        inviteeEmail: invite.inviteeEmail,
        inviteeName: invite.inviteeName,
        teamPlan: invite.teamPlan,
        role: invite.role,
        expiresAt: invite.expiresAt,
    };
});

// ─── UPDATE TEAM MEMBER ROLE ─────────────────────────────────────────────
export const updateTeamMemberRole = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { memberId, role } = request.data;
    const ownerUid = request.auth.uid;

    if (!memberId || !role) throw new HttpsError("invalid-argument", "Member ID and role are required.");
    if (!["editor", "viewer"].includes(role)) throw new HttpsError("invalid-argument", "Role must be editor or viewer.");

    const memberRef = admin.firestore().collection("users").doc(ownerUid).collection("team").doc(memberId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) throw new HttpsError("not-found", "Team member not found.");

    const memberData = memberDoc.data()!;
    // Fail fast if the member has no linked user uid — otherwise the role would update on the
    // team doc but never propagate to the member's user doc, leaving the two out of sync.
    if (!memberData.uid) throw new HttpsError("failed-precondition", "Team member has no linked account.");

    // Apply both writes atomically so neither lands without the other.
    const batch = admin.firestore().batch();
    batch.update(memberRef, { role, updatedAt: Date.now() });
    batch.update(admin.firestore().collection("users").doc(memberData.uid), { teamRole: role });
    await batch.commit();

    console.log(`👥 Team member role updated: ${memberData.email} → ${role} by owner ${ownerUid}`);
    return { success: true, message: `Role updated to ${role}.` };
});

// ═══════════════════════════════════════════════════════════════════════════
// META ADS API INTEGRATION — PHASE 2
// ═══════════════════════════════════════════════════════════════════════════

// ─── ENCRYPTION HELPERS ──────────────────────────────────────────────────
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function encryptToken(token: string, secret: string): string {
    const key = crypto.scryptSync(secret, "proadsai-salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptToken(encryptedData: string, secret: string): string {
    const key = crypto.scryptSync(secret, "proadsai-salt", 32);
    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

// ─── 1. META OAUTH: Exchange code for long-lived token ───────────────────
export const metaOAuthCallback = onRequest({
    region: "europe-west1",
    secrets: [metaAppId, metaAppSecret],
    cors: true,
}, async (req, res) => {
    const code = req.query.code as string;
    const state = req.query.state as string; // Contains userId
    const error = req.query.error as string;

    if (error) {
        console.error("Meta OAuth error:", req.query.error_description);
        res.send(`<html><body><h2>Connection failed</h2><p>Error: ${error}</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
        return;
    }

    if (!code || !state) {
        res.status(400).send("Missing code or state parameter");
        return;
    }

    try {
        const appId = metaAppId.value();
        const appSecret = metaAppSecret.value();
        const redirectUri = `https://europe-west1-proadsai-saas.cloudfunctions.net/metaOAuthCallback`;

        // Step 1: Exchange code for short-lived token
        const tokenResponse = await fetch(
            `https://graph.facebook.com/v22.0/oauth/access_token?` +
            `client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&client_secret=${appSecret}&code=${code}`
        );
        const tokenData = await tokenResponse.json() as any;

        if (tokenData.error) {
            console.error("Token exchange error:", tokenData.error);
            res.send(`<html><body><h2>Connection failed</h2><p>Token exchange error</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
            return;
        }

        const shortLivedToken = tokenData.access_token;

        // Step 2: Exchange for long-lived token (60 days)
        const longLivedResponse = await fetch(
            `https://graph.facebook.com/v22.0/oauth/access_token?` +
            `grant_type=fb_exchange_token&client_id=${appId}` +
            `&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
        );
        const longLivedData = await longLivedResponse.json() as any;

        if (longLivedData.error) {
            console.error("Long-lived token error:", longLivedData.error);
            res.send(`<html><body><h2>Connection failed</h2><p>Token error</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
            return;
        }

        const longLivedToken = longLivedData.access_token;
        const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days

        // Step 3: Get user's ad accounts
        const accountsResponse = await fetch(
            `https://graph.facebook.com/v22.0/me/adaccounts?` +
            `fields=id,name,account_status,currency,timezone_name&` +
            `access_token=${longLivedToken}`
        );
        const accountsData = await accountsResponse.json() as any;
        const adAccounts = (accountsData.data || []).map((acc: any) => ({
            id: acc.id,
            name: acc.name || acc.id,
            status: acc.account_status,
            currency: acc.currency,
            timezone: acc.timezone_name,
        }));

        // Step 4: Encrypt and store token
        const encryptedToken = encryptToken(longLivedToken, appSecret);
        const expiresAt = Date.now() + (expiresIn * 1000);

        await admin.firestore().collection("metaConnections").doc(state).set({
            userId: state,
            encryptedToken,
            expiresAt,
            adAccounts,
            selectedAccountId: adAccounts.length > 0 ? adAccounts[0].id : null,
            connectedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSyncAt: null,
            status: "active",
        });

        console.log(`✅ Meta connected for user ${state} — ${adAccounts.length} ad accounts found`);
        res.send(`<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2 style="color:#10b981">✅ Connected!</h2><p>${adAccounts.length} ad account(s) found.</p><p style="color:#888">This window will close automatically...</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`);

    } catch (err: any) {
        console.error("Meta OAuth callback error:", err);
        res.send(`<html><body><h2>Connection failed</h2><p>Server error</p><script>setTimeout(()=>window.close(),2000)</script></body></html>`);
    }
});

// ─── 2. GET META CONNECTION STATUS ──────────────────────────────────────
export const getMetaConnection = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;

    const doc = await admin.firestore().collection("metaConnections").doc(uid).get();
    if (!doc.exists) return { connected: false };

    const data = doc.data()!;
    return {
        connected: true,
        adAccounts: data.adAccounts || [],
        selectedAccountId: data.selectedAccountId,
        connectedAt: data.connectedAt,
        lastSyncAt: data.lastSyncAt,
        status: data.status,
        tokenExpiring: data.expiresAt < Date.now() + (7 * 24 * 60 * 60 * 1000), // Expires within 7 days
    };
});

// ─── 3. SELECT AD ACCOUNT ───────────────────────────────────────────────
export const metaSelectAccount = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const { accountId } = request.data;
    if (!accountId) throw new HttpsError("invalid-argument", "Missing accountId");

    await admin.firestore().collection("metaConnections").doc(uid).update({
        selectedAccountId: accountId,
    });
    return { success: true };
});

// ─── 4. DISCONNECT META ─────────────────────────────────────────────────
export const metaDisconnect = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;

    // Delete connection
    await admin.firestore().collection("metaConnections").doc(uid).delete();

    // Delete all performance data
    const perfDocs = await admin.firestore().collection("adPerformance").where("userId", "==", uid).get();
    const batch = admin.firestore().batch();
    perfDocs.docs.forEach(doc => batch.delete(doc.ref));
    if (perfDocs.size > 0) await batch.commit();

    console.log(`🔌 Meta disconnected for user ${uid}`);
    return { success: true };
});

// ─── 5. SYNC AD PERFORMANCE (Manual trigger) ────────────────────────────
export const metaSyncPerformance = onCall({
    region: "europe-west1",
    secrets: [metaAppSecret],
    timeoutSeconds: 120,
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const workspaceId = request.data?.workspaceId || null;

    const connDoc = await admin.firestore().collection("metaConnections").doc(uid).get();
    if (!connDoc.exists) throw new HttpsError("not-found", "No Meta connection found.");

    const conn = connDoc.data()!;
    // Determine which accounts to sync — all active accounts, not just selected
    const activeAccounts: { id: string; name: string }[] = (conn.adAccounts || [])
        .filter((a: any) => a.status === 1 || a.account_status === 1);
    if (activeAccounts.length === 0 && conn.selectedAccountId) {
        // Fallback: if adAccounts list is missing, use selectedAccountId
        activeAccounts.push({ id: conn.selectedAccountId, name: "Selected Account" });
    }
    if (activeAccounts.length === 0) throw new HttpsError("failed-precondition", "No active ad accounts found.");

    try {
        const token = decryptToken(conn.encryptedToken, metaAppSecret.value());
        let totalSyncCount = 0;

        for (const account of activeAccounts) {
            const accountId = account.id;

        // Pull last 30 days of ad insights
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const until = new Date().toISOString().split("T")[0];

        const insightsResponse = await fetch(
            `https://graph.facebook.com/v22.0/${accountId}/insights?` +
            `fields=campaign_name,adset_name,ad_name,ad_id,impressions,clicks,spend,` +
            `ctr,cpc,cpm,actions,cost_per_action_type,purchase_roas&` +
            `time_range={"since":"${since}","until":"${until}"}&` +
            `level=ad&limit=100&` +
            `access_token=${token}`
        );
        const insightsData = await insightsResponse.json() as any;

        if (insightsData.error) {
            console.error(`Meta insights error for account ${accountId}:`, insightsData.error);
            // Continue to next account instead of failing entirely
            continue;
        }

        const ads = insightsData.data || [];
        const batch = admin.firestore().batch();
        let syncCount = 0;

        for (const ad of ads) {
            // Extract purchase/lead actions
            const actions = ad.actions || [];
            const purchases = actions.find((a: any) => a.action_type === "purchase")?.value || 0;
            const leads = actions.find((a: any) => a.action_type === "lead")?.value || 0;

            // Extract CPA
            const costPerAction = ad.cost_per_action_type || [];
            const cpaPurchase = costPerAction.find((c: any) => c.action_type === "purchase")?.value || null;
            const cpaLead = costPerAction.find((c: any) => c.action_type === "lead")?.value || null;

            // Extract ROAS
            const roasData = ad.purchase_roas || [];
            const roas = roasData.length > 0 ? parseFloat(roasData[0].value) : null;

            const metricsSnapshot = {
                impressions: parseInt(ad.impressions || "0"),
                clicks: parseInt(ad.clicks || "0"),
                spend: parseFloat(ad.spend || "0"),
                ctr: parseFloat(ad.ctr || "0"),
                cpc: parseFloat(ad.cpc || "0"),
                cpm: parseFloat(ad.cpm || "0"),
                purchases: parseInt(purchases),
                leads: parseInt(leads),
                cpa: cpaPurchase ? parseFloat(cpaPurchase) : (cpaLead ? parseFloat(cpaLead) : null),
                roas,
            };

            const perfDoc = {
                userId: uid,
                adAccountId: accountId,
                workspaceId,
                adId: ad.ad_id,
                adName: ad.ad_name || "Unknown",
                adsetName: ad.adset_name || "Unknown",
                campaignName: ad.campaign_name || "Unknown",
                ...metricsSnapshot,
                dateRange: { since, until },
                syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            // Store latest performance (for dashboard display)
            const docId = `${uid}_${ad.ad_id}`;
            batch.set(admin.firestore().collection("adPerformance").doc(docId), perfDoc, { merge: true });

            // Store time-aware snapshot (for historical analysis — never overwrites)
            const snapshotId = `${uid}_${ad.ad_id}_${since}_${until}`;
            batch.set(admin.firestore().collection("adPerformanceHistory").doc(snapshotId), {
                ...perfDoc,
                snapshotDate: new Date().toISOString().split("T")[0],
            });

            // Link to deployment records — prefer strong identifiers, scoped by adAccountId
            try {
                let deployDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

                // 1. Try metaAdId first (strongest — direct Meta identity)
                if (ad.ad_id) {
                    const byAdId = await admin.firestore().collection("creativeDeployments")
                        .where("userId", "==", uid)
                        .where("adAccountId", "==", accountId)
                        .where("metaAdId", "==", ad.ad_id)
                        .limit(1)
                        .get();
                    if (!byAdId.empty) deployDoc = byAdId.docs[0];
                }

                // 2. Try imageHash if available on the ad insights
                if (!deployDoc && (ad as any).image_hash) {
                    const byHash = await admin.firestore().collection("creativeDeployments")
                        .where("userId", "==", uid)
                        .where("adAccountId", "==", accountId)
                        .where("imageHash", "==", (ad as any).image_hash)
                        .limit(1)
                        .get();
                    if (!byHash.empty) deployDoc = byHash.docs[0];
                }

                // 3. Fallback to adName (weakest — may have duplicates), scoped by account
                if (!deployDoc && ad.ad_name) {
                    const byName = await admin.firestore().collection("creativeDeployments")
                        .where("userId", "==", uid)
                        .where("adAccountId", "==", accountId)
                        .where("adName", "==", ad.ad_name)
                        .limit(1)
                        .get();
                    if (!byName.empty) deployDoc = byName.docs[0];
                }

                if (deployDoc) {
                    batch.update(deployDoc.ref, {
                        metaAdId: ad.ad_id,
                        metaAdSetId: ad.adset_name || null,
                        metaCampaignId: ad.campaign_name || null,
                        latestMetrics: metricsSnapshot,
                    });
                }
            } catch { /* Non-blocking deployment linkage */ }

            syncCount++;
        }

        if (syncCount > 0) await batch.commit();
        totalSyncCount += syncCount;

        } // end for-each account

        // Update last sync time
        await admin.firestore().collection("metaConnections").doc(uid).update({
            lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`📊 Synced ${totalSyncCount} ads across ${activeAccounts.length} accounts for user ${uid}`);
        return { success: true, adsSynced: totalSyncCount };

    } catch (err: any) {
        if (err instanceof HttpsError) throw err;
        console.error("Sync error:", err);
        throw new HttpsError("internal", "Failed to sync ad performance.");
    }
});

// ─── 5b. PUSH CREATIVE TO META AD ACCOUNT ─────────────────────────────
export const metaPushCreative = onCall({
    region: "europe-west1",
    secrets: [metaAppSecret],
    timeoutSeconds: 60,
    cors: true,
    memory: "512MiB",
    maxInstances: 10,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const { imageBase64, adName } = request.data;

    if (!imageBase64) throw new HttpsError("invalid-argument", "Missing image data.");

    // Get user's Meta connection
    const connDoc = await admin.firestore().collection("metaConnections").doc(uid).get();
    if (!connDoc.exists) throw new HttpsError("not-found", "No Meta connection found. Please reconnect.");

    const conn = connDoc.data()!;
    if (!conn.selectedAccountId) throw new HttpsError("failed-precondition", "No ad account selected.");

    try {
        const token = decryptToken(conn.encryptedToken, metaAppSecret.value());
        const accountId = conn.selectedAccountId;

        // Extract raw base64 data (strip data URL prefix if present)
        let rawBase64 = imageBase64;
        if (rawBase64.includes(',')) {
            rawBase64 = rawBase64.split(',')[1];
        }

        // Upload image to Meta's Ad Account image library using bytes parameter
        const fileName = `${(adName || 'proadsai_creative').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;

        const uploadResponse = await fetch(
            `https://graph.facebook.com/v22.0/${accountId}/adimages`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bytes: rawBase64,
                    name: fileName,
                    access_token: token,
                }),
            }
        );

        const uploadData = await uploadResponse.json() as any;

        if (uploadData.error) {
            console.error("Meta image upload error:", uploadData.error);

            // Check for permission errors
            if (uploadData.error.code === 200 || uploadData.error.code === 190 ||
                uploadData.error.message?.includes('permission') || uploadData.error.message?.includes('scope')) {
                throw new HttpsError("permission-denied",
                    "Missing permissions. Please reconnect Meta with 'ads_management' scope. Go to Settings > Meta Connection > Disconnect, then reconnect.");
            }
            throw new HttpsError("internal", `Meta API error: ${uploadData.error.message}`);
        }

        // Extract the image hash from response
        const images = uploadData.images || {};
        const imageHash = Object.values(images as Record<string, any>)[0]?.hash;

        if (!imageHash) {
            console.error("No image hash in response:", JSON.stringify(uploadData).substring(0, 500));
            throw new HttpsError("internal", "Image uploaded but no hash returned. Response: " + JSON.stringify(uploadData).substring(0, 200));
        }

        console.log(`📸 Creative pushed to Meta for user ${uid}: hash=${imageHash}`);

        // ═══ STORE DURABLE DEPLOYMENT RECORD ═══
        // One record per push event — supports one-to-many attribution
        // (same design pushed to different campaigns/ad sets)
        const deploymentId = `${uid}_${Date.now()}_${imageHash.substring(0, 8)}`;
        const { adName: pushAdName, designId, projectId, hookMetadata, conceptMetadata, copySnapshot, language, mode, ratio, format, selectedModes, contractTemplateId, numericFidelity, offerFactsHash, workspaceId } = request.data;
        try {
            await admin.firestore().collection("creativeDeployments").doc(deploymentId).set({
                deploymentId,
                userId: uid,
                adAccountId: accountId,
                workspaceId: workspaceId || null,
                imageHash,
                adName: pushAdName || adName || '',
                // Internal design identity
                designId: designId || null,
                projectId: projectId || null,
                // Creative metadata for attribution grouping
                hookMetadata: hookMetadata || null,     // { angle, type, text }
                conceptMetadata: conceptMetadata || null, // { text, index }
                copySnapshot: copySnapshot || null,     // { headline, subhead, cta, benefit }
                language: language || null,
                mode: mode || null,                     // single/batch/carousel
                ratio: ratio || null,
                format: format || null,
                // ─── Creative identity chain (from generation state) ───
                selectedModes: selectedModes || null,
                contractTemplateId: contractTemplateId || null,
                numericFidelity: numericFidelity || null,
                offerFactsHash: offerFactsHash || null,
                // Meta identifiers (populated later when ad is created in Meta)
                metaAdId: null,
                metaCreativeId: null,
                metaAdSetId: null,
                metaCampaignId: null,
                // Timestamps
                pushedAt: admin.firestore.FieldValue.serverTimestamp(),
                // Performance snapshots (populated by sync)
                latestMetrics: null,
                metricsHistory: [],
            });
        } catch (deployErr) {
            // Non-blocking — deployment record is for analytics, don't fail the push
            console.warn("Failed to store deployment record:", deployErr);
        }

        return {
            success: true,
            message: `Creative uploaded to Meta Ads library!`,
            imageHash,
            deploymentId,
        };

    } catch (err: any) {
        if (err instanceof HttpsError) throw err;
        console.error("Push creative error:", err);
        throw new HttpsError("internal", `Failed to push creative: ${err.message || 'Unknown error'}`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVER-SIDE AI GENERATION — Full prompt logic on server
// ═══════════════════════════════════════════════════════════════════════════
// The frontend sends ONLY structured data (product name, audience, etc.).
// ALL prompt construction happens server-side. No prompts visible in browser.
// Uses @google/genai (new SDK) for full image generation support.

import * as generators from "./generators.js";

// FR-108 / data-model.md: refund only for these hard-failure classes (the generation
// genuinely produced nothing usable). These are exactly the non-model_error values
// classifyError can emit besides model_error; "safety_blocked"/"timeout" were dead
// entries the classifier never returns (safety maps to model_error).
const HARD_FAILURE_CLASSES = ["model_error", "validation_reject", "slot_repair_failed"] as const;

async function populateSourceColdAdBrandColors(uid: string, inputs: any): Promise<void> {
    if (inputs?.campaignType !== "retargeting") return;
    if ((inputs as any)._sourceColdAdBrandColors) return;
    try {
        const snap = await admin.firestore().collection("generations")
            .where("userId", "==", uid)
            .where("input.campaignType", "==", "cold")
            .orderBy("timestamp", "desc")
            .limit(1)
            .get();
        if (!snap.empty) {
            const doc = snap.docs[0].data();
            const input = doc.input || {};
            if (input.brandColorPrimary || input.brandColorSecondary) {
                (inputs as any)._sourceColdAdBrandColors = {
                    brandColorPrimary: input.brandColorPrimary || undefined,
                    brandColorSecondary: input.brandColorSecondary || undefined,
                };
            }
        }
    } catch {
        void 0;
    }
}

async function recordGenerationFailure(params: {
    uid: string;
    error: any;
    callableName: string;
    inputs?: any;
    failureClass?: string;
    creditAction?: string;
    creditCost?: number;
    targetUid?: string;
}): Promise<{ failureClass: string; costEstimate: { modelTier: string | null; retryCount: number; estimatedTokens: number } }> {
    const fc = params.failureClass || generators.classifyError(params.error);
    const costEstimate = generators.getCostEstimate();
    const failureRecord: Record<string, any> = {
        uid: params.uid,
        callable: params.callableName,
        failureClass: fc,
        costEstimate,
        errorMessage: params.error?.message || String(params.error).substring(0, 500),
        createdAt: Date.now(),
        status: "failed",
    };
    if (params.inputs) {
        failureRecord.offerCreativeMode = params.inputs.offerCreativeMode || null;
        failureRecord.adMode = params.inputs.adMode || null;
        failureRecord.aspectRatio = params.inputs.currentAspectRatio || null;
    }
    admin.firestore().collection("generations").add(failureRecord).catch((e: any) =>
        console.warn("⚠️ Failed to write failure record (non-blocking):", e.message)
    );
    return { failureClass: fc, costEstimate };
}

async function refundCreditsDirect(params: {
    uid: string;
    action: string;
    count?: number;
    targetUid?: string;
    creditsWereDeducted: boolean;
}): Promise<void> {
    // T019 fix: only refund when credits were actually deducted IN THIS callable
    // execution. The generation callables below do NOT deduct credits themselves —
    // the client deducts up front via `deductCreditsServer` and refunds on failure
    // via `refundCreditsServer`. Refunding here too would be a second, phantom
    // refund, inflating the user's balance after a failed generation (credits
    // increasing instead of staying flat). Callers that genuinely deducted credits
    // in-execution pass `creditsWereDeducted: true`.
    if (!params.creditsWereDeducted) return;
    const count = params.count || 1;
    const COSTS: Record<string, number> = {
        generateHooks: 1, generateConcepts: 1, generateBuildPlan: 1,
        generateFinalAd: 3, generateCarousel: 2, generateCaption: 1,
        generateCarouselCopies: 1,
    };
    const unitCost = COSTS[params.action] || 1;
    const cost = unitCost * count;
    const targetUid = params.targetUid || params.uid;
    try {
        await admin.firestore().runTransaction(async (tx) => {
            const userRef = admin.firestore().collection("users").doc(targetUid);
            const snap = await tx.get(userRef);
            if (!snap.exists) return;
            const current = snap.data()?.credits ?? 0;
            tx.update(userRef, { credits: current + cost });
        });
        console.log(`💰 Credits refunded: ${cost} for ${params.action} to ${targetUid}`);
    } catch (e: any) {
        console.warn("⚠️ Credit refund failed (non-blocking):", e.message);
    }
}

/**
 * Enforces entitlement for server generation endpoints.
 * Checks feature gates based on the action being performed and input data.
 * Returns the resolved entitlement for further use.
 */
async function enforceGenerationEntitlement(
    callerUid: string,
    inputs?: any,
    options?: {
        requireCarousel?: boolean;
        requireBatch?: boolean;
        batchQuantity?: number;
        requireVisualPolishes?: boolean;
        requireAspectRatio?: string;
    }
): Promise<ResolvedEntitlement> {
    const entitlement = await resolveFirestoreEntitlement(callerUid);

    // ── Retargeting gate ──
    if (inputs?.campaignType === 'retargeting') {
        const check = checkFeature(entitlement, 'retargeting');
        if (!check.allowed) {
            throw new HttpsError("permission-denied", JSON.stringify({
                code: check.code,
                feature: check.feature,
                requiredPlan: check.requiredPlan,
                message: "Retargeting requires Ultimate plan or higher.",
            }));
        }
    }

    // ── Carousel gate ──
    if (options?.requireCarousel) {
        const check = checkFeature(entitlement, 'carousel');
        if (!check.allowed) {
            throw new HttpsError("permission-denied", JSON.stringify({
                code: check.code,
                feature: check.feature,
                requiredPlan: check.requiredPlan,
                message: "Carousel requires Ultimate plan or higher.",
            }));
        }
    }

    // ── Batch generation gate ──
    if (options?.requireBatch) {
        const check = checkFeature(entitlement, 'batchGeneration');
        if (!check.allowed) {
            throw new HttpsError("permission-denied", JSON.stringify({
                code: check.code,
                feature: check.feature,
                requiredPlan: check.requiredPlan,
                message: "Batch generation requires Agency plan.",
            }));
        }
        if (options.batchQuantity) {
            // FR-136: enforce the per-plan batch cap (Pro 4 / Scale 36) via the canonical
            // generators.validateBatchRunEntitlement helper. batchQuantity is the precomputed
            // sizes×hooks×concepts total, so it is passed as the single dimension.
            generators.validateBatchRunEntitlement(entitlement.basePlan, options.batchQuantity, 1, 1);
        }
    }

    // ── Visual polishes gate ──
    if (options?.requireVisualPolishes) {
        const check = checkFeature(entitlement, 'visualPolishes');
        if (!check.allowed) {
            throw new HttpsError("permission-denied", JSON.stringify({
                code: check.code,
                feature: check.feature,
                requiredPlan: check.requiredPlan,
                message: "Visual polishes require Pro plan or higher.",
            }));
        }
    }

    // ── Aspect ratio gate ──
    if (options?.requireAspectRatio) {
        const check = checkAspectRatio(entitlement, options.requireAspectRatio);
        if (!check.allowed) {
            throw new HttpsError("permission-denied", JSON.stringify({
                code: check.code,
                feature: check.feature,
                requiredPlan: check.requiredPlan,
                message: `Aspect ratio ${options.requireAspectRatio} requires Starter plan or higher.`,
            }));
        }
    }

    // ── Reference ad upload gate ──
    if (inputs?.styleReference || inputs?.referenceAd) {
        const check = checkFeature(entitlement, 'referenceAdUpload');
        if (!check.allowed) {
            throw new HttpsError("permission-denied", JSON.stringify({
                code: check.code,
                feature: check.feature,
                requiredPlan: check.requiredPlan,
                message: "Reference ad upload requires Pro plan or higher.",
            }));
        }
    }

    // ── Selector-level gates (hook angle, tone, strategy, offer mode, objection) ──
    if (inputs) {
        const selectorChecks: [string, string | undefined | null][] = [
            ['hookAngle', inputs.coldHookAngle],
            ['hookStyle', inputs.hookType],
            ['adTone', inputs.adTone],
            ['copyStrategy', inputs.copywritingStrategy],
            ['objection', inputs.retargetingObjection],
        ];
        // Check offer modes (array)
        const offerModes: string[] = inputs.offerCreativeMode || [];
        for (const mode of offerModes) {
            selectorChecks.push(['offerMode', mode]);
        }

        for (const [type, value] of selectorChecks) {
            const error = validateSelector(entitlement, type as any, value);
            if (error) {
                throw new HttpsError("permission-denied", JSON.stringify({
                    code: "feature_not_allowed",
                    feature: `${type}:${value}`,
                    message: error,
                }));
            }
        }
    }

    return entitlement;
}

// Helper: Creates a Gemini caller function bound to the API key
function createGeminiCaller(apiKey: string) {
    return async (params: { model: string; contents: any; config?: any }) => {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        // Strip the OpenAI-only _isPersonalPhoto marker (set on Box A parts in generators)
        // so it never reaches the Gemini API — keeps the MODEL_PROVIDER='gemini' revert safe.
        type ContentPart = { _isPersonalPhoto?: boolean } & Record<string, unknown>;
        const contents = Array.isArray(params.contents?.parts)
            ? { ...params.contents, parts: params.contents.parts.map(({ _isPersonalPhoto, ...rest }: ContentPart) => rest) }
            : params.contents;
        const response = await ai.models.generateContent({
            model: params.model,
            contents,
            config: params.config,
        });
        // Normalize response to match what generators expect
        let text: string | undefined;
        try { text = response.text || undefined; } catch { text = undefined; }
        return {
            text,
            candidates: (response.candidates || []).map((c: any) => ({
                content: {
                    parts: (c.content?.parts || []).map((p: any) => {
                        if (p.text) return { text: p.text };
                        if (p.inlineData) {
                            let rawData = p.inlineData.data;
                            // Normalize: @google/genai SDK may return Buffer/Uint8Array instead of base64 string
                            if (rawData && typeof rawData !== 'string') {
                                rawData = Buffer.from(rawData).toString('base64');
                            }
                            return { inlineData: { mimeType: p.inlineData.mimeType, data: rawData } };
                        }
                        return p;
                    })
                }
            }))
        };
    };
}

// Helper: Creates a model-aware routing caller that sends VISUAL_MODEL calls to
// OpenAI (when MODEL_PROVIDER==='openai') and everything else to Gemini.
function createVisualRoutingCaller(geminiKey: string, openaiKey: string) {
    const gemini = createGeminiCaller(geminiKey);
    const openai = createOpenAIImageCaller(openaiKey);
    return async (params: { model: string; contents: any; config?: any }) => {
        if (MODEL_PROVIDER === "openai" && params.model === VISUAL_MODEL) {
            return openai(params);
        }
        return gemini(params);
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN SUMMARIES — Aggregation Jobs
// ═══════════════════════════════════════════════════════════════════════════

import { runIncrementalRollup, runFullReconciliation, type JobStatus } from "./patternSummaries.js";

/** Manual/admin: incremental rollup for last N hours. Returns full JobStatus. */
export const patternSummariesIncremental = onCall({
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const hoursBack = (request.data as any)?.hoursBack || 24;
    try {
        const status = await runIncrementalRollup(hoursBack);
        return status;
    } catch (err: any) {
        console.error("Pattern summaries incremental error:", err);
        throw new HttpsError("internal", `Incremental rollup failed: ${err.message || 'Unknown error'}`);
    }
});

/** Manual/admin: full reconciliation from scratch. Returns full JobStatus. */
export const patternSummariesReconcile = onCall({
    region: "europe-west1",
    timeoutSeconds: 300,
    memory: "1GiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    try {
        const status = await runFullReconciliation();
        return status;
    } catch (err: any) {
        console.error("Pattern summaries reconciliation error:", err);
        throw new HttpsError("internal", `Full reconciliation failed: ${err.message || 'Unknown error'}`);
    }
});

/** Scheduled: incremental rollup every 6 hours. Job status persisted automatically. */
export const scheduledPatternRollup = onSchedule({
    schedule: '0 */6 * * *',
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
}, async () => {
    const status = await runIncrementalRollup(7);
    console.log(`📊 Scheduled rollup: success=${status.success} written=${status.summariesWritten} caps=[${status.capsHit.join(',')}] dropped=${JSON.stringify(status.droppedRecords)}`);
});

/** Scheduled: full reconciliation nightly at 3 AM. Job status persisted automatically. */
export const scheduledPatternReconcile = onSchedule({
    schedule: '0 3 * * *',
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '1GiB',
}, async () => {
    const status = await runFullReconciliation();
    console.log(`📊 Nightly reconcile: success=${status.success} written=${status.summariesWritten} caps=[${status.capsHit.join(',')}]`);

    // ═══ WINNING PRINCIPLES VAULT: Nightly consolidation ═══
    try {
        const { consolidateVault } = await import("./principleVault.js");
        const vaultSnap = await admin.firestore().collectionGroup('principles')
            .where('active', '==', true)
            .select('userId')
            .limit(500)
            .get();
        const uniqueUserIds = [...new Set(vaultSnap.docs.map(d => d.ref.parent.parent?.id).filter(Boolean))] as string[];
        let consolidated = 0;
        for (const uid of uniqueUserIds) {
            try {
                await consolidateVault(uid);
                consolidated++;
            } catch { /* skip individual user failures */ }
        }
        console.log(`🏦 Vault consolidation: ${consolidated}/${uniqueUserIds.length} users processed`);
    } catch (vaultErr) {
        console.warn('⚠️ Vault nightly consolidation failed (non-blocking):', vaultErr);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// RANKING ENGINE — Ticket 2
// ═══════════════════════════════════════════════════════════════════════════

import { getRankings, getVerdictForCandidate, type RankingInput } from "./rankingEngine.js";

/** Get full ranking recommendations for a generation context. */
export const serverGetRankings = onCall({
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const input = request.data as RankingInput;
    if (!input?.userId) throw new HttpsError("invalid-argument", "userId is required.");
    // Ensure userId matches auth
    input.userId = request.auth.uid;
    try {
        return await getRankings(input);
    } catch (err: any) {
        console.error("Ranking engine error:", err);
        throw new HttpsError("internal", `Ranking failed: ${err.message || 'Unknown error'}`);
    }
});

/** Quick verdict for a single candidate. */
export const serverGetVerdict = onCall({
    region: "europe-west1",
    timeoutSeconds: 15,
    memory: "256MiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { family, key, niche, context } = request.data as any;
    if (!family || !key) throw new HttpsError("invalid-argument", "family and key are required.");
    try {
        const result = await getVerdictForCandidate(request.auth.uid, family, key, niche, context || undefined);
        return result || { verdict: 'neutral', reason: 'No data available' };
    } catch (err: any) {
        console.error("Verdict lookup error:", err);
        throw new HttpsError("internal", `Verdict lookup failed: ${err.message || 'Unknown error'}`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION TRACKING — Ticket 5
// ═══════════════════════════════════════════════════════════════════════════

import { trackRecommendationEvent, getRecommendationEvents, validateTrackInput, validateReadInput } from "./recommendationTracking.js";

/** Track a recommendation event (shown / accepted / overridden). */
export const serverTrackRecommendationEvent = onCall({
    region: "europe-west1",
    timeoutSeconds: 10,
    memory: "256MiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const input = request.data as any;
    const validation = validateTrackInput(input);
    if (!validation.valid) throw new HttpsError("invalid-argument", validation.error || "Invalid input.");
    try {
        const result = await trackRecommendationEvent(request.auth.uid, input);
        return { success: true, ...result };
    } catch (err: any) {
        console.error("Track recommendation event error:", err);
        throw new HttpsError("internal", `Tracking failed: ${err.message || 'Unknown error'}`);
    }
});

/** Read recommendation events for audit/debug. */
export const serverGetRecommendationEvents = onCall({
    region: "europe-west1",
    timeoutSeconds: 15,
    memory: "256MiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const readValidation = validateReadInput(request.data);
    if (!readValidation.valid) throw new HttpsError("invalid-argument", readValidation.error || "Invalid read input.");
    try {
        const events = await getRecommendationEvents(request.auth.uid, readValidation.parsed);
        return { success: true, events, count: events.length };
    } catch (err: any) {
        console.error("Get recommendation events error:", err);
        throw new HttpsError("internal", `Read failed: ${err.message || 'Unknown error'}`);
    }
});

// ─── GENERATE TOV / HOOKS ────────────────────────────────────────────────
// ─── MODE-FORMAT-CAMPAIGN VALIDATION (FR-003) ─────────────────────────────
// Single source-of-truth gate: must run BEFORE entitlement checks / credit deduction.
// Carousel-only callables pass `overrideFormat: "carousel"` so a spoofed
// inputs.adMode cannot bypass carousel-only restrictions on a carousel endpoint.
async function enforceModeFormatGate(
    inputs: { offerCreativeMode?: string[]; adMode?: string; campaignType?: string },
    options?: { overrideFormat?: "single" | "carousel" | "batch" },
): Promise<void> {
    const { validateModeFormatCombination } = await import("./creativeResolver.js");
    const fmtCheck = validateModeFormatCombination({
        modes: inputs?.offerCreativeMode || ["standard_hero"],
        adFormat: options?.overrideFormat ?? (inputs?.adMode as "single" | "carousel" | "batch" | undefined) ?? "single",
        campaignType: (inputs?.campaignType as "cold" | "retargeting" | undefined) ?? "cold",
    });
    if (!fmtCheck.valid) {
        console.error(`🛑 Mode-format validation failed: ${fmtCheck.reason}`);
        throw new HttpsError("invalid-argument", fmtCheck.reason, { code: "invalid_mode_format" });
    }
}

export const serverGenerateTOV = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex, editIntent, rewriteScope, semanticLock, activeWorkspaceId } = request.data;
    void activeWorkspaceId;
    await enforceModeFormatGate(inputs);
    // ═══ ENTITLEMENT: Check retargeting gate on hook generation ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs);
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateTOV(inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex, editIntent, rewriteScope, semanticLock);
        const rg = result.rankingGuidance;
        return { success: true, text: result.text, rankingRequestId: rg?.rankingRequestId || null, rankingRequestFingerprint: rg?.rankingRequestFingerprint || null, rankingAppliedSummary: rg?.rankingAppliedSummary || null, costEstimate: generators.getCostEstimate() };
    } catch (error: any) {
        console.error("generateTOV error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateTOV", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateHooks", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Hook generation failed: " + error.message);
    }
});

// ─── GENERATE CONCEPTS ───────────────────────────────────────────────────
export const serverGenerateConcepts = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { approvedTov, inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex, activeWorkspaceId } = request.data;
    void activeWorkspaceId;
    await enforceModeFormatGate(inputs);
    // ═══ ENTITLEMENT: Check retargeting gate on concept generation ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs);
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateConcepts(approvedTov, inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex);
        // ── Cultural compliance: scan the concept/blueprint text returned to the client.
        // The prompt and final-copy pipelines are already scanned in generators.ts, but
        // the raw concept text shown in the client's concept cards was not — so haram
        // motifs (wine, alcohol, inappropriate references) could surface there. Arabic-only,
        // mirrors the scanAndReplace usage in generators.ts.
        let conceptText = result.text;
        if (isArabic(inputs?.adLanguage) && typeof conceptText === "string" && conceptText) {
            const { cleaned, matched } = scanAndReplace(conceptText, "adCopy");
            if (matched.length > 0) {
                conceptText = cleaned;
                console.log(`🕌 Cultural compliance scan (serverGenerateConcepts): replaced [${matched.join(", ")}]`);
            }
        }
        const rg = result.rankingGuidance;
        return { success: true, text: conceptText, rankingRequestId: rg?.rankingRequestId || null, rankingRequestFingerprint: rg?.rankingRequestFingerprint || null, rankingAppliedSummary: rg?.rankingAppliedSummary || null, costEstimate: generators.getCostEstimate() };
    } catch (error: any) {
        console.error("generateConcepts error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateConcepts", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateConcepts", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Concept generation failed: " + error.message);
    }
});

// ─── GENERATE BUILD PLAN ─────────────────────────────────────────────────
export const serverGenerateBuildPlan = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "1GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { conceptRaw, selectedTov, inputs, resolvedUniverse, currentAspectRatio, textOverride, activeWorkspaceId } = request.data;
    void activeWorkspaceId;
    await enforceModeFormatGate(inputs);
    // ═══ ENTITLEMENT ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs);
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateBuildPlan(conceptRaw, selectedTov, inputs, resolvedUniverse, currentAspectRatio, textOverride);
        const response: Record<string, any> = { success: true, text: result.buildPlan || result, errorCode: null, costEstimate: generators.getCostEstimate() };
        if (result.copyFidelityWarning && !result.copyFidelityWarning.passed) {
            response.warningCode = "copy_fidelity_degraded";
            response.failedFields = result.copyFidelityWarning.failedFields;
        }
        if (result.culturalViolation) {
            admin.firestore().collection("generations").add({
                userId: request.auth.uid,
                timestamp: Date.now(),
                output: { phase: "build_plan" },
                culturalViolation: result.culturalViolation,
            }).catch(() => {});
        }
        return response;
    } catch (error: any) {
        console.error("generateBuildPlan error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateBuildPlan", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateBuildPlan", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Build plan generation failed: " + error.message);
    }
});

// ─── GENERATE FINAL AD (IMAGE) ───
export const serverGenerateFinalAd = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey, openaiApiKey],
    timeoutSeconds: 300,
    memory: "2GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { buildPlan, approvedTov, inputs, resolvedUniverse, currentAspectRatio, editInstruction, base64ToEdit, styleReference, textOverride, activeWorkspaceId, _batchTotal } = request.data;
    void activeWorkspaceId;
    // ═══ MODE-FORMAT GATE (before any credit spend) ═══
    // Always run — even on edit/regen paths. An edit request that arrives with
    // an unlaunched mode/format combo is itself invalid and should be rejected
    // before any credit deduction. The legacy bypass that skipped on edits
    // allowed spoofed-input replays to render with invalid combos.
    await enforceModeFormatGate(inputs);
    // ═══ ENTITLEMENT: Check retargeting + aspect ratio gates ═══
    const entitlement = await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireAspectRatio: currentAspectRatio,
        requireBatch: _batchTotal != null,
        batchQuantity: _batchTotal ?? undefined,
    });
    generators.setGeminiCaller(createVisualRoutingCaller(geminiApiKey.value(), openaiApiKey.value()));
    generators.setOpenAIKey(openaiApiKey.value());
    generators.setTestimonialGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    await populateSourceColdAdBrandColors(request.auth.uid, inputs);

    // ═══ CREATIVE MODE VALIDATION: fail-closed for invalid combinations ═══
    if (!editInstruction && !base64ToEdit) {
        const { validateCombination } = await import("./creativeResolver.js");
        const comboCheck = validateCombination(inputs?.offerCreativeMode || ['standard_hero'], inputs?.coldHookAngle);
        if (!comboCheck.valid) {
            console.error(`🛑 Backend combo validation failed: ${comboCheck.errors.join('; ')}`);
            throw new HttpsError("invalid-argument", `Invalid creative mode combination: ${comboCheck.errors.join('; ')}`);
        }
    }

    try {
        const result = await generators.generateFinalAd(buildPlan, approvedTov, inputs, resolvedUniverse, currentAspectRatio, editInstruction, base64ToEdit, styleReference, textOverride);

        // ═══ CREATIVE MEMORY: Store creative metadata (fire-and-forget) ═══
        // Only store primary renders, not edits/reflows. Requires creativeMemory feature.
        if (result && !editInstruction && !base64ToEdit && entitlement.features.creativeMemory) {
            const { storeCreativeToMemory } = await import("./creativeMemory.js");
            const { resolveCreativeSpec } = await import("./creativeResolver.js");
            const { selectLayoutTemplate } = await import("./layoutTemplates.js");
            const { parseBuildPlanEnvelope: parseBP, stripTechnicalPrompt: stripTP } = await import("./buildPlanSlotMap.js");
            const spec = resolveCreativeSpec({
                selectedModes: inputs?.offerCreativeMode || ['standard_hero'],
                hookAngle: inputs?.coldHookAngle || undefined,
                campaignType: inputs?.campaignType,
                visualStyleFamily: inputs?.visualStyleFamily || inputs?.universeMode || 'realistic',
                referenceAdUsed: !!inputs?.referenceAd,
                selectedSubStyle: inputs?.visualSubStyle || null,
                selectedUniverse: inputs?.preferredUniverse || inputs?.resolvedUniverse || null,
            });
            const templateId = selectLayoutTemplate(spec.primaryMode, spec.secondaryMode, inputs?.coldHookAngle, currentAspectRatio);
            // Extract TECHNICAL_PROMPT for resolvedImagePrompt, strip it for blueprintText
            const parsedForMemory = buildPlan ? parseBP(buildPlan) : null;
            const strippedBlueprintForMemory = buildPlan ? stripTP(buildPlan) : null;
            storeCreativeToMemory(request.auth!.uid, {
                layoutTemplate: templateId,
                creativeModes: inputs?.offerCreativeMode || ['standard_hero'],
                hookAngle: inputs?.coldHookAngle || null,
                hookType: inputs?.hookType || null,
                copyStrategy: inputs?.copywritingStrategy || null,
                adTone: inputs?.adTone || null,
                aspectRatio: currentAspectRatio || '1:1',
                adMode: inputs?.adMode || 'single',
                language: inputs?.adLanguage || 'ar_fusha',
                hookText: approvedTov?.substring(0, 200) || '',
                subheadText: '',
                caption: '',
                niche: inputs?.productCategory || '',
                brandName: inputs?.productName || '',
                targetAudience: inputs?.targetAudience || '',
                blueprintText: strippedBlueprintForMemory?.substring(0, 2000) || null,
                resolvedImagePrompt: parsedForMemory?.technicalPrompt?.substring(0, 5000) || null,
            }).catch((err: any) => console.warn('Memory store failed (non-blocking):', err));
        }

        if (result.image) {
            const trace = generators.getLastResolutionTrace();
            // Persist the render to Storage SERVER-SIDE (admin SDK bypasses Storage
            // rules) and hand the frontend a ready-to-use public URL. The browser
            // stores this URL — not the ~1-5 MB base64 — in the generations doc, and
            // the reflow backend downloads it as the outpaint source. Non-blocking:
            // a Storage failure must not fail generation, so we still return the
            // base64 for instant display and let imageUrl fall back to pending_upload.
            let storageUrl: string | null = null;
            try {
                const { saveBase64ToStorage } = await import("./storageUpload.js");
                storageUrl = await saveBase64ToStorage(result.image, `users/${request.auth.uid}/renders`);
            } catch (uploadErr) {
                console.warn("serverGenerateFinalAd: server-side render upload failed (non-blocking):", uploadErr);
            }
            return { success: true, imageBase64: result.image, storageUrl, errorCode: null, costEstimate: generators.getCostEstimate(), resolutionTrace: trace };
        } else {
            return {
                success: false,
                imageBase64: null,
                errorCode: (result as any).errorCode || "generation_failed",
                debug: process.env.NODE_ENV !== 'production' ? ((result as any).debug || null) : undefined,
            };
        }
    } catch (error: any) {
        console.error("generateFinalAd error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateFinalAd", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateFinalAd", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Image generation failed: " + error.message);
    }
});

// ─── DETERMINISTIC ASPECT RATIO REFLOW (HOTFIX-F) ──────────────────────
export const reflowImage = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey, openaiApiKey],
    timeoutSeconds: 300,
    memory: "2GiB",
    cors: true,
}, async (request: CallableRequest) => {
    return reflowImageHandler(request, { db: admin.firestore(), admin, geminiCaller: createVisualRoutingCaller(geminiApiKey.value(), openaiApiKey.value()), openaiApiKey: openaiApiKey.value() });
});

// ─── MAGIC SELECTOR: Region-targeted image editing ──────────────────────
export const serverEditRegion = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey, openaiApiKey],
    timeoutSeconds: 300,
    memory: "2GiB",
    cors: true,
    maxInstances: 20,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { imageBase64, region, editMode, editPayload, ratio, personalPhotos } = request.data;

    if (!imageBase64 || !region || !editMode) {
        throw new HttpsError("invalid-argument", "Missing imageBase64, region, or editMode.");
    }

    // FIX C (ISSUE 2 — face lock in the edit path): the original hero photos (Box A) are
    // passed as independent ground-truth face anchors so an edit near the face cannot let the
    // identity drift. Only real inline/HTTP images count (same guard as generators.ts).
    const isRealImage = (v: any): v is string =>
        typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('http'));
    const faceRefs: string[] = Array.isArray(personalPhotos)
        ? personalPhotos.filter(isRealImage).slice(0, 5)
        : [];

    const { xPct, yPct, wPct, hPct } = region;
    const x2 = xPct + wPct;
    const y2 = yPct + hPct;

    let instruction = '';
    if (editMode === 'text' && editPayload?.action === 'replace' && editPayload?.newText) {
        instruction = `SURGICAL TEXT EDIT — REGION (${xPct.toFixed(0)}%, ${yPct.toFixed(0)}%) to (${x2.toFixed(0)}%, ${y2.toFixed(0)}%):
Replace the text in this region with: "${editPayload.newText}"
Rules:
- Keep the EXACT SAME font style, size, weight, and color
- Keep the EXACT SAME background/panel behind the text
- If new text is shorter, CENTER it in the same space
- Arabic text must be clean RTL with proper letter connections
- Everything outside this region must be PIXEL-IDENTICAL`;
    } else if (editMode === 'text' && editPayload?.action === 'remove') {
        instruction = `SURGICAL TEXT REMOVAL — REGION (${xPct.toFixed(0)}%, ${yPct.toFixed(0)}%) to (${x2.toFixed(0)}%, ${y2.toFixed(0)}%):
Remove the text element in this region completely.
Rules:
- If other text elements exist nearby, RE-FLOW them to fill the gap naturally
- If a panel/background existed behind the text, either remove it or re-purpose it
- The result should look like the text was never there — no blank holes
- Everything outside the affected zone must be PIXEL-IDENTICAL`;
    } else if (editMode === 'erase') {
        instruction = `SURGICAL OBJECT REMOVAL — REGION (${xPct.toFixed(0)}%, ${yPct.toFixed(0)}%) to (${x2.toFixed(0)}%, ${y2.toFixed(0)}%):
Remove the object/element inside this region.
Rules:
- INPAINT the area with surrounding context (continue the background pattern/color/texture)
- Do NOT leave blank space, white patches, or visible seams
- Everything outside this region must be PIXEL-IDENTICAL`;
    } else if (editMode === 'style') {
        const styleDesc = editPayload?.styleAction === 'change_color' && editPayload?.colorHex
            ? `Change the dominant color of the element to ${editPayload.colorHex}`
            : editPayload?.styleAction === 'brighten' ? 'Brighten this area — increase exposure and lightness'
            : editPayload?.styleAction === 'darken' ? 'Darken this area — decrease exposure, add shadow depth'
            : editPayload?.styleAction === 'blur_bg' ? 'Apply a gaussian blur to this background area to create depth separation'
            : editPayload?.styleAction === 'make_bigger' ? 'Scale this element UP by ~30% while keeping it centered in its zone'
            : editPayload?.styleAction === 'make_smaller' ? 'Scale this element DOWN by ~30% while keeping it centered'
            : editPayload?.styleAction || 'Enhance this region';
        instruction = `SURGICAL STYLE EDIT — REGION (${xPct.toFixed(0)}%, ${yPct.toFixed(0)}%) to (${x2.toFixed(0)}%, ${y2.toFixed(0)}%):
Apply this change: ${styleDesc}
Rules:
- Affect ONLY the element inside this region
- Keep the same structural composition
- Everything outside this region must be PIXEL-IDENTICAL`;
    } else if (editMode === 'describe' && editPayload?.freeInstruction) {
        instruction = `FREE-FORM EDIT — REGION (${xPct.toFixed(0)}%, ${yPct.toFixed(0)}%) to (${x2.toFixed(0)}%, ${y2.toFixed(0)}%):
User instruction: "${editPayload.freeInstruction}"
Rules:
- Apply the user's instruction to the element(s) inside this region
- Interpret the instruction intelligently — if they say "make it gold", change the color to gold
- If they say "remove" or "delete", inpaint with surrounding context
- If they say "change text to X", replace the text keeping the same style
- Everything outside this region must be PIXEL-IDENTICAL`;
    } else {
        throw new HttpsError("invalid-argument", `Invalid editMode: ${editMode}`);
    }

    // Append universal aspect ratio preservation
    instruction += `\n\n⚠️ CRITICAL: The output image MUST have the EXACT SAME aspect ratio and dimensions as the input image. This is a ${ratio || '1:1'} image. Do NOT change it to square or any other ratio.`;

    // FIX C (ISSUE 2): when hero photos are attached, lock the face. The extra reference
    // images follow the base image in the parts array (the base stays first so it remains the
    // image being edited); this block tells the model what they are and forbids face drift.
    if (faceRefs.length > 0) {
        instruction += `\n\n⚠️⚠️ THE HERO'S FACE IS INVIOLABLE: ${faceRefs.length} reference photo(s) of the hero are attached AFTER the image being edited. Any human face in the result MUST keep IDENTICAL facial structure, bone structure, features, skin tone, age, and identity to those reference photos. Do NOT reinterpret, alter, soften, smooth, or reimagine any facial feature. The reference photos are the absolute ground truth for the face. Use them for FACE IDENTITY ONLY — ignore their clothing and background. Everything outside the edited region must remain pixel-identical.`;
    }

    generators.setGeminiCaller(createVisualRoutingCaller(geminiApiKey.value(), openaiApiKey.value()));

    try {
        const rawB64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const getMime = (dataUrl: string): string => {
            const m = dataUrl.match(/^data:(image\/\w+);base64,/);
            return m ? m[1] : 'image/png';
        };
        // Base image first (the image being edited), then any hero face anchors.
        // Preserve the base image's real MIME when it arrived as a data URL.
        const baseMime = imageBase64.startsWith('data:') ? getMime(imageBase64) : 'image/png';
        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
            { inlineData: { mimeType: baseMime, data: rawB64 } },
            { text: instruction },
        ];
        for (const ref of faceRefs) {
            if (ref.startsWith('data:image/')) {
                parts.push({ inlineData: { mimeType: getMime(ref), data: ref.split(',')[1] } });
            } else if (/^https?:\/\//i.test(ref)) {
                // faceRefs allows persisted/Storage http(s) URLs (isRealImage) — fetch + encode
                // them (guarded against SSRF/size) so face locking works for persisted anchors,
                // not just inline data URLs.
                const fetched = await generators.fetchRemoteImageAsBase64(ref, "face anchor");
                if (fetched) parts.push({ inlineData: { mimeType: fetched.mimeType, data: fetched.data } });
            }
        }
        const editCaller = createVisualRoutingCaller(geminiApiKey.value(), openaiApiKey.value());
        const response = await editCaller({
            model: VISUAL_MODEL,
            contents: { parts },
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
                thinkingConfig: { thinkingLevel: 'High' },
                imageConfig: { aspectRatio: (ratio || '1:1') as any },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                ],
            },
        });

        for (const cand of response.candidates || []) {
            if (cand.content?.parts) {
                for (const part of cand.content.parts) {
                    if (part.inlineData) {
                        return {
                            success: true,
                            imageBase64: `data:image/png;base64,${part.inlineData.data}`,
                        };
                    }
                }
            }
        }
        return { success: false, imageBase64: null, errorCode: 'no_image_returned' };
    } catch (error: any) {
        console.error("editRegion error:", error);
        throw new HttpsError("internal", "Region edit failed: " + error.message);
    }
});

// ─── GENERATE CAROUSEL ANGLES ────────────────────────────────────────────
export const serverGenerateCarouselAngles = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { inputs, resolvedUniverse, slideCount, globalRefinement, activeWorkspaceId } = request.data;
    void activeWorkspaceId;
    // Carousel-only callable: pin adFormat to "carousel" so a spoofed inputs.adMode
    // cannot bypass carousel-only restrictions on this endpoint.
    await enforceModeFormatGate(inputs, { overrideFormat: "carousel" });
    // ═══ ENTITLEMENT: Check carousel access + slide count ═══
    const entitlement = await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireCarousel: true,
    });
    const slideCheck = checkCarouselSlides(entitlement, slideCount || 3);
    if (!slideCheck.allowed) {
        throw new HttpsError("permission-denied", JSON.stringify({
            code: slideCheck.code,
            feature: slideCheck.feature,
            requiredPlan: slideCheck.requiredPlan,
            message: `Your plan supports max ${entitlement.features.maxCarouselSlides} slides. Upgrade for more.`,
        }));
    }
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateCarouselAngles(inputs, resolvedUniverse, slideCount, globalRefinement, entitlement.basePlan);
        return { success: true, text: result, costEstimate: generators.getCostEstimate() };
    } catch (error: any) {
        console.error("generateCarouselAngles error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateCarouselAngles", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateCarousel", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Carousel angle generation failed: " + error.message);
    }
});

// ─── GENERATE CAROUSEL SLIDE COPIES ──────────────────────────────────────
export const serverGenerateCarouselSlideCopies = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { approvedTov, inputs, slideCount, resolvedUniverse, refinement, activeWorkspaceId } = request.data;
    void activeWorkspaceId;
    // Carousel-only callable: pin adFormat to "carousel".
    await enforceModeFormatGate(inputs, { overrideFormat: "carousel" });
    // ═══ ENTITLEMENT: Check carousel access ═══
    const entitlement = await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireCarousel: true,
    });
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    generators.setTestimonialGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateCarouselSlideCopies(approvedTov, inputs, slideCount, resolvedUniverse, refinement, entitlement.basePlan);
        return { success: true, copies: result, costEstimate: generators.getCostEstimate() };
    } catch (error: any) {
        console.error("generateCarouselSlideCopies error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateCarouselSlideCopies", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateCarouselCopies", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Carousel copy generation failed: " + error.message);
    }
});

// ─── GENERATE TESTIMONIAL CAROUSEL ──────────────────────────────────────
// Full pipeline: platform detection → mockup rendering → hook → close → assembly
export const serverGenerateTestimonialCarousel = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    memory: "2GiB",
    cors: true,
    maxInstances: 20,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { inputs, screenshots } = request.data;
    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
        throw new HttpsError("invalid-argument", "At least one testimonial screenshot is required.");
    }
    const selectedModes = inputs?.offerCreativeMode || [];
    if (!selectedModes.includes('testimonial_carousel')) {
        throw new HttpsError("invalid-argument", "testimonial_carousel mode must be selected.");
    }
    // Carousel-only callable: pin adFormat to "carousel".
    await enforceModeFormatGate(inputs, { overrideFormat: "carousel" });
    // ═══ ENTITLEMENT: Check carousel access ═══
    const entitlement = await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireCarousel: true,
    });
    const maxSlides = entitlement.features.maxCarouselSlides || 5;
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    generators.setTestimonialGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateTestimonialCarousel(inputs, screenshots, maxSlides);
        return { success: true, ...result, costEstimate: generators.getCostEstimate() };
    } catch (error: any) {
        console.error("generateTestimonialCarousel error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateTestimonialCarousel", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateCarousel", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Testimonial carousel generation failed: " + error.message);
    }
});

// ─── GENERATE CAPTION ────────────────────────────────────────────────────
export const serverGenerateCaption = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { mockupUrl, inputs, visualMetaphor, approvedTov, refinement, carouselContext, buildPlan, activeWorkspaceId } = request.data;
    void activeWorkspaceId;
    await enforceModeFormatGate(inputs);
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateCaption(mockupUrl, inputs, visualMetaphor, approvedTov, refinement, carouselContext, buildPlan);
        const rg = result.rankingGuidance;
        return { success: true, text: result.text, rankingRequestId: rg?.rankingRequestId || null, rankingRequestFingerprint: rg?.rankingRequestFingerprint || null, rankingAppliedSummary: rg?.rankingAppliedSummary || null, costEstimate: generators.getCostEstimate() };
    } catch (error: any) {
        console.error("generateCaption error:", error);
        const { failureClass, costEstimate } = await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateCaption", inputs });
        if ((HARD_FAILURE_CLASSES as readonly string[]).includes(failureClass)) {
            await refundCreditsDirect({ uid: request.auth!.uid, action: "generateCaption", creditsWereDeducted: false });
        }
        throw new HttpsError("internal", "Caption generation failed: " + error.message);
    }
});

// ─── GENERATE VISUAL POLISHES ────────────────────────────────────────────
export const serverGenerateVisualPolishes = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 60,
    memory: "512MiB",
    cors: true,
    maxInstances: 20,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { currentRender, inputs } = request.data;
    await enforceModeFormatGate(inputs);
    // ═══ ENTITLEMENT: Check visual polishes access ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireVisualPolishes: true,
    });
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateVisualPolishes(currentRender, inputs);
        return { success: true, polishes: result, costEstimate: generators.getCostEstimate() };
    } catch (error: any) {
        console.error("generateVisualPolishes error:", error);
        // T018: write a failure record for observability. No refund here — the polish-critique
        // step does not pre-deduct credits (deduction happens later, on polishImage apply).
        await recordGenerationFailure({ uid: request.auth!.uid, error, callableName: "serverGenerateVisualPolishes", inputs });
        throw new HttpsError("internal", "Polish generation failed: " + error.message);
    }
});

// ─── VARIANT EXPLORATION ENGINE ──────────────────────────────────────────
// Generate structured variant sets for A/B testing
export const generateVariants = onCall({
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { hookAngle, hookType, creativeModes, aspectRatio, cta, niche, variantCount, primaryDimension, secondaryDimension } = request.data;

    if (!primaryDimension) throw new HttpsError("invalid-argument", "primaryDimension is required.");

    try {
        const { generateVariantSet, storeVariantSet } = await import("./variantEngine.js");

        const variantSet = await generateVariantSet({
            userId: request.auth.uid,
            hookAngle: hookAngle || 'pain_point',
            hookType: hookType || 'curiosity_gap',
            creativeModes: creativeModes || ['standard_hero'],
            aspectRatio: aspectRatio || '1:1',
            cta: cta || '',
            niche: niche || '',
            variantCount: variantCount || 4,
            primaryDimension,
            secondaryDimension: secondaryDimension || undefined,
        });

        await storeVariantSet(variantSet);

        return { success: true, variantSet };
    } catch (error: any) {
        console.error("Variant generation error:", error);
        throw new HttpsError("internal", "Failed to generate variants: " + error.message);
    }
});

// Evaluate variant set performance and identify winner
export const evaluateVariants = onCall({
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { setId } = request.data;
    if (!setId) throw new HttpsError("invalid-argument", "setId is required.");

    try {
        const { evaluateVariantSet } = await import("./variantEngine.js");
        const result = await evaluateVariantSet(setId);

        if (!result) {
            return { success: true, status: 'insufficient_data', message: 'Not enough performance data yet.' };
        }

        return { success: true, ...result };
    } catch (error: any) {
        console.error("Variant evaluation error:", error);
        throw new HttpsError("internal", "Failed to evaluate variants: " + error.message);
    }
});

// ─── TESTIMONIAL TEXT EXTRACTION (OCR via OpenAI GPT-4o-mini Vision) ─────
// Accepts screenshot images of WhatsApp/Messenger/Telegram/SMS conversations,
// extracts visible text, cleans it, and redacts phone numbers.
// Uses OpenAI for superior Arabic OCR accuracy.
export const extractTestimonialText = onCall({
    region: "europe-west1",
    secrets: [openaiApiKey],
    timeoutSeconds: 60,
    memory: "512MiB",
    cors: true,
    maxInstances: 10,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { screenshots } = request.data;
    if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
        throw new HttpsError("invalid-argument", "At least one screenshot is required.");
    }
    if (screenshots.length > 4) {
        throw new HttpsError("invalid-argument", "Maximum 4 screenshots allowed.");
    }

    try {
        const results: any[] = [];

        for (const screenshot of screenshots) {
            let rawBase64 = screenshot;
            let mimeType = 'image/jpeg';
            if (rawBase64.includes(',')) {
                const prefix = rawBase64.split(',')[0];
                if (prefix.includes('png')) mimeType = 'image/png';
                rawBase64 = rawBase64.split(',')[1];
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey.value()}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You extract testimonial text from chat screenshots. Return ONLY valid JSON. Preserve original language exactly — if Arabic, keep Arabic. Never rephrase or improve the text.'
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: { url: `data:${mimeType};base64,${rawBase64}`, detail: 'high' }
                                },
                                {
                                    type: 'text',
                                    text: `Extract the testimonial text from this chat screenshot.

RULES:
1. Extract ONLY the CLIENT's positive messages (not the business owner's replies)
2. If multiple client messages, combine into one flowing testimonial
3. Identify the messaging platform: whatsapp, messenger, telegram, sms, or unknown
4. Identify the speaker's name if visible in the chat header or contact info
5. REDACT all phone numbers — replace with ****
6. Preserve the ORIGINAL wording EXACTLY — do not translate, rephrase, or improve
7. Keep Arabic text in Arabic, English in English
8. Remove timestamps, read receipts, delivery indicators, and UI chrome

Return ONLY this JSON (no markdown, no backticks):
{"text":"exact testimonial text here","speakerName":"name or null","platform":"whatsapp|messenger|telegram|sms|unknown"}`
                                }
                            ]
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                })
            });

            const data = await response.json() as any;

            if (data.error) {
                console.error('OpenAI OCR error:', data.error);
                results.push({ text: '', speakerName: null, platform: 'unknown' });
                continue;
            }

            const content = data.choices?.[0]?.message?.content || '{}';
            try {
                const parsed = JSON.parse(content);
                results.push({
                    text: (parsed.text || '').trim(),
                    speakerName: parsed.speakerName || null,
                    platform: parsed.platform || 'unknown',
                });
            } catch {
                results.push({ text: '', speakerName: null, platform: 'unknown' });
            }
        }

        console.log(`📝 Testimonial OCR: ${results.filter(r => r.text.length > 0).length}/${screenshots.length} extracted`);
        return { success: true, testimonials: results.filter(r => r.text.length > 0) };
    } catch (error: any) {
        console.error("Testimonial extraction error:", error);
        throw new HttpsError("internal", "Failed to extract testimonial text: " + error.message);
    }
});

// ─── WINNING PRINCIPLES VAULT — Trigger extraction on feedback signals ───

export const triggerVaultExtraction = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 60,
    cors: true,
    memory: "256MiB",
    maxInstances: 10,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const userId = request.auth.uid;
    const { generationId, signal } = request.data as { generationId: string; signal: 'positive' | 'negative' | 'favorite' };

    if (!generationId || !signal) throw new HttpsError("invalid-argument", "generationId and signal required.");

    // Debounce: collect recent signals, process when batch >= 3 or forced
    const vaultRef = admin.firestore().collection('principleVaults').doc(userId);
    const pendingRef = vaultRef.collection('pendingSignals');

    // Store the signal
    await pendingRef.doc(generationId).set({
        generationId,
        signal,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Count pending signals
    const pendingSnap = await pendingRef.get();
    if (pendingSnap.size < 3) {
        return { status: 'queued', pending: pendingSnap.size, message: 'Signal queued. Will process when batch reaches 3.' };
    }

    // Batch is ready — process all pending signals
    const callGemini = createGeminiCaller(geminiApiKey.value());
    const { extractPrinciples, extractAntiPrinciples, consolidateVault } = await import("./principleVault.js");

    const positiveIds: string[] = [];
    const negativeIds: string[] = [];

    for (const doc of pendingSnap.docs) {
        const data = doc.data();
        if (data.signal === 'positive' || data.signal === 'favorite') {
            positiveIds.push(data.generationId);
        } else {
            negativeIds.push(data.generationId);
        }
    }

    let principlesCreated = 0;
    try {
        if (positiveIds.length >= 2) {
            principlesCreated += await extractPrinciples(userId, positiveIds, signal === 'favorite' ? 'favorite' : 'thumbsUp', callGemini);
        }
        if (negativeIds.length >= 2) {
            principlesCreated += await extractAntiPrinciples(userId, negativeIds, 'negative', callGemini);
        }
        await consolidateVault(userId);
    } catch (e: any) {
        console.error('[triggerVaultExtraction] Extraction error:', e.message);
    }

    // Clear processed pending signals
    const batch = admin.firestore().batch();
    for (const doc of pendingSnap.docs) {
        batch.delete(doc.ref);
    }
    await batch.commit();

    return { status: 'processed', principlesCreated, processedSignals: pendingSnap.size };
});

// The `designCritique` callable (GPT-4o-mini quality gate) was removed on
// 2026-05-30 as a product decision. The frontend service method that called it
// has also been removed. Re-add both layers together if the gate is reintroduced.

// ─── 5c. PUSH CREATIVE PACK (Image + Copy) TO META ─────────────────────
export const metaPushCreativePack = onCall({
    region: "europe-west1",
    secrets: [metaAppSecret],
    timeoutSeconds: 120,
    cors: true,
    memory: "512MiB",
    maxInstances: 5,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const { imageBase64, adName, primaryText, pageId, activeWorkspaceId } = request.data;

    if (!imageBase64) throw new HttpsError("invalid-argument", "Missing image data.");
    if (!primaryText) throw new HttpsError("invalid-argument", "Missing ad copy text.");

    const connDoc = await admin.firestore().collection("metaConnections").doc(uid).get();
    if (!connDoc.exists) throw new HttpsError("not-found", "No Meta connection found.");
    const conn = connDoc.data()!;

    let accountId: string | null = null;
    if (activeWorkspaceId) {
        const wsDoc = await admin.firestore().collection("users").doc(uid).collection("workspaces").doc(activeWorkspaceId).get();
        if (wsDoc.exists) {
            const ws = wsDoc.data()!;
            accountId = ws.metaAdAccountId || null;
        }
    }
    if (!accountId) {
        accountId = conn.selectedAccountId || null;
    }
    if (!accountId) throw new HttpsError("failed-precondition", "No ad account selected.");

    try {
        const token = decryptToken(conn.encryptedToken, metaAppSecret.value());

        // Step 1: Upload image
        let rawBase64 = imageBase64;
        if (rawBase64.includes(',')) rawBase64 = rawBase64.split(',')[1];

        const fileName = `${(adName || 'proadsai').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
        const uploadResponse = await fetch(
            `https://graph.facebook.com/v22.0/${accountId}/adimages`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bytes: rawBase64, name: fileName, access_token: token }),
            }
        );
        const uploadData = await uploadResponse.json() as any;
        if (uploadData.error) {
            throw new HttpsError("internal", `Image upload failed: ${uploadData.error.message}`);
        }

        const images = uploadData.images || {};
        const imageHash = Object.values(images as Record<string, any>)[0]?.hash;
        if (!imageHash) throw new HttpsError("internal", "No image hash returned.");

        // Step 2: Create ad creative pairing image + copy
        // This requires a page_id — if not provided, we just upload the image
        if (pageId) {
            const creativeResponse = await fetch(
                `https://graph.facebook.com/v22.0/${accountId}/adcreatives`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: adName || 'Pro Ads AI Creative',
                        object_story_spec: {
                            page_id: pageId,
                            link_data: {
                                image_hash: imageHash,
                                message: primaryText,
                                link: 'https://proadsai.com', // Placeholder — user updates in Ads Manager
                            }
                        },
                        access_token: token,
                    }),
                }
            );
            const creativeData = await creativeResponse.json() as any;
            if (creativeData.error) {
                // Creative creation failed, but image was uploaded successfully
                console.warn("Creative creation failed (image uploaded):", creativeData.error.message);
                return {
                    success: true,
                    message: `Image uploaded (hash: ${imageHash.substring(0, 8)}...). Ad creative couldn't be created: ${creativeData.error.message}. You can pair them manually in Ads Manager.`,
                    imageHash,
                    creativeId: null,
                };
            }

            console.log(`📦 Creative pack pushed for user ${uid}: image=${imageHash}, creative=${creativeData.id}`);
            return {
                success: true,
                message: `Creative uploaded and paired with copy!`,
                imageHash,
                creativeId: creativeData.id,
            };
        }

        // No pageId — just return image hash
        return {
            success: true,
            message: `Image uploaded to Meta Ads library. Pair with copy in Ads Manager.`,
            imageHash,
            creativeId: null,
        };
    } catch (err: any) {
        if (err instanceof HttpsError) throw err;
        console.error("Push creative pack error:", err);
        throw new HttpsError("internal", `Failed: ${err.message || 'Unknown error'}`);
    }
});

// ─── 6. DAILY AUTO-SYNC (Scheduled) ─────────────────────────────────────
export const metaDailySync = onSchedule({
    region: "europe-west1",
    schedule: "0 3 * * *", // 3 AM UTC daily
    secrets: [metaAppSecret],
    timeoutSeconds: 300,
    memory: "512MiB",
}, async () => {
    console.log("🔄 Starting daily Meta performance sync...");

    const connections = await admin.firestore().collection("metaConnections")
        .where("status", "==", "active")
        .get();

    let successCount = 0;
    let errorCount = 0;

    for (const connDoc of connections.docs) {
        const conn = connDoc.data();
        const uid = conn.userId;

        // Skip expired tokens
        if (conn.expiresAt < Date.now()) {
            console.warn(`⚠️ Token expired for user ${uid}`);
            await connDoc.ref.update({ status: "token_expired" });
            errorCount++;
            continue;
        }

        try {
            const token = decryptToken(conn.encryptedToken, metaAppSecret.value());
            // Sync ALL active ad accounts, not just the selected one
            const activeAccounts: { id: string }[] = (conn.adAccounts || [])
                .filter((a: any) => a.status === 1 || a.account_status === 1);
            if (activeAccounts.length === 0 && conn.selectedAccountId) {
                activeAccounts.push({ id: conn.selectedAccountId });
            }
            if (activeAccounts.length === 0) continue;

            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const until = new Date().toISOString().split("T")[0];

            // Collect all ads across accounts for creative memory / vault analysis
            let allAdsForMemory: any[] = [];

            for (const account of activeAccounts) {
                const accountId = account.id;

            const response = await fetch(
                `https://graph.facebook.com/v22.0/${accountId}/insights?` +
                `fields=ad_name,ad_id,impressions,clicks,spend,ctr,cpc,actions,purchase_roas&` +
                `time_range={"since":"${since}","until":"${until}"}&` +
                `level=ad&limit=50&access_token=${token}`
            );
            const data = await response.json() as any;

            if (data.error) {
                console.error(`❌ Sync failed for ${uid} account ${accountId}:`, data.error.message);
                continue;
            }

            // Look up workspaceId from deployment records for each ad
            const deploySnap = await admin.firestore().collection("creativeDeployments")
                .where("userId", "==", uid)
                .where("adAccountId", "==", accountId)
                .select("metaAdId", "adName", "workspaceId")
                .limit(200).get();
            const deployWsMap = new Map<string, string | null>();
            for (const d of deploySnap.docs) {
                const dd = d.data();
                if (dd.metaAdId) deployWsMap.set(dd.metaAdId, dd.workspaceId || null);
                if (dd.adName) deployWsMap.set(`name:${dd.adName}`, dd.workspaceId || null);
            }

            const batch = admin.firestore().batch();
            for (const ad of (data.data || [])) {
                const roas = (ad.purchase_roas || []).length > 0 ? parseFloat(ad.purchase_roas[0].value) : null;
                const adWsId = deployWsMap.get(ad.ad_id) ?? deployWsMap.get(`name:${ad.ad_name}`) ?? null;
                batch.set(admin.firestore().collection("adPerformance").doc(`${uid}_${ad.ad_id}`), {
                    userId: uid, adAccountId: accountId, workspaceId: adWsId, adId: ad.ad_id, adName: ad.ad_name || "",
                    impressions: parseInt(ad.impressions || "0"),
                    clicks: parseInt(ad.clicks || "0"),
                    spend: parseFloat(ad.spend || "0"),
                    ctr: parseFloat(ad.ctr || "0"),
                    roas,
                    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            await batch.commit();
            allAdsForMemory.push(...(data.data || []));

            } // end for-each account

            await connDoc.ref.update({ lastSyncAt: admin.firestore.FieldValue.serverTimestamp() });
            successCount++;

            // ═══ CREATIVE MEMORY: Update memory with performance + rebuild indexes ═══
            // Build a workspace lookup from all deployment records for this user
            const allDeploymentsSnap = await admin.firestore().collection("creativeDeployments")
                .where("userId", "==", uid).select("metaAdId", "adName", "workspaceId").limit(500).get();
            const adWsLookup = new Map<string, string | null>();
            for (const d of allDeploymentsSnap.docs) {
                const dd = d.data();
                if (dd.metaAdId) adWsLookup.set(dd.metaAdId, dd.workspaceId || null);
                if (dd.adName) adWsLookup.set(`name:${dd.adName}`, dd.workspaceId || null);
            }
            try {
                const { updateMemoryPerformance, rebuildPatternIndexes } = await import("./creativeMemory.js");
                for (const ad of allAdsForMemory) {
                    const roas = (ad.purchase_roas || []).length > 0 ? parseFloat(ad.purchase_roas[0].value) : 0;
                    const actions = ad.actions || [];
                    const conversions = actions.find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0;
                    const impressions = parseInt(ad.impressions || "0");
                    const cvr = impressions > 0 ? (parseInt(conversions) / impressions) * 100 : 0;
                    const adWs = adWsLookup.get(ad.ad_id) ?? adWsLookup.get(`name:${ad.ad_name}`) ?? null;

                    await updateMemoryPerformance(uid, ad.ad_name || '', {
                        ctr: parseFloat(ad.ctr || "0"),
                        cvr,
                        roas,
                        cpc: parseFloat(ad.cpc || "0"),
                        spend: parseFloat(ad.spend || "0"),
                        impressions,
                        clicks: parseInt(ad.clicks || "0"),
                    }, adWs);
                }
                // Rebuild pattern indexes with fresh data
                await rebuildPatternIndexes(uid);

                // ═══ WINNING PRINCIPLES VAULT: Extract from Meta performance winners/losers ═══
                try {
                    const { extractPrinciples: vaultExtract, extractAntiPrinciples: vaultAntiExtract, consolidateVault: vaultConsolidate } = await import("./principleVault.js");
                    const vaultCallGemini = createGeminiCaller(geminiApiKey.value());
                    const ads = allAdsForMemory;

                    // Compute CTR quartile for this user's ads
                    const ctrs = ads.map((a: any) => parseFloat(a.ctr || "0")).filter((c: number) => c > 0).sort((a: number, b: number) => a - b);
                    const topQuartileCtr = ctrs.length > 0 ? ctrs[Math.floor(ctrs.length * 0.75)] : 999;
                    const bottomQuartileCtr = ctrs.length > 0 ? ctrs[Math.floor(ctrs.length * 0.25)] : 0;

                    // ── Step 1: Aggregate at creative level before judging ──
                    // Same creative in different adsets/campaigns should be judged on TOTAL performance
                    const creativeAggregates = new Map<string, {
                        totalImpressions: number; totalClicks: number; totalSpend: number;
                        totalPurchases: number; totalRevenue: number; adsetCount: number;
                        genId: string;
                    }>();

                    for (const ad of ads) {
                        const adSpend = parseFloat(ad.spend || "0");
                        const adClicks = parseInt(ad.clicks || "0");
                        const adImpressions = parseInt(ad.impressions || "0");
                        const adRoas = (ad.purchase_roas || []).length > 0 ? parseFloat(ad.purchase_roas[0].value) : 0;
                        const adConversions = parseInt(((ad.actions || []).find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || "0"));
                        const adRevenue = adRoas * adSpend;

                        // Find matching generation in creativeDeployments
                        const deploySnap = await admin.firestore().collection('creativeDeployments')
                            .where('userId', '==', uid)
                            .where('adName', '==', ad.ad_name || '')
                            .limit(1).get();
                        const deployData = deploySnap.empty ? null : deploySnap.docs[0].data();
                        const genId = deployData?.generationId;
                        if (!genId) continue;

                        // Use imageHash for grouping (same creative across adsets), fallback to genId
                        const creativeKey = deployData?.imageHash || genId;
                        const existing = creativeAggregates.get(creativeKey) || {
                            totalImpressions: 0, totalClicks: 0, totalSpend: 0,
                            totalPurchases: 0, totalRevenue: 0, adsetCount: 0, genId
                        };
                        existing.totalImpressions += adImpressions;
                        existing.totalClicks += adClicks;
                        existing.totalSpend += adSpend;
                        existing.totalPurchases += adConversions;
                        existing.totalRevenue += adRevenue;
                        existing.adsetCount += 1;
                        creativeAggregates.set(creativeKey, existing);
                    }

                    // ── Step 2: Judge winners/losers on AGGREGATE metrics ──
                    const topPerformerIds: string[] = [];
                    const bottomPerformerIds: string[] = [];

                    for (const [, agg] of creativeAggregates) {
                        const aggCtr = agg.totalImpressions > 0 ? (agg.totalClicks / agg.totalImpressions) * 100 : 0;
                        const aggRoas = agg.totalSpend > 0 ? agg.totalRevenue / agg.totalSpend : 0;

                        // Winners: ROAS > 1.5 OR CTR in top quartile (need 1000+ impressions for CTR-based judging)
                        if (aggRoas > 1.5 || (aggCtr > topQuartileCtr && agg.totalImpressions > 1000)) {
                            topPerformerIds.push(agg.genId);
                        }
                        // Losers: spend > $20 with zero conversions, OR 500+ impressions with 0 clicks, OR ROAS < 0.5 / CTR bottom quartile
                        if ((agg.totalSpend > 20 && agg.totalPurchases === 0) || (agg.totalImpressions >= 500 && agg.totalClicks === 0)) {
                            bottomPerformerIds.push(agg.genId);
                        } else if (aggRoas < 0.5 && aggRoas > 0 || (aggCtr < bottomQuartileCtr && agg.totalImpressions > 1000)) {
                            bottomPerformerIds.push(agg.genId);
                        }
                    }

                    if (topPerformerIds.length >= 2) {
                        await vaultExtract(uid, topPerformerIds, 'metaPerformance', vaultCallGemini);
                    }
                    if (bottomPerformerIds.length >= 2) {
                        await vaultAntiExtract(uid, bottomPerformerIds, 'metaSpentNoResult', vaultCallGemini);
                    }
                    if (topPerformerIds.length >= 2 || bottomPerformerIds.length >= 2) {
                        await vaultConsolidate(uid);
                    }
                } catch (vaultErr) {
                    console.warn(`⚠️ Vault extraction failed for ${uid} (non-blocking):`, vaultErr);
                }
            } catch (memErr) {
                console.warn(`⚠️ Memory update failed for ${uid} (non-blocking):`, memErr);
            }

        } catch (err: any) {
            console.error(`❌ Sync error for ${uid}:`, err.message);
            errorCount++;
        }

        // Rate limit: wait 2s between users
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`✅ Daily sync complete: ${successCount} success, ${errorCount} errors`);
});

// ─── 7. TOKEN REFRESH (Scheduled - every 45 days) ───────────────────────
export const metaRefreshTokens = onSchedule({
    region: "europe-west1",
    schedule: "0 4 1,15 * *", // 1st and 15th of each month at 4 AM UTC
    secrets: [metaAppId, metaAppSecret],
    timeoutSeconds: 120,
}, async () => {
    console.log("🔑 Refreshing Meta tokens...");

    // Find tokens expiring within 15 days
    const expiryThreshold = Date.now() + (15 * 24 * 60 * 60 * 1000);
    const expiring = await admin.firestore().collection("metaConnections")
        .where("status", "==", "active")
        .where("expiresAt", "<", expiryThreshold)
        .get();

    let refreshed = 0;
    for (const connDoc of expiring.docs) {
        const conn = connDoc.data();
        try {
            const currentToken = decryptToken(conn.encryptedToken, metaAppSecret.value());

            const response = await fetch(
                `https://graph.facebook.com/v22.0/oauth/access_token?` +
                `grant_type=fb_exchange_token&client_id=${metaAppId.value()}` +
                `&client_secret=${metaAppSecret.value()}&fb_exchange_token=${currentToken}`
            );
            const data = await response.json() as any;

            if (data.access_token) {
                const newEncrypted = encryptToken(data.access_token, metaAppSecret.value());
                const newExpiry = Date.now() + ((data.expires_in || 5184000) * 1000);
                await connDoc.ref.update({
                    encryptedToken: newEncrypted,
                    expiresAt: newExpiry,
                });
                refreshed++;
            }
        } catch (err: any) {
            console.error(`❌ Token refresh failed for ${conn.userId}:`, err.message);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`🔑 Refreshed ${refreshed}/${expiring.size} tokens`);
});

// ─── 8. META DATA DELETION CALLBACK ─────────────────────────────────────
export const metaDataDeletion = onRequest({
    region: "europe-west1",
    secrets: [metaAppSecret],
}, async (req, res) => {
    // Meta sends a POST with signed_request when a user requests data deletion
    const signedRequest = req.body?.signed_request;
    if (!signedRequest) {
        res.status(400).json({ error: "Missing signed_request" });
        return;
    }

    try {
        const [, payload] = signedRequest.split(".");
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        const metaUserId = data.user_id;

        if (!metaUserId) {
            res.status(400).json({ error: "Missing user_id in signed_request" });
            return;
        }

        // Find and delete all connections for this Meta user
        // Note: We store by Firebase UID, not Meta user ID, so we search all connections
        const connections = await admin.firestore().collection("metaConnections").get();
        const confirmationCode = `PROADSAI_DEL_${Date.now()}`;

        for (const doc of connections.docs) {
            // Delete connection
            await doc.ref.delete();
            // Delete performance data
            const perfDocs = await admin.firestore().collection("adPerformance")
                .where("userId", "==", doc.id).get();
            const batch = admin.firestore().batch();
            perfDocs.docs.forEach(d => batch.delete(d.ref));
            if (perfDocs.size > 0) await batch.commit();
        }

        console.log(`🗑️ Data deletion processed for Meta user ${metaUserId}`);

        // Meta requires this exact response format
        res.json({
            url: `https://proadsai.com/deletion-status?code=${confirmationCode}`,
            confirmation_code: confirmationCode,
        });
    } catch (err: any) {
        console.error("Data deletion error:", err);
        res.status(500).json({ error: "Failed to process deletion" });
    }
});
// ═══════════════════════════════════════════════════════════════════════════
// WEBSITE ANALYSIS — Server-side fetch + structured extraction
// ═══════════════════════════════════════════════════════════════════════════
export const analyzeWebsite = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 45,
    memory: "512MiB",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;

    // Entitlement check
    const entitlement = await resolveFirestoreEntitlement(uid);
    const featureCheck = checkFeature(entitlement, 'brandUrlScraping');
    if (!featureCheck.allowed) {
        return { ok: false, errorCode: 'not_allowed', errorMessage: 'Brand website analysis requires a higher plan.' };
    }

    const { url } = request.data as { url?: string };

    // Validate URL
    if (!url || typeof url !== 'string') {
        return { ok: false, errorCode: 'invalid_url', errorMessage: 'Please provide a URL.' };
    }

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
    }

    try {
        new URL(normalizedUrl);
    } catch {
        return { ok: false, errorCode: 'invalid_url', errorMessage: 'The URL format is invalid.' };
    }

    // ═══ CREDIT DEDUCTION — per-URL caching (first use = 3 credits, cached = 0) ═══
    const parsedUrl = new URL(normalizedUrl);
    const cacheKey = (parsedUrl.origin + parsedUrl.pathname.replace(/\/$/, '')).toLowerCase();
    const urlHash = Buffer.from(cacheKey).toString('base64url').slice(0, 128);
    const cacheRef = admin.firestore().collection("users").doc(entitlement.creditOwnerUid).collection("analyzedUrls").doc(urlHash);
    const cacheDoc = await cacheRef.get();

    if (cacheDoc.exists) {
        // Cached result — no credit cost
        console.log(`📋 Brand URL cache hit for ${cacheKey} (user: ${entitlement.creditOwnerUid})`);
        return cacheDoc.data();
    }

    // First analysis of this URL — deduct credits atomically
    const scrapeCost = COSTS['brandUrlScraping'] || 3;
    await admin.firestore().runTransaction(async (tx) => {
        const userRef = admin.firestore().collection("users").doc(entitlement.creditOwnerUid);
        const snap = await tx.get(userRef);
        const current = snap.data()?.credits ?? 0;
        if (current < scrapeCost) {
            throw new HttpsError("resource-exhausted", `Need ${scrapeCost} credits for brand URL analysis but only have ${current}.`);
        }
        tx.update(userRef, { credits: current - scrapeCost });
    });

    // ═══ STEP 1: Fetch HTML server-side ═══
    let html = '';
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(normalizedUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ProAdsAI/1.0; +https://proadsai.com)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
            },
            redirect: 'follow',
        });
        clearTimeout(timeout);

        if (!response.ok) {
            if (response.status === 403 || response.status === 401) {
                return { ok: false, errorCode: 'blocked', errorMessage: `Website returned ${response.status}. The site may block automated access.` };
            }
            return { ok: false, errorCode: 'fetch_failed', errorMessage: `Website returned HTTP ${response.status}.` };
        }

        html = await response.text();
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            return { ok: false, errorCode: 'timeout', errorMessage: 'Website took too long to respond (>10s).' };
        }
        return { ok: false, errorCode: 'fetch_failed', errorMessage: 'Could not reach the website. Check the URL.' };
    }

    if (!html || html.length < 200) {
        return { ok: false, errorCode: 'empty_content', errorMessage: 'Website returned very little content.' };
    }

    // ═══ STEP 2: Extract metadata with regex ═══
    const getTag = (tag: string): string => {
        const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
        return m ? m[1].trim() : '';
    };
    const getMeta = (attr: string, val: string): string => {
        const m = html.match(new RegExp(`<meta[^>]*${attr}=["']${val}["'][^>]*content=["']([^"']+)["']`, 'i'))
            || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${val}["']`, 'i'));
        return m ? m[1].trim() : '';
    };
    const getAllTags = (tag: string, limit: number): string[] => {
        const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'gi');
        const results: string[] = [];
        let match;
        while ((match = regex.exec(html)) !== null && results.length < limit) {
            const text = match[1].trim();
            if (text.length > 3 && text.length < 120) results.push(text);
        }
        return results;
    };

    const title = getTag('title');
    const ogTitle = getMeta('property', 'og:title');
    const metaDesc = getMeta('name', 'description');
    const ogDesc = getMeta('property', 'og:description');
    const h1 = getTag('h1');
    const h2s = getAllTags('h2', 8);
    const h3s = getAllTags('h3', 6);
    const lis = getAllTags('li', 12);
    const ps = getAllTags('p', 8);

    const extractedProductName = ogTitle || h1 || title || '';
    const extractedDescription = metaDesc || ogDesc || '';

    if (!extractedProductName && !extractedDescription && !h1) {
        return { ok: false, errorCode: 'empty_content', errorMessage: 'Could not extract usable content from this website.' };
    }

    // Build heuristic fallback (same as before)
    const heuristicFeatures = [...h2s, ...lis].filter(t => t.length > 5 && t.length < 80).slice(0, 6);
    const heuristicBody = (extractedDescription + ' ' + heuristicFeatures.join(' ')).toLowerCase();
    let heuristicTone = '';
    if (heuristicBody.includes('luxury') || heuristicBody.includes('premium') || heuristicBody.includes('exclusive')) heuristicTone = 'luxury';
    else if (heuristicBody.includes('fun') || heuristicBody.includes('easy') || heuristicBody.includes('simple')) heuristicTone = 'friendly';
    else if (heuristicBody.includes('proven') || heuristicBody.includes('expert') || heuristicBody.includes('authority')) heuristicTone = 'authority';
    else if (heuristicBody.includes('transform') || heuristicBody.includes('change') || heuristicBody.includes('results')) heuristicTone = 'results-driven';

    const heuristicResult = {
        ok: true as const,
        productName: extractedProductName.substring(0, 100),
        offerTitle: (h1 || ogTitle || '').substring(0, 100),
        description: extractedDescription.substring(0, 200),
        featureCandidates: heuristicFeatures,
        brandTone: heuristicTone,
        sourceUrl: normalizedUrl,
    };

    // ═══ STEP 3: Gemini analysis ═══
    // Build a clean text summary for the model (not raw HTML)
    const contentForAI = [
        `URL: ${normalizedUrl}`,
        title ? `Page Title: ${title}` : '',
        ogTitle && ogTitle !== title ? `OG Title: ${ogTitle}` : '',
        extractedDescription ? `Meta Description: ${extractedDescription}` : '',
        h1 ? `Main Heading (H1): ${h1}` : '',
        h2s.length > 0 ? `Section Headings (H2): ${h2s.join(' | ')}` : '',
        h3s.length > 0 ? `Sub-Headings (H3): ${h3s.join(' | ')}` : '',
        lis.length > 0 ? `Key Bullet Points: ${lis.join(' | ')}` : '',
        ps.length > 0 ? `Paragraph Excerpts: ${ps.join(' | ')}` : '',
    ].filter(Boolean).join('\n');

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({
            model: LOGIC_MODEL,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        productName: { type: "STRING" },
                        offerTitle: { type: "STRING" },
                        targetAudience: { type: "STRING" },
                        challenges: { type: "STRING" },
                        transformation: { type: "STRING" },
                        cta: { type: "STRING" },
                        valueStackItems: { type: "ARRAY", items: { type: "STRING" } },
                        valueStackBonuses: { type: "ARRAY", items: { type: "STRING" } },
                        brandTone: { type: "STRING" },
                    },
                    required: ["productName", "targetAudience", "challenges", "transformation", "cta", "valueStackItems"],
                },
            } as any,
        });

        const analysisPrompt = `You are a senior direct-response marketing analyst. Analyze this website and extract STRUCTURED AD CREATION DATA.

WEBSITE CONTENT:
${contentForAI}

TASK: Extract ALL of the following fields. These will be used to create paid ads for this product/service. Be SPECIFIC and ACTIONABLE — not generic.

- productName: The product, course, or service name (short, recognizable). Max 80 chars.
- offerTitle: The main offer/package name if visible (e.g. "The Diamond Coaching Package"). Max 80 chars. Empty if not found.
- targetAudience: WHO is this for? Be specific. Example: "Arabic-speaking coaches and consultants who sell courses online" — NOT just "business owners". Max 120 chars.
- challenges: What PAINS does the target audience face that this product solves? Write 2-3 specific pain points separated by newlines. Example: "Pricing too low and attracting bargain hunters\nWasting hours on unqualified leads\nCompeting on price instead of value". Max 250 chars.
- transformation: What RESULT does the customer get? Write the before→after transformation. Example: "Go from charging $50/hour to $5,000 packages with clients who pay without negotiating". Max 200 chars.
- cta: The main call-to-action text from the website (e.g. "سجّل الآن", "Join Now", "احجز مكانك"). Max 40 chars. If not found, suggest one that fits.
- valueStackItems: What's INCLUDED in the offer? Extract specific deliverables (courses, modules, calls, templates, etc). Up to 8 items. Each item should be a concrete deliverable like "12 training modules" or "Weekly group coaching calls" — not vague benefits.
- valueStackBonuses: Any BONUS items mentioned? (free ebooks, templates, extra courses). Up to 4 items. Empty array if none found.
- brandTone: One of: luxury, friendly, authority, results-driven, bold, professional, inspiring, or empty string.

RULES:
- Use ACTUAL content from the website — do NOT invent or hallucinate information
- If the website is in Arabic, return ALL fields in Arabic
- If the website is in English, return in English  
- For challenges and transformation: write from the CUSTOMER's perspective, not the business owner's
- For valueStackItems: extract CONCRETE deliverables, not vague promises
- If a field truly cannot be determined from the content, return empty string (or empty array for arrays)
- NEVER return generic placeholder text like "improve your business" — be specific or leave empty

ANTI-HALLUCINATION (CRITICAL):
- For valueStackItems: ONLY include items that are EXPLICITLY listed on the website (e.g. "12 modules", "weekly calls"). If the website does NOT list specific deliverables, return an EMPTY array []. Do NOT invent items.
- For valueStackBonuses: ONLY include bonuses that are EXPLICITLY mentioned. If none found, return [].
- For challenges: ONLY mention problems that are discussed or implied on the website. Do NOT invent generic pains.
- For targetAudience: Use the ACTUAL audience described on the website. If not stated, infer from context but be specific — never return "business owners" or "everyone".
- VERIFICATION: Before returning each field, ask yourself: "Can I point to a specific phrase on the website that supports this?" If not, return empty.`;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
        });
        const responseText = result.response.text();

        // With responseMimeType: "application/json" + responseSchema, the model
        // returns strict JSON. Parse directly; fall back to heuristic on any issue.
        let parsed: any;
        try {
            parsed = JSON.parse(responseText);
        } catch {
            console.warn('analyzeWebsite: Schema-enforced response was not valid JSON, falling back to heuristic');
            return heuristicResult;
        }

        // Sanitize — even with schema enforcement, clamp lengths and validate types
        const safeTrim = (v: any, max: number) => typeof v === 'string' ? v.substring(0, max).trim() : '';
        const safeArray = (v: any, max: number) => Array.isArray(v) ? v.filter((s: any) => typeof s === 'string' && s.length > 2).slice(0, max) : [];

        // Post-processing: strip copyright/footer garbage from extracted fields
        const copyrightPatterns = /copyright|©|حقوق محفوظة|all rights reserved|privacy policy|terms of service|terms and conditions|سياسة الخصوصية|الشروط والأحكام/i;
        const stripIfCopyright = (val: string): string => copyrightPatterns.test(val) ? '' : val;
        const genericPatterns = /^improve your business$|^grow your audience$|^increase your sales$|^make more money$|^تحسين عملك$|^زيادة مبيعاتك$/i;
        const filterArrayItems = (arr: string[], minLen: number): string[] =>
            arr.filter(item => item.length >= minLen && !copyrightPatterns.test(item) && !genericPatterns.test(item));

        const geminiResult = {
            ok: true,
            productName: stripIfCopyright(safeTrim(parsed.productName, 100)) || heuristicResult.productName,
            offerTitle: stripIfCopyright(safeTrim(parsed.offerTitle, 100)) || heuristicResult.offerTitle,
            description: safeTrim(parsed.transformation, 200) || heuristicResult.description,
            targetAudience: safeTrim(parsed.targetAudience, 150),
            challenges: stripIfCopyright(safeTrim(parsed.challenges, 300)),
            transformation: safeTrim(parsed.transformation, 200),
            cta: safeTrim(parsed.cta, 50),
            valueStackItems: filterArrayItems(safeArray(parsed.valueStackItems, 8), 10),
            valueStackBonuses: filterArrayItems(safeArray(parsed.valueStackBonuses, 4), 10),
            featureCandidates: filterArrayItems(safeArray(parsed.valueStackItems, 8), 10).length > 0 ? filterArrayItems(safeArray(parsed.valueStackItems, 8), 10) : heuristicResult.featureCandidates,
            brandTone: safeTrim(parsed.brandTone, 30) || heuristicResult.brandTone,
            sourceUrl: normalizedUrl,
        };
        // Cache for future free reuse
        try { await cacheRef.set({ ...geminiResult, cachedAt: Date.now() }); } catch (e) { /* non-critical */ }
        return geminiResult;
    } catch (geminiErr: any) {
        console.warn('analyzeWebsite: Gemini analysis failed, falling back to heuristic:', geminiErr?.message);
        // Cache heuristic result too
        try { await cacheRef.set({ ...heuristicResult, cachedAt: Date.now() }); } catch (e) { /* non-critical */ }
        return heuristicResult;
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE CALLABLES (Phase 12 — Workspace Logic)
// ═══════════════════════════════════════════════════════════════════════════

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ─── Shared payload helpers for workspace callables ─────────────────────────
function asObjectPayload(raw: unknown): Record<string, any> {
    if (raw == null) return {};
    if (typeof raw !== "object") {
        throw new HttpsError("invalid-argument", "Request payload must be an object.", { reason: "invalid_payload" });
    }
    return raw as Record<string, any>;
}

function requireNonEmptyString(val: unknown, fieldName: string): string {
    if (typeof val !== "string" || val.trim().length === 0) {
        throw new HttpsError("invalid-argument", `${fieldName} is required and must be a non-empty string.`, { reason: `${fieldName}_required` });
    }
    return val;
}

function validatePositiveIntLimit(val: unknown, fieldName: string, max: number): number | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val !== "number" || !Number.isInteger(val) || val <= 0) {
        throw new HttpsError("invalid-argument", `${fieldName} must be a positive integer.`, { reason: "invalid_limit" });
    }
    if (val > max) {
        throw new HttpsError("invalid-argument", `${fieldName} must be ≤ ${max}.`, { reason: "invalid_limit" });
    }
    return val;
}

function validateTimestampIdCursor(
    val: unknown,
    fieldName: string
): { timestamp: number; id: string } | null {
    if (val === undefined || val === null) return null;
    if (typeof val !== "object") {
        throw new HttpsError("invalid-argument", `${fieldName} must be an object.`, { reason: "invalid_cursor" });
    }
    const c = val as Record<string, unknown>;
    if (typeof c.timestamp !== "number" || !Number.isFinite(c.timestamp)) {
        throw new HttpsError("invalid-argument", `${fieldName}.timestamp must be a number.`, { reason: "invalid_cursor" });
    }
    if (typeof c.id !== "string" || c.id.length === 0) {
        throw new HttpsError("invalid-argument", `${fieldName}.id must be a non-empty string.`, { reason: "invalid_cursor" });
    }
    return { timestamp: c.timestamp, id: c.id };
}

export const createWorkspace = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    if (!request.data || typeof request.data !== "object") {
        throw new HttpsError("invalid-argument", "Request payload is required.", { reason: "invalid_payload" });
    }
    const data = request.data as any;

    // Guard against non-string payloads before calling .trim() — a TypeError here
    // would surface as an opaque "internal" error to the client.
    if (data.name !== undefined && data.name !== null && typeof data.name !== "string") {
        throw new HttpsError("invalid-argument", "Workspace name must be a string.", { reason: "invalid_type" });
    }
    if (data.brandName !== undefined && data.brandName !== null && typeof data.brandName !== "string") {
        throw new HttpsError("invalid-argument", "Brand name must be a string.", { reason: "invalid_type" });
    }

    const name = (typeof data.name === "string" ? data.name : "").trim();
    const brandName = (typeof data.brandName === "string" ? data.brandName : "").trim();
    if (!name) throw new HttpsError("invalid-argument", "Workspace name is required.", { reason: "name_required" });
    if (!brandName) throw new HttpsError("invalid-argument", "Brand name is required.", { reason: "brand_name_required" });
    if (name.length > 60) throw new HttpsError("invalid-argument", "Workspace name must be 60 characters or fewer.", { reason: "name_too_long" });
    if (brandName.length > 60) throw new HttpsError("invalid-argument", "Brand name must be 60 characters or fewer.", { reason: "brand_name_too_long" });

    if (data.brandColorPrimary && !HEX_RE.test(data.brandColorPrimary)) {
        throw new HttpsError("invalid-argument", "Brand color must be a 6-digit hex value like #A1B2C3.", { reason: "invalid_hex_color" });
    }
    if (data.brandColorSecondary && !HEX_RE.test(data.brandColorSecondary)) {
        throw new HttpsError("invalid-argument", "Brand color must be a 6-digit hex value.", { reason: "invalid_hex_color" });
    }

    // Plan check is inside createWorkspaceWithLimit's transaction to avoid a
    // TOCTOU race between entitlement read and workspace create.
    const workspaceId = await createWorkspaceWithLimit(uid, {
        name,
        brandName,
        brandUrl: data.brandUrl ?? null,
        brandColorPrimary: data.brandColorPrimary ?? null,
        brandColorSecondary: data.brandColorSecondary ?? null,
        logoUrl: data.logoUrl ?? null,
        isDefault: false,
        createdAt: Date.now(),
        deletedAt: null,
        metaAdAccountId: null,
        metaAdAccountName: null,
        metaRoleAtLinkTime: null,
        pendingReassign: false,
        pendingRestore: false,
    });

    return { workspaceId };
});

export const updateWorkspace = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const workspaceId = requireNonEmptyString(data.workspaceId, "workspaceId");

    const forbidden = ["isDefault", "createdAt", "deletedAt", "metaAdAccountId", "metaAdAccountName", "metaRoleAtLinkTime", "pendingReassign", "pendingRestore"];
    for (const f of forbidden) {
        if (data[f] !== undefined) throw new HttpsError("invalid-argument", `Field ${f} cannot be updated here.`);
    }

    if (data.brandColorPrimary && !HEX_RE.test(data.brandColorPrimary)) {
        throw new HttpsError("invalid-argument", "Brand color must be a 6-digit hex value.");
    }
    if (data.brandColorSecondary && !HEX_RE.test(data.brandColorSecondary)) {
        throw new HttpsError("invalid-argument", "Brand color must be a 6-digit hex value.");
    }

    // Parity with createWorkspace: name / brandName must be a string, non-whitespace, ≤ 60 chars after trim.
    const trimmedStrings: Record<string, string | null> = {};
    for (const key of ["name", "brandName"] as const) {
        const val = data[key];
        if (val === undefined) continue;
        if (val === null) {
            // Null is not a valid clear for required fields.
            throw new HttpsError("invalid-argument", `${key} cannot be cleared.`);
        }
        if (typeof val !== "string") {
            throw new HttpsError("invalid-argument", `${key} must be a string.`, { reason: "invalid_type" });
        }
        const trimmed = val.trim();
        if (trimmed.length === 0) {
            throw new HttpsError("invalid-argument", `${key} cannot be empty or whitespace.`);
        }
        if (trimmed.length > 60) {
            throw new HttpsError("invalid-argument", `${key} must be 60 characters or fewer.`);
        }
        trimmedStrings[key] = trimmed;
    }

    const wsSnap = await assertOwner(request.auth, workspaceId);
    assertWorkspaceActive(wsSnap);

    const updates: Record<string, any> = {};
    for (const key of ["name", "brandName", "brandUrl", "brandColorPrimary", "brandColorSecondary", "logoUrl"]) {
        if (data[key] !== undefined) {
            if (key === "name" || key === "brandName") {
                updates[key] = trimmedStrings[key];
            } else {
                updates[key] = data[key] === null ? admin.firestore.FieldValue.delete() : data[key];
            }
        }
    }

    await wsSnap.ref.update(updates);
    return { ok: true };
});

export const deleteWorkspace = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const workspaceId = requireNonEmptyString(data.workspaceId, "workspaceId");

    const wsSnap = await admin.firestore().collection(`users/${uid}/workspaces`).doc(workspaceId).get();
    if (!wsSnap.exists) throw new HttpsError("not-found", "Workspace not found or already deleted.");
    const wsData = wsSnap.data()!;

    if (wsData.isDefault === true) {
        throw new HttpsError("failed-precondition", "The default workspace can't be deleted.");
    }

    const alreadySoftDeleted = wsData.deletedAt != null;
    const cascadeStillPending = wsData.pendingReassign === true;

    // If the prior run finished cleanly, return idempotently.
    if (alreadySoftDeleted && !cascadeStillPending) {
        return { ok: true, pendingReassign: false };
    }

    // First attempt: mark soft-deleted + pendingReassign BEFORE the cascade runs.
    // Retry attempt: pendingReassign is already true — fall through to re-run the cascade.
    if (!alreadySoftDeleted) {
        await wsSnap.ref.update({
            deletedAt: Date.now(),
            pendingReassign: true,
        });
    }

    const defaultId = await resolveDefaultWorkspaceId(uid);
    try {
        await cascadeReassignOnDelete(uid, workspaceId, defaultId);
    } catch (err) {
        console.error(`🔥 Cascade reassign failed for workspace ${workspaceId}:`, err);
        // pendingReassign stays true so a retry will re-enter this handler.
        throw new HttpsError("internal", "Workspace deletion partially failed. Please retry.");
    }

    return { ok: true, pendingReassign: false };
});

export const restoreWorkspace = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const workspaceId = requireNonEmptyString(data.workspaceId, "workspaceId");

    const wsSnap = await admin.firestore().collection(`users/${uid}/workspaces`).doc(workspaceId).get();
    if (!wsSnap.exists) throw new HttpsError("not-found", "Workspace not found.");
    const wsData = wsSnap.data()!;

    const isSoftDeleted = wsData.deletedAt != null;
    const restorePending = wsData.pendingRestore === true;

    // Neither soft-deleted nor mid-restore → nothing to do.
    if (!isSoftDeleted && !restorePending) {
        throw new HttpsError("failed-precondition", "This workspace is not deleted and does not need restoration.");
    }

    // First attempt: clear deletedAt + set pendingRestore BEFORE the cascade runs.
    // Retry attempt: pendingRestore is already true — fall through to re-run the cascade.
    if (isSoftDeleted) {
        const thirtyDaysMs = 30 * 24 * 3600 * 1000;
        if (Date.now() - wsData.deletedAt > thirtyDaysMs) {
            throw new HttpsError("failed-precondition", "This workspace was deleted more than 30 days ago and cannot be restored.");
        }
        await wsSnap.ref.update({
            deletedAt: admin.firestore.FieldValue.delete(),
            pendingRestore: true,
        });
    }

    try {
        await cascadeRevertOnRestore(uid, workspaceId);
    } catch (err) {
        console.error(`🔥 Cascade restore failed for workspace ${workspaceId}:`, err);
        // pendingRestore stays true so a retry will re-enter this handler.
        throw new HttpsError("internal", "Workspace restore partially failed. Please retry.");
    }

    return { ok: true, pendingRestore: false };
});

export const linkMetaAccountToWorkspace = onCall({
    region: "europe-west1",
    secrets: [metaAppId, metaAppSecret],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const workspaceId = requireNonEmptyString(data.workspaceId, "workspaceId");
    const metaAdAccountId = requireNonEmptyString(data.metaAdAccountId, "metaAdAccountId");
    const metaAdAccountName = typeof data.metaAdAccountName === "string" ? data.metaAdAccountName : "";

    const wsSnap = await admin.firestore().collection(`users/${uid}/workspaces`).doc(workspaceId).get();
    if (!wsSnap.exists) throw new HttpsError("not-found", "Workspace not found.");
    assertWorkspaceActive(wsSnap);

    const connDoc = await admin.firestore().collection("metaConnections").doc(uid).get();
    const conn = connDoc.exists ? connDoc.data() : null;
    if (!conn?.encryptedToken) {
        throw new HttpsError("failed-precondition", "Connect your Meta account first.");
    }
    const accessToken = decryptToken(conn.encryptedToken, metaAppSecret.value());

    const connectedAccounts: any[] = conn.adAccounts ?? [];
    const isConnected = connectedAccounts.some((a: any) => a.id === metaAdAccountId || `act_${a.id}` === metaAdAccountId || a.id === metaAdAccountId.replace("act_", ""));
    if (!isConnected) {
        throw new HttpsError("failed-precondition", "This Meta ad account is not in your connected accounts.");
    }

    const role = await probeMetaRole(accessToken, metaAdAccountId);
    if (role === "INSUFFICIENT") {
        throw new HttpsError("failed-precondition", "Your Meta role on this ad account doesn't allow publishing. Request Advertiser access in Meta Business Manager to link it.");
    }

    await wsSnap.ref.update({
        metaAdAccountId,
        metaAdAccountName: metaAdAccountName ?? "",
        metaRoleAtLinkTime: role,
    });

    return { ok: true, metaRoleAtLinkTime: role };
});

export const unlinkMetaAccountFromWorkspace = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const workspaceId = requireNonEmptyString(data.workspaceId, "workspaceId");

    const wsSnap = await admin.firestore().collection(`users/${uid}/workspaces`).doc(workspaceId).get();
    if (!wsSnap.exists) throw new HttpsError("not-found", "Workspace not found.");

    await wsSnap.ref.update({
        metaAdAccountId: admin.firestore.FieldValue.delete(),
        metaAdAccountName: admin.firestore.FieldValue.delete(),
        metaRoleAtLinkTime: admin.firestore.FieldValue.delete(),
    });

    return { ok: true };
});

export const setTeamMemberWorkspaceAccess = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const memberDocId = requireNonEmptyString(data.memberDocId, "memberDocId");
    if (!Array.isArray(data.workspaceAccess)) {
        throw new HttpsError("invalid-argument", "workspaceAccess must be an array of strings.");
    }

    // Canonicalize: drop non-string / empty / whitespace entries, dedupe via Set,
    // then sort for stable array ordering. This is what feeds the diff, the
    // per-workspace validation loop, and the written member doc — so duplicate
    // IDs in the request can never produce duplicate audit entries.
    const workspaceAccess: string[] = [
        ...new Set(
            (data.workspaceAccess as unknown[])
                .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                .map((x) => x.trim())
        ),
    ].sort();

    const memberRef = admin.firestore().collection(`users/${uid}/team`).doc(memberDocId);

    // Snapshot the plan outside the txn — it is not part of the concurrent access diff.
    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    const planSnapshot = userSnap.data()?.billingState?.plan ?? userSnap.data()?.plan ?? "none";

    // The whole diff + audit write happens inside one transaction so that two
    // concurrent setTeamMemberWorkspaceAccess calls cannot compute their granted/revoked
    // deltas against the same stale pre-txn snapshot and double-emit audit entries.
    const result = await admin.firestore().runTransaction(async (txn) => {
        const memberSnap = await txn.get(memberRef);
        if (!memberSnap.exists) {
            throw new HttpsError("not-found", "Team member not found.");
        }
        const memberData = memberSnap.data()!;
        const currentAccess: string[] = memberData.workspaceAccess ?? [];

        const granted = workspaceAccess.filter((id) => !currentAccess.includes(id));
        const revoked = currentAccess.filter((id) => !workspaceAccess.includes(id));

        // Validate each requested workspace inside the txn so a concurrent delete
        // of a workspace can't slip through after our pre-txn check.
        const wsCache = new Map<string, admin.firestore.DocumentSnapshot>();
        for (const wsId of workspaceAccess) {
            const wsSnap = await txn.get(admin.firestore().collection(`users/${uid}/workspaces`).doc(wsId));
            if (!wsSnap.exists || wsSnap.data()?.deletedAt != null) {
                throw new HttpsError("failed-precondition", "One or more workspace IDs are invalid or soft-deleted.");
            }
            wsCache.set(wsId, wsSnap);
        }
        // Also read workspaces that are being revoked so we can record their name at event.
        for (const wsId of revoked) {
            if (wsCache.has(wsId)) continue;
            const wsSnap = await txn.get(admin.firestore().collection(`users/${uid}/workspaces`).doc(wsId));
            wsCache.set(wsId, wsSnap);
        }

        // No diff? Short-circuit before any writes hit.
        if (granted.length === 0 && revoked.length === 0) {
            return { granted: [] as string[], revoked: [] as string[] };
        }

        // All reads are done; now writes.
        txn.update(memberRef, { workspaceAccess });

        const targetMemberUid = memberData.uid ?? memberData.memberUid ?? "";
        const targetMemberEmail = memberData.email ?? memberData.memberEmail ?? "";

        for (const wsId of granted) {
            await writeAuditEntry(txn, {
                ownerUid: uid,
                actorUid: uid,
                targetMemberUid,
                targetMemberEmail,
                workspaceId: wsId,
                workspaceNameAtEvent: wsCache.get(wsId)?.data()?.name ?? "",
                action: "grant",
                planSnapshot,
            });
        }

        for (const wsId of revoked) {
            await writeAuditEntry(txn, {
                ownerUid: uid,
                actorUid: uid,
                targetMemberUid,
                targetMemberEmail,
                workspaceId: wsId,
                workspaceNameAtEvent: wsCache.get(wsId)?.data()?.name ?? "",
                action: "revoke",
                planSnapshot,
            });
        }

        return { granted, revoked };
    });

    return { ok: true, granted: result.granted, revoked: result.revoked };
});

export const getWorkspaceGenerations = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const workspaceId = requireNonEmptyString(data.workspaceId, "workspaceId");
    const reqLimit = validatePositiveIntLimit(data.limit, "limit", 50);
    const cursor = validateTimestampIdCursor(data.cursor, "cursor");

    const wsSnap = await admin.firestore().collectionGroup("workspaces").where(admin.firestore.FieldPath.documentId(), "==", workspaceId).limit(1).get();
    if (wsSnap.empty) throw new HttpsError("not-found", "Workspace not found.");

    const wsDoc = wsSnap.docs[0];
    const ownerUid = wsDoc.ref.parent.parent?.id;
    if (!ownerUid) throw new HttpsError("not-found", "Workspace not found.");
    assertWorkspaceActive(wsDoc);

    if (uid !== ownerUid) {
        // Team docs are auto-IDed; member doc stores the teammate's auth uid as `uid`
        // (see createTeamInvite accept path — txn.set({ uid: callerUid, ... })).
        const memberQuery = await admin.firestore()
            .collection(`users/${ownerUid}/team`)
            .where("uid", "==", uid)
            .limit(1)
            .get();
        if (memberQuery.empty) {
            throw new HttpsError("permission-denied", "You don't have access to this workspace.");
        }
        const memberData = memberQuery.docs[0].data();
        if (!(memberData.workspaceAccess ?? []).includes(workspaceId)) {
            throw new HttpsError("permission-denied", "You don't have access to this workspace.");
        }
    }

    const effectiveLimit = reqLimit ?? 20;

    // Composite cursor: (timestamp DESC, __name__ DESC). Using __name__ as the
    // secondary sort ensures rows sharing a timestamp paginate deterministically,
    // including when results from the primary and legacy (workspaceId===null)
    // queries are merged for the default workspace.
    const buildQuery = (wsFilter: string | null) => {
        let q: admin.firestore.Query = admin.firestore().collection("generations")
            .where("userId", "==", ownerUid)
            .where("workspaceId", "==", wsFilter)
            .orderBy("timestamp", "desc")
            .orderBy(admin.firestore.FieldPath.documentId(), "desc");
        if (cursor && cursor.timestamp != null && cursor.id) {
            q = q.startAfter(cursor.timestamp, cursor.id);
        }
        return q.limit(effectiveLimit);
    };

    const primarySnap = await buildQuery(workspaceId).get();
    const combined: Array<{ id: string; timestamp?: number; [k: string]: any }> =
        primarySnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // FR-015: legacy records with workspaceId === null surface under the default workspace.
    // Always run the merge — a legacy record with a higher timestamp can outrank a primary
    // record on the current page, so short-circuiting when the primary page is already full
    // would drop legitimately-newer legacy rows.
    if (wsDoc.data()?.isDefault === true) {
        const legacySnap = await buildQuery(null).get();
        const seen = new Set(combined.map((x) => x.id));
        for (const d of legacySnap.docs) {
            if (seen.has(d.id)) continue;
            combined.push({ id: d.id, ...d.data() });
        }
        // Merge sort by (timestamp DESC, id DESC) to match the query ordering,
        // then truncate to the page limit.
        combined.sort((a, b) => {
            const dt = (b.timestamp ?? 0) - (a.timestamp ?? 0);
            if (dt !== 0) return dt;
            return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
        });
        combined.length = Math.min(combined.length, effectiveLimit);
    }

    let nextCursor: { timestamp: number; id: string } | null = null;
    if (combined.length >= effectiveLimit && combined.length > 0) {
        const last = combined[combined.length - 1];
        if (last?.timestamp != null && last.id) {
            nextCursor = { timestamp: last.timestamp, id: last.id };
        }
    }

    return { items: combined, nextCursor };
});

export const getWorkspaceAccessAuditLog = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const reqLimit = validatePositiveIntLimit(data.limit, "limit", 200);
    const cursor = validateTimestampIdCursor(data.cursor, "cursor");
    const filterMemberUid = typeof data.filterMemberUid === "string" && data.filterMemberUid.length > 0 ? data.filterMemberUid : undefined;
    const filterWorkspaceId = typeof data.filterWorkspaceId === "string" && data.filterWorkspaceId.length > 0 ? data.filterWorkspaceId : undefined;

    const effectiveLimit = reqLimit ?? 50;
    let q: admin.firestore.Query = admin.firestore().collection(`users/${uid}/workspace_access_audit`)
        .orderBy("timestamp", "desc")
        .orderBy(admin.firestore.FieldPath.documentId(), "desc");

    if (filterMemberUid) {
        q = q.where("targetMemberUid", "==", filterMemberUid);
    }
    if (filterWorkspaceId) {
        q = q.where("workspaceId", "==", filterWorkspaceId);
    }
    if (cursor) {
        q = q.startAfter(cursor.timestamp, cursor.id);
    }
    q = q.limit(effectiveLimit);

    const snap = await q.get();
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{ id: string; timestamp?: number }>;

    let nextCursor: { timestamp: number; id: string } | null = null;
    if (entries.length >= effectiveLimit) {
        const last = entries[entries.length - 1];
        if (last?.timestamp != null && last.id) {
            nextCursor = { timestamp: last.timestamp, id: last.id };
        }
    }

    return { entries, nextCursor };
});

// Recursively replace heavy inline image data (base64 `data:` URLs and raw base64
// blobs) anywhere in a saved-project document with a short placeholder. Firestore
// rejects documents > 1 MiB, and a single render is ~1–5 MB. The explicit per-field
// trimming inside saveProject covers the *known* carriers (mockupHistory,
// carouselSlides, batchResults, inputs.personalPhotos / brandLogos) — but several
// other image-bearing fields were never trimmed: inputs.referenceImage,
// inputs.referenceAd, inputs.offerAssets[], inputs.testimonialScreenshots[], and
// inputs.uploadedAssets[]. A project using any of those still overflowed the limit,
// which is why "Saving to cloud failed" kept recurring after the earlier fix. This
// pass catches every oversized payload regardless of field name, so the document
// can never overflow on an unanticipated field again.
//
// It deliberately spares legitimate long TEXT (buildPlan, conceptsText, tovText):
// natural-language text always contains whitespace, whereas base64 / data-URL
// payloads never do — so the whitespace test cleanly separates the two. Short
// Storage URLs (< threshold) are preserved untouched.
const HEAVY_STR_THRESHOLD = 5000;
function stripHeavyImageData(value: any): any {
    if (typeof value === "string") {
        if (value.startsWith("data:")) return "stored_externally";
        if (value.length > HEAVY_STR_THRESHOLD && !/\s/.test(value)) return "stored_externally";
        return value;
    }
    if (Array.isArray(value)) return value.map(stripHeavyImageData);
    if (value && typeof value === "object") {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) out[k] = stripHeavyImageData(v);
        return out;
    }
    return value;
}

// Persist a base64 render to Storage SERVER-SIDE (admin SDK bypasses Storage rules)
// and return a public URL. Used by client save paths that hold an in-memory base64
// image (e.g. favoriting a displayed render) but must never write to Storage from
// the browser. An http(s) URL is returned unchanged (idempotent).
export const uploadRenderImage = onCall({ region: "europe-west1", memory: "512MiB", cors: true }, async (request: CallableRequest<any>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
    const uid = request.auth.uid;
    const data = asObjectPayload(request.data);
    const imageBase64 = data.imageBase64;
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
        throw new HttpsError("invalid-argument", "imageBase64 required");
    }
    if (imageBase64.startsWith("http")) {
        return { storageUrl: imageBase64 };
    }
    if (!imageBase64.startsWith("data:")) {
        throw new HttpsError("invalid-argument", "imageBase64 must be a data: URL");
    }
    try {
        const { saveBase64ToStorage } = await import("./storageUpload.js");
        const storageUrl = await saveBase64ToStorage(imageBase64, `users/${uid}/renders`);
        return { storageUrl };
    } catch (err) {
        console.error(`uploadRenderImage failed for uid=${uid}:`, (err as { message?: string })?.message ?? err);
        throw new HttpsError("internal", "Could not persist render image.");
    }
});

export const saveProject = onCall({ region: "europe-west1" }, async (request: CallableRequest<any>) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
    const uid = request.auth.uid;

    // Reuse the file-level payload guard so a non-object request.data fails
    // with the same shape as the workspace callables.
    const data = asObjectPayload(request.data);
    const project = data.project;
    if (!project || typeof project !== "object" || !project.id) {
        throw new HttpsError("invalid-argument", "project.id required");
    }
    // Auto-save (default) vs an explicit manual save from the UI. The limit is never a hard
    // block; this only changes over-limit handling (auto-save evicts the oldest draft).
    const saveSource: "autosave" | "manual" = data.source === "manual" ? "manual" : "autosave";

    // Quota check, plan resolution, status latch read, and project write must
    // all happen inside ONE transaction (FR-006/FR-007/SC-005, Constitution
    // principle XI). Otherwise two parallel saves at cap-1 can both pass the
    // count check and both write, AND a concurrent plan downgrade between the
    // out-of-txn plan read and the txn could let the user slip past their
    // new lower cap.
    //
    // The whole transaction is wrapped so an unexpected, non-HttpsError failure —
    // a transient Firestore error, or a project document that exceeds Firestore's
    // 1 MiB limit (mockupHistory/carouselSlides can carry large data) — surfaces as
    // a controlled, logged error instead of an unhandled exception that crashes the
    // callable with a bare 500. Structured HttpsErrors (quota/plan) pass through
    // unchanged so the client still sees their specific reason codes.
    try {
    const result = await admin.firestore().runTransaction(async (txn) => {
        const projectRef = admin.firestore().doc(`users/${uid}/projects/${project.id}`);
        const userRef = admin.firestore().doc(`users/${uid}`);

        // All reads first (Firestore txn requirement). Existing project doc
        // gives us isNew + the prev status for the latch; user doc gives us
        // the canonical plan.
        const existingSnap = await txn.get(projectRef);
        const userSnap = await txn.get(userRef);

        const isNew = !existingSnap.exists;
        const prevStatus = (existingSnap.data() as { status?: "draft" | "rendered" | "published" } | undefined)?.status;

        // Resolve canonically: prefer billingState.plan; fall back to legacy
        // users.{uid}.plan; map "creator"→"pro" / "scaling"→"scale" (matches
        // billingState.ts:84-90); narrow to one of "none"|"starter"|"pro"|"scale".
        const userData = userSnap.data() ?? {};
        let rawPlan: string = userData.billingState?.plan ?? userData.plan ?? "none";
        if (rawPlan === "creator") rawPlan = "pro";
        else if (rawPlan === "scaling") rawPlan = "scale";
        const plan: "none" | "starter" | "pro" | "scale" =
            rawPlan === "starter" || rawPlan === "pro" || rawPlan === "scale" ? rawPlan : "none";

        const quota = await enforceProjectQuota(txn, uid, plan, isNew, saveSource);

        // Server-side latch is authoritative — never trust the client-supplied
        // project.status (it may be stale and would otherwise allow demotion).
        const newStatus = deriveStatus(prevStatus, project);

        // IMPORTANT: keep the `id` field on the persisted doc. getUserProjects
        // uses `.orderBy("id", "desc")` as the cursor tiebreaker — Firestore
        // would silently exclude documents missing the field from those queries,
        // breaking pagination.
        const cleanProject: Record<string, any> = {
            ...project,
            id: project.id,
            status: newStatus,
            userId: uid,
            updatedAt: Date.now(),
        };
        if (cleanProject.batchResults && cleanProject.batchResults.length > 0) {
            cleanProject.batchResults = cleanProject.batchResults.map((r: any) => ({
                ...r,
                url: r.url && r.url.length > 5000 ? null : r.url,
            }));
        }
        // Strip base64 image data from mockupHistory before persisting. Each entry
        // carries the full base64 data URL in `rawBase64` (and `url` itself can hold
        // base64 when the client's blob-URL conversion failed) — a single render is
        // ~1-5 MB, so a few entries blow past Firestore's 1 MiB document limit and
        // fail the write. The durable Firebase Storage `url` is kept; the heavy base64
        // is replaced with a placeholder. Mirrors the batchResults URL-trimming above.
        if (Array.isArray(cleanProject.mockupHistory) && cleanProject.mockupHistory.length > 0) {
            cleanProject.mockupHistory = cleanProject.mockupHistory.map((m: any) => {
                const trimmed: Record<string, any> = { ...m };
                if (trimmed.rawBase64 != null) trimmed.rawBase64 = "stored_externally";
                // A `url` longer than 5000 chars is a base64 data URL, not a Storage URL.
                if (typeof trimmed.url === "string" && trimmed.url.length > 5000) {
                    trimmed.url = "stored_externally";
                }
                return trimmed;
            });
        }
        // Same stripping for carouselSlides[].imageUrl — slide renders are the same size
        // as single renders and can blow past the 1 MiB limit on a 10-slide carousel.
        if (Array.isArray(cleanProject.carouselSlides) && cleanProject.carouselSlides.length > 0) {
            cleanProject.carouselSlides = cleanProject.carouselSlides.map((s: any) => {
                const trimmed: Record<string, any> = { ...s };
                if (typeof trimmed.imageUrl === "string" && trimmed.imageUrl.length > 5000) {
                    trimmed.imageUrl = "stored_externally";
                }
                if (typeof trimmed.rawBase64 === "string" && trimmed.rawBase64.length > 5000) {
                    trimmed.rawBase64 = "stored_externally";
                }
                return trimmed;
            });
        }
        // Heavy base64 arrays on inputs (user-uploaded photos / logos) can also blow
        // the doc limit. They are reference data — the render pipeline reads them at
        // generation time but they aren't needed once the project is rendered, and
        // the resize/reflow path uses the persisted output URLs (not inputs.personalPhotos).
        if (cleanProject.inputs && typeof cleanProject.inputs === "object") {
            const cleanedInputs: Record<string, any> = { ...cleanProject.inputs };
            if (Array.isArray(cleanedInputs.personalPhotos) && cleanedInputs.personalPhotos.length > 0) {
                cleanedInputs.personalPhotos = cleanedInputs.personalPhotos.map((p: any) =>
                    typeof p === "string" && p.length > 5000 ? "stored_externally" : p
                );
            }
            if (Array.isArray(cleanedInputs.brandLogos) && cleanedInputs.brandLogos.length > 0) {
                cleanedInputs.brandLogos = cleanedInputs.brandLogos.map((p: any) =>
                    typeof p === "string" && p.length > 5000 ? "stored_externally" : p
                );
            }
            cleanProject.inputs = cleanedInputs;
        }
        // Final safety net: recursively strip ANY remaining base64/data-URL payload
        // regardless of which field carries it (referenceImage, referenceAd,
        // offerAssets[], testimonialScreenshots[], uploadedAssets[], …). This is the
        // root-cause fix for the recurring "Saving to cloud failed" error.
        const persistedProject = stripHeavyImageData(cleanProject);

        // Diagnostic: measure the actual persisted doc size. Firestore's hard limit is
        // 1,048,576 bytes; warn well before it so any future overflow source is visible
        // in logs instead of surfacing as an opaque write rejection.
        const docBytes = Buffer.byteLength(JSON.stringify(persistedProject), "utf8");
        if (docBytes > 900_000) {
            console.warn(
                `saveProject: persisted doc for uid=${uid} project=${project.id} is ${docBytes} bytes ` +
                `after stripping — approaching Firestore's 1 MiB limit.`,
            );
        }

        // Auto-save over the cap: evict the oldest draft (chosen by the quota resolver) so the
        // project count stays within the limit without ever blocking the save. Guard against
        // evicting the project currently being written.
        if (quota.evictId && quota.evictId !== project.id) {
            txn.delete(admin.firestore().doc(`users/${uid}/projects/${quota.evictId}`));
            console.info(`phase13 ▸ quota-evict uid=${uid} evicted=${quota.evictId} for=${project.id}`);
        }

        txn.set(projectRef, persistedProject, { merge: true });
        return { status: newStatus, overLimit: quota.overLimit };
    });

    return { status: result.status, overLimit: result.overLimit };
    } catch (err) {
        // Preserve structured failures (quota exceeded, plan-gate, invalid-argument).
        if (err instanceof HttpsError) throw err;
        console.error(
            `saveProject failed for uid=${uid} project=${project.id}: ` +
            `code=${(err as { code?: string | number })?.code ?? "unknown"} ` +
            `message=${(err as { message?: string })?.message ?? String(err)}`,
            err,
        );
        throw new HttpsError("internal", "Could not save project. Please try again.", { reason: "save_failed" });
    }
});

export { purgeExpiredWorkspaces };