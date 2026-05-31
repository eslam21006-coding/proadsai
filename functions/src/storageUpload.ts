// functions/src/storageUpload.ts — server-side render persistence via the admin SDK.
//
// Admin-SDK uploads bypass Storage security rules entirely, so the browser never
// needs Storage WRITE access. This eliminates the storage/unauthorized, CORS, and
// auth-token-timing problems that the client-side renderUpload helper hit — the
// Cloud Function decodes the base64 render, writes it to Storage itself, and hands
// the frontend a ready-to-use public URL.

import { getStorage } from "firebase-admin/storage";

/**
 * Decode a base64 data-URL (or raw base64) image and upload it to Storage at
 * `${pathPrefix}/<timestamp>-<rand>.png`, returning a public download URL.
 * Throws on failure — callers decide whether that's fatal (reflow rerender) or
 * non-blocking (primary render).
 */
export async function saveBase64ToStorage(base64OrDataUrl: string, pathPrefix: string): Promise<string> {
    const commaIdx = base64OrDataUrl.indexOf(",");
    const b64 = base64OrDataUrl.startsWith("data:") && commaIdx >= 0
        ? base64OrDataUrl.slice(commaIdx + 1)
        : base64OrDataUrl;
    const buffer = Buffer.from(b64, "base64");

    // Modular Admin SDK: getStorage() resolves the default app initialized in index.ts.
    // Avoids the `admin.storage is not a function` interop pitfall from
    // `await import("firebase-admin")`.
    const bucket = getStorage().bucket();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = `${pathPrefix.replace(/\/+$/, "")}/${id}`;
    const file = bucket.file(filePath);
    await file.save(buffer, { metadata: { contentType: "image/png" }, resumable: false });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}
