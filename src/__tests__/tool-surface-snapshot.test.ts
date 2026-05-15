import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { registerTools, __resetBootstrapForTests } from "../index.js";

// ---------------------------------------------------------------------------
// Stub McpServer that records tool() registrations
// ---------------------------------------------------------------------------

class StubMcpServer {
  readonly registeredNames: string[] = [];

  tool(name: string, _desc: string, _schema: unknown, _handler: unknown): void {
    this.registeredNames.push(name);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sorted(names: string[]): string[] {
  return [...names].sort();
}

// ---------------------------------------------------------------------------
// G1: Tool surface snapshot
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetBootstrapForTests();
  delete process.env["CAVALRY_MCP_DEBUG"];
});

test("G1: production surface — exactly {cavalry_ping, cavalry_run_motion}", () => {
  const server = new StubMcpServer();
  registerTools(server as never);

  assert.deepEqual(sorted(server.registeredNames), ["cavalry_ping", "cavalry_run_motion"]);
  assert.strictEqual(server.registeredNames.length, 2);
});

test("G1: debug surface — exactly {cavalry_ping, cavalry_run_motion, cavalry_run_script}", () => {
  process.env["CAVALRY_MCP_DEBUG"] = "1";
  __resetBootstrapForTests();

  const server = new StubMcpServer();
  registerTools(server as never);

  assert.deepEqual(sorted(server.registeredNames), [
    "cavalry_ping",
    "cavalry_run_motion",
    "cavalry_run_script",
  ]);
  assert.strictEqual(server.registeredNames.length, 3);
});

test("G1: cavalry_run_script absent from production surface", () => {
  const server = new StubMcpServer();
  registerTools(server as never);

  assert.ok(!server.registeredNames.includes("cavalry_run_script"));
});

test("G1: double-call to registerTools throws", () => {
  const server = new StubMcpServer();
  registerTools(server as never);

  assert.throws(
    () => registerTools(server as never),
    (err: unknown) => err instanceof Error && err.message.includes("already invoked"),
  );
});
