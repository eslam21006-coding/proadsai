# 969 — Account lookup for the workspace currently shown in the app

**Date:** 2026-09-18
**Project:** `proadsai-saas`
**User:** `islam210.06@gmail.com`
**UID:** `ywpCgWsXqVP4tlNwfhSoTqMjRw52`
**Capture script:** `C:\temp\opencode\probe-boran.cjs` (read-only, outside the repo)
**Raw output:** `C:\temp\opencode\probe-boran-output.json`

This is a lookup, not a measurement. The values below are what Firestore holds right now
(2026-09-18T06:52:59Z); nothing has been written, no deployment, no phase 4/5/6.

---

## §1. The data has a discrepancy the owner needs to resolve

The owner's description:

> The workspace visible on screen is named "Boran", connected to "Moataz Mashal Official
> (Read-Only)".

The Firestore data for the same user shows **no workspace whose name is "Boran" AND whose
linked Meta ad account is "Moataz Mashal Official (Read-Only)" simultaneously**. There are
two workspaces that match each half of the description independently:

- Two workspaces are named "Boran". Neither is connected to "Moataz Mashal Official (Read-Only)".
- One workspace is connected to "Moataz Mashal Official (Read-Only)". It is named "Moataz Mashal".

The most likely explanations, in order:

1. The owner is looking at the "Moataz Mashal" workspace but describing the workspace NAME
   field shown by the UI as "Boran" by mistake (or by stale UI state). The currently-selected
   Meta account in `metaConnections` for this user is `act_1069240099193713` ("Moataz Mashal
   Official (Read-Only)") — the active session is on that account.
2. The UI is rendering a stale or wrong workspace name. The two Boran workspaces both have
   brand names close to "B-English" / "BEnglish" but their ad accounts are "Boran english "
   (`act_1180773537404268`), not "Moataz Mashal Official (Read-Only)".
3. There is a workspace the operator believes exists that is not in Firestore (deleted, or
   never created). One Boran workspace was created at timestamp 1785599713878 and DELETED at
   1785599727125 — a 33-second lifetime — which is suspicious and worth flagging.

The §3 walkthrough below is laid out so the owner can identify which scenario they are in.

---

## §2. All 18 workspaces under `ywpCgWsXqVP4tlNwfhSoTqMjRw52`

(Every workspace found, with the fields most relevant to identifying the visible one. The
`metaAdAccountId` / `metaAdAccountName` are read directly from the workspace doc; there are
no `adAccounts/{actId}` subcollections under any workspace for this user — every workspace's
`users/{uid}/workspaces/{wid}/adAccounts/` collection is empty. The account linkage lives on
the workspace doc, not in a subcollection.)

| # | workspaceId | name | brandName | metaAdAccountId | metaAdAccountName | state |
|---|---|---|---|---|---|---|
| 1 | `4wLvD9bGu1RQ7JrXXwY4` | Abeer | Abeer | null | null | active |
| 2 | `51J9p3g2PxOJgPfSF77Z` | Ghizlan | Fforce | null | null | **DELETED** (deletedAt 1783935137393, pendingReassign) |
| 3 | `5ZRdOCRnSKamHTiJd07F` | Manar | Manar | `act_781389063661831` | Adscope UK | active |
| 4 | `8gnzAzZY1QACuOQOJN1D` | Taleb | Taleb | null | null | active |
| 5 | `9n2zPb3Z6D7IRBOLSXi0` | Khloud | Khloud | `act_1451373605463040` | Khloud Ad Account # 1 | active |
| 6 | `PW1TwIwxvHNxJ0lY6JFI` | Eslam Salah | Adscope | `act_781389063661831` | Adscope UK | active (default workspace) |
| 7 | **`SpO68vQ1zzoOtvKhZjg6`** | **Boran** | B-English | **null** | null | **DELETED** (33-second lifetime, pendingReassign) |
| 8 | **`ZVASEGdrF5qbizl4Bbug`** | **Boran** | BEnglish | **`act_1180773537404268`** | **Boran english** | active |
| 9 | `UYAhw2SgNwZUbTOQAHg7` | Mahmoud Wardeh | Dream to Brand | null | null | active |
| 10 | `UrFxLxgCRIgZXa44C21g` | Fidaa | Mana'aa | null | null | active |
| 11 | **`ZbGPvZbrAAFl8afG41dG`** | **Moataz Mashal** | Tanaghum | **`act_1069240099193713`** | **Moataz Mashal Official (Read-Only)** | **active** |
| 12 | `dueXIiFdEJKuAjSuYlUX` | Lina | Maharat | `act_995888422231015` | Lina Bayazid Boosting | **DELETED** (pendingReassign) |
| 13 | `kmuu4ZUMbsK5jnMCwglH` | Ghizlan | Fforce | `act_1163959057640939` | wearefforce | active |
| 14 | `m5VqQlf6bL2wWUVQDCy6` | Lina | Maharat | `act_995888422231015` | Lina Bayazid Boosting | active |
| 15 | `pOpcAkQBJMC9nsP1SMle` | Lara | Lara | null | null | active |
| 16 | `sip79bqD2U6mT5fJbjWU` | Salamah | Salamah | null | null | active |
| 17 | `vcL4h5sXFFJWFhwwCsK5` | Luciana | Luciana | null | null | active |
| 18 | `y2qLnPQ9CUrNiCwyqX1w` | Khloud | Khloud | null | null | **DELETED** (pendingReassign) |

`isDefault: true` only on `PW1TwIwxvHNxJ0lY6JFI` ("Eslam Salah"). All others have
`isDefault: false`.

---

## §3. Where the discrepancy lives

### §3.1 Workspaces named "Boran" — two of them, neither matches the owner's description

| workspaceId | state | `metaAdAccountId` | `metaAdAccountName` |
|---|---|---|---|
| `SpO68vQ1zzoOtvKhZjg6` | DELETED (33-second lifetime) | null | null |
| `ZVASEGdrF5qbizl4Bbug` | active | `act_1180773537404268` | "Boran english " |

Neither of these carries `metaAdAccountName == "Moataz Mashal Official (Read-Only)"`. The
active Boran workspace is linked to **"Boran english"** (`act_1180773537404268`), not to
Moataz Mashal.

### §3.2 Workspace connected to "Moataz Mashal Official (Read-Only)" — one of them, named "Moataz Mashal"

| workspaceId | name | state | `metaAdAccountId` | `metaAdAccountName` |
|---|---|---|---|---|
| `ZbGPvZbrAAFl8afG41dG` | Moataz Mashal | active | `act_1069240099193713` | "Moataz Mashal Official (Read-Only)" |

This workspace is named "Moataz Mashal", brandName "Tanaghum". Its ad account is exactly what
the owner described. There is no Boran-shaped workspace connected to this account.

### §3.3 The currently-selected Meta account for this user

`users/{uid}/metaConnections` doc (top-level mirror, keyed by userId):

```
userId:                    ywpCgWsXqVP4tlNwfhSoTqMjRw52
connectedByUid:            ywpCgWsXqVP4tlNwfhSoTqMjRw52
encryptedToken:            dbdebdd4… (AES-GCM, not decrypted here)
expiresAt:                 1794896310260 (≈ 2026-11-16)
adAccounts / pages:        [objects, not expanded here]
status:                    active
selectedAccountId:         act_1069240099193713   ← currently selected
selectedPageName:          Moataz Mashal
selectedPageId:            604303136389491
```

`selectedAccountId == act_1069240099193713`. That is the Moataz Mashal workspace's account
(`ZbGPvZbrAAFl8afG41dG`), **not** any Boran workspace's account.

This is consistent with scenario (1) in §1: the front-end is currently showing the
"Moataz Mashal" workspace's account. The owner described the workspace NAME shown as "Boran"
— that part does not match any active workspace currently linked to that account.

---

## §4. Subcollection counts

For every workspace, the script also enumerated `users/{uid}/workspaces/{wid}/adAccounts/`.
**All 18 returned an empty subcollection.** The account linkage lives on the workspace doc
as the `metaAdAccountId` field — there is no nested `adAccounts/{actId}` document, so the
`adPerformance` / `hookPerformance` / `visualPerformance` subcollections are reached via the
**path that includes the actId directly**, not via a subcollection under `adAccounts/`.

The path shape the new Phase 969 worker writes to (from the codebase and the corrected
baseline at `docs/investigations/969-production-baseline.md`) is:

```
users/{uid}/workspaces/{wid}/adAccounts/{actId}/{adPerformance|hookPerformance|visualPerformance}/
```

For the Moataz Mashal workspace's account that path would be:

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZbGPvZbrAAFl8afG41dG/adAccounts/act_1069240099193713/{adPerformance|hookPerformance|visualPerformance}/
```

For the active Boran workspace's account that path would be:

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/{adPerformance|hookPerformance|visualPerformance}/
```

**The probe did not enumerate those three subcollections.** The path is now known — the
operator can query them directly. If the goal is "the account currently shown in the app"
per §1's scenario (1), the path is the Moataz Mashal one; if scenario (2), the active Boran
one. Both are derivable without further guesswork.

A follow-up probe of those three subcollections is out of scope for this report — the owner
asked for the account ID, not the data volume.

---

## §5. Is `act_995888422231015` reachable under this user?

**Yes — at two workspaces**, both with `brandName == "Maharat"` and `name == "Lina"**:

| workspaceId | name | state | `metaAdAccountName` |
|---|---|---|---|
| `dueXIiFdEJKuAjSuYlUX` | Lina | DELETED (pendingReassign) | "Lina Bayazid Boosting" |
| `m5VqQlf6bL2wWUVQDCy6` | Lina | active | "Lina Bayazid Boosting" |

The active Lina workspace (`m5VqQlf6bL2wWUVQDCy6`) is the one currently wired up; the deleted
one (`dueXIiFdEJKuAjSuYlUX`) is the path that holds the 383 adPerformance docs the corrected
baseline recorded (orphan subcollection — see §3 of `969-production-baseline.md`).

So: `act_995888422231015` IS reachable under this user, at two workspaces, but **neither of
those workspaces is "Boran" and neither is connected to "Moataz Mashal Official (Read-Only)"**.
If the owner wanted to check the data the original morning checks were written against, the
path is:

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/m5VqQlf6bL2wWUVQDCy6/adAccounts/act_995888422231015/
```

That is the active home of `act_995888422231015` for this user. The `dueXIiFdEJKuAjSuYlUX`
copy is a relic of the orphan-subcollection observation (the workspace was deleted but the
adPerformance rows under it were never cleaned up — see `969-production-baseline.md` §3).

---

## §6. One-line summary

> **If the visible workspace is genuinely the one currently rendered by the UI for
> "Moataz Mashal Official (Read-Only)", then the account ID the operator needs is
> `act_1069240099193713` — at `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZbGPvZbrAAFl8afG41dG/adAccounts/act_1069240099193713/`.**
>
> **If the visible workspace is the active "Boran" workspace, the account ID is
> `act_1180773537404268` — at `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/`.**
>
> **The two descriptions in the owner's prompt do not match a single workspace in
> Firestore.** The currently-selected Meta account for this user in `metaConnections` is
> `act_1069240099193713` (Moataz Mashal), which is consistent with the second half of the
> owner's description but not the first.

The owner resolves which workspace they are looking at; from there, the path is one of the
two above.
