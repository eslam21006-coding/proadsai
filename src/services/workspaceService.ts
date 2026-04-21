// src/services/workspaceService.ts — thin facade over httpsCallable for all workspace callables

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

interface CreateWorkspaceRequest {
  name: string;
  brandName: string;
  brandColorPrimary?: string;
  brandColorSecondary?: string;
  logoUrl?: string;
  brandUrl?: string;
}

interface UpdateWorkspaceRequest {
  workspaceId: string;
  name?: string;
  brandName?: string;
  brandColorPrimary?: string | null;
  brandColorSecondary?: string | null;
  logoUrl?: string | null;
  brandUrl?: string | null;
}

interface LinkMetaAccountRequest {
  workspaceId: string;
  metaAdAccountId: string;
  metaAdAccountName: string;
}

interface SetTeamMemberWorkspaceAccessRequest {
  memberDocId: string;
  workspaceAccess: string[];
}

interface GetWorkspaceGenerationsRequest {
  workspaceId: string;
  limit?: number;
  cursor?: number;
}

interface GetWorkspaceAccessAuditLogRequest {
  limit?: number;
  cursor?: string;
  filterMemberUid?: string;
  filterWorkspaceId?: string;
}

export const workspaceService = {
  createWorkspace: (req: CreateWorkspaceRequest) =>
    httpsCallable<CreateWorkspaceRequest, { workspaceId: string }>(
      functions,
      "createWorkspace"
    )(req),

  updateWorkspace: (req: UpdateWorkspaceRequest) =>
    httpsCallable<UpdateWorkspaceRequest, { ok: true }>(
      functions,
      "updateWorkspace"
    )(req),

  deleteWorkspace: (workspaceId: string) =>
    httpsCallable<{ workspaceId: string }, { ok: true; pendingReassign: boolean }>(
      functions,
      "deleteWorkspace"
    )({ workspaceId }),

  restoreWorkspace: (workspaceId: string) =>
    httpsCallable<{ workspaceId: string }, { ok: true; pendingRestore: boolean }>(
      functions,
      "restoreWorkspace"
    )({ workspaceId }),

  linkMetaAccountToWorkspace: (req: LinkMetaAccountRequest) =>
    httpsCallable<LinkMetaAccountRequest, { ok: true; metaRoleAtLinkTime: string }>(
      functions,
      "linkMetaAccountToWorkspace"
    )(req),

  unlinkMetaAccountFromWorkspace: (workspaceId: string) =>
    httpsCallable<{ workspaceId: string }, { ok: true }>(
      functions,
      "unlinkMetaAccountFromWorkspace"
    )({ workspaceId }),

  setTeamMemberWorkspaceAccess: (req: SetTeamMemberWorkspaceAccessRequest) =>
    httpsCallable<
      SetTeamMemberWorkspaceAccessRequest,
      { ok: true; granted: string[]; revoked: string[] }
    >(functions, "setTeamMemberWorkspaceAccess")(req),

  getWorkspaceGenerations: (req: GetWorkspaceGenerationsRequest) =>
    httpsCallable<
      GetWorkspaceGenerationsRequest,
      { items: any[]; nextCursor: number | null }
    >(functions, "getWorkspaceGenerations")(req),

  getWorkspaceAccessAuditLog: (req?: GetWorkspaceAccessAuditLogRequest) =>
    httpsCallable<
      GetWorkspaceAccessAuditLogRequest,
      { entries: any[]; nextCursor: string | null }
    >(functions, "getWorkspaceAccessAuditLog")(req ?? {}),
};
