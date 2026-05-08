/**
 * SceneIdentityResolver — emits deterministic JS reconciliation blocks for
 * compiler-owned layers.
 *
 * Verified runtime behavior (2026-05-08, Stallion v0.7):
 *   - api.getAllSceneLayers() returns internal IDs ("textShape#N" format)
 *   - api.getNiceName(internalId) returns the display name passed to api.create
 *   - api.layerExists(displayName) returns false — names are NOT valid API identifiers
 *   - Reconciliation pattern: enumerate → filter by getNiceName → create-if-missing
 *   - Duplicate detection: >1 match is a hard error (throw stops execution)
 *
 * Reconciliation semantics:
 *   - 0 matches → api.create(layerType, "MC__<id>")
 *   - 1 match   → reuse existing layer (mutate in place)
 *   - 2+ matches → throw "MC_DUPLICATE:<name>" (hard error, no recovery)
 */

import type { MotionTarget } from "./motionDSL.js";
import { compilerLayerName } from "./motionDSL.js";

/**
 * Emits the JS reconciliation block for a compiler-owned target.
 *
 * The emitted block resolves `varName` to a Cavalry layer ID using the MC__
 * namespace lookup pattern. All helper variables are prefixed with `varName`
 * to avoid collisions when multiple targets appear in the same script.
 *
 * Generated shape (varName = "__t0"):
 *
 *   var __t0_name  = "MC__<compilerLayerId>";
 *   var __t0_all   = api.getAllSceneLayers();
 *   var __t0_hits  = [];
 *   for (var __t0_i = 0; __t0_i < __t0_all.length; __t0_i++) {
 *     if (api.getNiceName(__t0_all[__t0_i]) === __t0_name) { __t0_hits.push(__t0_all[__t0_i]); }
 *   }
 *   if (__t0_hits.length > 1) { throw new Error("MC_DUPLICATE:" + __t0_name); }
 *   var __t0 = __t0_hits.length === 1 ? __t0_hits[0] : api.create("<layerType>", __t0_name);
 */
export function emitReconciliation(
  target: Extract<MotionTarget, { kind: "compilerOwned" }>,
  varName: string,
): string[] {
  const mcName = compilerLayerName(target.compilerLayerId);
  const nameVar = `${varName}_name`;
  const allVar = `${varName}_all`;
  const hitsVar = `${varName}_hits`;
  const iVar = `${varName}_i`;

  return [
    `var ${nameVar} = ${JSON.stringify(mcName)};`,
    `var ${allVar} = api.getAllSceneLayers();`,
    `var ${hitsVar} = [];`,
    `for (var ${iVar} = 0; ${iVar} < ${allVar}.length; ${iVar}++) {`,
    `  if (api.getNiceName(${allVar}[${iVar}]) === ${nameVar}) { ${hitsVar}.push(${allVar}[${iVar}]); }`,
    `}`,
    `if (${hitsVar}.length > 1) { throw new Error("MC_DUPLICATE:" + ${nameVar}); }`,
    `var ${varName} = ${hitsVar}.length === 1 ? ${hitsVar}[0] : api.create(${JSON.stringify(target.layerType)}, ${nameVar});`,
  ];
}
