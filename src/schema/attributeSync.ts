/**
 * Attribute sync system — safe, observation-only schema drift detection.
 *
 * SYSTEM MODEL:
 *
 *   Runtime layer (Cavalry)
 *     → probeAttribute() observes and records results
 *
 *   Sync layer (this module)
 *     → accumulates probe runs
 *     → computes AttributeRegistryDiff (proposed changes only)
 *     → emits AttributeRegistryVersion records (audit log only)
 *
 *   Compiler layer (ATTRIBUTE_REGISTRY in attributeRegistry.ts)
 *     → consumes only approved registry snapshots
 *     → NEVER consumes live probe output
 *     → NEVER auto-merges diff results
 *
 * HARD CONSTRAINTS:
 *   - This module NEVER modifies ATTRIBUTE_REGISTRY.
 *   - computeDiff() is read-only: it compares, never mutates.
 *   - An attribute becomes a valid addition candidate ONLY after ≥2 independent
 *     probe runs ALL return { status: "valid" }.
 *   - An attribute is a removal candidate ONLY after ≥2 runs ALL return
 *     { status: "invalid" } for an attribute currently in the registry.
 *   - Runs returning { status: "unknown" } are INVISIBLE to classification.
 *     They are filtered out before any count or comparison. Classification
 *     is based solely on the count of explicit (valid/invalid) runs.
 *     Unknowns appear only in diagnostic metadata — never in decision logic.
 *   - Partial success (valid + invalid across explicit runs) = inconsistent.
 *     Inconsistency is reported but never promoted to either candidate list.
 *
 * DIFF OUTPUT CONTRACT:
 *   AttributeRegistryDiff is a proposal, not a command.
 *   A human reviewer must inspect it and manually update attributeRegistry.ts.
 *   No code in this repository auto-applies a diff.
 */

import type { AttributeRegistry } from "./attributeRegistry.js";
import type { ProbeResult } from "./probeAttribute.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of comparing accumulated probe runs against the current approved registry.
 *
 * This is a PROPOSAL only. It must be reviewed by a human before any attribute
 * is added to or removed from the canonical ATTRIBUTE_REGISTRY.
 *
 * `confidence` is the ratio of consistent (all-pass or all-fail) probe results
 * to total probed attributes. Range [0, 1]. Higher = more stable observations.
 */
export interface AttributeRegistryDiff {
  readonly nodeType: string;
  /** Attributes not in registry that passed ≥2 independent probe runs. */
  readonly addedCandidates: readonly string[];
  /** Attributes in registry that failed ≥2 independent probe runs. */
  readonly removedCandidates: readonly string[];
  /** All attributes that consistently failed probing (not necessarily in registry). */
  readonly invalidCandidates: readonly string[];
  /** [0, 1] — ratio of consistent observations to total probed. */
  readonly confidence: number;
}

/**
 * Immutable version log entry for a single diff computation.
 * Accumulated over time to form an audit trail of schema drift.
 *
 * `version` is a human-readable identifier: "<nodeType>-v<semver>-<isodate>".
 * `added` / `removed` / `unchanged` describe the diff against the base registry.
 */
export interface AttributeRegistryVersion {
  readonly version: string;
  readonly timestamp: number;
  readonly nodeType: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: readonly string[];
}

/**
 * Accumulator for multiple probe runs of the same attribute.
 *
 * Key: attribute path (e.g. "position.x")
 * Value: ordered array of ProbeResult, one per independent run.
 *
 * Populated by calling accumulate() after each sweep.
 */
export type ProbeAccumulator = Map<string, ProbeResult[]>;

// ---------------------------------------------------------------------------
// Accumulation
// ---------------------------------------------------------------------------

/**
 * Adds one sweep result (attribute → ProbeResult) to the accumulator.
 * Each call represents one independent probe run.
 *
 * The accumulator is mutable by design: callers drive the probe loop
 * and decide when enough runs have been collected.
 */
export function accumulate(
  acc: ProbeAccumulator,
  sweep: ReadonlyMap<string, ProbeResult>
): void {
  for (const [attribute, result] of sweep) {
    const existing = acc.get(attribute);
    if (existing) {
      existing.push(result);
    } else {
      acc.set(attribute, [result]);
    }
  }
}

// ---------------------------------------------------------------------------
// Confirmation rules (strict)
// ---------------------------------------------------------------------------

export const MIN_RUNS_REQUIRED = 2;

