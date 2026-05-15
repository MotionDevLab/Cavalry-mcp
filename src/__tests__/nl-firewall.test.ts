/**
 * G4 — NL Firewall.
 *
 * Verifies that:
 *   1. Unrecognised NL input returns "Cavalry was NOT contacted" without touching the network.
 *   2. Valid preset NL input reaches the network layer (compiler accepted it).
 *   3. Source-level: handleRunMotion never calls sendRawToCavalry (architectural separation).
 *   4. Source-level: handleRunScript is the only function that calls sendRawToCavalry.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { handleRunMotion } from "../index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.resolve(__dirname, "..", "index.ts");

// ---------------------------------------------------------------------------
// G4-1: Unknown NL input — compiler rejects, Cavalry never contacted
// ---------------------------------------------------------------------------

test("G4: nonsense prompt returns 'Cavalry was NOT contacted'", async () => {
  const result = await handleRunMotion({ prompt: "xyz nonsense gibberish" });
  const text = result.content[0].text;
  assert.ok(
    text.includes("Cavalry was NOT contacted"),
    `Expected "Cavalry was NOT contacted" in response. Got: ${text}`,
  );
});

test("G4: empty-like prompt returns 'Cavalry was NOT contacted'", async () => {
  const result = await handleRunMotion({ prompt: "do a barrel roll" });
  const text = result.content[0].text;
  assert.ok(
    text.includes("Cavalry was NOT contacted"),
    `Expected "Cavalry was NOT contacted" in response. Got: ${text}`,
  );
});

// ---------------------------------------------------------------------------
// G4-2: Valid preset — compiler accepts, execution is attempted
//        (connection refused is expected in test env; the point is the compiler
//         did NOT short-circuit with "Cavalry was NOT contacted")
// ---------------------------------------------------------------------------

const VALID_PRESETS = ["fade in the title", "bounce in the logo", "slide left element", "scale pop it"];

for (const prompt of VALID_PRESETS) {
  test(`G4: valid preset "${prompt}" reaches execution layer (not rejected by compiler)`, async () => {
    const result = await handleRunMotion({ prompt });
    const text = result.content[0].text;

    // If compiler accepted the intent, either the script runs (Cavalry running)
    // or we get ECONNREFUSED. Either way, "Cavalry was NOT contacted" must be absent.
    assert.ok(
      !text.includes("Cavalry was NOT contacted"),
      `Valid preset "${prompt}" was incorrectly rejected by compiler. Response: ${text}`,
    );
  });
}

// ---------------------------------------------------------------------------
// G4-3: Source-level — handleRunMotion body must not reference sendRawToCavalry
// ---------------------------------------------------------------------------

test("G4 (source): handleRunMotion does not call sendRawToCavalry", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf-8");

  // Extract the handleRunMotion function body by finding its declaration and
  // its closing brace, then checking for sendRawToCavalry within that span.
  const startMarker = "export async function handleRunMotion(";
  const startIdx = source.indexOf(startMarker);
  assert.ok(startIdx !== -1, "handleRunMotion not found in index.ts");

  // Find the function body by counting braces from the opening `{`
  let braceDepth = 0;
  let inBody = false;
  let endIdx = startIdx;

  for (let i = startIdx; i < source.length; i++) {
    if (source[i] === "{") {
      braceDepth++;
      inBody = true;
    } else if (source[i] === "}") {
      braceDepth--;
      if (inBody && braceDepth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  const functionBody = source.slice(startIdx, endIdx);
  assert.ok(
    !functionBody.includes("sendRawToCavalry"),
    "handleRunMotion must not call sendRawToCavalry — NL pipeline is architecturally separated from raw execution.",
  );
});

// ---------------------------------------------------------------------------
// G4-4: Source-level — sendRawToCavalry is used only in handleRunScript / runRaw
// ---------------------------------------------------------------------------

test("G4 (source): sendRawToCavalry call sites appear only in debug execution path", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf-8");

  // Only look at actual call sites: lines containing sendRawToCavalry( (with parenthesis)
  // This excludes import declarations, destructured names, and comments.
  const lines = source.split("\n");
  const callSites = lines
    .map((line, i) => ({ line, i: i + 1 }))
    .filter(
      ({ line }) =>
        line.includes("sendRawToCavalry(") &&
        !line.trimStart().startsWith("//") &&
        !line.trimStart().startsWith("*"),
    );

  // Every call site must be inside runRaw or handleRunScript (the debug-only functions)
  for (const { line, i } of callSites) {
    // We check the enclosing context by looking up for the nearest function declaration.
    // Since the source is small, we walk backward from i to find the function.
    const precedingLines = lines.slice(0, i - 1);
    const fnLine = [...precedingLines].reverse().find(
      (l) => l.match(/^(async function|function|export async function)\s+/) !== null,
    );
    const fnName = fnLine?.match(/function\s+(\w+)/)?.[1] ?? "unknown";

    assert.ok(
      fnName === "runRaw" || fnName === "handleRunScript",
      `sendRawToCavalry() at line ${i} is inside "${fnName}", expected "runRaw" or "handleRunScript".\n` +
      `Line: "${line.trim()}"`,
    );
  }

  // Guard: at least one call site must exist (check doesn't silently no-op)
  assert.ok(
    callSites.length > 0,
    "No sendRawToCavalry() call sites found in index.ts — debug path may have been accidentally removed",
  );
});
