# Dashboard Connection Path Investigation

**Status:** Investigation only — no fix proposed in this document.
**Symptom:** The "What's Working" dashboard shows **"Meta account not connected yet"** even though the user connected Meta from the sidebar and the sidebar shows **"Meta Ads Connected"**.
**Hypothesis under test:** The dashboard reads connection state from a Firestore path that is not the same path that the sidebar's connect flow writes to.

---

## 1. Where the dashboard reads the connection status

**File:** `functions/src/whatsWorkingDashboard.ts`

**Read path (line 287):**

```ts
// whatsWorkingDashboard.ts:282-291
const wsPath = `users/${uid}/workspaces/${req.workspaceId}`;
// ...
const [privateConnSnap, baselinesSnap] = await Promise.all([
    db.doc(`${wsPath}/private/metaConnection`).get().catch((e: unknown) => { ... }),
    // ...
]);
const connData = privateConnSnap?.data() || {};
const connected = connData.metaConnected === true;
```

- **Firestore path read:** `users/{uid}/workspaces/{workspaceId}/private/metaConnection`
- **Field checked:** `metaConnected` (boolean, must be `=== true`)
- **Decision rule (line 302–304):** `connection = needsReauth ? "needs_reauth" : (connected ? "connected" : "disconnected")`
- **UI consequence (line 134–142 of `src/components/WhatsWorkingDashboard.tsx`):** when `connection === "disconnected"` the dashboard renders `t("whats_working.sync.never_connected")` → **"Meta account not connected yet"** (i18n key at `src/i18n.tsx:444`).

---

## 2. Where `connectMetaAccount` writes the connection

**File:** `functions/src/metaConnection.ts`

**Write path (lines 39–44, 191–219):**

```ts
// metaConnection.ts:39-44
function privateConnectionRef(uid: string, workspaceId: string) {
    return getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("private").doc("metaConnection");
}
```

```ts
// metaConnection.ts:191-219 (inside connectMetaAccount)
const privateRef = privateConnectionRef(uid, req.workspaceId);
const privatePayload = {
    metaConnected: true,
    accountId: req.accountId,
    accountName,
    legacyToken: userConn.encryptedToken,
    tokenSource: "legacy_aes_gcm",
    needsReauth: false,
    lastMetaSyncAt: null,
    lastSyncStatus: null,
    createdAt: now,
    updatedAt: now,
};
// ...
batch.set(privateRef, privatePayload, { merge: true });
```

- **Firestore path written:** `users/{uid}/workspaces/{workspaceId}/private/metaConnection`
- **Field written:** `metaConnected: true` (line 193) — plus the token, account id/name, etc.
- **Other writer to the same path:** `disconnectMetaAccount` (same file, line 245–258) sets `metaConnected: false` and nulls out the token.

> Header comment at `metaConnection.ts:6–15` is explicit about the contract for this doc: the `metaConnected` boolean is the canonical workspace-private "is Meta linked to this workspace" signal.

---

## 3. Where the sidebar reads its connection status

**File:** `src/App.tsx`

**Sidebar label decision (line 1431–1450):**

```tsx
// App.tsx:1429-1452
{
    key: 'meta',
    el: (() => {
        const isConnected = !!metaConnection?.connected;
        const selectedId = metaConnection?.selectedAccountId ?? null;
        // ...
        return (
            <MenuItem
                key="meta"
                icon="fa-brands fa-meta"
                label={isConnected ? t('topbar.menu_meta_connected') : t('topbar.menu_meta_connect')}
                // ...
            />
        );
    })(),
},
```

- **Field checked:** `metaConnection?.connected` (a boolean stored in React state)
- **i18n key rendered when connected:** `topbar.menu_meta_connected` → **"Meta Ads Connected"** (`src/i18n.tsx:148`)

**How `metaConnection` state is populated (line 3231–3242):**

```tsx
// App.tsx:3231-3242
useEffect(() => {
    metaService.getConnection().then(conn => setMetaConnection(conn)).catch(() => { });
}, [user]);
// ...
const refreshMetaConnection = useCallback(async () => {
    // ...
    const conn = await metaService.getConnection();
    setMetaConnection(conn);
    return conn;
}, [/* ... */]);
```

