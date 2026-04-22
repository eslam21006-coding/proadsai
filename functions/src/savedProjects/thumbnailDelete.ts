// functions/src/savedProjects/thumbnailDelete.ts — Storage-side delete helper for cascade

import { getStorage } from "firebase-admin/storage";

export async function deleteThumbnailObject(uid: string, projectId: string): Promise<void> {
  const bucket = getStorage().bucket();
  const extensions = ["jpg", "png"];

  for (const ext of extensions) {
    const filePath = `users/${uid}/projects/${projectId}/thumbnail.${ext}`;
    try {
      await bucket.file(filePath).delete();
    } catch (err: any) {
      if (err?.code !== 404 && err?.message?.includes("No such object")) {
        throw err;
      }
    }
  }
}
