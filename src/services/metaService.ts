// src/services/metaService.ts
// ═══════════════════════════════════════════════════════════════════════════
// PRO ADS AI — META ADS INTEGRATION (Frontend)
// UPDATED: Popup OAuth (new tab), account picker, no redirect away
// ═══════════════════════════════════════════════════════════════════════════

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

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

    async getConnection(): Promise<MetaConnection> {
        try {
            const fn = httpsCallable(functions, 'getMetaConnection');
            const result = await fn();
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

    async selectPage(pageId: string | null, pageName: string | null): Promise<boolean> {
        try {
            const fn = httpsCallable(functions, 'metaSelectPage');
            await fn({ pageId, pageName });
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
    // exercise the workspace-scoped sync pipeline or respect the
    // dashboard's 1-hour cooldown. The dashboard's Sync Status bar greys
    // the button based on `canSyncNow` (computed from the
    // workspace-private `private/metaConnection.metaConnected` doc), so
    // the only correct server-side counterpart is the workspace-scoped
    // `triggerMetaSync` (Batch 02). The sidebar's "Sync Now" continues
    // to use `syncPerformance` / `metaSyncPerformance` — that path feeds
    // the legacy PerformanceDashboard and is intentionally untouched.
    async triggerWorkspaceSync(workspaceId: string): Promise<{
        ok: boolean;
        lastMetaSyncAt: number | null;
        counts?: {
            campaigns?: number;
            adSets?: number;
            ads?: number;
            matched?: number;
            unmatched?: number;
            ambiguous?: number;
        };
        needsReauth?: boolean;
    }> {
        try {
            const fn = httpsCallable(functions, 'triggerMetaSync');
            const result = await fn({ workspaceId });
            return result.data as {
                ok: boolean;
                lastMetaSyncAt: number | null;
                counts?: {
                    campaigns?: number;
                    adSets?: number;
                    ads?: number;
                    matched?: number;
                    unmatched?: number;
                    ambiguous?: number;
                };
                needsReauth?: boolean;
            };
        } catch (err: any) {
            console.warn('triggerMetaSync failed:', err);
            // Cooldown is a `resource-exhausted` HttpsError. Surface it
            // as a soft failure so the caller can show a friendly toast
            // (the dashboard's button is already greyed, but the user
            // may click anyway). Other errors propagate so the caller
            // can show the generic "Sync failed" toast.
            if (err?.code === 'functions/resource-exhausted' || err?.code === 'resource-exhausted') {
                return { ok: false, lastMetaSyncAt: null };
            }
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
    ): Promise<{ success: boolean; message: string; imageHash?: string; deploymentId?: string }> {
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
            return result.data as { success: boolean; message: string; imageHash?: string; deploymentId?: string };
        } catch (err: any) {
            console.error('Failed to push to Meta:', err);
            return { success: false, message: err?.message || 'Failed to push creative' };
        }
    }
    // ═══ 7. PUSH CREATIVE PACK (Image + Copy paired) ═══
    async pushCreativePack(imageSource: string, adName: string, primaryText: string, pageId?: string, activeWorkspaceId?: string): Promise<{ success: boolean; message: string; imageHash?: string; creativeId?: string }> {
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
            const result = await fn({ imageBase64, adName, primaryText, pageId, activeWorkspaceId });
            return result.data as { success: boolean; message: string; imageHash?: string; creativeId?: string };
        } catch (err: any) {
            console.error('Failed to push creative pack:', err);
            return { success: false, message: err?.message || 'Failed to push creative pack' };
        }
    }
}
export const metaService = new MetaService();