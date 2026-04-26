// functions/src/brandColorCompliance.ts — per-asset brand color compliance check

import type { BrandColorComplianceEntry } from "./types.js";

const HEX_RE = /^#[0-9a-f]{6}$/i;

function srgbToLinear(c: number): number {
    const normalized = c / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function srgbToLab(r: number, g: number, b: number): [number, number, number] {
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);

    const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
    const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
    const z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;

    const xn = 0.95047;
    const yn = 1.0;
    const zn = 1.08883;

    const fx = (t: number) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
    const L = 116 * fx(y / yn) - 16;
    const a = 500 * (fx(x / xn) - fx(y / yn));
    const bVal = 200 * (fx(y / yn) - fx(z / zn));

    return [L, a, bVal];
}

function ciede2000(lab1: [number, number, number], lab2: [number, number, number]): number {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cab = (C1 + C2) / 2;

    const Cab7 = Math.pow(Cab, 7);
    const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + Math.pow(25, 7))));

    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);

    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);

    const h1p = Math.atan2(b1, a1p) * 180 / Math.PI + (Math.atan2(b1, a1p) < 0 ? 360 : 0);
    const h2p = Math.atan2(b2, a2p) * 180 / Math.PI + (Math.atan2(b2, a2p) < 0 ? 360 : 0);

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    let dhp: number;
    if (C1p * C2p === 0) {
        dhp = 0;
    } else if (Math.abs(h2p - h1p) <= 180) {
        dhp = h2p - h1p;
    } else if (h2p - h1p > 180) {
        dhp = h2p - h1p - 360;
    } else {
        dhp = h2p - h1p + 360;
    }

    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

    const Lbp = (L1 + L2) / 2;
    const Cbp = (C1p + C2p) / 2;

    let hbp: number;
    if (C1p * C2p === 0) {
        hbp = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
        hbp = (h1p + h2p) / 2;
    } else if (h1p + h2p < 360) {
        hbp = (h1p + h2p + 360) / 2;
    } else {
        hbp = (h1p + h2p - 360) / 2;
    }

    const T = 1
        - 0.17 * Math.cos((hbp - 30) * Math.PI / 180)
        + 0.24 * Math.cos(2 * hbp * Math.PI / 180)
        + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180)
        - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);

    const SL = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const SC = 1 + 0.045 * Cbp;
    const SH = 1 + 0.015 * Cbp * T;

    const RT = -Math.sin(2 * (30 * Math.exp(-Math.pow((hbp - 275) / 25, 2))) * Math.PI / 180)
        * 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));

    const dE = Math.sqrt(
        Math.pow(dLp / SL, 2)
        + Math.pow(dCp / SC, 2)
        + Math.pow(dHp / SH, 2)
        + RT * (dCp / SC) * (dHp / SH)
    );

    return dE;
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): [number, number, number] {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

const skipNoBrand = (assetId: string): BrandColorComplianceEntry => ({
    assetId,
    checkRan: false,
    present: false,
    deltaE: null,
    dominantSwatch: null,
    deductedScore: 0,
    skippedReason: "no_brand_colors",
});

const skipUnanalyzable = (assetId: string): BrandColorComplianceEntry => ({
    assetId,
    checkRan: false,
    present: false,
    deltaE: null,
    dominantSwatch: null,
    deductedScore: 0,
    skippedReason: "image_unanalyzable",
});

export async function checkBrandColorCompliance(
    imageBuffer: Buffer,
    brandPrimary: string | null,
    assetId: string,
): Promise<BrandColorComplianceEntry> {
    if (!brandPrimary || !HEX_RE.test(brandPrimary)) {
        return skipNoBrand(assetId);
    }

    let pixels: Buffer;
    try {
        let sharpModule: any = null;
        try { sharpModule = require("sharp"); } catch { /* noop */ }
        if (!sharpModule) return skipUnanalyzable(assetId);

        let pipeline: any;
        try {
            pipeline = sharpModule(imageBuffer);
        } catch {
            return skipUnanalyzable(assetId);
        }

        pixels = await pipeline
            .resize(32, 32, { fit: "fill" })
            .removeAlpha()
            .raw()
            .toBuffer();
    } catch {
        return skipUnanalyzable(assetId);
    }

    const k = 5;
    const maxIter = 10;
    const totalPixels = 32 * 32;

    const centers: [number, number, number][] = [];
    for (let i = 0; i < k; i++) {
        const idx = Math.floor(i * totalPixels / k) * 3;
        centers.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }

    const assignments = new Uint8Array(totalPixels);

    for (let iter = 0; iter < maxIter; iter++) {
        for (let p = 0; p < totalPixels; p++) {
            const pr = pixels[p * 3];
            const pg = pixels[p * 3 + 1];
            const pb = pixels[p * 3 + 2];
            let minDist = Infinity;
            let minC = 0;
            for (let c = 0; c < k; c++) {
                const dr = pr - centers[c][0];
                const dg = pg - centers[c][1];
                const db = pb - centers[c][2];
                const d = dr * dr + dg * dg + db * db;
                if (d < minDist) { minDist = d; minC = c; }
            }
            assignments[p] = minC;
        }

        const sums = Array.from({ length: k }, () => [0, 0, 0, 0] as number[]);
        for (let p = 0; p < totalPixels; p++) {
            const c = assignments[p];
            sums[c][0] += pixels[p * 3];
            sums[c][1] += pixels[p * 3 + 1];
            sums[c][2] += pixels[p * 3 + 2];
            sums[c][3]++;
        }
        for (let c = 0; c < k; c++) {
            if (sums[c][3] > 0) {
                centers[c] = [
                    Math.round(sums[c][0] / sums[c][3]),
                    Math.round(sums[c][1] / sums[c][3]),
                    Math.round(sums[c][2] / sums[c][3]),
                ];
            }
        }
    }

    const brandRgb = hexToRgb(brandPrimary);
    const brandLab = srgbToLab(brandRgb[0], brandRgb[1], brandRgb[2]);

    let minDeltaE = Infinity;
    let closestIdx = 0;
    for (let c = 0; c < k; c++) {
        const centerLab = srgbToLab(centers[c][0], centers[c][1], centers[c][2]);
        const de = ciede2000(centerLab, brandLab);
        if (de < minDeltaE) {
            minDeltaE = de;
            closestIdx = c;
        }
    }

    const present = minDeltaE < 15;

    return {
        assetId,
        checkRan: true,
        present,
        deltaE: Math.round(minDeltaE * 100) / 100,
        dominantSwatch: rgbToHex(centers[closestIdx][0], centers[closestIdx][1], centers[closestIdx][2]),
        deductedScore: present ? 0 : 10,
    };
}
