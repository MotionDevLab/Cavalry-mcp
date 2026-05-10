import type { PresetId, ControlledAttr } from "./motionDSL.js";

export interface KeyframeHint {
  readonly attr: ControlledAttr;
  readonly from: number;
  readonly to: number;
}

/**
 * Maps normalized motion phrases to canonical PresetId values.
 * Listed from most-specific phrase to least-specific to prevent
 * short-token matches shadowing longer phrases.
 */
export const PRESET_MOTION_MAP: ReadonlyMap<string, PresetId> = new Map([
  ["bounce in", "bounce_in"],
  ["bouncein", "bounce_in"],
  ["bounce_in", "bounce_in"],
  ["bounce-in", "bounce_in"],
  ["bounce", "bounce_in"],
  ["fade in", "fade_in"],
  ["fadein", "fade_in"],
  ["fade_in", "fade_in"],
  ["fade-in", "fade_in"],
  ["slide from right", "slide_left"],
  ["slide left", "slide_left"],
  ["slide_left", "slide_left"],
  ["slide-left", "slide_left"],
  ["from right", "slide_left"],
  ["scale pop", "scale_pop"],
  ["scale_pop", "scale_pop"],
  ["scale-pop", "scale_pop"],
  ["pop in", "scale_pop"],
  ["pop", "scale_pop"],
]);

/**
 * Maps normalized directional-motion phrases to explicit keyframe hints.
 * These phrases describe spatial trajectories that have no preset equivalent.
 */
export const DIRECTIONAL_SLIDE_MAP: ReadonlyMap<
  string,
  readonly KeyframeHint[]
> = new Map([
  [
    "slide top to bottom",
    [{ attr: "position.y", from: 0, to: 200 }],
  ],
  [
    "top to bottom",
    [{ attr: "position.y", from: 0, to: 200 }],
  ],
]);

/** Keys treated as constructor fields regardless of node type. */
export const CONSTRUCTOR_FIELD_KEYS: ReadonlySet<string> = new Set([
  "text",
  "name",
]);

/** Keys in a raw input record that carry the motion intent value. */
export const MOTION_INPUT_KEYS: ReadonlySet<string> = new Set([
  "motion",
  "animation",
  "preset",
]);
