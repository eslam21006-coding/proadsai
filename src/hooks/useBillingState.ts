// src/hooks/useBillingState.ts — Firestore real-time listener for unified billing state

import { useState, useEffect } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "../firebase";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import type { UserPlan } from "../planconfig";

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "cancelling"
  | "cancelled";

export interface BillingState {
  plan: UserPlan;
  isTrial: boolean;
  credits: number;
  creditsPerMonth: number;
  billingStatus: BillingStatus;
  nextResetDate: { seconds: number; nanoseconds: number } | null;
  cancelAt: { seconds: number; nanoseconds: number } | null;
  stripeCustomerId: string | null;
  canUpgrade: boolean;
  canTopUp: boolean;
  isTeamMember: boolean;
  teamOwnerUid: string | null;
  gracePeriodEndsAt: { seconds: number; nanoseconds: number } | null;
}

export type CancellationReason =
  | "too_expensive"
  | "not_using_enough"
  | "switching_competitor"
  | "missing_features"
  | "other";

export interface CancellationRecord {
  uid: string;
  email: string;
  plan: UserPlan;
  reason: CancellationReason;
  feedback: string | null;
  cancelAt: { seconds: number; nanoseconds: number };
  createdAt: { seconds: number; nanoseconds: number };
}

export function useBillingState(): {
  billingState: BillingState | null;
  isLoading: boolean;
} {
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    let unsubBilling: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous billing listener if user changed
      if (unsubBilling) {
        unsubBilling();
        unsubBilling = null;
      }

      if (!user) {
        setBillingState(null);
        setIsLoading(false);
        return;
      }

      unsubBilling = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          const data = snap.data();
          if (data?.billingState) {
            setBillingState(data.billingState as BillingState);
          } else {
            setBillingState(null);
          }
          setIsLoading(false);
        },
        (err) => {
          console.warn("billing snapshot listener error", err);
          setIsLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubBilling) unsubBilling();
    };
  }, []);

  return { billingState, isLoading };
}
