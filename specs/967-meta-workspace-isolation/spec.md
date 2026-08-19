# Feature Specification: Workspace-Aware Meta Integration

**Feature Branch**: `967-meta-workspace-isolation`
**Created**: 2026-08-18
**Status**: Draft
**Issue ID**: meta-workspace-isolation
**Input**: User description: "Phase: Workspace-Aware Meta Integration — five connected bugs that break workspace isolation in the Meta integration: (1) Meta server operations act on the caller's own account instead of the team owner's account; (2) Facebook Page selection is account-global instead of per-workspace; (3) publishing a creative ignores the active workspace and uses the account-global ad account; (4) the Funnel Settings workspace selector shows only 3 of 9 workspaces (root cause unknown); (5) team members are blocked from linking ad accounts to workspaces."

## Overview

An account can hold several **workspaces**, one per brand or client. Each workspace is supposed to carry its own Meta advertising identity — its own ad account and its own Facebook Page — while the account holds a single Meta connection (one authorisation, one list of available ad accounts, one list of available Pages).

Today that separation is incomplete. The "which ad account and which Page is active" decision is stored once for the whole account instead of once per workspace, several server operations act on whoever is calling rather than on the account that owns the data, and the workspace selector in Funnel Settings does not list every workspace. The combined effect is that an agency running multiple clients can publish a creative into the wrong client's ad account — exposing one client's work inside another's — cannot give two clients different Facebook Pages, and cannot let a team member operate the Meta integration at all.

This phase makes the workspace the unit of Meta identity and makes team members first-class operators of the owner's workspaces.

## Clarifications

### Session 2026-08-18

