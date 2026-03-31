/**
* offerOverlay.ts
* ═══════════════════════════════════════════════════════════════════════════
* DETERMINISTIC OFFER OVERLAY — Exact commercial number rendering
* ═══════════════════════════════════════════════════════════════════════════
*/

let sharp: any = null;
try {
    sharp = require('sharp');
} catch {
    console.warn('⚠️ Sharp not available — offer overlay compositor disabled. Install: npm install sharp');
}

export interface OfferFacts {
    offerTitle?: string;
    items: OfferFactItem[];
    bonuses?: string;
    totalValue?: string;
    actualPrice?: string;
    savings?: string;
    guarantee?: string;
    audienceBadge?: string;
    labels?: {
        price: string;
        totalValue: string;
        savings: string;
        bonusPrefix: string;
    };
}

export interface OfferFactItem {
    label: string;
    value?: string;
    kind?: 'item' | 'bonus';
}

export interface OverlaySlot {
    id: string;
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
    align: 'right' | 'left' | 'center';
    fontSize: number;
    fontWeight: number;
    color: string;
    bgColor?: string;
    borderRadius?: number;
}

export interface OverlaySpec {
    templateId: string;
    canvasWidth: number;
    canvasHeight: number;
    rtl: boolean;
    slots: {
        price?: OverlaySlot;
        totalValue?: OverlaySlot;
        savings?: OverlaySlot;
        valueItems?: OverlaySlot[];
        guarantee?: OverlaySlot;
    };
}

import type { OverlaySlotDef } from "./layoutTemplates.js";

const COMMERCIAL_PLACEHOLDER_PATTERNS = [
    /\btotal\s*value\b/i,
    /\bsavings\s*callout\b/i,
    /\bprice\s*label\b/i,
    /\bplaceholder\b/i,
    /\blorem\b/i,
    /^\s*سعر\s*$/,
];

function isPlaceholderValue(value: string | undefined | null): boolean {
    const v = (value || '').trim();
    return !v || COMMERCIAL_PLACEHOLDER_PATTERNS.some((p) => p.test(v));
}

function splitLinesLoose(value: string | undefined | null): string[] {
    if (!value) return [];
    return value
        .split(/\n|\r|•|\||\u2022/g)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !isPlaceholderValue(line));
}

function getOverlayLabels(rtl: boolean) {
    return rtl
        ? {
            price: 'السعر الحالي',
            totalValue: 'القيمة الإجمالية',
            savings: 'التوفير',
            bonusPrefix: 'بونص',
        }
        : {
            price: 'Current Price',
            totalValue: 'Total Value',
            savings: 'Savings',
            bonusPrefix: 'Bonus',
        };
}

function maybePrefixLabel(rawValue: string | undefined, label: string): string {
    const clean = (rawValue || '').trim();
    if (!clean) return '';
    if (/(القيمة|السعر|التوفير|وفر|price|value|save|saving)/i.test(clean)) return clean;
    return `${label}: ${clean}`;
}

export function buildOverlaySpecFromContract(
    overlaySlots: OverlaySlotDef[],
    canvasWidth: number,
    canvasHeight: number,
    rtl: boolean,
    itemCount: number,
): OverlaySpec | null {
    if (!overlaySlots || overlaySlots.length === 0) return null;

    const spec: OverlaySpec = {
        templateId: 'contract',
        canvasWidth,
        canvasHeight,
        rtl,
        slots: {},
    };

    for (const slotDef of overlaySlots) {
        const effectiveXPct = rtl && slotDef.align !== 'center'
            ? 100 - slotDef.xPct - slotDef.widthPct
            : slotDef.xPct;

        const toSlot = (def: OverlaySlotDef, xOverride?: number, yOverride?: number): OverlaySlot => ({
            id: def.id,
            xPct: xOverride ?? effectiveXPct,
            yPct: yOverride ?? def.yPct,
            widthPct: def.widthPct,
            heightPct: def.heightPct,
            align: rtl && def.align === 'left' ? 'right' : rtl && def.align === 'right' ? 'left' : def.align,
            fontSize: def.fontSize,
            fontWeight: def.fontWeight,
            color: def.color,
            bgColor: def.bgColor,
            borderRadius: def.borderRadius,
        });

        switch (slotDef.id) {
            case 'valueItem': {
                if (!slotDef.repeating) {
                    if (!spec.slots.valueItems) spec.slots.valueItems = [];
                    spec.slots.valueItems.push(toSlot(slotDef));
                } else {
                    const gap = slotDef.repeatGapPct || 1;
                    const maxItems = Math.min(itemCount, slotDef.maxRepeat || 5);
                    spec.slots.valueItems = [];
                    for (let i = 0; i < maxItems; i++) {
                        const yPos = slotDef.yPct + (i * (slotDef.heightPct + gap));
                        spec.slots.valueItems.push(toSlot(slotDef, effectiveXPct, yPos));
                    }
                }
                break;
            }
            case 'price':
                spec.slots.price = toSlot(slotDef);
                break;
            case 'totalValue':
                spec.slots.totalValue = toSlot(slotDef);
                break;
            case 'savings':
                spec.slots.savings = toSlot(slotDef);
                break;
            case 'guarantee':
                spec.slots.guarantee = toSlot(slotDef);
                break;
        }
    }

    return spec;
}

