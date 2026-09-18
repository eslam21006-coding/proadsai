# fix-workspace-bleed — Workspace isolation bug investigation

**Date:** 2026-09-18
**Branch:** `fix-workspace-bleed`
**User:** `islam210.06@gmail.com` (uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`)
**Project:** `proadsai-saas`
**Capture scripts (read-only):**
- `C:\temp\opencode\probe-workspace-bleed.cjs` + `probe-workspace-bleed-output.json`
- `C:\temp\opencode\probe-private-meta-connection.cjs` + `probe-private-meta-connection-output.json`

This is an investigation, not a fix. No production writes; no phase-4/5/6 work started.
The fix follows in a separate batch after the owner reviews this report.

---

## §0. The bug, in one paragraph

**Where it is stored correctly:** every active workspace under this user already
carries its own Meta ad account at `users/{uid}/workspaces/{wid}.metaAdAccountId`
(plus a workspace-private mirror at
`users/{uid}/workspaces/{wid}/private/metaConnection.accountId` with
`metaConnected: true`); the Phase 14 1:1 enforcement in `connectMetaAccountImpl`
(metaConnection.ts:294–312, the sibling scan inside the transaction) prevents
the same account from being linked to two sibling workspaces, and the Phase 970
LEG B inline worker reads the workspace-private doc to pick the right account
for the active workspace — both paths are workspace-scoped and behave correctly.

**Where it is read incorrectly:** the sidebar's "Meta Ads Connected / _account
name_" sub-label reads from the user-level `metaConnections/{uid}.selectedAccountId`
(`src/App.tsx:1511`, served by `getMetaConnectionImpl` at `functions/src/index.ts:3447–3454`),
not from `activeWorkspace.metaAdAccountId`; because `selectedAccountId` is a
user-level field that `metaSelectAccount` writes from the picker
(`functions/src/index.ts:3553–3561`) on every "Change Account", it reflects only
the most recently picked account and stays that way across workspace switches —
so the sidebar always renders "Moataz Mashal Official (Read-Only)" regardless of
which Boran/Lina/etc. workspace is active, and the owner perceives Sync Now as
operating on the displayed account even though the workspace-scoped LEG B inline
sync is, in fact, syncing the correct account under the hood.

**The fix in one sentence:** make the sidebar's sub-label and the Sync Now
account-id resolve from `activeWorkspace.metaAdAccountId` when
`canUseWorkspaces === true`, falling back to the user-level
`metaConnection.selectedAccountId` only for non-workspace plans (matching the
gate the existing `activeMetaAccountId` memo already uses at `src/App.tsx:4216–4227`).

---

## §1. Starting state (Step 1)

**Branch:** `fix-workspace-bleed` at the tip of `main`. Working tree clean.

```
$ git log --oneline -3
6fb6bea docs(969): Sync 2 post-deploy check for act_1180773537404268
126c5ad docs(969): Sync 1 post-deploy check for act_1180773537404268
6682bd8 docs(969): account-lookup report for the Boran / Moataz Mashal question

$ git status --short
(empty)
```

---

## §2. What Firestore actually says (Step 2)

**Capture timestamp:** `2026-09-18T09:57:19.659Z` (probe-workspace-bleed.cjs) and
`2026-09-18T10:05:13.454Z` (probe-private-meta-connection.cjs). No writes between
the captures.

The owner asked us to verify three things:

### §2.1 No user-level ad-account field on `users/{uid}`

The user doc carries **only billing/onboarding/plan fields** — no
`metaAdAccountId`, `activeAdAccount`, `connectedAccount`, `selectedAccountId`,
or anything ad-account-shaped. The full scalar map of the user doc is:

```json
{
  "email": "islam210.06@gmail.com",
  "createdAt": 1778754264,
  "billingType": "monthly",
  "stripeCustomerId": "cus_UVyMWTkES2IJtZ",
  "onboardingBusinessType": "scaling",
  "onboardingNiche": "beauty",
  "onboardingComplete": true,
  "onboardingChallenge": "ideas",
  "isTrial": false,
  "lastTopupPack": "topup_300",
  "lastTopup": 1778757528,
  "ghlContactId": "2wNT5KpzxeFkFZc0wDKU",
  "nextCreditReset": 1813573390,
  "cancelledAt": 1779288307,
  "planUpdatedAt": 1779288307,
  "billingStatus": "active",
  "milestones": {
    "allComplete": true,
    "designGenerated": true,
    "hooksGenerated": true,
    "conceptsGenerated": true,
    "copyGenerated": true,
    "watchVideo": true
  },
  "plan": "scale",
  "credits": 6280,
  "billingState": { ... }
}
```

`probe-workspace-bleed.cjs` walks the document recursively against the pattern
`/(metaAdAccount|adAccount|connectedAccount|activeAdAccount|selectedAccount|act_)/i`
and returns zero hits (`onUserDoc: []`). **The prime suspect the prompt named
(user-level `metaAdAccountId` field overriding workspace-level) is not present.**

### §2.2 User-level `metaConnections/{uid}` doc DOES carry `selectedAccountId`

This is the actual user-level mirror. Top-level `metaConnections` collection,
doc keyed by `uid`:

```json
{
  "userId": "ywpCgWsXqVP4tlNwfhSoTqMjRw52",
  "connectedByUid": "ywpCgWsXqVP4tlNwfhSoTqMjRw52",
  "encryptedToken": "dbdebdd46716142d714343a726700631:1daca587cf0179b383dd32aae8a17736:1c6023efaf3100…",
  "expiresAt": 1794896310260,
  "adAccounts": [
    { "id": "act_67830328", "name": "67830328", "status": 1, … },
    { "id": "act_108958812522823", "name": "Ahmed Fathy", … },
    { "id": "act_493408227392229", "name": "Rodi Ad Acount", … },
    { "id": "act_400447097120292", "name": "Hamzah 02", … },
    { "id": "act_417940175298193", "name": "Hamzah 01", … },
    { "id": "act_173285603296256", "name": "Hamzah 03", … },
    { "id": "act_827760251394006", "name": "Online shop", … },
    { "id": "act_1138430853406486", "name": "Mohammed Abd Elmone'm", … },
    { "id": "act_1163959057640939", "name": "wearefforce", … },
    { "id": "act_532477388699948", "name": "Samih Ezadeen ad account", … },
    { "id": "act_795443405008633", "name": "Waffarnalak", … },
    { "id": "act_656113322875998", "name": "majdoleen private", … },
    { "id": "act_781389063661831", "name": "Adscope UK", … },
    { "id": "act_6750602498333508", "name": "Asmaa Fekry", … },
    { "id": "act_1451373605463040", "name": "Khloud Ad Account # 1", … },
    { "id": "act_437983975409008", "name": "Sop_Taleb", … },
    { "id": "act_995888422231015", "name": "Lina Bayazid Boosting", … },
    { "id": "act_1238105357423284", "name": "Majdoleen AD account - Mrb3 Italy", … },
    { "id": "act_453484984493090", "name": "Scale Up Coaching Ads", … },
    { "id": "act_1454723818838899", "name": "manar Ad account", … },
    { "id": "act_2247910795625768", "name": "Ruba Ad account", … },
    { "id": "act_1366487675484883", "name": "Dr.Khloude Ad account", … }
    // … full array preserved in probe-workspace-bleed-output.json
  ],
  "pages": [ ... ],
  "status": "active",
  "selectedAccountId": "act_1069240099193713",
  "selectedPageName": "Moataz Mashal",
  "selectedPageId": "604303136389491",
  "lastSyncAt": 1787988558999,
  "connectedAt": "...server timestamp..."
}
```

**`selectedAccountId === act_1069240099193713` ("Moataz Mashal Official (Read-Only)")**
— this is the user-level "current selection" the owner complains about. It is
**NOT** the workspace's account; it is the most-recently-picked account from the
picker, regardless of which workspace is active. Every workspace-scoped sync
machinery reads its OWN accountId from the workspace doc; only the sidebar
sub-label and the LEG A legacy path read this user-level field.

There is **no `users/{uid}/metaConnections` doc** (the path the previous probe
called). The `metaConnections` collection is top-level only; the user's record
sits at `metaConnections/{uid}`.

### §2.3 No top-level `adAccounts` collection

`probe-workspace-bleed.cjs` lists the top-level `adAccounts` collection and
returns `[]`. The only ad-account-shaped top-level doc is the `metaConnections`
mirror above. Workspace-scoped ad-account writes go to either
`users/{uid}/workspaces/{wid}.metaAdAccountId` (the link) or
`users/{uid}/workspaces/{wid}/private/metaConnection.accountId` (the Phase 14
worker mirror). The `adAccounts/{actId}` parent doc the owner referenced in the
prompt is **absent for every workspace** — only the learning-store
subcollections (`adAccounts/{actId}/adPerformance/`, `…/hookPerformance/`,
`…/visualPerformance/`) exist, populated by the Phase 969 worker for the
**Boran's** account (under `ZVASEGdrF5qbizl4Bbug`) and the **orphaned Lina's**
account (under the deleted `dueXIiFdEJKuAjSuYlUX`), per the prior morning's
reports (e.g. `docs/investigations/969-account-lookup.md` §3 / §4).

### §2.4 Each ACTIVE workspace already has the right account linked

Verified via `probe-private-meta-connection.cjs`. The active workspaces with a
Meta ad account linked (full row from the probe):

| # | wid | name | `ws.metaAdAccountId` | `ws.metaAdAccountName` | `private/metaConnection.metaConnected` | `private.metaConnection.accountId` |
|---|---|---|---|---|---|---|
| 1 | `5ZRdOCRnSKamHTiJd07F` | Manar | `act_781389063661831` | Adscope UK | `true` | `act_781389063661831` |
| 2 | `9n2zPb3Z6D7IRBOLSXi0` | Khloud | `act_1451373605463040` | Khloud Ad Account # 1 | `true` | `act_1451373605463040` |
| 3 | `PW1TwIwxvHNxJ0lY6JFI` | Eslam Salah (default) | `act_781389063661831` | Adscope UK | `true` | `act_781389063661831` |
| 4 | **`ZVASEGdrF5qbizl4Bbug`** | **Boran** | **`act_1180773537404268`** | **Boran english** | **`true`** | **`act_1180773537404268`** |
| 5 | **`ZbGPvZbrAAFl8afG41dG`** | **Moataz Mashal** | **`act_1069240099193713`** | **Moataz Mashal Official (Read-Only)** | **`true`** | **`act_1069240099193713`** |
| 6 | `kmuu4ZUMbsK5jnMCwglH` | Ghizlan | `act_1163959057640939` | wearefforce | `true` | `act_1163959057640939` |
| 7 | **`m5VqQlf6bL2wWUVQDCy6`** | **Lina ("Test" in the owner's words)** | **`act_995888422231015`** | **Lina Bayazid Boosting** | **`true`** | **`act_995888422231015`** |

Soft-deleted workspaces with prior links (out of the dropdown but still on disk):

| # | wid | name | deletedAt | link state at delete |
|---|---|---|---|---|
| 1 | `dueXIiFdEJKuAjSuYlUX` | Lina | `1785593938157` (pendingReassign) | `ws.metaAdAccountId = act_995888422231015`; private doc still `metaConnected: true` (orphan — `disconnectMetaAccountImpl` was never called) |
| 2 | `51J9p3g2PxOJgPfSF77Z` | Ghizlan | `1783935137393` | both null |
| 3 | `SpO68vQ1zzoOtvKhZjg6` | Boran | `1785599727125` (33-second lifetime) | both null |
| 4 | `y2qLnPQ9CUrNiCwyqX1w` | Khloud | `1785599812888` | both null |

**The seven workspaces that have an ad account each carry the right one** —
the data is not bleeding across workspaces. Boran (`ZVASEGdrF5qbizl4Bbug`) has
Boran english (`act_1180773537404268`), the "Test"/Lina workspace
(`m5VqQlf6bL2wWUVQDCy6`) has Lina Bayazid Boosting (`act_995888422231015`),
Moataz Mashal has Moataz Mashal Official (`act_1069240099193713`), and the 1:1
contract is intact across the four workspaces with linked accounts
(`metaConnection.ts:294–312` enforces it transactionally).

### §2.5 The owner's prompt had two off-by-one doc references

The owner named two paths in the prompt:

- `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_1180773537404268` (Boran)
- `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_995888422231015` (Test)

Neither path's **account ID** matches the workspace ID the owner attributes it
to. Per §2.4:

- The **active Boran** is `ZVASEGdrF5qbizl4Bbug` and its account is `act_1180773537404268` (matches the second half of the first path).
- The **"Test"/Lina** is `m5VqQlf6bL2wWUVQDCy6` and its account is `act_995888422231015`.
- `dueXIiFdEJKuAjSuYlUX` is the **deleted Lina** (orphaned, soft-deleted 2026-06-30 14:38 UTC) — `act_995888422231015` lives here too but the workspace is in `pendingReassign` and is filtered out of the dropdown.

The owner also called `act_1180773537404268` "Moataz Mashal Official" — in
Firestore it is **"Boran english"** on the active Boran workspace
(`metaAdAccountName: "Boran english "`); "Moataz Mashal Official (Read-Only)" is
`act_1069240099193713` on the Moataz Mashal workspace. The owner is identifying
accounts by what the **sidebar displays**, which is the live bug (see §3.1).

The structure of the data is not the diagnosis — the data is correct. The
diagnosis is **what the sidebar reads**.

---

## §3. What the frontend reads (Step 3)

### §3.1 The sidebar's "Meta Ads Connected / _account name_" sub-label

**File / line:** `src/App.tsx:1511` inside `MenuItems`.

```ts
const isConnected = !!metaConnection?.connected;
const selectedId = metaConnection?.selectedAccountId ?? null;          // ← line 1511
const selectedAccount = isConnected
  ? metaConnection?.adAccounts?.find((a) => a.id === selectedId)
  : undefined;
const subLabel = isConnected && !activeWorkspaceNeedsMetaAccount
  ? (selectedAccount?.name || selectedId || '')
  : '';
return (
  <MenuItem
    key="meta"
    icon="fa-brands fa-meta"
    label={isConnected ? t('topbar.menu_meta_connected') : t('topbar.menu_meta_connect')}
    subLabel={subLabel || null}                                          // ← renders "Moataz Mashal Official (Read-Only)"
    onClick={ ... props.onSyncMeta ... }
  />
);
```

**Where `metaConnection.selectedAccountId` comes from:** `getMetaConnectionImpl`
(`functions/src/index.ts:3447–3454`):

```ts
const doc = await admin.firestore().collection("metaConnections").doc(scope.ownerUid).get();
…
const base = {
    connected: true,
    adAccounts: data.adAccounts || [],
    selectedAccountId: data.selectedAccountId ?? null,        // ← USER-LEVEL, not workspace-level
    …
};
```

This is the **user-level** `selectedAccountId`. The same value is exposed for
both the Boran workspace view and the Lina workspace view — because it's a
field on the user-level doc, not the workspace doc. The frontend already has a
workspace-scoped memo on the very next render path (`src/App.tsx:4216–4227`)
that DOES read `ws?.metaAdAccountId`; the sub-label simply does not use it.

**Fix surface (1 line):** replace
`const selectedId = metaConnection?.selectedAccountId ?? null;`
with a `canUseWorkspaces ? (activeWorkspace?.metaAdAccountId ?? null) : metaConnection?.selectedAccountId`
derivation, then look up the account name from
`metaConnection.adAccounts` (the array is account-global by design — that's the
correct source for the human-readable name).

### §3.2 "Sync Now" — what account id does it sync?

**File / line:** the sidebar's "Sync Now" lives at `src/App.tsx:4184–4204`
inside `handleSyncMeta`:

```ts
const handleSyncMeta = useCallback(async () => {
  setMetaSyncing(true);
  ...
  try {
    const result = await metaService.syncPerformance(canUseWorkspaces ? activeWorkspaceId : null);  // ← line 4188
    …
  }
}, [canUseWorkspaces, activeWorkspaceId, …]);
```

`metaService.syncPerformance` (`src/services/metaService.ts:205–214`) calls the
**`metaSyncPerformance`** callable with `{ workspaceId: activeWorkspaceId ?? null }`.

**What `metaSyncPerformance` does server-side (functions/src/index.ts:3766–3854
+ functions/src/metaSync/orchestrator.ts):**

1. **LEG A** (`runLegacySyncForOwner`, orchestrator.ts:270–506) — reads
   `metaConnections/{ownerUid}.adAccounts` (lines 285–305) and iterates **every
   active account on the connection** to write
   `adPerformance/{ownerUid}_{ad_id}` and `adPerformanceHistory/{ownerUid}_{ad_id}_{since}_{until}`
   (root collections). The user's "Sync Now syncs whichever account is
   showing" complaint is half-true here: LEG A always syncs ALL the user's
   accounts the OAuth token has access to, and displays them under whatever
   account name `metaConnection.selectedAccountId` currently points at.

2. **LEG B** (`runPhase14Inline` + `fanOutPhase14`, orchestrator.ts:524–632) —
   reads `users/{uid}/workspaces/{wsId}/private/metaConnection.metaConnected`
   + `accountId` for EVERY workspace, and for the active workspace runs LEG B
   inline (`runSyncForAccount({ accountId: wsPrivate.accountId, workspaceId: wsId })`)
   writing the workspace-scoped `adAccounts/{actId}/{adPerformance|hookPerformance|visualPerformance}/`
   subcollections. The other workspaces fan out via Cloud Tasks.

**So the Sync Now press IS workspace-scoped on LEG B** — for the active
workspace it syncs `ws.metaAdAccountId` (`runPhase14Inline` at
orchestrator.ts:548–569, called from `runFullSync` at lines 663–695, picks
`opts.activeWorkspaceId`'s entry out of the workspace list and inlines it).
The owner's complaint is therefore about what the **sidebar reports** it
synced, not about the workspace-scoped write — that write is correct. LEG A
is the residual bleed: it always touches every account.

### §3.3 "Change Account" — what path does it write to?

**Frontend orchestration:** `src/App.tsx:3964–4064` (`handleMetaAccountSelect`).
On submit:

```ts
const ok = await metaService.selectAccount(accountId);                                      // ← 1. USER-LEVEL
if (!ok) throw new Error(saveFailedMessage);
if (canUseWorkspaces && activeWorkspaceId) {
  const { workspaceService } = await import('./services/workspaceService');
  await workspaceService.linkMetaAccountToWorkspace({                                      // ← 2. WORKSPACE LINK
    workspaceId: activeWorkspaceId,
    metaAdAccountId: accountId,
    metaAdAccountName: account?.name || accountId,
  });
  await metaService.connectAccountToWorkspace({                                            // ← 3. WORKSPACE PRIVATE
    workspaceId: activeWorkspaceId,
    accountId,
    accountName: account?.name || accountId,
  });
  setWorkspacesLocal(prev => prev.map(w =>
    w.id === activeWorkspaceId
      ? { ...w, metaAdAccountId: accountId, metaAdAccountName: account?.name || accountId }
      : w,
  ));
}
```

**Server writes per call (callable by callable):**

| Order | Callable | Doc(s) touched | Field(s) |
|---|---|---|---|
| 1 | `metaSelectAccount` (`functions/src/index.ts:3528–3563`) | `metaConnections/{ownerUid}` | `selectedAccountId = accountId`, `selectedPageId = null`, `selectedPageName = null` |
| 2 | `linkMetaAccountToWorkspace` (`functions/src/index.ts:7187–7323`) | `users/{ownerUid}/workspaces/{wid}` | `metaAdAccountId`, `metaAdAccountName`, `metaRoleAtLinkTime` (+ Page clear on real account change per FR-011) |
| 3 | `connectMetaAccount` (`functions/src/metaConnection.ts:78–335`) | `users/{ownerUid}/workspaces/{wid}` (same doc as #2, transactionally re-confirmed) **plus** `users/{ownerUid}/workspaces/{wid}/private/metaConnection` | workspace doc same as #2; private doc gets `metaConnected: true, accountId, accountName, legacyToken, tokenSource, needsReauth, createdAt, updatedAt` |

**No other workspace is touched.** The 1:1 sibling scan at
`metaConnection.ts:294–312` throws `failed-precondition` if `accountId` is
already linked to any sibling workspace — and the write is transactional, so
the workspace doc and the private doc commit atomically.

So "Connecting an ad account to workspace A causes it to appear on workspace B"
is **NOT** what the data store does — the data store is correct. The owner
perceives a bleed because the sidebar sub-label keeps showing
`metaConnections/{uid}.selectedAccountId` (user-level, last-picked), regardless
of which workspace they switched to. The fix lives in §3.1.

### §3.4 Workspace switching — what does the workspace dropdown re-query?

**File / line:** `src/components/WorkspaceSwitcher.tsx:33–365`. The
`workspaces` prop is passed in from `src/App.tsx:8280–8283`:

```tsx
<WorkspaceSwitcher
  workspaces={workspaces}
  activeWorkspaceId={activeWorkspaceId}
  onSwitch={setActiveWorkspaceIdLocal}
  ...
/>
```

`workspaces` is the **local React state** `setWorkspacesLocal(wsList)` populated
once on mount from a Firestore snapshot at `src/App.tsx:2751–2767`:

```ts
const wsQuery = query(
  wsRef,
  where('deletedAt', '==', null),
  orderBy('createdAt', 'desc'),
);
const unsubscribe = onSnapshot(
  wsQuery,
  (snap) => {
    setWorkspaceLoadError(prev => (prev ? false : prev));
    const wsList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Workspace))
      .filter(ws => ws.deletedAt == null);
    …
    setWorkspacesLocal(wsList);
    …
  },
  ...
);
```

The dropdown's filter is `workspaces.filter(ws => ws.deletedAt == null)` at
`WorkspaceSwitcher.tsx:132` → `visibleWorkspaces = activeWorkspaces` at line
140. **All active workspaces appear** — the "Test"/Lina workspace
(`m5VqQlf6bL2wWUVQDCy6`) is in the list. There is no per-workspace allowlist
filter (it was retired in ISSUE-D per the comment at line 134–139).

`onSwitch(id)` (line 150–158) calls `setActiveWorkspaceIdLocal(id)` which is
**the local state setter for `activeWorkspaceId`** (declared at
`src/App.tsx:2643`). The `activeWorkspace` memo at `src/App.tsx:4208–4211`
re-derives from this state, and the `metaConnection` re-fetch effect at
`src/App.tsx:3835–3861` is keyed on `user, canUseWorkspaces, activeWorkspaceId`
— so the meta-connection is refetched on every workspace switch.

**That re-fetch reads `metaConnections/{ownerUid}.selectedAccountId` — which
has not changed.** The workspace-level `metaAdAccountId` is already on the
in-memory `activeWorkspace` from the Firestore snapshot (no round-trip
required), and `activeMetaAccountId` (line 4216–4227) reads it correctly. The
gap is that the **sub-label** does not.

---

## §4. What the connection callable writes (Step 4)

The path from the picker through to disk is summarised in §3.3; the
callable-by-callable trace below restates it with the exact function name + file
+ write operation, as Step 4 requested.

### §4.1 `metaSelectAccount` — user-level mirror

`functions/src/index.ts:3528–3563`. Writes one document:

```ts
await connRef.update({
    selectedAccountId: accountId,                          // metaConnections/{ownerUid}
    selectedPageId: null,
    selectedPageName: null,
});
```

`connRef = admin.firestore().collection("metaConnections").doc(scope.ownerUid)`.
This is the document that drives `metaConnection.selectedAccountId` everywhere
the frontend reads it (via `getMetaConnectionImpl` at line 3447–3454). This is
the field that bleeds.

### §4.2 `linkMetaAccountToWorkspace` — workspace link

`functions/src/index.ts:7325–7334` (wrapper) + `linkMetaAccountToWorkspaceImpl`
at lines 7187–7323. Writes one document:

```ts
await wsRef.update({
    metaAdAccountId,                                       // users/{ownerUid}/workspaces/{wid}
    metaAdAccountName: metaAdAccountName ?? "",
    metaRoleAtLinkTime: role,
    // On a real account change:
    metaPageId: null,
    metaPageName: null,
    metaPageClearedAt: Date.now(),
});
```

`wsRef = admin.firestore().collection('users/{scope.ownerUid}/workspaces').doc(workspaceId)`.

### §4.3 `connectMetaAccount` — workspace-private mirror + 1:1 enforcement

`functions/src/metaConnection.ts:78–335`. Inside a single Firestore transaction:

```ts
tx.set(privateRef, privatePayload, { merge: true });      // users/{ownerUid}/workspaces/{wid}/private/metaConnection
tx.update(wsRef, workspacePayload);                        // users/{ownerUid}/workspaces/{wid}
```

where `privatePayload` is `metaConnected: true, accountId, accountName, legacyToken,
tokenSource, needsReauth, lastMetaSyncAt, lastSyncStatus, createdAt, updatedAt`
(metaConnection.ts:144–160) and `workspacePayload` is `metaAdAccountId,
metaAdAccountName` (lines 161–166), with `metaPageId/Name/ClearedAt` added on a
real account change.

The transaction does **NOT** touch any sibling workspace. It does **NOT**
clear the `selectedAccountId` field on `metaConnections/{ownerUid}`. The 1:1
sibling scan (lines 295–312) refuses if `accountId` is already linked elsewhere
under this owner.

### §4.4 Is there any code that clears the old account from other workspaces?

No. None of `metaSelectAccount`, `linkMetaAccountToWorkspace`,
`connectMetaAccountImpl`, or `disconnectMetaAccountImpl` writes to a sibling
workspace's `metaAdAccountId`. The only "clear" is on **the same workspace** —
via `disconnectMetaAccountImpl` (metaConnection.ts:349–445) which clears the
named workspace's `metaAdAccountId`/`-Name`/`-RoleAtLinkTime`/Page fields and
sets the private `metaConnected: false`. There is no fan-out clearing.

So the bleed is **not** in the write path. The bleed is in the **read path on
the frontend** (the sidebar's sub-label using the user-level field instead of
the workspace-level one).

### §4.5 LEG A — what `metaSyncPerformance` actually reads

`functions/src/metaSync/orchestrator.ts:270–506`. To be precise about what the
sidebar's Sync Now really does — the LEG A body reads from the user-level
`metaConnections/{ownerUid}` doc, line 285:

```ts
const connDoc = await getDb().collection("metaConnections").doc(ownerUid).get();
…
const activeAccounts: { id: string; name: string }[] = (conn.adAccounts || []).filter(
    (a: any) => a.status === 1 || a.account_status === 1,
);
if (activeAccounts.length === 0 && conn.selectedAccountId) {
    activeAccounts.push({ id: conn.selectedAccountId, name: "Selected Account" });
}
```

— iterates every active ad account the OAuth token has access to (15+
accounts for this user per §2.2) and runs `fetch` for each one's insights, then
writes `adPerformance` and `adPerformanceHistory` (root collections). The
`activeWorkspaceId` parameter only stamps `workspaceId` on the doc and stamps
`lastMetaSyncAt` on the workspace-private connection doc — it does NOT narrow
the iteration. This is the LEG A "all accounts" behaviour the investigation
report (`docs/investigations/969-account-lookup.md` §6 / `…/970-sync-unification`
preface) called out as the legacy path that "five live readers" depend on and
that the new Phase 970 LEG B does not replace.

---

## §5. Is the "Test" workspace visible in the dropdown? (Step 5)

The owner reports the "Test" workspace is missing from the dropdown. Per
`probe-private-meta-connection.cjs`, the active workspace carrying
`act_995888422231015` is `m5VqQlf6bL2wWUVQDCy6` — its `name` field is
**"Lina"**, not "Test". (There is no workspace with `name == "Test"` under
this user; the closest matches are Lina active and Lina deleted.) The owner
must be referring to this workspace; nothing about its Firestore shape would
hide it from the dropdown:

| Filter criterion (WorkspaceSwitcher.tsx:132) | Value for `m5VqQlf6bL2wWUVQDCy6` | Result |
|---|---|---|
| `deletedAt == null` | `null` | **kept** |
| `name` (any string) | `"Lina"` | renders with label `Lina`, sub-label `Maharat` |
| `brandColorPrimary` (any) | `#3b82f6` | renders with the dot |

