// functions/src/paddle/paddlePortal.ts — Paddle Customer Portal session

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { Firestore } from "firebase-admin/firestore";
import { createPaddleClient } from "./paddleClient.js";

export async function paddleCreatePortalSession(request: CallableRequest, apiKey: string, db: Firestore) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) throw new HttpsError("not-found", "User not found.");

    let paddleCustomerId = userData.paddleCustomerId;

    const paddle = createPaddleClient(apiKey);

    if (!paddleCustomerId) {
        const email = userData.email || request.auth.token?.email;
        if (!email) throw new HttpsError("failed-precondition", "No email on account.");

        try {
            const customers = await paddle.customers.list({ email: [email.toLowerCase().trim()], perPage: 1 });
            if (customers) {
                const items = await customers.next();
                if (items && items.length > 0) {
                    paddleCustomerId = items[0].id;
                    await db.collection("users").doc(uid).update({ paddleCustomerId });
                } else {
                    throw new HttpsError("not-found", "No Paddle account found. Contact support.");
                }
            }
        } catch (err: any) {
            if (err instanceof HttpsError) throw err;
            throw new HttpsError("internal", "Could not look up billing account: " + err.message);
        }
    }

    try {
        const subs = await paddle.subscriptions.list({ customerId: [paddleCustomerId], perPage: 10 });
        const subResults = await subs.next();
        const subIds = (subResults || []).map((s: any) => s.id);

        const session = await paddle.customerPortalSessions.create(paddleCustomerId, subIds);

        const portalUrl = session.urls?.general?.overview || "";
        console.log(`Paddle portal created for uid=${uid}: ${portalUrl.substring(0, 50)}...`);

        return { url: portalUrl, resolvedPaddleId: paddleCustomerId };
    } catch (err: any) {
        console.error("Paddle portal error:", err.message);
        throw new HttpsError("internal", "Failed to create billing portal: " + err.message);
    }
}
