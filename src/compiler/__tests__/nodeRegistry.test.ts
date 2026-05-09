import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, isCanonicalNodeType } from "../nodeRegistry.js";

/**
 * nodeRegistry — invariant contract tests
 *
 * Core invariants:
 *   I1 — alias resolution is deterministic (alias → canonical OR null)
 *   I2 — unknown input returns null (pipeline hard-stop)
 *   I3 — canonical input is identity-preserving
 *   I4 — canonical guard is consistent with registry
 */

// ---------------------------------------------------------------------------
// I1 — alias resolution is deterministic
// ---------------------------------------------------------------------------

test("canonicalize resolves known aliases deterministically", () => {
  const result = canonicalize("text");
  assert.ok(result === "textShape");
});

test("canonicalize resolves second alias deterministically", () => {
  const result = canonicalize("textLayer");
  assert.ok(result === "textShape");
});

// ---------------------------------------------------------------------------
// I2 — unknown input halts pipeline
// ---------------------------------------------------------------------------

test("canonicalize returns null for unknown input set", () => {
  const cases = ["basicText", "basicShape", "notANode", ""];
  for (const input of cases) {
    assert.strictEqual(canonicalize(input), null);
  }
});

// ---------------------------------------------------------------------------
// I3 — canonical identity is preserved
// ---------------------------------------------------------------------------

test("canonical input is identity-preserving", () => {
  const canonical = "textShape";
  assert.strictEqual(canonicalize(canonical), canonical);
});

// ---------------------------------------------------------------------------
// I4 — canonical guard consistency
// ---------------------------------------------------------------------------

test("isCanonicalNodeType matches canonical registry behavior", () => {
  assert.ok(isCanonicalNodeType("textShape"));

  const invalid = ["text", "textLayer", "basicText", "", 42, null, undefined];

  for (const v of invalid) {
    assert.ok(!isCanonicalNodeType(v));
  }
});
