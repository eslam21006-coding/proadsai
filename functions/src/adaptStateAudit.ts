// functions/src/adaptStateAudit.ts — audit adapt-state fusion strings for cultural-compliance trigger words

import { createHash } from "crypto";
import { getSubStyleModeFusion } from "./creativeResolver.js";
import { TRIGGER_WORDS } from "./culturalCompliance.js";
import type { AdaptStateAuditEntry, AdaptStateAuditResult } from "./types.js";

const ADAPT_STATE_PAIRS: Array<{ subStyleId: string; modeId: string }> = [
  { subStyleId: "luxury_magazine", modeId: "value_stack" },
  { subStyleId: "luxury_magazine", modeId: "event_ticket" },
  { subStyleId: "anime_manga", modeId: "value_stack" },
  { subStyleId: "anime_manga", modeId: "event_ticket" },
  { subStyleId: "vintage_bw", modeId: "value_stack" },
  { subStyleId: "comic_book", modeId: "value_stack" },
  { subStyleId: "watercolor_dreamscape", modeId: "event_ticket" },
  { subStyleId: "cinematic_film_still", modeId: "value_stack" },
];

export function auditAdaptStates(): AdaptStateAuditResult {
  const entries: AdaptStateAuditEntry[] = ADAPT_STATE_PAIRS.map((pair) => {
    const fusion = getSubStyleModeFusion(pair.subStyleId, pair.modeId);

    // A missing fusion entry (empty string) is itself a launch blocker — the matrix
    // § 11 declares all 8 pairs as in-scope, so any pair whose composition override
    // is absent from the catalog fails the audit. Flag it via a synthetic
    // "__MISSING_FROM_CATALOG__" marker in triggerWordsFound so catalog owners can
    // see what's wrong without conflating it with a real trigger-word match.
    if (!fusion || fusion.trim().length === 0) {
      return {
        subStyleId: pair.subStyleId,
        modeId: pair.modeId,
        fusionPromptHash: createHash("sha256").update("").digest("hex"),
        triggerWordsFound: ["__MISSING_FROM_CATALOG__"],
        passed: false,
      };
    }

    const triggerWordsFound = TRIGGER_WORDS.filter((word) => {
      const re = new RegExp(`\\b${word}\\b`, "i");
      return re.test(fusion);
    });

    return {
      subStyleId: pair.subStyleId,
      modeId: pair.modeId,
      fusionPromptHash: createHash("sha256").update(fusion).digest("hex"),
      triggerWordsFound,
      passed: triggerWordsFound.length === 0,
    };
  });

  return {
    ranAt: new Date().toISOString(),
    totalChecked: entries.length,
    passed: entries.filter((e) => e.passed).length,
    failed: entries.filter((e) => !e.passed).length,
    entries,
  };
}
