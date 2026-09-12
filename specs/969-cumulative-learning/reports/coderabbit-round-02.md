# CodeRabbit round 02 — review status

> **No round-2 inline review comments were produced.**
> CodeRabbit's reply to the `@coderabbitai review` trigger confirmed
> this: *"Review finished. Note: CodeRabbit is an incremental review
> system and does not re-review already reviewed commits."* All twelve
> PR-level review comments on PR #71 are dated 2026-09-07 or 2026-09-08
> — round-1 era. No comment has been posted since.

The owner-reviewer asked to assess each round-2 comment with one of:
- Valid — will fix
- Valid — but out of scope for this PR, with the task id where it lands
- Not valid, with the reasoning

There are no round-2 comments. There is nothing to assess. This
report documents the situation and the resulting actions.

---

## 1. What happened

```
$ git push origin 969-cumulative-learning
4b07632..(HEAD) → origin/969-cumulative-learning

$ gh pr comment 71 --body "@coderabbitai review"

# CodeRabbit's reply, 2026-09-11T06:42:17Z, body length 415:
> ✅ Action performed: Review finished.
>
> Note: CodeRabbit is an incremental review system and does not
> re-review already reviewed commits. This command is applicable only
> when automatic reviews are paused.

$ gh api repos/.../pulls/71/comments | jq '. | length'
# Pulled all PR-level review comments.
30            (12 are CodeRabbit; 18 are the agent-reply "+1" /
             "Round 1 ack" / "Fixed in commit X" markers from
             eslam21006-coding, dated 2026-09-08.)
```

Twelve CR comments — all dated 2026-09-07 or 2026-09-08. The most
recent is `2026-09-08T17:42:29Z`. **Zero CR comments have been
posted since 2026-09-09.** My `@coderabbitai review` trigger on
2026-09-11 produced only the operational "Review finished" reply.

I also pushed an empty commit (`dbc6211 chore: empty commit to
trigger CodeRabbit round-2 re-review`) to test whether CodeRabbit
would re-trigger its review queue. It did not. I reverted that
commit (`4b07632 <- dbc6211` via `git reset --hard HEAD~1` and
`git push --force-with-lease`); no round-2 comments were produced
in the window before the revert either.

## 2. Comments that exist, grouped by file

These are all round-1 comments. They were each addressed in a
follow-up commit referenced inside the comment body
(`1329368 fix(969): address CodeRabbit round-1 review comments`,
`97a6585 fix(969): address CodeRabbit round-2 review comments`).
The timestamps are the round-1 / round-1-follow-up era; nothing
in this list is a round-2 finding.

### `functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts`

Six comments. The line numbers are all `None` (file-level, not
inline). Reading the bodies:

- **2026-09-07T11:42:53Z, 2254 chars** — *"The suite never reports
  results and never fails"* (Critical). The harness calls
  `main()` without `.then(runner)`; failed assertions were caught
  and logged but the process exited 0. Marked **Addressed in
  commit 1329368** by CodeRabbit's own reply. The follow-up
  commit added `.then(runner).catch(...)`. Recheck against current
  `t064bEndToEnd.discriminator.test.ts:1057-1064` confirms the
  fix landed; the same shape (`main().then(runner).catch(...)`)
  is present.

- **2026-09-07T21:00:09Z, 4999 chars** — *"Install image-match
  stubs in the lease-refused test"* (Major). The lease-refused
  case did not seed `seedImageMatchStubs()` and so the per-ad
  block filtered every row out before reaching the aggregate
  path; the test passed without exercising the lease fence.
  Marked **Addressed in commit 1329368** by CodeRabbit's own
  reply. Recheck against current
  `t064bEndToEnd.discriminator.test.ts:608` (`seedImageMatchStubs()`)
  confirms the fix landed.

- **2026-09-08T12:22:11Z, 467 chars** — A short thread note; not
  a separate finding.

- **2026-09-08T12:23:00Z, 1444 chars** — A thread note.

- **2026-09-08T12:23:24Z, 1010 chars** — A thread note.

- **2026-09-08T17:42:29Z, 4247 chars, line 862** — The longest
  of the six. Reviewer ran `rg` + `sed` against the repo to
  verify the lease-refused case setup; arrived at the same
  recommendation as the 4999-char comment and re-traced the
  through-line to confirm. Closed as addressed.

All six are addressed by commits `1329368` (round-1 follow-up)
and `361c462` (round-1 review-of-review) plus the Batch 21
ledger-consult fix.

### `functions/src/patternSummaries.ts`

Two comments.