- Q: Does the "no backfill script" non-goal cover repairing legacy workspace records that are missing the soft-delete marker? → A: No. That non-goal covers the Page migration only, which stays lazy. Repairing workspace records written before the field existed is a defect fix, not a migration — the records are malformed against the shape every current code path assumes, and leaving them that way is what hides six of nine workspaces.
- Q: How is "the account's default workspace" defined, given no record is currently marked as one? → A: The marker is fixed at its source and repaired in the existing data. Workspace creation MUST mark the first workspace on an account as its default; existing accounts get their oldest active workspace marked during the same repair that adds the missing soft-delete marker. One repair operation covers both.
- Q: What languages do the new user-facing messages ship in? → A: Both languages ship together, and Arabic parity is a release gate for the phase. The new strings are refusal and warning messages — precisely where the primary Arabic-speaking audience most needs to understand what went wrong, so an English-only failure path reads as a broken screen. All Arabic must be simple Fusha: no Egyptian dialect and no technical terms. This matches the existing bilingual treatment of the Meta permission messaging.
- Q: How is this phase reversed, given it writes new per-workspace data that a code revert cannot undo? → A: A code-only revert must fully restore current behaviour, with the per-workspace Page fields left in place and simply ignored. This follows from the lazy migration already chosen: reverted code reads the account-level value again and the orphaned fields go unread, so no cleanup step is required and no account is stranded part-migrated. A cleanup pass and a runtime feature flag were both rejected — the first adds the data mutation this phase avoids, the second adds a flag surface across every affected call site.
- Q: Publishing today only uploads the image to the ad account's media library — no ad, ad set, or campaign is created, and the Facebook Page is stored as metadata that no Meta call consumes. Should publishing still be blocked when a workspace has no Page? → A: No. The per-workspace Page is still recorded, switched, and cleared exactly as specified, so the data is correct and ready for when ad creation is built — but publishing is not gated on it while nothing consumes it, because that would break pushes that work today for no safety gain. The ad account gate stays, because the upload genuinely uses it.
- Q: The authorisation callback has no signed-in caller — it takes the identity from a value carried through the authorisation round-trip. When a team member connects, that value names the member, so the authorisation would be stored under the member. How is this reconciled with the requirement that it be stored against the owner? → A: The callback resolves the member to their owner after reading the identity, and stores the authorisation against the owner. Nothing about how that identity value is carried or validated changes, so the separately deferred work on trusting it stays untouched. Putting the owner's identity into the carried value directly was rejected: it would make the untrusted value name a higher-value target and worsen the deferred issue.
- Q: Does synced performance data become workspace-scoped in this phase? → A: No. Only the account identity is corrected, so a team member's sync writes under the owner's account instead of their own. The sync already pulls every active ad account rather than a selected one, so it is account-wide by design and carries none of the wrong-client risk this phase exists to remove. Making the performance data workspace-scoped would close a known but separate dashboard gap at the cost of roughly doubling the phase and introducing the data migration this phase deliberately avoids.
- Q: When a workspace's linked ad account changes, what happens to the Facebook Page recorded on it? → A: It is cleared unconditionally and must be explicitly re-selected before the workspace can publish again. There is no reliable per-ad-account Page validity signal — the available Pages come from a user-level list, not an ad-account-level one — so a validity check cannot be implemented honestly. The risk being closed is silent and severe: a workspace retargeted from one client's ad account to another's while keeping the first client's Page would publish the second client's spend under the first client's brand. One deliberate re-selection is the accepted cost.
- Q: If the missing-workspace investigation finds the same condition affecting other places workspaces are listed, are those in scope? → A: Yes — every surface affected by that same root cause is fixed in this phase, bounded strictly to that one cause and not extended into a general workspace audit. Shipping a workspace-isolation phase while knowingly leaving other workspace lists broken would undermine its own premise, and all workspace consumers read from one shared source, so a single fix is expected to cover them at no extra cost.
- Q: Must a publish always name a workspace explicitly, given that single-workspace plans never populate one? → A: No. The server resolves the account's default workspace when the request omits one, and refuses only when no workspace can be resolved at all. The ban on falling back to the account-global ad account selection is unaffected — the ad account and Page are always read from a workspace record, whether that workspace was named by the caller or resolved as the default. Plans limited to one workspace therefore need no interface change; multi-workspace plans continue to name the workspace explicitly.
- Q: Are the account-wide Meta authorisation actions (connect, disconnect) owner-only, or open to team members alongside linking? → A: Open both to team members — fully symmetric with resolving every Meta operation to the owner's account. In this market the owner is typically a coach or consultant with no direct Meta access, while the team member is the media buyer who holds the Meta Business Manager and the ad accounts. Blocking team members from connecting would make the product unusable for the core use case. The authorisation is stored against the owner's account regardless of who completes the flow. The consequence — the stored authorisation is derived from the team member's own Meta identity and dies when they leave — is accepted as the intended workflow, with re-invite-and-reconnect as the recovery path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publishing lands in the correct client's ad account and Page (Priority: P1)

An agency owner manages nine client workspaces on one account. They switch to the "Client B" workspace, generate a creative, and publish it to Meta. The creative must appear in Client B's ad account, under Client B's Facebook Page — never in whichever ad account happened to be selected last at the account level.

**Why this priority**: This is the only failure in the set whose effect leaves the product and reaches a third party. Publishing today uploads the creative into the target ad account's media library rather than creating a live ad, so no money moves — but the creative becomes visible to whoever can see that ad account. One client's unreleased work appearing inside another client's ad account is a confidentiality breach and a client-trust incident, and it is not undone by a retry. Everything else in this phase is a blocker or an inconvenience.

**Independent Test**: Link two workspaces to two different ad accounts, publish one creative from each, and confirm each creative lands in the ad account and Page recorded on the workspace it was published from. Fully testable without any of the other stories.

**Acceptance Scenarios**:

