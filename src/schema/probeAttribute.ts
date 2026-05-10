/**
 * Attribute probe system — runtime verification of Cavalry attribute paths.
 *
 * PROBE PROTOCOL:
 *   1. Find or create a dedicated probe layer (PROBE__<nodeType>) in the scene.
 *   2. Set the candidate attribute to a sentinel value via api.set().
 *   3. Immediately read back the attribute via api.get().
 *   4. Compare sentinel to readback with type-safe normalization.
 *   5. Emit PROBE_PASS or PROBE_FAIL via api.log().
 *   6. Parse the Stallion HTTP response for the probe marker.
 *
 * THREE-STATE RESULT MODEL:
 *   "valid"   — explicit confirmation: readback matched sentinel
 *   "invalid" — explicit rejection:    readback did not match (PROBE_FAIL emitted)
 *   "unknown" — inconclusive:          api.log() not captured, infra error, or
 *                                      connection failure
 *
 *   The distinction between "invalid" and "unknown" is critical:
 *   - "invalid" requires a readback that EXPLICITLY failed the comparison.
 *   - "unknown" means the probe could not determine anything — do NOT classify
 *     this as invalid. Treat it as missing data, not negative evidence.
 *
 * api.log() WEAK SIGNAL RULE:
 *   api.log() is an output channel only, not an authoritative validation mechanism.
 *   The structural verification (api.set + api.get + compare) happens INSIDE the
 *   probe script. api.log() merely surfaces the result. When api.log() output is
 *   absent (known Stallion v0.7 issue), the probe result is "unknown" — not
 *   "invalid". Probe correctness depends on the readback comparison, not the log.
 *
 * PROBE LAYER LIFECYCLE:
 *   Probe layers (PROBE__<nodeType>) are reused across runs. They are created
 *   on first probe and persist in the scene. Cleanup is left to the user.
 *   The probe does NOT clean up layers because api.deleteLayer() is unverified.
 *
 * SENTINEL VALUES:
 *   - number: 42   (integer; safe for opacity 0-100, position, fontSize, rotation)
 *   - color:  "#ff0000"  (lowercase pure red; Cavalry may normalize case)
 *   - string: "PROBE_SENTINEL_7829" (unique enough to detect false positives)
 *
 * RESPONSE MARKERS:
 *   The probe script emits exactly one of:
 *     PROBE_PASS           → attribute set and read back successfully
 *     PROBE_FAIL:<reason>  → set or readback failed, reason attached
 *     PROBE_ERROR:<reason> → infrastructure failure (layer creation, etc.)
 *
 *   Any response not containing a recognised marker is treated as INVALID.
 */

import { sendToCavalry } from "../stallion.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SentinelType = "number" | "string" | "color";

/**
 * Result of a single probe run. Three explicit states.
 *
 * "valid"   — readback matched sentinel: attribute confirmed writable + readable.
 * "invalid" — readback did not match:    attribute does not persist the value.
 * "unknown" — result could not be determined: api.log() not captured, infra
 *             error, or connection failure. NOT the same as invalid.
 *
 * Classification rule:
 *   - explicit confirmation (PROBE_PASS) → "valid"
 *   - explicit rejection    (PROBE_FAIL) → "invalid"
 *   - anything else                      → "unknown"
 */
export type ProbeResult =
  | { status: "valid"; confirmed: true }
  | { status: "invalid"; error: string }
  | { status: "unknown"; reason: string };

/**
 * Candidate attribute to probe for a given node type.
 * `status` is the prior knowledge about this candidate:
 *   - "confirmed"              already in ATTRIBUTE_REGISTRY, probing to re-verify
 *   - "candidate"              unknown, probing to discover
 *   - "negatively-confirmed"   already in NEGATIVELY_CONFIRMED_ATTRIBUTES; probing
 *                              to re-confirm rejection (entries are not permanent)
 */
export interface ProbeCandidate {
  readonly attribute: string;
  readonly sentinelType: SentinelType;
  readonly status: "confirmed" | "candidate" | "negatively-confirmed";
  readonly notes?: string;
}

// ---------------------------------------------------------------------------
// Probe candidate list — the complete set of attributes to test per node type
// ---------------------------------------------------------------------------

/**
 * PROBE_CANDIDATES defines every attribute that will be probed for each node type.
 *
 * Rules:
 *   - "confirmed" entries are attributes already in ATTRIBUTE_REGISTRY.
 *     They are re-probed on each run to detect regressions / Cavalry API changes.
 *   - "candidate" entries are untested attributes that may or may not work.
 *     They require ≥2 successful probe runs before they can be proposed as additions.
 *   - "negatively-confirmed" entries are in NEGATIVELY_CONFIRMED_ATTRIBUTES but are
 *     NOT permanently excluded — they are re-probed to detect if Cavalry changed.
 *
 * Ordering: confirmed first, then candidates, then known-invalid.
 */
export const PROBE_CANDIDATES: Readonly<
  Record<string, readonly ProbeCandidate[]>
