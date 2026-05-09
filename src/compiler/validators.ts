/**
 * Validators — pure, deterministic input checks.
 *
 * Validators run BEFORE generation. They guarantee that the only values the
 * generator ever sees are within the controlled vocabularies declared in
 * motionDSL.ts. Generation-time correctness is the only safety net we have
 * (Stallion returns HTTP 200 even when Cavalry silently ignores bad input).
 */

import {
  CONTROLLED_ATTRS,
  EASING_TYPES,
  PRESET_IDS,
  type ControlledAttr,
  type EasingType,
  type MotionClip,
  type MotionOp,
  type MotionProgram,
  type PresetId,
} from "./motionDSL.js";
import { isCanonicalNodeType } from "./nodeRegistry.js";

export class MotionValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "MotionValidationError";
  }
}

// ---------------------------------------------------------------------------
// Primitive checks
// ---------------------------------------------------------------------------

const MAX_FRAME = 1_000_000;
const MAX_NUMERIC = 1_000_000;

export function isControlledAttr(value: unknown): value is ControlledAttr {
  return (
    typeof value === "string" &&
    (CONTROLLED_ATTRS as readonly string[]).includes(value)
  );
}

export function isEasingType(value: unknown): value is EasingType {
  return (
    typeof value === "string" &&
    (EASING_TYPES as readonly string[]).includes(value)
  );
}

export function isPresetId(value: unknown): value is PresetId {
  return (
    typeof value === "string" &&
    (PRESET_IDS as readonly string[]).includes(value)
  );
}

export function assertSafeFrame(value: number, path: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MotionValidationError(
      `frame must be a finite integer (got ${String(value)})`,
      path,
    );
  }
  if (value < 0 || value > MAX_FRAME) {
    throw new MotionValidationError(
      `frame out of range [0, ${MAX_FRAME}] (got ${value})`,
      path,
    );
  }
}

export function assertSafeNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new MotionValidationError(
      `value must be a finite number (got ${String(value)})`,
      path,
    );
  }
  if (Math.abs(value) > MAX_NUMERIC) {
    throw new MotionValidationError(
      `value magnitude exceeds ${MAX_NUMERIC} (got ${value})`,
      path,
    );
  }
}

// ---------------------------------------------------------------------------
// DSL validation
// ---------------------------------------------------------------------------

export function validateClip(clip: MotionClip, index: number): void {
  const root = `clips[${index}]`;

  if (!clip.id || typeof clip.id !== "string") {
    throw new MotionValidationError("missing string id", root);
  }
  if (!isPresetId(clip.preset)) {
    throw new MotionValidationError(
      `unsupported preset "${String(clip.preset)}"`,
      `${root}.preset`,
    );
  }

  // target
  if (!clip.target || typeof clip.target !== "object") {
    throw new MotionValidationError("missing target", `${root}.target`);
  }
  if (clip.target.kind === "existingLayerById") {
    if (!clip.target.id || typeof clip.target.id !== "string") {
      throw new MotionValidationError(
        "existingLayerById requires non-empty id",
        `${root}.target`,
      );
    }
  } else if (clip.target.kind === "existingLayerByName") {
    if (!clip.target.name || typeof clip.target.name !== "string") {
      throw new MotionValidationError(
        "existingLayerByName requires non-empty name",
        `${root}.target`,
      );
    }
  } else if (clip.target.kind === "compilerOwned") {
    if (
      !clip.target.compilerLayerId ||
      typeof clip.target.compilerLayerId !== "string"
    ) {
      throw new MotionValidationError(
        "compilerOwned requires non-empty compilerLayerId",
        `${root}.target`,
      );
    }
    if (!/^[a-zA-Z0-9_]+$/.test(clip.target.compilerLayerId)) {
      throw new MotionValidationError(
        `compilerLayerId must match [a-zA-Z0-9_]+ (got "${clip.target.compilerLayerId}")`,
        `${root}.target`,
      );
    }
    if (!clip.target.layerType || typeof clip.target.layerType !== "string") {
      throw new MotionValidationError(
        "compilerOwned requires non-empty layerType",
        `${root}.target`,
      );
    }
    if (!isCanonicalNodeType(clip.target.layerType)) {
      throw new MotionValidationError(
        `node type "${clip.target.layerType}" not in canonical registry`,
        `${root}.target.layerType`,
      );
    }
  } else {
    throw new MotionValidationError(
      `unsupported target.kind`,
      `${root}.target`,
    );
  }

  // timing
  assertSafeFrame(clip.timing.startFrame, `${root}.timing.startFrame`);
  if (
    !Number.isInteger(clip.timing.durationFrames) ||
    clip.timing.durationFrames < 1
  ) {
    throw new MotionValidationError(
      `durationFrames must be integer >= 1 (got ${String(clip.timing.durationFrames)})`,
      `${root}.timing.durationFrames`,
    );
  }
  assertSafeFrame(
    clip.timing.startFrame + clip.timing.durationFrames,
    `${root}.timing(end)`,
  );
}

export function validateProgram(program: MotionProgram): void {
  if (!program || typeof program !== "object") {
    throw new MotionValidationError("missing program", "<root>");
  }
  if (program.version !== "1") {
    throw new MotionValidationError(
      `unsupported DSL version "${String(program.version)}"`,
      "version",
    );
  }
  if (!Array.isArray(program.clips)) {
    throw new MotionValidationError("clips must be an array", "clips");
  }
  program.clips.forEach((clip, i) => validateClip(clip, i));
}

// ---------------------------------------------------------------------------
// Op validation (post-preset expansion)
// ---------------------------------------------------------------------------

export function validateOp(op: MotionOp, index: number): void {
  const root = `ops[${index}]`;

  if (!op.targetRef || typeof op.targetRef !== "string") {
    throw new MotionValidationError("missing targetRef", root);
  }
  if (!isControlledAttr(op.attr)) {
    throw new MotionValidationError(
      `attribute "${String(op.attr)}" not in controlled vocabulary`,
      `${root}.attr`,
    );
  }

  switch (op.kind) {
    case "setAttr":
      assertSafeNumber(op.value, `${root}.value`);
      return;
    case "keyframe":
      assertSafeFrame(op.frame, `${root}.frame`);
      assertSafeNumber(op.value, `${root}.value`);
      return;
    case "easing":
      assertSafeFrame(op.frame, `${root}.frame`);
      if (!isEasingType(op.type)) {
        throw new MotionValidationError(
          `easing "${String(op.type)}" not in controlled vocabulary`,
          `${root}.type`,
        );
      }
      return;
    default: {
      const exhaustive: never = op;
      throw new MotionValidationError(
        `unsupported op kind: ${JSON.stringify(exhaustive)}`,
        root,
      );
    }
  }
}

export function validateOps(ops: MotionOp[]): void {
  if (!Array.isArray(ops)) {
    throw new MotionValidationError("ops must be an array", "ops");
  }
  ops.forEach((op, i) => validateOp(op, i));
}
