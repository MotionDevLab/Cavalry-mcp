#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  sendAuthorizedToCavalry,
  sendRawToCavalry,
  pingStallion,
} from "./stallion.js";
import type { AuthorizedExecution } from "./compiler/cavalryGenerator.js";
import { parseIntent } from "./compiler/intentParser.js";
import { buildProgramFromIntent } from "./compiler/buildProgram.js";
import { compile } from "./compiler/motionCompiler.js";
import { generate } from "./compiler/cavalryGenerator.js";

// ---------------------------------------------------------------------------
// ROUTING CONTRACT (enforced here, not in the compiler)
//
//   Natural language motion requests  →  cavalry_run_motion
//   Raw JS debugging / manual scripts →  cavalry_run_script (debug only)
//
// cavalry_run_motion is the ONLY path that routes NL through the compiler.
// cavalry_run_script is an unsafe bypass exposed ONLY when CAVALRY_MCP_DEBUG=1.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const LOG_DEBUG = process.env.CAVALRY_MCP_LOG === "1";

// ---------------------------------------------------------------------------
// SAFETY LAYER (Node-only risks, NOT Cavalry JS)
// ---------------------------------------------------------------------------
const forbiddenPatterns = [
  "process.exit",
  "child_process",
  "require(",
  "fs.",
  "net.",
];

function validateCode(code: string) {
  for (const pattern of forbiddenPatterns) {
    if (code.includes(pattern)) {
      throw new Error(`Blocked unsafe MCP output: ${pattern}`);
    }
  }
}

// ---------------------------------------------------------------------------
// DEBUG LOGGING
// ---------------------------------------------------------------------------
function logCode(code: string) {
  if (!LOG_DEBUG) return;
  console.log("\n=== STALLION CODE START ===");
  console.log(code);
  console.log("=== STALLION CODE END ===\n");
}

// ---------------------------------------------------------------------------
// EXECUTION — compiler-authorized path (cavalry_run_motion only)
// ---------------------------------------------------------------------------
async function runCompiled(exec: AuthorizedExecution): Promise<string> {
  try {
    validateCode(exec.code.trim());
    logCode(exec.code);
    const result = await sendAuthorizedToCavalry(exec, "script");
    return result || "Script executed successfully.";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ECONNREFUSED")) {
      return "Error: Cannot connect to Cavalry. Ensure Cavalry is running and Stallion is active (Scripts > Stallion).";
    }
    return `Error: ${message}`;
  }
}

// ---------------------------------------------------------------------------
// EXECUTION — raw debug path (cavalry_run_script only, debug surface)
// ---------------------------------------------------------------------------
async function runRaw(code: string): Promise<string> {
  try {
    const cleanCode = code.trim();
    validateCode(cleanCode);
    logCode(cleanCode);
    const result = await sendRawToCavalry(cleanCode, "script");
    return result || "Script executed successfully.";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ECONNREFUSED")) {
      return "Error: Cannot connect to Cavalry. Ensure Cavalry is running and Stallion is active (Scripts > Stallion).";
    }
    return `Error: ${message}`;
  }
}

// ---------------------------------------------------------------------------
// HANDLERS — exported for testing
// ---------------------------------------------------------------------------

export async function handlePing(): Promise<{
  content: { type: "text"; text: string }[];
}> {
  const reachable = await pingStallion();
  return {
    content: [
      {
        type: "text",
        text: reachable
          ? "Cavalry is reachable via Stallion."
          : "Cavalry is NOT reachable. Start Cavalry and enable Stallion.",
      },
    ],
  };
}

export async function handleRunMotion(params: {
  prompt: string;
  layerId?: string;
  startFrame?: number;
  durationFrames?: number;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const { prompt, layerId, startFrame, durationFrames } = params;

  // STAGE 1 — Intent parsing (controlled vocabulary only, no LLM fallback)
  const intent = parseIntent(prompt);
  if (intent === null) {
    return {
      content: [
        {
          type: "text",
          text: [
            "Compiler error: unrecognised animation intent.",
            `Input: "${prompt}"`,
            "Supported presets: fade_in, bounce_in, slide_left, scale_pop.",
            "Cavalry was NOT contacted.",
          ].join("\n"),
        },
      ],
    };
  }

  // STAGES 2–5 — buildProgram → compile → generate (deterministic, no Stallion)
  let exec: AuthorizedExecution;
  try {
    const program = buildProgramFromIntent(intent, {
      layerId,
      startFrame,
      durationFrames,
    });
    const plan = compile(program);
    exec = generate(plan);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: [
            "Compiler error: pipeline rejected this motion request.",
            `Reason: ${message}`,
            "Cavalry was NOT contacted.",
          ].join("\n"),
        },
      ],
    };
  }

  // STAGE 6 — Execute (only reached when compiler succeeds)
  const result = await runCompiled(exec);
  return {
    content: [{ type: "text", text: result }],
  };
}

