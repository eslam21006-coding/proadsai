# Specification Quality Checklist: Cumulative Learning for Ad Performance

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Notes

### Iteration 1 — issues found and corrected

1. **Jargon leaked into requirements.** Early drafts named the measures directly (CTR, CPM, CPA, cpa3d, evaluatedTarget, evaluatedRatio, funnelType, angleKey, patternKey). Corrected: requirements now say "click-through", "cost-per-thousand", "realised cost per result", "sealed target", "efficiency figure", "angle", "visual pattern". Field-level naming is deferred to planning. The one place implementation vocabulary survives deliberately is the Context section, which quotes the investigation's findings — that section is background, not requirement text.

2. **Two decisions the prompt asked to be justified were initially asserted without reasoning.** Corrected: FR-003 (the efficiency formula, with the bounded alternative explicitly considered and rejected), FR-034 (the activation threshold, with an explicit statement of the semantic change from per-sync to all-time), and FR-038 (the aggregate bound, tied to the verdict engine's existing worst-case ceiling) each now carry an inline justification.

3. **The freezing requirement was ambiguous between two different things.** An early draft read as though the ad's day-to-day status should also freeze, which would break the owner's action list. Corrected: FR-008 through FR-012 now split the operational status (stays live against current economics) from the sealed learning result (immune to settings changes), and US2 scenarios 1 and 2 test both halves against each other.

4. **"Material change" was underdefined.** The prompt required a precise definition. Corrected: FR-011 enumerates exactly two triggers — the ad's own measured performance changed, or its creative attribution changed — and FR-010 states that a settings change is never one. FR-012 adds the load-bearing detail that re-evaluation still uses the sealed target, not the current one.

5. **Idempotency was stated as a goal rather than a mechanism.** Corrected: FR-016 and FR-017 specify the contribution ledger and the three-way add / no-op / withdraw-then-add comparison, which is what makes SC-002 and SC-008 verifiable rather than aspirational.

6. **The delete-cascade invariant conflicted with the withdrawal rule.** A general "withdraw when the contribution changes" reading would have withdrawn contributions when metadata was lost on generation delete, contradicting the existing system invariant that already-learned signal stands. Corrected: FR-014 carves this out explicitly, the edge-case list names it, and the Assumptions section records that the existing invariant takes precedence.

7. **Retirement of prior records was implied but not required.** Without it, new accumulation would merge onto retired counts. Corrected: section G (FR-042 through FR-046) specifies versioning, treat-as-absent reads, and full replacement on first write.

### Iteration 2 — verification

All checklist items pass. No [NEEDS CLARIFICATION] markers remain; every gap the prompt left open was decided in the spec with a stated justification, as the prompt directed.

### Iteration 3 — owner amendment to FR-034 (post-approval)

The owner approved the spec with one amendment: FR-034 restated the threshold's meaning without re-justifying it, and "10 distinct ads ever" is reached on far thinner evidence than "10 matched conversion ads in a single sync". Value unchanged; justification rewritten.

Changes made:

1. **FR-034 now states the two properties that were genuinely lost** — the concurrency bar (ten ads that never ran together now clear a gate that once required ten running at once) and an implicit recency guarantee (the old per-sync window incidentally ensured the evidence was current; all-time counting removes that entirely and nothing detects staleness).
2. **FR-034 is marked PROVISIONAL** rather than justified as still-correct, with a named review trigger and the three specific findings that would justify raising it, adding a recency qualifier, or splitting it into separate account-level and per-funnel gates.
3. **A factual error in the prior justification is corrected in place.** It claimed downstream ranking retains independent minimum-evidence gates. That holds for the "avoid" list (3 ads per angle) but not for the top-performer list, which admits any angle with a single qualifying ad. Weakening the account gate without closing that would let a one-ad angle become the top recommendation.
4. **FR-034a added** — a per-item floor of 3 contributing ads before an angle or pattern can be recommended, matching the existing "avoid" floor so both directions of the recommendation rest on the same evidentiary base. **SC-014** added to verify it.
5. **Assumptions updated** to record that the threshold is provisional and must not be treated by planning as a fixed contract.

### Iteration 4 — clarification session 2026-09-02

Four questions asked and integrated; see the `## Clarifications` section of the spec for the recorded answers. Summary of what changed:

1. **Provisional/sealed state machine** (FR-005 through FR-005d, FR-011c, FR-036a/b). Closed a hole where any ad evaluated before funnel settings were complete would be permanently barred from efficiency learning. One-way transition, enforced in the write path rather than by convention. Sealing uses the target at the moment of sealing, with the backdating imprecision stated explicitly as accepted and the reason it cannot be avoided (no settings history is retained).
2. **Learning lease** (section J, FR-054 through FR-065). Verified in code that concurrent and duplicate syncs are a live condition — no lock exists, manual and scheduled paths can overlap, and the task queue retries. Lease scoped to the learning write only, 15-minute expiry derived from the platform's 540-second execution ceiling, atomic acquire and release via single-document transaction, divergent behaviour for manual (fail fast) versus scheduled (signal for retry), and a pre-commit fencing check with its residual window acknowledged rather than papered over.
3. **Ledger durability and bounded reads** (section K, FR-066 through FR-072). Ad documents may never be pruned, with the reason recorded at the write site. The unbounded collection scan is removed entirely and replaced by a chunked by-ID read. A failed chunk read aborts rather than reading as "no prior contribution" — the failure mode that would silently reintroduce double-counting. Three non-learning consumers of that read were identified in code and brought explicitly into scope.
4. **Layered auditability** (FR-051 through FR-051e). Resolved a contradiction between the original FR-051 and the sync path's standing one-line-per-account convention. Two event types initially classified as rare were found not to be — seal transitions fire in bulk, and refresh withdrawals are the modal case for every active ad on every sync — and were reclassified as counts.

**Resolved by decision rather than by question**: how unknown funnel type interacts with retrieval weighting (FR-032). Only one reading is consistent with FR-030 and FR-031 — no boost, never excluded — so it did not warrant the remaining question.

### Carried into planning

- **An existing dashboard test file is present in the test directory but absent from the runner manifest** — the exact failure mode FR-050 guards against, on a surface this feature modifies. Registration is in scope.
- **PRIMARY RISK — concurrency (FR-023) against the batched-commit path (Assumptions).** The accumulation design must be expressible as per-record deltas inside the existing batched commit, not as read-modify-write loops outside it. Owner direction: if it turns out delta accumulation *cannot* be expressed within the existing merge-semantics batch without read-modify-write loops outside it, planning must **say so plainly rather than working around it**. That is the finding that would force a redesign, and surfacing it early is cheaper than discovering it in implementation.
- **Retrieval weighting strength is left as a tuning parameter.** The contract is ordering and non-exclusion (FR-030, FR-031, SC-005, SC-006); the weight itself is a planning choice.
