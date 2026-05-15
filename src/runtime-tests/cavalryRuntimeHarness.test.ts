import { test } from "node:test";
import assert from "node:assert/strict";

import { generate, GeneratorError } from "../compiler/cavalryGenerator.js";
import { validateClip, MotionValidationError } from "../compiler/validators.js";
import { canonicalize, isCanonicalNodeType } from "../compiler/nodeRegistry.js";

import type { CompiledPlan, MotionClip } from "../compiler/motionDSL.js";

// -----------------------------------------------------------------------------
// FIXTURE: valid compilerOwned clip
// -----------------------------------------------------------------------------

const validClip: MotionClip = {
  id: "clip_0",
  target: {
    kind: "compilerOwned",
    compilerLayerId: "title",
    layerType: canonicalize("text")!, // guaranteed canonical in test context
  },
  preset: "fade_in",
  timing: {
    startFrame: 0,
    durationFrames: 24,
  },
};

// -----------------------------------------------------------------------------
// FIXTURE: invalid compilerOwned clip (runtime-mismatched input)
// -----------------------------------------------------------------------------

const invalidClip: MotionClip = {
  id: "clip_1",
  target: {
    kind: "compilerOwned",
    compilerLayerId: "title",
    layerType: "notCanonical" as any,
  },
  preset: "fade_in",
  timing: {
    startFrame: 0,
    durationFrames: 24,
  },
};

// -----------------------------------------------------------------------------
// 1. VALIDATOR — happy path
// -----------------------------------------------------------------------------

test("runtime: validateClip accepts canonical compilerOwned clip", () => {
  assert.doesNotThrow(() => validateClip(validClip, 0));
});

// -----------------------------------------------------------------------------
// 2. VALIDATOR — rejection path
// -----------------------------------------------------------------------------

test("runtime: validateClip rejects non-canonical layerType", () => {
  assert.throws(() => validateClip(invalidClip, 0), MotionValidationError);
});

// -----------------------------------------------------------------------------
// 3. GENERATOR — valid compilerOwned flow
// -----------------------------------------------------------------------------

test("runtime: generate compiles valid compilerOwned clip", () => {
  const plan = {
    targets: [
      {
        ref: "t0",
        target: validClip.target,
      },
    ],
    ops: [],
  } as unknown as CompiledPlan;

  const exec = generate(plan);

  assert.strictEqual(typeof exec.code, "string");
  assert.ok(exec.code.length > 0);
});

// -----------------------------------------------------------------------------
// 4. GENERATOR — contract violation
// -----------------------------------------------------------------------------

test("runtime: generator throws on invalid compiler state", () => {
  const plan = {
    targets: [
      {
        ref: "t0",
        target: invalidClip.target,
      },
    ],
    ops: [],
  } as unknown as CompiledPlan;

  assert.throws(() => generate(plan), GeneratorError);
});

// -----------------------------------------------------------------------------
// 5. CANONICAL SYSTEM CHECK
// -----------------------------------------------------------------------------

test("runtime: canonicalize + isCanonicalNodeType consistency", () => {
  const t = canonicalize("text")!;

  assert.strictEqual(t, "textShape");
  assert.ok(isCanonicalNodeType(t));
});
