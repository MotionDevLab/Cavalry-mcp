/**
 * Intent parser — deterministic, vocabulary-driven text → DSL fragment.
 *
 * This layer is intentionally NOT an NLP system. It looks for known phrases
 * in the controlled vocabulary and returns `null` when nothing matches. No
 * fuzzy matching, no LLM fallback, no speculative inference.
 *
 * Higher layers may choose to call an LLM separately to translate free text
 * into a `MotionProgram`, but that is out of scope for v1.
 *
 * Vocabulary Layer integration (pre-compiler normalization):
 *   resolveVocabulary() runs FIRST. Any non-null field it returns is final
 *   and cannot be overwritten by the parser logic below. The internal
 *   VOCABULARY scan only runs when the vocabulary layer returns null for
 *   preset — it fills gaps, never overwrites resolved values.
 */

import type { IntentRecognition, PresetId } from "./motionDSL.js";
import { PRESET_IDS } from "./motionDSL.js";
import { resolveVocabulary } from "./vocabulary/resolveVocabulary.js";

interface VocabularyEntry {
  preset: PresetId;
  phrases: readonly string[];
}

const VOCABULARY: readonly VocabularyEntry[] = [
  {
    preset: "fade_in",
    phrases: ["fade in", "fadein", "fade_in", "fade-in"],
  },
  {
    preset: "bounce_in",
    phrases: ["bounce in", "bouncein", "bounce_in", "bounce-in", "bounce"],
  },
  {
    preset: "slide_left",
    phrases: [
      "slide left",
      "slide_left",
      "slide-left",
      "from right",
      "slide from right",
    ],
  },
  {
    preset: "scale_pop",
    phrases: ["scale pop", "scale_pop", "scale-pop", "pop in", "pop"],
  },
];

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function isPresetId(value: string): value is PresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}

/**
 * Returns a single recognized preset, or `null` if no controlled-vocabulary
 * phrase is present. The first matching entry wins to keep behavior stable.
 *
 * Resolution priority (Rule 1 — system hierarchy):
 *   1. Vocabulary Layer (resolveVocabulary) — highest authority
 *   2. Internal VOCABULARY scan — fallback when vocabulary returns null
 *
 * Any non-null field returned by resolveVocabulary() is immutable.
 * The internal scan only fills fields the vocabulary layer left as null.
 */
export function parseIntent(text: string): IntentRecognition | null {
  if (typeof text !== "string" || text.length === 0) return null;

  // Vocabulary layer runs first — its results are final (Rule 4)
  const { command } = resolveVocabulary(text);

  if (command.preset !== null && isPresetId(command.preset)) {
    const result: IntentRecognition = { preset: command.preset };
    if (command.object !== null) {
      result.targetHint = { name: command.object };
    }
    return result;
  }

  // Vocabulary did not resolve preset — fall back to internal scan (Rule 1)
  const normalized = normalize(text);
  for (const entry of VOCABULARY) {
    for (const phrase of entry.phrases) {
      if (normalized.includes(phrase)) {
        return { preset: entry.preset };
      }
    }
  }
  return null;
}
