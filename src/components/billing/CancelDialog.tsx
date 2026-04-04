// src/components/billing/CancelDialog.tsx

import React, { useState } from "react";
import type { CancellationReason } from "../../hooks/useBillingState";

interface CancelDialogProps {
  cancelAt: string | null;
  onConfirm: (reason: CancellationReason, feedback?: string) => void;
  onClose: () => void;
  loading: boolean;
}

const REASONS: { value: CancellationReason; label: string }[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using_enough", label: "Not using enough" },
  { value: "switching_competitor", label: "Switching to competitor" },
  { value: "missing_features", label: "Missing features" },
  { value: "other", label: "Other" },
];

export const CancelDialog: React.FC<CancelDialogProps> = ({
  cancelAt,
  onConfirm,
  onClose,
  loading,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [feedback, setFeedback] = useState("");

  const dateText = cancelAt
    ? <>Your access continues until <span className="font-semibold text-yellow-400">{cancelAt}</span>.</>
    : <>Your access continues until the end of your current billing period.</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 space-y-4">
        {step === 1 && (
          <>
            <h3 className="text-lg font-bold text-white">Cancel Subscription?</h3>
            <p className="text-sm text-slate-300">
              {dateText}{" "}Are you sure you want to cancel?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-all"
              >
                Keep Subscription
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
            <h3 className="text-lg font-bold text-white">Why are you cancelling?</h3>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as CancellationReason)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Select a reason...</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional feedback..."
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
                onClick={() => reason && onConfirm(reason as CancellationReason, feedback || undefined)}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition-all"
              >
                {loading ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
