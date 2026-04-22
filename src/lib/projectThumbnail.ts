// src/lib/projectThumbnail.ts — uploadAndPersistThumbnail: fetch, downscale, upload to Storage

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

const MAX_DIM = 512;
const MAX_BYTES = 256 * 1024;
const STORAGE_PATH = (uid: string, projectId: string) =>
  `users/${uid}/projects/${projectId}/thumbnail.jpg`;

function downscaleToJpg(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2d unavailable")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(blob);
  });
}

function isStorageUrl(url: string): boolean {
  return url.includes("firebasestorage.googleapis.com")
    || url.includes("storage.googleapis.com");
}

export async function uploadAndPersistThumbnail(
  uid: string,
  projectId: string,
  sourceUrl: string,
): Promise<string> {
  if (isStorageUrl(sourceUrl) && sourceUrl.includes(`/projects/${projectId}/thumbnail`)) {
    return sourceUrl;
  }

  let blob: Blob;
  if (sourceUrl.startsWith("data:")) {
    const res = await fetch(sourceUrl);
    blob = await res.blob();
  } else {
    const res = await fetch(sourceUrl);
    blob = await res.blob();
  }

  if (blob.size > MAX_BYTES || blob.type !== "image/jpeg") {
    blob = await downscaleToJpg(blob);
  }

  if (blob.size > MAX_BYTES) {
    blob = await downscaleToJpg(blob);
  }

  const storageRef = ref(storage, STORAGE_PATH(uid, projectId));
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(storageRef);
}
