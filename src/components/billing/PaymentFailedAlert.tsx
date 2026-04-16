// src/components/billing/PaymentFailedAlert.tsx — alert for past_due billing with grace period countdown

import React, { useState, useEffect } from "react";
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
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!gracePeriodEndsAt) return;
    const end = gracePeriodEndsAt.seconds * 1000;
    const update = () => {
      const diff = end - Date.now();
      setDaysLeft(diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [gracePeriodEndsAt]);

  return (
    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-circle-exclamation text-rose-400" />
        <p className="text-rose-300 font-semibold text-sm">{t("billing.paymentFailed.title")}</p>
      </div>
      {daysLeft !== null && daysLeft > 0 && (
        <p className="text-xs text-slate-400">
          {t("billing.paymentFailed.graceCountdown").replace("{days}", String(daysLeft))}
        </p>
      )}
      <button
        onClick={onUpdatePayment}
        className="w-full py-2 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-300 text-sm font-bold hover:bg-rose-600/30 transition-all"
      >
        {t("billing.paymentFailed.updateMethod")}
      </button>
    </div>
  );
};
