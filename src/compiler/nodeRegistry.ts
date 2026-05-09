/**
 * Node Registry
 *
 * TWO STRICTLY SEPARATE SYSTEMS LIVE IN THIS FILE.
 * They have different purposes, different consumers, and must never be merged.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  PIPELINE ORDER (enforced by callers, not enforced here):   │
 * │                                                             │
 * │  raw input → canonicalize() → validateClip() → generator   │
 * │                                                             │
 * │  canonicalize  = pre-validation UX normalization only       │
 * │  validateClip  = strict invariant check, no correction      │
 * │  generator     = receives only CanonicalNodeType values     │
 * └─────────────────────────────────────────────────────────────┘
 */

// ---------------------------------------------------------------------------
// SYSTEM 1 — Canonical registry (compiler truth)
//
// These are the ONLY node type strings the compiler pipeline accepts.
// Anything not in this list is structurally invalid at the compiler level.
//
// Rules:
//   - Canonical types are verified Cavalry runtime node types.
//   - They are the single source of truth for validators and the generator.
//   - They are NEVER derived from aliases, training data, or inference.
//   - Adding a type here requires confirmed runtime verification.
// ---------------------------------------------------------------------------

export const CANONICAL_NODE_TYPES = [
  "textShape",
] as const;

export type CanonicalNodeType = (typeof CANONICAL_NODE_TYPES)[number];

/**
 * Returns true only for strings present in CANONICAL_NODE_TYPES.
 *
 * Used by:
 *   - validateClip()  — rejects any non-canonical layerType
 *   - cavalryGenerator — guards before emitting api.create()
 *
 * Does NOT resolve aliases. Alias resolution is the sole responsibility
 * of canonicalize() and must happen BEFORE this guard is called.
 */
export function isCanonicalNodeType(value: unknown): value is CanonicalNodeType {
  return (
    typeof value === "string" &&
    (CANONICAL_NODE_TYPES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// SYSTEM 2 — Alias map (pre-compiler UX normalization layer ONLY)
//
// Purpose: allow natural language inputs and common mis-spellings to be
// resolved to a CanonicalNodeType at the system input boundary — BEFORE
// any compiler logic runs.
//
// Rules:
//   - Aliases are UX convenience only. They are NOT compiler truth.
//   - They are NOT part of the validated type ontology.
//   - They are NOT extended based on runtime inference or semantic drift.
//   - They are resolved by canonicalize() ONLY — never inside the compiler,
//     the validator, or the generator.
//   - The validator MUST NOT call canonicalize(). It checks canonical types
//     directly via isCanonicalNodeType(). If a non-canonical value reaches
//     the validator, it throws — it does not fall back or correct.
//   - Aliases exist to absorb UX variation at the boundary so that the
//     compiler pipeline remains deterministic and alias-free downstream.
// ---------------------------------------------------------------------------

export const ALIAS_MAP: Readonly<Record<string, CanonicalNodeType>> = {
  text: "textShape",
  textLayer: "textShape",
  basicText: "textShape",
};

/**
 * Resolves a raw input string to a CanonicalNodeType, or returns null.
 *
 * This is a PRE-VALIDATION transformation step. It must be called at the
 * system input boundary — before validateClip() or any compiler stage.
 *
 * Resolution order:
 *   1. If input is already a CanonicalNodeType → return it unchanged.
 *   2. If input matches an ALIAS_MAP entry → return the canonical target.
 *   3. Otherwise → return null (caller must reject the input).
 *
 * Null means the input is unknown to both the canonical registry and the
 * alias map. The caller is responsible for surfacing the error. This
 * function never guesses, infers, or fuzzy-matches.
 *
 * NOT for use inside validators, compiler stages, or the generator.
 * Those layers operate exclusively on CanonicalNodeType values.
 */
export function canonicalize(input: string): CanonicalNodeType | null {
  if (isCanonicalNodeType(input)) return input;
  const resolved = ALIAS_MAP[input];
  return resolved ?? null;
}
