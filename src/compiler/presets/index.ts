/**
 * Preset registry — single lookup point for all deterministic presets.
 *
 * Adding a preset:
 *   1. create `presets/<name>.ts` exporting `id` and `build(...)`
 *   2. register it here under PRESET_REGISTRY
 *   3. add its id to PRESET_IDS in motionDSL.ts
 */

import type {
  MotionOp,
  MotionTiming,
  PresetId,
  PresetParams,
} from "../motionDSL.js";

import * as fadeIn from "./fadeIn.js";
import * as bounceIn from "./bounceIn.js";
import * as slideLeft from "./slideLeft.js";
import * as scalePop from "./scalePop.js";

export interface Preset {
  id: PresetId;
  build: (
    targetRef: string,
    timing: MotionTiming,
    params?: PresetParams,
  ) => MotionOp[];
}

export const PRESET_REGISTRY: Record<PresetId, Preset> = {
  fade_in: fadeIn,
  bounce_in: bounceIn,
  slide_left: slideLeft,
  scale_pop: scalePop,
};

export function getPreset(id: PresetId): Preset {
  const preset = PRESET_REGISTRY[id];
  if (!preset) {
    throw new Error(`Unknown preset id: ${id}`);
  }
  return preset;
}