**What `metaService.getConnection()` actually calls (`src/services/metaService.ts:74-83`):**

```ts
// src/services/metaService.ts:74-83
async getConnection(): Promise<MetaConnection> {
    try {
        const fn = httpsCallable(functions, 'getMetaConnection');
        const result = await fn();
        return result.data as MetaConnection;
    } catch (err) {
        // ...
    }
}
```

**What the `getMetaConnection` Cloud Function actually reads (`functions/src/index.ts:3292-3312`):**

```ts
// functions/src/index.ts:3292-3312
export const getMetaConnection = onCall({
    region: "europe-west1",
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;

    const doc = await admin.firestore().collection("metaConnections").doc(uid).get();
    if (!doc.exists) return { connected: false };

    const data = doc.data()!;
    return {
        connected: true,
        adAccounts: data.adAccounts || [],
        selectedAccountId: data.selectedAccountId,
        connectedAt: data.connectedAt,
        lastSyncAt: data.lastSyncAt,
        status: data.status,
        tokenExpiring: data.expiresAt < Date.now() + (7 * 24 * 60 * 60 * 1000),
    };
});
```

- **Firestore path read by the sidebar (via `getMetaConnection`):** `metaConnections/{uid}` — **user-level** doc.
- **Field checked:** existence of the doc; sidebar reflects `connected: true` whenever the doc exists (selectedAccountId / adAccounts are what make the menu show "Connected" and the sub-actions).
- **Who writes to `metaConnections/{uid}`:** the Meta OAuth callback at `functions/src/index.ts:3271` (`collection("metaConnections").doc(state).set({...})`) — i.e. the user-level Meta OAuth flow.

---

## 4. Comparison — three layers, two "connected" booleans

| Layer | Doc path | "Connected" field | Set by | Read by |
|---|---|---|---|---|
| **A. User-level OAuth** | `metaConnections/{uid}` | (doc existence → callable returns `connected: true`) | Meta OAuth callback (`index.ts:3271`) | `getMetaConnection` callable (`index.ts:3292`) → `metaService.getConnection()` → sidebar React state → **`metaConnection.connected` flag at `App.tsx:1431`** |
| **B. Workspace-private doc** | `users/{uid}/workspaces/{workspaceId}/private/metaConnection` | `metaConnected: true` | `connectMetaAccount` callable only (`metaConnection.ts:191-219`) | `getWhatsWorkingDashboard` callable (`whatsWorkingDashboard.ts:287`) → Sync Status Section A → dashboard render |
| **C. Workspace doc** | `users/{uid}/workspaces/{workspaceId}` | `metaAdAccountId: string` | `linkMetaAccountToWorkspace` (`index.ts:6434-6478`) | `loadMetaConnectionAccountId` in `funnelSettings.ts:78-97`; `funnelSettingsAvailable` gate in `App.tsx` |

**The dashboard's read path (B) and `connectMetaAccount`'s write path (B) ARE THE SAME** — `users/{uid}/workspaces/{workspaceId}/private/metaConnection`, with the dashboard reading `metaConnected === true` and `connectMetaAccount` writing `metaConnected: true`. ✅ Paths and fields agree on layer B.

**The dashboard's read path (B) is NOT the same as the path the sidebar's "Connect" flow actually writes to.** The sidebar's connect handler (`App.tsx:3348-3382` → `handleConnectMeta`) only does:

1. `metaService.startOAuthFlow(user.uid)` → user-level OAuth callback → writes layer A (`metaConnections/{uid}`).
2. After OAuth, `handleMetaAccountSelect` (`App.tsx:3258-3309`) calls `metaService.selectAccount(accountId)` (layer A) and `workspaceService.linkMetaAccountToWorkspace({ workspaceId, metaAdAccountId, metaAdAccountName })` (layer C, workspace doc).

