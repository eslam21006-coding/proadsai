/**
 * textCompositing.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * ARABIC TEXT COMPOSITING — Sharp SVG overlay for hook text on rendered images
 * ═══════════════════════════════════════════════════════════════════════════
 * Arabic text is ALWAYS rendered by this module, never by any AI model.
 * This runs as the absolute final step after both Route A (fal.ai) and Route B (Gemini).
 */

import * as fs from "fs";
import * as path from "path";
import type { BrandColorPair } from "./types.js";

let sharp: any = null;
try {
    sharp = require('sharp');
} catch {
    console.warn('⚠️ Sharp not available — text compositor disabled. Install: npm install sharp');
}

// ─── INTERFACES ──────────────────────────────────────────────────────────

export interface TextZone {
    horizontalPosition: 'left' | 'center' | 'right';
    verticalPosition: 'top' | 'center' | 'bottom';
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
    zoneBaseColor: string;
    zoneLuminosity: 'dark' | 'light' | 'mid';
}

export interface TextStyle {
    color: string;
    strokeColor: string;
    strokeWidth: number;
    shadowEnabled: boolean;
    shadowColor: string | null;
    shadowBlur: number | null;
    backgroundTreatment: 'none' | 'frosted_pill' | 'solid_pill' | 'gradient_band';
    backgroundTreatmentColor: string;
    fontSize: 'large' | 'medium' | 'small';
    fontWeight: 'bold' | 'regular';
    textAlign: 'right' | 'center' | 'left';
    lineHeightMultiplier: number;
}

// ─── FONT LOADING (once at module scope) ─────────────────────────────────

let fontBase64Cache: string | null = null;

function loadFontBase64(): string {
    if (fontBase64Cache) return fontBase64Cache;
    try {
        const fontPath = path.join(__dirname, 'assets', 'CairoBold.ttf');
        const fontBuffer = fs.readFileSync(fontPath);
        fontBase64Cache = fontBuffer.toString('base64');
        return fontBase64Cache;
    } catch (err) {
        console.error('❌ Failed to load CairoBold.ttf:', err);
        return '';
    }
}

// ─── SIZE MAP ────────────────────────────────────────────────────────────

const FONT_SIZE_PX: Record<string, number> = {
    large: 64,
    medium: 48,
    small: 36,
};

// Approximate characters per line at each size (for 1024px canvas zone)
const CHARS_PER_LINE: Record<string, number> = {
    large: 18,
    medium: 24,
    small: 32,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Split Arabic text at word boundaries to fit within a zone width.
 * Returns array of line strings.
 */
function splitArabicLines(text: string, maxCharsPerLine: number): string[] {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length > maxCharsPerLine && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [text];
}

/**
 * Convert hex color with optional alpha to rgba for SVG.
 * Supports: #RRGGBB, #RRGGBBAA
 */
function hexToRgba(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length === 8) {
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        const a = parseInt(clean.slice(6, 8), 16) / 255;
        return `rgba(${r},${g},${b},${a.toFixed(2)})`;
    }
    return hex;
}

// ─── MAIN COMPOSITING FUNCTION ───────────────────────────────────────────

/**
 * Composite Arabic hook text onto a rendered image using Sharp.
 *
 * @param imageBase64 - Base64 image (with or without data: prefix)
 * @param hookText - Arabic hook text to render
 * @param textZone - Zone placement from layoutSpec
 * @param textStyle - Text styling from layoutSpec
 * @param canvasWidth - Canvas width in pixels (e.g. 1024)
 * @param canvasHeight - Canvas height in pixels (e.g. 1024)
 * @returns Base64 JPEG string with data: prefix, or null on failure
 */