1. **Given** two workspaces linked to two different ad accounts, **When** the user publishes a creative from the second workspace, **Then** the creative is created in the second workspace's ad account, regardless of which ad account was most recently selected at the account level.
2. **Given** a workspace with its own Facebook Page recorded, **When** the user publishes a creative from that workspace, **Then** the record of that publish carries that workspace's Page and no other.
3. **Given** a workspace with no ad account linked, **When** the user attempts to publish a creative from it, **Then** publishing is refused with a message that names the workspace and tells the user to link an ad account to it, and no partial creative is created in any ad account.
4. **Given** a publish request that does not identify a workspace, **When** it reaches the server, **Then** the account's default workspace is used and its ad account and Page are targeted — never the account-level selection.
4a. **Given** an account on a plan limited to one workspace, **When** the user publishes exactly as they do today, **Then** the creative is targeted from that account's default workspace with no extra step and no change in behaviour.
4b. **Given** a request that names no workspace on an account where no workspace can be resolved, **When** it reaches the server, **Then** it is refused with a message saying no workspace could be determined, and nothing is created in any ad account.
5. **Given** a multi-creative publish (creative pack), **When** it is published from a workspace, **Then** every item in the pack targets that same workspace's ad account and Page.

---

### User Story 2 - Each workspace keeps its own Facebook Page (Priority: P2)

A user managing two brands picks Facebook Page "Brand A" while in the Brand A workspace and Page "Brand B" while in the Brand B workspace. Each choice sticks to its workspace. Switching workspaces switches the active Page with it.

**Why this priority**: Without this, User Story 1's Page targeting has nothing correct to read. It is separated because the ad-account half of the routing (Story 1) already has per-workspace data available and can be fixed and verified on its own.

**Independent Test**: Choose a different Page in each of two workspaces, switch back and forth, and confirm each workspace redisplays its own Page without the other workspace's choice changing.

**Acceptance Scenarios**:

1. **Given** the user is in workspace A, **When** they select a Facebook Page, **Then** that Page is recorded against workspace A only.
2. **Given** workspace A and workspace B have different Pages recorded, **When** the user switches from A to B, **Then** the interface shows workspace B's Page as active without any further action.
3. **Given** a workspace that has never had a Page chosen since this change, **When** the user views or publishes from it, **Then** the previously recorded account-level Page is used so nothing that worked before stops working.
4. **Given** that same workspace, **When** the user next explicitly chooses a Page for it, **Then** the choice is recorded on the workspace and the account-level value is no longer consulted for that workspace.
5. **Given** a workspace whose linked ad account is changed, **When** the change is saved, **Then** the Page recorded on that workspace is cleared and the user is told it was cleared and should choose a new one.
6. **Given** a workspace whose Page was cleared by an ad account change, **When** the workspace is next viewed, **Then** it shows no Page — the account-level legacy Page does not fill the gap — and publishing still succeeds, with the absent Page recorded against the publish.

---

### User Story 3 - A team member can use the Meta integration at all (Priority: P3)

A team member invited to an owner's account opens the Meta area. They can see the connection status, the available ad accounts and Pages, the performance figures, and can publish — all against the owner's Meta connection, exactly as the owner sees it.

**Why this priority**: Today every Meta operation a team member attempts either errors or silently reads and writes an empty record under the team member's own identity. This is a total block on the team feature for Meta work, but it affects only accounts that have invited team members, so it ranks below correctness of publishing itself.

**Independent Test**: Sign in as a team member on an account that has a connected Meta integration and confirm every Meta screen shows the same connection, ad accounts, Pages, and performance data the owner sees.

**Acceptance Scenarios**:

1. **Given** an owner with a connected Meta integration and an invited team member, **When** the team member opens the Meta area, **Then** they see the owner's connection status, ad account list, and Page list.
1a. **Given** an account with no Meta connection, **When** a team member completes the authorisation using their own Meta credentials, **Then** the resulting connection is stored against the owner's account, and the owner and every other team member can use it immediately without repeating the authorisation.
1b. **Given** that same authorisation, **When** it is stored, **Then** no connection record exists under the team member's own identity.
2. **Given** a team member viewing performance data, **When** a sync runs, **Then** the figures are read from and written to the owner's records, and the owner sees the same result.
3. **Given** a team member acting on the owner's data, **When** any Meta operation completes, **Then** no record is created or updated under the team member's own identity.
4. **Given** a team member restricted to a subset of the owner's workspaces, **When** they act on a workspace outside that subset, **Then** the operation is refused.
5. **Given** the system cannot determine whether the caller is a team member because of a transient failure, **When** a Meta operation is attempted, **Then** it fails as a retryable error rather than silently proceeding against the caller's own identity.

