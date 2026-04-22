// functions/src/savedProjects/getUserProjects.ts — paginated project listing callable

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { resolveCallerScope } from "../workspaces/workspacePolicy.js";
import { stepsWithData } from "./projectStepsData.js";

const db = admin.firestore();

interface GetRequest {
  workspaceId?: string;
  status?: "draft" | "rendered" | "published";
  pageSize?: number;
  cursor?: string;
}

export const getUserProjects = onCall({ region: "europe-west1" }, async (request: CallableRequest<GetRequest>) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const callerUid = request.auth.uid;
  const { workspaceId, status, pageSize, cursor } = request.data ?? {};

  if (status && !["draft", "rendered", "published"].includes(status)) {
    throw new HttpsError("invalid-argument", "Invalid status value");
  }

  const effectivePageSize = Math.max(1, Math.min(100, pageSize ?? 50));

  let cursorData: { timestamp: number; id: string } | null = null;
  if (cursor) {
    try {
      cursorData = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    } catch {
      throw new HttpsError("invalid-argument", "Malformed cursor");
    }
  }

  const { ownerUid, allowedWorkspaceIds } = await resolveCallerScope(callerUid);

  if (workspaceId) {
    if (allowedWorkspaceIds !== "ALL" && !allowedWorkspaceIds.includes(workspaceId)) {
      console.warn(`phase13 ▸ permission-denied caller=${callerUid} workspace=${workspaceId}`);
      throw new HttpsError("permission-denied", "Workspace access denied");
    }
  }

  // Fetch one extra row so we can tell "exactly N items returned" apart from
  // "there's a next page" without an extra round-trip.
  let q: admin.firestore.Query = db.collection(`users/${ownerUid}/projects`)
    .orderBy("timestamp", "desc")
    .orderBy("id", "desc")
    .limit(effectivePageSize + 1);

  if (workspaceId) {
    q = q.where("workspaceId", "==", workspaceId);
  } else if (allowedWorkspaceIds !== "ALL" && allowedWorkspaceIds.length > 0) {
    const wsSlice = allowedWorkspaceIds.slice(0, 30);
    if (allowedWorkspaceIds.length > wsSlice.length) {
      console.warn(
        `phase13 ▸ getUserProjects allowedWorkspaceIds truncated for caller=${callerUid} ` +
        `total=${allowedWorkspaceIds.length} kept=${wsSlice.length} omitted=${allowedWorkspaceIds.length - wsSlice.length}`,
      );
    }
    q = q.where("workspaceId", "in", wsSlice);
  }

  if (status) {
    q = q.where("status", "==", status);
  }

  if (cursorData) {
    const cursorDoc = await db.collection(`users/${ownerUid}/projects`)
      .where("timestamp", "==", cursorData.timestamp)
      .where("id", "==", cursorData.id)
      .limit(1).get();
    if (!cursorDoc.empty) {
      q = q.startAfter(cursorDoc.docs[0]);
    }
  }

  const snap = await q.get();
  const allDocs = snap.docs;
  const hasMore = allDocs.length > effectivePageSize;
  const pageDocs = hasMore ? allDocs.slice(0, effectivePageSize) : allDocs;

  const projects = pageDocs.map((doc) => {
    const d = doc.data();
    const steps = stepsWithData({
      inputs: d.inputs ?? null,
      tovText: d.tovText ?? "",
      selectedTov: d.selectedTov ?? "",
      buildPlan: d.buildPlan ?? "",
      mockupHistory: d.mockupHistory ?? [],
      carouselSlides: d.carouselSlides ?? [],
      batchResults: d.batchResults ?? [],
      captionText: d.captionText ?? "",
      batchCaptions: d.batchCaptions ?? [],
    });
    return {
      id: doc.id,
      workspaceId: d.workspaceId,
      name: d.name ?? "Untitled",
      timestamp: d.timestamp ?? 0,
      status: d.status ?? "draft",
      thumbnailUrl: d.thumbnailUrl,
      stepsWithData: steps,
      phase: d.phase ?? "input",
      creatorName: d.creatorName,
      creatorEmail: d.creatorEmail,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && projects.length > 0) {
    const last = projects[projects.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ timestamp: last.timestamp, id: last.id })).toString("base64");
  }

  return { projects, nextCursor };
});
