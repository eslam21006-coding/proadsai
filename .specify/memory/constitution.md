<!--
  ═══════════════════════════════════════════════════════════════════
  SYNC IMPACT REPORT
  ═══════════════════════════════════════════════════════════════════
  Version change: (none) → 1.0.0 (initial ratification)
  Modified principles: N/A (initial creation)
  Added sections:
    - Core Principles (12 principles)
    - Operating Rules (6 rules)
    - Amendment Policy
    - Governance
  Removed sections: N/A (replacing template placeholders)
  Templates requiring updates:
    - .specify/templates/plan-template.md  ✅ compatible
      (Constitution Check gate present; will resolve dynamically)
    - .specify/templates/spec-template.md  ✅ compatible
      (no constitution-specific sections required)
    - .specify/templates/tasks-template.md ✅ compatible
      (phase structure aligns with principles)
  Follow-up TODOs: none
  ═══════════════════════════════════════════════════════════════════
-->

# Pro Ads AI Constitution

## Core Principles

### I. Reliability Over Feature Count

The product MUST prioritize predictable behavior over a broader
feature surface. Any mode, combination, or option that increases
launch risk without clear near-term value MUST be removed,
deferred, hidden, or blocked.

### II. The Selected Mode MUST Be Obeyed

If the user selects a campaign type, format, creative mode, style
family, language, or related input, the final output MUST follow
that selection unless an explicit documented override applies.
Silent drift into another behavior is a product defect.

### III. Launch Surface Is Frozen and Authoritative

The launch product is a reduced validated surface, not the full
roadmap. Only the combinations explicitly approved for launch are
in scope. If any older matrix, chat, code path, document, or
assumption conflicts with the approved launch contract, the
approved launch contract wins.

### IV. Behavior Contracts Beat Subjective Judgment

A feature is not accepted because it "looks fine." Every priority
lane and high-risk combination MUST have explicit pass/fail rules
covering:

- Required inputs
- Required visible output
- Blocked behaviors
- Acceptable variation
- Fail conditions

### V. Arabic Quality Is First-Class

Arabic is not a fallback language. Arabic Fusha, Egyptian Arabic,
and Gulf Arabic MUST be treated as first-class product outputs
wherever they are visible at launch. Any visible language MUST
have an explicit quality standard or be hidden or beta-labeled.

### VI. Hidden Machine Layers MUST Be Auditable

Any internal step that resolves, rewrites, blocks, or transforms
user intent MUST leave an auditable trace. No hidden resolver,
art-direction layer, build-plan layer, or quality loop may
silently alter launch behavior without structured internal
logging.

### VII. No Silent Override Without Rule, Signal, and Trace

Any override, suppression, auto-clear, auto-switch, downgrade,
or fallback MUST be:

- Explicitly defined by product rule
- Signaled to the user when relevant
- Traceable internally

### VIII. Cost Discipline Is Mandatory

Reliability improvements MUST NOT depend on wasteful generation.
The system MUST reduce invalid runs, avoid unnecessary retries,
and prevent predictable failures as early as possible.

### IX. Proof Is Required for Every Claimed Fix

No issue is considered fixed without evidence. A valid fix MUST
include:

- The exact failing rule
- The controlling file or system area
- Why the previous behavior occurred
- What changed
- Before/after evidence
- Reproducible test inputs

### X. Spec Before Code

No material implementation work should proceed without a clear
written specification. Every change MUST have:

- Defined scope
- Expected behavior
- Acceptance criteria
- Validation method
- Launch relevance or explicit deferral status

### XI. Frontend and Backend MUST Agree on Truth

The frontend MUST NOT expose invalid launch states. The backend
MUST NOT accept unsupported launch combinations just because the
frontend failed to block them. Launch rules MUST be enforced in
both layers.

### XII. Deferred Scope MUST Remain Deferred

Any feature, mode, or combination excluded from launch MUST stay
excluded until it receives:

- Explicit product approval
- A written specification
- Validation rules
- Implementation and QA coverage

## Operating Rules

### Launch Principle

The launch surface is intentionally smaller than the full vision.
Reduction of scope is a product-strength decision, not a
weakness.

### Launch Authority

For launch behavior, the approved launch behavior contract is the
authoritative standard.

### Priority Lanes

The launch priority lanes are (per LAUNCH_MATRIX Section 5):

1. Retargeting + Carousel
2. Cold + Single + before_after
3. Cold + Carousel + value_stack
4. Cold + Carousel (any approved mode)
5. Cold + Batch + standard_hero + value_stack
6. Cold + Single + value_stack
7. Retargeting + Single + value_stack
8. Minimal + standard_hero + Single
9. Minimal + standard_hero + Batch
10. Testimonial Carousel (Cold)
11. Testimonial Carousel (Retargeting)

### Validation Rule

No lane is considered launch-ready unless it passes its behavior
contract end-to-end.

### Language Rule

No language should remain visibly selectable at launch unless its
quality is intentionally governed.

### Debugging Rule

For any faulty output, the team MUST be able to answer:

- What the user selected
- What the system resolved
- What the system generated
- Why the output passed or failed contract

## Governance

- This constitution supersedes all other development practices
  when conflicts arise.
- Amendments MUST follow the Amendment Policy below.
- All code changes MUST be verified against the Core Principles
  before deployment.
- Use `AGENTS.md` as the runtime development guidance file;
  keep it aligned with this constitution.

### Amendment Policy

This constitution may be updated only when:

1. Ambiguity is reduced
2. Launch risk is lowered
3. Product strategy materially changes
4. A recurring implementation failure reveals a missing
   governing rule

Wording clarifications may be treated as minor (PATCH) revisions.
Any change that alters priorities, acceptance rules, launch
authority, or launch scope principles is a major (MAJOR) revision.
New principles or materially expanded guidance are minor (MINOR)
revisions.

**Version**: 1.1.0 | **Ratified**: 2026-03-30 | **Last Amended**: 2026-03-31
