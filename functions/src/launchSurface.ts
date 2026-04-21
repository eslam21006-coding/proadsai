// functions/src/launchSurface.ts — launch surface registry + validation

import type {
    OfferTypeId,
    TabId,
    LegacyOfferTypeId,
    VisualStyleFamily,
    LaunchSurfaceInput,
    LaunchSurfaceResult,
} from "./types.js";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

export const DELETED_MODES = ["limited_access", "module_preview", "day_strip"] as const;

export const SOLO_ONLY_MODES = ["before_after", "text_only"] as const;

export const APPROVED_HOOK_ANGLES = [
    "emotional", "logic", "urgency", "scarcity", "pain",
    "curiosity", "statistics", "social_proof", "logical_authority", "future_based",
] as const;

export interface OfferTypeEntry {
    id: OfferTypeId;
    tab: TabId;
    labelEn: string;
    labelAr: string;
    legacyAliases?: LegacyOfferTypeId[];
}

export const OFFER_TYPE_ENTRIES: OfferTypeEntry[] = [
    { id: "live_event", tab: "live_events", labelEn: "Live Event", labelAr: "حدث مباشر", legacyAliases: ["free_webinar", "paid_workshop", "challenge"] },
    { id: "free_guide", tab: "free_guide", labelEn: "Free Guide", labelAr: "دليل مجاني" },
    { id: "mini_course", tab: "mini_course", labelEn: "Mini-Course", labelAr: "كورس مصغر" },
];

export interface TabModeEntry {
    approvedModes: string[];
    approvedPairings: Array<{ modes: [string, string]; layoutKey: string }>;
}

export const TAB_MODE_REGISTRY: Record<TabId, TabModeEntry> = {
    live_events: {
        approvedModes: ["standard_hero", "event_ticket", "webinar_screen", "speaker_card", "text_only", "before_after"],
        approvedPairings: [
            { modes: ["standard_hero", "event_ticket"], layoutKey: "hero_ticket" },
            { modes: ["standard_hero", "webinar_screen"], layoutKey: "hero_screen" },
            { modes: ["standard_hero", "speaker_card"], layoutKey: "hero_speaker" },
            { modes: ["event_ticket", "speaker_card"], layoutKey: "ticket_speaker" },
            { modes: ["webinar_screen", "speaker_card"], layoutKey: "screen_speaker" },
        ],
    },
    free_guide: {
        approvedModes: ["standard_hero", "book_mockup", "device_mockup", "text_only", "before_after"],
        approvedPairings: [
            { modes: ["standard_hero", "book_mockup"], layoutKey: "hero_book" },
            { modes: ["standard_hero", "device_mockup"], layoutKey: "hero_device" },
            { modes: ["book_mockup", "device_mockup"], layoutKey: "book_device" },
        ],
    },
    mini_course: {
        approvedModes: ["standard_hero", "value_stack", "text_only", "before_after"],
        approvedPairings: [
            { modes: ["standard_hero", "value_stack"], layoutKey: "hero_value_stack" },
        ],
    },
};

export interface CampaignFormatEntry {
    campaignType: "cold" | "retargeting";
    adFormat: "single" | "carousel" | "batch";
    minPlan: "starter" | "pro" | "scale";
}

export const CAMPAIGN_FORMAT_MATRIX: CampaignFormatEntry[] = [
    { campaignType: "cold", adFormat: "single", minPlan: "starter" },
    { campaignType: "cold", adFormat: "carousel", minPlan: "pro" },
    { campaignType: "cold", adFormat: "batch", minPlan: "pro" },
    { campaignType: "retargeting", adFormat: "single", minPlan: "starter" },
    { campaignType: "retargeting", adFormat: "carousel", minPlan: "pro" },
    { campaignType: "retargeting", adFormat: "batch", minPlan: "pro" },
];

const PLAN_ORDER: Record<string, number> = { starter: 0, pro: 1, scale: 2 };

// ═══════════════════════════════════════════════════════════
// RESOLVE OFFER TYPE
// ═══════════════════════════════════════════════════════════

function resolveOfferType(raw: string): { id: OfferTypeId; tab: TabId } | null {
    const normalized = raw.toLowerCase().replace(/[-\s]+/g, "_");
    for (const entry of OFFER_TYPE_ENTRIES) {
        if (entry.id === raw || entry.id === normalized) return { id: entry.id, tab: entry.tab };
        if (entry.legacyAliases?.some(a => a === raw || a === normalized)) return { id: entry.id, tab: entry.tab };
    }
    const labelMap: Record<string, OfferTypeEntry> = {};
    for (const entry of OFFER_TYPE_ENTRIES) {
        labelMap[entry.labelEn.toLowerCase()] = entry;
    }
    const match = labelMap[raw.toLowerCase()];
    if (match) return { id: match.id, tab: match.tab };
    return null;
}

