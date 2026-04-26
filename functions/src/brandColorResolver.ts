// functions/src/brandColorResolver.ts — pure brand-color precedence resolver

import type { BrandColorPair, BrandColorSource } from "./types.js";

export interface ResolveBrandColorsInput {
    formPrimary?: string;
    formSecondary?: string;
    avatar?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
    sourceColdAd?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
    workspace?: { brandColorPrimary?: string; brandColorSecondary?: string } | null;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function normalizeHex(raw: string | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!HEX_RE.test(trimmed)) return null;
    return `#${trimmed.slice(1).toLowerCase()}`;
}

function wcagLuminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ctaTextColor(primary: string): "#FFFFFF" | "#1A1A1A" {
    return wcagLuminance(primary) < 0.5 ? "#FFFFFF" : "#1A1A1A";
}

interface SourceSlot {
    primary: string | null;
    secondary: string | null;
    label: BrandColorSource;
}

export function resolveBrandColors(input: ResolveBrandColorsInput): BrandColorPair {
    const sources: SourceSlot[] = [
        {
            primary: normalizeHex(input.formPrimary),
            secondary: normalizeHex(input.formSecondary),
            label: "form",
        },
        {
            primary: normalizeHex(input.avatar?.brandColorPrimary),
            secondary: normalizeHex(input.avatar?.brandColorSecondary),
            label: "avatar",
        },
        {
            primary: normalizeHex(input.sourceColdAd?.brandColorPrimary),
            secondary: normalizeHex(input.sourceColdAd?.brandColorSecondary),
            label: "inherited",
        },
        {
            primary: normalizeHex(input.workspace?.brandColorPrimary),
            secondary: normalizeHex(input.workspace?.brandColorSecondary),
            label: "workspace",
        },
    ];

    for (const slot of sources) {
        if (slot.primary !== null) {
            return {
                primary: slot.primary,
                secondary: slot.secondary,
                ctaTextColor: ctaTextColor(slot.primary),
                source: slot.label,
            };
        }
    }

    return { primary: null, secondary: null, ctaTextColor: null, source: "none" };
}
