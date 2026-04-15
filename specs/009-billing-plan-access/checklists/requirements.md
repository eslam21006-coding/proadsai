# Specification Quality Checklist: Billing, Plan Access, Top-Up, Downgrade, Cancellation, and Email-Only Auth

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-11
**Updated**: 2026-04-14 (second pass — dual-write pending_plans, mandatory billing modal, first-login welcome toast)
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

## Notes

- Spec updated 2026-04-14 (second pass) for Phase 8 LAUNCH_MATRIX.md refinements:
  - **Dual-write pattern restored**: Paddle webhook handler routes events with `firebaseUid` to `users/{uid}` and events without to `pending_plans/{email}`. Contradicts earlier 04-14 pass which said `pending_plans` was replaced.
  - **Mandatory billing modal replaces account deletion**: Previous behavior deleted Firebase Auth accounts for unpaid users. New behavior keeps the account, sets `plan: 'none'`, and shows a dismiss-proof fullscreen billing modal that auto-closes when Paddle writes a plan.
  - **First-login welcome toast**: Welcome toast only shown within 60 seconds of account `createdAt` — prevents re-display on subsequent logins.
  - **GHL sync accepts uid OR email**: `notifyGHL` helper handles both existing users (by uid) and pre-signup users (by email from Paddle event). Documented in US12.
  - **GHL funnel buttons carry no firebaseUid**: Explicitly designed for new users. Webhook routes to `pending_plans` based on missing uid.
- 14 user stories total (US1–US14)
- 31 functional requirements (FR-001 through FR-026, plus FR-022a, FR-023a, FR-024a, FR-024b)
- 15 success criteria (SC-001 through SC-015)
- 4 clarification passes (2026-04-03, 2026-04-11, 2026-04-14 first pass, 2026-04-14 second pass, 2026-04-14 third pass — clarify)
- Third-pass clarify session resolved: email verification (required), team member modal suppression, duplicate pending_plans collision (last-write-wins), billing pipeline observability (structured logging), forgot password (Firebase built-in)
- All items pass validation — spec is ready for `/speckit.plan` (downstream artifacts must be re-synced)