> = {
  textShape: [
    // Confirmed via ACTIVE_CONTEXT.md §B2 (2026-05-08)
    { attribute: "position.x", sentinelType: "number", status: "confirmed" },
    { attribute: "position.y", sentinelType: "number", status: "confirmed" },
    { attribute: "scale.x", sentinelType: "number", status: "confirmed" },
    { attribute: "scale.y", sentinelType: "number", status: "confirmed" },
    { attribute: "rotation", sentinelType: "number", status: "confirmed" },
    {
      attribute: "opacity",
      sentinelType: "number",
      status: "confirmed",
      notes: "sentinel 42 is within valid range 0-100",
    },
    { attribute: "fontSize", sentinelType: "number", status: "confirmed" },
    { attribute: "fill.color", sentinelType: "color", status: "confirmed" },
    {
      attribute: "fontColor",
      sentinelType: "color",
      status: "confirmed",
      notes: "correct text color path",
    },
    { attribute: "text", sentinelType: "string", status: "confirmed" },
    // Candidates — mentioned in CLAUDE.md as "common correct paths" but not yet
    // confirmed via the probe protocol (may or may not persist on readback)
    {
      attribute: "stroke.color",
      sentinelType: "color",
      status: "candidate",
      notes: "listed in CLAUDE.md but not confirmed in ACTIVE_CONTEXT.md §B2",
    },
    {
      attribute: "stroke.width",
      sentinelType: "number",
      status: "candidate",
      notes: "listed in CLAUDE.md but not confirmed in ACTIVE_CONTEXT.md §B2",
    },
    {
      attribute: "anchor.x",
      sentinelType: "number",
      status: "candidate",
    },
    {
      attribute: "anchor.y",
      sentinelType: "number",
      status: "candidate",
    },
    // Negatively confirmed — failed probing as of 2026-05-08 (ACTIVE_CONTEXT.md §B2).
    // Re-probed on every sweep; the probe makes no assumption about outcome.
    // A future "valid" result would surface these as addedCandidates in the diff.
    {
      attribute: "color",
      sentinelType: "color",
      status: "negatively-confirmed",
      notes: "failed as of 2026-05-08; use fontColor for text color",
    },
    {
      attribute: "textColor",
      sentinelType: "color",
      status: "negatively-confirmed",
      notes: "failed as of 2026-05-08",
    },
    {
      attribute: "fill",
      sentinelType: "color",
      status: "negatively-confirmed",
      notes: "failed as of 2026-05-08; use fill.color",
    },
    {
      attribute: "name",
      sentinelType: "string",
      status: "negatively-confirmed",
      notes: "failed as of 2026-05-08; api.get(id, 'name') not a valid path",
    },
  ],
};

// ---------------------------------------------------------------------------
// Script generation (pure — no side effects)
// ---------------------------------------------------------------------------

/** Sentinel values embedded literally into the generated probe script. */
const SENTINEL: Record<SentinelType, string> = {
  number: "42",
  color: '"#ff0000"',
  string: '"PROBE_SENTINEL_7829"',
};

/**
 * Inline JS comparison expression for the given sentinel type.
 * Uses type-normalizing comparison to handle Cavalry's internal type coercion:
 *   - numbers: compare via Number() to handle "42" string returns
 *   - colors:  lowercase + whitespace strip to handle case normalization
 *   - strings: strict equality
 */
function sentinelCompareExpr(sentinelType: SentinelType): string {
  switch (sentinelType) {
    case "number":
      return "(readback !== null && readback !== undefined && Number(readback) === 42)";
    case "color":
      return '(readback !== null && readback !== undefined && String(readback).toLowerCase().replace(/\\s/g,"") === "#ff0000")';
    case "string":
      return '(readback === "PROBE_SENTINEL_7829")';
  }
}

/**
 * Generates a self-contained Cavalry JS probe script for a single attribute.
 *
 * The script:
 *   1. Finds or creates the probe layer (PROBE__<nodeType>) using the same
 *      reconciliation pattern as sceneIdentityResolver.
 *   2. Sets the attribute to a sentinel value.
 *   3. Reads back immediately with api.get().
 *   4. Compares using type-normalizing equality.
 *   5. Emits PROBE_PASS or PROBE_FAIL:<reason> via api.log().
 *
 * The script is an IIFE to avoid global scope pollution across probe runs.
 *
 * NOTE: api.log() is the output channel, not the correctness source.
 * The structural verification (set + readback comparison) happens inside the
 * script. If api.log() output does not surface in the Stallion response, the
 * result is classified as "unknown" — not "invalid". The attribute may still
 * be valid; we simply cannot confirm or deny without the readback signal.
 */
