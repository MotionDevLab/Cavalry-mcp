/**
 * fade_in — opacity 0 → 100 across the clip duration.
 *
 * Params:
 *   targetOpacity?: number   final opacity value (default 100)
 */

import type { MotionOp, MotionTiming, PresetParams } from "../motionDSL.js";

export const id = "fade_in" as const;

export function build(
  targetRef: string,
  timing: MotionTiming,
  params?: PresetParams,
): MotionOp[] {
  const targetOpacity =
    typeof params?.targetOpacity === "number" ? params.targetOpacity : 100;

  const startFrame = timing.startFrame;
  const endFrame = timing.startFrame + timing.durationFrames;

  return [
    {
      kind: "keyframe",
      targetRef,
      attr: "opacity",
      frame: startFrame,
      value: 0,
    },
    {
      kind: "keyframe",
      targetRef,
      attr: "opacity",
      frame: endFrame,
      value: targetOpacity,
    },
    {
      kind: "easing",
      targetRef,
      attr: "opacity",
      frame: endFrame,
      type: "EaseOut",
    },
  ];
}