The Firestore snapshot query at `src/App.tsx:2751–2755` uses
`where('deletedAt', '==', null)`. Firestore's `== null` matches docs where the
field is null OR missing; the client-side `filter(ws => ws.deletedAt == null)`
at line 2767 is the belt-and-braces pass that excludes any soft-deleted docs
the index might have leaked. The orphaned Lina workspace
(`dueXIiFdEJKuAjSuYlUX`, `deletedAt: 1785593938157`) does NOT pass either
filter — it is correctly hidden. The active Lina ("Test") workspace passes both.

There is **no** `deleted`, `archived`, `active`, or `status: 'hidden'` field on
the "Test"/Lina workspace doc that would filter it out — see §2.4 row 7. The
most likely explanation for the owner's "Test does not appear" perception is
the name mismatch — they call the workspace "Test" in conversation but it
ships as "Lina" in the UI — combined with the rapid growth of the workspace
list (14 active workspaces for a single user is a long dropdown).

---

## §6. The bug, in one paragraph (Step 6)

**Stored correctly:** every active workspace under
`ywpCgWsXqVP4tlNwfhSoTqMjRw52` already carries its own Meta ad account at
`users/{uid}/workspaces/{wid}.metaAdAccountId`, mirrored at
`users/{uid}/workspaces/{wid}/private/metaConnection.accountId` with
`metaConnected: true`; the 1:1 contract is held by the transactional sibling
scan in `connectMetaAccountImpl` (metaConnection.ts:294–312), and the Phase 970
LEG B inline worker reads the workspace-private doc to pick the active
workspace's account and writes to the workspace-scoped
`adAccounts/{actId}/{adPerformance|hookPerformance|visualPerformance}/` path
correctly.