---

### User Story 4 - A team member links the right ad account and Page to a client workspace (Priority: P4)

An agency owner hires an operator and gives them the client workspaces to run. The operator links each workspace to the correct client ad account and Facebook Page themselves, without needing the owner to do it.

**Why this priority**: This is a deliberate product-rule change rather than a defect, and it depends on User Story 3 being in place first.

**Independent Test**: As a team member, link an ad account and a Page to a workspace, then confirm as the owner that the workspace now shows that ad account and Page.

**Acceptance Scenarios**:

1. **Given** a team member with access to a workspace, **When** they link an ad account to it, **Then** the link is saved on the owner's workspace and is visible to the owner.
2. **Given** a team member with access to a workspace, **When** they choose a Facebook Page for it, **Then** the Page is saved on the owner's workspace.
3. **Given** a team member, **When** they attempt to create, delete, or restore a workspace, **Then** the attempt is refused — the widened permission covers linking only.
4. **Given** a team member restricted to a subset of workspaces, **When** they attempt to link an ad account to a workspace outside that subset, **Then** the attempt is refused.
5. **Given** a team member links an ad account, **When** the link is saved, **Then** the ad account must be one already present in the owner's connected ad accounts; anything else is refused.

---

### User Story 5 - Funnel Settings lists every workspace (Priority: P5)

A user with nine active workspaces opens Funnel Settings. All nine appear in the workspace selector, whether or not they have a Meta ad account linked, for both the owner and a team member.

**Why this priority**: It is a visibility defect on a settings screen, not a data-corruption or publishing defect. It is last by priority but **first by sequence** — see the sequencing note below.

**Sequencing constraint**: The root cause of the missing workspaces is **not yet known**. A prior fix removed one suspected filter and shipped, and six of nine workspaces are still missing. Ruled out already: soft-delete filtering, stale deployment or cached client, and any team-member-only condition. The implementer MUST complete a root-cause investigation and record the finding in writing **before** any fix for this story is written, and before the remaining stories are implemented — because the same missing-workspace condition may also be hiding workspaces from the selectors the other four stories rely on.

**Independent Test**: On an account with nine active workspaces, open Funnel Settings as the owner and again as a team member and count the entries in the selector; the count must equal the number of active workspaces confirmed directly in stored data.

**Acceptance Scenarios**:

1. **Given** an account with nine active workspaces, **When** the owner opens the Funnel Settings workspace selector, **Then** all nine are listed.
2. **Given** the same account, **When** a team member with full workspace access opens the selector, **Then** the same nine are listed.
3. **Given** a workspace with no Meta ad account linked, **When** it is listed, **Then** it is shown and labelled as needing a Meta link rather than being hidden.
4. **Given** a soft-deleted workspace, **When** the selector is opened, **Then** it is not listed.
5. **Given** the investigation is complete, **When** the fix is submitted, **Then** a written root-cause statement accompanies it that explains why exactly six workspaces were dropped and why the fix addresses that cause rather than its symptom.

---

### Edge Cases

- A workspace records an ad account or Page that has since been removed from the owner's Meta authorisation: the operation must fail with a message naming the workspace and the stale target, not fall back to a different account.
- The Meta authorisation is revoked or expires while a team member is mid-operation: the team member sees the same expired-connection state the owner sees, and can re-establish it themselves.
- The team member who originally authorised the connection leaves the account: the connection enters the reconnect-required state for everyone, and the owner or a newly invited member re-establishes it without any manual cleanup of the old record.
- One team member disconnects while another is publishing: the in-flight publish fails with an expired-connection message rather than a generic error, and the workspace's recorded ad account and Page are left intact for when the connection is restored.
- The account has never used workspaces: a single default workspace must behave exactly as before this phase, including for accounts whose Page was only ever chosen at the account level.
- Two team members change the same workspace's ad account at the same time: the last write wins and both see the settled value on next read; no workspace is left with an ad account and a Page belonging to different clients.
- A workspace is soft-deleted between the moment a publish is started and the moment it reaches the server: the publish is refused rather than writing to a deleted workspace's ad account.
- A team member's workspace access is narrowed while they have a workspace open: their next Meta operation on that workspace is refused.
- An account with several workspaces has an account-level Page recorded from before this phase: that one Page serves as the fallback for every workspace that has never chosen its own, so the first ad account change on any of those workspaces is what separates them — this is expected, and the clearing rule (FR-011) is what stops the shared fallback from following a workspace onto a different client's ad account.
- A workspace's Page is cleared by an ad account change and the user publishes before re-selecting: the publish succeeds and records that no Page was set, rather than being refused or quietly borrowing the account-level Page.