function buildOverlaySvg(
    spec: OverlaySpec,
    facts: OfferFacts,
    brandColor?: string,
): string {
    const { canvasWidth: w, canvasHeight: h, rtl, slots } = spec;
    const elements: string[] = [];
    const px = (pct: number, base: number) => Math.round((pct / 100) * base);

    const renderSlot = (slot: OverlaySlot, text: string) => {
        if (!text || !text.trim()) return;
        const x = px(slot.xPct, w);
        const y = px(slot.yPct, h);
        const sw = px(slot.widthPct, w);
        const sh = px(slot.heightPct, h);
        const scaledFontSize = Math.round(slot.fontSize * (w / 1080));
        const br = slot.borderRadius || 0;

        if (slot.bgColor) {
            const bgFill = slot.id === 'price' && brandColor ? brandColor : slot.bgColor;
            elements.push(`<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="${br}" ry="${br}" fill="${bgFill}"/>`);
        }

        const textX = slot.align === 'center' ? x + sw / 2
            : slot.align === 'right' ? x + sw - 10
                : x + 10;
        const textY = y + sh / 2;
        const anchor = slot.align === 'center' ? 'middle'
            : slot.align === 'right' ? 'end' : 'start';
        const dir = rtl ? ' direction="rtl" unicode-bidi="bidi-override"' : '';

        elements.push(`<text x="${textX}" y="${textY}" fill="${slot.color}" font-size="${scaledFontSize}" font-weight="${slot.fontWeight}" font-family="Cairo, Tajawal, 'Noto Kufi Arabic', 'Noto Sans Arabic', Arial, sans-serif" text-anchor="${anchor}" dominant-baseline="central"${dir}>${escapeXml(text)}</text>`);
    };

    if (slots.valueItems && facts.items) {
        for (let i = 0; i < Math.min(slots.valueItems.length, facts.items.length); i++) {
            const item = facts.items[i];
            const displayText = item.value
                ? `${item.label}  —  ${item.value}`
                : item.label;
            renderSlot(slots.valueItems[i], displayText);
        }
    }

    if (slots.totalValue && facts.totalValue) {
        renderSlot(slots.totalValue, maybePrefixLabel(facts.totalValue, facts.labels?.totalValue || getOverlayLabels(rtl).totalValue));
    }

    if (slots.price && facts.actualPrice) {
        renderSlot(slots.price, maybePrefixLabel(facts.actualPrice, facts.labels?.price || getOverlayLabels(rtl).price));
    }

    if (slots.savings && facts.savings) {
        renderSlot(slots.savings, maybePrefixLabel(facts.savings, facts.labels?.savings || getOverlayLabels(rtl).savings));
    }

    if (slots.guarantee && facts.guarantee) {
        renderSlot(slots.guarantee, facts.guarantee);
    }

    if (elements.length === 0) return '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&amp;display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&amp;display=swap');
    </style>
  </defs>
  ${elements.join('\n  ')}
