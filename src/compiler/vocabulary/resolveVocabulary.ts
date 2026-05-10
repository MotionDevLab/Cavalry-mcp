/**
 * Vocabulary resolver — transforms raw natural language input into a
 * deterministic NormalizedCommand plus a full diagnostic VocabularyTrace.
 *
 * Execution order is fixed and must not be reordered:
 *   1. normalize input (lowercase + whitespace collapse)
 *   2. resolve intent
 *   3. resolve object
 *   4. resolve preset (motion)
 *   5. resolve style
 *   6. collect modifiers
 *   7. return NormalizedCommand + VocabularyTrace
 *
 * Guarantees:
 *   - Identical input always produces identical output and identical trace.
 *   - No exceptions are thrown; unknown input yields null fields.
 *   - Trace is read-only and never influences resolution logic.
 *   - Every stage is logged regardless of whether it matched.
 */

import { INTENTS, MOTIONS, MODIFIERS, OBJECTS, STYLES } from "./vocabulary.js";
import { matchAll, matchFirst, tokenize } from "./matchVocabulary.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Structured output of the vocabulary resolver.
 * All fields are null when no match was found for that dimension.
 * `modifiers` is an empty array (never null) when none matched.
 */
export interface NormalizedCommand {
  intent: string | null;
  object: string | null;
  preset: string | null;
  style: string | null;
  modifiers: string[];
}

/**
 * One step in the resolution trace. Each stage is logged exactly once,
 * except `modifier` which is logged once per matched modifier (or once
 * with `matched: null` when no modifiers are found).
 *
 * `input` — the alias/phrase that triggered the match, or the full
 *            normalized input when nothing matched (for diagnostics).
 * `source` — always "vocabulary" for this layer; "none" on failure.
 *            "alias" and "intentParser" are reserved for the intentParser
 *            wrapper to record its own resolution source.
 */
export interface VocabularyTraceStep {
  stage: "intent" | "object" | "preset" | "style" | "modifier";
  input: string;
  matched: string | null;
  source: "vocabulary" | "alias" | "intentParser" | "none";
}

/**
 * Full diagnostic record for one resolveVocabulary() call.
 * Immutable — must not be used to drive resolution logic.
 */
export interface VocabularyTrace {
  rawInput: string;
  normalizedInput: string;
  steps: VocabularyTraceStep[];
  final: NormalizedCommand;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

function normalizeInput(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Resolves `rawInput` through all five vocabulary stages in strict order.
 *
 * Never throws. Returns null fields for unknown input rather than guessing.
 * The returned `trace` is a pure diagnostic artifact; callers must not
 * branch on trace contents.
 */
export function resolveVocabulary(rawInput: string): {
  command: NormalizedCommand;
  trace: VocabularyTrace;
} {
  const fallbackInput =
    typeof rawInput === "string" && rawInput.length > 0 ? rawInput : "";
  const normalized = normalizeInput(fallbackInput);
  const tokens = tokenize(normalized);
  const steps: VocabularyTraceStep[] = [];

  // Stage 1 — intent
  const intentMatch = matchFirst(tokens, INTENTS);
  steps.push({
    stage: "intent",
    input: intentMatch !== null ? intentMatch.matchedAlias : normalized,
    matched: intentMatch !== null ? intentMatch.canonical : null,
    source: intentMatch !== null ? "vocabulary" : "none",
  });

  // Stage 2 — object
  const objectMatch = matchFirst(tokens, OBJECTS);
  steps.push({
    stage: "object",
    input: objectMatch !== null ? objectMatch.matchedAlias : normalized,
    matched: objectMatch !== null ? objectMatch.canonical : null,
    source: objectMatch !== null ? "vocabulary" : "none",
  });

  // Stage 3 — preset (motion)
  const presetMatch = matchFirst(tokens, MOTIONS);
  steps.push({
    stage: "preset",
    input: presetMatch !== null ? presetMatch.matchedAlias : normalized,
    matched: presetMatch !== null ? presetMatch.canonical : null,
    source: presetMatch !== null ? "vocabulary" : "none",
  });

  // Stage 4 — style
  const styleMatch = matchFirst(tokens, STYLES);
  steps.push({
    stage: "style",
    input: styleMatch !== null ? styleMatch.matchedAlias : normalized,
    matched: styleMatch !== null ? styleMatch.canonical : null,
    source: styleMatch !== null ? "vocabulary" : "none",
  });

  // Stage 5 — modifiers (collect all matches)
  const modifierMatches = matchAll(tokens, MODIFIERS);
  if (modifierMatches.length > 0) {
    for (const m of modifierMatches) {
      steps.push({
        stage: "modifier",
        input: m.matchedAlias,
        matched: m.canonical,
        source: "vocabulary",
      });
    }
  } else {
    steps.push({
      stage: "modifier",
      input: normalized,
      matched: null,
      source: "none",
    });
  }

  const command: NormalizedCommand = {
    intent: intentMatch !== null ? intentMatch.canonical : null,
    object: objectMatch !== null ? objectMatch.canonical : null,
    preset: presetMatch !== null ? presetMatch.canonical : null,
    style: styleMatch !== null ? styleMatch.canonical : null,
    modifiers: modifierMatches.map((m) => m.canonical),
  };

  return {
    command,
    trace: {
      rawInput,
      normalizedInput: normalized,
      steps,
      final: command,
    },
  };
}
