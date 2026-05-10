/**
 * Attribute Registry — ground-truth schema for Cavalry node types.
 *
 * CANONICAL SOURCE OF TRUTH RULE:
 *   Every attribute in ATTRIBUTE_REGISTRY must be runtime-verified:
 *   confirmed via api.set() + api.get() readback in a live Cavalry session.
 *
 *   No attribute may be added based on:
 *   - naming similarity to known attributes
 *   - documentation or training data
 *   - partial or unverified probes
 *   - AI inference of any kind
 *
 * COMPILER BOUNDARY RULE:
 *   The compiler pipeline consumes ONLY approved AttributeRegistry snapshots.
 *   It must never consume live probe output or unreviewed diffs directly.
 *
 * VERSIONING:
 *   `approvedAt` records when a human reviewer approved this registry state.
 *   Schema drift is detected by the probe + sync system and proposed as a
 *   diff — never auto-applied.
 *
 * ACTIVE_CONTEXT.md ROLE (BOOTSTRAP ONLY):
 *   The initial values in this registry were seeded from ACTIVE_CONTEXT.md §B2
 *   (runtime observations recorded 2026-05-08). ACTIVE_CONTEXT.md is a
 *   BOOTSTRAP REFERENCE only — historical documentation, not ongoing authority.
 *   It must NOT be treated as proof that an attribute works today. Any registry
 *   update after bootstrap must be driven by probe-confirmed results only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttributeValueType = "number" | "string" | "color";

export interface AttributeEntry {
  /** Dot-notation attribute path accepted by api.set / api.get. */
  readonly attribute: string;
  /** Runtime-observed value type for this attribute. */
  readonly valueType: AttributeValueType;
  /** ISO date string of runtime verification. */
  readonly verifiedAt: string;
  /** Optional human notes (version, range, caveats). */
  readonly notes?: string;
}

/**
 * Immutable approved registry for one node type.
 * Only produced by human approval of a diff — never auto-generated.
 */
export interface AttributeRegistry {
  readonly version: string;
  readonly nodeType: string;
  readonly attributes: readonly AttributeEntry[];
  /** ISO date string of last human approval. */
  readonly approvedAt: string;
}

// ---------------------------------------------------------------------------
// Confirmed registry — seeded from ACTIVE_CONTEXT.md §B2 (2026-05-08)
// ---------------------------------------------------------------------------

/**
 * ATTRIBUTE_REGISTRY["textShape"] contains ONLY attributes confirmed via
 * live api.set() + api.get() execution against Cavalry on 2026-05-08.
 *
 * BOOTSTRAP SOURCE: seeded from ACTIVE_CONTEXT.md §B2 (recorded 2026-05-08).
 * ACTIVE_CONTEXT.md is a bootstrap reference only — NOT ongoing runtime authority.
 * Future additions must come from probe-confirmed results, never from docs.
 */
export const ATTRIBUTE_REGISTRY: Readonly<Record<string, AttributeRegistry>> =
  {
    textShape: {
      version: "1.0.0",
      nodeType: "textShape",
      approvedAt: "2026-05-08",
      attributes: [
        {
          attribute: "position.x",
          valueType: "number",
          verifiedAt: "2026-05-08",
          notes: "pixels; any value",
        },
        {
          attribute: "position.y",
          valueType: "number",
          verifiedAt: "2026-05-08",
          notes: "pixels; any value",
        },
        {
          attribute: "scale.x",
          valueType: "number",
          verifiedAt: "2026-05-08",
        },
        {
          attribute: "scale.y",
          valueType: "number",
          verifiedAt: "2026-05-08",
        },
        {
          attribute: "rotation",
          valueType: "number",
          verifiedAt: "2026-05-08",
          notes: "degrees",
        },
        {
          attribute: "opacity",
          valueType: "number",
          verifiedAt: "2026-05-08",
          notes: "range 0-100",
        },
        {
          attribute: "fontSize",
          valueType: "number",
          verifiedAt: "2026-05-08",
        },
        {
          attribute: "fill.color",
          valueType: "color",
          verifiedAt: "2026-05-08",
          notes: "hex string e.g. #FF0000",
        },
        {
          attribute: "fontColor",
          valueType: "color",
          verifiedAt: "2026-05-08",
          notes:
            "correct path for text color — not 'color', 'textColor', 'fill', 'style.fill', or 'appearance.color'",
        },
        {
          attribute: "text",
          valueType: "string",
          verifiedAt: "2026-05-08",
        },
      ],
    },
  };

// ---------------------------------------------------------------------------
// Negatively confirmed attributes — probed and consistently failed
// ---------------------------------------------------------------------------

/**
 * NEGATIVELY_CONFIRMED_ATTRIBUTES lists attribute paths that have been probed
 * and consistently failed (≥2 runs, all invalid) as of the date recorded.
 *
 * CRITICAL RULES:
 *   - These entries are NOT permanent exclusions. Cavalry may change behavior
 *     across versions. The probe system re-tests these on every sweep.
 *   - An attribute enters this list only after ≥2 consistent probe failures.
 *   - A future probe returning "valid" promotes the attribute to a diff
 *     addedCandidate — the entry here is then subject to human review.
 *   - "unknown" probe results (api.log not captured) do NOT count as failures
 *     and do NOT add entries here. Only explicit PROBE_FAIL qualifies.
 *   - This list is an input-boundary reference, not a compiler constraint.
 *   - No inference: a path not listed here is UNKNOWN, not assumed valid.
 */
