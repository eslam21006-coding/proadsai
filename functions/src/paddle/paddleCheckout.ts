// functions/src/paddle/paddleCheckout.ts — Paddle top-up / one-time checkout

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { Firestore } from "firebase-admin/firestore";
import { createPaddleClient } from "./paddleClient.js";

const TOPUP_PRICES: Record<string, { priceId: string; credits: number }> = {
    topup_100: { priceId: "pri_01knz87qc1ezrb84gtffpmtjdq", credits: 100 },
    topup_300: { priceId: "pri_01knz898vrhxyge632scazjn2z", credits: 300 },
    topup_800: { priceId: "pri_01knz8a0s0f2je5rgrk2y62b0n", credits: 800 },
};

export async function paddleCreateTopupCheckout(request: CallableRequest, apiKey: string, db: Firestore) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;
    const packId = request.data?.packId;
    const pack = TOPUP_PRICES[packId];
    if (!pack) throw new HttpsError("invalid-argument", `Invalid pack: ${packId}`);

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) throw new HttpsError("not-found", "User not found.");

    const paddle = createPaddleClient(apiKey);
    const email = userData.email || request.auth.token?.email;
    let customerId = userData.paddleCustomerId;

    if (!customerId) {
        try {
            const existing = await paddle.customers.list({ email: [email?.toLowerCase().trim() || ""], perPage: 1 });
            const items = await existing.next();
            if (items && items.length > 0) {
                customerId = items[0].id;
            } else {
                const newCustomer = await paddle.customers.create({
                    email: email?.toLowerCase().trim(),
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
            customData: {
                firebaseUid: uid,
                packId,
                credits: String(pack.credits),
            },
            checkout: {
                url: `https://app.proadsai.com?topup=success&credits=${pack.credits}`,
            },
        });

        console.log(`Paddle checkout created for ${email} (${packId})`);
        return { transactionId: tx.id };
    } catch (err: any) {
        console.error("Paddle checkout error:", err.message);
        throw new HttpsError("internal", "Failed to create checkout: " + err.message);
    }
}
