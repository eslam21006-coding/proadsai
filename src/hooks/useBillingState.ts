// src/hooks/useBillingState.ts — real-time hook reading billingState embedded sub-object from users/{uid}

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAppStore } from "../store";
import { canUse, type UserPlan } from "../planconfig";

export type CancellationReason =
  | "too_expensive"
  | "not_using_enough"
  | "switching_competitor"
  | "missing_features"
  | "other";

export interface BillingState {
  plan: string;
  isTrial: boolean;
  credits: number;
  creditsPerMonth: number;
  billingStatus: "active" | "past_due" | "cancelled" | "cancelling" | "trialing";
  nextResetDate: { seconds: number; nanoseconds: number } | null;
  billingType: string | null;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  paddleUpdatePaymentUrl: string | null;
  paddleCancelUrl: string | null;
  canUpgrade: boolean;
  canTopUp: boolean;
  isTeamMember: boolean;
  teamOwnerUid: string | null;
  teamOwnerName: string | null;
  cancelAt: { seconds: number; nanoseconds: number } | null;
  gracePeriodEndsAt: { seconds: number; nanoseconds: number } | null;
  pendingPlan: string | null;
  pendingPlanEffectiveAt: { seconds: number; nanoseconds: number } | null;
}

export function useBillingState() {
  const user = useAppStore((s) => s.user);
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setBillingState(null);
      setLoading(false);
      setError(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setBillingState((data.billingState as BillingState) || null);
        } else {
          setBillingState(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setBillingState(null);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [user]);

  return { billingState, loading, error };
}

export function useCanUse(feature: string): { allowed: boolean; requiredPlan: string } {
  const { billingState } = useBillingState();
  const plan = (billingState?.plan || "none") as UserPlan;

  if (plan === "none") {
    return { allowed: false, requiredPlan: "starter" };
  }

  const allowed = canUse(plan, feature as any);
  if (!allowed) {
    const PLAN_HIERARCHY: Record<string, string[]> = {
      starter: ["brandUrlScraping"],
      pro: [
        "retargeting", "fantasyUniverses", "visualPolishes", "abVariationTesting", "regionEditing",
        "carousel", "competitorResearch", "referenceAdUpload", "pushToMeta", "creativeMemory",
        "batchGeneration",
      ],
      scale: ["creativeScoringEngine", "smartRecommendations", "variantExploration", "multiBrandWorkspaces"],
    };

    for (const [planName, features] of Object.entries(PLAN_HIERARCHY)) {
      if (features.includes(feature)) {
        return { allowed: false, requiredPlan: planName };
      }
    }
    return { allowed: false, requiredPlan: "starter" };
  }

  return { allowed: true, requiredPlan: "" };
}
