// functions/src/logoComposite.ts — deterministic UI logo post-render compositor (HOTFIX-E)

import type {
    LogoPlacement,
    LogoPipelineEvents,
    LogoZone,
    UILogoPlacement,
} from "./types.js";
import type { FullLayoutContract } from "./layoutContract.js";
import type { Sharp } from "sharp";

// ─── Typed lazy sharp loader (NodeNext-friendly dynamic import with cache) ───
type SharpFactory = (input?: Buffer | string | { create: { width: number; height: number; channels: 4; background: { r: number; g: number; b: number; alpha: number } } } | Uint8Array, options?: { raw?: { width: number; height: number; channels: 4 } }) => Sharp;
let sharpInstance: SharpFactory | null = null;
let sharpLoadAttempted = false;
async function getSharp(): Promise<SharpFactory | null> {
    if (sharpLoadAttempted) return sharpInstance;
    sharpLoadAttempted = true;
    try {
        const mod = await import("sharp");
        // sharp is a CJS module exporting a default function; in NodeNext
        // ESM interop the default lands on `.default`.
        sharpInstance = ((mod as unknown as { default?: SharpFactory }).default ?? (mod as unknown as SharpFactory));
    } catch {
        console.warn("⚠️ Sharp not available — UI logo compositor disabled. Install: npm install sharp");
    }
    return sharpInstance;
}

export interface CompositeUILogosArgs {
    baseImageBase64: string;
    brandLogos: string[];
    placements: LogoPlacement[];
    layoutContract: FullLayoutContract;
    canvasWidth: number;
    canvasHeight: number;
}

export interface CompositeUILogosResult {
    image: string;
    events: LogoPipelineEvents;
}

function emptyEvents(): LogoPipelineEvents {
    return { perLogo: [], autoShifts: [], drops: [], clamps: [], softWarnings: [] };
}

const TOP_BAND: LogoZone[] = ["top-right", "top-center", "top-left"];
const MIDDLE_BAND: LogoZone[] = ["middle-right", "middle-center", "middle-left"];
const BOTTOM_BAND: LogoZone[] = ["bottom-right", "bottom-center", "bottom-left"];

type Band = "top" | "middle" | "bottom" | "center";

function getBand(zone: LogoZone): Band {
    if (TOP_BAND.includes(zone)) return "top";
    if (MIDDLE_BAND.includes(zone)) return "middle";
    if (BOTTOM_BAND.includes(zone)) return "bottom";
    return "center";
}

function getBandCandidates(band: Band): LogoZone[] {
    if (band === "top") return [...TOP_BAND];
    if (band === "middle") return [...MIDDLE_BAND];
    if (band === "bottom") return [...BOTTOM_BAND];
    return [];
}

function bandStartAnchor(band: Band): LogoZone | null {
    if (band === "top") return "top-right";
    if (band === "middle") return "middle-right";
    if (band === "bottom") return "bottom-right";
    return null;
}

function rotateToStart(candidates: LogoZone[], start: LogoZone): LogoZone[] {
    const idx = candidates.indexOf(start);
    if (idx <= 0) return candidates;
    return [...candidates.slice(idx), ...candidates.slice(0, idx)];
}

interface Rect { x: number; y: number; w: number; h: number; }

