// src/components/billing/PlanCard.tsx

import React from "react";
import { useT } from "../../i18n";

interface PlanCardProps {
  plan: string;
  billingStatus: string;
  isTrial: boolean;
  credits: number;
  nextResetDate: { seconds: number } | null;
  cancelAt: { seconds: number } | null;
  canUpgrade: boolean;
  onUpgrade: () => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  billingStatus,
  isTrial,
  credits,
  nextResetDate,
  cancelAt,
  canUpgrade,
  onUpgrade,
}) => {
  const { t } = useT();
  const planLabel = plan === "none"
    ? t('billing.noPlan')
    : plan.charAt(0).toUpperCase() + plan.slice(1);

  const badgeCls: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    trialing: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    past_due: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    cancelling: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    cancelled: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  };

  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">
            {isTrial ? t('billing.trial') : t('billing.planLabel', { plan: planLabel })}
          </h2>
          {nextResetDate && billingStatus === "active" && (
            <p className="text-xs text-slate-500 mt-0.5">
              {t('billing.resets', {
                date: new Date(nextResetDate.seconds * 1000).toLocaleDateString(undefined, { month: "long", day: "numeric" }),
              })}
            </p>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${badgeCls[billingStatus] || badgeCls.active}`}>
          {t(`billing.status.${billingStatus}`)}
        </span>
      </div>

      {isTrial && credits > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <p className="text-sm text-blue-300">
            {t('billing.trialCreditsRemaining', { count: credits })}
          </p>
        </div>
      )}

      {canUpgrade && (
        <button
          onClick={onUpgrade}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold transition-all"
        >
          {t('billing.upgradePlan')}
        </button>
      )}
    </div>
  );
};
