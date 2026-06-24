# Contract: Gaze Mapper (`gazeMap.ts`)

Pure, deterministic resolver + block builders. No I/O, no model calls. Mirrors `expressionMap.ts`.

## Contract A — Resolver coverage

**Required inputs**: `{ coldHookAngle?: string|null; retargetingObjection?: string|null }`.

**Required output**: `GazeDirective | null`.

| # | Given | Then |
|---|---|---|
| A1 | each of the 10 canonical hook ids | returns non-null directive with a valid `GazeTreatment` and non-empty `description`; `source:"hook"` |
| A2 | `pain` | `treatment:"reflective_downward"` (down/inward, contemplative) |
| A3 | `logical_authority` | `treatment:"direct_to_viewer"` |
| A4 | `future_based` | `treatment:"forward_horizon"` |
| A5 | `curiosity` | `treatment:"three_quarter"` |
| A6 | `scarcity` | `treatment:"toward_content"` |
| A7 | each of the 12 retargeting objection ids (no hook) | returns non-null directive; `source:"objection"` |
| A8 | unknown non-null id (e.g., `"banana"`) | returns `GAZE_FALLBACK_DIRECTIVE` (`source:"fallback"`), never throws |
| A9 | aliases `shocking_stat` / `fear_of_missing_out` / `future_pacing` | resolve to `statistics` / `urgency` / `future_based` treatments |
| A10 | `coldHookAngle:null, retargetingObjection:null` (or empty strings) | returns `null` |
| A11 | both hook AND objection present | hook wins (priority) |

**Blocked behaviors**: throwing on any string input; returning `null` for a non-null/non-empty id.

**Acceptable variation**: exact `description` wording may evolve; `treatment` mapping per A2–A6 is fixed.

**Fail conditions**: any canonical id → null; any input → thrown exception; pain → a non-reflective treatment.

## Contract B — Image-prompt gaze block builder

**Required inputs**: `(directive: GazeDirective|null, opts: { beforeAfterSplit: boolean; aspectRatio: AspectRatio })`.

**Required output**: `string`.

| # | Given | Then |
|---|---|---|
| B1 | non-null directive, `beforeAfterSplit:false` | output contains a single `GAZE DIRECTION:` block with the treatment description |
| B2 | any non-null directive | output contains an identity-priority clause (gaze = eye/head orientation only; face identity unchanged) |
| B3 | any non-null directive | output contains the advisory/natural clause AND forbids: staring into empty space, cross-eyed/wall-eyed, robotic always-at-CTA |
| B4 | `aspectRatio:"9:16"` | output contains a vertical-composition note (keep gaze within frame, not off the side edge) |
| B5 | `beforeAfterSplit:true` | output contains BEFORE-half (hook gaze) and AFTER-half (aspirational/forward) labels, same face |
| B6 | `directive:null` | returns empty string `""` |

**Blocked behaviors**: emitting any instruction that reorders/weakens the #1 face-identity rule; emitting a facial-feature edit.

**Fail conditions**: null directive → non-empty output; missing identity clause; missing the empty-space prohibition.

## Contract C — Hook↔visual mood + one-highlight + price helpers

| # | Given | Then |
|---|---|---|
| C1 | `ONE_HIGHLIGHT_BLOCK` constant | non-empty; states one primary focal point (hero) and ≤1 supporting secondary emphasis; forbids multiple glow/sparkle/highlight |
| C2 | `buildHookVisualMoodBlock(pain)` | mood skews moodier/dramatic shadows; states it modulates WITHIN, never overrides, art direction/universe |
| C3 | `buildHookVisualMoodBlock(future_based)` | brighter/warmer/open |
| C4 | `buildHookVisualMoodBlock(null)` | empty string |
| C5 | `detectPriceContent` on copy with `"خصم 50٪"` or `"199 SAR"` or `"$49"` | returns `true` |
| C6 | `detectPriceContent` on price-free coach copy | returns `false` |
| C7 | `buildPriceHierarchyBlock()` | states original smaller/struck-through, discounted larger/prominent/distinct color, savings highlighted but secondary |

**Fail conditions**: one-highlight block omitted from the always-on path; mood block claiming to override art direction; price detector true on price-free copy (false positive on a bare year like "2026" must NOT trigger — only currency/discount/percent signals).
