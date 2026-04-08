// src/components/billing/CreditBar.tsx

import React from "react";
import { useT } from "../../i18n";

interface CreditBarProps {
  credits: number;
  creditsPerMonth: number;
}

export const CreditBar: React.FC<CreditBarProps> = ({ credits, creditsPerMonth }) => {
  const { t } = useT();
  const max = creditsPerMonth > 0 ? creditsPerMonth : Math.max(credits, 1);
  const pct = Math.min(100, Math.round((credits / max) * 100));
  const isLow = creditsPerMonth > 0 && credits < creditsPerMonth * 0.2;

  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('billing.credits')}</span>
        <span className="text-sm font-bold text-white">
          {credits.toLocaleString()} <span className="text-slate-500 font-normal">/ {max.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isLow ? "bg-amber-500" : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
