// src/pages/Billing.tsx — Billing dashboard page

import React, { useState, useCallback } from "react";
import { useBillingState } from "../hooks/useBillingState";
import { CreditBar } from "../components/billing/CreditBar";
import { PlanCard } from "../components/billing/PlanCard";
import { TopUpSelector } from "../components/billing/TopUpSelector";
import { CancelDialog } from "../components/billing/CancelDialog";
import { ReactivateButton } from "../components/billing/ReactivateButton";
import { PaymentFailedAlert } from "../components/billing/PaymentFailedAlert";
import { useAppStore } from "../store";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { PLANS } from "../planconfig";

const cancelSub = httpsCallable(functions, "cancelSubscription");
const reactivateSub = httpsCallable(functions, "reactivateSubscription");
const createPortal = httpsCallable(functions, "createStripePortalSession");
const createCheckout = httpsCallable(functions, "createTopupCheckout");

export const Billing: React.FC = () => {
  const { billingState, isLoading } = useBillingState();
  const { showToast, setShowUpgradeModal } = useAppStore();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleManageSubscription = useCallback(async () => {
    try {
      const result = await createPortal({}) as any;
      if (result.data?.url) window.open(result.data.url, "_blank");
    } catch (e: any) {
      showToast(e.message || "Failed to open billing portal", "error");
    }
  }, [showToast]);

  const handleCancel = useCallback(async (reason: string, feedback?: string) => {
    setCancelling(true);
    try {
      await cancelSub({ reason, feedback });
      showToast("Subscription cancellation scheduled.", "success");
      setShowCancelDialog(false);
    } catch (e: any) {
      showToast(e.message || "Failed to cancel.", "error");
    } finally {
      setCancelling(false);
    }
  }, [showToast]);

  const handleReactivate = useCallback(async () => {
    try {
      await reactivateSub({});
      showToast("Subscription reactivated!", "success");
    } catch (e: any) {
      showToast(e.message || "Failed to reactivate.", "error");
    }
  }, [showToast]);

  const handleTopUp = useCallback(async (packId: string) => {
    try {
      const result = await createCheckout({ packId }) as any;
      if (result.data?.url) window.location.href = result.data.url;
    } catch (e: any) {
      showToast(e.message || "Failed to start checkout.", "error");
    }
  }, [showToast]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-2xl p-8">
          <div className="h-8 bg-slate-800 rounded w-1/3" />
          <div className="h-32 bg-slate-800 rounded" />
          <div className="h-24 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  if (!billingState) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">No billing information found.</p>
      </div>
    );
  }

  const {
    plan, isTrial, credits, creditsPerMonth, billingStatus,
    cancelAt, stripeCustomerId, canUpgrade, canTopUp,
    isTeamMember, gracePeriodEndsAt,
  } = billingState;

  const planName = PLANS[plan]?.name ?? "None";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Billing</h1>
        {isTeamMember && (
          <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
            Team member — read only
          </span>
        )}
      </div>

      {billingStatus === "past_due" && (
        <PaymentFailedAlert
          gracePeriodEndsAt={gracePeriodEndsAt}
          onUpdatePayment={handleManageSubscription}
        />
      )}

      {billingStatus === "cancelling" && cancelAt && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <p className="text-yellow-300 font-semibold">
            Cancelled — access until{" "}
            {new Date(cancelAt.seconds * 1000).toLocaleDateString(undefined, {
              year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        </div>
      )}

      <PlanCard
        plan={plan}
        billingStatus={billingStatus}
        isTrial={isTrial}
        credits={credits}
        creditsPerMonth={creditsPerMonth}
        nextResetDate={billingState.nextResetDate}
        cancelAt={cancelAt}
        canUpgrade={canUpgrade}
        onUpgrade={() => setShowUpgradeModal(true)}
      />

      <CreditBar credits={credits} creditsPerMonth={creditsPerMonth} />

      {!isTeamMember && billingStatus !== "cancelled" && (
        <div className="space-y-4">
          <TopUpSelector canTopUp={canTopUp} onBuy={handleTopUp} />

          {billingStatus === "active" && (
            <button
              onClick={() => setShowCancelDialog(true)}
              className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 text-sm font-medium transition-all"
            >
              Cancel Subscription
            </button>
          )}

          {billingStatus === "cancelling" && (
            <ReactivateButton onReactivate={handleReactivate} />
          )}

          {stripeCustomerId && billingStatus === "active" && (
            <button
              onClick={handleManageSubscription}
              className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium transition-all"
            >
              Manage Subscription
            </button>
          )}
        </div>
      )}

      {showCancelDialog && (
        <CancelDialog
          cancelAt={cancelAt ? new Date(cancelAt.seconds * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "the end of your billing period"}
          onConfirm={handleCancel}
          onClose={() => setShowCancelDialog(false)}
          loading={cancelling}
        />
      )}
    </div>
  );
};

export default Billing;
