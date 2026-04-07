# Quickstart: Resolver Completeness, Resolution Trace & Slide Plans

**Branch**: `001-resolver-completeness-trace` | **Date**: 2026-04-06

## Prerequisites

- Node.js 24
- Firebase CLI (`npm install -g firebase-tools`)
- Access to Firebase project `proadsai-saas`

## Setup

```bash
cd functions
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm run test:contracts
```

Tests use Node.js native `assert` module. Contract fixtures are in `functions/src/contractFixtures.test.ts`.

## Local Development

```bash
npm run serve       # Start Firebase emulator
npm run build:watch # Watch mode for TypeScript compilation
```

## Key Files to Modify

| File | Purpose |
|------|---------|
| `functions/src/creativeResolver.ts` | Core resolver — extend with trace, precedence chain, new inputs |
| `functions/src/index.ts` | Entry point — add launch surface guard before generation |
| `functions/src/generators.ts` | Consume resolved trace and slide plans |

## New Files to Create

| File | Purpose |
|------|---------|
| `functions/src/launchSurface.ts` | Launch surface registry + `validateLaunchSurface()` |
| `functions/src/slidePlanEngine.ts` | `buildSlidePlan()` pure function |
| `functions/src/resolutionTrace.ts` | `ResolutionTrace` type + `buildTrace()` + `persistTrace()` |
| `functions/src/emptyFieldFilter.ts` | `filterEmptyFields()` for value_stack suppression |

## Architecture Notes

- **Resolver is SSoT**: All creative decisions go through `creativeResolver.ts`. No inline logic in generators.
- **Trace is fire-and-forget**: `persistTrace()` writes to Firestore but never fails the generation.
- **Slide plans are deterministic**: Same inputs always produce same output.
- **Launch surface is compile-time**: Typed constant, no runtime I/O.
- **Performance target**: Resolver < 50ms p95 (pure in-memory, no async).

## Terminology

| User-facing | Internal/Trace field | Notes |
|-------------|---------------------|-------|
| Creative mode | `creativeMode` | "ad mode" is deprecated |
| Art direction | `subStyle` | Trace uses `subStyle` for historical compatibility |
