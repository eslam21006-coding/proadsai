# Contract: RAG Injection (Layer 7a) + Phase 20 Wiring (Layer 7b)

**Feature**: `phase-14-rag-meta` · **US8**
**Transport**: server-side helpers invoked during generation. Fail-open, no regression below threshold.

---

## `getRAGContext(args)` (`ragContext.ts`)

```ts
getRAGContext({
  userId: string; workspaceId: string; adAccountId: string;
  inputs: { hookAngle?: string; creativeModes?: string[]; layoutTemplate?: string; artDirection?: string; universe?: string };
}): {
  topPerformers: Array<{...}>;   // top 3 matching inputs (conversion-only)
  avoid: Array<{...}>;           // bottom 3
  insights: string;              // internal — may reference متوسط (never surfaced to UI)
  sampleSize: number;            // conversion-matched creatives account-wide
  insufficient: boolean;         // sampleSize < 10
}
```

### Activation (spec §9.2)
- Activates only at **≥ 10 conversion-objective matched** creatives (only conversion counts). Below → `insufficient:true` → **injection skipped silently**; generation byte-identical to pre-Phase-14 (FR-025 / SC-10).

### Injection points (three, §9.4) — appended to existing personalization (§9.6)
1. **Hook generation** (`generateHooks`/`generateTOV`) — query `hookPerformance`; inject a `PERFORMANCE_CONTEXT` block (top angles, worst to avoid, selected-angle track record). Conservative language: *"Based on this user's own ad account data … Use this to inform — but not rigidly copy — the hooks you generate."*
2. **Build plan / visual** (`generateBuildPlan`) — query `visualPerformance`; inject top/underperforming patterns. *"…best-performing visual compositions … Lean toward these while maintaining creative variety."*
3. **Concept Director** — the Phase 20 wiring below.

- Existing `retrieveCreativePatterns()` / `buildPersonalizationContext()` keep working; the Phase 14 block is **added after** them, never replacing. Any prompt-string addition routes through `buildFinalImagePrompt()` (single injection point).
- Trace: `resolutionTrace.performanceContext` (data-model §9), written client-side.

---

## `getPastWinningAds` (callable / helper) — Phase 20 wiring (§10)

### Request `{ workspaceId: string; accountId: string; limit?: number /* default 5 */ }`
### Response
```ts
{
  ok: true;
  pastWinningAds: Array<{
    hookAngle: string; hookText: string;             // the text on the image
    layoutTemplate: string; creativeModes: string[]; artDirection: string; universe: string;
    linkCtr: number; cpm: number;
    // Cost-per-acquisition the winner was scored on. `cpa` for paid
    // funnels, `cpl` for free funnels (free_webinar / lead_magnet_call).
    // Exactly one of these is set per winner — chosen by the funnel type
    // in the verdict record. The Concept Director uses whichever is set
    // as the value-metric; downstream contracts MUST handle both.
    cpa?: number; cpl?: number;
  }>;  // [] when none
}
```
### Selection rules
- Source = `adPerformance` where `campaignObjective=='conversion'` && `verdict=='🟢'` (S1).
- **Order by `evaluatedAt` desc — the 5 most recently evaluated S1 winners** (clarified: freshest wins, stale age out).
- **Exclude** any winner whose source generation was deleted (`metadataAvailable==false`, Edge Case 16).
- Passed into the Concept Director `pastWinningAds` (defaults `[]`); the Director uses them to learn patterns **and ensure new concepts differ** (variety). Empty → works exactly as today (no regression).
- **Fail-open (§10.4)**: any fetch failure → `pastWinningAds: []`; generation proceeds; non-blocking.