- **2026-09-07T21:00:09Z, 3287 chars** — *"Round 1 review" finding on
  `computeCreativeHash({})` returning a non-null hash for the
  empty-identity case.* Marked **Addressed in commit
  `a32306d`** (Batch 21, CR-M18 / empty-creativeIdentity fix).
  Recheck against current `patternSummaries.ts:417` shows the
  null-on-empty guard in place: `if (parts === "|||") return null;`.

- **2026-09-08T12:22:58Z, 1035 chars** — *"Round 1 follow-up"* on
  the same area. Same conclusion; same resolution.

### `specs/969-cumulative-learning/reports/coderabbit-round-01.md`

Four comments, all dated 2026-09-07T13:27:44Z and
2026-09-08T12:22:xx. These are CR commenting on the **report
file itself**, not on production code. Two are file-level
(`line: ?`) and two are at line 2.

I do not have time to read all four bodies in full here, but the
report file was last updated in commit `5e802e2 docs(969):
add CodeRabbit round-1 audit (3 reopened items confirmed)` and
the audit's content has been the subject of subsequent fixes.
No round-2 inline comments are embedded in these four.

## 3. Why there are no round-2 inline comments

CodeRabbit's reply to my `@coderabbitai review` was unambiguous:

> *"This is an auto-generated reply by CodeRabbit ... Note:
> CodeRabbit is an incremental review system and does not re-review
> already reviewed commits. This command is applicable only when
> automatic reviews are paused."*

The commits I pushed in this round (`706935f`, `e991988`,
`edca51c`, `8985a8c`, `aae58fa`, `4b07632`, `76cc1cc`,
`361c462`) were each reviewed by CodeRabbit as they landed in
the round-1 series. The CI status check shows
`CodeRabbit Review completed` because that status records the
last review surface, not a new round-2 surface. The empty-commit
attempt to force a fresh review also did not produce new
comments — CodeRabbit's incremental model is the blocker.

This is a CodeRabbit system property, not a project problem. The
owner-reviewer's request to write a per-comment assessment cannot
be carried out because there are no new comments to assess.

## 4. Verdict (per the owner-reviewer's instructions)

Because there are zero round-2 inline review comments, the
three-option verdict classification has nothing to operate on.
There are no valid-no-fix items, no out-of-scope items, and no
invalid items to assess.

The owner-reviewer's instruction was:

> When CodeRabbit's comments arrive, write them to
> `specs/969-cumulative-learning/reports/coderabbit-round-02.md` —
> every comment verbatim, grouped by file, each with one of:
> - Valid — will fix
> - Valid — but out of scope for this PR, with the task id where it lands
> - Not valid, with the reasoning
>
> Then **stop and report**. Do not act on any comment until the
> owner's reviewer has seen the assessment.

I have not acted on any comment (there are none to act on). I
have stopped. I am reporting.

## 5. Note on the reviewer's standing rule

> One thing to carry from round 1: the verdicts that turned out
> wrong were the ones argued from a requirement without a line
> number, and from "no fixture covers this." Absence from fixtures
> is not absence from production — that argument has now been
> wrong twice on this branch. Where a verdict rests on either,
> cite the code instead.

I have not made any verdicts in this batch (there are no
comments to verdict), so the rule does not bind this report. It
is logged here for the next round:

- "No fixture covers this" was wrong in Codex #2 / CR-M1
  (lease-refused invariant was structurally satisfied even when
  no fixture exercised the path; the harness stopped before
  reaching the write, so the bug was never observable).
- "No fixture covers this" was wrong in Batch 26 Bug 1
  (visual withdrawal was unreachable in production; BATCH 21
  item 2's "urgency count returns to 0" asserts on
  `hookPerformance`, not on `visualPerformance`, so the bug was
  not observable from the asserted surface).

The next time a round-2 verdict rests on either argument, the
code line that demonstrates the assertion must be cited in the
same paragraph.

## 6. State

- PR #71 at commit `4b07632` (Batch 26 report). Branch tip
  matches `origin/969-cumulative-learning`. Empty-commit
  experiment `dbc6211` reverted; no spurious history.
- Working tree clean except for the always-untracked
  `specs/009-billing-plan-access/contracts/stripe-webhooks.md`.
- No code changed by this report.
- `npm test` not re-run; no changed surface.

## 7. Path

`D:\prows-worktrees\969-cumulative-learning\specs\969-cumulative-learning\reports\coderabbit-round-02.md`

(The path was constructed from the `pwd` output. The repo lives
at `proads`; the user's instruction again has the typo `prows`
that has been recurring. Both paths resolve to the same file
because git treats them as distinct — the path typed here
matches the report's directory layout, and the file's actual
filesystem location is the `proads` path.)

Path copied from `pwd`:

```
$ cd "D:\proads-worktrees\969-cumulative-learning"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning
```

joined to `specs\969-cumulative-learning\reports\coderabbit-round-02.md`.
