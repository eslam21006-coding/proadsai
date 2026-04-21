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
import { PLANS, type UserPlan } from "../planconfig";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const createPaddleCheckoutFn = httpsCallable(functions, "createPaddleCheckout");

function formatDate(ts: { seconds: number; nanoseconds: number } | null): string | null {
  if (!ts) return null;
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

export const Billing: React.FC = () => {
  const { billingState, loading: isLoading } = useBillingState();
  const { showToast, setShowUpgradeModal, user } = useAppStore();
  const { t } = useT();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const prevCreditsRef = React.useRef<number | null>(null);

  // Detect top-up success: credits increased without a local generation action
  React.useEffect(() => {
    if (!billingState) return;
    const curr = billingState.credits;
    const prev = prevCreditsRef.current;
    prevCreditsRef.current = curr;
    if (prev !== null && curr > prev) {
      showToast(t("billing.topup.success").replace("{credits}", String(curr - prev)), "success");
    }
  }, [billingState?.credits]);

  const handleTopUp = useCallback(async (packId: string) => {
    // Success toast fires when billingState.credits increases (detected by useEffect above)
  }, []);

  const handleCancel = useCallback(async (reason: string, feedback?: string) => {
    setCancelling(true);
    try {
      if (billingState?.paddleCancelUrl) {
        window.open(billingState.paddleCancelUrl, "_blank");
      }
      setShowCancelDialog(false);
      showToast(t("billing.cancelScheduled"), "success");
    } catch (e: any) {
      showToast(e?.message || t("billing.error.unknown"), "error");
    } finally {
      setCancelling(false);
    }
  }, [billingState, showToast, t]);

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
    billingType, cancelAt, canUpgrade, canTopUp,
    isTeamMember, teamOwnerName, gracePeriodEndsAt,
    paddleUpdatePaymentUrl, paddleCancelUrl,
    pendingPlan, pendingPlanEffectiveAt, nextResetDate,
  } = billingState;

  const isLowCredits = creditsPerMonth > 0 && credits > 0 && credits < creditsPerMonth * 0.2;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
        {isTeamMember && (
          <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
            {teamOwnerName
              ? `${t("billing.team.readOnly")} — ${t("billing.team.ownerLabel").replace("{ownerName}", teamOwnerName)}`
              : t("billing.teamReadOnly")}
          </span>
        )}
      </div>

      {/* Trial banner */}
      {isTrial && credits > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-amber-300 font-semibold">{t("billing.trial.active")}</p>
          </div>
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-bold transition-all"
          >
            {t("billing.trial.upgradeCta")}
          </button>
        </div>
      )}
      {isTrial && credits === 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center justify-between">
          <p className="text-rose-300 font-semibold">{t("billing.trial.expired")}</p>
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm font-bold transition-all"
          >
            {t("billing.trial.upgradeCta")}
          </button>
        </div>
      )}

      {/* Payment failed alert */}
      {billingStatus === "past_due" && (
        <PaymentFailedAlert
          gracePeriodEndsAt={gracePeriodEndsAt}
          onUpdatePayment={() => {
            if (paddleUpdatePaymentUrl) window.open(paddleUpdatePaymentUrl, "_blank");
          }}
        />
      )}

      {/* Cancelling notice */}
      {billingStatus === "cancelling" && cancelAt && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
          <p className="text-yellow-300 font-semibold">
            {t("billing.cancelledUntil").replace("{date}", formatDate(cancelAt) || "")}
          </p>
          <ReactivateButton paddleUpdatePaymentUrl={paddleUpdatePaymentUrl || null} />
        </div>
      )}

      {/* Pending downgrade notice */}
      {pendingPlan && pendingPlanEffectiveAt && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <p className="text-blue-300 font-semibold">
            {t("billing.pendingDowngrade.notice")
              .replace("{plan}", PLANS[pendingPlan as UserPlan]?.name || pendingPlan)
              .replace("{date}", formatDate(pendingPlanEffectiveAt) || "")}
          </p>
        </div>
      )}

      <PlanCard
        plan={plan}
        billingStatus={billingStatus}
        billingType={billingType}
        isTrial={isTrial}
        credits={credits}
        creditsPerMonth={creditsPerMonth}
        nextResetDate={nextResetDate}
        cancelAt={cancelAt}
        canUpgrade={canUpgrade}
        onUpgrade={() => setShowUpgradeModal(true)}
      />

      <CreditBar credits={credits} creditsPerMonth={creditsPerMonth} />

      {/* Low credits warning */}
      {isLowCredits && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
          <p className="text-amber-300 font-semibold">{t("billing.lowCredits.warning")}</p>
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="px-4 py-2 bg-amber-600/20 border border-amber-500/30 hover:bg-amber-600/30 rounded-lg text-sm font-bold text-amber-400 transition-all"
          >
            {t("billing.lowCredits.topupCta")}
          </button>
        </div>
      )}

      {/* Upgrade CTA */}
      {canUpgrade && !isTeamMember && (() => {
        const UPGRADE_ORDER: UserPlan[] = ['starter', 'pro', 'scale'];
        const currentIdx = UPGRADE_ORDER.indexOf(plan as UserPlan);
        const nextTier = currentIdx >= 0 && currentIdx < UPGRADE_ORDER.length - 1
          ? UPGRADE_ORDER[currentIdx + 1] : null;
        if (!nextTier) return null;
        const nextPlan = PLANS[nextTier];
        return (
          <div className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
            <p className="text-blue-300 font-semibold">
              {t("billing.upgrade.cta").replace("{plan}", nextPlan?.name || nextTier)}
            </p>
            <button
              onClick={async () => {
                try {
                  const priceId = nextPlan?.paddlePriceId?.monthly;
                  if (!priceId) return;
                  const result = await createPaddleCheckoutFn({ priceId }) as any;
                  const data = result.data as any;
                  if (data?.transactionId && (window as any).Paddle) {
                    (window as any).Paddle.Checkout.open({
                      settings: { displayMode: "overlay" },
                      transactionId: data.transactionId,
                    });
                  } else if (data?.checkoutUrl) {
                    window.open(data.checkoutUrl, "_blank");
                  }
                } catch (e: any) {
                  showToast(e?.message || t("billing.error.unknown"), "error");
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-bold transition-all"
            >
              {t("billing.trial.upgradeCta")}
            </button>
          </div>
        );
      })()}

      {/* Action buttons — hidden for team members */}
      {!isTeamMember && billingStatus !== "cancelled" && (
        <div className="space-y-4">
          <TopUpSelector canTopUp={canTopUp} onBuy={handleTopUp} />

          {/* Update Payment Method */}
          {paddleUpdatePaymentUrl && (
            <button
              onClick={() => window.open(paddleUpdatePaymentUrl, "_blank")}
              className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-sm font-medium transition-all"
            >
              {t("billing.manage.updatePayment")}
            </button>
          )}

          {/* Cancel Subscription */}
          {billingStatus === "active" && (
            <button
              onClick={() => setShowCancelDialog(true)}
              className="w-full py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 text-sm font-medium transition-all"
            >
              {t("billing.cancelBtn")}
            </button>
          )}
        </div>
      )}

      {showCancelDialog && (
        <CancelDialog
          cancelAt={formatDate(cancelAt)}
          paddleCancelUrl={paddleCancelUrl || null}
          uid={user?.uid || ""}
          email={user?.email || null}
          plan={plan}
          onConfirm={handleCancel}
          onClose={() => setShowCancelDialog(false)}
          loading={cancelling}
        />
      )}
    </div>
  );
};

export default Billing;
