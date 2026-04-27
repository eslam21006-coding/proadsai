// src/utils/wcagContrast.ts — client-side WCAG luminance for CTA text auto-contrast

export function wcagLuminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ctaTextColor(primary: string): '#FFFFFF' | '#1A1A1A' {
    return wcagLuminance(primary) < 0.5 ? '#FFFFFF' : '#1A1A1A';
}
