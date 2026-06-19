# Specification Quality Checklist: Phase 24B — Conditional Copy Fields (Optional Fields Plumbing)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-18
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

## Success Criteria enumeration (SC-001 … SC-011)

This section enumerates every Success Criterion from [spec.md §Success Criteria](../spec.md) and maps it to the verification surface in [quickstart.md §1–§6](../quickstart.md). The mapping is the contract the "Done criteria" line of quickstart.md refers to.

| SC | Statement (abbreviated) | Acceptance metric | Verified by |
|---|---|---|---|
| **SC-001** | Step-2 renders hook variations with 1+ absent optional fields without empty shells, labels, placeholders, or layout breakage in EN + AR. | 100% of variations with absent optional fields render with zero empty shells, orphaned labels, placeholder strings, or layout breakage, in both EN and AR. | quickstart §3 step-2 manual verify (EN + AR scenarios) |
| **SC-002** | Per-field regenerate controls appear for 100% of present fields and 0% of absent fields. | 100% of present fields → button rendered; 0% of absent fields → button rendered. | quickstart §3 "Absent/present regenerate button" inspection |
| **SC-003** | For every parsed output containing fewer than 4 fields, each absent optional field is `null/undefined` (0% are `""`). | 100% of absent optional fields are `null/undefined`; 0% are `""`. | `functions/src/__tests__/conditionalCopyFields.test.ts` P2 + FR-006 invariant |
| **SC-004** | In a test set mixing legitimately-short outputs with deliberately-malformed outputs, the parser classifies 100% of short outputs as "absent" and 100% of malformed outputs as "parse failure," with zero cross-contamination. | 100%/100% classification; zero cross-contamination. | `functions/src/__tests__/conditionalCopyFields.test.ts` P9 |
| **SC-005** | `validateCopyFidelity()` triggers zero fidelity retries that are caused solely by an intentionally-absent field. | Zero fidelity retries triggered by absent field; absent fields accepted. | `functions/src/__tests__/conditionalCopyFields.test.ts` P4 |
| **SC-006** | The dedup/QA layer reports zero false duplicate or false parse-error flags attributable to a null/absent field. | Zero false duplicate / parse-error flags; null/absent treated as intentionally absent. | `functions/src/__tests__/conditionalCopyFields.test.ts` P5 + P9 |
| **SC-007** | Approve, Edit, AI-Edit, Batch, and the Phase 23.A variation carousel each complete successfully on variations with fewer than four fields, with a 0% error rate attributable to a missing field. | 0% error rate attributable to absent field on any of the five actions. | quickstart §4 actions + carousel manual verify |
| **SC-008** | All previously-passing four-field generation, parsing, fidelity, and rendering behavior continues to pass (no regression). | All pre-phase-24B tests remain green. | `cd functions && npm test` (full suite) |
| **SC-009** | Automated tests explicitly assert the "intentionally absent vs failed to parse" distinction and pass. | `conditionalCopyFields.test.ts` covers P2 + P9 explicitly; tests pass. | `functions/src/__tests__/conditionalCopyFields.test.ts` (the file itself) |
| **SC-010** | For every optional-field parse failure, a failure is logged in 100% of cases before any degrade-to-absent occurs (no silent degradation), and the field ships as absent rather than blocking the ad. | 100% of parse failures are logged before degrade; ad still ships. | `generators.ts` retry-loop console.warn + `copyFieldStatus.degradedToAbsent[]` in trace |
| **SC-011** | 100% of dedup-blanked optional fields are represented as `null/absent` (0% as `""`) and are accepted by the fidelity gate and QA layer without triggering a retry or duplicate/parse-error flag. | 100% of dedup blanks are `null`; 0% are `""`; fidelity + QA accept. | `functions/src/__tests__/conditionalCopyFields.test.ts` P5 + generation-time `dedupBlanked` trace field |

### SC-to-verification-section map

| Quickstart § | SCs covered |
|---|---|
| §1 Build gates | (gates all SCs) |
| §2 Backend invariant tests | SC-003, SC-004, SC-005, SC-006, SC-008, SC-009, SC-010, SC-011 |
| §3 Step-2 UI manual verify | SC-001, SC-002 |
| §4 Actions + variation carousel | SC-007 |
| §5 Trace audit | SC-010, SC-011 |
| §6 Regression guard | SC-008 |

## Notes

- File names (`src/App.tsx`, `functions/src/generators.ts`, `validateCopyFidelity()`) appear only in the Context, Dependencies, and Paranoid Checkpoints sections to anchor the phase to the source spec's task IDs (T19/T20) and to the existing pipeline described in `COPY_SYSTEM_REFERENCE.md`. The mandatory requirement/scenario/success sections remain behavior-focused and technology-agnostic. This is a deliberate trade-off for a tightly-scoped plumbing phase whose entire purpose is defined relative to two named code surfaces; it does not weaken the testability of the requirements.
- Both tasks (T19, T20) are flagged as paranoid checkpoints per the source spec §18.4.
- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`. All items currently pass.
- This enumeration was added in response to the CodeRabbit nitpick on quickstart.md — the spec defined the SCs but did not enumerate them with explicit acceptance criteria and a verification mapping.
