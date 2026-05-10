/**
 * Vocabulary Layer — static ordered vocabulary definitions.
 *
 * Each list is an ordered array of VocabularyEntry objects.
 * Array order determines match priority: first entry wins when multiple
 * entries could match the same input. This makes priority explicit and
 * deterministic — no implicit ordering from object key iteration.
 *
 * Rules:
 *   - Entries are static and compile-time constant. No runtime mutation.
 *   - `canonical` is the normalized output form (what the compiler sees).
 *   - `aliases` lists every surface form that maps to this canonical.
 *   - Aliases must be lowercase — the matching engine normalizes input to
 *     lowercase before matching, so mixed-case aliases would never fire.
 *   - An alias may be a single token ("make") or a multi-token phrase
 *     ("fade in"). Phrase matching is consecutive-token, not substring.
 */

export interface VocabularyEntry {
  readonly canonical: string;
  readonly aliases: readonly string[];
}

/**
 * User intent — what the user wants to do.
 * Maps to create / update / remove actions.
 */
export const INTENTS: readonly VocabularyEntry[] = [
  { canonical: "create", aliases: ["create", "make", "add", "new", "build", "generate"] },
  { canonical: "update", aliases: ["update", "change", "modify", "edit", "adjust"] },
  { canonical: "remove", aliases: ["remove", "delete", "clear"] },
];

/**
 * Object — the Cavalry layer type the user is referring to.
 * Canonical values align with CanonicalNodeType in nodeRegistry.ts.
 */
export const OBJECTS: readonly VocabularyEntry[] = [
  {
    canonical: "textShape",
    aliases: ["title", "text", "label", "heading", "caption", "textlayer", "basictext"],
  },
];

/**
 * Motion presets — the animation the user wants to apply.
 * Canonical values are PresetId strings from motionDSL.ts.
 * Listed from most-specific phrase to least-specific to prevent
 * early short-token matches shadowing longer phrases.
 */
export const MOTIONS: readonly VocabularyEntry[] = [
  {
    canonical: "fade_in",
    aliases: ["fade in", "fadein", "fade_in", "fade-in"],
  },
  {
    canonical: "bounce_in",
    aliases: ["bounce in", "bouncein", "bounce_in", "bounce-in", "bounce"],
  },
  {
    canonical: "slide_left",
    aliases: ["slide left", "slide_left", "slide-left", "slide from right", "from right"],
  },
  {
    canonical: "scale_pop",
    aliases: ["scale pop", "scale_pop", "scale-pop", "pop in", "pop"],
  },
];

/**
 * Styles — visual character hints. Resolved as advisory metadata only;
 * compiler stages use them at their own discretion.
 */
export const STYLES: readonly VocabularyEntry[] = [
  { canonical: "minimal", aliases: ["minimal", "clean", "simple"] },
  { canonical: "dramatic", aliases: ["dramatic", "bold", "strong"] },
  { canonical: "subtle", aliases: ["subtle", "soft", "gentle"] },
];

/**
 * Modifiers — speed, repetition, and direction qualifiers.
 * Unlike other fields, ALL matching modifiers are collected (not just the first).
 */
export const MODIFIERS: readonly VocabularyEntry[] = [
  { canonical: "fast", aliases: ["fast", "quick", "rapid"] },
  { canonical: "slow", aliases: ["slow", "slowly", "gradual"] },
  { canonical: "loop", aliases: ["loop", "repeat", "looping"] },
  { canonical: "reverse", aliases: ["reverse", "reversed", "backwards"] },
];
