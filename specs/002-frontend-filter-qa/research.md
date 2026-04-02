# Research: Frontend Launch Filter, Override Signals & Priority Lane QA

**Feature**: 002-frontend-filter-qa
**Date**: 2026-04-01

## Decision 1: Override Signal Delivery

**Decision:** Use existing `showToast()` for transient events. Add a persistent inline banner for reference ad override (stays visible while active). Use `validateLaunchSurface()` blocking messages for combination rejections.

**Rationale:** The toast system already exists (store.ts line 245, InputForm prop line 19). No new notification infrastructure needed. Reference ad override is the only signal that persists — all others are transient state transitions.

**Alternatives considered:**
- Custom notification component: Rejected — over-engineered for 9 events when toast + inline + banner cover all cases.
- Modal dialogs: Rejected — too disruptive for auto-switch events.

## Decision 2: Frontend CreativeResolver Sync Strategy

**Decision:** Mirror Spec B's resolver changes line-by-line in `src/creativeResolver.ts`. Keep both files in sync manually (no shared module — different module resolution: bundler vs NodeNext).

**Rationale:** The frontend and backend resolvers are separate files due to TypeScript module resolution differences. Shared knowledge modules exist in `functions/src/knowledge/` but the resolver is too deeply integrated with each build to share.

**Alternatives considered:**
- Shared resolver module: Rejected — `functions/src/` uses NodeNext (`.js` imports), `src/` uses bundler (no extensions). Sharing would require build pipeline changes.

## Decision 3: QA Fixture Structure

**Decision:** 11 fixture functions added to existing `functions/src/contractFixtures.test.ts`. Each fixture is a self-contained function that calls resolver functions with exact inputs and asserts outputs.

**Rationale:** The project has no Jest/Vitest — only plain Node.js contract fixtures run via `npm run test:contracts`. Adding to the existing file keeps the testing pattern consistent.

## Decision 4: Language Selector Filtering

**Decision:** Filter `AD_LANGUAGES` in `src/constants.ts` to remove 5 non-launch languages. Saved projects with hidden languages fall back to `ar_fusha`.

**Rationale:** LAUNCH_MATRIX explicitly states "Hide entirely from selector." Fallback to ar_fusha is safe since it's the primary product language.

## Decision 5: Saved Project Backward Compatibility

**Decision:** When loading a saved project with old data (deleted modes, old offer types, hidden languages), silently map to valid equivalents. Old offer types map via existing fallback in `getTabForOfferType()`. Deleted modes trigger a mode reset to `['standard_hero']`. Hidden languages fall back to `ar_fusha`.

**Rationale:** Breaking saved project loads would frustrate users. Silent mapping preserves user work. A toast notification informs the user when adjustments are made.