function rectsOverlap(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function zoneToPixels(zone: LogoZone, logoWidth: number, logoHeight: number, canvasWidth: number, canvasHeight: number): { top: number; left: number } {
    const margin = Math.round(canvasWidth * 0.03);
    const midY = Math.round((canvasHeight - logoHeight) / 2);
    const midX = Math.round((canvasWidth - logoWidth) / 2);
    const rightX = canvasWidth - logoWidth - margin;
    const bottomY = canvasHeight - logoHeight - margin;
    switch (zone) {
        case "top-left": return { top: margin, left: margin };
        case "top-right": return { top: margin, left: rightX };
        case "top-center": return { top: margin, left: midX };
        case "middle-left": return { top: midY, left: margin };
        case "middle-right": return { top: midY, left: rightX };
        case "middle-center": return { top: midY, left: midX };
        case "bottom-left": return { top: bottomY, left: margin };
        case "bottom-right": return { top: bottomY, left: rightX };
        case "bottom-center": return { top: bottomY, left: midX };
        case "center": return { top: midY, left: midX };
        default: return { top: margin, left: margin };
    }
}

function getTextCollisionRects(contract: FullLayoutContract, canvasWidth: number, canvasHeight: number): Rect[] {
    const rects: Rect[] = [];
    const zones = contract.zones;
    if (!zones) return rects;

    const textPriorityIds = new Set(["headline", "subheadline", "cta", "badge", "event_metadata"]);
    const inset = Math.round(canvasWidth * 0.03);
    const defaultBandHeight = canvasHeight * 0.2;
    const defaultCtaHeight = canvasHeight * 0.15;
    const defaultCenterWidth = canvasWidth * 0.6;
    const defaultCenterHeight = canvasHeight * 0.15;

    for (const [id, zone] of Object.entries(zones)) {
        const priority = zone.priority ?? 99;
        if (priority > 2 && !textPriorityIds.has(id)) continue;

        if (id.includes("top") || id.includes("headline")) {
            rects.push({ x: inset, y: inset, w: canvasWidth - 2 * inset, h: defaultBandHeight });
        } else if (id.includes("bottom") || id.includes("cta")) {
            rects.push({ x: inset, y: canvasHeight - defaultCtaHeight - inset, w: canvasWidth - 2 * inset, h: defaultCtaHeight });
        } else {
            rects.push({
                x: Math.round((canvasWidth - defaultCenterWidth) / 2),
                y: Math.round((canvasHeight - defaultCenterHeight) / 2),
                w: defaultCenterWidth,
                h: defaultCenterHeight,
            });
        }
    }

    return rects;
}

function resolveZoneWithCollision(
    plannedZone: LogoZone,
    logoWidth: number,
    logoHeight: number,
    canvasWidth: number,
    canvasHeight: number,
    collisionRects: Rect[],
): { zone: LogoZone; shifted: boolean; candidatesExhausted: LogoZone[] } {
    const plannedRect: Rect = (() => {
        const { top, left } = zoneToPixels(plannedZone, logoWidth, logoHeight, canvasWidth, canvasHeight);
        return { x: left, y: top, w: logoWidth, h: logoHeight };
    })();

    const hasCollision = collisionRects.some((r) => rectsOverlap(plannedRect, r));
    if (!hasCollision) {
        return { zone: plannedZone, shifted: false, candidatesExhausted: [] };
    }

    if (plannedZone === "center") {
        return { zone: plannedZone, shifted: false, candidatesExhausted: ["center"] };
    }

    const band = getBand(plannedZone);
    const sameBandCandidates = rotateToStart(getBandCandidates(band), plannedZone);

    // Order other bands by proximity: top → [middle, bottom], middle → [top, bottom],
    // bottom → [middle, top], center → [middle, top, bottom].
    const otherBands: Band[] = (() => {
        if (band === "top") return ["middle", "bottom"];
        if (band === "middle") return ["top", "bottom"];
        if (band === "bottom") return ["middle", "top"];
        return ["middle", "top", "bottom"];
    })();
    const otherCandidates: LogoZone[] = [];
    for (const ob of otherBands) {
        const anchor = bandStartAnchor(ob);
        const list = getBandCandidates(ob);
        if (anchor) otherCandidates.push(...rotateToStart(list, anchor));
        else otherCandidates.push(...list);
    }

    const allCandidates = [...sameBandCandidates, ...otherCandidates];
    const exhausted: LogoZone[] = [plannedZone];

    for (const candidate of allCandidates) {
        if (candidate === plannedZone) continue;
        const { top, left } = zoneToPixels(candidate, logoWidth, logoHeight, canvasWidth, canvasHeight);
        const candidateRect: Rect = { x: left, y: top, w: logoWidth, h: logoHeight };
        const candidateCollision = collisionRects.some((r) => rectsOverlap(candidateRect, r));
        if (!candidateCollision) {
            return { zone: candidate, shifted: true, candidatesExhausted: exhausted };
        }
        exhausted.push(candidate);
    }

    return { zone: plannedZone, shifted: false, candidatesExhausted: exhausted };
}

export async function compositeUILogos(args: CompositeUILogosArgs): Promise<CompositeUILogosResult> {
    const events = emptyEvents();

    const sharp = await getSharp();
    if (!sharp) {
        events.softWarnings.push({ logoIndex: -1, reason: "compositor_unavailable" });
        return { image: args.baseImageBase64, events };
    }

    const uiPlacements = args.placements.filter((p): p is UILogoPlacement => p.mode === "ui");
    if (uiPlacements.length === 0) {
        return { image: args.baseImageBase64, events };
    }

    let currentB64 = args.baseImageBase64;
    const rawBase = currentB64.includes(",") ? currentB64.split(",")[1] : currentB64;
    // Collision set starts with text/CTA rects; placed UI logo rects are appended as we go
    // so a later UI logo cannot overlap an earlier one.
    const collisionRects: Rect[] = [...getTextCollisionRects(args.layoutContract, args.canvasWidth, args.canvasHeight)];

    try {
        // Use a wider Buffer<ArrayBufferLike> type to accept sharp().toBuffer() reassignments
        // (sharp's typings emit Buffer<ArrayBufferLike> on some Node versions).
        let currentBuffer: Buffer = Buffer.from(rawBase, "base64");

        for (const placement of uiPlacements) {
            const logoSource = args.brandLogos[placement.logoIndex];
            if (!logoSource) {
                events.softWarnings.push({ logoIndex: placement.logoIndex, reason: "missing_source" });
                events.perLogo.push({
                    logoIndex: placement.logoIndex,
                    chosenMode: "ui",
                    outcome: "missing_source",
                    reason: "missing_source",
                });
                continue;
            }

            try {
                const logoB64 = logoSource.includes(",") ? logoSource.split(",")[1] : logoSource;
                const logoBuffer = Buffer.from(logoB64, "base64");

                const targetWidth = Math.round((placement.widthPct / 100) * args.canvasWidth);
                const resizedLogo = await sharp(logoBuffer)
                    .resize({ width: targetWidth, fit: "inside" })
                    .png()
                    .toBuffer();

                const logoMeta = await sharp(resizedLogo).metadata();
                const logoW = logoMeta.width || targetWidth;
                const logoH = logoMeta.height || Math.round(targetWidth * 0.5);

                const shadowOffsetY = 2;
                const shadowSigma = 2.5;
                const shadowAlpha = 0.25;
                // Build the shadow from the logo's ALPHA CHANNEL — preserves anti-aliased
                // edges. threshold(1) would binarize luminance and produce jagged shadows
                // on logos with smooth/transparent edges.
                const blurredAlpha = await sharp(resizedLogo)
                    .ensureAlpha()
                    .extractChannel("alpha")
                    .blur(shadowSigma)
                    .raw()
                    .toBuffer({ resolveWithObject: true });
                const shadowW = blurredAlpha.info.width;
                const shadowH = blurredAlpha.info.height;
                // Construct a black RGBA buffer where R=G=B=0 and A=blurredAlpha*0.25
                // — yields a soft black shadow that traces the logo's silhouette.
                const shadowRgba = Buffer.alloc(shadowW * shadowH * 4);
                for (let i = 0; i < blurredAlpha.data.length; i++) {
                    shadowRgba[i * 4] = 0;
                    shadowRgba[i * 4 + 1] = 0;
                    shadowRgba[i * 4 + 2] = 0;
                    shadowRgba[i * 4 + 3] = Math.round(blurredAlpha.data[i] * shadowAlpha);
                }
                const shadowLogo = await sharp(shadowRgba, {
                    raw: { width: shadowW, height: shadowH, channels: 4 },
                }).png().toBuffer();

                const padW = Math.max(logoW, shadowW) + 8;
                const padH = Math.max(logoH, shadowH) + 8 + shadowOffsetY;
                let padCanvas = await sharp({ create: { width: padW, height: padH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                    .composite([
                        { input: shadowLogo, top: shadowOffsetY, left: Math.round((padW - shadowW) / 2) },
                        { input: resizedLogo, top: 0, left: Math.round((padW - logoW) / 2) },
                    ])
                    .png()
                    .toBuffer();

                if (placement.opacity < 1.0) {
                    const { data, info } = await sharp(padCanvas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                    for (let i = 3; i < data.length; i += 4) {
                        data[i] = Math.round(data[i] * placement.opacity);
                    }
                    padCanvas = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
                        .png()
                        .toBuffer();
                }

                const paddedMeta = await sharp(padCanvas).metadata();
                const finalW = paddedMeta.width || padW;
                const finalH = paddedMeta.height || padH;

                const resolved = resolveZoneWithCollision(placement.zone, finalW, finalH, args.canvasWidth, args.canvasHeight, collisionRects);

                if (resolved.candidatesExhausted.length > 0 && !resolved.shifted) {
                    events.drops.push({
                        logoIndex: placement.logoIndex,
                        reason: "no_non_colliding_zone",
                        candidatesExhausted: resolved.candidatesExhausted,
                    });
                    events.perLogo.push({
                        logoIndex: placement.logoIndex,
                        chosenMode: "ui",
                        outcome: "no_zone",
                        reason: "no_non_colliding_zone",
                    });
                    continue;
                }

                if (resolved.shifted) {
                    events.autoShifts.push({
                        logoIndex: placement.logoIndex,
                        from: placement.zone,
                        to: resolved.zone,
                        reason: "text_collision",
                    });
                }

                const { top, left } = zoneToPixels(resolved.zone, finalW, finalH, args.canvasWidth, args.canvasHeight);

                currentBuffer = await sharp(currentBuffer)
                    .composite([{ input: padCanvas, top, left, blend: "over" }])
                    .png()
                    .toBuffer();

                // Append this placed UI logo's rect to the collision set so a later
                // UI logo can't be auto-shifted onto the same area.
                collisionRects.push({ x: left, y: top, w: finalW, h: finalH });

                events.perLogo.push({
                    logoIndex: placement.logoIndex,
                    chosenMode: "ui",
                    finalZone: resolved.zone,
                    outcome: "placed",
                });
            } catch (logoErr: unknown) {
                const detail = logoErr instanceof Error ? logoErr.message : String(logoErr);
                events.softWarnings.push({
                    logoIndex: placement.logoIndex,
                    reason: "composite_failed",
                    detail,
                });
                events.perLogo.push({
                    logoIndex: placement.logoIndex,
                    chosenMode: "ui",
                    outcome: "soft_failed",
                    reason: detail,
                });
            }
        }

        currentB64 = `data:image/png;base64,${currentBuffer.toString("base64")}`;
    } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn("⚠️ UI logo compositor total failure (non-blocking):", detail);
        events.softWarnings.push({ logoIndex: -1, reason: "composite_failed", detail });
    }

    return { image: currentB64, events };
}
