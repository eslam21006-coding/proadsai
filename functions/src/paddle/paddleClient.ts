// functions/src/paddle/paddleClient.ts — Paddle SDK initialization and shared helpers

import { Paddle, type EventName as PaddleEventName } from "@paddle/paddle-node-sdk";
import { Firestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";

export type PaddleEventNameType = PaddleEventName;

const PLAN_CREDITS: Record<string, number> = {
    starter: 500,
    creator: 1000,
    pro: 2000,
    scaling: 5000,
};

export function createPaddleClient(apiKey: string): Paddle {
    return new Paddle(apiKey);
}

export function planCredits(plan: string): number {
    return PLAN_CREDITS[plan] ?? 0;
}

export async function findUserByPaddleCustomerId(
    paddleCustomerId: string,
    db: Firestore,
): Promise<{ uid: string; data: any } | null> {
    const snap = await db.collection("users")
        .where("paddleCustomerId", "==", paddleCustomerId)
        .limit(1)
        .get();

    if (!snap.empty) {
        const doc = snap.docs[0];
        return { uid: doc.id, data: doc.data() };
    }
    return null;
}

export async function findUserByEmail(
    email: string,
    db: Firestore,
): Promise<{ uid: string; data: any } | null> {
    const normalized = email.toLowerCase().trim();
    try {
        const userRecord = await admin.auth().getUserByEmail(normalized);
        const doc = await db.collection("users").doc(userRecord.uid).get();
        if (doc.exists) {
            return { uid: doc.id, data: doc.data() };
        }
    } catch {
        // no Firebase user
    }
    return null;
}

export const PADDLE_PRICE_TO_PLAN: Record<string, { plan: string; credits: number }> = {
    pri_01knz7v1rr3eehbe12s214ba0t: { plan: "starter", credits: 500 },
    pri_01knz7wz5cpvv2fx6334wv822e: { plan: "starter", credits: 500 },
    pri_01knz7xtmrbsfsrzfc1dy1zser: { plan: "creator", credits: 1000 },
    pri_01knz7ydr6zbpdhatr8yarwjnd: { plan: "creator", credits: 1000 },
    pri_01knz7zpgfbek52zm0n012jqn0: { plan: "pro", credits: 2000 },
    pri_01knz82jwdxjph1mpny39jnxqg: { plan: "pro", credits: 2000 },
    pri_01knz80jr5m4ey3wrskpvgbrh4: { plan: "scaling", credits: 5000 },
    pri_01knz81pexff8h8wbwq44cy0j3: { plan: "scaling", credits: 5000 },
};