export async function handleRunScript(params: {
  rawJs: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const result = await runRaw(params.rawJs);
  return {
    content: [{ type: "text", text: result }],
  };
}

// ---------------------------------------------------------------------------
// TOOL SCHEMAS (defined here to keep registerTools readable)
// ---------------------------------------------------------------------------

const MOTION_SCHEMA = {
  prompt: z
    .string()
    .min(1)
    .describe("Natural-language animation description, e.g. 'bounce in the title'"),
  layerId: z
    .string()
    .optional()
    .describe("Existing Cavalry layer id to animate. Omit to create/reconcile a compiler-owned layer."),
  startFrame: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Animation start frame (default 0)"),
  durationFrames: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Animation duration in frames (default 24)"),
} as const;

const SCRIPT_SCHEMA = {
  rawJs: z.string().min(1).describe("Raw JavaScript to execute directly in Cavalry."),
} as const;

// ---------------------------------------------------------------------------
// TOOL REGISTRY BOOTSTRAP
//
// All server.tool() calls MUST live exclusively in this function.
// new McpServer() MUST live exclusively in main().
// This function MUST be called exactly once per process lifecycle.
// ---------------------------------------------------------------------------

let bootstrapped = false;

export function registerTools(server: McpServer): void {
  if (bootstrapped) {
    throw new Error(
      "registerTools: already invoked. Tool registry is bootstrap-only and single-call.",
    );
  }
  bootstrapped = true;

  // TOOL: PING
  server.tool(
    "cavalry_ping",
    "Check if Cavalry and Stallion are reachable",
    {},
    handlePing,
  );

  // TOOL: RUN MOTION  ← NL execution path
  //
  // Required path for all natural language motion requests.
  // Enforces: prompt → intentParser → compile → generate → Stallion
  // Fail-fast: any compiler stage error is returned; Stallion is never contacted.
  server.tool(
    "cavalry_run_motion",
    [
      "Execute a natural-language motion request through the compiler pipeline.",
      "This is the required path for NL → Cavalry animation.",
      "The prompt is routed through intentParser → compile → generate before reaching Cavalry.",
      "Recognised presets: fade_in, bounce_in, slide_left, scale_pop.",
      "Supply layerId to animate an existing layer; omit it to create/reconcile a compiler-owned layer.",
      "For raw JS debugging or manual scripting use cavalry_run_script instead (requires CAVALRY_MCP_DEBUG=1).",
    ].join(" "),
    MOTION_SCHEMA,
    (params) => handleRunMotion(params),
  );

  // TOOL: RUN SCRIPT  ← debug / manual / raw bypass
  //
  // UNSAFE BYPASS — skips the compiler entirely.
  // Only registered when CAVALRY_MCP_DEBUG=1.
  // NEVER use for natural language motion requests.
  if (process.env.CAVALRY_MCP_DEBUG === "1") {
    server.tool(
      "cavalry_run_script",
      [
        "[DEBUG-ONLY raw JS passthrough — hidden unless CAVALRY_MCP_DEBUG=1. Never use for NL motion. Use cavalry_run_motion.]",
        "UNSAFE BYPASS: execute raw JavaScript directly inside Cavalry via Stallion.",
        "Skips the compiler pipeline entirely — no intent parsing, no validation, no preset safety.",
        "Use for manual API probing, debug scripts, and verified raw JS only.",
        "Note: use api.log() for Cavalry-side debugging, not console.log.",
      ].join(" "),
      SCRIPT_SCHEMA,
      (params) => handleRunScript(params),
    );
  }
}

// ---------------------------------------------------------------------------
// TEST ISOLATION — not for production use
// Tests that invoke registerTools() multiple times must call this during
// setup/teardown to avoid module-cache leakage between test cases.
// No production code may call __resetBootstrapForTests().
// ---------------------------------------------------------------------------
export function __resetBootstrapForTests(): void {
  bootstrapped = false;
}

// ---------------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------------
async function main() {
  const server = new McpServer({
    name: "cavalry-mcp",
    version: "1.0.0",
  });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start the server when this file is the process entry point.
// Importing index.ts in tests must NOT start the MCP server or its transports.
import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Failed to start cavalry-mcp:", err);
    process.exit(1);
  });
}
