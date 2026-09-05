// src/services/metaService.ts
// ═══════════════════════════════════════════════════════════════════════════
// PRO ADS AI — META ADS INTEGRATION (Frontend)
// UPDATED: Popup OAuth (new tab), account picker, no redirect away
// ═══════════════════════════════════════════════════════════════════════════

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// PHASE 970 (bug 2026-09-03) — typed result for the dashboard's
// SYNC NOW press. Exported so WhatsWorkingDashboard can render the
// in-modal banner from a single source of truth. The `busy` field
// short-circuits the lease-collision path so the dashboard can
// render the busy string instead of falling through to `failed`.
// (Source: specs/970-sync-unification/reports/bug-2026-09-03-dashboard-no-feedback.md)
export interface DashboardSyncResult {
    ok: boolean;
    busy: boolean;
    lastMetaSyncAt: number | null;
    counts?: {
        campaigns?: number;
        adSets?: number;
        ads?: number;
        matched?: number;
        unmatched?: number;
        ambiguous?: number;
    };
    legacyRateLimited?: string[];
    workspaceQueued?: number;
    workspaceRateLimited?: string[];
    needsReauth?: boolean;
}

const META_APP_ID = "1975052683417261";
const OAUTH_REDIRECT_URI = "https://europe-west1-proadsai-saas.cloudfunctions.net/metaOAuthCallback";
// All five scopes require Advanced Access via App Review.
// ads_management — upload images, list ad accounts via /me/adaccounts
// ads_read — read performance metrics via /insights
// pages_show_list — list user's Pages (bundled by Meta use case)
// pages_read_engagement — read Page metadata (bundled by Meta use case)
// business_management — required for /me/accounts to return
//   Pages connected via a Business (without it, only personally-
//   administered Pages appear)
const META_OAUTH_SCOPES = "ads_read,ads_management,pages_show_list,pages_read_engagement,business_management";

export interface MetaAdAccount {
    id: string;
    name: string;
    status: number;
    currency: string;
    timezone: string;
}

export interface MetaPage {
    id: string;
    name: string;
    pictureUrl: string | null;
    fanCount: number;
    category: string | null;
}

export interface MetaConnection {
    connected: boolean;
    adAccounts: MetaAdAccount[];
    selectedAccountId: string | null;
    pages: MetaPage[];
    selectedPageId: string | null;
    selectedPageName: string | null;
    // Phase 967 (contract C6) — workspace-aware Page. Present when
    // `getMetaConnection` is called with a `workspaceId`. `pageSource`
    // tells the UI whether the Page came from the workspace's own
    // record (`'workspace'`), the legacy account-level fallback
    // (`'legacy_global'`), or no Page at all (`'none'`).
    activePageId?: string | null;
    activePageName?: string | null;
    pageSource?: "workspace" | "legacy_global" | "none";
    isTeamMember?: boolean;
    connectedAt: any;
    lastSyncAt: any;
    status: string;
    tokenExpiring: boolean;
}

class MetaService {

