// functions/src/reflowOutpaint.ts — Sharp-based pure margin extension + byte-identity verification (HOTFIX-F)
// Superseded by Phase 17 independent multi-size generation. Kept for reversibility.

import type { AspectRatio } from "./generators.js";
import type { Sharp } from "sharp";
import { getStorage } from "firebase-admin/storage";
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
    let candidate: SharpFactory | null = null;
    try {
        const mod = await import("sharp");
        candidate = ((mod as unknown as { default?: SharpFactory }).default ?? (mod as unknown as SharpFactory));
    } catch {
        throw new Error("Sharp not available — reflowOutpaint disabled");
    }
    if (typeof candidate !== "function") {
        throw new Error("Sharp module malformed — reflowOutpaint disabled");
    }
    sharpInstance = candidate;
    return sharpInstance;
}

export const OUTPAINT_CREDIT_COST = 5;

/**
 * Extract the GCS object path from any of the URL shapes the codebase emits:
 *   1. firebasestorage.googleapis.com/.../o/{encodedObject}?alt=media&token=...
 *   2. https://storage.googleapis.com/<bucket>/<object>
 *   3. https://<bucket>.storage.googleapis.com/<object>
 *   4. <object> (bare object path — pass-through)
 * Returns null if none of the patterns match.
 */
export function resolveStoragePath(url: string, bucketName: string): string | null {
    if (!url) return null;
    // Form 1: firebasestorage download URL
    if (url.includes("/o/")) {
        const after = url.split("/o/")[1];
        if (after) return decodeURIComponent(after.split("?")[0]);
    }
    // Form 2: https://storage.googleapis.com/<bucket>/<object>
    const m2 = url.match(/^https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/);
    if (m2) {
        const [, urlBucket, object] = m2;
        // If bucketName is known, refuse cross-bucket reads as a safety guard.
        if (bucketName && urlBucket !== bucketName) return null;
        return decodeURIComponent(object);
    }
    // Form 3: https://<bucket>.storage.googleapis.com/<object>
    // Bucket names can contain dots (e.g. `my-project.appspot.com`), so the host capture
    // must be a non-greedy `(.+?)` rather than `[^.]+`.
    const m3 = url.match(/^https?:\/\/(.+?)\.storage\.googleapis\.com\/(.+)$/);
    if (m3) {
        // Match Form 2 behaviour: refuse cross-bucket reads when bucketName is known.
        if (bucketName && m3[1] !== bucketName) return null;
        return decodeURIComponent(m3[2]);
    }
    // Form 4: bare object path
    if (!url.startsWith("http")) return url;
    return null;
}

export async function outpaintReflow(args: {
    sourceImageUrl: string;
    sourceRatio: AspectRatio;
    targetRatio: AspectRatio;
    sourceBuffer?: Buffer;
}): Promise<{ outputBuffer: Buffer; sourceBuffer: Buffer; outputUrl: string; creditsCharged: number }> {
    const { sourceRatio, targetRatio } = args;
    const sharp = await getSharp();

    // Modular Admin SDK: getStorage() resolves the default app initialized in index.ts.
    // Avoids the `admin.storage is not a function` interop pitfall from
    // `await import("firebase-admin")`. One bucket handle for both download and upload.
    const bucket = getStorage().bucket();

    let srcBuf: Buffer;
    if (args.sourceBuffer) {
        srcBuf = args.sourceBuffer;
    } else {
        const path = resolveStoragePath(args.sourceImageUrl, bucket.name);
        if (!path) {
            throw new Error(`Cannot resolve Storage object path from URL: ${args.sourceImageUrl}`);
        }
        const [fileBuf] = await bucket.file(path).download();
        srcBuf = fileBuf;
    }

    const srcMeta = await sharp(srcBuf).metadata();
    if (!srcMeta.width || !srcMeta.height || srcMeta.width <= 0 || srcMeta.height <= 0) {
        throw new Error(
            `Source image metadata invalid (width=${srcMeta.width}, height=${srcMeta.height}); cannot outpaint.`,
        );
    }
    const srcW = srcMeta.width;
    const srcH = srcMeta.height;

    const srcNumeric = RATIO_TO_NUMERIC[sourceRatio];
    const tgtNumeric = RATIO_TO_NUMERIC[targetRatio];
    if (!Number.isFinite(srcNumeric) || !Number.isFinite(tgtNumeric)) {
        throw new Error(
            `RATIO_TO_NUMERIC lookup failed (sourceRatio=${sourceRatio}→${srcNumeric}, targetRatio=${targetRatio}→${tgtNumeric}); cannot outpaint.`,
        );
    }

    let dstW: number, dstH: number;
    if (tgtNumeric < srcNumeric) {
        dstW = srcW;
        dstH = Math.round(srcW / tgtNumeric);
    } else {
        dstH = srcH;
        dstW = Math.round(srcH * tgtNumeric);
    }

    const top = Math.floor((dstH - srcH) / 2);
    const left = Math.floor((dstW - srcW) / 2);

    // "Blurred background" fill (the Instagram/social standard for ratio conversion).
    // Mirror-extend was reflecting the hero upside-down on vertical extension and looked
    // terrible. Instead: scale the source to *cover* the full target canvas, blur it
    // heavily, then composite the untouched original centered on top. The center region
    // stays byte-identical to the source (verifyLockedRegion still passes), and the
    // extended margins are filled with a soft, on-brand blur of the same image.
    const blurredBackground = await sharp(srcBuf)
        .resize(dstW, dstH, { fit: "cover" })
        .blur(40)
        .toBuffer();

    const outputBuffer = await sharp(blurredBackground)
        .composite([{ input: srcBuf, top, left }])
        .png()
        .toBuffer();

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

    const srcMeta = await sharp(sourceBuffer).metadata();
    if (!srcMeta.width || !srcMeta.height || srcMeta.width <= 0 || srcMeta.height <= 0) {
        throw new Error(
            `verifyLockedRegion: source metadata invalid (width=${srcMeta.width}, height=${srcMeta.height}).`,
        );
    }
    const outMeta = await sharp(outputBuffer).metadata();
    if (!outMeta.width || !outMeta.height || outMeta.width <= 0 || outMeta.height <= 0) {
        throw new Error(
            `verifyLockedRegion: output metadata invalid (width=${outMeta.width}, height=${outMeta.height}).`,
        );
    }
    const srcW = srcMeta.width;
    const srcH = srcMeta.height;
    const outW = outMeta.width;
    const outH = outMeta.height;

    // ensureAlpha() guarantees 4 bytes/pixel (RGBA) so the (y * width + x) * 4
    // stride math below is correct regardless of whether the source PNG was RGB or RGBA.
    const srcRaw = await sharp(sourceBuffer).ensureAlpha().raw().toBuffer();
    const outRaw = await sharp(outputBuffer).ensureAlpha().raw().toBuffer();

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
