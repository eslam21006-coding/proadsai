// functions/src/getTopWinners.ts — Phase 14 Layer 7b top winners
// ═══════════════════════════════════════════════════════════
// Queries the user's workspace-scoped `adPerformance` docs for the
// top 5 creatives with an S1 verdict (🟢), sorted by `evaluatedAt`
// descending (most recent first — Decision per Phase 14 §10).
//
// Filters (spec §10 / §5.6.6 / Edge Case 16):
//   - verdict === "🟢" (S1 winner)
//   - campaignObjective === "conversion"
//   - matchType is "auto_hash" or "manual" (not null)
//   - metadataAvailable === true (excludes deleted-generation winners)
//   - generationId present
//
// Maximum 5 results. Fewer than 5 → returns whatever exists.
// Zero → returns empty array (the Concept Director handles empty
// pastWinningAds gracefully — no regression).
//
// The pure filter (`filterTopWinners`) takes an array of pre-loaded
// candidates + a hydration function so the unit tests don't need
// Firestore. The I/O wrapper (`loadTopWinners`) reads Firestore,
// hydrates each winner with its source generation, and returns the
// final list — both fail-open (any error → empty array).
// ═══════════════════════════════════════════════════════════

import { getDb } from "./firestoreClient.js";

// ─── Types ───────────────────────────────────────────────────

/** Subset of `AdPerformanceRecord` the filter needs. */
export interface AdPerformanceWinnerCandidate {
  adId: string;
  generationId: string | null;
  matchType: "auto_hash" | "manual" | null;
  metadataAvailable: boolean;
  campaignObjective: "conversion" | "other";
  verdict: "🟢" | "🟡" | "🔴" | "🛟" | "⏳";
  evaluatedAt: number;
  linkCtr: number;
  cpa3d: number | null;
}

/** Hydrated winner — projection of the matched generation + performance metrics. */
export interface WinningAd {
  generationId: string;
  hookAngle: string;
  hookText: string;
  layoutTemplate: string;
  creativeModes: string[];
  artDirection: string;
  universe: string;
  linkCtr: number;
  cpa: number;
  evaluatedAt: number;
}

export const MAX_TOP_WINNERS = 5;

// ─── Pure filter ─────────────────────────────────────────────

/**
 * Pure filter + sorter. Takes the candidate list (already loaded by
 * the caller) and a hydration function that returns the `WinningAd`
 * for a given `generationId` (or `null` if the source generation is
 * missing / deleted). Non-throwing.
 *
 * Parameter order: required `candidates` + `hydrate` first so the
 * default `maxResults` stays reachable for callers that omit it
 * (audit fix: a required parameter must not follow a default-valued
 * parameter).
 */
export function filterTopWinners(
  candidates: ReadonlyArray<AdPerformanceWinnerCandidate>,
  hydrate: (generationId: string) => WinningAd | null,
  maxResults: number = MAX_TOP_WINNERS,
): WinningAd[] {
  const eligible = candidates.filter((c) => {
    if (c.verdict !== "🟢") return false;
    if (c.campaignObjective !== "conversion") return false;
    if (c.matchType !== "auto_hash" && c.matchType !== "manual") return false;
    if (c.metadataAvailable !== true) return false;
    if (typeof c.generationId !== "string" || c.generationId.length === 0) return false;
    return true;
  });
  // Sort by evaluatedAt descending — freshest wins first.
  eligible.sort((a, b) => b.evaluatedAt - a.evaluatedAt);
  const out: WinningAd[] = [];
  // Dedupe by generationId: the same matched creative often appears
  // as two ad docs (one per ad-set context — see spec §6.3). Without
  // dedup those would consume multiple variety-reference slots with
  // identical content. A generationId is only "seen" after its
  // hydrated WinningAd is actually pushed, so a null hydration (a
  // deleted source generation) does not consume a slot.
  const seen = new Set<string>();
  for (const c of eligible) {
    if (out.length >= maxResults) break;
    const genId = c.generationId as string;
    if (seen.has(genId)) continue;
    const win = hydrate(genId);
    if (!win) continue; // deleted source generation → drop
    seen.add(genId);
    out.push(win);
  }
  return out;
}

// ─── I/O wrapper ─────────────────────────────────────────────

interface GenerationSource {
  hookAngle?: string | null;
  hookText?: string | null;
  layoutTemplate?: string | null;
  creativeModes?: string[] | null;
  artDirection?: string | null;
  universe?: string | null;
}

