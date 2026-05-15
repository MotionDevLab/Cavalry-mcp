/**
 * Stallion bridge client — sends JavaScript to Cavalry via HTTP POST.
 *
 * Cavalry must have the Stallion script running (Scripts > Stallion).
 * The server listens on 127.0.0.1:8080 by default.
 *
 * Two execution surfaces:
 *   sendAuthorizedToCavalry — compiler pipeline path (NL → IR → JS)
 *                             requires a valid TrustToken from cavalryGenerator
 *   sendRawToCavalry        — debug-only path (never part of NL pipeline)
 */

import {
  consumeTrustToken,
  type AuthorizedExecution,
} from "./runtime/trustToken.js";

export interface StallionPayload {
  /** Script category: "script" for JS Editor scripts */
  type: "script" | "javaScriptShape" | "skslShader" | "renderSetupExpression";
  /** The JavaScript code to execute */
  code: string;
  /** Optional file path (used for UI scripts) */
  path?: string;
}

export interface StallionConfig {
  host: string;
  port: number;
}

const DEFAULT_CONFIG: StallionConfig = {
  host: "127.0.0.1",
  port: 8080,
};

// ---------------------------------------------------------------------------
// PRIVATE — shared implementation used by both execution surfaces
// ---------------------------------------------------------------------------

async function postScript(
  code: string,
  type: StallionPayload["type"] = "script",
  config: StallionConfig = DEFAULT_CONFIG,
): Promise<string> {
  const url = `http://${config.host}:${config.port}/post`;
  const payload: StallionPayload = { type, code };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Stallion returned ${response.status}: ${await response.text()}`,
    );
  }

  return response.text();
}

// ---------------------------------------------------------------------------
// PUBLIC — compiler execution surface (NL → IR → cavalryGenerator → here)
// ---------------------------------------------------------------------------

/**
 * Send compiler-generated JavaScript to Cavalry.
 * Requires a valid TrustToken minted by cavalryGenerator.generate().
 * Consumes the token (single-use); throws if token is invalid or already consumed.
 * Called exclusively from the cavalry_run_motion handler.
 */
export async function sendAuthorizedToCavalry(
  exec: AuthorizedExecution,
  type: StallionPayload["type"] = "script",
  config: StallionConfig = DEFAULT_CONFIG,
): Promise<string> {
  consumeTrustToken(exec.token);
  return postScript(exec.code, type, config);
}

// ---------------------------------------------------------------------------
// PUBLIC — debug execution surface (debug tool only, never NL pipeline)
// ---------------------------------------------------------------------------

/**
 * Send raw JavaScript directly to Cavalry.
 * Debug-only. Never called from the NL compiler pipeline.
 * Only reachable when CAVALRY_MCP_DEBUG=1.
 */
export async function sendRawToCavalry(
  code: string,
  type: StallionPayload["type"] = "script",
  config: StallionConfig = DEFAULT_CONFIG,
): Promise<string> {
  return postScript(code, type, config);
}

// ---------------------------------------------------------------------------
// PING
// ---------------------------------------------------------------------------

/**
 * Check if Stallion is reachable in Cavalry.
 */
export async function pingStallion(
  config: StallionConfig = DEFAULT_CONFIG,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await fetch(`http://${config.host}:${config.port}/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}
