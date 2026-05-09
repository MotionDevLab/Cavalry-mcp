import { test } from "node:test";
import assert from "node:assert/strict";
import { validateClip, MotionValidationError } from "../validators.js";
import type { MotionClip } from "../motionDSL.js";
import type { CanonicalNodeType } from "../nodeRegistry.js";

/**
 * validators — invariant contract tests
 *
 * Core invariants:
 *   I1 — any canonical layerType passes validation
 *   I2 — any non-canonical layerType is rejected
 *   I3 — validator always throws MotionValidationError on failure
 *   I4 — validator is pure (no mutation)
 */

// ---------------------------------------------------------------------------
// helper — minimal valid clip factory (no canonical coupling)
// ---------------------------------------------------------------------------

const createClip = (layerType: string): MotionClip => ({
  id: "clip_0",
  target: {
    kind: "compilerOwned",
    compilerLayerId: "title",
    layerType: layerType as CanonicalNodeType,
  },
  preset: "fade_in",
  timing: { startFrame: 0, durationFrames: 24 },
});

// ---------------------------------------------------------------------------
// I1 — canonical input passes
// ---------------------------------------------------------------------------

test("validateClip accepts any canonical layerType (structural)", () => {
  const clip = createClip("textShape");

  assert.doesNotThrow(() => validateClip(clip, 0));
});

// ---------------------------------------------------------------------------
// I2 — non-canonical input is rejected
// ---------------------------------------------------------------------------

test("validateClip rejects non-canonical layerType", () => {
  const clip = createClip("basicText");

  assert.throws(() => validateClip(clip, 0), MotionValidationError);
});

// ---------------------------------------------------------------------------
// I3 — alias inputs are also rejected (no alias resolution allowed)
// ---------------------------------------------------------------------------

test("validateClip rejects alias input", () => {
  const clip = createClip("text");

  assert.throws(() => validateClip(clip, 0), MotionValidationError);
});

// ---------------------------------------------------------------------------
// I4 — validator is pure (no mutation)
// ---------------------------------------------------------------------------

test("validateClip does not mutate input clip", () => {
  const clip = createClip("textShape");

  const snapshot = structuredClone(clip);

  validateClip(clip, 0);

  assert.deepEqual(clip, snapshot);
});
