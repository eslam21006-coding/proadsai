# Phase 1 Report — Setup (T001–T004)

**Phase**: 1 — Setup
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-19
**Status**: ✅ Complete — awaiting go-ahead before Phase 2

---

## Scope

Phase 1 adds the shared type and string scaffolding that every later phase
builds on. No behaviour changes, no call-site edits, no functional
verification needed yet — the data-shape and i18n groundwork only.

Per `tasks.md` Phase 1:

- **T001** [P] `metaPageId` / `metaPageName` / `metaPageClearedAt` in the
  frontend `Workspace` interface (`src/types.ts`).
- **T002** [P] Same three fields codified in a backend `WorkspaceShape`
  typed payload to `createWorkspaceWithLimit`
  (`functions/src/workspaces/workspacePolicy.ts`).
- **T003** [P] `workspaceIdSource` / `pageSource` / `pushedByUid` added to
  the deployment-record write at `functions/src/index.ts:3763`
  (`metaPushCreative`).
- **T004** [P] Five paired en/ar i18n keys added to `src/i18n.tsx` for
  the FR-011b / FR-012a / FR-015 / FR-020a / FR-023 messages.

No project initialisation (existing codebase). No new dependencies.

---

## Diff summary

```
 functions/src/index.ts                      | 25 +++++++++++++++
 functions/src/workspaces/workspacePolicy.ts | 48 +++++++++++++++++++++++++++--
 src/i18n.tsx                                | 41 ++++++++++++++++++++++++
 src/types.ts                                |  9 ++++++
 4 files changed, 121 insertions(+), 2 deletions(-)
```

(Two further files — `CLAUDE.md` and `.opencode/package-lock.json` —
appear modified in `git status` from the auto-generated date stamp and
`npm install` lockfile churn respectively. Not touched by this phase.)

---

## T001 — Frontend `Workspace` interface (`src/types.ts`)

Added three optional fields at the tail of the existing interface:

- `metaPageId?: string | null;`
- `metaPageName?: string | null;`
- `metaPageClearedAt?: number | null;`

Optional (not required) so legacy records — which carry none of the
three — continue to round-trip the existing `Workspace` parser at every
frontend call site without a type error.

A comment block records the three FRs the fields exist to satisfy, and
why `metaPageClearedAt` is what makes `NEVER_SET` and `CLEARED`
distinguishable (FR-011a).

## T002 — Backend `WorkspaceShape` (`functions/src/workspaces/workspacePolicy.ts`)

Defined `WorkspaceShape` as an exported interface — the only authoritative
list of fields on `users/{ownerUid}/workspaces/{workspaceId}`, mirroring
`data-model.md` §1. All three new fields are required (not optional) on
this *write* shape so a future call site that forgets any of them is a
TypeScript error, not a runtime gap that reopens the cross-client leak.

`createWorkspaceWithLimit`'s `newDoc` parameter type changed from
`Record<string, unknown>` to `WorkspaceShape`. The single call site at
`functions/src/index.ts:6512` (`createWorkspace`) was updated to pass
all three new fields explicitly:

```ts
metaPageId: null,
metaPageName: null,
metaPageClearedAt: null,
```

`isDefault: false` is still hard-coded here — Phase 2 / T011–T012 move
the per-workspace default decision inside the transaction. A comment
points at the upcoming work.

## T003 — Deployment-record shape (`functions/src/index.ts:3763`)

Added three null fields to the `creativeDeployments/{id}.set({...})`
call inside `metaPushCreative`:

- `workspaceIdSource: null`
- `pageSource: null`
- `pushedByUid: null`

`null` (not a sentinel string) is intentional: the Phase 3 / T035
workspace-routed push path will write `'request' | 'default'`,
`'workspace' | 'legacy_global' | 'none'`, and the caller's uid
respectively, so a missing field is visible to the audit consumer
(SC-008) until then. A comment explains why the field stays null in
Phase 1.

No call-site edits — the existing write still produces a complete
document with these three keys, just null.

## T004 — Paired en/ar i18n keys (`src/i18n.tsx`)

Five new keys, English then Arabic, each anchored to the FR it satisfies:

