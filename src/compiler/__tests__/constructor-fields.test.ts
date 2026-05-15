/**
 * Constructor fields — end-to-end propagation tests.
 *
 * Verifies that:
 *   CF1 — text input propagates into compilerOwned.constructorFields
 *   CF2 — existing targets never receive constructor fields
 *   CF3 — empty/absent constructor fields are omitted from the target
 *   CF4 — emitted reconciliation block contains api.set() for constructor fields
 *         OUTSIDE the if/else branches (post-resolution), applying to both create and reuse
 *   CF5 — api.set fires post-resolution so reused layers also receive constructor fields
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseIntent } from "../intentParser.js";
import { buildProgramFromIntent } from "../buildProgram.js";
import { compile } from "../motionCompiler.js";
import { generate } from "../cavalryGenerator.js";
import { emitReconciliation } from "../sceneIdentityResolver.js";
import type { MotionTarget } from "../motionDSL.js";

// ---------------------------------------------------------------------------
// CF1 — text propagates into compilerOwned.constructorFields
// ---------------------------------------------------------------------------

test("CF1: text input propagates into compilerOwned.constructorFields", () => {
  const intent = parseIntent("fade in the text");
  assert.ok(intent, "parseIntent must return a result for 'fade in the text'");

  const program = buildProgramFromIntent(intent, {
    rawInput: { text: "TESTING" },
  });

  const clip = program.clips[0];
  assert.ok(clip, "program must have at least one clip");
  assert.equal(clip.target.kind, "compilerOwned");

  const target = clip.target as Extract<MotionTarget, { kind: "compilerOwned" }>;
  assert.deepEqual(target.constructorFields, { text: "TESTING" });
});

// ---------------------------------------------------------------------------
// CF2 — existingLayerById targets never receive constructor fields
// ---------------------------------------------------------------------------

test("CF2: existingLayerById target does not receive constructorFields", () => {
  const intent = parseIntent("fade in the text");
  assert.ok(intent);

  const program = buildProgramFromIntent(intent, {
    layerId: "existing_layer_123",
    rawInput: { text: "SHOULD_NOT_APPEAR" },
  });

  const clip = program.clips[0];
  assert.equal(clip.target.kind, "existingLayerById");
  assert.ok(
    !("constructorFields" in clip.target),
    "existingLayerById target must not have constructorFields",
  );
});

// ---------------------------------------------------------------------------
// CF3 — no rawInput / empty constructorFields → field absent from target
// ---------------------------------------------------------------------------

test("CF3: absent rawInput produces target without constructorFields", () => {
  const intent = parseIntent("fade in");
  assert.ok(intent);

  const program = buildProgramFromIntent(intent);
  const clip = program.clips[0];
  assert.equal(clip.target.kind, "compilerOwned");

  const target = clip.target as Extract<MotionTarget, { kind: "compilerOwned" }>;
  assert.ok(
    target.constructorFields === undefined ||
      Object.keys(target.constructorFields).length === 0,
    "constructorFields should be absent or empty when no text is provided",
  );
});

// ---------------------------------------------------------------------------
// CF4 — emitted JS contains api.set(text) OUTSIDE the if/else branches
// ---------------------------------------------------------------------------

test("CF4: emitReconciliation emits api.set for constructorFields outside if/else branches", () => {
  const target: Extract<MotionTarget, { kind: "compilerOwned" }> = {
    kind: "compilerOwned",
    compilerLayerId: "textshape",
    layerType: "textShape",
    constructorFields: { text: "TESTING" },
  };

  const lines = emitReconciliation(target, "__t0");
  const joined = lines.join("\n");

  // Must contain api.set for the text field (compact JSON.stringify format)
  assert.ok(
    joined.includes(`api.set(__t0, {"text":"TESTING"})`),
    `Expected api.set for text field.\nGot:\n${joined}`,
  );

  // The api.set must be OUTSIDE the if/else — after the closing } of that block.
  // Find the last line that is just "}" (closes the if/else), then confirm api.set
  // appears on a line after it.
  const closingBraceLineIdx = lines.reduceRight(
    (found, line, i) => (found === -1 && line.trim() === "}" ? i : found),
    -1,
  );
  const setLineIdx = lines.findIndex((l) => l.includes(`api.set(__t0, {"text":"TESTING"})`));

  assert.ok(closingBraceLineIdx !== -1, "closing } of if/else must exist");
  assert.ok(setLineIdx !== -1, "api.set line must exist");
  assert.ok(
    setLineIdx > closingBraceLineIdx,
    `api.set must appear after the closing } of the if/else block.\n` +
      `closingBrace at line ${closingBraceLineIdx}, api.set at line ${setLineIdx}.\n` +
      `Lines:\n${lines.map((l, i) => `${i}: ${l}`).join("\n")}`,
  );
});

// ---------------------------------------------------------------------------
// CF5 — api.set fires post-resolution even in the reuse (hits.length === 1) path
// ---------------------------------------------------------------------------

test("CF5: emitReconciliation emits api.set after if/else so reuse path also sets text", () => {
  const target: Extract<MotionTarget, { kind: "compilerOwned" }> = {
    kind: "compilerOwned",
    compilerLayerId: "textshape",
    layerType: "textShape",
    constructorFields: { text: "TESTING" },
  };

  const lines = emitReconciliation(target, "__t0");

  // Locate structural landmarks
  const ifStart = lines.findIndex((l) => l.includes("hits.length === 1"));
  const elseStart = lines.findIndex((l) => l.trim() === "} else {");
  // Find the closing } of the if/else block (first bare } after elseStart)
  const closingBrace = lines.findIndex((l, i) => i > elseStart && l.trim() === "}");

  assert.ok(ifStart !== -1, "if-reuse branch must exist");
  assert.ok(elseStart !== -1, "else-create branch must exist");
  assert.ok(closingBrace !== -1, "closing } of if/else must exist");

  // api.set must appear AFTER the closing } — it fires regardless of which branch ran
  const setLineIdx = lines.findIndex((l) => l.includes("api.set(__t0,"));
  assert.ok(setLineIdx !== -1, "api.set must be emitted");
  assert.ok(
    setLineIdx > closingBrace,
    `api.set must be post-resolution (after closing } at line ${closingBrace}), ` +
      `but found at line ${setLineIdx}.\nLines:\n${lines.map((l, i) => `${i}: ${l}`).join("\n")}`,
  );

  // Neither the reuse nor create branch should contain api.set for constructor fields
  const branchLines = lines.slice(ifStart, closingBrace + 1).join("\n");
  assert.ok(
    !branchLines.includes(`api.set(__t0, {"text"`),
    `Constructor field api.set must not appear inside the if/else branches.\nGot:\n${branchLines}`,
  );
});

// ---------------------------------------------------------------------------
// CF-PIPELINE — full pipeline generates correct JS for text layer with text
// ---------------------------------------------------------------------------

test("CF-PIPELINE: full compiler pipeline emits api.set for text in generated JS", () => {
  const intent = parseIntent("fade in the text");
  assert.ok(intent);

  const program = buildProgramFromIntent(intent, {
    startFrame: 0,
    durationFrames: 40,
    rawInput: { text: "TESTING" },
  });

  const plan = compile(program);
  const exec = generate(plan);

  assert.ok(
    exec.code.includes(`api.set(`),
    "Generated code must contain api.set()",
  );
  // Compact JSON.stringify format from emitConstructorFieldLines
  assert.ok(
    exec.code.includes(`"text":"TESTING"`),
    `Generated code must set text to "TESTING" (compact format).\nGot:\n${exec.code}`,
  );
});