## Requirements *(mandatory)*

### Functional Requirements

**Caller identity**

- **FR-001**: Every server operation that reads or writes Meta connection data, Meta performance data, or workspace Meta links MUST act on the account that owns the data, not on the identity of the caller, so that a team member's actions read and write the owner's records.
- **FR-002**: No server operation in scope may create or update any record keyed to a team member's own identity as a side effect of a Meta action.
- **FR-003**: When the system cannot determine the caller's effective account because of a transient read failure, the operation MUST fail as retryable and MUST NOT proceed against the caller's own identity.
- **FR-004**: Every operation that names a workspace MUST verify that the resolved account owns that workspace, that the workspace is active, and that the caller is permitted to act on that specific workspace, before any side effect occurs.

**Per-workspace Meta identity**

- **FR-005**: A workspace MUST be able to record its own Facebook Page identifier and Page name, alongside the ad account identifier and ad account name it already records.
- **FR-006**: The system MUST determine the active Facebook Page from the active workspace's own record.
- **FR-007**: When the active workspace has no Page of its own recorded, the system MUST fall back to the account-level Page recorded before this phase, so no existing account loses working behaviour.
- **FR-008**: When a user explicitly selects a Page while a workspace is active, the selection MUST be recorded on that workspace; the account-level value MUST NOT be consulted for that workspace afterwards.
- **FR-009**: The account-level ad account and Page selections become read-only legacy fallbacks. No feature in scope may treat them as the authoritative answer to "which ad account or Page is active".
- **FR-009a**: FR-009 governs the per-workspace routing decisions — publishing and Page selection. It does not apply to performance synchronisation, which reads every active ad account on the account by design and is not making a "which one is active" choice at all.
- **FR-010**: No bulk data conversion may be performed. Existing workspaces adopt their own Page record the first time a Page is explicitly selected for them.
- **FR-011**: Changing a workspace's linked ad account — including removing it entirely — MUST clear that workspace's recorded Facebook Page unconditionally, without attempting to judge whether the Page remains usable with the new ad account. Removal is covered so a workspace cannot carry a Page from one client into a later link to a different client's ad account.
- **FR-011a**: A Page cleared by FR-011 MUST NOT be satisfied by the legacy account-level fallback in FR-007. The fallback applies only to a workspace that has never had a Page selected for it; once an ad account change has cleared a Page, that workspace holds no Page until one is explicitly chosen. This governs what is recorded and displayed; it does not block publishing (FR-015a).
- **FR-011b**: The user MUST be told, at the moment the ad account change is saved, that the workspace's Page was cleared and should be re-selected.

**Publishing**

- **FR-012**: Both the single-creative and the multi-creative publish operations MUST determine exactly one workspace to publish from: the one named in the request, or — when the request names none — the account's default workspace, resolved on the server.
- **FR-012a**: When no workspace can be resolved at all, publishing MUST be refused with a message that says no workspace could be determined. It MUST NOT proceed against any account-level selection.
- **FR-012b**: Accounts limited to a single workspace MUST keep publishing exactly as they do today, with no interface change and no additional user step, by way of the default-workspace resolution in FR-012.
- **FR-013**: Both publish operations MUST resolve the target ad account and Facebook Page from the identified workspace's own record on the server, ignoring any ad account or Page supplied by the caller.
- **FR-014**: Neither publish operation may fall back to the account-level ad account selection under any condition.
- **FR-015**: When the identified workspace has no ad account linked, publishing MUST be refused with a message that names the workspace and directs the user to link an ad account, and MUST NOT create anything in any ad account.
- **FR-015a**: Publishing MUST NOT be refused because the resolved workspace has no Facebook Page. While the Page is recorded but not consumed by any Meta request, a missing Page MUST be recorded against the publish (FR-027) and MUST NOT block it.
- **FR-015b**: When Meta requests begin consuming the Page, the gate in FR-015a MUST be reconsidered as part of that work. This requirement exists so the deferral is a recorded decision rather than an oversight.
- **FR-016**: In a multi-creative publish, every item MUST target the same workspace's ad account and Page.

