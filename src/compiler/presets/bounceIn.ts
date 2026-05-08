/**
 * bounce_in — vertical drop into target Y with BounceOut easing.
 *
 * Params:
 *   targetY?: number     final position.y value (default 0)
 *   offsetY?: number     start offset above targetY (default -200)
 */

import type { MotionOp, MotionTiming, PresetParams } from "../motionDSL.js";

export const id = "bounce_in" as const;

export function build(
  targetRef: string,
  timing: MotionTiming,
  params?: PresetParams,
): MotionOp[] {
  const targetY = typeof params?.targetY === "number" ? params.targetY : 0;
  const offsetY = typeof params?.offsetY === "number" ? params.offsetY : -200;

  const startFrame = timing.startFrame;
  const endFrame = timing.startFrame + timing.durationFrames;

  return [
    {
      kind: "keyframe",
      targetRef,
      attr: "position.y",
      frame: startFrame,
      value: targetY + offsetY,
    },
    {
      kind: "keyframe",
      targetRef,
      attr: "position.y",
      frame: endFrame,
      value: targetY,
    },
    {
      kind: "easing",
      targetRef,
      attr: "position.y",
      frame: endFrame,
      type: "BounceOut",
    },
  ];
}
