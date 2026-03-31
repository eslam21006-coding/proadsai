// retargetingObjections.ts — THIN RE-EXPORT WRAPPER
// Source of truth lives in functions/src/retargetingObjections.ts
// This file exists so frontend imports (e.g. constants.ts) resolve locally.

export {
  RETARGETING_OBJECTION_DATA,
  getObjectionData,
  getScript,
  getProofBasedObjections,
  getObjectionsByLayer,
  generateRetargetingCopy,
  getObjectionPromptContext,
  ALL_OBJECTION_IDS,
  BEST_ANGLE_FOR_OBJECTION,
  getBestAngleForObjection,
  buildNormalizedRetargetingContext,
  getRetargetingPromptBlock,
  getAvailableObjections,
  isObjectionAvailable,
} from '../functions/src/retargetingObjections';

export type {
  BlameLayer,
  ObjectionScript,
  RetargetingObjectionData,
  NormalizedRetargetingContext,
} from '../functions/src/retargetingObjections';