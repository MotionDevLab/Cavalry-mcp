/**
 * TrustToken — execution authorization for compiler-generated JavaScript.
 *
 * A TrustToken is minted ONLY inside cavalryGenerator.generate().
 * Execution via sendAuthorizedToCavalry() requires a valid, unconsumed token.
 *
 * Security model:
 *   - Not cryptographically secure.
 *   - Valid iff sessionId is present in the runtime registry.
 *   - Single-use: consumed on execution, removed from registry.
 *   - Externally invalid unless issued and recorded in runtime registry.
 *   - No object identity or structural comparison — registry lookup only.
 */

import { randomUUID } from "node:crypto";
import type { CompiledJs } from "../compiler/cavalryGenerator.js";

export type TrustToken = {
  readonly sessionId: string;
  readonly issuedBy: "cavalryGenerator";
  readonly timestamp: number;
};

export type AuthorizedExecution = {
  readonly code: CompiledJs;
  readonly token: TrustToken;
};

// Registry holds sessionIds only. Validity is determined exclusively by
// presence in this Set.
const liveTokens = new Set<string>();

/**
 * Mint a new TrustToken. Only called from cavalryGenerator.generate().
 * No other module may import this function.
 */
export function mintTrustToken(): TrustToken {
  const token: TrustToken = Object.freeze({
    sessionId: randomUUID(),
    issuedBy: "cavalryGenerator",
    timestamp: Date.now(),
  });
  liveTokens.add(token.sessionId);
  return token;
}

/**
 * Consume a TrustToken, authorizing one execution.
 * Throws if the token was never minted, is already consumed, or has an
 * invalid issuer field. Validity is determined solely by sessionId lookup.
 */
export function consumeTrustToken(token: TrustToken): void {
  if (
    !token ||
    token.issuedBy !== "cavalryGenerator" ||
    typeof token.sessionId !== "string"
  ) {
    throw new Error("TrustToken: invalid issuer.");
  }
  // Registry-only check — no object identity or structural comparison.
  if (!liveTokens.has(token.sessionId)) {
    throw new Error("TrustToken: unknown or already-consumed token.");
  }
  liveTokens.delete(token.sessionId);
}

// ---------------------------------------------------------------------------
// TEST ISOLATION — not for production use
// ---------------------------------------------------------------------------

/** Reset the registry between tests. Must not be called from production code. */
export function __resetTrustRegistryForTests(): void {
  liveTokens.clear();
}
