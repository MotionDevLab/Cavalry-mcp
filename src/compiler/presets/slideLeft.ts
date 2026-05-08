/**
 * slide_left — horizontal slide from off-screen-right into target X.
 *
 * Params:
 *   targetX?: number     final position.x (default 0)
 *   offsetX?: number     start offset to the right of targetX (default 400)
 */

import type { MotionOp, MotionTiming, PresetParams } from "../motionDSL.js";

export const id = "slide_left" as const;

export function build(
  targetRef: string,
  timing: MotionTiming,
  params?: PresetParams,
): MotionOp[] {
  const targetX = typeof params?.targetX === "number" ? params.targetX : 0;
  const offsetX = typeof params?.offsetX === "number" ? params.offsetX : 400;

  const startFrame = timing.startFrame;
  const endFrame = timing.startFrame + timing.durationFrames;

  return [
    {
      kind: "keyframe",
      targetRef,
      attr: "position.x",
      frame: startFrame,
      value: targetX + offsetX,
    },
    {
      kind: "keyframe",
      targetRef,
      attr: "position.x",
      frame: endFrame,
      value: targetX,
    },
    {
      kind: "easing",
      targetRef,
      attr: "position.x",
      frame: endFrame,
      type: "EaseOut",
    },
  ];
}
