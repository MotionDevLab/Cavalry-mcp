import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, isCanonicalNodeType } from "../nodeRegistry.js";
import { validateClip, MotionValidationError } from "../validators.js";
import { compile } from "../motionCompiler.js";
import { generate } from "../cavalryGenerator.js";
import type { MotionClip, MotionProgram } from "../motionDSL.js";
import type { CanonicalNodeType } from "../nodeRegistry.js";

/**
 * Node Registry Guard — pipeline boundary contract tests.
 *
 * Validates the three-target scenario:
 *   1. "textShape"       — valid canonical type
 *   2. "basicText"       — alias that resolves via ALIAS_MAP
 *   3. "unknownNodeType" — invalid input rejected at boundary
 *
 * Enforced pipeline order under test:
 *   raw input → canonicalize() → validateClip() → generator
 *
 * Core invariants:
 *   I1 — canonical input is accepted at every pipeline stage
 *   I2 — alias input resolves to canonical at the boundary; downstream stages see only canonical
 *   I3 — unknown input is rejected by canonicalize(); never reaches validateClip or generator
 *   I4 — non-canonical input bypassing canonicalize() is caught by validateClip()
 *   I5 — validator does not mutate input
 *   I6 — pipeline order is enforced: canonicalize precedes validateClip; generator receives only canonical values
 */

// ---------------------------------------------------------------------------
// Shared fixture factory
// ---------------------------------------------------------------------------

/**
 * Builds a minimal MotionProgram around a pre-canonicalized layerType.
 * Caller is responsible for running canonicalize() before calling this.
 */
function buildProgram(
  clipId: string,
  compilerLayerId: string,
  layerType: CanonicalNodeType,
): MotionProgram {
  return {
    version: "1",
    clips: [
      {
        id: clipId,
        target: {
          kind: "compilerOwned",
          compilerLayerId,
          layerType,
        },
        preset: "fade_in",
        timing: { startFrame: 0, durationFrames: 30 },
      },
    ],
  } as unknown as MotionProgram;
}

/**
 * Builds a MotionClip with a raw (un-canonicalized) layerType string.
 * Used only to verify that the validator catches non-canonical values
 * when the input boundary is bypassed.
 */
function buildClipWithRawType(rawLayerType: string): MotionClip {
  return {
    id: "clip_raw",
    target: {
      kind: "compilerOwned",
      compilerLayerId: "target_raw",
      layerType: rawLayerType as unknown as CanonicalNodeType,
    },
    preset: "fade_in",
    timing: { startFrame: 0, durationFrames: 30 },
  };
}

// ---------------------------------------------------------------------------
// I1 — "textShape": canonical input accepted at every pipeline stage
// ---------------------------------------------------------------------------

test('canonicalize("textShape") returns "textShape" (identity)', () => {
  const result = canonicalize("textShape");
  assert.strictEqual(result, "textShape");
});

test('"textShape" passes isCanonicalNodeType guard', () => {
  const canonical = canonicalize("textShape");
  assert.ok(canonical !== null);
  assert.ok(isCanonicalNodeType(canonical));
});

test('"textShape" compiles and generates without error', () => {
  const canonical = canonicalize("textShape");
  assert.ok(canonical !== null);

  const program = buildProgram("clip_textShape", "target_text_shape", canonical);
  const plan = compile(program);
  const exec = generate(plan);

  assert.ok(typeof exec.code === "string" && exec.code.length > 0);
  assert.ok(exec.code.includes('api.create("textShape"'));
});

// ---------------------------------------------------------------------------
// I2 — "basicText": alias resolves at boundary; downstream sees only canonical
// ---------------------------------------------------------------------------

test('canonicalize("basicText") resolves to "textShape"', () => {
  const result = canonicalize("basicText");
  assert.strictEqual(result, "textShape");
});

test('"basicText" resolves to canonical; isCanonicalNodeType holds on resolved value', () => {
  const canonical = canonicalize("basicText");
  assert.ok(canonical !== null);
  assert.ok(isCanonicalNodeType(canonical));
});

test('"basicText" resolves to same canonical type as "textShape"', () => {
  assert.strictEqual(canonicalize("basicText"), canonicalize("textShape"));
});

test('"basicText" compiles and generates after boundary resolution', () => {
  const canonical = canonicalize("basicText");
  assert.ok(canonical !== null);

  const program = buildProgram("clip_basicText", "target_basic_text", canonical);
  const plan = compile(program);
  const exec = generate(plan);

  assert.ok(typeof exec.code === "string" && exec.code.length > 0);
  // generator emits "textShape" — the alias never reaches generated code
  assert.ok(exec.code.includes('api.create("textShape"'));
  assert.ok(!exec.code.includes("basicText"));
});

// ---------------------------------------------------------------------------
// I3 — "unknownNodeType": rejected by canonicalize(); never reaches downstream
// ---------------------------------------------------------------------------

