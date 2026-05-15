/**
 * Motion DSL — strongly typed, deterministic, serializable.
 *
 * This file defines the only intermediate representation the compiler accepts.
 * It is transport- and model-agnostic and contains NO Cavalry runtime references.
 * The Cavalry API surface lives exclusively in `cavalryGenerator.ts`.
 */

import { type CanonicalNodeType } from "./nodeRegistry.js";
import { CONTROLLED_ATTRS } from "../schema/attributeRegistry.js";

// ---------------------------------------------------------------------------
// Controlled vocabularies
// ---------------------------------------------------------------------------

// Compiler-emittable attribute paths.
// Single source of truth: ATTRIBUTE_REGISTRY in src/schema/attributeRegistry.ts.
// Projection: numeric-valued attributes only (MotionOp values are always numbers).
export { CONTROLLED_ATTRS };

export type ControlledAttr = (typeof CONTROLLED_ATTRS)[number];

/**
 * Closed list of easing enum strings accepted by `api.magicEasing`.
 * Spelling must match exactly — wrong values silently fail in Cavalry.
 */
export const EASING_TYPES = [
  "Linear",
  "EaseIn",
  "EaseOut",
  "EaseInOut",
  "BounceIn",
  "BounceOut",
  "BounceInOut",
  "ElasticIn",
  "ElasticOut",
  "ElasticInOut",
  "BackIn",
  "BackOut",
  "BackInOut",
] as const;

export type EasingType = (typeof EASING_TYPES)[number];

/**
 * Closed list of preset identifiers supported in v1.
 * Adding a preset requires registering it in `presets/index.ts`.
 */
