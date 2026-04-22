// functions/src/workspaces/index.ts — barrel re-export for the workspaces module

export { assertOwner, assertScalePlan, assertWorkspaceActive, assertWorkspaceLimit, createWorkspaceWithLimit, resolveDefaultWorkspaceId } from "./workspacePolicy.js";
export { probeMetaRole } from "./metaRoleProbe.js";
export { writeAuditEntry } from "./auditLog.js";
export { purgeExpiredWorkspaces, cascadeReassignOnDelete, cascadeRevertOnRestore } from "./workspacePurge.js";