**It never calls `connectMetaAccount`.** So layer B (`private/metaConnection.metaConnected`) is never written during the sidebar's connect flow. The dashboard reads layer B, finds `metaConnected` undefined / `false`, and correctly reports `connection = "disconnected"` → "Meta account not connected yet".

In other words: **the dashboard is reading the right doc, the writer for that doc is the right writer, but the sidebar never invokes that writer.** The sidebar's "Meta Ads Connected" state comes from layer A (user-level); the dashboard's "not connected" state comes from layer B (workspace-private). They are different signals and the current UI does not keep them in sync.

---

## 5. Did the recent path fix (`metaConnection/metaConnection → metaConnection`) cause this?

**Commit:** `ee744ac2abadd789a49356d2d711625968104a4b` — *"fix: remove duplicated metaConnection path segment in dashboard callable"*
**Diff (1 line):**

```diff
-    db.doc(`${wsPath}/private/metaConnection/metaConnection`).get().catch((e: unknown) => { ... }),
+    db.doc(`${wsPath}/private/metaConnection`).get().catch((e: unknown) => { ... }),
```

**Verdict: the fix did NOT introduce the bug — it is the right fix and it now matches the writer.**

- **Before:** dashboard read `users/{uid}/workspaces/{workspaceId}/private/metaConnection/metaConnection` — that is **seven** path segments. Firestore document references must have an **even** number of segments (collection/doc/collection/doc…); an odd-segment path resolves to a *collection*, not a document. So `db.doc(...)` on this path fails **immediately** with a deterministic validation error ("Document references must have an even number of segments") — before any network read. It never reaches Firestore and never "returns nothing"; the call throws synchronously.
- **After:** dashboard reads `users/{uid}/workspaces/{workspaceId}/private/metaConnection` — this is **exactly** the doc path that `connectMetaAccount` (`metaConnection.ts:39-44`) and `disconnectMetaAccount` (`metaConnection.ts:245`) write to, and exactly the doc that `loadStoredConnection` reads (`metaConnection.ts:302-303`).
- The fix is also consistent with the in-file header comment (`metaConnection.ts:6-15`) and with `metaSync/dispatcher.ts:52` which lists "Doc path: `users/{uid}/workspaces/{wid}/private/metaConnection`".

**The fix is correct. The remaining disconnect (B is never written by the sidebar flow) is a pre-existing architectural gap, not something the fix introduced.** The fix made layer B's read and write paths agree; the bug lives in the *missing writer invocation* on the sidebar's connect path, not in the dashboard's read path.

---

## Summary

| Question | Answer |
|---|---|
| What path does the dashboard read? | `users/{uid}/workspaces/{workspaceId}/private/metaConnection` — field `metaConnected` (`whatsWorkingDashboard.ts:287, 291`). |
| What path does `connectMetaAccount` write? | `users/{uid}/workspaces/{workspaceId}/private/metaConnection` — field `metaConnected: true` (`metaConnection.ts:191, 193`). **Match.** |
| What path does the sidebar use to decide "Connected"? | `metaConnections/{uid}` (user-level) — read via `getMetaConnection` callable (`index.ts:3299`) → `metaService.getConnection()` → `metaConnection.connected` in React state → `App.tsx:1431`. **Different doc, different layer.** |
| Is the dashboard reading the same path the sidebar writes to? | **No.** The sidebar writes to layer A (`metaConnections/{uid}`, user-level, via the OAuth callback). The dashboard reads layer B (`private/metaConnection`, workspace-level, only written by `connectMetaAccount`). The sidebar's "Connect Meta Ads" click never calls `connectMetaAccount`, so layer B stays empty. |
| Did the recent path fix make the dashboard read a different path? | **No — the fix is correct.** It removed an invalid `metaConnection/metaConnection` double segment; the new read path matches the write path of `connectMetaAccount` and the load path of `loadStoredConnection`. The bug is a missing caller for `connectMetaAccount` in the sidebar's connect flow, not a path mismatch. |

**No code changes in this report.** Next step (separate task) is to decide where to add the `connectMetaAccount` call so the dashboard's expected doc is created during the sidebar's "Connect Meta Ads" experience.
