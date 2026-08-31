# AGENTS.md — Pro Ads AI SaaS

Guidance for agentic coding agents operating in this repository.

---

## Critical Architecture Rules

These rules encode hard-won lessons. Violating them causes production bugs, wasted credits, or broken output.

### 0. ALWAYS WRITE A LOCAL REPORT
At the end of every multi-step task (investigations, refactors, batched migrations, model swaps, billing changes, anything with discrete numbered batches), write a Markdown report to `docs/investigations/` with a descriptive filename (e.g. `model-config-consolidation-batch1-report.md`, `stripe-migration-batch2-report.md`). Commit it. The chat output is ephemeral; the local file is the durable record of what was done, why, and what risks remain.

### 0a. Batch reports
Every batch writes `specs/{feature}/reports/batch-NN-report.md` before reporting
in chat. Raw command output verbatim in fenced code blocks, never summarised.
Report committed alongside the batch code. This applies to every batch without
being asked.

---

## Project Overview

**Pro Ads AI** is a bilingual (Arabic-first, English secondary) SaaS application that generates AI-powered advertising creatives.

- **Frontend:** React 19 + Vite 7 + TypeScript 5.9, deployed to Firebase Hosting
- **Backend:** Firebase Cloud Functions v2, Node.js 24, TypeScript 5.7
- **AI:** Google Gemini 2.5/3.1 (text + image) + fal.ai FLUX-PuLID (face-preserving image generation)
- **Auth/DB:** Firebase Auth + Firestore + Firebase Storage
- **Billing:** Stripe + GoHighLevel webhooks

---

## Repository Layout

```
src/                        # React frontend
  App.tsx                   # Root component (monolith — migration in progress)
  store.ts                  # Zustand global state
  types.ts                  # Shared frontend type definitions
  firebase.ts               # Firebase SDK init
  planconfig.ts             # Plans, credits, feature flags (single source of truth)
  components/               # React UI components (heavy ones lazy-loaded)
  services/                 # geminiService.ts (proxy only), feedbackService, metaService
  utils/                    # hookPayload.ts, textHelpers.ts
functions/src/              # Cloud Functions — ALL AI logic lives here
  index.ts                  # HTTP/callable function exports
  generators.ts             # All Gemini prompt construction
  entitlements.ts           # Server-side plan/credit enforcement
  falGeneration.ts          # fal.ai FLUX-PuLID image generation
  knowledge/                # Shared knowledge modules (compiled into both builds)
```

---

## Build & Dev Commands

### Frontend (run from repo root)
```bash
npm run dev        # Vite dev server with HMR
npm run build      # tsc -b && vite build  (type-checks first, then bundles)
npm run lint       # ESLint on all *.ts / *.tsx files
npm run preview    # Serve the production build locally
```

### Functions (run from `functions/`)
```bash
npm run build        # tsc + copy assets → lib/
npm run build:watch  # tsc --watch (incremental)
npm run serve        # build + firebase emulators:start --only functions
npm run deploy       # firebase deploy --only functions
npm run logs         # firebase functions:log
```

### Deployment (run from repo root)
```bash
firebase deploy --only hosting    # Deploy frontend
firebase deploy --only functions  # Deploy backend (always rebuild first — see rule #1)
firebase deploy                   # Deploy everything
```

---

## Test Commands

There is **no Jest or Vitest** installed. The only test suite is a plain Node.js contract fixture test:

```bash
cd functions && npm run test:contracts
# Equivalent to: npm run build && node lib/contractFixtures.test.js
```

There is no single-test runner, no `--watch` mode, and no frontend tests. To run the one existing test, always run the full command above — it compiles TypeScript first.

---

## TypeScript Rules

### Module resolution differences
- **Frontend** (`tsconfig.app.json`): `moduleResolution: bundler` — import paths with no extension are fine.
- **Functions** (`functions/tsconfig.json`): `moduleResolution: NodeNext` — **local imports must use `.js` extension** even though the source files are `.ts`:
  ```ts
  import { resolveEntitlements } from "./entitlements.js"; // correct
  import { resolveEntitlements } from "./entitlements";    // broken at runtime
  ```

### Imports
- Prefer **named imports** over default imports.
- `verbatimModuleSyntax: true` is enabled on the frontend — **use `import type` for type-only imports**:
  ```ts
  import type { AdInputs, BatchResult } from "./types";
  ```
- Shared knowledge modules (`functions/src/knowledge/*.ts`) are included in both builds — changes affect both the frontend and backend.

### Types
- Use `interface` for object shapes; use `type` for union/alias types.
- Use `as const` on config and lookup objects.
- Avoid adding new `any` — it exists in legacy Firestore data paths but should not spread.
- `Omit<T, K>` is preferred for type composition over copy-pasting interface subsets.

---

## Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| React components | PascalCase | `InputForm`, `PricingTable` |
| Custom hooks | camelCase + `use` prefix | `useT`, `useAppStore` |
| Types / interfaces | PascalCase | `AdInputs`, `UserPlan` |
| Constants / lookup maps | SCREAMING_SNAKE_CASE | `CREDIT_COSTS`, `PLAN_MAP` |
| Helper functions | camelCase | `sanitizeInputs`, `stripUndefined` |
| Service class instances | camelCase singleton | `export const gemini = new GeminiService()` |
| Zustand store actions | `setX` / `updateX` | `setPhase`, `updateHighestUnlocked` |
| Cloud Function exports | camelCase | `generateAdCreative`, `stripeWebhook` |

---

## Code Formatting

- **Indent:** 2 spaces (enforced via ESLint in `functions/`; match in frontend).
- **Quotes:** Double quotes in `functions/` (ESLint rule `"quotes": ["error", "double"]`); no explicit rule on frontend.
- **No Prettier** — formatting is ESLint-only. Do not add a Prettier config.
- **File header:** Every file should open with a comment stating its path and one-line purpose:
  ```ts
  // functions/src/entitlements.ts — server-side plan/credit entitlement resolution
  ```
- **Section dividers:**
  ```ts
  // ═══════════════════════════════════════════════════════════
  // MAJOR SECTION
  // ═══════════════════════════════════════════════════════════

  // ─── Minor Sub-section ───
  ```
- **Console logging:** Use emoji prefixes for visual scanning in logs: `✅`, `💰`, `⚠️`, `🔥`, `❌`.

---

## React & State Patterns

- **Functional components only** — no class components. Type as `React.FC<Props>`.
- **Lazy-load** heavy components:
  ```tsx
  const PricingTable = React.lazy(() => import("./components/PricingTable"));
  // Wrap usage in <Suspense fallback={<Spinner />}>
  ```
- **Global state:** Zustand `useAppStore` (single flat store in `src/store.ts`). Use functional updaters for complex state: `set((s) => ({ ... }))`.
- **i18n:** All user-visible strings go through `useT()`. Copy is **Arabic-first** (Professional Fusha Arabic); English is secondary. The app is RTL-aware.
- **Styling:** Tailwind CSS utility classes exclusively — no CSS modules, no styled-components, no inline `style` objects except for dynamic values Tailwind cannot express.
- **Color palette:** Dark-first (`bg-slate-950`, `text-white`). Light mode is toggled via a class on `document.documentElement`.

---

## Error Handling

### Cloud Functions
```ts
throw new HttpsError("unauthenticated", "Login required");
throw new HttpsError("permission-denied", "Insufficient credits");
throw new HttpsError("internal", "Generation failed");
```

### Client-side (non-blocking)
```ts
try {
  await someFirestoreWrite();
} catch (e) {
  console.warn("Failed to persist X (non-blocking):", e);
}
```

### Fire-and-forget (truly optional side effects)
```ts
logEventToAnalytics(payload).catch(() => {});
```

---

## Recent Changes

- **2026-06-23**: Phase 28 — Expression Adaptation. New pure mapper (`functions/src/expressionMap.ts`) resolves each of the 10 canonical cold hook angles and the 12 retargeting objection ids to an `ExpressionDirective` (emotion + concrete physical description). The `EXPRESSION DIRECTION:` guidance is emitted as one line into the `[VISUAL ARCHITECT V5.0]` concept prompt in `generators.ts` (immediately after `MOOD DIRECTION:`), where Gemini authors the concept-specific expression into each concept's `MOOD_EMOTION` / `SUBJECT_ACTION` fields — that expression then flows into the synthesized `TECHNICAL_PROMPT` through the existing blueprint→technical-prompt synthesis. A single shared injection point covers single / carousel / batch / retargeting / before-after. Face-identity protection stays a `TECHNICAL_PROMPT` rule at priority #1; the new guidance never weakens or reorders identity rules. Additive trace: `ResolutionTrace.expressionAdaptation?` (source/sourceId/emotion/applied) recorded for every hero-bearing generation. 188 unit tests cover Contracts A–E. No frontend, billing, Firestore schema, or pricing/plan-gating change. Reversible: replaced content is commented out and `null` is the canonical absent sentinel.
- **2026-05-10**: Stripe migration (Phase 13–14). Paddle billing provider fully removed and replaced with Stripe. All Paddle code, imports, secrets, and SDK dependency deleted. Frontend uses Stripe Checkout Sessions, Customer Portal, and Top-Up Sessions via Cloud Function callables. GHL sync uses per-event-type routing with 6 dedicated webhook URLs. Stripe Tax enabled on all Checkout Sessions. SC-016 (zero Paddle refs), SC-017 (Stripe Tax), SC-018 (no GHL modal redirects), SC-019 (USD-only) all pass.

Never surface raw error objects to the user — always show a localized string via `useT()`.
