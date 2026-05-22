// src/services/workspaceService.ts — thin facade over httpsCallable for all workspace callables

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import type { WorkspaceAccessAuditEntry } from "../types";
import type { GenerationRecord } from "./feedbackService";

type WorkspaceGeneration = GenerationRecord & { id: string; workspaceId: string };
type AuditLogCursor = { timestamp: number; id: string };
type GenerationsCursor = { timestamp: number; id: string };

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
  cursor?: GenerationsCursor | null;
}

interface GetWorkspaceAccessAuditLogRequest {
  limit?: number;
  cursor?: AuditLogCursor | null;
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
      { items: WorkspaceGeneration[]; nextCursor: GenerationsCursor | null }
    >(functions, "getWorkspaceGenerations")(req),

  getWorkspaceAccessAuditLog: (req?: GetWorkspaceAccessAuditLogRequest) =>
    httpsCallable<
      GetWorkspaceAccessAuditLogRequest,
      { entries: WorkspaceAccessAuditEntry[]; nextCursor: AuditLogCursor | null }
    >(functions, "getWorkspaceAccessAuditLog")(req ?? {}),

  getUserProjects: (req?: { workspaceId?: string; status?: string; pageSize?: number; cursor?: string }) =>
    httpsCallable<
      { workspaceId?: string; status?: string; pageSize?: number; cursor?: string },
      { projects: any[]; nextCursor: string | null }
    >(functions, "getUserProjects")(req ?? {}),
};
