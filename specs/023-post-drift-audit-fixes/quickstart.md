# Quickstart: Verifying the Post-Phase-21 Remediation

This recipe verifies each tier against its checkpoint (SC-101 / SC-201 / SC-301) using the **2026-05-21 proof protocol**: end-to-end evidence, not isolated unit tests.

## Prerequisites

- Firebase Local Emulator Suite running (`firebase emulators:start`) for callable + Firestore + Storage verification.
- `npm ci` in both repo root and `functions/`.
- Backend tests build: `cd functions && npm run build`.

## The proof protocol (apply to EVERY fix before marking it done)

1. **Backend fix** → `grep` proves the computed value appears in the `functions/src/index.ts` response shape **AND** the Firestore write.
2. **Frontend fix** → manual smoke against the emulator proves the UI element renders with **real data** (not synthetic test inputs).
3. **Wiring fix** → `grep` proves **zero dead-code references remain** (the function is called from the live path, not only tests).
4. **Re-audit** each fixed item with the original audit methodology before sign-off.

## Tier 1 — Launch blockers (gate: SC-101)

Verify the two highest-severity items first.

1. **Phase 9 (team invites)**: open `/join?inviteId=<seeded>` in the emulator → join page renders (not the app/404) → log in/sign up → claim completes → member sees the workspace. Grep: `getInviteDetails`/`updateTeamMemberRole` exported in `index.ts`; `/join` handled in `main.tsx`.
2. **Phase 4 (testimonial)**: select `testimonial_carousel` + carousel + screenshots → generate → confirm the dedicated `serverGenerateTestimonialCarousel` runs (platform detection + mockup frames), the auto-switch toast fires, the slide-count inline notice renders. Grep: `serverGenerateTestimonialCarousel` referenced in `src/`.
3. **Phase 7**: force a hard failure → credit refunded, `generations` failure doc written with `failureClass`, response carries `costEstimate`. Force `credit_insufficient` → no refund.
4. **Phase 5**: force degraded copy fidelity → blocking Continue/Retry/Cancel banner appears before image render.
5. **Phase 12 Meta**: link an ad account to workspace B → publish from B → push targets B's account (emulator/mock).
6. **HOTFIX-F**: reflow 4:5→9:16 (incl. an auto-generated variant) → deterministic router used, no hero stretch; grep: zero `_internalReflow:true` user-path bypasses, no `REFLOW ONLY` in user flow.
7. **Phase 15 / Hotfix-09.50**: false inheritance label only shows when a real cold ad with colors is linked; "Creator" replaced with a real plan name; over-limit toasts bilingual.
8. **Hotfix-0951 / Hotfix-E**: `culturalViolation` on the doc not the client payload; an over-cap/over-range logo is clamped/dropped.

**Gate**: all Tier-1 acceptance scenarios pass; no user surface shows a non-executing state. → proceed to Tier 2.

## Tier 2 — System integrity (gate: SC-201)

1. **Phase 1**: generate with `visualStyleFamily: minimal` + a reference ad → minimal suppression + precedence actually fire (inspect the prompt / trace). Grep: extended inputs passed at all `resolveCreativeSpec` call sites.
2. **CI (FR-216)**: open a PR with a deliberately-broken parity test → CI blocks it; clean PR passes. Confirm `npm test` runs lang + team + workspace suites (none skipped/crashing).
3. **Phase 12 US4 → Phase 13 US7**: owner grants member access to workspace A via the new matrix → member's `getUserProjects` returns only A's projects; permission-denied leaks no metadata.
4. **Phase 10**: bookmark state correct on first paint (no flicker); deleted favorite shows the "no longer available" notice; partial favorite shows the schema-mismatch notice.
5. **Phase 16**: a one-sided edit to either `creativeResolver.ts` copy fails the parity test.

**Gate**: all Tier-2 scenarios pass AND all Tier-1 still pass (re-run). → proceed to Tier 3.

## Tier 3 — Post-launch observability (gate: SC-301)

1. **FR-301 keystone**: complete a generation → read `generations/{genId}` → `resolutionTrace` is present and queryable (and `blueprintText`/`resolvedImagePrompt` on the main doc).
2. **Phase 3**: run the strengthened lane fixtures; deliberately break one lane's acceptance behavior (e.g., CTA placement) → that lane fails.
3. **Phase 5 assembly**: grep shows `buildFinalImagePrompt` called from the live `generateFinalAd` path; no inline assembly remains.

**Gate**: all Tier-3 scenarios pass AND all Tier-1/Tier-2 still pass.

## Deploy (owner-performed, separate step)

After tiers are signed off and verified in the emulator, the owner runs `firebase deploy --only firestore:rules,firestore:indexes,functions`. Production-dependent criteria (e.g., SC-104 live Meta publish) are re-verified post-deploy.

## Billing-touching fixes — gate cleared

**Phase 21 / Stripe-migration is confirmed merged, deployed, and smoke-tested (2026-05-21).** FR-107/108 (refund) and plan-gating (FR-134/136) implement against current code as specified — no re-verification against post-migration code is needed (research R7).
