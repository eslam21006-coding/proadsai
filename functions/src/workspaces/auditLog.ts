// functions/src/workspaces/auditLog.ts — append-only grant/revoke audit writer

import * as admin from "firebase-admin";

const db = admin.firestore();

interface AuditEntry {
  actorUid: string;
  targetMemberUid: string;
  targetMemberEmail: string;
  workspaceId: string;
  workspaceNameAtEvent: string;
  action: "grant" | "revoke";
  timestamp: number;
  planSnapshot: "none" | "starter" | "pro" | "scale";
}

function generateEntryId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${ts}_${rand}`;
}

export async function writeAuditEntry(
  txn: admin.firestore.Transaction,
  params: {
    ownerUid: string;
    actorUid: string;
    targetMemberUid: string;
    targetMemberEmail: string;
    workspaceId: string;
    workspaceNameAtEvent: string;
    action: "grant" | "revoke";
    planSnapshot: "none" | "starter" | "pro" | "scale";
  }
): Promise<void> {
  const entryId = generateEntryId();
  const entry: AuditEntry = {
    actorUid: params.actorUid,
    targetMemberUid: params.targetMemberUid,
    targetMemberEmail: params.targetMemberEmail,
    workspaceId: params.workspaceId,
    workspaceNameAtEvent: params.workspaceNameAtEvent,
    action: params.action,
    timestamp: Date.now(),
    planSnapshot: params.planSnapshot,
  };
  const ref = db
    .collection(`users/${params.ownerUid}/workspace_access_audit`)
    .doc(entryId);
  txn.set(ref, entry);
}
