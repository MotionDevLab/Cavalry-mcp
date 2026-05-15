/**
 * Motion Compiler — MotionProgram → CompiledPlan.
 *
 * Pure transformation. Validates input, expands clips through the preset
 * registry, validates the resulting ops, applies final safety gating,
 * and returns a deterministic plan.
 *
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
import { finalizeProgram } from "./finalizeProgram.js";

function targetKey(target: MotionTarget): string {
  switch (target.kind) {
    case "existingLayerById":
      return `id:${target.id}`;

    case "existingLayerByName":
      return `name:${target.name}`;

    case "compilerOwned":
      return `mc:${target.compilerLayerId}`;
  }
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
  // 1. Structural validation (DSL correctness only)
  validateProgram(program);

  const { refByKey, resolved } = buildTargetTable(program.clips);
  const ops: MotionOp[] = [];

  // 2. Expand clips → ops (pure compilation)
  for (const clip of program.clips) {
    const ref = refByKey.get(targetKey(clip.target));

    if (!ref) {
      throw new Error(`internal: missing target ref for clip ${clip.id}`);
    }

    const preset = getPreset(clip.preset);
    const expanded = preset.build(ref, clip.timing, clip.params);

    ops.push(...expanded);
  }

  // 3. FINALIZER GATE (hard runtime safety boundary — validates MotionProgram)
  finalizeProgram(program);

  // 4. Post-emission validation (op correctness only)
  validateOps(ops);

  // 5. Return deterministic compiled plan
  return { targets: resolved, ops } as unknown as CompiledPlan;
}
