/**
 * Schema extraction system — public API surface.
 *
 * THREE-LAYER ARCHITECTURE:
 *
 *   Cavalry runtime  →  probeAttribute() / sweepNodeType()
 *                         observes, never assumes
 *
 *   Sync layer       →  computeDiff() / runSyncSession()
 *                         proposes changes, never applies
 *
 *   Compiler layer   →  ATTRIBUTE_REGISTRY (approved snapshots only)
 *                         consumed by compiler, never auto-updated
 *
 * USAGE:
 *
 *   // 1. Run a sync session (2 sweeps, returns diff proposal)
 *   import { runSyncSession, sweepNodeType } from "@cavalry-mcp/schema";
 *   import { getApprovedRegistry } from "@cavalry-mcp/schema";
 *
 *   const registry = getApprovedRegistry("textShape")!;
 *   const session = await runSyncSession(
 *     "textShape",
 *     registry,
 *     () => sweepNodeType("textShape")
 *   );
 *
 *   // 2. Inspect proposals (read-only — do NOT auto-apply)
 *   console.log(session.diff.addedCandidates);
 *   console.log(session.diff.removedCandidates);
 *   console.log(session.versionRecord);
 *
 *   // 3. Probe a single attribute
 *   const result = await probeAttribute("textShape", "fontSize", "number");
 */

// Registry types and approved baseline
export type {
  AttributeEntry,
  AttributeRegistry,
  AttributeValueType,
  NegativelyConfirmedEntry,
} from "./attributeRegistry.js";

export {
  ATTRIBUTE_REGISTRY,
  NEGATIVELY_CONFIRMED_ATTRIBUTES,
  getApprovedRegistry,
  isApprovedAttribute,
  isNegativelyConfirmed,
} from "./attributeRegistry.js";

// Probe system
export type {
  ProbeCandidate,
  ProbeResult,
  SentinelType,
} from "./probeAttribute.js";

export {
  PROBE_CANDIDATES,
  buildProbeScript,
  parseProbeResponse,
  probeAttribute,
  sweepNodeType,
} from "./probeAttribute.js";

// Sync + diff system
export type {
  AttributeProbeSummary,
  AttributeRegistryDiff,
  AttributeRegistryVersion,
  ProbeAccumulator,
  SyncSessionResult,
} from "./attributeSync.js";

export {
  MIN_RUNS_REQUIRED,
  accumulate,
  buildProbeSummary,
  computeDiff,
  createVersionRecord,
  isConfirmedInvalidCandidate,
  isConfirmedValidCandidate,
  isInconsistent,
  runSyncSession,
} from "./attributeSync.js";
