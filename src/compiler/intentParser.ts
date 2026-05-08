/**
 * Intent parser — deterministic, vocabulary-driven text → DSL fragment.
 *
 * This layer is intentionally NOT an NLP system. It looks for known phrases
 * in the controlled vocabulary and returns `null` when nothing matches. No
 * fuzzy matching, no LLM fallback, no speculative inference.
 *
 * Higher layers may choose to call an LLM separately to translate free text
 * into a `MotionProgram`, but that is out of scope for v1.
 */

import type { IntentRecognition, PresetId } from "./motionDSL.js";

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

/**
 * Returns a single recognized preset, or `null` if no controlled-vocabulary
 * phrase is present. The first matching entry wins to keep behavior stable.
 */
export function parseIntent(text: string): IntentRecognition | null {
  if (typeof text !== "string" || text.length === 0) return null;
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
