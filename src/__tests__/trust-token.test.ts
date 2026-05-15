/**
 * G5 — TrustToken contract tests.
 *
 * Validates: unknown sessionId rejection, single-use enforcement, copy literal
 * rejection after consumption, required-for-execution check, successful path,
 * and mint-only-by-generator assertion.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  consumeTrustToken,
  __resetTrustRegistryForTests,
  type TrustToken,
} from "../runtime/trustToken.js";
import { generate } from "../compiler/cavalryGenerator.js";
import { compile } from "../compiler/motionCompiler.js";
import { canonicalize } from "../compiler/nodeRegistry.js";
import type { MotionProgram } from "../compiler/motionDSL.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function buildValidPlan() {
  const canonical = canonicalize("textShape")!;
  const program: MotionProgram = {
    version: "1",
    clips: [
      {
        id: "clip_token_test",
        target: {
          kind: "compilerOwned",
          compilerLayerId: "token_target",
          layerType: canonical,
        },
        preset: "fade_in",
        timing: { startFrame: 0, durationFrames: 24 },
      },
    ],
  } as unknown as MotionProgram;

  return compile(program);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetTrustRegistryForTests();
});

// ---------------------------------------------------------------------------
// G5-1: Unknown sessionId — registry never contained this id
// ---------------------------------------------------------------------------

test("G5: consumeTrustToken rejects unknown sessionId (never minted)", () => {
  const fakeLiteral: TrustToken = {
    sessionId: "00000000-0000-0000-0000-000000000000",
    issuedBy: "cavalryGenerator",
    timestamp: Date.now(),
  };

  assert.throws(
    () => consumeTrustToken(fakeLiteral),
    (err: unknown) =>
      err instanceof Error && err.message === "TrustToken: unknown or already-consumed token.",
    "Expected registry rejection for unknown sessionId",
  );
});

// ---------------------------------------------------------------------------
// G5-2: Single-use — consuming a valid token makes it invalid
// ---------------------------------------------------------------------------

test("G5: token is single-use — second consumption throws", () => {
  const plan = buildValidPlan();
  const exec = generate(plan);

  // First consumption: succeeds
  assert.doesNotThrow(() => consumeTrustToken(exec.token));

  // Second consumption: registry entry deleted on first consume
  assert.throws(
    () => consumeTrustToken(exec.token),
    (err: unknown) =>
      err instanceof Error && err.message === "TrustToken: unknown or already-consumed token.",
    "Second consumption must throw after single-use deletion",
  );
});

// ---------------------------------------------------------------------------
// G5-3: Copy literal after consumption — same sessionId, new object
// ---------------------------------------------------------------------------

test("G5: copy literal with same sessionId is invalid after original is consumed", () => {
  const plan = buildValidPlan();
  const exec = generate(plan);

  // Record the sessionId before consuming
  const { sessionId } = exec.token;

  // Consume the original
  consumeTrustToken(exec.token);

  // Construct a new literal with the same sessionId fields
  const copyLiteral: TrustToken = {
    sessionId,
    issuedBy: "cavalryGenerator",
    timestamp: exec.token.timestamp,
  };

  // The registry entry was deleted — the copy is also invalid
  assert.throws(
    () => consumeTrustToken(copyLiteral),
    (err: unknown) =>
      err instanceof Error && err.message === "TrustToken: unknown or already-consumed token.",
    "Copy with consumed sessionId must be rejected (registry-only model)",
  );
});

// ---------------------------------------------------------------------------
// G5-4: Invalid issuer field
// ---------------------------------------------------------------------------

test("G5: token with wrong issuedBy throws 'invalid issuer'", () => {
  const badToken = {
    sessionId: "aaaaaaaa-0000-0000-0000-000000000000",
    issuedBy: "notTheGenerator",
    timestamp: Date.now(),
  } as unknown as TrustToken;

  assert.throws(
    () => consumeTrustToken(badToken),
    (err: unknown) => err instanceof Error && err.message === "TrustToken: invalid issuer.",
    "Wrong issuedBy must throw 'invalid issuer'",
  );
});

test("G5: null/undefined token throws 'invalid issuer'", () => {
  assert.throws(
    () => consumeTrustToken(null as unknown as TrustToken),
    (err: unknown) => err instanceof Error && err.message === "TrustToken: invalid issuer.",
  );
  assert.throws(
    () => consumeTrustToken(undefined as unknown as TrustToken),
    (err: unknown) => err instanceof Error && err.message === "TrustToken: invalid issuer.",
  );
});

// ---------------------------------------------------------------------------
// G5-5: Successful path — mint via generate(), consume once
// ---------------------------------------------------------------------------

test("G5: successful path — generate() mints a valid consumable token", () => {
  const plan = buildValidPlan();
  const exec = generate(plan);

  // Token fields are structured correctly
  assert.strictEqual(typeof exec.token.sessionId, "string");
  assert.ok(exec.token.sessionId.length > 0);
  assert.strictEqual(exec.token.issuedBy, "cavalryGenerator");
  assert.strictEqual(typeof exec.token.timestamp, "number");

  // Token is consumable exactly once
  assert.doesNotThrow(() => consumeTrustToken(exec.token));
});

test("G5: generate() returns frozen AuthorizedExecution", () => {
  const plan = buildValidPlan();
  const exec = generate(plan);

  assert.ok(Object.isFrozen(exec));
  assert.strictEqual(typeof exec.code, "string");
  assert.ok(exec.code.length > 0);
});

// ---------------------------------------------------------------------------
// G5-6: Mint-only-by-generator — exactly one non-test import of mintTrustToken
// ---------------------------------------------------------------------------

test("G5: mintTrustToken has exactly one non-test import site (cavalryGenerator.ts)", () => {
  function walkTs(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkTs(full));
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts")
      ) {
        results.push(full);
      }
    }
    return results;
  }

  const allFiles = walkTs(SRC_ROOT);
  const DEFINITION_FILE = path.resolve(SRC_ROOT, "runtime", "trustToken.ts");
  const importSites = allFiles.filter((f) => {
    if (f === DEFINITION_FILE) return false;
    const source = fs.readFileSync(f, "utf-8");
    return /\bmintTrustToken\b/.test(source);
  });

  const relSites = importSites.map((f) => path.relative(SRC_ROOT, f));
  const expected = path.join("compiler", "cavalryGenerator.ts");

  assert.deepEqual(
    relSites.sort(),
    [expected].sort(),
    `mintTrustToken must appear in exactly one non-test file (cavalryGenerator.ts).\n` +
    `Found: ${relSites.join(", ")}`,
  );
});
