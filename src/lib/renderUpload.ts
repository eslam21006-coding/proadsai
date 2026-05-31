// src/lib/renderUpload.ts — upload a freshly-rendered base64 ad image to Firebase
// Storage and return a durable download URL.
//
// WHY THIS EXISTS (Phase 17 / reflow): the generation pipeline returns the render
// as a base64 `data:image/...` URL. Storing that base64 directly in the
// `generations/{genId}` document blows past Firestore's 1 MiB document limit
// (a single render is ~1–5 MB), so the `addDoc` silently fails and the caller
// gets back an empty id — which is exactly the `studio.reflow.no_generation_id`
// failure. On top of that, the `reflowImage` callable reads `output.imageUrl`
// and downloads it from Storage via the admin SDK (`resolveStoragePath` →
// `bucket.file(path).download()`); it cannot consume a base64 data URL at all.
//
// Uploading the render to Storage first solves both: the doc stays tiny (just a
// URL) so the write succeeds and a real generationId comes back, AND the reflow
// backend can fetch the source bytes. The on-screen image still uses the in-memory
// base64 for instant display — only the *persisted* imageUrl becomes a Storage URL.

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const b64 = dataUrl.slice(commaIdx + 1);
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Uploads a base64 data-URL render to `users/{uid}/renders/{id}.png` and returns
 * the durable download URL. If `imageData` is already a remote URL (not a data:
 * URL) it is returned unchanged, so callers can pass values that may or may not
 * have already been persisted (idempotent).
 */
export async function uploadRenderToStorage(uid: string, imageData: string): Promise<string> {
  if (!imageData || !imageData.startsWith("data:")) return imageData;
  try {
    const blob = dataUrlToBlob(imageData);
    const ext = blob.type === "image/jpeg" ? "jpg" : "png";
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storageRef = ref(storage, `users/${uid}/renders/${id}`);
    await uploadBytes(storageRef, blob, { contentType: blob.type });
    return await getDownloadURL(storageRef);
  } catch (err) {
    // NEVER rethrow — generation must not fail because Storage is unavailable
    // (CORS misconfig / bucket outage manifests as AbortError / "Failed to fetch").
    // Return the "pending_upload" sentinel: the generation still saves with a valid
    // id, and the reflow backend detects the sentinel and rerenders from the plan.
    const name = (err as { name?: string })?.name;
    const code = (err as { code?: string })?.code;
    if (name === "AbortError" || code === "storage/canceled" || code === "storage/retry-limit-exceeded") {
      console.warn("[renderUpload] Storage upload aborted (likely CORS/Storage outage) — using 'pending_upload'; reflow will rerender from plan.");
    } else {
      console.warn("[renderUpload] Storage upload failed (non-blocking) — using 'pending_upload':", err);
    }
    return "pending_upload";
  }
}
