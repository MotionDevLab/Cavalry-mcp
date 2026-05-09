import { test } from "node:test";
import assert from "node:assert/strict";
import type { MotionTarget } from "../motionDSL.js";
import {
  isCanonicalNodeType,
  type CanonicalNodeType,
} from "../nodeRegistry.js";

/**
 * DSL contract — invariant boundary tests.
 *
 * Core invariants:
 *   I1 — canonical layerType passes DSL gate
 *   I2 — non-canonical runtime values fail DSL gate
 *   I3 — alias strings must not pass as canonical
 */

// ---------------------------------------------------------------------------
// I1 — canonical value passes DSL gate
// ---------------------------------------------------------------------------

test("canonical MotionTarget passes DSL guard", () => {
  const target: MotionTarget = {
    kind: "compilerOwned",
    compilerLayerId: "title",
    layerType: "textShape" as CanonicalNodeType,
  };

  assert.ok(isCanonicalNodeType(target.layerType));
});

// ---------------------------------------------------------------------------
// I2 — invalid runtime value fails DSL gate
// ---------------------------------------------------------------------------

test("invalid runtime value fails DSL guard", () => {
  const target: MotionTarget = {
    kind: "compilerOwned",
    compilerLayerId: "title",
    layerType: "invalid_type" as unknown as CanonicalNodeType,
  };

  assert.ok(!isCanonicalNodeType(target.layerType));
});

// ---------------------------------------------------------------------------
// I3 — alias strings must NOT be accepted accidentally
// (regression protection for alias leakage into canonical space)
// ---------------------------------------------------------------------------

test("alias strings are rejected by DSL guard", () => {
  const target: MotionTarget = {
    kind: "compilerOwned",
    compilerLayerId: "title",
    layerType: "text" as unknown as CanonicalNodeType,
  };

  assert.ok(!isCanonicalNodeType(target.layerType));
});
