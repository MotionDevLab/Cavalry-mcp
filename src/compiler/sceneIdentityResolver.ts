/**
 * SceneIdentityResolver — emits deterministic JS reconciliation blocks for
 * compiler-owned layers.
 *
 * Verified runtime behavior (2026-05-08, Stallion v0.7):
 *   - api.getAllSceneLayers() returns internal IDs ("textShape#N" format)
 *   - api.getNiceName(internalId) returns the display name passed to api.create
 *   - api.get(internalId, path) returns the stored value for that attribute path
 *   - api.layerExists(displayName) returns false — names are NOT valid API identifiers
 *   - Reconciliation pattern: enumerate → filter → create-if-missing
 *   - Duplicate detection: >1 match is a hard error (throw stops execution)
 *
 * v2 hybrid resolution order (when identity.mcId is present):
 *   STEP 1 — PRIMARY: match by userData.mcId (rename-safe)
 *   STEP 2 — FALLBACK: match by api.getNiceName (legacy / no mcId stored yet)
 *   STEP 3 — CREATE: create new layer, then api.set userData.mcId for future runs
 *
 * v1 legacy resolution (no identity.mcId):
 *   0 matches → api.create(layerType, "MC__<id>")
 *   1 match   → reuse existing layer
 *   2+ matches → throw "MC_DUPLICATE:<name>"
 */

import type { MotionTarget } from "./motionDSL.js";
import { compilerLayerName } from "./motionDSL.js";

/**
 * Emits the JS reconciliation block for a compiler-owned target.
 *
 * When `target.identity` is present the emitted block uses hybrid matching:
 * userData.mcId is checked first; display-name is used only as a fallback.
 * After layer creation the mcId is written to userData so subsequent runs
 * can find the layer even if its display name has been changed.
 *
 * When `target.identity` is absent the block uses v1 name-only matching
 * (full backward compatibility).
 *
 * All helper variables are prefixed with `varName` to avoid collisions when
 * multiple targets appear in the same script.
 *
 * ---
 * v2 generated shape (varName = "__t0", mcId present):
 *
 *   var __t0_mcId = "MC_textShape_abc_xyz";
 *   var __t0_name = "MC__<compilerLayerId>";
 *   var __t0_all  = api.getAllSceneLayers();
 *   var __t0_hits = [];
 *   for (var __t0_i = 0; __t0_i < __t0_all.length; __t0_i++) {
 *     if (api.get(__t0_all[__t0_i], "userData.mcId") === __t0_mcId) { __t0_hits.push(__t0_all[__t0_i]); }
 *   }
 *   if (__t0_hits.length === 0) {
 *     for (var __t0_j = 0; __t0_j < __t0_all.length; __t0_j++) {
 *       if (api.getNiceName(__t0_all[__t0_j]) === __t0_name) { __t0_hits.push(__t0_all[__t0_j]); }
 *     }
 *   }
 *   if (__t0_hits.length > 1) { throw new Error("MC_DUPLICATE:" + __t0_mcId); }
 *   var __t0;
 *   if (__t0_hits.length === 1) {
 *     __t0 = __t0_hits[0];
 *   } else {
 *     __t0 = api.create("<layerType>", __t0_name);
 *     api.set(__t0, { "userData.mcId": __t0_mcId });
 *   }
 *
 * ---
 * v1 generated shape (varName = "__t0", no mcId):
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

  const mcId = target.identity?.mcId;

  if (!mcId) {
    // v1: name-only matching — full backward compatibility
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

  // v2: hybrid — userData.mcId primary, display-name fallback, persist on create
  const mcIdVar = `${varName}_mcId`;
  const jVar = `${varName}_j`;

  return [
    `var ${mcIdVar} = ${JSON.stringify(mcId)};`,
    `var ${nameVar} = ${JSON.stringify(mcName)};`,
    `var ${allVar} = api.getAllSceneLayers();`,
    `var ${hitsVar} = [];`,
    // STEP 1 — PRIMARY: match by userData.mcId (rename-safe)
    `for (var ${iVar} = 0; ${iVar} < ${allVar}.length; ${iVar}++) {`,
    `  if (api.get(${allVar}[${iVar}], "userData.mcId") === ${mcIdVar}) { ${hitsVar}.push(${allVar}[${iVar}]); }`,
    `}`,
    // STEP 2 — FALLBACK: match by display name (legacy layers without mcId stored)
    `if (${hitsVar}.length === 0) {`,
    `  for (var ${jVar} = 0; ${jVar} < ${allVar}.length; ${jVar}++) {`,
    `    if (api.getNiceName(${allVar}[${jVar}]) === ${nameVar}) { ${hitsVar}.push(${allVar}[${jVar}]); }`,
    `  }`,
    `}`,
    `if (${hitsVar}.length > 1) { throw new Error("MC_DUPLICATE:" + ${mcIdVar}); }`,
    // STEP 3 — reuse or CREATE; persist mcId so future runs use primary match
    `var ${varName};`,
    `if (${hitsVar}.length === 1) {`,
    `  ${varName} = ${hitsVar}[0];`,
    `} else {`,
    `  ${varName} = api.create(${JSON.stringify(target.layerType)}, ${nameVar});`,
    `  api.set(${varName}, { "userData.mcId": ${mcIdVar} });`,
    `}`,
  ];
}
