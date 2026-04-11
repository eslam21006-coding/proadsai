// src/components/billing/TopUpSelector.tsx

import React from "react";
import { TOPUP_PACKS } from "../../planconfig";
import { useT } from "../../i18n";

interface TopUpSelectorProps {
  canTopUp: boolean;
  onBuy: (packId: string) => void;
}

const PACK_ID_MAP: Record<string, string> = {
  small: "topup_100",
  medium: "topup_300",
  large: "topup_800",
};

export const TopUpSelector: React.FC<TopUpSelectorProps> = ({ canTopUp, onBuy }) => {
  const { t } = useT();
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-300">{t('billing.topUpCredits')}</h3>
      <div className="grid grid-cols-3 gap-3">
        {TOPUP_PACKS.map((pack) => (
          <button
            key={pack.id}
            disabled={!canTopUp}
            onClick={() => onBuy(PACK_ID_MAP[pack.id] || pack.id)}
            className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center hover:border-blue-500/50 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all group"
          >
            <p className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
              {pack.credits}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{t('billing.creditsLabel')}</p>
            <p className="text-sm font-semibold text-slate-300 mt-2">${pack.price}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
