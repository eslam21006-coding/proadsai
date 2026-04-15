// src/components/billing/LowCreditsWarning.tsx — persistent banner when credits drop below 20%

import React from "react";
import { useT } from "../../i18n";

interface LowCreditsWarningProps {
  onTopUp: () => void;
}

export const LowCreditsWarning: React.FC<LowCreditsWarningProps> = ({ onTopUp }) => {
  const { t } = useT();

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-center gap-4">
      <p className="text-amber-300 text-sm font-semibold">
        {t("billing.lowCredits.warning")}
      </p>
      <button
        onClick={onTopUp}
        className="px-3 py-1 bg-amber-600/20 border border-amber-500/30 hover:bg-amber-600/30 rounded-lg text-xs font-bold text-amber-400 transition-all"
      >
        {t("billing.lowCredits.topupCta")}
      </button>
    </div>
  );
};
