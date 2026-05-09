// ---------------------------------------------------------------------------
// Canonical system (runtime truth)
// ---------------------------------------------------------------------------

export const CANONICAL_NODE_TYPES = [
  "textShape",
] as const;

export type CanonicalNodeType = (typeof CANONICAL_NODE_TYPES)[number];

export function isCanonicalNodeType(value: unknown): value is CanonicalNodeType {
  return (
    typeof value === "string" &&
    (CANONICAL_NODE_TYPES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Alias system (INPUT ONLY — UX convenience, never downstream)
// ---------------------------------------------------------------------------

export const ALIAS_MAP: Readonly<Record<string, CanonicalNodeType>> = {
  text: "textShape",
  textLayer: "textShape",
};

export function canonicalize(input: string): CanonicalNodeType | null {
  if (isCanonicalNodeType(input)) return input;
  const resolved = ALIAS_MAP[input];
  return resolved ?? null;
}
