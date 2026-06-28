# Contract A — Concept Director module (`functions/src/conceptDirector.ts`)

Pure module (no Firebase/Gemini imports). The model call is injected as a function argument so the module stays unit-testable without network. Mirrors the `gazeMap.ts` / `expressionMap.ts` pattern.

## Exports

```ts
export type VarianceMode = "conservative" | "balanced" | "aggressive";
export interface ConceptBrief { /* §3 of data-model.md */ }
export interface ConceptDirectorFallback { fallback: true; reason: string }
export interface ConceptDirectorInput { /* §2 of data-model.md */ }

// Pure helpers
export function buildDirectorPrompt(input: ConceptDirectorInput): string;
export function parseDirectorResponse(raw: string): ConceptBrief | ConceptDirectorFallback;
export function validateBrief(brief: ConceptBrief, expectedSubStyle: string): { ok: boolean; reason?: string };
export function buildConceptEnrichmentBlock(briefs: Array<ConceptBrief | ConceptDirectorFallback>): string;

// Orchestrated entry (model caller injected — keeps module pure)
export async function directConcept(
  input: ConceptDirectorInput,
  callModel: (prompt: string) => Promise<string>,
  timeoutMs?: number, // default 15000
): Promise<ConceptBrief | ConceptDirectorFallback>;
```

## Behavioral guarantees

- **A1 (valid success shape)**: For well-formed model output, `directConcept` returns a `ConceptBrief` whose enum fields are all within their allowed sets and whose `conceptIndex` echoes the input.
- **A2 (concrete metaphor)**: The prompt instructs a concrete, depictable `visualMetaphor.description` (e.g. "newspaper folded on a subway seat"), not an abstract concept ("media is dying"). Verified by prompt-content assertion + sample fixtures.
- **A3 (language split)**: Free-text fields are authored in `input.inviolable.language`; enum/category labels remain canonical English. The prompt states this rule explicitly.
- **A4 (sibling avoidance)**: `buildDirectorPrompt` includes every prior sibling's `varianceAxes` tokens plus any `avoidTokens`, with an instruction to differ from them.
- **A5 (inviolable choices)**: The prompt forbids overriding subStyle/mode/language/aspectRatio/brand; `subStyleSpecialization.inheritedFrom` is required to equal `input.inviolable.subStyle`.
- **A6 (hard constraints)**: `validateBrief` returns `ok:false` (with `reason`) when any of: `highlightCardinality.count > 2`; `propsForbidden.length < 3`; `restraintRules.length < 2`; `subStyleSpecialization.inheritedFrom !== expectedSubStyle`; any enum out of set; any missing/empty `varianceAxes` token.
- **A7 (fallback on failure)**: `directConcept` returns `{ fallback: true, reason }` on model error, on exceeding `timeoutMs` (default 15000), on JSON parse failure, on schema mismatch, or when `validateBrief` fails. It **never throws**.
- **A8 (timeout bound)**: A model call exceeding `timeoutMs` resolves to a timeout fallback; the function never hangs the caller.
- **A9 (enrichment block)**: `buildConceptEnrichmentBlock` emits, for each of the 3 slots, either a labeled directive (CONCEPT N: metaphor / headline architecture / layout / forbidden props / hero gaze+pose / restraint) for an accepted brief, or a "use existing logic for CONCEPT N" marker for a fallback slot — so the downstream prompt can mix enriched and fallback concepts.
- **A10 (purity)**: Module imports nothing from `firebase-admin`, `firebase-functions`, or the Gemini SDK. All effects enter through `callModel`.

## Out of scope for this contract
- Reading the flag / kill switch (Contract C).
- Persisting the trace (Contract D).
- Running the 3× loop / retry (Contract C orchestration).