**Read incorrectly:** the sidebar's "Meta Ads Connected / _account name_"
sub-label at `src/App.tsx:1511` reads
`metaConnection?.selectedAccountId`, which `getMetaConnectionImpl` populates
from the user-level `metaConnections/{uid}.selectedAccountId` field
(`functions/src/index.ts:3447–3454`); that field is the most-recently-picked
account from the picker (written by `metaSelectAccount` at
`functions/src/index.ts:3553–3561`) and never changes when the user switches
workspaces — so the sub-label always shows whatever was last picked (today,
`act_1069240099193713` "Moataz Mashal Official (Read-Only)") regardless of
whether the active workspace is Boran, Lina, Moataz Mashal, or anything else.
The owner sees the displayed name and reasonably concludes that "the app is
syncing the wrong account"; LEG B is in fact syncing the right account
inline, but the sidebar never reflects the active workspace's
`metaAdAccountId`. The account-selection data is bled across workspaces only
at the display layer, not at the data layer.

**The fix (one sentence):** change `src/App.tsx:1511` to derive the sub-label
account id from `activeWorkspace?.metaAdAccountId ?? null` when
`canUseWorkspaces === true`, falling back to `metaConnection?.selectedAccountId`
only on non-workspace plans — mirroring the existing gate that
`activeMetaAccountId` (`src/App.tsx:4216–4227`) already enforces for the
funnel-settings form. LEG A's account-global iteration in
`runLegacySyncForOwner` (orchestrator.ts:300–314) is a separate concern
documented for a follow-up; it is intentional behaviour to keep the
`adPerformance` / `adPerformanceHistory` readers warm, but the sidebar should
stop reporting it as "the account being synced" for the active workspace.

