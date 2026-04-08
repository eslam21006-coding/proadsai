// src/components/billing/PaymentFailedAlert.tsx

import React from "react";
import { useT } from "../../i18n";

interface PaymentFailedAlertProps {
  gracePeriodEndsAt: { seconds: number; nanoseconds: number } | null;
  onUpdatePayment: () => void;
}

export const PaymentFailedAlert: React.FC<PaymentFailedAlertProps> = ({
  gracePeriodEndsAt,
  onUpdatePayment,
}) => {
  const { t } = useT();
  let countdown = "";
  if (gracePeriodEndsAt) {
    const endMs = gracePeriodEndsAt.seconds * 1000;
    const daysLeft = Math.max(0, Math.ceil((endMs - Date.now()) / (1000 * 60 * 60 * 24)));
    countdown = daysLeft === 1 ? "1 day remaining" : `${daysLeft} days remaining`;
  }

  return (
    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <i className="fa-solid fa-triangle-exclamation text-rose-400 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-rose-300">{t('billing.paymentFailed')}</p>
          <p className="text-xs text-slate-400">
            {t('billing.paymentFailedDesc')}
            {countdown && <span className="text-rose-400 font-semibold ml-1">({countdown})</span>}
          </p>
        </div>
      </div>
      <button
        onClick={onUpdatePayment}
        className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-all"
      >
        {t('billing.updatePaymentBtn')}
      </button>
    </div>
  );
};
