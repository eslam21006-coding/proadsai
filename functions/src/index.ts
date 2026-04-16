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
// DEPRECATED: Stripe import — only used by deprecated functions kept for reference.
// Active code uses Paddle via @paddle/paddle-node-sdk.
import Stripe from "stripe";
import * as crypto from "crypto";
import {
    resolveEntitlement, checkFeature, checkCarouselSlides,
    checkAspectRatio, resolveCreditOwner,
    PLAN_CREDITS, TRIAL_CREDITS,
    type GatedFeature, type ResolvedEntitlement,
} from "./entitlements.js";
import { validateSelector } from "./selectorLimits.js";
import { writeBillingState } from "./billing/billingState.js";
import { paddleGetSubscription, paddleCancelSubscription, paddleReactivateSubscription, paddleChangePlan } from "./paddle/paddleSubscriptions.js";
import { paddleCreateTopupCheckout } from "./paddle/paddleCheckout.js";
import { paddleCreatePortalSession } from "./paddle/paddlePortal.js";
import { handlePaddleWebhook } from "./billing/paddleWebhook.js";
import { createPaddleClient } from "./paddle/paddleClient.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1. INITIALIZE APP (THE FIX IS HERE)
// ═══════════════════════════════════════════════════════════════════════════
admin.initializeApp({
    projectId: "proadsai-saas", // <--- THIS LINE FIXES THE "5 NOT_FOUND" ERROR
    storageBucket: "proadsai-saas.firebasestorage.app"
});

const db = admin.firestore();
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const ghlWebhookSecret = defineSecret("GHL_WEBHOOK_SECRET");
// DEPRECATED: only used by deprecated Stripe functions kept for reference
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const metaAppId = defineSecret("META_APP_ID");
const ghlTeamInviteUrl = defineSecret("GHL_TEAM_INVITE_WEBHOOK_URL");
const metaAppSecret = defineSecret("META_APP_SECRET");
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const falApiKey = defineSecret("FAL_API_KEY");

// ─── PADDLE SECRETS ──────────────────────────────────────────────────────────
const paddleApiKey = defineSecret("PADDLE_API_KEY");
const paddleWebhookSecret = defineSecret("PADDLE_WEBHOOK_SECRET");
const ghlPaddleSyncUrl = defineSecret("GHL_PADDLE_SYNC_WEBHOOK_URL");
const ghlPaddleFailedUrl = defineSecret("GHL_PADDLE_FAILED_WEBHOOK_URL");

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const PLAN_MAP: Record<string, { plan: string; credits: number; isTrial?: boolean }> = {
    // Simple names (for GHL automations)
    'starter': { plan: 'starter', credits: 500 },
    'creator': { plan: 'creator', credits: 1000 },
    'pro': { plan: 'pro', credits: 2000 },
    'scaling': { plan: 'scaling', credits: 5000 },
    // Trial plans — full features, 50 credits
    'starter_trial': { plan: 'starter', credits: 50, isTrial: true },
    'creator_trial': { plan: 'creator', credits: 50, isTrial: true },
    'pro_trial': { plan: 'pro', credits: 50, isTrial: true },
    'scaling_trial': { plan: 'scaling', credits: 50, isTrial: true },
    // Full names
    'starter_monthly': { plan: 'starter', credits: 500 },
    'starter_annual': { plan: 'starter', credits: 500 },
    'creator_monthly': { plan: 'creator', credits: 1000 },
    'creator_annual': { plan: 'creator', credits: 1000 },
    'pro_monthly': { plan: 'pro', credits: 2000 },
    'pro_annual': { plan: 'pro', credits: 2000 },
    'scaling_monthly': { plan: 'scaling', credits: 5000 },
    'scaling_annual': { plan: 'scaling', credits: 5000 },
    // Top-ups
    'topup_100': { plan: 'keep_current', credits: 100 },
    'topup_300': { plan: 'keep_current', credits: 300 },
    'topup_800': { plan: 'keep_current', credits: 800 },
};

// ─── PADDLE PRICE → PLAN MAPPING ──────────────────────────────────────────
const PADDLE_PRICE_TO_PLAN: Record<string, { plan: string; credits: number }> = {
    "pri_01knz7v1rr3eehbe12s214ba0t": { plan: "starter", credits: 500 },
    "pri_01knz7wz5cpvv2fx6334wv822e": { plan: "starter", credits: 500 },
    "pri_01knz7xtmrbsfsrzfc1dy1zser": { plan: "creator", credits: 1000 },
    "pri_01knz7ydr6zbpdhatr8yarwjnd": { plan: "creator", credits: 1000 },
    "pri_01knz7zpgfbek52zm0n012jqn0": { plan: "pro", credits: 2000 },
    "pri_01knz82jwdxjph1mpny39jnxqg": { plan: "pro", credits: 2000 },
    "pri_01knz80jr5m4ey3wrskpvgbrh4": { plan: "scaling", credits: 5000 },
    "pri_01knz81pexff8h8wbwq44cy0j3": { plan: "scaling", credits: 5000 },
};