/**
 * Returns true ONLY when both hold for EXPLICIT (non-unknown) runs:
 *   - At least MIN_RUNS_REQUIRED explicit runs have been recorded.
 *   - Every explicit run returned { status: "valid" }.
 *
 * "unknown" runs are filtered out before evaluation. They are invisible to
 * this function — they neither help nor block confirmation.
 */
export function isConfirmedValidCandidate(runs: readonly ProbeResult[]): boolean {
  const explicit = runs.filter((r) => r.status !== "unknown");
  if (explicit.length < MIN_RUNS_REQUIRED) return false;
  return explicit.every((r) => r.status === "valid");
}

/**
 * Returns true ONLY when both hold for EXPLICIT (non-unknown) runs:
 *   - At least MIN_RUNS_REQUIRED explicit runs have been recorded.
 *   - Every explicit run returned { status: "invalid" }.
 *
 * "unknown" runs are filtered out before evaluation. They are invisible to
 * this function — absent data is not negative evidence.
 */
export function isConfirmedInvalidCandidate(
  runs: readonly ProbeResult[]
): boolean {
  const explicit = runs.filter((r) => r.status !== "unknown");
  if (explicit.length < MIN_RUNS_REQUIRED) return false;
  return explicit.every((r) => r.status === "invalid");
}

/**
 * Returns true when explicit (non-unknown) runs contain both "valid" and
 * "invalid" results — contradictory evidence from the same attribute.
 *
 * "unknown" runs are filtered out before evaluation. A set of [valid, unknown]
 * is NOT inconsistent; it simply has insufficient explicit data.
 */
export function isInconsistent(runs: readonly ProbeResult[]): boolean {
  const explicit = runs.filter((r) => r.status !== "unknown");
  if (explicit.length < 2) return false;
  const hasValid = explicit.some((r) => r.status === "valid");
  const hasInvalid = explicit.some((r) => r.status === "invalid");
  return hasValid && hasInvalid;
}

// ---------------------------------------------------------------------------
// Diff computation (read-only)
// ---------------------------------------------------------------------------

/**
 * Computes a proposed diff between accumulated probe results and the current
 * approved registry.
 *
 * This function is PURELY OBSERVATIONAL. It does not modify any registry.
 * It produces a proposal that must be reviewed before any change is applied.
 *
 * Diff logic:
 *   addedCandidates   = attributes NOT in registry + isConfirmedValidCandidate
 *   removedCandidates = attributes IN registry     + isConfirmedInvalidCandidate
 *   invalidCandidates = all attributes where       isConfirmedInvalidCandidate
 *
 * confidence = confirmedConsistent / totalProbed
 *   where confirmedConsistent = attributes with ≥2 runs that all agree (all pass OR all fail)
 */
