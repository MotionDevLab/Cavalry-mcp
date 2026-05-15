import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, GeneratorError } from "../cavalryGenerator.js";
import type { CompiledPlan } from "../motionDSL.js";
import type { CanonicalNodeType } from "../nodeRegistry.js";

/**
 * Generator contract — invariant boundary tests.
 *
 * The generator assumes a valid CompiledPlan produced by the compiler.
 * It does NOT validate semantics — only enforces structural compiler integrity.
 *
 * Core invariants:
 *   I1 — valid CompiledPlan produces output without throwing
 *   I2 — invalid compiler state triggers GeneratorError
 *   I3 — only GeneratorError is allowed for contract violations
 */

// ---------------------------------------------------------------------------
// I1 — valid compiled plan is accepted
// ---------------------------------------------------------------------------

test("generate() accepts valid CompiledPlan", () => {
  const plan = {
    targets: [
      {
        ref: "t0",
        target: {
          kind: "existingLayerById",
          id: "abc123",
        },
      },
    ],
    ops: [],
  } as unknown as CompiledPlan;

  assert.doesNotThrow(() => generate(plan));
});

// ---------------------------------------------------------------------------
// I2 — invalid compiler state triggers GeneratorError
// ---------------------------------------------------------------------------

test("generate() throws GeneratorError for invalid compiler state", () => {
  const plan = {
    targets: [
      {
        ref: "t0",
        target: {
          kind: "compilerOwned",
          compilerLayerId: "title",
          layerType: "invalid_type" as unknown as CanonicalNodeType,
        },
      },
    ],
    ops: [],
  } as unknown as CompiledPlan;

  assert.throws(() => generate(plan), GeneratorError);
});

// ---------------------------------------------------------------------------
// I3 — strict error boundary enforcement (only GeneratorError allowed)
// ---------------------------------------------------------------------------

test("generator only throws GeneratorError on contract violation", () => {
  const plan = {
    targets: [
      {
        ref: "t0",
        target: {
          kind: "compilerOwned",
          compilerLayerId: "title",
          layerType: "invalid_type" as any,
        },
      },
    ],
    ops: [],
  } as unknown as CompiledPlan;

  try {
    generate(plan);
    assert.fail("Expected GeneratorError was not thrown");
  } catch (err) {
    assert.ok(err instanceof GeneratorError);
  }
});