const PADDLE_TOPUP_PRICES: Record<string, { priceId: string; credits: number }> = {
    topup_100: { priceId: "pri_01knz87qc1ezrb84gtffpmtjdq", credits: 100 },
    topup_300: { priceId: "pri_01knz898vrhxyge632scazjn2z", credits: 300 },
    topup_800: { priceId: "pri_01knz8a0s0f2je5rgrk2y62b0n", credits: 800 },
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

// FR-018: Write-through to `dormantPlan` snapshots when a subscription event fires.
// Identity field is `stripeCustomerId` on this (pre-Paddle) branch. When 009 lands,
// rename to `paddleCustomerId` / `paddleSubscriptionId` in lockstep with the billing rename.
async function writeThroughDormantPlan(stripeCustomerId: string, fields: Record<string, any>): Promise<void> {
    if (!stripeCustomerId) return;
    try {
        const dormantSnap = await db.collection("users")
            .where("dormantPlan.stripeCustomerId", "==", stripeCustomerId)
            .limit(10)
            .get();
        if (dormantSnap.empty) return;
        for (const doc of dormantSnap.docs) {
            const dp = doc.data()?.dormantPlan;
            if (!dp) continue;
            const updates: Record<string, any> = {};
            for (const [key, value] of Object.entries(fields)) {
                updates[`dormantPlan.${key}`] = value;
            }
            await doc.ref.update(updates);
            console.log(`🔄 dormantPlan write-through: ${doc.id} updated with ${Object.keys(fields).join(', ')}`);
        }
    } catch (err) {
        console.warn("⚠️ dormantPlan write-through failed (non-blocking):", err);
    }
}

// ─── MODEL CONSTANTS (single source of truth) ───────────────────────────
const CREATIVE_MODEL_PRO = "gemini-3.1-pro-preview"; // First generation
const CREATIVE_MODEL_LITE = "gemini-3.1-flash-lite-preview"; // Regenerations
const LOGIC_MODEL = "gemini-2.5-flash-lite";
const VISUAL_MODEL = "gemini-3.1-flash-image-preview";

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
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection("users").doc(creditOwnerUid);
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
// 3. THE GHL PAYMENT WEBHOOK (The "Cash Register")
// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED: replaced by paddleWebhook + notifyGHL
const ghlpaymentwebhook = onRequest({
    region: "europe-west1",
    cors: true,
    secrets: [ghlWebhookSecret, stripeSecretKey],
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
    const rawCredits = data.credits || customData.credits || 0;

    if (!email) {
        res.status(400).send({ status: "FAIL", message: "Missing email" });
        return;
    }

    // Map GHL Product to Credits
    let finalCredits = typeof rawCredits === 'string' ? parseInt(rawCredits) || 0 : rawCredits;
    let finalPlan = data.plan || customData.plan || 'starter';
    let isTopup = false;
    let isTrial = false;

    // Check if GHL sends trial flag directly
    const rawIsTrial = data.is_trial || customData.is_trial || data.isTrial || customData.isTrial || false;
    if (rawIsTrial === true || rawIsTrial === 'true' || rawIsTrial === '1') {
        isTrial = true;
    }

    if (productId && PLAN_MAP[productId]) {
        const mapped = PLAN_MAP[productId];
        finalCredits = mapped.credits;
        if (mapped.isTrial) isTrial = true;
        if (mapped.plan === 'keep_current') {
            isTopup = true;
        } else {
            finalPlan = mapped.plan;
        }
    }
    if (finalCredits === 0) finalCredits = isTrial ? 50 : 500; // Trial=50, otherwise fallback to starter

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
            const userRef = db.collection("users").doc(existingUser.uid);

            if (isTopup) {
                const topupData: Record<string, any> = {
                    credits: admin.firestore.FieldValue.increment(finalCredits),
                    lastTopup: admin.firestore.FieldValue.serverTimestamp(),
                };
                if (stripeCustomerId) topupData.stripeCustomerId = stripeCustomerId;
                await userRef.update(topupData);
                console.log(`Top-up: +${finalCredits} credits for ${normalizedEmail}`);
                await writeBillingState(existingUser.uid, db);
            } else {
                await userRef.set({
                    plan: finalPlan,
                    credits: finalCredits,
                    isTrial: isTrial,
                    billingStatus: 'active',
                    planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ghlContactId: data.contact_id || "",
                    ...(stripeCustomerId ? { stripeCustomerId } : {}),
                }, { merge: true });
                console.log(`Plan set: ${normalizedEmail} → ${finalPlan}${isTrial ? ' (trial)' : ''} (${finalCredits} credits)${stripeCustomerId ? ` [Stripe: ${stripeCustomerId}]` : ''}`);
                await writeBillingState(existingUser.uid, db);
            }
        } else {
            // ═══ User hasn't signed into app yet → save to "pending_plans" ═══
            // App.tsx checks this collection on first sign-in
            await db.collection("pending_plans").doc(normalizedEmail).set({
                plan: isTopup ? "none" : finalPlan,
                credits: finalCredits,
                isTopup: isTopup,
                isTrial: isTrial,
                ghlContactId: data.contact_id || "",
                ...(stripeCustomerId ? { stripeCustomerId } : {}),
                purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Pending plan saved: ${normalizedEmail} → plan:${finalPlan}, credits:${finalCredits}, product_id:${productId}`);
        }

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
        starter: 500, creator: 1000, pro: 2000, scaling: 5000
    };

    // ═══ RESET PAID USERS ═══
    const usersSnap = await db.collection('users')
        .where('plan', 'in', ['starter', 'creator', 'pro', 'scaling'])
        .get();

    if (!usersSnap.empty) {
        const batchSize = 500;
        const docs = usersSnap.docs;

        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db.batch();
            const chunk = docs.slice(i, i + batchSize);

            for (const userDoc of chunk) {
                const data = userDoc.data();
                const plan = data.plan;
                // Skip team members — they don't have their own credits
                if (data.isTeamMember) continue;
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
                if (!data.isTeamMember && PLAN_LIMITS[data.plan]) {
                    await writeBillingState(userDoc.id, db).catch((e: any) =>
                        console.warn(`⚠️ writeBillingState failed for ${userDoc.id}:`, e.message)
                    );
                    // T030b: refresh dormantPlan credits for users whose dormant subscription targets this plan
                    if (data.stripeCustomerId) {
                        await writeThroughDormantPlan(data.stripeCustomerId, {
                            credits: PLAN_LIMITS[data.plan],
                            nextResetDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
                        }).catch((e: any) =>
                            console.warn(`⚠️ dormantPlan monthly reset failed for ${userDoc.id}:`, e.message)
                        );
                    }
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
// DEPRECATED: replaced by paddleWebhook + notifyGHLFailed
const ghlCancellationWebhook = onRequest({
    region: "europe-west1",
    cors: true,
    secrets: [ghlWebhookSecret],
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

    const { email } = req.body;
    if (!email) {
        res.status(400).send({ status: "FAIL", message: "Missing email" });
        return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log(`❌ FINAL cancellation received for: ${normalizedEmail}`);

    try {
        let existingUser: admin.auth.UserRecord | null = null;
        try {
            existingUser = await admin.auth().getUserByEmail(normalizedEmail);
        } catch {
            // User not found in Firebase Auth
        }

        if (existingUser) {
            const userRef = db.collection("users").doc(existingUser.uid);
            await userRef.update({
                billingStatus: 'cancelled',
                plan: "none",
                credits: 0,
                isTrial: false,
                cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Cancelled ${normalizedEmail} → billingStatus: cancelled, plan: none.`);
            await writeBillingState(existingUser.uid, db);
        } else {
            await db.collection("pending_plans").doc(normalizedEmail).delete();
            console.log(`Removed pending plan for ${normalizedEmail}`);
        }

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
// DEPRECATED: replaced by paddleWebhook + notifyGHLFailed
const ghlPaymentFailedWebhook = onRequest({
    region: "europe-west1",
    cors: true,
    secrets: [ghlWebhookSecret],
}, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    const secret = req.headers['x-ghl-secret'];
    if (secret !== ghlWebhookSecret.value()) { res.status(401).send('Unauthorized'); return; }

    const { email } = req.body;
    if (!email) { res.status(400).send({ status: "FAIL", message: "Missing email" }); return; }

    const normalizedEmail = email.toLowerCase().trim();
    console.log(`⚠️ Payment failed for: ${normalizedEmail}`);

    try {
        let existingUser: admin.auth.UserRecord | null = null;
        try { existingUser = await admin.auth().getUserByEmail(normalizedEmail); } catch { /* not found */ }

        if (existingUser) {
            const gracePeriodEndsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
            await db.collection("users").doc(existingUser.uid).update({
                billingStatus: 'past_due',
                billingIssueAt: admin.firestore.FieldValue.serverTimestamp(),
                billingIssueType: 'payment_failed',
                gracePeriodEndsAt: admin.firestore.Timestamp.fromDate(gracePeriodEndsAt),
            });
            console.log(`Set ${normalizedEmail} → billingStatus: past_due, grace until ${gracePeriodEndsAt.toISOString()}`);
            await writeBillingState(existingUser.uid, db);
        }

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
    secrets: [ghlWebhookSecret],
}, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    const secret = req.headers['x-ghl-secret'];
    if (secret !== ghlWebhookSecret.value()) { res.status(401).send('Unauthorized'); return; }

    const { email } = req.body;
    if (!email) { res.status(400).send({ status: "FAIL", message: "Missing email" }); return; }

    const normalizedEmail = email.toLowerCase().trim();
    console.log(`✅ Payment recovered for: ${normalizedEmail}`);

    try {
        let existingUser: admin.auth.UserRecord | null = null;
        try { existingUser = await admin.auth().getUserByEmail(normalizedEmail); } catch { /* not found */ }

        if (existingUser) {
            await db.collection("users").doc(existingUser.uid).update({
                billingStatus: 'active',
                billingIssueAt: admin.firestore.FieldValue.delete(),
                billingIssueType: admin.firestore.FieldValue.delete(),
                gracePeriodEndsAt: admin.firestore.FieldValue.delete(),
                lastPaymentRecoveredAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Restored ${normalizedEmail} → billingStatus: active`);
            await writeBillingState(existingUser.uid, db);
        }

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
    const entitlement = await resolveEntitlement(uid);
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
    const creditOwnerRef = db.collection("users").doc(entitlement.creditOwnerUid);
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
        await db.collection("users").doc(entitlement.creditOwnerUid).update({
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
// Paddle equivalents are registered below. Migrate frontend to Paddle callables,
// then remove this entire section.
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
// DEPRECATED: replaced by Paddle management URLs
const createStripePortalSession = onCall({
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
    const userDoc = await db.collection("users").doc(uid).get();
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
                    await db.collection("users").doc(uid).update({ stripeCustomerId });
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
// DEPRECATED: Stripe backfill — no longer needed with Paddle migration.
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

    const usersSnap = await db.collection("users").get();
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

// DEPRECATED: replaced by createPaddleTopUp
const createTopupCheckout = onCall({
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
    const userDoc = await db.collection("users").doc(uid).get();
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
        await db.collection("users").doc(uid).update({ stripeCustomerId: customerId });
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
const ghlCancelWebhookUrl = defineSecret("GHL_CANCEL_WEBHOOK_URL");

// DEPRECATED: replaced by paddleWebhook
const stripeWebhook = onRequest({
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
            const userRef = db.collection("users").doc(uid);
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
                await writeBillingState(uid, db);
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
                const usersSnap = await db.collection("users")
                    .where("stripeCustomerId", "==", stripeCustomerId)
                    .limit(1).get();
                if (!usersSnap.empty) {
                    const userDoc = usersSnap.docs[0];
                    await userDoc.ref.update({
                        billingStatus: 'past_due',
                        gracePeriodEndsAt: graceEnd,
                    });
                    await writeBillingState(userDoc.id, db);
                    console.log(`⚠️ Subscription past_due: ${userDoc.id}`);
                    await writeThroughDormantPlan(stripeCustomerId, { billingStatus: 'past_due' });
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
            'price_1T4Ul84MIh5WD4bv1B1IjpfP': { plan: 'starter', credits: 500 },
            'price_1T4UkA4MIh5WD4bvFgdrP4Ck': { plan: 'creator', credits: 1000 },
            'price_1T4UkA4MIh5WD4bvc55rCOVO': { plan: 'pro', credits: 2000 },
            'price_1T4Uj84MIh5WD4bv8VmCYHMW': { plan: 'scaling', credits: 5000 },
            // Annual prices
            'price_1T4UkA4MIh5WD4bvQXOGG7xF': { plan: 'starter', credits: 500 },
            'price_1T4UkA4MIh5WD4bvjHlrFwtT': { plan: 'creator', credits: 1000 },
            'price_1T4Uk94MIh5WD4bvBY7366k9': { plan: 'pro', credits: 2000 },
            'price_1T4Uj84MIh5WD4bvL656TLHR': { plan: 'scaling', credits: 5000 },
        };

        const planInfo = STRIPE_PRICE_TO_PLAN[priceId];
        if (!planInfo) {
            console.log(`Unknown price ID from portal: ${priceId}, skipping plan update.`);
            res.status(200).send('OK');
            return;
        }

        try {
            // Find user by stripeCustomerId
            const usersSnap = await db.collection("users")
                .where("stripeCustomerId", "==", stripeCustomerId)
                .limit(1)
                .get();

            if (usersSnap.empty) {
                const stripe = new Stripe(stripeSecretKey.value());
                const customer = await stripe.customers.retrieve(stripeCustomerId) as any;
                if (customer.email) {
                    const userRecord = await admin.auth().getUserByEmail(customer.email.toLowerCase().trim());
                    await db.collection("users").doc(userRecord.uid).update({
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
                    await writeBillingState(userRecord.uid, db);
                    await writeThroughDormantPlan(stripeCustomerId, { plan: planInfo.plan, credits: planInfo.credits, billingStatus: 'active' });
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
                await writeBillingState(userDoc.id, db);
                await writeThroughDormantPlan(stripeCustomerId, { plan: planInfo.plan, credits: planInfo.credits, billingStatus: 'active' });
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
            const usersSnap = await db.collection("users")
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
                await writeBillingState(userDoc.id, db);
                await writeThroughDormantPlan(stripeCustomerId, { plan: 'none', credits: 0, billingStatus: 'cancelled' });
            } else {
                // Fallback via email
                const stripe = new Stripe(stripeSecretKey.value());
                const customer = await stripe.customers.retrieve(stripeCustomerId) as any;
                if (customer.email) {
                    try {
                        const userRecord = await admin.auth().getUserByEmail(customer.email.toLowerCase().trim());
                        await db.collection("users").doc(userRecord.uid).update({
                            billingStatus: 'cancelled',
                            plan: 'none',
                            credits: 0,
                            isTrial: false,
                            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                            planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            planSource: 'stripe_cancellation',
                        });
                        console.log(`✅ Subscription cancelled (via email): ${customer.email} → none`);
                        await writeBillingState(userRecord.uid, db);
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
        const callerDoc = await db.collection("users").doc(callerId).get();
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
    const entitlement = await resolveEntitlement(callerId);
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

    const newBalance = await db.runTransaction(async (tx) => {
        const userRef = db.collection("users").doc(targetUid);
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
            const txEntitlement = await resolveEntitlement(callerId);
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

    await writeBillingState(targetUid, db);
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
        const callerDoc = await db.collection("users").doc(callerId).get();
        if (callerDoc.data()?.isTeamMember && callerDoc.data()?.teamOwnerUid === onBehalfOf) {
            targetUid = onBehalfOf;
        }
    }

    const newBalance = await db.runTransaction(async (tx) => {
        const userRef = db.collection("users").doc(targetUid);
        const snap = await tx.get(userRef);
        if (!snap.exists) throw new HttpsError("not-found", "User not found.");

        const current = snap.data()?.credits ?? 0;
        const after = current + cost;
        tx.update(userRef, { credits: after });
        return after;
    });

    await writeBillingState(targetUid, db);
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

    const result = await db.runTransaction(async (tx) => {
        const userRef = db.collection("users").doc(userId);
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
        await writeBillingState(userId, db);
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
    const userDoc = await db.collection("users").doc(uid).get();
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
        await db.collection("users").doc(uid).update({ stripeCustomerId: customerId });
        return customerId;
    }

    throw new HttpsError("not-found", "No Stripe customer found. If you subscribed recently, please contact support.");
}

// DEPRECATED: replaced by Paddle management URLs — getSubscription uses Stripe
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

// DEPRECATED: replaced by Paddle cancel URL — cancelSubscription uses Stripe
export const cancelSubscription = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey, ghlCancelWebhookUrl],
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
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data() || {};

    // 3. Save cancellation data to Firestore
    await db.collection("users").doc(uid).update({
        cancelAtPeriodEnd: true,
        billingStatus: 'cancelling',
        cancelAt: admin.firestore.Timestamp.fromDate(new Date(updated.current_period_end * 1000)),
        cancellationReason: reason || '',
        cancellationFeedback: feedback || '',
        cancellationDate: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. Notify GHL so CRM automations fire (emails, tags, pipeline)
    const ghlUrl = ghlCancelWebhookUrl.value();
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

    await writeBillingState(uid, db);

    return {
        success: true,
        cancelAt: updated.current_period_end,
        currentPeriodEnd: updated.current_period_end,
    };
});

// DEPRECATED: replaced by Paddle reactivation URL — reactivateSubscription uses Stripe
export const reactivateSubscription = onCall({
    region: "europe-west1",
    secrets: [stripeSecretKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;

    const callerDoc = await db.collection("users").doc(uid).get();
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

    await db.collection("users").doc(uid).update({
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
    await writeBillingState(uid, db);
    return { success: true };
});

// DEPRECATED: replaced by Paddle billing — applyRetentionDiscount uses Stripe coupons
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
    const userDoc = await db.collection("users").doc(uid).get();
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

    await db.collection("users").doc(uid).update({
        retentionCouponUsed: true,
        retentionCouponId: couponId,
        cancelAtPeriodEnd: false,
        billingStatus: 'active',
        cancelAt: admin.firestore.FieldValue.delete(),
        cancellationReason: admin.firestore.FieldValue.delete(),
        cancellationFeedback: admin.firestore.FieldValue.delete(),
        cancellationDate: admin.firestore.FieldValue.delete(),
    });

    await writeBillingState(uid, db);
    console.log(`💰 Retention coupon applied: ${couponId} for uid=${uid}`);
    return { success: true, couponApplied: couponId };
});

// DEPRECATED: replaced by Paddle invoice delivery — getInvoices uses Stripe
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

// DEPRECATED: replaced by Paddle — retryInvoice uses Stripe
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

// DEPRECATED: replaced by Paddle — createSetupIntent uses Stripe
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

// DEPRECATED: replaced by Paddle management URLs — updatePaymentMethod uses Stripe
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
    await db.collection("users").doc(uid).update({
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

// DEPRECATED: replaced by createPaddleCheckout — changePlan uses Stripe
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
    await db.collection("users").doc(uid).update({
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
// PADDLE BILLING (active)
// ═══════════════════════════════════════════════════════════════════════════

export const paddleGetSub = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey],
    cors: true,
}, async (request: CallableRequest) => {
    return paddleGetSubscription(request, paddleApiKey.value(), db);
});

export const paddleCancelSub = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey, ghlCancelWebhookUrl],
    cors: true,
}, async (request: CallableRequest) => {
    return paddleCancelSubscription(request, paddleApiKey.value(), ghlCancelWebhookUrl.value(), db);
});

export const paddleReactivateSub = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey],
    cors: true,
}, async (request: CallableRequest) => {
    return paddleReactivateSubscription(request, paddleApiKey.value(), db);
});

export const paddleChangePlanFn = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey],
    cors: true,
}, async (request: CallableRequest) => {
    return paddleChangePlan(request, paddleApiKey.value(), db);
});

export const paddleTopupCheckout = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey],
    cors: true,
}, async (request: CallableRequest) => {
    return paddleCreateTopupCheckout(request, paddleApiKey.value(), db);
});

export const paddlePortalSession = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey],
    cors: true,
}, async (request: CallableRequest) => {
    return paddleCreatePortalSession(request, paddleApiKey.value(), db);
});

export const createPaddleCheckout = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const email = request.auth.token?.email;
    const priceId = request.data?.priceId as string;
    if (!priceId) throw new HttpsError("invalid-argument", "Missing priceId.");

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (userData?.isTeamMember) {
        throw new HttpsError("failed-precondition", "Team members cannot subscribe directly.");
    }

    const paddle = createPaddleClient(paddleApiKey.value());

    let customerId = userData?.paddleCustomerId;
    if (!customerId) {
        try {
            const existing = paddle.customers.list({ email: [email?.toLowerCase().trim() || ""], perPage: 1 });
            const items = await existing.next();
            if (items && items.length > 0) {
                customerId = items[0].id;
            } else {
                const newCustomer = await paddle.customers.create({
                    email: email?.toLowerCase().trim() ?? "",
                    customData: { firebaseUid: uid },
                });
                customerId = newCustomer.id;
            }
            await db.collection("users").doc(uid).update({ paddleCustomerId: customerId });
        } catch (err: any) {
            console.error("Failed to create/find Paddle customer:", err.message);
            throw new HttpsError("internal", "Failed to set up billing customer.");
        }
    }

    try {
        const tx = await paddle.transactions.create({
            customerId,
            items: [{ priceId, quantity: 1 }],
            customData: { firebaseUid: uid },
        });
        return {
            checkoutUrl: tx.checkout?.url || null,
            transactionId: tx.id,
        };
    } catch (err: any) {
        console.error("Paddle checkout error:", err.message);
        throw new HttpsError("internal", "Failed to create checkout: " + err.message);
    }
});

export const createPaddleTopUp = onCall({
    region: "europe-west1",
    secrets: [paddleApiKey],
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const email = request.auth.token?.email;
    const packId = request.data?.packId as string;
    if (!packId) throw new HttpsError("invalid-argument", "Missing packId.");

    const pack = PADDLE_TOPUP_PRICES[packId];
    if (!pack) throw new HttpsError("invalid-argument", `Unknown top-up pack: ${packId}`);

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (userData?.isTeamMember) {
        throw new HttpsError("failed-precondition", "Team members cannot purchase top-ups directly.");
    }
    if (userData?.billingStatus === "past_due") {
        throw new HttpsError("failed-precondition", "Resolve your payment issue before purchasing credits.");
    }

    const paddle = createPaddleClient(paddleApiKey.value());

    let customerId = userData?.paddleCustomerId;
    if (!customerId) {
        try {
            const existing = paddle.customers.list({ email: [email?.toLowerCase().trim() || ""], perPage: 1 });
            const items = await existing.next();
            if (items && items.length > 0) {
                customerId = items[0].id;
            } else {
                const newCustomer = await paddle.customers.create({
                    email: email?.toLowerCase().trim() ?? "",
                    customData: { firebaseUid: uid },
                });
                customerId = newCustomer.id;
            }
            await db.collection("users").doc(uid).update({ paddleCustomerId: customerId });
        } catch (err: any) {
            console.error("Failed to create/find Paddle customer:", err.message);
            throw new HttpsError("internal", "Failed to set up billing customer.");
        }
    }

    try {
        const tx = await paddle.transactions.create({
            customerId,
            items: [{ priceId: pack.priceId, quantity: 1 }],
            customData: { firebaseUid: uid, isTopUp: true, creditAmount: pack.credits },
        });
        return {
            checkoutUrl: tx.checkout?.url || null,
            transactionId: tx.id,
        };
    } catch (err: any) {
        console.error("Paddle top-up checkout error:", err.message);
        throw new HttpsError("internal", "Failed to create top-up checkout: " + err.message);
    }
});

export const paddleWebhook = onRequest({
    region: "europe-west1",
    secrets: [paddleApiKey, paddleWebhookSecret, ghlPaddleSyncUrl, ghlPaddleFailedUrl],
    cors: true,
}, async (req, res) => {
    await handlePaddleWebhook(req, res, {
        db,
        paddleApiKey: paddleApiKey.value(),
        webhookSecret: paddleWebhookSecret.value(),
        ghlSyncUrl: ghlPaddleSyncUrl.value(),
        ghlFailedUrl: ghlPaddleFailedUrl.value(),
        priceToPlan: PADDLE_PRICE_TO_PLAN,
        topupPrices: PADDLE_TOPUP_PRICES,
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT: Create Team Member
// ═══════════════════════════════════════════════════════════════════════════
const PLAN_TEAM_LIMITS: Record<string, number> = {
    none: 0, starter: 1, creator: 1, pro: 3, scaling: 10,
};

// ═══════════════════════════════════════════════════════════════════════════
// TEAM INVITE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════
// Collection: team_invites
// Statuses: pending → sent → accepted | failed | revoked | expired
// Final membership created only on acceptance/claim.
// ═══════════════════════════════════════════════════════════════════════════

const INVITE_EXPIRY_DAYS = 7;
const OPEN_INVITE_STATUSES = ['pending', 'sent', 'failed'];

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
    const teamSnap = await db.collection("users").doc(ownerUid).collection("team").get();
    const activeMembers = teamSnap.size;

    // Open invites (pending/sent/failed)
    const inviteSnap = await db.collection("team_invites")
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
    const ownerDoc = await db.collection("users").doc(ownerUid).get();
    const ownerData = ownerDoc.data();
    if (!ownerData) throw new HttpsError("not-found", "Owner account not found.");

    const ownerPlan = ownerData.plan || "none";
    const maxMembers = PLAN_TEAM_LIMITS[ownerPlan] ?? 0;
    if (maxMembers === 0) throw new HttpsError("permission-denied", "Your plan does not support team members.");

    // Prevent inviting yourself
    const ownerRecord = await auth.getUser(ownerUid);
    if (ownerRecord.email?.toLowerCase() === normalizedEmail) throw new HttpsError("invalid-argument", "You cannot invite yourself.");

    // Seat limit including open invites
    if (maxMembers !== -1) {
        const reserved = await countReservedSeats(ownerUid);
        if (reserved >= maxMembers) {
            throw new HttpsError("resource-exhausted", `Your ${ownerPlan} plan allows ${maxMembers} seat(s). ${reserved} already reserved (active + pending invites). Upgrade for more.`);
        }
    }

    // Check if already an active team member of THIS owner
    const existingMember = await db.collection("users").doc(ownerUid).collection("team")
        .where("email", "==", normalizedEmail).get();
    if (!existingMember.empty) throw new HttpsError("already-exists", "This person is already on your team.");

    // Check if already an active team member of ANY other owner (one-team-per-user model)
    const existingMembership = await db.collection("teamMemberships").doc(normalizedEmail).get();
    if (existingMembership.exists) {
        const mData = existingMembership.data();
        if (mData && mData.ownerUid !== ownerUid) {
            throw new HttpsError("already-exists", "This person is already a member of another team.");
        }
    }

    // Dedupe: check for existing open invite
    const existingInvites = await db.collection("team_invites")
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
        inviteRef = db.collection("team_invites").doc();
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

    const inviteRef = db.collection("team_invites").doc(inviteId);
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

    const inviteRef = db.collection("team_invites").doc(inviteId);
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

// ─── DECLINE INVITE ────────────────────────────────────────────────────────
export const declineTeamInvite = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const callerUid = request.auth.uid;
    const callerEmail = request.auth.token.email?.toLowerCase().trim();
    if (!callerEmail) throw new HttpsError("failed-precondition", "No email on account.");

    const { inviteId } = request.data;
    if (!inviteId) throw new HttpsError("invalid-argument", "inviteId required.");

    const inviteRef = db.collection("team_invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) throw new HttpsError("not-found", "Invite not found.");

    const invite = inviteSnap.data() as TeamInvite;

    if (invite.inviteeEmailNormalized !== callerEmail) {
        throw new HttpsError("permission-denied", "This invite is not for your email address.");
    }
    if (invite.status !== 'pending' && invite.status !== 'sent') {
        throw new HttpsError("failed-precondition", `Cannot decline invite with status: ${invite.status}`);
    }

    await inviteRef.update({
        status: 'declined',
        declinedAt: Date.now(),
        updatedAt: Date.now(),
    });

    console.log(`👥 Invite declined: ${inviteId} by ${callerEmail}`);
    return { success: true };
});

// ─── GET INVITE DETAILS (unauthenticated — for /join page) ──────────────
export const getInviteDetails = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    // ─── IP-based rate limiting: 10 req/min/IP ───
    const callerIp = request.rawRequest?.ip || "unknown";
    const nowMs = Date.now();
    const minuteKey = new Date(nowMs).toISOString().slice(0, 16);
    const rateRef = db.collection("rateLimits").doc(`${callerIp}_${minuteKey}`);
    try {
        const rateSnap = await rateRef.get();
        const currentCount = (rateSnap.exists ? (rateSnap.data()?.count || 0) : 0) as number;
        if (currentCount >= 10) {
            throw new HttpsError("resource-exhausted", "Too many requests. Try again shortly.");
        }
        await rateRef.set({ count: currentCount + 1, ip: callerIp, minute: minuteKey }, { merge: true });
    } catch (e: any) {
        if (e.code === "resource-exhausted") throw e;
        // Non-blocking: if rate limit write fails, proceed
        console.warn("⚠️ Rate limit check failed (non-blocking):", e.message);
    }

    const { inviteId } = request.data;
    if (!inviteId || typeof inviteId !== "string") {
        return { success: false, status: "not_found", message: "Invite not found" };
    }

    const inviteSnap = await db.collection("team_invites").doc(inviteId).get();
    if (!inviteSnap.exists) {
        return { success: false, status: "not_found", message: "Invite not found" };
    }

    const invite = inviteSnap.data() as TeamInvite;

    if (invite.expiresAt < Date.now()) {
        return { success: false, status: "expired", message: "This invite has expired" };
    }
    if (invite.status === "revoked") {
        return { success: false, status: "revoked", message: "This invite is no longer valid" };
    }
    if (invite.status === "accepted") {
        return { success: false, status: "accepted", message: "This invite has already been claimed" };
    }
    if (!["pending", "sent"].includes(invite.status)) {
        return { success: false, status: "not_found", message: "Invite not found" };
    }

    return {
        success: true,
        ownerName: invite.ownerName,
        inviteeEmail: invite.inviteeEmail,
        inviteeName: invite.inviteeName,
        teamPlan: invite.teamPlan,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
    };
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
    const existingMembership = await db.collection("teamMemberships").doc(callerEmail).get();
    if (existingMembership.exists) {
        return { success: false, claimed: 0, message: 'Already a member of a team.' };
    }

    const invites = await db.collection("team_invites")
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
        await db.runTransaction(async (txn) => {
            // Re-read invite inside transaction to prevent race
            const freshSnap = await txn.get(target.doc.ref);
            if (!freshSnap.exists) return;
            const freshInvite = freshSnap.data() as TeamInvite;

            // Already claimed by someone (race guard)
            if (freshInvite.status === 'accepted' || freshInvite.status === 'revoked' || freshInvite.status === 'expired') return;

            // Double-check reverse lookup inside transaction
            const membershipSnap = await txn.get(db.collection("teamMemberships").doc(callerEmail));
            if (membershipSnap.exists) return; // another claim won the race

            // Check if caller is already an active member for this owner (duplicate guard)
            const existingMember = await txn.get(
                db.collection("users").doc(freshInvite.ownerId).collection("team")
                    .where("email", "==", callerEmail).limit(1)
            );
            if (!existingMember.empty) {
                // Already a member — just mark invite accepted, don't create duplicate
                txn.update(target.doc.ref, { status: 'accepted', acceptedAt: Date.now(), updatedAt: Date.now(), claimedByUserId: callerUid });
                return;
            }

            // Create team member doc
            const memberRef = db.collection("users").doc(freshInvite.ownerId).collection("team").doc();
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
            const membershipRef = db.collection("teamMemberships").doc(freshInvite.inviteeEmailNormalized);
            txn.set(membershipRef, {
                ownerUid: freshInvite.ownerId,
                ownerEmail: freshInvite.ownerEmail,
                ownerName: freshInvite.ownerName,
                role: freshInvite.role,
                teamPlan: freshInvite.teamPlan,
                joinedAt: Date.now(),
                memberId: memberRef.id,
            });

            // ─── dormantPlan capture (FR-017) ───
            // Two sources handled uniformly: (a) pending_plans/{email} doc from a pre-signup Stripe
            // payment, or (b) an existing active paid subscription already on users/{uid}. Captured
            // fields use the branch's Stripe schema (stripeCustomerId); rename alongside 009 on merge.
            let dormantPlan: Record<string, any> | null = null;

            const pendingPlanRef = db.collection("pending_plans").doc(callerEmail);
            const pendingPlanSnap = await txn.get(pendingPlanRef);
            if (pendingPlanSnap.exists) {
                const pd = pendingPlanSnap.data()!;
                dormantPlan = {
                    plan: pd.plan || 'none',
                    credits: pd.credits ?? 0,
                    isTrial: pd.isTrial || false,
                    stripeCustomerId: pd.stripeCustomerId || null,
                    billingStatus: 'active',
                    ghlContactId: pd.ghlContactId || null,
                };
                txn.delete(pendingPlanRef);
            } else {
                const existingUserSnap = await txn.get(db.collection("users").doc(callerUid));
                if (existingUserSnap.exists) {
                    const ud = existingUserSnap.data()!;
                    if (ud.plan && ud.plan !== 'none' && ud.stripeCustomerId) {
                        dormantPlan = {
                            plan: ud.plan,
                            credits: ud.credits ?? 0,
                            creditsPerMonth: ud.creditsPerMonth ?? ud.credits ?? 0,
                            stripeCustomerId: ud.stripeCustomerId,
                            billingStatus: ud.billingStatus || 'active',
                            nextResetDate: ud.nextResetDate || null,
                            isTrial: ud.isTrial || false,
                        };
                    }
                }
            }

            // Mark user as team member
            const userRef = db.collection("users").doc(callerUid);
            txn.set(userRef, {
                plan: "none", credits: 0,
                teamOwnerUid: freshInvite.ownerId,
                teamRole: freshInvite.role,
                isTeamMember: true,
                displayName: freshInvite.inviteeName,
                email: freshInvite.inviteeEmailNormalized,
                dormantPlan: dormantPlan || admin.firestore.FieldValue.delete(),
                teamWelcomeToastShown: true,
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

    const snap = await db.collection("team_invites")
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
    const ownerDoc = await db.collection("users").doc(ownerUid).get();
    const ownerData = ownerDoc.data();
    if (!ownerData) throw new HttpsError("not-found", "Owner account not found.");
    const ownerPlan = ownerData.plan || "none";
    const maxMembers = PLAN_TEAM_LIMITS[ownerPlan] ?? 0;
    if (maxMembers === 0) throw new HttpsError("permission-denied", "Your plan does not support team members.");
    const ownerRecord = await authSvc.getUser(ownerUid);
    if (ownerRecord.email?.toLowerCase() === normalizedEmail) throw new HttpsError("invalid-argument", "You cannot invite yourself.");
    if (maxMembers !== -1) {
        const reserved = await countReservedSeats(ownerUid);
        if (reserved >= maxMembers) throw new HttpsError("resource-exhausted", `Your ${ownerPlan} plan allows ${maxMembers} seat(s). Upgrade for more.`);
    }

    // Check already active on this team
    const existingMember = await db.collection("users").doc(ownerUid).collection("team")
        .where("email", "==", normalizedEmail).get();
    if (!existingMember.empty) throw new HttpsError("already-exists", "This person is already on your team.");

    // Check already active on another team (one-team-per-user model)
    const existingMembership = await db.collection("teamMemberships").doc(normalizedEmail).get();
    if (existingMembership.exists) {
        const mData = existingMembership.data();
        if (mData && mData.ownerUid !== ownerUid) {
            throw new HttpsError("already-exists", "This person is already a member of another team.");
        }
    }

    // Create invite
    const existingInvites = await db.collection("team_invites")
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
        inviteRef = db.collection("team_invites").doc();
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
    const memberDoc = await db.collection("users").doc(ownerUid).collection("team").doc(memberId).get();
    if (!memberDoc.exists) throw new HttpsError("not-found", "Team member not found.");

    const memberData = memberDoc.data()!;
    const memberEmail = memberData.email;

    // Get owner display name for removal toast
    const ownerDoc = await db.collection("users").doc(ownerUid).get();
    const ownerName = ownerDoc.data()?.displayName || ownerDoc.data()?.email || '';

    // Delete team doc
    await db.collection("users").doc(ownerUid).collection("team").doc(memberId).delete();

    // Delete reverse-lookup
    try {
        await db.collection("teamMemberships").doc(memberEmail).delete();
    } catch (e) { /* non-blocking */ }

    // Remove team flags from member's user doc + restore dormantPlan (FR-009)
    if (memberData.uid) {
        const memberUserRef = db.collection("users").doc(memberData.uid);
        const memberUserSnap = await memberUserRef.get();
        const memberUserData = memberUserSnap.data();

        const restoreFields: Record<string, any> = {
            isTeamMember: admin.firestore.FieldValue.delete(),
            teamOwnerUid: admin.firestore.FieldValue.delete(),
            teamRole: admin.firestore.FieldValue.delete(),
            pendingRemovalToast: {
                ownerName,
                shownAt: null,
            },
        };

        if (memberUserData?.dormantPlan) {
            const dp = memberUserData.dormantPlan;
            restoreFields.plan = dp.plan || 'none';
            restoreFields.credits = dp.credits ?? 0;
            restoreFields.creditsPerMonth = dp.creditsPerMonth ?? null;
            restoreFields.stripeCustomerId = dp.stripeCustomerId || admin.firestore.FieldValue.delete();
            restoreFields.billingStatus = dp.billingStatus || 'active';
            restoreFields.nextResetDate = dp.nextResetDate || admin.firestore.FieldValue.delete();
            restoreFields.isTrial = dp.isTrial || false;
            restoreFields.dormantPlan = admin.firestore.FieldValue.delete();
        } else {
            restoreFields.plan = 'none';
            restoreFields.credits = 0;
        }

        await memberUserRef.update(restoreFields);
    }

    console.log(`👥 Team member removed: ${memberEmail} from owner ${ownerUid}`);
    return { success: true, message: `${memberData.name} has been removed from your team.` };
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

        await db.collection("metaConnections").doc(state).set({
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

    const doc = await db.collection("metaConnections").doc(uid).get();
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

    await db.collection("metaConnections").doc(uid).update({
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
    await db.collection("metaConnections").doc(uid).delete();

    // Delete all performance data
    const perfDocs = await db.collection("adPerformance").where("userId", "==", uid).get();
    const batch = db.batch();
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

    const connDoc = await db.collection("metaConnections").doc(uid).get();
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
        const batch = db.batch();
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
            batch.set(db.collection("adPerformance").doc(docId), perfDoc, { merge: true });

            // Store time-aware snapshot (for historical analysis — never overwrites)
            const snapshotId = `${uid}_${ad.ad_id}_${since}_${until}`;
            batch.set(db.collection("adPerformanceHistory").doc(snapshotId), {
                ...perfDoc,
                snapshotDate: new Date().toISOString().split("T")[0],
            });

            // Link to deployment records — prefer strong identifiers, scoped by adAccountId
            try {
                let deployDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

                // 1. Try metaAdId first (strongest — direct Meta identity)
                if (ad.ad_id) {
                    const byAdId = await db.collection("creativeDeployments")
                        .where("userId", "==", uid)
                        .where("adAccountId", "==", accountId)
                        .where("metaAdId", "==", ad.ad_id)
                        .limit(1)
                        .get();
                    if (!byAdId.empty) deployDoc = byAdId.docs[0];
                }

                // 2. Try imageHash if available on the ad insights
                if (!deployDoc && (ad as any).image_hash) {
                    const byHash = await db.collection("creativeDeployments")
                        .where("userId", "==", uid)
                        .where("adAccountId", "==", accountId)
                        .where("imageHash", "==", (ad as any).image_hash)
                        .limit(1)
                        .get();
                    if (!byHash.empty) deployDoc = byHash.docs[0];
                }

                // 3. Fallback to adName (weakest — may have duplicates), scoped by account
                if (!deployDoc && ad.ad_name) {
                    const byName = await db.collection("creativeDeployments")
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
        await db.collection("metaConnections").doc(uid).update({
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
    const connDoc = await db.collection("metaConnections").doc(uid).get();
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
            await db.collection("creativeDeployments").doc(deploymentId).set({
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
        requireVisualPolishes?: boolean;
        requireAspectRatio?: string;
    }
): Promise<ResolvedEntitlement> {
    const entitlement = await resolveEntitlement(callerUid);

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
        const response = await ai.models.generateContent({
            model: params.model,
            contents: params.contents,
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
        const vaultSnap = await db.collectionGroup('principles')
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
export const serverGenerateTOV = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: true,
    maxInstances: 30,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex, editIntent, rewriteScope, semanticLock } = request.data;
    // ═══ ENTITLEMENT: Check retargeting gate on hook generation ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs);
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateTOV(inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex, editIntent, rewriteScope, semanticLock);
        const rg = result.rankingGuidance;
        return { success: true, text: result.text, rankingRequestId: rg?.rankingRequestId || null, rankingRequestFingerprint: rg?.rankingRequestFingerprint || null, rankingAppliedSummary: rg?.rankingAppliedSummary || null };
    } catch (error: any) {
        console.error("generateTOV error:", error);
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
    const { approvedTov, inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex } = request.data;
    // ═══ ENTITLEMENT: Check retargeting gate on concept generation ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs);
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateConcepts(approvedTov, inputs, resolvedUniverse, mode, previousOutput, globalRefinement, editFeedback, editIndex);
        const rg = result.rankingGuidance;
        return { success: true, text: result.text, rankingRequestId: rg?.rankingRequestId || null, rankingRequestFingerprint: rg?.rankingRequestFingerprint || null, rankingAppliedSummary: rg?.rankingAppliedSummary || null };
    } catch (error: any) {
        console.error("generateConcepts error:", error);
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
    const { conceptRaw, selectedTov, inputs, resolvedUniverse, currentAspectRatio, textOverride } = request.data;
    // ═══ ENTITLEMENT ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs);
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateBuildPlan(conceptRaw, selectedTov, inputs, resolvedUniverse, currentAspectRatio, textOverride);
        return { success: true, text: result, errorCode: null };
    } catch (error: any) {
        console.error("generateBuildPlan error:", error);
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
    const { buildPlan, approvedTov, inputs, resolvedUniverse, currentAspectRatio, editInstruction, base64ToEdit, styleReference, textOverride } = request.data;
    // ═══ ENTITLEMENT: Check retargeting + aspect ratio gates ═══
    const entitlement = await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireAspectRatio: currentAspectRatio,
    });
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    generators.setOpenAIKey(openaiApiKey.value());
    generators.setTestimonialGeminiCaller(createGeminiCaller(geminiApiKey.value()));

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
            return { success: true, imageBase64: result.image, errorCode: null };
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
        throw new HttpsError("internal", "Image generation failed: " + error.message);
    }
});

// ─── MAGIC SELECTOR: Region-targeted image editing ──────────────────────
export const serverEditRegion = onCall({
    region: "europe-west1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: "2GiB",
    cors: true,
    maxInstances: 20,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const { imageBase64, region, editMode, editPayload, ratio } = request.data;

    if (!imageBase64 || !region || !editMode) {
        throw new HttpsError("invalid-argument", "Missing imageBase64, region, or editMode.");
    }

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

    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));

    try {
        const rawB64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const callGemini = createGeminiCaller(geminiApiKey.value());
        const response = await callGemini({
            model: VISUAL_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: "image/png", data: rawB64 } },
                    { text: instruction },
                ]
            },
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
    const { inputs, resolvedUniverse, slideCount, globalRefinement } = request.data;
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
        const result = await generators.generateCarouselAngles(inputs, resolvedUniverse, slideCount, globalRefinement);
        return { success: true, text: result };
    } catch (error: any) {
        console.error("generateCarouselAngles error:", error);
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
    const { approvedTov, inputs, slideCount, resolvedUniverse, refinement } = request.data;
    // ═══ ENTITLEMENT: Check carousel access ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireCarousel: true,
    });
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    generators.setTestimonialGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateCarouselSlideCopies(approvedTov, inputs, slideCount, resolvedUniverse, refinement);
        return { success: true, copies: result };
    } catch (error: any) {
        console.error("generateCarouselSlideCopies error:", error);
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
    // ═══ ENTITLEMENT: Check carousel access ═══
    const entitlement = await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireCarousel: true,
    });
    const maxSlides = entitlement.features.maxCarouselSlides || 5;
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    generators.setTestimonialGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateTestimonialCarousel(inputs, screenshots, maxSlides);
        return { success: true, ...result };
    } catch (error: any) {
        console.error("generateTestimonialCarousel error:", error);
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
    const { mockupUrl, inputs, visualMetaphor, approvedTov, refinement, carouselContext, buildPlan } = request.data;
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateCaption(mockupUrl, inputs, visualMetaphor, approvedTov, refinement, carouselContext, buildPlan);
        const rg = result.rankingGuidance;
        return { success: true, text: result.text, rankingRequestId: rg?.rankingRequestId || null, rankingRequestFingerprint: rg?.rankingRequestFingerprint || null, rankingAppliedSummary: rg?.rankingAppliedSummary || null };
    } catch (error: any) {
        console.error("generateCaption error:", error);
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
    // ═══ ENTITLEMENT: Check visual polishes access ═══
    await enforceGenerationEntitlement(request.auth.uid, inputs, {
        requireVisualPolishes: true,
    });
    generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()));
    try {
        const result = await generators.generateVisualPolishes(currentRender, inputs);
        return { success: true, polishes: result };
    } catch (error: any) {
        console.error("generateVisualPolishes error:", error);
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
    const vaultRef = db.collection('principleVaults').doc(userId);
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
    const batch = db.batch();
    for (const doc of pendingSnap.docs) {
        batch.delete(doc.ref);
    }
    await batch.commit();

    return { status: 'processed', principlesCreated, processedSignals: pendingSnap.size };
});

// ─── 5d. DESIGN CRITIC via OpenAI ───
// Call GPT-4o-mini vision to critique a generated ad image

export const designCritique = onCall({
    region: "europe-west1",
    secrets: [openaiApiKey],
    timeoutSeconds: 30,
    cors: true,
    memory: "256MiB",
    maxInstances: 20,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const { imageBase64, expectedHeadline, expectedSubheadline, expectedCTA, expectedBenefit, ratio } = request.data;
    if (!imageBase64) throw new HttpsError("invalid-argument", "Missing image.");

    try {
        // Strip data URL prefix
        let rawBase64 = imageBase64;
        if (rawBase64.includes(',')) rawBase64 = rawBase64.split(',')[1];

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
                        content: 'You are an expert ad design critic. You analyze advertisement images and return structured JSON feedback. Be strict but fair. Only flag genuinely problematic issues.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: { url: `data:image/png;base64,${rawBase64}`, detail: 'low' }
                            },
                            {
                                type: 'text',
                                text: `Review this ad image. Expected text elements:
- Headline: "${expectedHeadline || ''}"
- Subheadline: "${expectedSubheadline || ''}"
${expectedCTA ? `- CTA Button: "${expectedCTA}"` : '- No CTA expected'}
${expectedBenefit ? `- Benefit: "${expectedBenefit}"` : ''}
- Ratio: ${ratio || '1:1'}

Score 1-10 on: readability, text_accuracy, layout, text_hero_overlap, cta_visibility, color_harmony, professional_feel.

Return ONLY valid JSON:
{"scores":{"readability":N,"accuracy":N,"layout":N,"overlap":N,"cta":N,"color":N,"professional":N},"averageScore":N,"needsRevision":true/false,"fixes":["fix1","fix2"]}

needsRevision=true only if average<7 or any score<=4. Max 3 specific actionable fixes. Focus on worst issues only.`
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                temperature: 0.1,
                response_format: { type: 'json_object' }
            })
        });

        const data = await response.json() as any;

        if (data.error) {
            console.error('OpenAI critic error:', data.error);
            return { needsRevision: false, fixes: [], score: 7 }; // Fail open
        }

        const content = data.choices?.[0]?.message?.content || '{}';
        try {
            const result = JSON.parse(content);
            console.log(`🔍 OpenAI Critic: score=${result.averageScore}, revision=${result.needsRevision}`);
            return {
                needsRevision: result.needsRevision === true,
                fixes: (result.fixes || []).slice(0, 3),
                score: result.averageScore || 7,
            };
        } catch {
            return { needsRevision: false, fixes: [], score: 7 };
        }
    } catch (err: any) {
        console.error('Design critique failed:', err);
        return { needsRevision: false, fixes: [], score: 7 }; // Fail open — don't block the user
    }
});

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
    const { imageBase64, adName, primaryText, pageId } = request.data;

    if (!imageBase64) throw new HttpsError("invalid-argument", "Missing image data.");
    if (!primaryText) throw new HttpsError("invalid-argument", "Missing ad copy text.");

    const connDoc = await db.collection("metaConnections").doc(uid).get();
    if (!connDoc.exists) throw new HttpsError("not-found", "No Meta connection found.");
    const conn = connDoc.data()!;
    if (!conn.selectedAccountId) throw new HttpsError("failed-precondition", "No ad account selected.");

    try {
        const token = decryptToken(conn.encryptedToken, metaAppSecret.value());
        const accountId = conn.selectedAccountId;

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

    const connections = await db.collection("metaConnections")
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
            const deploySnap = await db.collection("creativeDeployments")
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

            const batch = db.batch();
            for (const ad of (data.data || [])) {
                const roas = (ad.purchase_roas || []).length > 0 ? parseFloat(ad.purchase_roas[0].value) : null;
                const adWsId = deployWsMap.get(ad.ad_id) ?? deployWsMap.get(`name:${ad.ad_name}`) ?? null;
                batch.set(db.collection("adPerformance").doc(`${uid}_${ad.ad_id}`), {
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
            const allDeploymentsSnap = await db.collection("creativeDeployments")
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
                        const deploySnap = await db.collection('creativeDeployments')
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
    const expiring = await db.collection("metaConnections")
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
        const connections = await db.collection("metaConnections").get();
        const confirmationCode = `PROADSAI_DEL_${Date.now()}`;

        for (const doc of connections.docs) {
            // Delete connection
            await doc.ref.delete();
            // Delete performance data
            const perfDocs = await db.collection("adPerformance")
                .where("userId", "==", doc.id).get();
            const batch = db.batch();
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
    const entitlement = await resolveEntitlement(uid);
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
    const cacheRef = db.collection("users").doc(entitlement.creditOwnerUid).collection("analyzedUrls").doc(urlHash);
    const cacheDoc = await cacheRef.get();

    if (cacheDoc.exists) {
        // Cached result — no credit cost
        console.log(`📋 Brand URL cache hit for ${cacheKey} (user: ${entitlement.creditOwnerUid})`);
        return cacheDoc.data();
    }

    // First analysis of this URL — deduct credits atomically
    const scrapeCost = COSTS['brandUrlScraping'] || 3;
    await db.runTransaction(async (tx) => {
        const userRef = db.collection("users").doc(entitlement.creditOwnerUid);
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