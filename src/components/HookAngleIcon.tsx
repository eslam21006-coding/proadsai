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
    const tooltipAr = state.tooltipAr
        ? t(tooltipArKey(state.icon, state.tooltipAr))
        : t(fallbackKey(state.icon));
    return (
        <span
            className={`inline-flex items-center text-[10px] ${className || ""}`}
            title={tooltipAr}
            aria-label={tooltipAr}
        >
            <span aria-hidden="true">{state.icon}</span>
        </span>
    );
}

// Local i18n bridge: the backend passes a key from the i18n dictionary
// (e.g. "hook_icon.tooltip.strongest") OR a runtime-substituted string.
// We pass-through to useT which understands both kinds.
function tooltipArKey(icon: "🔥" | "✅" | "⚠️", raw: string): string {
    // If the raw is already a translation key, return as-is. Otherwise
    // fall back to the icon's static label.
    if (raw.includes(".")) return raw;
    return fallbackKey(icon);
}

function fallbackKey(icon: "🔥" | "✅" | "⚠️"): string {
    if (icon === "🔥") return "hook_icon.tooltip.strongest";
    if (icon === "✅") return "hook_icon.tooltip.good";
    return "hook_icon.tooltip.weak";
}
