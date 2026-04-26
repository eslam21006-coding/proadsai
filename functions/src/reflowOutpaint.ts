// functions/src/reflowOutpaint.ts — Sharp-based pure margin extension + byte-identity verification (HOTFIX-F)

import type { AspectRatio } from "./generators.js";
import type { Sharp } from "sharp";
import { RATIO_TO_NUMERIC } from "./reflowRouter.js";

type SharpFactory = (input?: Buffer | string | Uint8Array, options?: { raw?: { width: number; height: number; channels: 4 } }) => Sharp;

let sharpInstance: SharpFactory | null = null;
let sharpLoadAttempted = false;

async function getSharp(): Promise<SharpFactory> {
    if (sharpLoadAttempted && sharpInstance) return sharpInstance;
    if (sharpLoadAttempted && !sharpInstance) {
        throw new Error("Sharp not available — reflowOutpaint disabled");
    }
    sharpLoadAttempted = true;
    try {
        const mod = await import("sharp");
        sharpInstance = ((mod as unknown as { default?: SharpFactory }).default ?? (mod as unknown as SharpFactory));
    } catch {
        throw new Error("Sharp not available — reflowOutpaint disabled");
    }
    return sharpInstance!;
}

const OUTPAINT_CREDIT_COST = 2;

export async function outpaintReflow(args: {
    sourceImageUrl: string;
    sourceRatio: AspectRatio;
    targetRatio: AspectRatio;
    sourceBuffer?: Buffer;
}): Promise<{ outputBuffer: Buffer; sourceBuffer: Buffer; outputUrl: string; creditsCharged: number }> {
    const { sourceRatio, targetRatio } = args;
    const sharp = await getSharp();

    let srcBuf: Buffer;
    if (args.sourceBuffer) {
        srcBuf = args.sourceBuffer;
    } else {
        const admin = await import("firebase-admin");
        const bucket = admin.storage().bucket();
        const path = decodeURIComponent(args.sourceImageUrl.split("/o/")[1]?.split("?")[0] || "");
        const [fileBuf] = await bucket.file(path).download();
        srcBuf = fileBuf;
    }

    const srcMeta = await sharp(srcBuf).metadata();
    const srcW = srcMeta.width!;
    const srcH = srcMeta.height!;

    const srcNumeric = RATIO_TO_NUMERIC[sourceRatio];
    const tgtNumeric = RATIO_TO_NUMERIC[targetRatio];

    let dstW: number, dstH: number;
    if (tgtNumeric < srcNumeric) {
        dstW = srcW;
        dstH = Math.round(srcW / tgtNumeric);
    } else {
        dstH = srcH;
        dstW = Math.round(srcH * tgtNumeric);
    }

    const top = Math.floor((dstH - srcH) / 2);
    const bottom = dstH - srcH - top;
    const left = Math.floor((dstW - srcW) / 2);
    const right = dstW - srcW - left;

    const outputBuffer = await sharp(srcBuf)
        .extend({ top, bottom, left, right, extendWith: "mirror" })
        .png()
        .toBuffer();

    const admin = await import("firebase-admin");
    const bucket = admin.storage().bucket();
    const newId = `reflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const uploadPath = `reflows/${newId}`;
    const file = bucket.file(uploadPath);
    await file.save(outputBuffer, { metadata: { contentType: "image/png" } });
    await file.makePublic();
    const outputUrl = `https://storage.googleapis.com/${bucket.name}/${uploadPath}`;

    return { outputBuffer, sourceBuffer: srcBuf, outputUrl, creditsCharged: OUTPAINT_CREDIT_COST };
}

export async function verifyLockedRegion(
    sourceBuffer: Buffer,
    outputBuffer: Buffer,
): Promise<{ ok: boolean; reason: "drift" | "shape_mismatch" | null }> {
    const sharp = await getSharp();

    const srcRaw = await sharp(sourceBuffer).raw().toBuffer();
    const srcMeta = await sharp(sourceBuffer).metadata();
    const srcW = srcMeta.width!;
    const srcH = srcMeta.height!;

    const outMeta = await sharp(outputBuffer).metadata();
    const outW = outMeta.width!;
    const outH = outMeta.height!;

    const outRaw = await sharp(outputBuffer).raw().toBuffer();

    const padLeft = Math.floor((outW - srcW) / 2);
    const padTop = Math.floor((outH - srcH) / 2);

    if (outW < srcW || outH < srcH) {
        return { ok: false, reason: "shape_mismatch" };
    }

    for (let y = 0; y < srcH; y++) {
        for (let x = 0; x < srcW; x++) {
            const srcIdx = (y * srcW + x) * 4;
            const outIdx = ((y + padTop) * outW + (x + padLeft)) * 4;
            if (
                srcRaw[srcIdx] !== outRaw[outIdx] ||
                srcRaw[srcIdx + 1] !== outRaw[outIdx + 1] ||
                srcRaw[srcIdx + 2] !== outRaw[outIdx + 2] ||
                srcRaw[srcIdx + 3] !== outRaw[outIdx + 3]
            ) {
                return { ok: false, reason: "drift" };
            }
        }
    }

    return { ok: true, reason: null };
}

export { OUTPAINT_CREDIT_COST };