</svg>`;
}

function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function extractOfferFacts(inputs: Record<string, any>): OfferFacts | null {
    const selectedModes: string[] = inputs.offerCreativeMode || ['standard_hero'];
    const rtl = (inputs.adLanguage || 'ar_fusha').startsWith('ar');
    const labels = getOverlayLabels(rtl);

    if (selectedModes.includes('value_stack')) {
        const items: OfferFactItem[] = [];
        splitLinesLoose(inputs.valueStackItems).forEach((raw) => items.push({ label: raw, kind: 'item' }));
        splitLinesLoose(inputs.valueStackBonuses).forEach((raw) => items.push({ label: `${labels.bonusPrefix}: ${raw}`, kind: 'bonus' }));

        return {
            offerTitle: (inputs.valueStackTitle || '').trim() || undefined,
            items,
            bonuses: splitLinesLoose(inputs.valueStackBonuses).join(' • ') || undefined,
            totalValue: !isPlaceholderValue(inputs.valueStackOriginalValue) ? (inputs.valueStackOriginalValue || '').trim() : undefined,
            actualPrice: !isPlaceholderValue(inputs.valueStackPrice) ? (inputs.valueStackPrice || '').trim() : undefined,
            savings: !isPlaceholderValue(inputs.valueStackSavings) ? (inputs.valueStackSavings || '').trim() : undefined,
            guarantee: !isPlaceholderValue(inputs.valueStackGuarantee) ? (inputs.valueStackGuarantee || '').trim() : undefined,
            labels,
        };
    }

    if (selectedModes.includes('premium_package') || selectedModes.includes('limited_access')) {
        const inclusions = splitLinesLoose(inputs.offerCardInclusions).map((label) => ({ label, kind: 'item' as const }));
        return {
            offerTitle: (inputs.offerCardTitle || inputs.productName || '').trim() || undefined,
            items: inclusions,
            actualPrice: !isPlaceholderValue(inputs.offerCardPrice) ? (inputs.offerCardPrice || '').trim() : undefined,
            totalValue: !isPlaceholderValue(inputs.offerCardOldPrice) ? (inputs.offerCardOldPrice || '').trim() : undefined,
            savings: !isPlaceholderValue(inputs.offerCardDiscount) ? (inputs.offerCardDiscount || '').trim() : undefined,
            guarantee: !isPlaceholderValue(inputs.offerCardGuarantee) ? (inputs.offerCardGuarantee || '').trim() : undefined,
            labels,
        };
    }

    return null;
}

export function validateResolvedOfferFacts(facts: OfferFacts | null, rtl: boolean): { valid: boolean; errors: string[] } {
    if (!facts) return { valid: true, errors: [] };
    const errors: string[] = [];
    const localePattern = rtl ? /\b(total\s*value|savings\s*callout|price\s*label|placeholder|lorem)\b/i : /^$/;

    for (const item of facts.items || []) {
        if (isPlaceholderValue(item.label)) errors.push(`Unresolved item label: ${item.label}`);
    }
    if (facts.totalValue && localePattern.test(facts.totalValue)) errors.push('Arabic total value contains English placeholder text.');
    if (facts.savings && localePattern.test(facts.savings)) errors.push('Arabic savings contains English placeholder text.');
    if (facts.actualPrice && localePattern.test(facts.actualPrice)) errors.push('Arabic price contains English placeholder text.');

    return { valid: errors.length === 0, errors };
}

export async function compositeOfferOverlay(
    imageBase64: string,
    overlaySlots: OverlaySlotDef[],
    inputs: Record<string, any>,
    canvasWidth: number,
    canvasHeight: number,
    rtl: boolean,
    brandColor?: string,
): Promise<string | null> {
    if (!sharp) {
        console.warn('⚠️ Sharp not available — offer overlay compositor disabled.');
        return null;
    }

    const facts = extractOfferFacts(inputs);
    if (!facts) return null;

    const validation = validateResolvedOfferFacts(facts, rtl);
    if (!validation.valid) {
        console.warn(`⚠️ Offer overlay skipped due to unresolved payload: ${validation.errors.join(' | ')}`);
        return null;
    }

    const hasValues = facts.actualPrice || facts.totalValue || facts.savings || facts.items.some(i => !!i.label);
    if (!hasValues) {
        console.log('ℹ️ Offer overlay: no structured offer facts to render.');
        return null;
    }

    const spec = buildOverlaySpecFromContract(overlaySlots, canvasWidth, canvasHeight, rtl, facts.items.length);
    if (!spec) {
        console.log('ℹ️ Offer overlay: no overlay spec from contract slots.');
        return null;
    }

    const svg = buildOverlaySvg(spec, facts, brandColor);
    if (!svg) return null;

    try {
        const rawBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        const imageBuffer = Buffer.from(rawBase64, 'base64');
        const svgBuffer = Buffer.from(svg, 'utf-8');
        const result = await sharp(imageBuffer)
            .composite([{ input: svgBuffer, top: 0, left: 0 }])
            .png()
            .toBuffer();

        const resultBase64 = `data:image/png;base64,${result.toString('base64')}`;
        console.log(`✅ Offer overlay composited: ${facts.items.length} rows, price=${facts.actualPrice || 'n/a'}, total=${facts.totalValue || 'n/a'}`);
        return resultBase64;
    } catch (err) {
        console.error('❌ Offer overlay compositing failed:', err);
        return null;
    }
}

export function isOverlayAvailable(): boolean {
    return sharp !== null;
}
