// functions/src/workspaces/index.ts — barrel re-export for the workspaces module

export { assertOwner, assertScalePlan, assertWorkspaceActive, assertWorkspaceLimit, createWorkspaceWithLimit, resolveCallerScope, resolveDefaultWorkspaceId } from "./workspacePolicy.js";
export { probeMetaRole } from "./metaRoleProbe.js";
export { writeAuditEntry } from "./auditLog.js";
export { purgeExpiredWorkspaces, cascadeReassignOnDelete, cascadeRevertOnRestore } from "./workspacePurge.js";
export {
  resolveMetaScope,
  assertWorkspaceAllowed,
  loadActiveWorkspace,
  resolvePublishWorkspace,
  resolveWorkspacePage,
  type ResolvedMetaScope,
  type PageSource,
} from "./metaCallerScope.js";