export function buildProbeScript(
  nodeType: string,
  attribute: string,
  sentinelType: SentinelType
): string {
  const probeName = `PROBE__${nodeType}`;
  const sentinel = SENTINEL[sentinelType];
  const compareExpr = sentinelCompareExpr(sentinelType);

  return `(function() {
  var PROBE_NAME = ${JSON.stringify(probeName)};
  var ATTR = ${JSON.stringify(attribute)};

  // Find or create probe layer (same reconciliation as sceneIdentityResolver)
  var layers = api.getAllSceneLayers();
  var probeId = null;
  for (var i = 0; i < layers.length; i++) {
    if (api.getNiceName(layers[i]) === PROBE_NAME) {
      probeId = layers[i];
      break;
    }
  }
  if (probeId === null) {
    probeId = api.create(${JSON.stringify(nodeType)}, PROBE_NAME);
  }
  if (!probeId) {
    api.log("PROBE_ERROR:layer_creation_failed:" + PROBE_NAME);
    return;
  }

  // Set sentinel value
  var setAttrs = {};
  setAttrs[ATTR] = ${sentinel};
  api.set(probeId, setAttrs);

  // Read back immediately
  var readback = api.get(probeId, ATTR);

  // Type-normalizing comparison
  var match = ${compareExpr};

  if (match) {
    api.log("PROBE_PASS");
  } else {
    api.log("PROBE_FAIL:got=" + String(readback));
  }
})();`;
}

// ---------------------------------------------------------------------------
// Response parsing (pure — no side effects)
// ---------------------------------------------------------------------------

const PASS_MARKER = "PROBE_PASS";
const FAIL_MARKER = "PROBE_FAIL:";
const ERROR_MARKER = "PROBE_ERROR:";

/**
 * Parses a raw Stallion response string into a typed ProbeResult.
 *
 * Classification:
 *   PROBE_PASS in response  → "valid"   (explicit confirmation)
 *   PROBE_FAIL in response  → "invalid" (explicit readback mismatch)
 *   PROBE_ERROR in response → "unknown" (infra error — probe did not run)
 *   no recognised marker    → "unknown" (api.log() not captured by Stallion v0.7)
 *
 * "unknown" is NOT "invalid". A missing marker means we have no data, not
 * negative data. The attribute status cannot be determined from this run.
 */
export function parseProbeResponse(
  response: string,
  attribute: string
): ProbeResult {
  if (response.includes(PASS_MARKER)) {
    return { status: "valid", confirmed: true };
  }

  if (response.includes(FAIL_MARKER)) {
    const match = response.match(/PROBE_FAIL:([^\s\r\n]*)/);
    const detail = match?.[1] ?? "no_detail";
    return {
      status: "invalid",
      error: `${attribute}: readback mismatch — ${detail}`,
    };
  }

  if (response.includes(ERROR_MARKER)) {
    const match = response.match(/PROBE_ERROR:([^\s\r\n]*)/);
    const detail = match?.[1] ?? "no_detail";
    // Infrastructure failure: probe layer could not be created or accessed.
    // We cannot determine attribute validity — result is unknown, not invalid.
    return {
      status: "unknown",
      reason: `${attribute}: probe infra error — ${detail}`,
    };
  }

  // api.log() output was not captured by Stallion (known v0.7 behaviour).
  // This is an absence of data, not negative evidence. Return "unknown".
  const snippet = response.slice(0, 120).replace(/\r?\n/g, " ");
  return {
    status: "unknown",
    reason: `${attribute}: no_readback — api.log() not captured by Stallion v0.7. response="${snippet}"`,
  };
}

// ---------------------------------------------------------------------------
// Probe executor (async — calls Stallion via HTTP)
// ---------------------------------------------------------------------------

/**
 * Probes a single attribute on a single node type.
 *
 * Execution:
 *   1. Generates the probe script via buildProbeScript().
 *   2. Sends it to Cavalry via sendToCavalry() (same path as cavalry_run_script).
 *   3. Parses the response via parseProbeResponse().
 *   4. Returns a typed ProbeResult — never throws.
 *
 * A single call constitutes ONE run. The ≥2 run confirmation requirement is
 * enforced by the accumulator in attributeSync.ts — not here.
 *
 * Connectivity failures (ECONNREFUSED, timeout) return
 * `{ status: "unknown", reason: "connection_failed: ..." }` — we cannot
 * determine attribute validity when Cavalry is unreachable, so we must not
 * classify the attribute as invalid.
 */
export async function probeAttribute(
  nodeType: string,
  attribute: string,
  sentinelType: SentinelType
): Promise<ProbeResult> {
  let response: string;

  try {
    const script = buildProbeScript(nodeType, attribute, sentinelType);
    response = await sendToCavalry(script, "script");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "unknown",
      reason: `${attribute}: connection_failed — ${message}`,
    };
  }

  return parseProbeResponse(response, attribute);
}

/**
 * Runs probeAttribute() for all candidates registered under `nodeType`.
 * Returns a map from attribute path to ProbeResult.
 *
 * This is one complete probe sweep — one run per attribute.
 * Call multiple times and accumulate for the ≥2 confirmation requirement.
 */
export async function sweepNodeType(
  nodeType: string
): Promise<Map<string, ProbeResult>> {
  const candidates = PROBE_CANDIDATES[nodeType];
  if (!candidates || candidates.length === 0) {
    return new Map();
  }

  const results = new Map<string, ProbeResult>();

  for (const candidate of candidates) {
    const result = await probeAttribute(
      nodeType,
      candidate.attribute,
      candidate.sentinelType
    );
    results.set(candidate.attribute, result);
  }

  return results;
}