export interface NegativelyConfirmedEntry {
  readonly attribute: string;
  /** Reason for negative confirmation — must reference evidence, not inference. */
  readonly reason: string;
  /** ISO date of most recent probe confirmation. */
  readonly confirmedAt: string;
}

export const NEGATIVELY_CONFIRMED_ATTRIBUTES: Readonly<
  Record<string, readonly NegativelyConfirmedEntry[]>
> = {
  textShape: [
    {
      attribute: "color",
      reason: "wrong path for text color; use fontColor — observed via ACTIVE_CONTEXT.md §B2",
      confirmedAt: "2026-05-08",
    },
    {
      attribute: "textColor",
      reason: "not a valid attribute path; use fontColor — observed via ACTIVE_CONTEXT.md §B2",
      confirmedAt: "2026-05-08",
    },
    {
      attribute: "fill",
      reason: "not a valid attribute path; use fill.color — observed via ACTIVE_CONTEXT.md §B2",
      confirmedAt: "2026-05-08",
    },
    {
      attribute: "style.fill",
      reason: "not a valid attribute path; use fill.color — observed via ACTIVE_CONTEXT.md §B2",
      confirmedAt: "2026-05-08",
    },
    {
      attribute: "appearance.color",
      reason: "not a valid attribute path; use fontColor — observed via ACTIVE_CONTEXT.md §B2",
      confirmedAt: "2026-05-08",
    },
    {
      attribute: "name",
      reason: "api.get(id, 'name') does not work — not a valid attribute path, observed via ACTIVE_CONTEXT.md §B2",
      confirmedAt: "2026-05-08",
    },
  ],
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Returns the approved registry for `nodeType`, or null if unknown.
 * Callers must not infer or construct registries for unknown node types.
 */
export function getApprovedRegistry(
  nodeType: string
): AttributeRegistry | null {
  return ATTRIBUTE_REGISTRY[nodeType] ?? null;
}

/**
 * Returns true only if `attribute` is in the approved registry for `nodeType`.
 * A false return means UNKNOWN — not confirmed invalid.
 */
export function isApprovedAttribute(
  nodeType: string,
  attribute: string
): boolean {
  const registry = getApprovedRegistry(nodeType);
  if (registry === null) return false;
  return registry.attributes.some((e) => e.attribute === attribute);
}

/**
 * Returns true if `attribute` appears in NEGATIVELY_CONFIRMED_ATTRIBUTES for
 * `nodeType` — meaning it was probed ≥2 times and consistently failed at the
 * recorded date.
 *
 * IMPORTANT — SCOPE RESTRICTION:
 *   This function is a HISTORICAL LOG LOOKUP only.
 *   It MUST NOT be used in:
 *     - probe decision logic (whether to probe, what to expect)
 *     - validation rules (whether to accept or reject an attribute)
 *     - diff computation (whether to add or remove candidates)
 *     - any gate that blocks re-probing or reclassification
 *
 *   Negative confirmation is historical data. It does not prevent an attribute
 *   from being re-probed and reclassified as valid by a future probe run.
 *   A false return means UNKNOWN state — not confirmed valid.
 */
export function isNegativelyConfirmed(
  nodeType: string,
  attribute: string
): boolean {
  const entries = NEGATIVELY_CONFIRMED_ATTRIBUTES[nodeType];
  if (!entries) return false;
  return entries.some((e) => e.attribute === attribute);
}

// ---------------------------------------------------------------------------
// Compiler-emittable attribute vocabulary — single source of truth
//
// Derived from ATTRIBUTE_REGISTRY["textShape"] numeric-valued attributes.
// Only numeric attributes can be emitted as MotionOp values (setAttr /
// keyframe ops carry `value: number`). String/color attrs are excluded.
//
// motionDSL.ts imports and re-exports this as CONTROLLED_ATTRS. All
// downstream consumers (validators, presets, generator) reach it through
// motionDSL.ts; only the definition lives here.
// ---------------------------------------------------------------------------

export const CONTROLLED_ATTRS = [
  "position.x",
  "position.y",
  "scale.x",
  "scale.y",
  "rotation",
  "opacity",
  "fontSize",
] as const;

// Sync assertion: every entry in CONTROLLED_ATTRS must exist in
// ATTRIBUTE_REGISTRY["textShape"] as a numeric-valued attribute.
// Throws at module load when the two lists diverge — enforces that
// ATTRIBUTE_REGISTRY remains the authority and CONTROLLED_ATTRS never drifts.
{
  const _numeric = new Set(
    ATTRIBUTE_REGISTRY["textShape"].attributes
      .filter((e) => e.valueType === "number")
      .map((e) => e.attribute),
  );
  for (const attr of CONTROLLED_ATTRS) {
    if (!_numeric.has(attr)) {
      throw new Error(
        `CONTROLLED_ATTRS sync failure: "${attr}" is not a numeric attribute in ATTRIBUTE_REGISTRY["textShape"]`,
      );
    }
  }
}