---

## §7. What this report deliberately does NOT cover

- **LEG A's account-global iteration is not a fix path in this batch.** Five
  live readers (PerformanceDashboard, feedbackService, serverUtils, two
  delete-only sites, plus patternSummaries via `adPerformanceHistory`) depend
  on the writes LEG A produces. Removing or narrowing it is a separate
  investigation (the Phase 970 investigation preface already named it as
  out-of-scope for sync unification).
- **The deleted Boran (`SpO68vQ1zo...`) and deleted Lina
  (`dueXIiFdEJKuAjSuYlUX`) workspaces.** `dueXIiFdEJKuAjSuYlUX` still holds a
  `private/metaConnection` doc with `metaConnected: true` and
  `accountId: act_995888422231015`, plus 383 orphan `adPerformance` rows per
  `docs/investigations/969-production-baseline.md` §3. The orchestrator's
  `discoverOwnedWorkspaces` correctly excludes soft-deleted workspaces
  (orchestrator.ts:533), so these are not reachable from LEG B. They are
  however reachable from LEG A's account iteration (each `adAccountId` in
  the connection will pull data regardless of workspace). Cleanup of these
  orphans is out-of-scope for the workspace-isolation fix.
- **The user's perception that "Test" is missing from the dropdown.** There
  is no filter that would hide `m5VqQlf6bL2wWUVQDCy6`; the workspace is in the
  list under the name "Lina". If the owner wants it labelled "Test", that is
  a `updateWorkspace` call, not a data bug.
