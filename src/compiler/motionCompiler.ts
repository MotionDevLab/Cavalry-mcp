/**
 * Motion Compiler — MotionProgram → CompiledPlan.
 *
 * Pure transformation. Validates input, expands clips through the preset
 * registry, validates the resulting ops, and returns a deterministic plan.
 * No Cavalry API references live in this layer.
 */

import type {
  CompiledPlan,
  MotionClip,
  MotionOp,
  MotionProgram,
  MotionTarget,
  ResolvedTarget,
} from "./motionDSL.js";
import { getPreset } from "./presets/index.js";
import { validateOps, validateProgram } from "./validators.js";

function targetKey(target: MotionTarget): string {
  return target.kind === "existingLayerById"
    ? `id:${target.id}`
    : `name:${target.name}`;
}

function buildTargetTable(clips: MotionClip[]): {
  refByKey: Map<string, string>;
  resolved: ResolvedTarget[];
} {
  const refByKey = new Map<string, string>();
  const resolved: ResolvedTarget[] = [];
  let counter = 0;

  for (const clip of clips) {
    const key = targetKey(clip.target);
    if (!refByKey.has(key)) {
      const ref = `t${counter++}`;
      refByKey.set(key, ref);
      resolved.push({ ref, target: clip.target });
    }
  }
  return { refByKey, resolved };
}

export function compile(program: MotionProgram): CompiledPlan {
  validateProgram(program);

  const { refByKey, resolved } = buildTargetTable(program.clips);
  const ops: MotionOp[] = [];

  for (const clip of program.clips) {
    const ref = refByKey.get(targetKey(clip.target));
    if (!ref) {
      // Unreachable: buildTargetTable populates every clip's key.
      throw new Error(`internal: missing target ref for clip ${clip.id}`);
    }

    const preset = getPreset(clip.preset);
    const expanded = preset.build(ref, clip.timing, clip.params);
    ops.push(...expanded);
  }

  validateOps(ops);

  return { targets: resolved, ops };
}