    // Opens OAuth in a POPUP window — user stays on Pro Ads AI
    startOAuthFlow(userId: string): Promise<boolean> {
        return new Promise((resolve) => {
            const state = userId;
            const oauthUrl =
                `https://www.facebook.com/v22.0/dialog/oauth?` +
                `client_id=${META_APP_ID}` +
                `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
                `&scope=${META_OAUTH_SCOPES}` +
                `&state=${state}` +
                `&response_type=code`;

            const width = 600;
            const height = 700;
            const left = window.screenX + (window.innerWidth - width) / 2;
            const top = window.screenY + (window.innerHeight - height) / 2;
            const popup = window.open(
                oauthUrl,
                'meta_oauth',
                `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
            );

            // Poll for popup close, then check connection
            const checkInterval = setInterval(async () => {
                try {
                    if (!popup || popup.closed) {
                        clearInterval(checkInterval);
                        const conn = await this.getConnection();
                        resolve(conn.connected);
                    }
                } catch (e) {
                    // Cross-origin errors expected while on facebook.com
                }
            }, 1000);

            // Safety timeout after 5 minutes
            setTimeout(() => { clearInterval(checkInterval); resolve(false); }, 300000);
        });
    }

    async getConnection(opts?: { workspaceId?: string | null }): Promise<MetaConnection> {
        try {
            const fn = httpsCallable(functions, 'getMetaConnection');
            // Phase 967 (C6) — pass `workspaceId` when the caller wants
            // the workspace-aware Page fields. The backend fills in
            // `activePageId` / `activePageName` / `pageSource` and the
            // existing fields stay populated for back-compat.
            const result = await fn(
                opts?.workspaceId ? { workspaceId: opts.workspaceId } : {},
            );
            return result.data as MetaConnection;
        } catch (err) {
            console.error('Failed to get Meta connection:', err);
            return { connected: false, adAccounts: [], selectedAccountId: null, pages: [], selectedPageId: null, selectedPageName: null, connectedAt: null, lastSyncAt: null, status: 'error', tokenExpiring: false };
        }
    }

    async selectAccount(accountId: string): Promise<boolean> {
        try {
            const fn = httpsCallable(functions, 'metaSelectAccount');
            await fn({ accountId });
            return true;
        } catch (err) {
            console.error('Failed to select account:', err);
            return false;
        }
    }

    // Phase 967 (contract C1) — Page selection is workspace-scoped.
    // The backend records the Page on the workspace and only uses the
    // account-global `selectedPageId` / `selectedPageName` as the
    // legacy fallback for `NEVER_SET` workspaces (FR-007).
    async selectPage(
        pageId: string | null,
        pageName: string | null,
        opts?: { workspaceId?: string | null },
    ): Promise<boolean> {
        try {
            const fn = httpsCallable(functions, 'metaSelectPage');
            await fn({
                pageId,
                pageName,
                workspaceId: opts?.workspaceId ?? null,
            });
            return true;
        } catch (err) {
            console.error('Failed to select page:', err);
            return false;
        }
    }

    // Phase 14 batch 04 (dashboard-connection-fix) — Mirror the
    // `connectMetaAccount` server callable so callers can wire the
    // workspace-private connection doc after `linkMetaAccountToWorkspace`
    // succeeds. The dashboard reads
    // `users/{uid}/workspaces/{workspaceId}/private/metaConnection.metaConnected`
    // to render its Sync Status section; without this call, the doc is
    // never created by the sidebar's connect flow and the dashboard
    // permanently reports "Meta account not connected yet".
    // Returns false on failure — callers treat this as non-blocking.
    async connectAccountToWorkspace(req: {
        workspaceId: string;
        accountId: string;
        accountName?: string;
    }): Promise<boolean> {
        try {
            const fn = httpsCallable(functions, 'connectMetaAccount');
            await fn({
                workspaceId: req.workspaceId,
                accountId: req.accountId,
                accountName: req.accountName ?? '',
            });
            return true;
        } catch (err) {
            console.warn('Failed to write workspace-private meta connection doc (non-blocking):', err);
            return false;
        }
    }

    async syncPerformance(workspaceId?: string | null): Promise<{ success: boolean; adsSynced: number }> {
        try {
            const fn = httpsCallable(functions, 'metaSyncPerformance');
            const result = await fn({ workspaceId: workspaceId || null });
            return result.data as { success: boolean; adsSynced: number };
        } catch (err) {
            console.error('Failed to sync performance:', err);
            return { success: false, adsSynced: 0 };
        }
    }

    // Phase 14 batch 04 (sync-button-fix) — Workspace-scoped "Sync Now"
    // for the "What's Working" dashboard. The legacy `syncPerformance`
    // method (above) routes through `metaSyncPerformance`, the Batch 01
    // user-level callable that reads from `metaConnections/{uid}` and
    // syncs every active account on the connection — it does NOT
    // exercise the workspace-scoped sync pipeline. PHASE 970 (BATCH 4)
    // — the dashboard's Sync Status bar no longer greys the button
    // based on `canSyncNow`; the cooldown gate is gone, and the
    // second-press suppression lives in the in-flight lease at the
    // orchestrator layer. The sidebar's "Sync Now" continues to use
    // `syncPerformance` / `metaSyncPerformance` — that path feeds the
    // legacy PerformanceDashboard and is intentionally untouched.
    async triggerWorkspaceSync(workspaceId: string): Promise<DashboardSyncResult> {
        try {
            const fn = httpsCallable(functions, 'triggerMetaSync');
            const result = await fn({ workspaceId });
            return result.data as DashboardSyncResult;
        } catch (err: any) {
            console.warn('triggerMetaSync failed:', err);
            // PHASE 970 (BATCH 4) — the cooldown swallow is removed.
            // The server no longer emits `resource-exhausted`; the
            // 1-hour cooldown was deleted (investigation §6 / §8.4).
            // The new in-flight guard raises
            // `failed-precondition` if a second press races the
            // first; we let that propagate to the caller's catch
            // block (App.tsx), which now renders the generic
            // "Sync failed" path. A localised collision toast is
            // queued for Batch 5 alongside the new i18n keys
            // (`sync.result.partial` etc.).
            throw err;
        }
    }

    async disconnect(): Promise<boolean> {
        try {
            const fn = httpsCallable(functions, 'metaDisconnect');
            await fn();
            return true;
        } catch (err) {
            console.error('Failed to disconnect:', err);
            return false;
        }
    }

    // ═══ 6. PUSH CREATIVE TO META AD ACCOUNT ═══
    // Accepts BOTH base64 data URLs and remote URLs (auto-converts)
    //
    // Phase 967 — the response shape carries the structured reason and
    // (where applicable) the workspace name so the call site can look
    // up the paired en/ar i18n key (FR-028a). The raw `message` is
    // kept for fall-through / unknown-reason paths.
    async pushCreative(
        imageSource: string,
        adName: string,
        deploymentMeta?: {
            designId?: string;
            projectId?: string;
            hookMetadata?: { angle?: string; type?: string; text?: string };
            conceptMetadata?: { text?: string; index?: number };
            copySnapshot?: { headline?: string; subhead?: string; cta?: string; benefit?: string };
            language?: string;
            mode?: string;
            ratio?: string;
            format?: string;
            selectedModes?: string[];
            contractTemplateId?: string;
            numericFidelity?: string;
            offerFactsHash?: string;
            workspaceId?: string | null;
        }
    ): Promise<{
        success: boolean;
        message: string;
        imageHash?: string;
        deploymentId?: string;
        // Phase 967 — structured failure signal so the call site can
        // map to a paired en/ar i18n key (FR-028a). Present on the
        // failure paths the backend raises with `details.reason`.
        reason?: string;
        workspaceName?: string | null;
    }> {
        try {
            let imageBase64 = imageSource;

            // If it's a URL (not base64), fetch and convert
            if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
                try {
                    const response = await fetch(imageSource);
                    const blob = await response.blob();
                    imageBase64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (fetchErr) {
                    console.error('Failed to convert image URL to base64:', fetchErr);
                    return { success: false, message: 'Failed to convert image for upload. The image URL may have expired.' };
                }
            }

            const fn = httpsCallable(functions, 'metaPushCreative');
            const result = await fn({
                imageBase64,
                adName,
                ...(deploymentMeta || {}),
            });
            return result.data as {
                success: boolean;
                message: string;
                imageHash?: string;
                deploymentId?: string;
                reason?: string;
                workspaceName?: string | null;
            };
        } catch (err: any) {
            console.error('Failed to push to Meta:', err);
            // The Firebase Functions SDK exposes `details` on HttpsError
            // for the `failed-precondition` class. Surface the structured
            // `reason` and `workspaceName` so the React call site can
            // route through the paired en/ar i18n keys (FR-028a).
            const reason: string | undefined = err?.details?.reason;
            const workspaceName: string | null | undefined = err?.details?.workspaceName;
            return {
                success: false,
                message: err?.message || 'Failed to push creative',
                reason,
                workspaceName: workspaceName ?? undefined,
            };
        }
    }
    // ═══ 7. PUSH CREATIVE PACK (Image + Copy paired) ═══
    //
    // Phase 967 — `workspaceId` is the canonical parameter; the
    // backend also accepts `activeWorkspaceId` as an alias for back-
    // compat with any caller still using the old name.
    async pushCreativePack(
        imageSource: string,
        adName: string,
        primaryText: string,
        pageId?: string,
        workspaceId?: string,
    ): Promise<{
        success: boolean;
        message: string;
        imageHash?: string;
        creativeId?: string;
        reason?: string;
        workspaceName?: string | null;
    }> {
        try {
            let imageBase64 = imageSource;

            // If it's a URL, fetch and convert to base64
            if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
                try {
                    const response = await fetch(imageSource);
                    const blob = await response.blob();
                    imageBase64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (fetchErr) {
                    return { success: false, message: 'Failed to convert image for upload.' };
                }
            }

            const fn = httpsCallable(functions, 'metaPushCreativePack');
            // Send both `workspaceId` (canonical) and `activeWorkspaceId`
            // (legacy alias the backend still accepts). Server-side
            // `resolvePublishWorkspace` reads `workspaceId` first.
            const result = await fn({
                imageBase64,
                adName,
                primaryText,
                pageId,
                workspaceId,
                activeWorkspaceId: workspaceId,
            });
            return result.data as {
                success: boolean;
                message: string;
                imageHash?: string;
                creativeId?: string;
                reason?: string;
                workspaceName?: string | null;
            };
        } catch (err: any) {
            console.error('Failed to push creative pack:', err);
            const reason: string | undefined = err?.details?.reason;
            const workspaceName: string | null | undefined = err?.details?.workspaceName;
            return {
                success: false,
                message: err?.message || 'Failed to push creative pack',
                reason,
                workspaceName: workspaceName ?? undefined,
            };
        }
    }
}
export const metaService = new MetaService();