// ═══════════════════════════════════════════════════════════
// VALIDATE — 9-rule launch surface validation
// ═══════════════════════════════════════════════════════════

export function validateLaunchSurface(input: LaunchSurfaceInput): LaunchSurfaceResult {
    const { campaignType, adFormat, creativeModes, userPlan } = input;
    const hookAngle = input.hookAngle ?? null;

    const fallback: LaunchSurfaceResult = { passed: false, blockReason: "Validation failed.", resolvedOfferType: "mini_course", resolvedTab: "mini_course" };

    // Rule 0: Mode count guard
    if (creativeModes.length === 0) {
        return { ...fallback, blockReason: "At least one creative mode is required." };
    }
    if (creativeModes.length > 2) {
        return { ...fallback, blockReason: "Only up to two creative modes are allowed." };
    }

    // Rule 1: Deleted mode check
    for (const mode of creativeModes) {
        if ((DELETED_MODES as readonly string[]).includes(mode)) {
            return { ...fallback, blockReason: `"${mode}" is no longer available.` };
        }
    }

    // Rule 2: Offer type resolution
    const resolved = resolveOfferType(input.offerType);
    if (!resolved) return { ...fallback, blockReason: "Unknown offer type." };
    const { id: resolvedOfferType, tab: resolvedTab } = resolved;
    const base: LaunchSurfaceResult = { passed: false, blockReason: "", resolvedOfferType, resolvedTab };

    // Rule 3: Campaign x Format x Plan check
    const formatEntry = CAMPAIGN_FORMAT_MATRIX.find(
        (e) => e.campaignType === campaignType && e.adFormat === adFormat,
    );
    if (!formatEntry) {
        return { ...base, blockReason: `"${campaignType} x ${adFormat}" is not a supported combination.` };
    }
    if ((PLAN_ORDER[userPlan] ?? 0) < (PLAN_ORDER[formatEntry.minPlan] ?? 0)) {
        return { ...base, blockReason: `"${adFormat}" requires ${formatEntry.minPlan} plan or higher.` };
    }

    // Rule 4: Tab mode check
    const tabRegistry = TAB_MODE_REGISTRY[resolvedTab];
    const offerLabel = OFFER_TYPE_ENTRIES.find((e) => e.id === resolvedOfferType)?.labelEn ?? resolvedOfferType;
    for (const mode of creativeModes) {
        if (!tabRegistry.approvedModes.includes(mode)) {
            return { ...base, blockReason: `"${mode}" is not available for ${offerLabel}.` };
        }
    }

    // Rule 5: Solo-only check
    for (const mode of creativeModes) {
        if ((SOLO_ONLY_MODES as readonly string[]).includes(mode) && creativeModes.length > 1) {
            const msg = mode === "before_after"
                ? "Before/After cannot be paired with other creative modes."
                : "Text Only is a standalone mode and cannot be paired.";
            return { ...base, blockReason: msg };
        }
    }

    // Rule 6: Pairing check
    let layoutKey: string | undefined;
    if (creativeModes.length === 2) {
        const [a, b] = creativeModes;
        const pair = tabRegistry.approvedPairings.find(
            (p) => (p.modes[0] === a && p.modes[1] === b) || (p.modes[0] === b && p.modes[1] === a),
        );
        if (!pair) {
            return { ...base, blockReason: `"${a}" and "${b}" cannot be paired.` };
        }
        layoutKey = pair.layoutKey;
    }

    // Rule 7: Hook angle check
    if (campaignType === "cold" && hookAngle) {
        if (!(APPROVED_HOOK_ANGLES as readonly string[]).includes(hookAngle)) {
            return { ...base, blockReason: `"${hookAngle}" is not an approved hook angle.` };
        }
    }

    // Rule 8: Format restriction — before_after is single-only
    if (creativeModes.includes("before_after") && adFormat !== "single") {
        return { ...base, blockReason: "Before/After is single-image only." };
    }

    // Rule 9: Batch N cap — product of variation dimensions must not exceed 30
    if (adFormat === "batch" && input.batchN != null && input.batchN > 30) {
        return { ...base, blockReason: `Batch count (${input.batchN}) exceeds maximum of 30 combinations.` };
    }

    return { passed: true, resolvedOfferType, resolvedTab, layoutKey };
}
