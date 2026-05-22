// functions/src/stripe/stripeClient.ts — Stripe SDK initialization and price-to-plan mapping
// Single source of truth for all Stripe price IDs (R-019, R-012).
// Mirrored to frontend via src/planconfig.ts STRIPE_PRICE_TO_PLAN.

import Stripe from "stripe";

// ═══════════════════════════════════════════════════════════
// STRIPE SDK INITIALIZATION
// ═══════════════════════════════════════════════════════════
// API version pin per FR-029 / R-019.
// Upgrade procedure: update this constant + Stripe Dashboard Default API version,
// then regression-test all webhook handlers against the new version's payload shape.

export const STRIPE_API_VERSION = "2025-01-27.acacia" as Stripe.LatestApiVersion;

export function createStripeClient(secretKey: string): Stripe {
    return new Stripe(secretKey, {
        apiVersion: STRIPE_API_VERSION,
    });
}

// ═══════════════════════════════════════════════════════════
// PRICE-TO-PLAN MAP
// ═══════════════════════════════════════════════════════════
// Covers all 9 price IDs: 3 monthly + 3 annual subscription + 3 one-time top-up.
// Placeholder IDs — replace with actual Stripe Dashboard price IDs during setup (quickstart A.2/A.3).

export const STRIPE_PRICE_TO_PLAN: Record<string, { plan: string; billingType: "monthly" | "annual" | "one_time"; credits?: number }> = {
    // Starter subscription — monthly + annual
    price_1TTqaDKXgskM9FYIiuhc4KWJ: { plan: "starter", billingType: "monthly" },
    price_1TTqbpKXgskM9FYIs0w4YvML: { plan: "starter", billingType: "annual" },
    // Pro subscription — monthly + annual
    price_1TR7S0KXgskM9FYIqJgTQN4z: { plan: "pro", billingType: "monthly" },
    price_1TR7S0KXgskM9FYIFJWukf50: { plan: "pro", billingType: "annual" },
    // Scale subscription — monthly + annual
    price_1TTyxMKXgskM9FYIlR7h0sru: { plan: "scale", billingType: "monthly" },
    price_1TTyxsKXgskM9FYIkIfqkIr3: { plan: "scale", billingType: "annual" },
    // Top-up packs — one_time
    price_1TR7yLKXgskM9FYIWCz5CLXA: { plan: "keep_current", billingType: "one_time", credits: 100 },
    price_1TR7z9KXgskM9FYI0jb1lrWu: { plan: "keep_current", billingType: "one_time", credits: 300 },
    price_1TR80YKXgskM9FYIyV7xAo66: { plan: "keep_current", billingType: "one_time", credits: 800 },
};

export const STRIPE_TOPUP_PRICES: Record<number, string> = {
    100: "price_1TR7yLKXgskM9FYIWCz5CLXA",
    300: "price_1TR7z9KXgskM9FYI0jb1lrWu",
    800: "price_1TR80YKXgskM9FYIyV7xAo66",
};
