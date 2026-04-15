// src/components/billing/ReactivateButton.tsx — reactivate cancelled subscription via Paddle management URL

import React from "react";
import { useT } from "../../i18n";

interface ReactivateButtonProps {
  paddleUpdatePaymentUrl: string | null;
}

export const ReactivateButton: React.FC<ReactivateButtonProps> = ({ paddleUpdatePaymentUrl }) => {
  const { t } = useT();

  return (
    <button
      onClick={() => {
        if (paddleUpdatePaymentUrl) window.open(paddleUpdatePaymentUrl, "_blank");
      }}
      className="w-full py-2.5 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-600/20 transition-all"
    >
      {t("billing.cancelled.reactivate")}
    </button>
  );
};