export async function compositeArabicText(
    imageBase64: string,
    hookText: string,
    textZone: TextZone,
    textStyle: TextStyle,
    canvasWidth: number,
    canvasHeight: number,
    brand?: BrandColorPair,
): Promise<string | null> {
    if (!sharp) {
        console.warn('⚠️ Sharp not available — text compositing skipped.');
        return null;
    }

    if (!hookText || !hookText.trim()) {
        console.log('ℹ️ Text compositing: no hook text provided, returning original image.');
        return imageBase64;
    }

    try {
        // ─── 1. Parse image buffer ──────────────────────────────────
        const rawBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const imageBuffer = Buffer.from(rawBase64, 'base64');

        // ─── 2. Convert zone percentages to pixels ─────────────────
        const zoneX = Math.round((textZone.xPercent / 100) * canvasWidth);
        const zoneY = Math.round((textZone.yPercent / 100) * canvasHeight);
        const zoneW = Math.round((textZone.widthPercent / 100) * canvasWidth);
        const zoneH = Math.round((textZone.heightPercent / 100) * canvasHeight);

        // ─── 3. Resolve font size and line splitting ────────────────
        const fontSize = FONT_SIZE_PX[textStyle.fontSize] || 48;
        const scaledFontSize = Math.round(fontSize * (canvasWidth / 1024));
        const maxChars = CHARS_PER_LINE[textStyle.fontSize] || 24;
        // Adjust maxChars based on actual zone width vs full canvas
        const zoneWidthRatio = textZone.widthPercent / 100;
        const adjustedMaxChars = Math.max(8, Math.round(maxChars * zoneWidthRatio));
        const lines = splitArabicLines(hookText, adjustedMaxChars);
        const lineHeight = scaledFontSize * (textStyle.lineHeightMultiplier || 1.4);

        // ─── 4. Calculate text anchor position ──────────────────────
        const anchor = textStyle.textAlign === 'right' ? 'end'
            : textStyle.textAlign === 'center' ? 'middle'
                : 'start';

        let textX: number;
        if (textStyle.textAlign === 'right') {
            textX = zoneX + zoneW - 10;
        } else if (textStyle.textAlign === 'center') {
            textX = zoneX + zoneW / 2;
        } else {
            textX = zoneX + 10;
        }

        // Vertically center the text block within the zone
        const totalTextHeight = lines.length * lineHeight;
        const startY = zoneY + (zoneH - totalTextHeight) / 2 + scaledFontSize * 0.35;

        // ─── 5. Build SVG ───────────────────────────────────────────
        const svgElements: string[] = [];

        // Load font for embedding
        const fontB64 = loadFontBase64();
        const fontFaceRule = fontB64
            ? `@font-face { font-family: 'CairoBold'; src: url(data:font/truetype;base64,${fontB64}) format('truetype'); font-weight: 700; font-style: normal; }`
            : '';

        const fontFamily = fontB64 ? 'CairoBold' : "Cairo, Tajawal, 'Noto Kufi Arabic', Arial, sans-serif";
        const _headlineColor = (brand && brand.secondary) ? brand.secondary : textStyle.color;

        // 5a. Background treatment
        if (textStyle.backgroundTreatment !== 'none') {
            const bgColor = hexToRgba(textStyle.backgroundTreatmentColor || textZone.zoneBaseColor);
            const padding = 16;
            const bgX = zoneX - padding;
            const bgY = zoneY - padding;
            const bgW = zoneW + padding * 2;
            const bgH = zoneH + padding * 2;

            if (textStyle.backgroundTreatment === 'frosted_pill') {
                const rx = 16;
                svgElements.push(`<rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" rx="${rx}" ry="${rx}" fill="${bgColor}" />`);
            } else if (textStyle.backgroundTreatment === 'solid_pill') {
                const rx = 12;
                svgElements.push(`<rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" rx="${rx}" ry="${rx}" fill="${bgColor}" />`);
            } else if (textStyle.backgroundTreatment === 'gradient_band') {
                svgElements.push(`<rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" fill="${bgColor}" />`);
            }
        }

        // 5b. Text lines
        for (let i = 0; i < lines.length; i++) {
            const lineY = startY + i * lineHeight;
            const strokeAttrs = textStyle.strokeWidth > 0
                ? ` stroke="${textStyle.strokeColor}" stroke-width="${textStyle.strokeWidth}" paint-order="stroke fill"`
                : '';
            const shadowFilter = textStyle.shadowEnabled && textStyle.shadowColor
                ? ` filter="url(#textShadow)"`
                : '';

            svgElements.push(
                `<text x="${textX}" y="${lineY}" fill="${_headlineColor}" ` +
                `font-size="${scaledFontSize}" font-weight="${textStyle.fontWeight === 'bold' ? 700 : 400}" ` +
                `font-family="${fontFamily}" ` +
                `text-anchor="${anchor}" dominant-baseline="central" ` +
                `direction="rtl" xml:lang="ar"` +
                `${strokeAttrs}${shadowFilter}>${escapeXml(lines[i])}</text>`
            );
        }

        // 5c. Shadow filter definition
        let defsContent = '';
        if (textStyle.shadowEnabled && textStyle.shadowColor && textStyle.shadowBlur) {
            defsContent += `<filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="${textStyle.shadowBlur}" flood-color="${textStyle.shadowColor}" flood-opacity="0.7"/>
      </filter>`;
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <defs>
    <style>${fontFaceRule}</style>
    ${defsContent}
  </defs>
  ${svgElements.join('\n  ')}
</svg>`;

        // ─── 6. Composite and output ────────────────────────────────
        const svgBuffer = Buffer.from(svg, 'utf-8');
        const result = await sharp(imageBuffer)
            .composite([{ input: svgBuffer, top: 0, left: 0 }])
            .jpeg({ quality: 92 })
            .toBuffer();

        const resultBase64 = `data:image/jpeg;base64,${result.toString('base64')}`;
        console.log(`✅ Arabic text composited: ${lines.length} lines, fontSize=${scaledFontSize}px, zone=${textZone.widthPercent}%×${textZone.heightPercent}%`);
        return resultBase64;
    } catch (err) {
        console.error('❌ Arabic text compositing failed:', err);
        return null;
    }
}

/**
 * Safe default layout spec for fallback scenarios.
 */
export function getDefaultTextZone(): TextZone {
    return {
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        xPercent: 5,
        yPercent: 65,
        widthPercent: 90,
        heightPercent: 30,
        zoneBaseColor: '#0a1628',
        zoneLuminosity: 'dark',
    };
}

export function getDefaultTextStyle(): TextStyle {
    return {
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 2,
        shadowEnabled: false,
        shadowColor: null,
        shadowBlur: null,
        backgroundTreatment: 'none',
        backgroundTreatmentColor: '#0a162880',
        fontSize: 'large',
        fontWeight: 'bold',
        textAlign: 'right',
        lineHeightMultiplier: 1.4,
    };
}

export function isTextCompositingAvailable(): boolean {
    return sharp !== null;
}

// ─── FULL AD TEXT INTERFACE ─────────────────────────────────────────────

export interface FullAdText {
    hookText: string;              // Main headline (largest)
    subheadText: string;           // Subheadline (medium)
    ctaText: string;               // CTA button text (medium, with pill bg)
    benefitText: string;           // Benefit line (small)
    targetAudienceText: string;    // Target audience descriptor (smallest, muted)
}

// ─── FULL AD TEXT COMPOSITING ───────────────────────────────────────────

/**
 * Composite ALL ad text elements onto a rendered image.
 * Used for Route A (fal.ai) where images are generated text-free.
 *
 * Renders 5 text layers vertically stacked within the textZone:
 *   1. Hook/headline (largest, bold)
 *   2. Subheadline (70% of hook size, regular weight)
 *   3. CTA button (medium, bold, with pill background)
 *   4. Benefit line (small, regular)
 *   5. Target audience (small, muted 60% opacity)
 *
 * Empty strings are skipped — no space is reserved for them.
 */
export async function compositeFullAdText(
    imageBase64: string,
    fullText: FullAdText,
    textZone: TextZone,
    textStyle: TextStyle,
    canvasWidth: number,
    canvasHeight: number,
    brand?: BrandColorPair,
): Promise<string | null> {
    if (!sharp) {
        console.warn('⚠️ Sharp not available — full text compositing skipped.');
        return null;
    }

    // If no text at all, return original
    const hasAnyText = fullText.hookText.trim() || fullText.subheadText.trim() ||
        fullText.ctaText.trim() || fullText.benefitText.trim() || fullText.targetAudienceText.trim();
    if (!hasAnyText) {
        return imageBase64;
    }

    try {
        // ─── 1. Parse image buffer ──────────────────────────────────
        const rawBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const imageBuffer = Buffer.from(rawBase64, 'base64');

        // ─── 2. Zone coordinates ────────────────────────────────────
        const zoneX = Math.round((textZone.xPercent / 100) * canvasWidth);
        const zoneY = Math.round((textZone.yPercent / 100) * canvasHeight);
        const zoneW = Math.round((textZone.widthPercent / 100) * canvasWidth);
        const zoneH = Math.round((textZone.heightPercent / 100) * canvasHeight);

        // ─── 3. Font and layout config ──────────────────────────────
        const scale = canvasWidth / 1024;
        const GAP = Math.round(12 * scale);  // gap between sections
        const CTA_PADDING_X = Math.round(32 * scale);
        const CTA_PADDING_Y = Math.round(12 * scale);
        const CTA_RADIUS = Math.round(12 * scale);

        // Font sizes per element type
        const hookFontSize = Math.round((FONT_SIZE_PX[textStyle.fontSize] || 48) * scale);
        const subheadFontSize = Math.round(hookFontSize * 0.65);
        const ctaFontSize = Math.round(hookFontSize * 0.55);
        const benefitFontSize = Math.round(hookFontSize * 0.45);
        const audienceFontSize = Math.round(hookFontSize * 0.38);

        // Line chars per zone width
        const zoneWidthRatio = textZone.widthPercent / 100;

        // Load font
        const fontB64 = loadFontBase64();
        const fontFaceRule = fontB64
            ? `@font-face { font-family: 'CairoBold'; src: url(data:font/truetype;base64,${fontB64}) format('truetype'); font-weight: 700; font-style: normal; }`
            : '';
        const fontFamily = fontB64 ? 'CairoBold' : "Cairo, Tajawal, 'Noto Kufi Arabic', Arial, sans-serif";

        // Text anchor from alignment
        const anchor = textStyle.textAlign === 'right' ? 'end'
            : textStyle.textAlign === 'center' ? 'middle' : 'start';
        let textX: number;
        if (textStyle.textAlign === 'right') {
            textX = zoneX + zoneW - 10;
        } else if (textStyle.textAlign === 'center') {
            textX = zoneX + zoneW / 2;
        } else {
            textX = zoneX + 10;
        }

        // ─── 4. Build text sections with overflow protection ─────────
        const svgElements: string[] = [];
        const ctaElements: string[] = []; // CTA rendered separately with pill
        const zoneBottom = zoneY + zoneH; // absolute bottom boundary
        let cursorY = zoneY + Math.round(16 * scale); // start with some top padding

        const _headlineColor = (brand && brand.secondary) ? brand.secondary : textStyle.color;
        const _ctaBgColor = (brand && brand.primary) ? brand.primary : "#C8942A";
        const _ctaTextColor = (brand && brand.ctaTextColor) ? brand.ctaTextColor : "#FFFFFF";

        // Stroke attributes for main text
        const strokeAttrs = textStyle.strokeWidth > 0
            ? ` stroke="${textStyle.strokeColor}" stroke-width="${textStyle.strokeWidth}" paint-order="stroke fill"`
            : '';

        // --- Pre-calculate total content height to determine if scaling is needed ---
        const estimateHeight = (): number => {
            let h = Math.round(16 * scale); // top padding
            if (fullText.hookText.trim()) {
                const maxC = Math.max(8, Math.round((CHARS_PER_LINE[textStyle.fontSize] || 18) * zoneWidthRatio));
                h += splitArabicLines(fullText.hookText, maxC).length * (hookFontSize * (textStyle.lineHeightMultiplier || 1.4)) + GAP;
            }
            if (fullText.subheadText.trim()) {
                const maxC = Math.max(10, Math.round(28 * zoneWidthRatio));
                h += splitArabicLines(fullText.subheadText, maxC).length * (subheadFontSize * 1.35) + GAP * 1.5;
            }
            if (fullText.ctaText.trim()) {
                h += GAP + (ctaFontSize * 1.3 + CTA_PADDING_Y * 2) + GAP;
            }
            if (fullText.benefitText.trim()) {
                const maxC = Math.max(12, Math.round(36 * zoneWidthRatio));
                h += splitArabicLines(fullText.benefitText, maxC).length * (benefitFontSize * 1.3) + GAP;
            }
            if (fullText.targetAudienceText.trim()) {
                const maxC = Math.max(15, Math.round(42 * zoneWidthRatio));
                h += splitArabicLines(fullText.targetAudienceText, maxC).length * (audienceFontSize * 1.25);
            }
            return h;
        };

        // If content overflows zone, compute scale factor to shrink all fonts
        const estH = estimateHeight();
        const fontScale = estH > zoneH ? Math.max(0.6, zoneH / estH) : 1.0;
        const sHook = Math.round(hookFontSize * fontScale);
        const sSub = Math.round(subheadFontSize * fontScale);
        const sCta = Math.round(ctaFontSize * fontScale);
        const sBen = Math.round(benefitFontSize * fontScale);
        const sAud = Math.round(audienceFontSize * fontScale);
        const sGap = Math.round(GAP * fontScale);
        const sCtaPadX = Math.round(CTA_PADDING_X * fontScale);
        const sCtaPadY = Math.round(CTA_PADDING_Y * fontScale);

        if (fontScale < 1.0) {
            console.log(`⚠️ Text overflow detected: content ${estH}px > zone ${zoneH}px. Scaling fonts to ${(fontScale * 100).toFixed(0)}%`);
        }

        // --- HOOK TEXT (headline) ---
        if (fullText.hookText.trim() && cursorY < zoneBottom) {
            const maxChars = Math.max(8, Math.round((CHARS_PER_LINE[textStyle.fontSize] || 18) * zoneWidthRatio));
            const lines = splitArabicLines(fullText.hookText, maxChars);
            const lineHeight = sHook * (textStyle.lineHeightMultiplier || 1.4);

            for (const line of lines) {
                cursorY += lineHeight;
                if (cursorY > zoneBottom + lineHeight) break; // hard stop
                svgElements.push(
                    `<text x="${textX}" y="${cursorY}" fill="${_headlineColor}" ` +
                    `font-size="${sHook}" font-weight="700" ` +
                    `font-family="${fontFamily}" text-anchor="${anchor}" ` +
                    `dominant-baseline="central" direction="rtl" xml:lang="ar"` +
                    `${strokeAttrs}>${escapeXml(line)}</text>`
                );
            }
            cursorY += sGap;
        }

        // --- SUBHEADLINE ---
        if (fullText.subheadText.trim() && cursorY < zoneBottom) {
            const subMaxChars = Math.max(10, Math.round(28 * zoneWidthRatio));
            const subLines = splitArabicLines(fullText.subheadText, subMaxChars);
            const subLineHeight = sSub * 1.35;
            const subColor = textStyle.color;

            for (const line of subLines) {
                cursorY += subLineHeight;
                if (cursorY > zoneBottom + subLineHeight) break;
                svgElements.push(
                    `<text x="${textX}" y="${cursorY}" fill="${subColor}" ` +
                    `font-size="${sSub}" font-weight="400" ` +
                    `font-family="${fontFamily}" text-anchor="${anchor}" ` +
                    `dominant-baseline="central" direction="rtl" xml:lang="ar"` +
                    `${strokeAttrs}>${escapeXml(line)}</text>`
                );
            }
            cursorY += Math.round(sGap * 1.5);
        }

        // --- CTA BUTTON (with pill background) ---
        if (fullText.ctaText.trim() && cursorY < zoneBottom) {
            cursorY += sGap;
            const ctaLineHeight = sCta * 1.3;
            const ctaTextWidth = fullText.ctaText.length * sCta * 0.55;
            const pillW = Math.min(ctaTextWidth + sCtaPadX * 2, zoneW - 20);
            const pillH = ctaLineHeight + sCtaPadY * 2;
            let pillX: number;
            if (textStyle.textAlign === 'right') {
                pillX = zoneX + zoneW - pillW - 10;
            } else if (textStyle.textAlign === 'center') {
                pillX = zoneX + (zoneW - pillW) / 2;
            } else {
                pillX = zoneX + 10;
            }
            const pillY = cursorY;

            if (pillY + pillH <= zoneBottom + sGap) {
                ctaElements.push(
                    `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" ` +
                    `rx="${Math.round(CTA_RADIUS * fontScale)}" ry="${Math.round(CTA_RADIUS * fontScale)}" fill="${_ctaBgColor}" />`
                );

                const ctaTextX = pillX + pillW / 2;
                const ctaTextY = pillY + pillH / 2;
                ctaElements.push(
                    `<text x="${ctaTextX}" y="${ctaTextY}" fill="${_ctaTextColor}" ` +
                    `font-size="${sCta}" font-weight="700" ` +
                    `font-family="${fontFamily}" text-anchor="middle" ` +
                    `dominant-baseline="central" direction="rtl" xml:lang="ar">${escapeXml(fullText.ctaText)}</text>`
                );
            }

            cursorY += pillH + sGap;
        }

        // --- BENEFIT LINE ---
        if (fullText.benefitText.trim() && cursorY < zoneBottom) {
            const benMaxChars = Math.max(12, Math.round(36 * zoneWidthRatio));
            const benLines = splitArabicLines(fullText.benefitText, benMaxChars);
            const benLineHeight = sBen * 1.3;

            for (const line of benLines) {
                cursorY += benLineHeight;
                if (cursorY > zoneBottom + benLineHeight) break;
                svgElements.push(
                    `<text x="${textX}" y="${cursorY}" fill="${textStyle.color}" ` +
                    `font-size="${sBen}" font-weight="400" ` +
                    `font-family="${fontFamily}" text-anchor="${anchor}" ` +
                    `dominant-baseline="central" direction="rtl" xml:lang="ar"` +
                    `${strokeAttrs}>${escapeXml(line)}</text>`
                );
            }
            cursorY += sGap;
        }

        // --- TARGET AUDIENCE (muted) ---
        if (fullText.targetAudienceText.trim() && cursorY < zoneBottom) {
            const audMaxChars = Math.max(15, Math.round(42 * zoneWidthRatio));
            const audLines = splitArabicLines(fullText.targetAudienceText, audMaxChars);
            const audLineHeight = sAud * 1.25;
            const mutedColor = textStyle.color === '#FFFFFF' ? 'rgba(255,255,255,0.6)'
                : textStyle.color === '#1a1a1a' ? 'rgba(26,26,26,0.6)' : textStyle.color;

            for (const line of audLines) {
                cursorY += audLineHeight;
                if (cursorY > zoneBottom + audLineHeight) break;
                svgElements.push(
                    `<text x="${textX}" y="${cursorY}" fill="${mutedColor}" ` +
                    `font-size="${sAud}" font-weight="400" ` +
                    `font-family="${fontFamily}" text-anchor="${anchor}" ` +
                    `dominant-baseline="central" direction="rtl" xml:lang="ar">${escapeXml(line)}</text>`
                );
            }
        }

        // ─── 5. Background treatment (dynamic height based on actual content) ─
        let bgRect = '';
        if (textStyle.backgroundTreatment !== 'none') {
            const bgColor = hexToRgba(textStyle.backgroundTreatmentColor || textZone.zoneBaseColor);
            const padding = Math.round(16 * scale);
            // Use actual rendered content height instead of fixed zone height
            const contentTop = zoneY;
            const contentBottom = cursorY + Math.round(12 * scale); // small bottom pad
            const actualContentH = contentBottom - contentTop;
            const bgH = actualContentH + padding * 2;
            bgRect = `<rect x="${zoneX - padding}" y="${contentTop - padding}" ` +
                `width="${zoneW + padding * 2}" height="${bgH}" ` +
                `rx="${textStyle.backgroundTreatment === 'gradient_band' ? 0 : 16}" ` +
                `ry="${textStyle.backgroundTreatment === 'gradient_band' ? 0 : 16}" ` +
                `fill="${bgColor}" />`;
        }

        // ─── 6. Shadow filter ───────────────────────────────────────
        let defsContent = '';
        if (textStyle.shadowEnabled && textStyle.shadowColor && textStyle.shadowBlur) {
            defsContent += `<filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="${textStyle.shadowBlur}" flood-color="${textStyle.shadowColor}" flood-opacity="0.7"/>
      </filter>`;
        }

        // ─── 7. Assemble SVG ────────────────────────────────────────
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <defs>
    <style>${fontFaceRule}</style>
    ${defsContent}
  </defs>
  ${bgRect}
  ${svgElements.join('\n  ')}
  ${ctaElements.join('\n  ')}
</svg>`;

        // ─── 8. Composite and output ────────────────────────────────
        const svgBuffer = Buffer.from(svg, 'utf-8');
        const result = await sharp(imageBuffer)
            .composite([{ input: svgBuffer, top: 0, left: 0 }])
            .jpeg({ quality: 92 })
            .toBuffer();

        const resultBase64 = `data:image/jpeg;base64,${result.toString('base64')}`;
        const elementCount = [fullText.hookText, fullText.subheadText, fullText.ctaText, fullText.benefitText, fullText.targetAudienceText].filter(t => t.trim()).length;
        console.log(`✅ Full ad text composited: ${elementCount} elements, hookSize=${hookFontSize}px`);
        return resultBase64;
    } catch (err) {
        console.error('❌ Full ad text compositing failed:', err);
        return null;
    }
}
