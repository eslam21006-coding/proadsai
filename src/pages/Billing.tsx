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
import { useT } from "../i18n";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { PLANS } from "../planconfig";

const cancelSub = httpsCallable(functions, "cancelSubscription");
const reactivateSub = httpsCallable(functions, "reactivateSubscription");
const createPortal = httpsCallable(functions, "createStripePortalSession");
const createCheckout = httpsCallable(functions, "createTopupCheckout");
const getSub = httpsCallable(functions, "getSubscription");

function mapServerError(e: any, t: (key: string) => string): string {
  const code = e?.details?.code || e?.code || "";
  if (code === "plan_downgraded") return t("billing.error.planDowngraded");
  if (code === "trial_expired") return t("billing.error.trialExpired");
  return t("billing.error.unknown");
}

export const Billing: React.FC = () => {
  const { billingState, isLoading } = useBillingState();
  const { showToast, setShowUpgradeModal } = useAppStore();
  const { t } = useT();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [periodEndDate, setPeriodEndDate] = useState<string | null>(null);

  const handleManageSubscription = useCallback(async () => {
    try {
      const result = await createPortal({}) as any;
      if (result.data?.url) window.open(result.data.url, "_blank");
    } catch (e: any) {
      showToast(mapServerError(e, t), "error");
    }
  }, [showToast, t]);

  const handleStartCancel = useCallback(async () => {
    try {
      const result = await getSub({}) as any;
      const periodEnd = result.data?.currentPeriodEnd;
      if (periodEnd) {
        setPeriodEndDate(
          new Date(periodEnd * 1000).toLocaleDateString(undefined, {
            year: "numeric", month: "long", day: "numeric",
          })
        );
      } else {
        setPeriodEndDate(null);
      }
      setShowCancelDialog(true);
    } catch {
      setShowCancelDialog(true);
      setPeriodEndDate(null);
    }
  }, []);

  const handleCancel = useCallback(async (reason: string, feedback?: string) => {
    setCancelling(true);
    try {
      await cancelSub({ reason, feedback });
      showToast(t("billing.cancelScheduled"), "success");
      setShowCancelDialog(false);
    } catch (e: any) {
      showToast(mapServerError(e, t), "error");
    } finally {
      setCancelling(false);
    }
  }, [showToast, t]);

  const handleReactivate = useCallback(async () => {
    try {
      await reactivateSub({});
      showToast(t("billing.reactivated"), "success");
    } catch (e: any) {
      showToast(mapServerError(e, t), "error");
    }
  }, [showToast, t]);

  const handleTopUp = useCallback(async (packId: string) => {
    try {
      const result = await createCheckout({ packId }) as any;
      if (result.data?.url) window.location.href = result.data.url;
    } catch (e: any) {
      showToast(mapServerError(e, t), "error");
    }
  }, [showToast, t]);

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
        <p className="text-slate-400">{t("billing.noInfo")}</p>
      </div>
    );
  }

  const {
    plan, isTrial, credits, creditsPerMonth, billingStatus,
    cancelAt, canUpgrade, canTopUp,
    isTeamMember, gracePeriodEndsAt,
  } = billingState;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
        {isTeamMember && (
          <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
            {t("billing.teamReadOnly")}
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
            {t("billing.cancelledUntil").replace(
              "{date}",
              new Date(cancelAt.seconds * 1000).toLocaleDateString(undefined, {
                year: "numeric", month: "long", day: "numeric",
              })
            )}
          </p>
        </div>
      )}

      <PlanCard
        plan={plan}
        billingStatus={billingStatus}
        isTrial={isTrial}
        credits={credits}
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
              onClick={handleStartCancel}
              className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 text-sm font-medium transition-all"
            >
              {t("billing.cancelBtn")}
            </button>
          )}

          {billingStatus === "cancelling" && (
            <ReactivateButton onReactivate={handleReactivate} />
          )}

          <button
            onClick={handleManageSubscription}
            className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium transition-all"
          >
            {t("billing.manageBtn")}
          </button>
        </div>
      )}

      {showCancelDialog && (
        <CancelDialog
          cancelAt={periodEndDate || (cancelAt ? new Date(cancelAt.seconds * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null)}
          onConfirm={handleCancel}
          onClose={() => setShowCancelDialog(false)}
          loading={cancelling}
        />
      )}
    </div>
  );
};

export default Billing;
