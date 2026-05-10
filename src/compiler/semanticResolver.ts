/**
 * Semantic resolver — deterministic pre-parser only.
 *
 * Splits a raw input record into three disjoint categories before the
 * compiler pipeline sees it:
 *
 *   1. constructorFields  — text and name (layer identity, passed to api.create)
 *   2. runtimeAttributes  — attribute paths present in the approved registry;
 *                           anything NOT in the registry is silently dropped
 *   3. motionIntent       — normalized motion phrase mapped to a preset ID or
 *                           explicit keyframe hints; null when no match exists
 *
 * This module contains NO inference, NO fuzzy matching, and NO LLM fallback.
 * Unknown inputs are dropped, not guessed.
 */

import type { PresetId } from "./motionDSL.js";
import { isApprovedAttribute } from "../schema/attributeRegistry.js";
import {
  PRESET_MOTION_MAP,
  DIRECTIONAL_SLIDE_MAP,
  CONSTRUCTOR_FIELD_KEYS,
  MOTION_INPUT_KEYS,
  type KeyframeHint,
} from "./semanticMappings.js";

export type { KeyframeHint };

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ConstructorFields {
  text?: string;
  name?: string;
}

export type MotionResolution =
  | { kind: "preset"; presetId: PresetId }
  | { kind: "keyframes"; hints: readonly KeyframeHint[] };

export interface SemanticResolution {
  constructorFields: ConstructorFields;
  /** Only attributes confirmed in the approved registry for nodeType. */
  runtimeAttributes: Record<string, number | string>;
  /** Null when no recognized motion phrase is present. */
  motionIntent: MotionResolution | null;
}

// ---------------------------------------------------------------------------
// Trace type
// ---------------------------------------------------------------------------

export type SemanticTrace = {
  /** Serialized raw input as received by the resolver. */
  rawInput: string;

  /** Snapshot of state after the vocabulary/motion resolution stage. */
  afterVocabulary?: unknown;
  /** Snapshot of state after the full resolver pass. */
  afterResolver?: unknown;

  /** Keys routed to constructorFields ("text", "name"). */
  constructorFields: string[];
  /** Attribute keys accepted by the registry safety filter. */
  runtimeAttributes: string[];
  /** Attribute keys rejected by the registry safety filter. */
  droppedAttributes: string[];

  /** Raw motion phrase strings found in motion-keyed input fields. */
  motionInputTokens: string[];
  /** Final resolved preset ID, keyframe label, or null. */
  resolvedMotion: string | null;

  /** Ordered factual notes about decisions made during resolution. */
  notes: string[];
};

