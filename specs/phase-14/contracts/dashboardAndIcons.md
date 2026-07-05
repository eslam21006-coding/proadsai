# Contract: "What's Working" Dashboard (Layer 5) + Hook-Angle Icons (Layer 6)

**Feature**: `phase-14-rag-meta` · **US6 / US7**
**Transport**: Firebase callables (reads of workspace-scoped aggregates). **All user-facing copy is plain Arabic** — no "متوسط"/"ميديان"/"CTR"/"CPM"/"CPA"/percentages in any returned UI string (FR-019, SC-11).

---

## `getWhatsWorkingDashboard` (callable) — US6

### Request `{ workspaceId: string; accountId: string }`
### Response
```ts
{
  ok: true;
  syncStatus: { lastMetaSyncAt: number|null; nextScheduledSyncAt: number|null;
                connection: 'connected'|'disconnected'|'needs_reauth'; canSyncNow: boolean; cooldownEndsAt: number|null };
  summary: { spend3dLabel: string; matchedAds: number; totalAds: number; green: number; yellow: number; red: number }; // counts only, no CTR/CPA
  strongestAngles: Array<{ angleKey: string; nameAr: string; icon: '🔥'|'✅'|'⚠️'; countAr: string; // "استخدمتها 6 مرات، 4 منها ناجحة"
                           subLinesAr?: string[] }>;  // e.g. "أقوى في الخليج" — plain Arabic, no %
  strongestVisuals: Array<{ patternKey: string; descriptionAr: string; icon: '🔥'|'✅'|'⚠️'; countAr: string }>;
  unmatchedAds: Array<{ adId: string; adName: string; thumbnailUrl?: string }>;  // → linkUnmatchedAd
  otherObjectiveAds?: Array<{ adId: string; adName: string; verdictEmoji: string }>; // separate non-ranked list (§5.6.4); absent if none
  recentVerdicts: Array<{ adName: string; emoji: string; descriptionAr: string; at: number }>; // no raw metrics
  attributionBannerAr?: string;  // Edge Case 11 — shown for periods straddling March 2026 change
}
```
### Server rules
- Ranked sections (`strongestAngles`/`strongestVisuals`) use **conversion** data only; `other`-objective ads appear only in `otherObjectiveAds` + `recentVerdicts` (§5.6.4). If the account runs only conversion campaigns, `otherObjectiveAds` is omitted.
- Sorted by win count descending. Empty/limited-data states return "no data yet"-style plain Arabic (Edge Cases 1–3).
- `canSyncNow=false` within 1h of last sync (cooldown). `needs_reauth` surfaces `اتصالك بميتا انتهى — وصّل تاني`.

---

## `getHookAnglePerformance` (callable) — US7

Called when Step 1 renders the angle selector (and Step 2 hook cards). Returns per-angle icon state — informational only, never blocking (FR-020).

### Request `{ workspaceId: string; accountId: string }`
### Response
```ts
{
  ok: true;
  icons: Record<CanonicalHookAngle, {
    icon: '🔥'|'✅'|'⚠️'|null;          // null = below gate / no data → no icon
    tooltipAr: string|null;             // plain Arabic, NO numbers/percent/technical terms
  }>;
  bestAngles: Array<{ angleKey: string; nameAr: string }>; // for the ⚠️ tooltip "جرّب [best] أو [second]"
}
```
### Icon logic (§8.2, internal — never shown as numbers)
- Data gate: angle needs **≥ 3 conversion-objective matched ads**; else `icon:null` (FR-021).
- Compare the angle's **conversion** avg Link CTR to `accountOverallAvgLinkCtr`:
  - single top angle → `🔥` "أقوى زاوية في حسابك"
  - > 75% of account avg (within 25% below, at, or above) → `✅` "أداء جيد في حسابك"
  - ≤ 75% of account avg (≥ 25% below) → `⚠️` "أداء ضعيف في حسابك — جرّب [best] أو [second best]"
- The 75% margin is the default and tunable without changing the contract.
- Resolve angle aliases to canonical before lookup (FR-022).
- No Meta connection / no synced data → all `null` (FR-021, Edge Case 5).
