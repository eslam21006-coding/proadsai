// src/components/billing/CreditBar.tsx — credit usage progress bar

import React from "react";
import { useT } from "../../i18n";

interface CreditBarProps {
  credits: number;
  creditsPerMonth: number;
}

export const CreditBar: React.FC<CreditBarProps> = ({ credits, creditsPerMonth }) => {
  const { t } = useT();
  const pct = creditsPerMonth > 0 ? Math.min(100, Math.round((credits / creditsPerMonth) * 100)) : 0;
  const isLow = pct < 20;

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium">{t("billing.credits")}</span>
        <span className="text-xs text-slate-300">
          {credits.toLocaleString()} / {creditsPerMonth.toLocaleString()}
        </span>
      </div>
      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isLow ? "bg-rose-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isLow && (
        <p className="text-[10px] text-rose-400">{t("billing.creditsLow")}</p>
      )}
    </div>
  );
};