export const PRESET_IDS = [
  "fade_in",
  "bounce_in",
  "slide_left",
  "scale_pop",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/**
 * Reserved namespace prefix for all compiler-owned layers.
 * Cavalry display names are prefixed with this to avoid collisions with
 * hand-authored layers. Verified via api.getNiceName() on 2026-05-08.
 */
export const MC_NAMESPACE = "MC__";

/**
 * Returns the deterministic Cavalry display name for a compiler-owned layer.
 */
export function compilerLayerName(compilerLayerId: string): string {
  return `${MC_NAMESPACE}${compilerLayerId}`;
}

/**
 * Stable identity record for compiler-owned layers (v2 identity system).
 *
 * `mcId` is a persistent identifier stored in the layer's `userData.mcId`
 * field inside Cavalry. It survives display-name renames, making reconciliation
 * robust against user edits.
 *
 * `name` mirrors the expected display name at the time identity was assigned.
 * It is informational — the generator derives the canonical display name from
 * `compilerLayerId` via `compilerLayerName()`.
 */
export type CompilerIdentity = {
  mcId: string;
  name: string;
};

/**
 * Reference to a layer in the Cavalry scene.
 *
 * Verified target kinds (2026-05-08):
 * - `existingLayerById`: layer ID is known at compile time (e.g. from api.create return value)
 * - `compilerOwned`: deterministic identity via MC__ namespace + api.getNiceName lookup
 *
 * `existingLayerByName` is reserved in the DSL surface but rejected by the
 * generator — no verified scene-query mechanism exists for it.
 *
 * v2 identity: when `identity` is present on a `compilerOwned` target, the
 * resolver uses hybrid matching (mcId primary, display-name fallback) instead
 * of name-only matching. Omitting `identity` preserves v1 behaviour.
 */
export type MotionTarget =
  | { kind: "existingLayerById"; id: string }
  | { kind: "existingLayerByName"; name: string }
  | {
      kind: "compilerOwned";
      /** Unique compiler-assigned ID. Becomes display name "MC__<compilerLayerId>". */
      compilerLayerId: string;
      /** Cavalry layer type passed to api.create. Must be a CanonicalNodeType. */
      layerType: CanonicalNodeType;
      /**
       * Optional stable identity (v2). When present, reconciliation uses
       * `userData.mcId` as the primary match key so renames do not break identity.
       * When absent, v1 name-only matching is used (backward compat).
       */
      identity?: CompilerIdentity;
      /**
       * Compiler-owned initialization attributes applied immediately after
       * api.create() during reconciliation — only on newly-created layers.
       *
       * Constraints:
       *   - Non-animated string values only (v1).
       *   - Emitted exclusively inside the creation branch of reconciliation.
       *   - Originates only from semantic resolution (never inferred or defaulted).
       *   - Must NOT appear on existingLayerById / existingLayerByName targets.
       */
      constructorFields?: Record<string, string>;
    };

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

export interface MotionTiming {
  /** Integer frame at which the animation begins. */
  startFrame: number;
  /** Integer number of frames the animation lasts. Must be >= 1. */
  durationFrames: number;
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

/**
 * Free-form numeric/string params consumed by a preset's `build` function.
 * Each preset documents its own param shape; validators check numeric safety.
 */
export type PresetParams = Record<string, number | string | boolean>;

export interface MotionClip {
  /** Clip-local identifier — used only for trace/logging. */
  id: string;
  target: MotionTarget;
  preset: PresetId;
  timing: MotionTiming;
  params?: PresetParams;
}

// ---------------------------------------------------------------------------
// Composition (optional metadata; no runtime side effect at v1)
// ---------------------------------------------------------------------------

export interface MotionComposition {
  fps?: number;
  inFrame?: number;
  outFrame?: number;
}

// ---------------------------------------------------------------------------
// Top-level program
// ---------------------------------------------------------------------------

interface MotionProgramShape {
  /** DSL schema version. Bump on breaking changes. */
  version: "1";
  composition?: MotionComposition;
  clips: MotionClip[];
}

/**
 * Branded IR type. Only one sanctioned cast site exists:
 * the final return of buildProgramFromIntent() in buildProgram.ts.
 */
export type MotionProgram = MotionProgramShape & {
  readonly __motionProgram: unique symbol;
};

// ---------------------------------------------------------------------------
// MotionOp — lowest-level deterministic instruction
// ---------------------------------------------------------------------------

/**
 * A `MotionOp` is the atomic instruction the generator translates into
 * Cavalry JS. Presets emit `MotionOp[]`; the generator never invents ops.
 *
 * `targetRef` is a stable reference assigned by the compiler when expanding
 * a clip's `MotionTarget` — the generator resolves it back to a Cavalry
 * layer id at code-emit time.
 */
export type MotionOp =
  | {
      kind: "setAttr";
      targetRef: string;
      attr: ControlledAttr;
      value: number;
    }
  | {
      kind: "keyframe";
      targetRef: string;
      attr: ControlledAttr;
      frame: number;
      value: number;
    }
  | {
      kind: "easing";
      targetRef: string;
      attr: ControlledAttr;
      frame: number;
      type: EasingType;
    };

// ---------------------------------------------------------------------------
// Compiled plan — output of motionCompiler, input to cavalryGenerator
// ---------------------------------------------------------------------------

export interface ResolvedTarget {
  ref: string;
  target: MotionTarget;
}

interface CompiledPlanShape {
  /**
   * Targets discovered while expanding clips. Generator uses this to emit
   * any required layer-id resolution preamble.
   */
  targets: ResolvedTarget[];
  ops: MotionOp[];
}

/**
 * Branded IR type. Only one sanctioned cast site exists:
 * the final return of compile() in motionCompiler.ts.
 */
export type CompiledPlan = CompiledPlanShape & {
  readonly __compiledPlan: unique symbol;
};

// ---------------------------------------------------------------------------
// Intent parser output
// ---------------------------------------------------------------------------

/**
 * Result of normalizing free-text into the controlled preset vocabulary.
 * Returns `null` (not a guess) when no controlled-vocabulary match exists.
 */
export interface IntentRecognition {
  preset: PresetId;
  /** Only fields the deterministic parser was confident about. */
  targetHint?: { name?: string };
}
