// src/components/billing/CancelDialog.tsx — 2-step cancellation dialog with reason logging

import React, { useState } from "react";
import { useT } from "../../i18n";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import type { CancellationReason } from "../../hooks/useBillingState";

interface CancelDialogProps {
  cancelAt: string | null;
  paddleCancelUrl: string | null;
  uid: string;
  email: string | null;
  plan: string;
  onConfirm: (reason: CancellationReason, feedback?: string) => void;
  onClose: () => void;
  loading: boolean;
}

const REASONS: { value: CancellationReason; labelKey: string }[] = [
  { value: "too_expensive", labelKey: "billing.cancel.reasons.too_expensive" },
  { value: "not_using_enough", labelKey: "billing.cancel.reasons.not_using_enough" },
  { value: "switching_competitor", labelKey: "billing.cancel.reasons.switching_competitor" },
  { value: "missing_features", labelKey: "billing.cancel.reasons.missing_features" },
  { value: "other", labelKey: "billing.cancel.reasons.other" },
];

export const CancelDialog: React.FC<CancelDialogProps> = ({
  cancelAt,
  paddleCancelUrl,
  uid,
  email,
  plan,
  onConfirm,
  onClose,
  loading,
}) => {
  const { t } = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [feedback, setFeedback] = useState("");

  const dateText = cancelAt
    ? t("billing.cancel.periodEnd") + " " + cancelAt
    : t("billing.cancel.periodEnd");

  const handleSubmit = async () => {
    if (!reason) return;
    // Write cancellation log
    try {
      await setDoc(doc(db, "cancellation_logs", `${uid}_${Date.now()}`), {
        uid,
        email: email || "",
        plan,
        reason,
        feedback: feedback || null,
        createdAt: new Date(),
      });
    } catch (e) {
      console.warn("Failed to write cancellation log:", e);
    }
    // Open Paddle cancel page
    if (paddleCancelUrl) {
      window.open(paddleCancelUrl, "_blank");
    }
    onConfirm(reason as CancellationReason, feedback || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 space-y-4">
        {step === 1 && (
          <>
            <h3 className="text-lg font-bold text-white">{t("billing.cancel.confirm")}</h3>
            <p className="text-sm text-slate-300">{dateText}</p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-all"
              >
                {t("billing.cancel.button").replace("Cancel Subscription", "Keep Subscription")}
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-all"
              >
                Continue
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h3 className="text-lg font-bold text-white">{t("billing.cancel.reasonLabel")}</h3>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as CancellationReason)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Select a reason...</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </option>
              ))}
            </select>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t("billing.cancel.feedbackLabel")}
              rows={3}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 resize-none"
            />
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-all"
              >
                Back
              </button>
              <button
                disabled={!reason || loading}
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition-all"
              >
                {loading ? "Cancelling..." : t("billing.cancel.submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
