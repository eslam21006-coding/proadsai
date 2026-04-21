// functions/src/workspaces/metaRoleProbe.ts — Meta Marketing API role verification

import * as functions from "firebase-functions";

type MetaRole = "ADMIN" | "ADVERTISER" | "INSUFFICIENT";

export async function probeMetaRole(
  userAccessToken: string,
  adAccountId: string
): Promise<MetaRole> {
  const id = adAccountId.replace("act_", "");
  const url = `https://graph.facebook.com/v20.0/${id}?fields=user_role&access_token=${userAccessToken}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      functions.logger.warn(`⚠️ Meta API error for ${adAccountId}: ${resp.status}`);
      return "INSUFFICIENT";
    }
    const body = (await resp.json()) as { user_role?: number };
    const role = body.user_role;
    if (role === 1001 || role === 1002) {
      return "ADMIN";
    }
    if (role === 1003) {
      return "ADVERTISER";
    }
    return "INSUFFICIENT";
  } catch (err) {
    functions.logger.error("🔥 Meta role probe failed:", err);
    throw new functions.https.HttpsError(
      "unavailable",
      "Could not verify Meta role right now. Please try again."
    );
  }
}
