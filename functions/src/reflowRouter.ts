// functions/src/reflowRouter.ts — deterministic two-route reflow auto-router (HOTFIX-F)

import type { AspectRatio } from "./generators.js";
import type { ReflowDecision } from "./types.js";

export const RATIO_TO_NUMERIC: Record<AspectRatio, number> = {
    "1:1": 1.0,
    "4:5": 0.8,
    "3:4": 0.75,
    "4:3": 4 / 3,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
} as const;

const MAGNITUDE_THRESHOLD = 0.30;

export function decideMethod(
    sourceRatio: AspectRatio,
    targetRatio: AspectRatio,
    method: "auto" | "outpaint" | "rerender",
): ReflowDecision {
    if (method === "outpaint") {
        return {
            sourceRatio,
            targetRatio,
            magnitude: computeMagnitude(sourceRatio, targetRatio),
            chosenMethod: "outpaint",
            isUserOverride: true,
        };
    }
    if (method === "rerender") {
        return {
            sourceRatio,
            targetRatio,
            magnitude: computeMagnitude(sourceRatio, targetRatio),
            chosenMethod: "rerender",
            isUserOverride: true,
        };
    }

    const magnitude = computeMagnitude(sourceRatio, targetRatio);
    return {
        sourceRatio,
        targetRatio,
        magnitude,
        chosenMethod: magnitude < MAGNITUDE_THRESHOLD ? "outpaint" : "rerender",
        isUserOverride: false,
    };
}

function computeMagnitude(source: AspectRatio, target: AspectRatio): number {
    const s = RATIO_TO_NUMERIC[source];
    const t = RATIO_TO_NUMERIC[target];
    return Math.max(t / s, s / t) - 1;
}