**Team member permissions**

- **FR-017**: Team members MUST be able to link and change a workspace's Meta ad account, subject to their workspace access.
- **FR-018**: Team members MUST be able to select a workspace's Facebook Page, subject to their workspace access.
- **FR-019**: Team members MUST remain unable to create, delete, or restore workspaces.
- **FR-020**: Team members MUST be able to establish the account's Meta connection and to disconnect it, on the same terms as the owner. The resulting authorisation MUST be stored against the owner's account no matter who completed the flow, and MUST be immediately usable by the owner and by every other team member.
- **FR-020a**: Because a disconnect performed by any member removes Meta access for the whole account and every workspace at once, the disconnect action MUST state that scope before it is confirmed, and MUST record who performed it.
- **FR-020a-i**: The authorisation callback has no signed-in caller and takes the identity from a value carried through the authorisation round-trip. It MUST resolve that identity to the owning account before storing anything, so an authorisation begun by a team member is stored against the owner and is immediately usable by the owner and every other member.
- **FR-020a-ii**: FR-020a-i MUST NOT change how the carried identity value is produced, transmitted, or validated. Only the interpretation of the identity after it is read changes, so the separately tracked work on trusting that value remains untouched and unblocked.
- **FR-020b**: When an authorisation established by one team member stops working — including because that member left the account — the system MUST present this as a reconnect-required state to the owner and to every remaining member, and any of them MUST be able to re-establish it without an intermediate cleanup step.
- **FR-021**: A team member acting on a workspace outside their permitted set MUST be refused, for every operation in scope.

**Workspace listing**

- **FR-022**: The Funnel Settings workspace selector MUST list every active workspace on the account, for owners and for team members within their permitted set.
- **FR-023**: A workspace with no Meta ad account linked MUST be listed and labelled as needing a link, never hidden.
- **FR-024**: Soft-deleted workspaces MUST NOT be listed.
- **FR-025**: The root cause of the currently missing workspaces MUST be identified and documented in writing before a fix is written. The documentation MUST state which workspaces were dropped, the condition that dropped them, and why the chosen fix removes that condition rather than masking it.
- **FR-026**: Once the root cause is known, the team MUST identify every other place workspaces are listed or counted that is affected by the same cause, and state the full list in the same document.
- **FR-026a**: Every surface on that list MUST be fixed in this phase. Scope is bounded to the single identified root cause; unrelated workspace-listing defects found along the way MUST be recorded as separate follow-ups rather than absorbed here.
- **FR-026b**: After the fix, every listing surface on that list MUST show a count equal to the number of active workspaces the account actually holds, for owners and for team members within their permitted set.

**Legacy record repair**

- **FR-026c**: Workspace records written before the soft-delete marker existed MUST be repaired so that every active workspace carries an explicit "not deleted" marker. This is a defect fix on malformed records, distinct from the Page migration, which stays lazy (FR-010).
- **FR-026d**: Every account that can publish MUST have exactly one active workspace marked as its default. Workspace creation MUST mark the first workspace on an account as the default, and the repair MUST mark the oldest active workspace on any account that has none.
- **FR-026e**: The repair MUST be idempotent — re-running it MUST change nothing — and MUST NOT alter any workspace that already carries both markers correctly.
- **FR-026f**: The repair MUST NOT write any Facebook Page value. Page adoption stays lazy under FR-010.
- **FR-026g**: Records repaired before a revert MUST remain valid afterwards, so the repair does not compromise the code-only rollback guarantee (FR-029).