test('canonicalize("unknownNodeType") returns null', () => {
  const result = canonicalize("unknownNodeType");
  assert.strictEqual(result, null);
});

test('"unknownNodeType" does not pass isCanonicalNodeType', () => {
  assert.ok(!isCanonicalNodeType("unknownNodeType"));
});

test('"unknownNodeType" is stopped at boundary — no pipeline entry', () => {
  const canonical = canonicalize("unknownNodeType");

  // null at the boundary means the input is rejected; no MotionProgram is built
  assert.strictEqual(canonical, null);

  // generator is never called for this input — confirmed by the null check above
  // (no assert.throws needed: the rejection happens before any pipeline stage)
});

// ---------------------------------------------------------------------------
// I4 — non-canonical bypassing canonicalize() is caught by validateClip()
//      (defense-in-depth: validator does not silently accept raw aliases)
// ---------------------------------------------------------------------------

test('validateClip throws MotionValidationError for raw "unknownNodeType"', () => {
  const clip = buildClipWithRawType("unknownNodeType");
  assert.throws(() => validateClip(clip, 0), MotionValidationError);
});

test('validateClip throws MotionValidationError for raw "basicText" (alias not resolved)', () => {
  // validateClip uses isCanonicalNodeType — it does NOT call canonicalize()
  // passing "basicText" raw confirms the validator never performs alias resolution
  const clip = buildClipWithRawType("basicText");
  assert.throws(() => validateClip(clip, 0), MotionValidationError);
});

test("validateClip error path throws only MotionValidationError (strict error boundary)", () => {
  const clip = buildClipWithRawType("unknownNodeType");
  try {
    validateClip(clip, 0);
    assert.fail("expected MotionValidationError was not thrown");
  } catch (err) {
    assert.ok(err instanceof MotionValidationError);
  }
});

// ---------------------------------------------------------------------------
// I5 — validator does not mutate input (purity)
// ---------------------------------------------------------------------------

test("validateClip does not mutate a valid canonical clip", () => {
  const clip = buildClipWithRawType("textShape") as MotionClip;
  (clip.target as { layerType: CanonicalNodeType }).layerType = "textShape" as CanonicalNodeType;

  const snapshot = structuredClone(clip);
  validateClip(clip, 0);

  assert.deepEqual(clip, snapshot);
});

test("validateClip does not mutate an invalid clip before throwing", () => {
  const clip = buildClipWithRawType("unknownNodeType");
  const snapshot = structuredClone(clip);

  try {
    validateClip(clip, 0);
  } catch {
    // expected throw; check the clip is unchanged
  }

  assert.deepEqual(clip, snapshot);
});

// ---------------------------------------------------------------------------
// I6 — pipeline order: canonicalize → validateClip → generator
// ---------------------------------------------------------------------------

test("pipeline: canonical input passes all three stages in order", () => {
  // Stage 1: canonicalize
  const canonical = canonicalize("textShape");
  assert.ok(canonical !== null, "stage 1: canonicalize must return non-null");

  // Stage 2: validateClip (via compile → validateProgram)
  const program = buildProgram("clip_pipeline", "target_pipeline", canonical);
  let plan: ReturnType<typeof compile>;
  assert.doesNotThrow(() => {
    plan = compile(program);
  }, "stage 2: validateClip must not throw for canonical input");

  // Stage 3: generator
  assert.doesNotThrow(() => {
    generate(plan!);
  }, "stage 3: generator must not throw for valid compiled plan");
});

test("pipeline: alias input resolves at stage 1; stages 2 and 3 see only canonical", () => {
  // Stage 1: canonicalize resolves alias
  const canonical = canonicalize("basicText");
  assert.ok(canonical !== null, "stage 1: alias must resolve to non-null");
  assert.strictEqual(canonical, "textShape", "stage 1: resolved value must be canonical");

  // Stage 2: validateClip sees canonical — no alias visible here
  const program = buildProgram("clip_alias_pipeline", "target_alias", canonical);
  const plan = compile(program);

  // Stage 3: generator output contains canonical type, never the alias
  const exec = generate(plan);
  assert.ok(!exec.code.includes("basicText"), "stage 3: alias must not appear in generated JS");
  assert.ok(exec.code.includes("textShape"), "stage 3: canonical type must appear in generated JS");
});

test("pipeline: unknown input stopped at stage 1; stages 2 and 3 never invoked", () => {
  // Stage 1: canonicalize returns null — pipeline halts here
  const canonical = canonicalize("unknownNodeType");
  assert.strictEqual(canonical, null, "stage 1: unknown input must return null");

  // Stages 2 and 3 are not reached — guarded by the null check above.
  // The following confirms the validator would also reject it if called directly
  // (defense-in-depth, not a bypass of stage 1):
  const clip = buildClipWithRawType("unknownNodeType");
  assert.throws(
    () => validateClip(clip, 0),
    MotionValidationError,
    "stage 2: validator catches non-canonical input as defense-in-depth",
  );
});