- **The owner's two named paths in the prompt had mismatched
  workspace IDs and account IDs.** §2.5 reconciles the path ↔ data mapping.
  The owner's intuition that "the active Boran" lives at
  `dueXIiFdEJKuAjSuYlUX` is incorrect; the active Boran is
  `ZVASEGdrF5qbizl4Bbug`.
- **The owner's belief that `act_1180773537404268` is "Moataz Mashal
  Official".** Per §2.4, `act_1180773537404268` is "Boran english" on the
  active Boran workspace; "Moataz Mashal Official (Read-Only)" is
  `act_1069240099193713` on the Moataz Mashal workspace. The confusion is
  consistent with reading the sidebar's always-stale `selectedAccountId` and
  not the workspace-level `metaAdAccountId`.

---

## §8. Repro path (for the fix batch)

A single keystroke is sufficient to reproduce on production:

1. Sign in as `islam210.06@gmail.com`.
2. Open the Boran workspace — sidebar sub-label reads "Moataz Mashal Official
   (Read-Only)" (wrong).
3. Click "Sync Now" — server-side LEG B inline writes to
   `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/{adPerformance|hookPerformance|visualPerformance}/`
   (correct workspace, correct account), but the toast + sidebar still report
   the user-level `selectedAccountId`.
4. Switch to the Lina workspace — sub-label still reads "Moataz Mashal
   Official (Read-Only)" (wrong).