**Observability**

- **FR-027**: Every publish MUST record which workspace it was published from, which ad account it was placed in, and which Page was recorded against it — including when no Page was set — so a mis-targeted publish can be traced after the fact.
- **FR-028**: When the account-level legacy fallback is used to resolve a Page, that use MUST be recorded, so the remaining un-migrated workspaces can be counted.

**Language**

- **FR-028a**: Every user-facing message this phase adds or changes MUST ship in both supported languages at the same time. Arabic parity is a release gate: the phase is not complete while any new message exists in one language only.
- **FR-028b**: Arabic text MUST be simple Fusha — no Egyptian dialect, and no technical terms. A message MUST describe what happened and what to do next in plain language.
- **FR-028c**: FR-028a covers at minimum the Page-cleared notice, the no-workspace-resolved refusal, the no-ad-account refusal, the account-wide disconnect warning, and the "needs Meta link" label.

**Reversibility**

- **FR-029**: Reverting this phase's code changes MUST restore current behaviour in full, with no data cleanup, no manual step, and no account left part-migrated.
- **FR-030**: Per-workspace Page data written before a revert MUST be left in place and MUST be ignored by the restored behaviour, which returns to reading the account-level value. Re-applying the phase afterwards MUST pick that data back up unchanged.
- **FR-031**: The phase MUST NOT depend on a runtime switch to be disabled; reverting the code is the supported way to turn it off.

### Key Entities

- **Account**: The billing and data owner. Holds exactly one Meta authorisation and one set of available ad accounts and Pages. Owners and their invited team members all act on the same account.
- **Workspace**: A brand or client under an account. Carries its own name, its own linked Meta ad account, and — new in this phase — its own Facebook Page. The unit of Meta identity for publishing and reporting.
- **Meta Connection**: The account-wide authorisation record. Remains the single source of truth for the authorisation itself and for the full list of ad accounts and Pages available to the account. Its "currently selected ad account" and "currently selected Page" values become legacy fallbacks only.
- **Team Member**: A user invited to an account. Operates on the owner's workspaces within a permitted workspace set. Commonly the media buyer who actually holds the Meta Business Manager access the owner lacks. May establish and disconnect the account's Meta connection and may link Meta ad accounts and Pages to workspaces; may not create, delete, or restore workspaces.
- **Creative Publish**: A publish of one creative or a pack of creatives. Today it places the creative in the target ad account's media library and records the publish; it does not create a live ad. Always attributed to exactly one workspace, always placed in that workspace's ad account, and always recorded with that workspace's Page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across 20 consecutive publishes spread over at least three workspaces linked to three different ad accounts, 100% are placed in the ad account recorded on the workspace they were published from and carry that workspace's Page on their record, and 0% reach any other ad account.
- **SC-002**: A team member on an account with a connected Meta integration can complete every Meta task an owner can complete except creating, deleting, or restoring workspaces — measured as 0 failed operations across the full Meta task list, against a current baseline where every such operation fails.
- **SC-003**: Two workspaces on one account can hold two different Facebook Pages simultaneously, and switching between them shows the correct Page with no manual reselection, verified on 100% of switches in a 10-switch test.
- **SC-004**: The Funnel Settings workspace selector lists a count equal to the number of active workspaces confirmed directly in stored data, verified on an account with nine active workspaces, for both an owner and a team member — up from 3 of 9 today.
- **SC-005**: A written root-cause statement for the missing workspaces exists and is dated before the first change to the selector is committed.
- **SC-006**: No account experiences a regression from the phase: every account that had a working Facebook Page selection before continues to publish to that Page until it explicitly chooses a per-workspace Page, verified across all accounts holding an account-level Page value.
- **SC-007**: Attempting to publish from a workspace with no ad account linked produces a message that names the workspace and the required action, and creates nothing in any ad account, in 100% of attempts.
- **SC-008**: Every publish is traceable after the fact to the workspace it came from and the ad account and Page it targeted, for 100% of publishes.
- **SC-009**: Zero records are created under a team member's own identity as a result of any Meta operation, measured over a full team-member test pass.
- **SC-010**: Accounts on plans limited to a single workspace show a 0% publish failure rate attributable to this phase, verified by publishing from one such account on each affected plan before and after the change.
- **SC-011**: A team member who holds the Meta access the owner lacks can take an account from no connection to a published creative without the owner performing any step, completed end to end in a single session.
- **SC-012**: 100% of user-facing messages added or changed by this phase are present in both languages at release, with zero messages falling back to the other language, counted across the full message list.
- **SC-013**: Reverting the phase's code returns every affected behaviour to its current state with zero data cleanup steps, verified by reverting against an account that has already recorded per-workspace Pages and confirming it publishes exactly as it does today.
- **SC-014**: After the repair, 100% of active workspace records carry an explicit not-deleted marker and every account holds exactly one default-marked active workspace, verified by counting records that lack either marker before and after — the count must reach zero. Records already marked as deleted stay deleted, verified by the same count.

