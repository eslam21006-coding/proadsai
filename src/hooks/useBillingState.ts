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
  billingStatus: "active" | "past_due" | "cancelled" | "cancelling" | "trialing" | "none";
  nextResetDate: { seconds: number; nanoseconds: number } | null;
  billingType: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
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

    let innerUnsub: (() => void) | null = null;

    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const isTeamMember = data.isTeamMember === true;
          const teamOwnerUid = data.teamOwnerUid as string | null;

          if (isTeamMember && teamOwnerUid) {
            if (innerUnsub) innerUnsub();
            innerUnsub = onSnapshot(
              doc(db, "users", teamOwnerUid),
              (ownerSnap) => {
                if (ownerSnap.exists()) {
                  const ownerData = ownerSnap.data();
                  const ownerBilling = ownerData.billingState as BillingState | undefined;
                  if (ownerBilling) {
                    // Build an immutable copy — never mutate the Firestore snapshot return.
                    setBillingState({
                      ...ownerBilling,
                      isTeamMember: true,
                      teamOwnerUid,
                      teamOwnerName: ownerData.displayName ?? null,
                      canUpgrade: false,
                      canTopUp: false,
                    });
                  } else {
                    setBillingState(null);
                  }
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
          } else {
            const bs = data.billingState as BillingState | undefined;
            if (bs) {
              // Build an immutable copy — never mutate the Firestore snapshot return.
              setBillingState({
                ...bs,
                isTeamMember: false,
                teamOwnerUid: null,
                teamOwnerName: null,
              });
            } else {
              setBillingState(null);
            }
          }
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

    return () => {
      unsub();
      if (innerUnsub) innerUnsub();
    };
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