function hydrateFromGenerationDoc(
  generationId: string,
  data: GenerationSource,
  candidate: AdPerformanceWinnerCandidate,
): WinningAd {
  return {
    generationId,
    hookAngle: typeof data.hookAngle === "string" ? data.hookAngle : "",
    hookText: typeof data.hookText === "string" ? data.hookText : "",
    layoutTemplate: typeof data.layoutTemplate === "string" ? data.layoutTemplate : "",
    creativeModes: Array.isArray(data.creativeModes) ? data.creativeModes.filter((s) => typeof s === "string") : [],
    artDirection: typeof data.artDirection === "string" ? data.artDirection : "",
    universe: typeof data.universe === "string" ? data.universe : "",
    linkCtr: candidate.linkCtr,
    cpa: candidate.cpa3d ?? 0,
    evaluatedAt: candidate.evaluatedAt,
  };
}

/**
 * Load the top 5 S1 winners for a workspace. Reads the workspace-scoped
 * `adPerformance` collection and hydrates each winner with its source
 * generation. Returns `[]` on any read failure (fail-open).
 *
 * Index required (spec §10 — `firestore.indexes.json`):
 *   - `adPerformance` (collection): `campaignObjective ASC`,
 *     `verdict ASC`, `evaluatedAt DESC` — so the filter + sort are
 *     served by a single Firestore query.
 */
export async function loadTopWinners(
  userId: string,
  workspaceId: string,
  accountId: string,
  maxResults: number = MAX_TOP_WINNERS,
): Promise<WinningAd[]> {
  try {
    const db = getDb();
    const adAccountPath = `users/${userId}/workspaces/${workspaceId}/adAccounts/${accountId}/adPerformance`;
    // Index-backed query: conversion-campaign S1 winners, most recent first.
    const snap = await db
      .collection(adAccountPath)
      .where("campaignObjective", "==", "conversion")
      .where("verdict", "==", "🟢")
      .orderBy("evaluatedAt", "desc")
      .limit(maxResults * 4) // over-fetch to allow for the in-memory eligibility filter
      .get()
      .catch((e: unknown) => {
        console.warn("⚠️ loadTopWinners: adPerformance query failed:", e);
        return null;
      });
    if (!snap) return [];
    const candidates: AdPerformanceWinnerCandidate[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      // Strict conversion mapping: only the explicit "conversion"
      // string maps to the conversion bucket. Anything else
      // (including the legacy "other" string, missing values,
      // and any unknown future objective) is bucketed as "other"
      // so it can never be mis-classified as a winner. The
      // Firestore `where("campaignObjective", "==", "conversion")`
      // filter above already excludes non-conversion ads, so
      // the cases this fallback handles are defensive (corrupt
      // docs, legacy rows).
      const campaignObjective: "conversion" | "other" =
        d.campaignObjective === "conversion" ? "conversion" : "other";
      candidates.push({
        adId: doc.id,
        generationId: typeof d.generationId === "string" ? d.generationId : null,
        matchType: d.matchType === "auto_hash" || d.matchType === "manual" ? d.matchType : null,
        metadataAvailable: d.metadataAvailable === true,
        campaignObjective,
        verdict: d.verdict === "🟢" || d.verdict === "🟡" || d.verdict === "🔴" || d.verdict === "🛟" || d.verdict === "⏳" ? d.verdict : "⏳",
        evaluatedAt: typeof d.evaluatedAt === "number" ? d.evaluatedAt : 0,
        linkCtr: typeof d.ctrLink === "number" ? d.ctrLink : 0,
        cpa3d: typeof d.cpa3d === "number" ? d.cpa3d : null,
      });
    }
    // Hydration: fetch each generation doc. The filter will drop any
    // candidate whose generation fetch fails (deleted source gen).
    const hydrationCache = new Map<string, WinningAd | null>();
    const hydrateAsync = async (generationId: string): Promise<WinningAd | null> => {
      if (hydrationCache.has(generationId)) {
        return hydrationCache.get(generationId) ?? null;
      }
      try {
        const genSnap = await db.collection("generations").doc(generationId).get();
        if (!genSnap.exists) {
          hydrationCache.set(generationId, null);
          return null;
        }
        const data = genSnap.data() as GenerationSource;
        const cand = candidates.find((c) => c.generationId === generationId);
        if (!cand) {
          hydrationCache.set(generationId, null);
          return null;
        }
        const win = hydrateFromGenerationDoc(generationId, data, cand);
        hydrationCache.set(generationId, win);
        return win;
      } catch (e) {
        console.warn(`⚠️ loadTopWinners: generation fetch failed for ${generationId}:`, e);
        hydrationCache.set(generationId, null);
        return null;
      }
    };
    // Pre-hydrate (in parallel) for every distinct generationId.
    const distinctGenIds = Array.from(
      new Set(candidates.map((c) => c.generationId).filter((id): id is string => typeof id === "string")),
    );
    await Promise.all(distinctGenIds.map((id) => hydrateAsync(id)));
    return filterTopWinners(candidates, (id) => hydrationCache.get(id) ?? null, maxResults);
  } catch (e) {
    console.warn("⚠️ loadTopWinners failed (non-blocking, returning []):", e);
    return [];
  }
}