| Key | FR | English | Arabic (simple Fusha) |
|---|---|---|---|
| `meta.page_cleared_notice` | FR-011b | "This workspace's Facebook Page was cleared. Pick a new one before publishing from this workspace." | "تم مسح صفحة فيسبوك لهذه المساحة. اختر صفحة جديدة قبل النشر من هذه المساحة." |
| `meta.no_workspace_resolved` | FR-012a | "No workspace could be determined for this publish. Please try again or contact support." | "تعذّر تحديد مساحة عمل لهذا النشر. حاول مرة أخرى أو تواصل مع الدعم." |
| `meta.workspace_no_ad_account` | FR-015 | "\"{name}\" has no Meta ad account linked. Link one to publish from it." | "لا يوجد حساب إعلانات ميتا مرتبط بـ \"{name}\". اربط حساباً للنشر منه." |
| `meta.disconnect_scope_warning` | FR-020a | "Disconnecting removes Meta access for this account and every workspace at once. Anyone using Meta from this account will lose it." | "فك الربط يلغي وصول ميتا لهذا الحساب وكل مساحات العمل دفعة واحدة. سيفقد الوصول كل من يستخدم ميتا من هذا الحساب." |
| `meta.needs_meta_link_label` | FR-023 | "Needs Meta link" | "يحتاج ربط ميتا" |

Arabic verified against the FR-028b rules:

- No dialect (no Egyptian particles such as "عشان", "كده", "بس", etc.).
- No technical terms (no literal transliterations of "workspace", "publish",
  "Page", "link" — every concept is expressed in plain Fusha vocabulary
  already used elsewhere in the file: "مساحة عمل", "نشر", "صفحة فيسبوك",
  "ربط").
- Plain declaratives that name the outcome and the next action.
- Tense and gender consistent with surrounding Arabic strings.

`{name}` placeholder matches the existing convention used by
`meta.picker_title_with_workspace` and other workspace-named messages.

Keys are inserted adjacent to the existing `meta.*` block in each
language so a maintainer looking for "what just got added" sees them
together, not scattered.

The Phase 8 contract test T-18 (`src/__tests__/i18n.test.tsx`) will
enumerate these keys against both language tables and fail if any is
missing in one — that gate is deferred to Phase 8 per `tasks.md`.

---

## Verification

- `npm run build` (frontend) — **pass**. `tsc -b && vite build` emits a
  full bundle; only the pre-existing dynamic-import / chunk-size
  warnings remain (unrelated to this phase).
- `npm run build` (backend, `functions/`) — **pass**. `tsc` emits
  `lib/index.js` with no errors. Strict mode is on, so `WorkspaceShape`
  is enforced at every call site.
- `npm run lint` (frontend) — **no new errors**. Baseline count of
  1069 problems / 1029 errors was confirmed unchanged after this
  phase's edits by stashing the diff, re-running lint, and comparing
  counts (`git stash; npm run lint; git stash pop`).

`npm test` (backend) was *not* executed — Phase 1 is type-and-string
scaffolding and adds no behaviour to cover; the full test suite is
reserved for the end of each later phase that introduces behaviour.
The contract-fixtures script referenced in `AGENTS.md` no longer
exists under that name — `functions/package.json` exposes `npm test`
as the equivalent, which compiles + runs the full backend test list.

---

## Trap compliance (`quickstart.md` "Traps")

Phase 1 deliberately touches none of the trap surfaces — no publish
path, no caller-scope decision, no OAuth callback, no repair script.
Verified:

- ❌ No `readDegraded` references introduced.
- ❌ No `request.auth.uid` introduced into a Firestore path. (Three
  pre-existing usages in `metaPushCreative` untouched.)
- ❌ No `conn.selectedAccountId` read by either publish path
  introduced.
- ❌ No Page write — the new fields are all null on creation.
- ❌ No OAuth `state` parameter touched.
- � No Firestore query added.
- ❌ No security rule changed.

---

## What lands next (Phase 2)

Phase 2 (Foundational) is the blocking work that the spec sequences
before every user story: the legacy-record repair (R1 + R4), the
`createWorkspace` source fix, the Page field-write lock, the shared
`metaCallerScope` guard, and the foundational contract tests. Until
that phase completes and `T010` / `T021` pass, no user story work can
begin.

---

**STOPPING** per the workflow rule. Awaiting go-ahead before Phase 2.
