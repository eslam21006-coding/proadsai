// src/components/HookAngleIcon.tsx
// Phase 14 Layer 6 — Hook-angle performance icon + tooltip.
// Pure presentation: the parent fetches the per-angle icon state via
// `getHookAnglePerformance` and passes it in. NO numbers, NO
// percentages, NO English acronyms (CTR / CPA / CPM) in the tooltip
// (FR-019, SC-11). Plain Fusha only.

import React from "react";
import { useT } from "../i18n";

export interface HookAngleIconState {
    icon: "🔥" | "✅" | "⚠️" | null;
    tooltipAr: string | null;
}

interface HookAngleIconProps {
    state: HookAngleIconState | null | undefined;
    className?: string;
}

export function HookAngleIcon({ state, className }: HookAngleIconProps): React.ReactElement | null {
    const { t } = useT();
    if (!state || !state.icon) return null;
    // The backend returns already-final Fusha text for tooltipAr (static
    // AR_S_* constants for the 🔥/✅ cases, and a dynamic string with
    // the best-2 angle names interpolated for the ⚠️ case). Calling t()
    // on a literal AR_S_* value is a no-op (it's not an i18n key), so we
    // only go through t() for the static-fallback path. The runtime
    // tooltip (which the backend built using AR_S_* interpolation)
    // is used as-is.
    const tooltipAr = state.tooltipAr
        ? (state.tooltipAr.includes(".")
            ? t(state.tooltipAr) // treat as key (fallback path)
            : state.tooltipAr)   // already final Arabic text
        : (state.icon === "🔥"
            ? t("hook_icon.tooltip.strongest")
            : state.icon === "✅"
                ? t("hook_icon.tooltip.good")
                : t("hook_icon.tooltip.weak"));
    return (
        <span
            role="img"
            className={`inline-flex items-center text-[10px] ${className || ""}`}
            title={tooltipAr}
            aria-label={tooltipAr}
        >
            <span aria-hidden="true">{state.icon}</span>
        </span>
    );
}