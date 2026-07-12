// functions/src/workspaces/metaRoleProbe.ts — Meta Marketing API role verification

import * as functions from "firebase-functions";

type MetaRole = "ADMIN" | "ADVERTISER" | "ANALYST" | "INSUFFICIENT";

const META_API_VERSION = "v22.0";
const PROBE_TIMEOUT_MS = 5000;

interface AssignedUser {
  id: string;
  tasks?: string[];
  permissions?: string[];
}

export async function probeMetaRole(
  userAccessToken: string,
  adAccountId: string
): Promise<MetaRole> {
  const id = adAccountId.replace("act_", "");
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  try {
    const meUrl = `https://graph.facebook.com/${META_API_VERSION}/me?access_token=${userAccessToken}`;
    const meResp = await fetch(meUrl, { signal });
    if (!meResp.ok) {
      functions.logger.warn(`⚠️ Meta /me error: ${meResp.status}`);
      return "INSUFFICIENT";
    }
    const meBody = (await meResp.json()) as { id?: string };
    const currentUserId = meBody.id;
    if (!currentUserId) {
      functions.logger.warn(`⚠️ Meta /me returned no id`);
      return "INSUFFICIENT";
    }

    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${id}/assigned_users?fields=id,tasks,permissions&access_token=${userAccessToken}`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
      functions.logger.warn(`⚠️ Meta API error for ${adAccountId}: ${resp.status}`);
      return "INSUFFICIENT";
    }
    const body = (await resp.json()) as { data?: AssignedUser[] };
    const assignedUsers = body.data;
    if (!Array.isArray(assignedUsers)) {
      functions.logger.warn(
        `⚠️ Meta assigned_users missing for ${adAccountId}`
      );
      return "INSUFFICIENT";
    }
    const myEntry = assignedUsers.find((u) => u.id === currentUserId);
    const roles = [
      ...(myEntry?.tasks ?? []),
      ...(myEntry?.permissions ?? []),
    ].map((s) => s.toUpperCase());
    if (roles.includes("MANAGE") || roles.includes("ADMIN")) {
      return "ADMIN";
    }
    if (roles.includes("ADVERTISE") || roles.includes("ADVERTISER")) {
      return "ADVERTISER";
    }
    if (roles.includes("ANALYZE") || roles.includes("ANALYST")) {
      return "ANALYST";
    }
    return "INSUFFICIENT";
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError" || signal.aborted) {
      functions.logger.warn(
        `⚠️ Meta role probe timed out for ${adAccountId}`
      );
      return "INSUFFICIENT";
    }
    functions.logger.error("🔥 Meta role probe failed:", err);
    throw new functions.https.HttpsError(
      "unavailable",
      "Could not verify Meta role right now. Please try again."
    );
  }
}
