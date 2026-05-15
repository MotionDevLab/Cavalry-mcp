/**
 * G3 — Compiler Emission Guard.
 *
 * Enforces the invariant that executable Cavalry JS (api.* template literal
 * construction or direct TypeScript api.* calls) may only appear in:
 *   - src/compiler/cavalryGenerator.ts
 *   - src/compiler/sceneIdentityResolver.ts
 *   - src/schema/probeAttribute.ts  (debug schema-probe utility; routes through sendRawToCavalry)
 *
 * Approach: TypeScript AST walk. Template literal text nodes and direct
 * CallExpression nodes are checked for api.* patterns. Plain string literals
 * and comments are NOT flagged (they are documentation, not JS construction).
 *
 * Also asserts that mintTrustToken has exactly one non-test import in src/.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EMISSION_ALLOWLIST = new Set([
  path.resolve(SRC_ROOT, "compiler", "cavalryGenerator.ts"),
  path.resolve(SRC_ROOT, "compiler", "sceneIdentityResolver.ts"),
  path.resolve(SRC_ROOT, "schema", "probeAttribute.ts"),
]);

// Matches Cavalry api.* calls that appear in generated JS strings
const API_PATTERN =
  /\bapi\.(create|set|keyframe|magicEasing|get|getAllSceneLayers|getNiceName|layerExists|log)\b/;

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// AST check: does this file contain api.* inside template literal text spans
// or as a direct TypeScript CallExpression?
// ---------------------------------------------------------------------------

interface ApiViolation {
  file: string;
  line: number;
  kind: "template-literal" | "direct-call";
  text: string;
}

function findApiViolations(filePath: string): ApiViolation[] {
  const source = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

  const violations: ApiViolation[] = [];

  function visit(node: ts.Node): void {
    // Check template literal text spans — these construct Cavalry JS strings.
    if (
      node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      const text = node.getText(sourceFile);
      if (API_PATTERN.test(text)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push({
          file: filePath,
          line: line + 1,
          kind: "template-literal",
          text: text.slice(0, 120),
        });
      }
    }

    // Check direct TypeScript CallExpression where callee is api.*
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "api"
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      violations.push({
        file: filePath,
        line: line + 1,
        kind: "direct-call",
        text: node.getText(sourceFile).slice(0, 120),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

// ---------------------------------------------------------------------------
// G3: emission allowlist enforcement
// ---------------------------------------------------------------------------

test("G3: allowlist files exist on disk", () => {
  for (const allowed of EMISSION_ALLOWLIST) {
    assert.ok(fs.existsSync(allowed), `Allowlist file missing: ${allowed}. Moving emission sources requires updating EMISSION_ALLOWLIST.`);
  }
});

test("G3: non-allowlist files contain no api.* template literals or direct calls", () => {
  const allFiles = walkTs(SRC_ROOT);
  const violations: ApiViolation[] = [];

  for (const file of allFiles) {
    if (EMISSION_ALLOWLIST.has(file)) continue;
    violations.push(...findApiViolations(file));
  }

  const report = violations
    .map((v) => `  ${path.relative(SRC_ROOT, v.file)}:${v.line} [${v.kind}] ${v.text}`)
    .join("\n");

  assert.strictEqual(
    violations.length,
    0,
    `api.* emission found outside allowlist:\n${report}\n` +
    `To fix: move emission to cavalryGenerator.ts or sceneIdentityResolver.ts, ` +
    `or add the file to EMISSION_ALLOWLIST with justification.`,
  );
});

// ---------------------------------------------------------------------------
// G3: mintTrustToken import site enforcement
// ---------------------------------------------------------------------------

test("G3: mintTrustToken has exactly one non-test import in src/", () => {
  const allFiles = walkTs(SRC_ROOT);
  // Exclude the definition file itself (trustToken.ts exports mintTrustToken)
  const DEFINITION_FILE = path.resolve(SRC_ROOT, "runtime", "trustToken.ts");
  const importSites: string[] = [];

  for (const file of allFiles) {
    if (file === DEFINITION_FILE) continue;
    const source = fs.readFileSync(file, "utf-8");
    if (/\bmintTrustToken\b/.test(source)) {
      importSites.push(file);
    }
  }

  const relSites = importSites.map((f) => path.relative(SRC_ROOT, f));
  const expected = path.relative(SRC_ROOT, path.resolve(SRC_ROOT, "compiler", "cavalryGenerator.ts"));

  assert.deepEqual(
    relSites.sort(),
    [expected].sort(),
    `mintTrustToken must be imported/used in exactly one non-test file (cavalryGenerator.ts).\n` +
    `Found: ${relSites.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// G3: CompiledJs cast-site enforcement
// ---------------------------------------------------------------------------

test("G3: CompiledJs brand has exactly one non-test cast site (cavalryGenerator.ts)", () => {
  const allFiles = walkTs(SRC_ROOT);
  const GENERATOR_FILE = path.resolve(SRC_ROOT, "compiler", "cavalryGenerator.ts");
  const castSites: string[] = [];

  for (const file of allFiles) {
    const source = fs.readFileSync(file, "utf-8");
    // Match: `as CompiledJs` — the only sanctioned brand-mint cast
    if (/\bas\s+CompiledJs\b/.test(source)) {
      castSites.push(file);
    }
  }

  const relSites = castSites.map((f) => path.relative(SRC_ROOT, f));
  const expected = path.relative(SRC_ROOT, GENERATOR_FILE);

  assert.deepEqual(
    relSites.sort(),
    [expected].sort(),
    `"as CompiledJs" cast must appear in exactly one non-test file (cavalryGenerator.ts).\n` +
    `Found: ${relSites.join(", ")}\n` +
    `Casting arbitrary strings to CompiledJs outside the generator is a contract violation.`,
  );
});

test("G3: trustToken.ts exports mintTrustToken (confirming the module exists and is named correctly)", () => {
  const tokenPath = path.resolve(SRC_ROOT, "runtime", "trustToken.ts");
  assert.ok(fs.existsSync(tokenPath), `trustToken.ts not found at ${tokenPath}`);

  const source = fs.readFileSync(tokenPath, "utf-8");
  assert.ok(/export function mintTrustToken/.test(source), "mintTrustToken not exported from trustToken.ts");
});
