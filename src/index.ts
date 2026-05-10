#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sendToCavalry, pingStallion } from "./stallion.js";
import { parseIntent } from "./compiler/intentParser.js";
import { buildProgramFromIntent } from "./compiler/buildProgram.js";
import { compile } from "./compiler/motionCompiler.js";
import { generate } from "./compiler/cavalryGenerator.js";

// ---------------------------------------------------------------------------
// ROUTING CONTRACT (enforced here, not in the compiler)
//
//   Natural language motion requests  →  cavalry_run_motion
//   Raw JS debugging / manual scripts →  cavalry_run_script
//
// cavalry_run_motion is the ONLY path that routes NL through the compiler.
// cavalry_run_script is an unsafe bypass that MUST NOT be used for NL motion.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const DEBUG = true;

// ---------------------------------------------------------------------------
// MCP SERVER
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "cavalry-mcp",
  version: "1.0.0",
});

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
  if (!DEBUG) return;
  console.log("\n=== STALLION CODE START ===");
  console.log(code);
  console.log("=== STALLION CODE END ===\n");
}

// ---------------------------------------------------------------------------
// EXECUTION (RAW PASS-THROUGH to Stallion)
// Shared by both tools — validates Node-safety patterns then dispatches.
// ---------------------------------------------------------------------------
async function runScript(code: string): Promise<string> {
  try {
    const cleanCode = code.trim();
    validateCode(cleanCode);
    logCode(cleanCode);
    const result = await sendToCavalry(cleanCode, "script");
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
// TOOL: PING
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_ping",
  "Check if Cavalry and Stallion are reachable",
  {},
  async () => {
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
  },
);

// ---------------------------------------------------------------------------
// TOOL: RUN MOTION  ← NL execution path
//
// This is the default path for all natural language motion requests.
// It enforces the full compiler pipeline:
//   prompt → intentParser → buildProgramFromIntent → compile → generate → Stallion
//
// Fail-fast: any compiler stage error is returned immediately.
// Stallion is NEVER called when the compiler rejects input.
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_run_motion",
  [
    "Execute a natural-language motion request through the compiler pipeline.",
    "This is the required path for NL → Cavalry animation.",
    "The prompt is routed through intentParser → compile → generate before reaching Cavalry.",
    "Recognised presets: fade_in, bounce_in, slide_left, scale_pop.",
    "Supply layerId to animate an existing layer; omit it to create/reconcile a compiler-owned layer.",
    "For raw JS debugging or manual scripting use cavalry_run_script instead.",
  ].join(" "),
  {
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
  },
  async ({ prompt, layerId, startFrame, durationFrames }) => {
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
    let js: string;
    try {
      const program = buildProgramFromIntent(intent, {
        layerId,
        startFrame,
        durationFrames,
      });
      const plan = compile(program);
      js = generate(plan);
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
    const result = await runScript(js);
    return {
      content: [{ type: "text", text: result }],
    };
  },
);

// ---------------------------------------------------------------------------
// TOOL: RUN SCRIPT  ← debug / manual / raw bypass
//
// UNSAFE BYPASS — skips the compiler entirely.
// Use only for:
//   • manual Cavalry API probing
//   • debug scripts where you control every line
//   • verified scripts that have already been validated outside this pipeline
//
// DO NOT use for natural language motion requests. Use cavalry_run_motion.
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_run_script",
  [
    "UNSAFE BYPASS: execute raw JavaScript directly inside Cavalry via Stallion.",
    "Skips the compiler pipeline entirely — no intent parsing, no validation, no preset safety.",
    "Use for manual API probing, debug scripts, and verified raw JS only.",
    "For natural-language motion requests use cavalry_run_motion instead.",
    "Note: use api.log() for Cavalry-side debugging, not console.log.",
  ].join(" "),
  {
    code: z.string().min(1),
  },
  async ({ code }) => {
    const result = await runScript(code);
    return {
      content: [{ type: "text", text: result }],
    };
  },
);

// ---------------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start cavalry-mcp:", err);
  process.exit(1);
});
