\[date] — Bugs found while testing past\_due banner manually:



1\. SCHEMA MISMATCH: billingStatus is stored at users/{uid}.billingState.billingStatus

&#x20;  (nested in the billingState map). But App.tsx listener (line 1129 per audit) reads

&#x20;  userData.billingStatus at top-level. Field is never found, fallback 'active' applies,

&#x20;  amber screen never renders. FIX: either move billingStatus to top-level on write,

&#x20;  or update App.tsx + entitlements + all readers to use billingState.billingStatus.

&#x20;  Affects: past\_due banner, cancelled banner, all gating logic. Phase 21 must reconcile.



2\. STALE PLAN VALUE: my user doc shows plan: "scaling" but launch matrix HOTFIX (plan

&#x20;  alignment) requires plan: "scale". Either the hotfix didn't migrate existing user

&#x20;  records OR there is code still writing "scaling". Phase 21 must:

&#x20;  - Audit functions/src for any remaining "scaling" references

&#x20;  - Migrate existing user records: scaling → scale

&#x20;  - Add a one-time Firestore migration script



Both blockers must be resolved before live cutover.

HEAD


\---



\[2026-05-09] DECISION: Post-Phase-21 audit gate



After Phase 21 (Stripe Migration) merges to main and live cutover is complete, the next milestone IS NOT a new feature. It is a thorough drift audit and verification pass across all previously-merged phases.



Triggering events for the post-21 audit:

\- Phase 8/Paddle drift (code shipped Paddle while matrix said Stripe)

\- HOTFIX (plan alignment) drift (Firestore still had `scaling` docs after the hotfix marked Done)

\- M1 commit drift caught tonight (GLM marked tasks \[x] while the work sat uncommitted)



Confirms a pattern: "marked Done" has historically not equalled "verified working." All previously-merged phases need re-audit before launch.



Audit scope (phase-by-phase):

\- Phase 1 — Resolver Foundation

\- Phase 2 — Frontend Enforcement

\- Phase 3 — QA Fixtures

\- Phase 4 — Testimonial Carousel

\- Phase 5 — Blueprint → Render Pipeline

\- Phase 6 — Language Quality Contracts

\- Phase 7 — Failure Classification

\- Phase 9 — Team Management (already flagged needs re-verification post-21)

\- Phase 10 — Favorites \& Workspace (already flagged)

\- Phase 12 — Workspace Logic (already flagged)

\- Phase 13 — Saved Projects (already flagged)

\- Phase 15 — Brand Colors

\- Phase 16 — Creative Modes \& Art Direction QA

\- All hotfixes (HOTFIX-C, D, E, F, G, plus plan alignment)



Audit deliverable: pass/fail per phase with specific failures listed; failures become hotfix specs before any further new feature (Phase 11 Magic Edit, Phase 14 RAG, Phase 17 Resize, Phase 18 Multi-Hero, Phase 19 DR Design, Phase 20 Concept Director).



This commitment is non-negotiable. New feature work is gated on completion of this audit.

**[2026-05-10] GOTCHA: `plan` field exists in two Firestore locations**
- Top-level: `users/{uid}.plan` (read by server-side code, including `entitlements.ts`)
- Nested: `users/{uid}.billingState.plan` (read by realtime listener `useBillingState.ts`)
Any data migration script that touches `plan` MUST run two separate queries (Firestore can't OR cheaply across different field paths) and rewrite both atomically per document. The M1 backfill script (`functions/scripts/backfillScalingPlan.ts`) at commit `d9ed612` is the canonical pattern. Detected during M1 paranoid checkpoint #1 — first version of the script (commit `85c0b39`) only touched the top-level field, leaving `billingState.plan` stale on all 3 migrated docs. Required a second `--apply` run to fix.
06f5c2e (qa-log(M1): document plan two-field gotcha discovered during backfill)

**[2026-05-10] FINDING: Phase 12 workspace rule tightening was committed but never deployed**
- Source: commit `5f4c52b` on main (2026-03-24, "feat: workspace logic Phase 12 — multi-workspace scale plan + meta binding + team access")
- Discovered: during M1 paranoid checkpoint #2, fetching live ruleset via Firebase Management API
- Deferred: full Phase 12 deploy is gated on the post-Phase-21 audit (see commitment above)
- Rationale: pre-Phase 12 frontend code was never tested against the tightened rules; deploying tonight risks breaking team-member workspace functionality without warning
- M1 deployed: hybrid ruleset = live + (stripe_events, cancellation_logs, refund_logs). Workspace block remained at the older permissive state.
- Source `firestore.rules` in HEAD: contains BOTH M1 additions AND Phase 12 tightening — represents the desired end state once Phase 12 frontend is validated during the audit
- Production state after this M1 deploy: live + M1 additions only (Phase 12 still pending)
- When Phase 12 is validated post-audit: a future `firebase deploy --only firestore:rules` from this branch (or a successor) will land the workspace tightening
- Pattern note: 3 examples now of "marked Done ≠ deployed" (Paddle drift, scaling drift, Phase 12 rule drift). Post-21 audit must explicitly verify infrastructure deploy state for every phase, not just code state.