export interface SemanticResolutionWithTrace {
  resolution: SemanticResolution;
  trace: SemanticTrace;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizePhrase(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function resolveMotionPhrase(raw: string): MotionResolution | null {
  const n = normalizePhrase(raw);

  // Directional slides are checked first — they are more specific than presets.
  const hints = DIRECTIONAL_SLIDE_MAP.get(n);
  if (hints !== undefined) return { kind: "keyframes", hints };

  const presetId = PRESET_MOTION_MAP.get(n);
  if (presetId !== undefined) return { kind: "preset", presetId };

  return null;
}

// ---------------------------------------------------------------------------
// Core implementation (shared by both public exports)
// ---------------------------------------------------------------------------

function resolveSemanticsFull(
  input: Record<string, unknown>,
  nodeType: string
): SemanticResolutionWithTrace {
  const constructorFields: ConstructorFields = {};
  const runtimeAttributes: Record<string, number | string> = {};
  let motionIntent: MotionResolution | null = null;

  const trace: SemanticTrace = {
    rawInput: JSON.stringify(input),
    constructorFields: [],
    runtimeAttributes: [],
    droppedAttributes: [],
    motionInputTokens: [],
    resolvedMotion: null,
    notes: [],
  };

  for (const [key, value] of Object.entries(input)) {
    // --- Category 1: constructor fields ---
    if (CONSTRUCTOR_FIELD_KEYS.has(key)) {
      if (typeof value === "string") {
        (constructorFields as Record<string, string>)[key] = value;
        trace.constructorFields.push(key);
      }
      continue;
    }

    // --- Category 3: motion intent (checked before attribute safety filter) ---
    if (MOTION_INPUT_KEYS.has(key)) {
      if (typeof value === "string" && motionIntent === null) {
        trace.motionInputTokens.push(value);
        motionIntent = resolveMotionPhrase(value);

        if (motionIntent !== null) {
          const label =
            motionIntent.kind === "preset"
              ? motionIntent.presetId
              : "keyframes";
          trace.resolvedMotion = label;
          trace.notes.push(`motion resolved: ${label}`);
        } else {
          trace.notes.push("no motion match");
        }
      }
      // vocabulary stage snapshot: captured after first motion resolution attempt
      if (trace.afterVocabulary === undefined) {
        trace.afterVocabulary = { motionIntent };
      }
      continue;
    }

    // --- Category 2: runtime attributes (safety filter) ---
    // Attribute is dropped unless it appears in the approved registry.
    if (isApprovedAttribute(nodeType, key)) {
      if (typeof value === "number" || typeof value === "string") {
        runtimeAttributes[key] = value;
        trace.runtimeAttributes.push(key);
      }
    } else {
      trace.droppedAttributes.push(key);
      trace.notes.push(`attribute dropped: ${key}`);
    }
  }

  const resolution: SemanticResolution = {
    constructorFields,
    runtimeAttributes,
    motionIntent,
  };

  trace.afterResolver = {
    constructorFields,
    runtimeAttributes: Object.keys(runtimeAttributes),
    motionIntent,
  };

  return { resolution, trace };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Splits `input` into the three semantic categories.
 *
 * @param input    Flat raw record from the caller (arbitrary keys, unknown values).
 * @param nodeType Cavalry node type used to look up the approved attribute
 *                 registry. Defaults to "textShape" (the only confirmed type).
 */
export function resolveSemantics(
  input: Record<string, unknown>,
  nodeType = "textShape"
): SemanticResolution {
  return resolveSemanticsFull(input, nodeType).resolution;
}

/**
 * Same as `resolveSemantics` but also returns a `SemanticTrace` capturing
 * every decision made during the resolution pass. Use for debugging only.
 */
export function resolveSemanticsWithTrace(
  input: Record<string, unknown>,
  nodeType = "textShape"
): SemanticResolutionWithTrace {
  return resolveSemanticsFull(input, nodeType);
}

// ---------------------------------------------------------------------------
// Trace assertion types
// ---------------------------------------------------------------------------

export type SemanticTraceAssertion = {
  input: string;

  expected: {
    constructorFields?: string[];
    runtimeAttributes?: string[];
    /**
     * Each entry specifies a key that must appear in `trace.droppedAttributes`.
     * `reason` is informational only — it is not compared against the trace.
     */
    droppedAttributes?: Array<{ key: string; reason?: string }>;
    resolvedMotion?: string | null;
  };

  /**
   * When true every assertion field that is provided must match exactly,
   * including array order. Omitted fields are always unchecked.
   * Reserved for future subset-vs-exact mode switch; currently all
   * comparisons are strict equality regardless of this flag.
   */
  strict?: boolean;
};

export type SemanticTraceAssertionResult = {
  pass: boolean;

  mismatches: Array<{
    path: string;
    expected: unknown;
    actual: unknown;
  }>;
};

// ---------------------------------------------------------------------------
// Trace assertion evaluator
// ---------------------------------------------------------------------------

/**
 * Deterministic equality check between a `SemanticTrace` and an assertion.
 *
 * Rules:
 *   - Strict equality only — no fuzzy matching, no scoring, no partial credit.
 *   - Array order matters.
 *   - Only fields present in `assertion.expected` are checked.
 *   - `droppedAttributes` compares the `.key` values from the assertion entries
 *     against the plain strings in `trace.droppedAttributes`.
 */
export function assertSemanticTrace(
  trace: SemanticTrace,
  assertion: SemanticTraceAssertion
): SemanticTraceAssertionResult {
  const mismatches: SemanticTraceAssertionResult["mismatches"] = [];

  const eqArray = (a: unknown[], b: unknown[]): boolean =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => v === b[i]);

  const { expected } = assertion;

  if (
    expected.constructorFields !== undefined &&
    !eqArray(trace.constructorFields, expected.constructorFields)
  ) {
    mismatches.push({
      path: "constructorFields",
      expected: expected.constructorFields,
      actual: trace.constructorFields,
    });
  }

  if (
    expected.runtimeAttributes !== undefined &&
    !eqArray(trace.runtimeAttributes, expected.runtimeAttributes)
  ) {
    mismatches.push({
      path: "runtimeAttributes",
      expected: expected.runtimeAttributes,
      actual: trace.runtimeAttributes,
    });
  }

  if (expected.droppedAttributes !== undefined) {
    // Assertion stores {key, reason?} objects; trace stores plain strings.
    // Compare only the key values — reason is informational, not asserted.
    const expectedKeys = expected.droppedAttributes.map((e) => e.key);
    if (!eqArray(trace.droppedAttributes, expectedKeys)) {
      mismatches.push({
        path: "droppedAttributes",
        expected: expectedKeys,
        actual: trace.droppedAttributes,
      });
    }
  }

  if (
    expected.resolvedMotion !== undefined &&
    trace.resolvedMotion !== expected.resolvedMotion
  ) {
    mismatches.push({
      path: "resolvedMotion",
      expected: expected.resolvedMotion,
      actual: trace.resolvedMotion,
    });
  }

  return {
    pass: mismatches.length === 0,
    mismatches,
  };
}
