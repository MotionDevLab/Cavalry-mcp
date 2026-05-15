/**
 * Constructor field mapping — unit tests for resolveConstructorAttr.
 *
 *   CMAP-1 — confirmed mapping returns the expected Cavalry attribute path(s)
 *   CMAP-2 — unknown layerType throws with a diagnostic message
 *   CMAP-3 — PROVISIONAL mapping throws with a phase-gate message
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveConstructorAttr,
  CONSTRUCTOR_FIELD_MAPPING,
} from "../constructorFieldMapping.js";

// ---------------------------------------------------------------------------
// CMAP-1 — confirmed mapping returns Phase 2A confirmed path
// ---------------------------------------------------------------------------

test("CMAP-1: resolveConstructorAttr returns confirmed Cavalry path for textShape.text", () => {
  const result = resolveConstructorAttr("textShape", "text");
  // Phase 2A confirmed 2026-05-15: "text" maps to Cavalry attribute "text"
  assert.deepEqual(result, ["text"]);
});

// ---------------------------------------------------------------------------
// CMAP-2 — unknown layerType throws
// ---------------------------------------------------------------------------

test("CMAP-2: resolveConstructorAttr throws for unknown layerType", () => {
  assert.throws(
    () => resolveConstructorAttr("unknownShape", "text"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes("No mapping for layerType"),
        `Expected 'No mapping for layerType' in error message.\nGot: ${err.message}`,
      );
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// CMAP-3 — PROVISIONAL mapping throws
// ---------------------------------------------------------------------------

test("CMAP-3: resolveConstructorAttr throws when mapping value is __PROVISIONAL__", () => {
  // Temporarily shadow the mapping to inject a PROVISIONAL entry for testing.
  // We reach into the module-level constant via a type cast — test-only.
  const original = (
    CONSTRUCTOR_FIELD_MAPPING as Record<string, Record<string, string | string[]>>
  )["textShape"]["text"];

  (CONSTRUCTOR_FIELD_MAPPING as Record<string, Record<string, string | string[]>>)[
    "textShape"
  ]["text"] = "__PROVISIONAL__";

  try {
    assert.throws(
      () => resolveConstructorAttr("textShape", "text"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("PROVISIONAL"),
          `Expected 'PROVISIONAL' in error message.\nGot: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    // Restore the original confirmed mapping
    (CONSTRUCTOR_FIELD_MAPPING as Record<string, Record<string, string | string[]>>)[
      "textShape"
    ]["text"] = original;
  }
});