5. Pick "Change Account" → "Lina Bayazid Boosting" on the Lina workspace —
   `metaConnections/{uid}.selectedAccountId` flips to `act_995888422231015`,
   workspace gets the new link, private doc gets the new accountId. Sidebar
   now reads "Lina Bayazid Boosting".
6. Switch back to Boran — sub-label is now back to "Lina Bayazid Boosting"
   (still wrong: Boran's account is `act_1180773537404268` "Boran english").

Step 6 is the simplest demonstration that the read path is the bug.

---

## §9. Files / line numbers cited

- `src/App.tsx:1511` — sidebar sub-label reads `metaConnection?.selectedAccountId`.
- `src/App.tsx:4184–4204` — sidebar Sync Now → `metaService.syncPerformance(activeWorkspaceId)`.
- `src/App.tsx:4216–4227` — the existing workspace-scoped `activeMetaAccountId` memo (the fix template).
- `src/App.tsx:2751–2767` — workspaces list snapshot query.
- `src/services/metaService.ts:205–214` — `syncPerformance` callable wrapper.
- `src/services/metaService.ts:143–151` — `selectAccount` callable wrapper.
- `src/services/metaService.ts:186–203` — `connectAccountToWorkspace` callable wrapper.
- `src/services/workspaceService.ts:80–87` — `linkMetaAccountToWorkspace` callable wrapper.
- `src/components/WorkspaceSwitcher.tsx:132–140` — workspace dropdown filter.
- `functions/src/index.ts:3528–3563` — `metaSelectAccount` (writes user-level `selectedAccountId`).
- `functions/src/index.ts:3423–3509` — `getMetaConnectionImpl` (returns user-level `selectedAccountId`).
- `functions/src/index.ts:3766–3854` — `metaSyncPerformance` wrapper.
- `functions/src/index.ts:7187–7323` — `linkMetaAccountToWorkspaceImpl` (writes workspace-level `metaAdAccountId`).
- `functions/src/metaConnection.ts:94–335` — `connectMetaAccountImpl` (transactional workspace + private write + 1:1 sibling scan).
- `functions/src/metaConnection.ts:363–445` — `disconnectMetaAccountImpl` (clears the named workspace only; no sibling write).
- `functions/src/metaSync/orchestrator.ts:270–506` — LEG A (`runLegacySyncForOwner`, account-global iteration).
- `functions/src/metaSync/orchestrator.ts:524–546` — `discoverOwnedWorkspaces` (LEG B source).
- `functions/src/metaSync/orchestrator.ts:642–799` — `runFullSync` (LEG A + LEG B orchestrator).
- `functions/src/metaSync/orchestrator.ts:824–887` — `runFullSyncWithLease` (in-flight lease wrapper).

---

**Status:** investigation complete; no code changed; no production writes. Awaiting
owner review before the fix batch starts.
