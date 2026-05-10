/**
 * Vocabulary matching engine.
 *
 * Matching rules (all are hard constraints):
 *   - Input is pre-normalized to lowercase before reaching this module.
 *   - Tokenization splits on whitespace only — no punctuation stripping.
 *   - Matching is exact token equality OR exact consecutive-token phrase equality.
 *   - NO substring matching: "text" does NOT match inside "textShape".
 *   - NO fuzzy matching, NO edit distance, NO semantic similarity.
 *   - Iteration follows array order; first matching alias wins.
 *   - Deterministic: identical tokens always produce identical output.
 */

import type { VocabularyEntry } from "./vocabulary.js";

export interface MatchResult {
  /** Normalized canonical value for this entry. */
  readonly canonical: string;
  /** The specific alias string that triggered this match. */
  readonly matchedAlias: string;
}

/**
 * Splits a normalized (already lowercase, whitespace-collapsed) string into
 * tokens by splitting on single spaces. Empty tokens are discarded.
 */
export function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length > 0);
}

/**
 * Tests whether `phrase` (a single alias) matches within `tokens`.
 *
 * Single-token phrase: exact membership check (tokens.includes).
 * Multi-token phrase: all phrase tokens must appear consecutively in `tokens`
 *                     at the same position (no gaps, no partial overlap).
 *
 * No substring matching is performed at any point.
 */
function matchPhrase(tokens: readonly string[], phrase: string): boolean {
  const phraseTokens = phrase.split(" ").filter((t) => t.length > 0);
  if (phraseTokens.length === 0) return false;

  if (phraseTokens.length === 1) {
    return tokens.includes(phraseTokens[0]);
  }

  for (let i = 0; i <= tokens.length - phraseTokens.length; i++) {
    if (phraseTokens.every((pt, j) => tokens[i + j] === pt)) return true;
  }
  return false;
}

/**
 * Returns the first entry whose aliases contain a phrase matching `tokens`.
 * Entries are scanned in array order; within each entry, aliases are scanned
 * in array order. The first match found is returned.
 *
 * Returns `null` when no entry matches — never guesses or defaults.
 */
export function matchFirst(
  tokens: readonly string[],
  entries: readonly VocabularyEntry[]
): MatchResult | null {
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      if (matchPhrase(tokens, alias)) {
        return { canonical: entry.canonical, matchedAlias: alias };
      }
    }
  }
  return null;
}

/**
 * Returns ALL entries whose aliases match `tokens`, one result per entry.
 * Within each entry the first matching alias is used for `matchedAlias`.
 * Entry order is preserved — array order determines output order.
 *
 * Used for MODIFIERS where multiple values may coexist in a single command.
 */
export function matchAll(
  tokens: readonly string[],
  entries: readonly VocabularyEntry[]
): MatchResult[] {
  const results: MatchResult[] = [];
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      if (matchPhrase(tokens, alias)) {
        results.push({ canonical: entry.canonical, matchedAlias: alias });
        break;
      }
    }
  }
  return results;
}
