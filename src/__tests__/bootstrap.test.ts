import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { fileURLToPath } from "node:url";

import { registerTools, __resetBootstrapForTests } from "../index.js";

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.resolve(__dirname, "..", "index.ts");

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Returns the name of the nearest enclosing function-like declaration for a node.
 * Returns null if the node is at module scope.
 */
function enclosingFunctionName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text;
      }
      // Walk up further for named variable declarations
      const parent = current.parent;
      if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
      return "<anonymous>";
    }
    current = current.parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// G2: AST-primary enforcement — server.tool() only inside registerTools
//                                new McpServer() only inside main
// ---------------------------------------------------------------------------

test("G2 (AST): server.tool() calls appear only inside registerTools()", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf-8");
  const sourceFile = ts.createSourceFile(INDEX_PATH, source, ts.ScriptTarget.Latest, true);

  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "tool"
    ) {
      const fn = enclosingFunctionName(node);
      if (fn !== "registerTools") {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`server.tool() at line ${line + 1} is inside "${fn ?? "module scope"}", expected "registerTools"`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  assert.strictEqual(
    violations.length,
    0,
    `AST violations found:\n${violations.join("\n")}`,
  );
});

test("G2 (AST): new McpServer() appears only inside main()", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf-8");
  const sourceFile = ts.createSourceFile(INDEX_PATH, source, ts.ScriptTarget.Latest, true);

  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "McpServer"
    ) {
      const fn = enclosingFunctionName(node);
      if (fn !== "main") {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`new McpServer() at line ${line + 1} is inside "${fn ?? "module scope"}", expected "main"`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  assert.strictEqual(
    violations.length,
    0,
    `AST violations found:\n${violations.join("\n")}`,
  );
});

test("G2 (grep, defense-in-depth): server.tool() appears in index.ts source", () => {
  // Confirm the grep layer would find server.tool() references (sanity check)
  const source = fs.readFileSync(INDEX_PATH, "utf-8");
  assert.ok(/server\.tool\(/.test(source), "Expected server.tool() references in index.ts");
});

test("G2 (grep, defense-in-depth): new McpServer() appears in index.ts source", () => {
  const source = fs.readFileSync(INDEX_PATH, "utf-8");
  assert.ok(/new McpServer\(/.test(source), "Expected new McpServer() reference in index.ts");
});

// ---------------------------------------------------------------------------
// G2: Idempotency — registerTools throws on double-call
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetBootstrapForTests();
  delete process.env["CAVALRY_MCP_DEBUG"];
});

class StubMcpServer {
  tool(_name: string, _desc: string, _schema: unknown, _handler: unknown): void {}
}

test("G2 (idempotency): registerTools throws on second call without reset", () => {
  const server = new StubMcpServer();
  registerTools(server as never);

  assert.throws(
    () => registerTools(server as never),
    (err: unknown) => err instanceof Error && err.message.includes("already invoked"),
  );
});

test("G2 (idempotency): __resetBootstrapForTests allows re-registration", () => {
  const server = new StubMcpServer();
  registerTools(server as never);

  __resetBootstrapForTests();

  assert.doesNotThrow(() => registerTools(server as never));
});
