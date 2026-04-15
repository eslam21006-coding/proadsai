// functions/src/dialectMarkers.ts — dialect marker exclusion lists per locale

export interface DialectMarkerSet {
    readonly locale: string;
    readonly wrongDialectMarkers: readonly string[];
}

export const EGYPTIAN_MARKERS = {
    locale: "ar_egyptian",
    wrongDialectMarkers: [
        // Gulf markers
        "حلو",
        "زين",
        "يالله",
        "عاد",
        "وش",
        // Iraqi markers
        "شلون",
        "ماكو",
        // Levantine markers
        "هلق",
        "كتير",
        "ليش",
        "هيك",
        "هاد",
        "هادي",
        "عم",
        "شو",
        // Maghreb markers
        "بزاف",
        "واش",
        "داير",
        "بصح",
        "ديما",
        "مزيان",
        "باش",
    ],
} as const satisfies DialectMarkerSet;

export const GULF_MARKERS = {
    locale: "ar_gulf",
    wrongDialectMarkers: [
        // Egyptian markers
        "عايز",
        "ازيك",
        "أزيك",
        "إزيك",
        "كده",
        "كِده",
        "ده",
        "دي",
        "عشان",
        "ليه",
        "مش",
        // Levantine markers
        "هلق",
        "كتير",
        "ليش",
        "هيك",
        "هاد",
        "هادي",
        "عم",
        "شو",
        // Iraqi markers
        "شلون",
        "ماكو",
        // Maghreb markers
        "بزاف",
        "واش",
        "داير",
        "بصح",
        "ديما",
        "مزيان",
    ],
} as const satisfies DialectMarkerSet;

export function getDialectMarkers(locale: string): DialectMarkerSet | null {
    if (locale === "ar_egyptian") return EGYPTIAN_MARKERS;
    if (locale === "ar_gulf") return GULF_MARKERS;
    return null;
}