## Assumptions

- The scope of "operations that touch Meta data" is the full set of server operations identified by the phase's own audit — approximately nineteen, covering the authorisation callback, connection read, ad account selection, Page selection, disconnect, performance sync, single publish, pack publish, funnel settings save, workspace-to-ad-account linking and unlinking, connection establishment, and role probing. The audit is expected to confirm the exact list; the requirements above apply to every member of it, whatever the final count.
- Owners retain everything they can do today. This phase widens team-member permissions and narrows nothing for owners.
- The account-wide Meta authorisation continues to be stored once per account. This phase does not change how the authorisation is obtained or where the resulting credential is stored.
- "Which ad account is active" for a workspace is already recorded on the workspace; only the Page equivalent is new.
- Multi-brand workspaces are a plan-gated capability. Accounts on plans limited to a single workspace do not present a workspace selector and do not name a workspace when publishing; the server's default-workspace resolution covers them (FR-012, FR-012b).
- The audit found that no account created after the workspace-creation path moved server-side carries a default marker at all, and that pre-existing accounts are missing the soft-delete marker. Both are treated as defects and repaired (FR-026c–FR-026g), not worked around by falling back to the account-level selection.
- Concurrency between two team members editing the same workspace is resolved last-write-wins; no locking or conflict interface is introduced.
- The nine-workspace account described in the defect report is available for verification.
- Publishing today places the creative in the target ad account's media library and records the publish. It does not create an ad, ad set, or campaign, and no Meta request consumes the Facebook Page — the Page is recorded for the ad-creation capability that is expected to follow. This is why the ad account is gated at publish time and the Page is not (FR-015, FR-015a). No money moves as a result of a publish, so a mis-targeted publish is a confidentiality problem, not a spend problem.
- The Pages available to an account come from a single user-level list, not a per-ad-account list. No per-ad-account Page validity signal is assumed to exist, which is why FR-011 clears rather than validates.

## Non-Goals

The following are explicitly out of scope for this phase:

- Hardening the trust placed in the authorisation callback's state parameter — tracked as a separate phase.
- Any change to how the Meta authorisation flow works. The credential stays account-level and singular; the only change is that an authorisation begun by a team member is now resolved to the owning account before it is stored (FR-020a-i), rather than being stored under the member.
- Any bulk conversion of **Facebook Page** data. Page migration is lazy: read the workspace first, fall back to the account-level value, and record on the workspace at the next explicit selection. This exclusion does not extend to repairing legacy workspace records that are missing structural markers — that is a defect fix and is in scope (FR-026c–FR-026g).
- Any new interface component. Only the existing Page picker, ad account linker, publish flow, and Funnel Settings selector are modified.
- Any change to how creatives are generated.
- Any change to how performance figures are calculated, stored, or synced, beyond making the sync act on the correct account. Performance data remains account-global; making it workspace-scoped — and the dashboard gap that follows from it — stays a separate, previously identified issue.
- Any change to plan gating, pricing, or credit costs.
