/**
 * Constructor field mapping — probe-driven attribute resolution for compiler-owned layers.
 *
 * RULES:
 *   - Do NOT update this mapping without a completed Phase 2A behavioral attribute profile.
 *   - "__PROVISIONAL__" entries are blocked from Phase 2B emission (CF-I4, CF-I8).
 *   - Phase 2A result gates entry into this file; visual canvas confirmation is required (CF-I5).
 *   - Supports multi-binding: a single user-facing key may resolve to multiple Cavalry paths (CF-I9).
 *
 * Phase 2A result (2026-05-15):
 *   textShape.text = "text"
 *   — Canvas showed "PROBE_text" after api.set(probe, { text: "PROBE_text" }).
 *   — Candidates "string", "content", "value", "sourceText" → "Attribute not found" (Cavalry error).
 *   — No multi-binding behavior observed; single confirmed winner.
 */

export const CONSTRUCTOR_FIELD_MAPPING: Readonly<
  Record<string, Readonly<Record<string, string | string[]>>>
> = {
  textShape: {
    // Phase 2A confirmed 2026-05-15: visually changes canvas text content.
    text: "text",
  },
};

/**
 * Resolves a user-facing constructor field key to one or more Cavalry attribute paths.
 *
 * Returns `string[]` to support multi-binding behavior discovered via Phase 2A (CF-I9).
 * Throws at the pipeline boundary when the mapping is PROVISIONAL or missing (CF-I4, CF-I8).
 */
export function resolveConstructorAttr(layerType: string, key: string): string[] {
  const mapping =
    CONSTRUCTOR_FIELD_MAPPING[layerType as keyof typeof CONSTRUCTOR_FIELD_MAPPING];

  if (!mapping) {
    throw new Error(
      `[constructorFieldMapping] No mapping for layerType: "${layerType}". ` +
        `Run Phase 2A before adding constructor fields for this layer type.`,
    );
  }

  const resolved = (mapping as Record<string, string | string[]>)[key];

  if (!resolved || resolved === "__PROVISIONAL__") {
    throw new Error(
      `[constructorFieldMapping] "${key}" on "${layerType}" is PROVISIONAL or missing. ` +
        `Phase 2B emission blocked until Phase 2A behavioral profile is confirmed.`,
    );
  }

  return Array.isArray(resolved) ? resolved : [resolved];
}
