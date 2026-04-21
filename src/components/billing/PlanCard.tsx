// src/components/billing/PlanCard.tsx — current plan display card

import React from "react";
import { useT } from "../../i18n";
import { PLANS, type UserPlan } from "../../planconfig";

interface PlanCardProps {
  plan: string;
  billingStatus: string;
  billingType: string | null;
  isTrial: boolean;
  credits: number;
  creditsPerMonth: number;
  nextResetDate: { seconds: number; nanoseconds: number } | null;
  cancelAt: { seconds: number; nanoseconds: number } | null;
  canUpgrade: boolean;
  onUpgrade: () => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  billingStatus,
  billingType,
  isTrial,
  credits,
  creditsPerMonth,
  nextResetDate,
  cancelAt,
  canUpgrade,
  onUpgrade,
}) => {
  const { t } = useT();
  const planConfig = PLANS[plan as UserPlan];

  const statusColor =
    billingStatus === "active"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : billingStatus === "cancelling"
        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
        : billingStatus === "past_due"
          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
          : "bg-slate-500/10 text-slate-400 border-slate-500/20";

  const formatDate = (d: { seconds: number; nanoseconds: number } | null) => {
    if (!d) return null;
    return new Date(d.seconds * 1000).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  };

  return (
    <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">{t("billing.planCard.plan")}</p>
          <p className="text-lg font-black text-white mt-1">{planConfig?.name || plan}</p>
          {isTrial && <p className="text-[10px] text-amber-400 font-medium">{t("billing.trialBadge")}</p>}
        </div>
        <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase border ${statusColor}`}>
          {billingStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {billingType && (
          <div>
            <span className="text-slate-500">{t("billing.planCard.billingType")}</span>
            <p className="text-slate-300 font-medium capitalize">{billingType}</p>
          </div>
        )}
        {nextResetDate && (
          <div>
            <span className="text-slate-500">{t("billing.planCard.nextReset")}</span>
            <p className="text-slate-300 font-medium">{formatDate(nextResetDate)}</p>
          </div>
        )}
      </div>

      {canUpgrade && (
        <button
          onClick={onUpgrade}
          className="w-full py-2.5 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm font-bold hover:bg-blue-600/20 transition-all"
        >
          {t("billing.upgradeBtn")}
        </button>
      )}
    </div>
  );
};