export function computeDiff(
  nodeType: string,
  accumulated: ProbeAccumulator,
  currentRegistry: AttributeRegistry
): AttributeRegistryDiff {
  const currentSet = new Set(
    currentRegistry.attributes.map((e) => e.attribute)
  );

  const addedCandidates: string[] = [];
  const removedCandidates: string[] = [];
  const invalidCandidates: string[] = [];

  let consistentCount = 0;
  const totalCount = accumulated.size;

  for (const [attribute, runs] of accumulated) {
    const confirmedValid = isConfirmedValidCandidate(runs);
    const confirmedInvalid = isConfirmedInvalidCandidate(runs);

    if (confirmedValid || confirmedInvalid) {
      consistentCount++;
    }

    if (confirmedValid && !currentSet.has(attribute)) {
      addedCandidates.push(attribute);
    }

    if (confirmedInvalid) {
      invalidCandidates.push(attribute);
      if (currentSet.has(attribute)) {
        removedCandidates.push(attribute);
      }
    }
  }

  const confidence = totalCount > 0 ? consistentCount / totalCount : 0;

  return {
    nodeType,
    addedCandidates,
    removedCandidates,
    invalidCandidates,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Version record creation
// ---------------------------------------------------------------------------

/**
 * Creates an immutable version log entry from a diff and the current registry.
 *
 * `baseVersion` is the version string from the current approved registry
 * (e.g. "1.0.0"). The version record's own version string encodes the node
 * type and timestamp for human traceability.
 *
 * This record is an audit log entry only. It must NOT be interpreted as an
 * instruction to update the registry.
 */
export function createVersionRecord(
  nodeType: string,
  diff: AttributeRegistryDiff,
  currentRegistry: AttributeRegistry
): AttributeRegistryVersion {
  const timestamp = Date.now();
  const isoDate = new Date(timestamp).toISOString().slice(0, 10);
  const version = `${nodeType}-v${currentRegistry.version}-${isoDate}`;

  const currentAttributes = currentRegistry.attributes.map((e) => e.attribute);

  const removedSet = new Set(diff.removedCandidates);
  const addedSet = new Set(diff.addedCandidates);

  const unchanged = currentAttributes.filter(
    (attr) => !removedSet.has(attr) && !addedSet.has(attr)
  );

  return {
    version,
    timestamp,
    nodeType,
    added: [...diff.addedCandidates],
    removed: [...diff.removedCandidates],
    unchanged,
  };
}

// ---------------------------------------------------------------------------
// Full sync session
// ---------------------------------------------------------------------------

export interface SyncSessionResult {
  /** Proposed diff — read-only, not applied. */
  readonly diff: AttributeRegistryDiff;
  /** Versioned log record for this session. */
  readonly versionRecord: AttributeRegistryVersion;
  /** Full accumulator state at end of session. */
  readonly accumulator: ProbeAccumulator;
  /** Per-attribute summary for diagnostic display. */
  readonly summary: readonly AttributeProbeSummary[];
}

export interface AttributeProbeSummary {
  readonly attribute: string;
  readonly runs: number;
  readonly passes: number;
  readonly failures: number;
  /** Runs where api.log() was not captured or infra error occurred. */
  readonly unknowns: number;
  /**
   * Diagnostic verdict, derived from EXPLICIT (non-unknown) runs only.
   * "unknown" runs contribute to `unknowns` metadata but have zero influence
   * on this field. They are invisible to all classification helpers.
   *
   * "confirmed-valid"   — ≥2 explicit runs, all valid
   * "confirmed-invalid" — ≥2 explicit runs, all invalid
   * "inconsistent"      — explicit valid AND explicit invalid both present
   * "insufficient-runs" — fewer than MIN_RUNS_REQUIRED explicit runs
   *                       (transparently covers unknown-dominated sets)
   */
  readonly verdict:
    | "confirmed-valid"
    | "confirmed-invalid"
    | "inconsistent"
    | "insufficient-runs";
}

/**
 * Builds a human-readable summary of probe results per attribute.
 * Used for diagnostic output — does not influence the diff.
 *
 * Verdict is derived entirely from the three classification helpers, which
 * all operate on explicit-only runs. "unknown" runs are raw metadata.
 */
export function buildProbeSummary(
  accumulated: ProbeAccumulator
): AttributeProbeSummary[] {
  const summary: AttributeProbeSummary[] = [];

  for (const [attribute, runs] of accumulated) {
    const passes = runs.filter((r) => r.status === "valid").length;
    const failures = runs.filter((r) => r.status === "invalid").length;
    const unknowns = runs.filter((r) => r.status === "unknown").length;

    // Verdict uses the same helpers as computeDiff — single source of truth.
    // unknowns are metadata only; they have no path to any verdict value.
    let verdict: AttributeProbeSummary["verdict"];
    if (isConfirmedValidCandidate(runs)) verdict = "confirmed-valid";
    else if (isConfirmedInvalidCandidate(runs)) verdict = "confirmed-invalid";
    else if (isInconsistent(runs)) verdict = "inconsistent";
    else verdict = "insufficient-runs";

    summary.push({ attribute, runs: runs.length, passes, failures, unknowns, verdict });
  }

  return summary;
}

/**
 * Runs a complete sync session: accumulates multiple probe sweeps, computes a
 * diff against the current registry, and returns a full session result.
 *
 * `sweepFn` is called `runsRequired` times. It must return a fresh probe sweep
 * of all candidates for `nodeType`. Using a function argument keeps the sync
 * layer decoupled from the probe implementation (testable in isolation).
 *
 * IMPORTANT: This function only OBSERVES and PROPOSES. The returned diff and
 * version record must be reviewed by a human before any registry change.
 */
export async function runSyncSession(
  nodeType: string,
  currentRegistry: AttributeRegistry,
  sweepFn: () => Promise<ReadonlyMap<string, ProbeResult>>,
  runsRequired: number = MIN_RUNS_REQUIRED
): Promise<SyncSessionResult> {
  const accumulator: ProbeAccumulator = new Map();

  for (let run = 0; run < runsRequired; run++) {
    const sweep = await sweepFn();
    accumulate(accumulator, sweep);
  }

  const diff = computeDiff(nodeType, accumulator, currentRegistry);
  const versionRecord = createVersionRecord(nodeType, diff, currentRegistry);
  const summary = buildProbeSummary(accumulator);

  return { diff, versionRecord, accumulator, summary };
}
