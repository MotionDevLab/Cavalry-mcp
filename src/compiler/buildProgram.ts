/**
 * buildProgram — authorised IntentRecognition → MotionProgram factory.
 *
 * This is the ONLY place in the codebase that constructs a MotionProgram from
 * an IntentRecognition. No other module or tool handler may inline this logic.
 *
 * Rules:
 *   - Input comes exclusively from intentParser.parseIntent().
 *   - Output is the minimum valid MotionProgram for the recognised intent.
 *   - When a layerId is supplied, the target is existingLayerById (no creation).
 *   - When no layerId is supplied, the target is compilerOwned (reconcile/create).
 *   - compilerOwned targets use v1 name-only reconciliation (no identity.mcId)
 *     because the tool layer is stateless and cannot persist mcIds across calls.
 *   - Timing defaults: startFrame = 0, durationFrames = 24.
 *   - This module contains NO Cavalry API references.
 */

import type {
  IntentRecognition,
  MotionProgram,
  MotionTarget,
} from "./motionDSL.js";
import { canonicalize } from "./nodeRegistry.js";
import { resolveSemantics } from "./semanticResolver.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BuildProgramOptions {
  /** When set, targets this existing Cavalry layer id. No layer creation. */
  layerId?: string;
  startFrame?: number;
  durationFrames?: number;
  /**
   * Raw NL input record passed to semanticResolver before MotionProgram
   * construction. When present, attributes are filtered through
   * ATTRIBUTE_REGISTRY, constructor fields are extracted, and any resolved
   * motion intent may override the preset from intentParser.
   * Absent for all current callers — purely additive, no behavior change.
   */
  rawInput?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal target builder
// ---------------------------------------------------------------------------

/**
 * Derives a safe `[a-zA-Z0-9_]+` compiler layer id from a free-form name.
 * Collapsed to 40 chars max to keep display names readable in Cavalry.
 */
function toCompilerLayerId(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "default";
}

function buildTarget(
  intent: IntentRecognition,
  layerId?: string,
): MotionTarget {
  // Caller supplied a concrete layer id — target it directly.
  if (layerId) {
    return { kind: "existingLayerById", id: layerId };
  }

  // Attempt to resolve the target hint to a canonical node type.
  // Resolution order: targetHint.name → alias map → fallback "textShape".
  const hintName = intent.targetHint?.name ?? "";
  const resolvedType = hintName ? canonicalize(hintName) : null;
  const layerType = resolvedType ?? "textShape";
  const compilerLayerId = toCompilerLayerId(hintName || intent.preset);

  // v1 name-only reconciliation (no identity.mcId — tool layer is stateless)
  return { kind: "compilerOwned", compilerLayerId, layerType };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Constructs a minimal MotionProgram from a recognised intent.
 *
 * Callers must obtain `intent` exclusively from `parseIntent()`. Constructing
 * an IntentRecognition manually to pass here defeats the compiler contract.
 */
export function buildProgramFromIntent(
  intent: IntentRecognition,
  options: BuildProgramOptions = {},
): MotionProgram {
  const startFrame = options.startFrame ?? 0;
  const durationFrames = options.durationFrames ?? 24;
  const target = buildTarget(intent, options.layerId);

  // Pre-compiler NL normalization — no-op when rawInput is absent.
  // Runs AFTER target resolution so the correct nodeType is passed to the
  // attribute registry filter. Absent for all current callers: no behavior
  // change on the existing index.ts execution path.
  const nodeType =
    target.kind === "compilerOwned" ? target.layerType : "textShape";
  const semantic = options.rawInput
    ? resolveSemantics(options.rawInput, nodeType)
    : null;

  // Preset: semanticResolver motionIntent takes priority when it resolves a
  // named preset; falls back to intentParser result (always-present default).
  const preset =
    semantic?.motionIntent?.kind === "preset"
      ? semantic.motionIntent.presetId
      : intent.preset;

  // Registry-filtered runtime attributes forwarded as clip params.
  // Presets that do not recognise a key ignore it silently.
  const params =
    semantic && Object.keys(semantic.runtimeAttributes).length > 0
      ? semantic.runtimeAttributes
      : undefined;

  return {
    version: "1",
    clips: [
      {
        id: "clip_0",
        target,
        preset,
        timing: { startFrame, durationFrames },
        params,
      },
    ],
  };
}
