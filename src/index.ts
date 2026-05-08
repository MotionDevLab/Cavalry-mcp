#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sendToCavalry, pingStallion } from "./stallion.js";

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
// TOOL: RUN SCRIPT (ONLY EXECUTION PATH)
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_run_script",
  "Execute raw JavaScript inside Cavalry via Stallion. Use console.log for debugging.",
  {
    code: z.string().min(1),
  },
  async ({ code }) => {
    const result = await runScript(code);

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
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
