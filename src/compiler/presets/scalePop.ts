/**
 * scale_pop — uniform scale-in from 0 to target with BackOut overshoot.
 *
 * Params:
 *   targetScale?: number   final scale.x and scale.y (default 1)
 *   startScale?:  number   initial scale (default 0)
 */

import type { MotionOp, MotionTiming, PresetParams } from "../motionDSL.js";

export const id = "scale_pop" as const;

export function build(
  targetRef: string,
  timing: MotionTiming,
  params?: PresetParams,
): MotionOp[] {
  const targetScale =
    typeof params?.targetScale === "number" ? params.targetScale : 1;
  const startScale =
    typeof params?.startScale === "number" ? params.startScale : 0;

  const startFrame = timing.startFrame;
  const endFrame = timing.startFrame + timing.durationFrames;

  const ops: MotionOp[] = [];
  for (const attr of ["scale.x", "scale.y"] as const) {
    ops.push(
      {
        kind: "keyframe",
        targetRef,
        attr,
        frame: startFrame,
        value: startScale,
      },
      {
        kind: "keyframe",
        targetRef,
        attr,
        frame: endFrame,
        value: targetScale,
      },
      {
        kind: "easing",
        targetRef,
        attr,
        frame: endFrame,
        type: "BackOut",
      },
    );
  }
  return ops;
}
