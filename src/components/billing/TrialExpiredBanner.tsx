// src/components/billing/TrialExpiredBanner.tsx — persistent banner for expired trial users

import React from "react";
import { useT } from "../../i18n";

interface TrialExpiredBannerProps {
  onUpgrade: () => void;
}

export const TrialExpiredBanner: React.FC<TrialExpiredBannerProps> = ({ onUpgrade }) => {
  const { t } = useT();

  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] bg-rose-600/95 backdrop-blur-sm border-b border-rose-500/50 px-4 py-3 flex items-center justify-center gap-4">
      <p className="text-white text-sm font-semibold">
        {t("billing.trial.expired")}
      </p>
      <button
        onClick={onUpgrade}
        className="px-4 py-1.5 bg-white text-rose-600 rounded-lg text-sm font-bold hover:bg-rose-50 transition-all"
      >
        {t("billing.trial.upgradeCta")}
      </button>
    </div>
  );
};
