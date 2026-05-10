# ACTIVE_CONTEXT.md — Cavalry MCP Architecture Contract

> **Purpose:** Contract-based system specification. Every critical claim maps to a verifiable runtime fact or test.
>
> **Authority:** This document supersedes README.md and CLAUDE.md where they conflict.
>
> **Final principle:** Only rules that map to code or tests are considered enforceable. All other statements are architectural intent.

---

## A. RUNTIME FACTS (VERIFIED)

> Only facts directly observable in code. No interpretation.

---

### A1. MCP Tool Surface

**Branch: `motion-runtime` — `src/index.ts`**

| Tool | Input | What it does |
|------|-------|--------------|
| `cavalry_ping` | none | `GET 127.0.0.1:8080/` with 2s timeout; returns boolean |
| `cavalry_run_script` | `code: string` | Pattern-validates JS, sends raw string to Stallion, returns response text |

**That is the complete live tool surface. No other tools are exposed.**

`validateCode()` in `src/index.ts` blocks Node.js-dangerous patterns only (`process.exit`, `child_process`, `require(`, `fs.`, `net.`). It does NOT validate Cavalry API correctness.

---

### A2. Execution Flow (observed, verified)

```
User natural language
        │
        ▼
  Claude (LLM) — generates raw JavaScript
        │  MCP stdio transport
        ▼
  Node.js MCP Server  (dist/index.js)
  ─ validateCode()     (Node.js dangerous patterns only)
        │  HTTP POST 127.0.0.1:8080/post
        │  body: { type: "script", code: "<raw JS string>" }
        ▼
  Stallion v0.7        (HTTP server inside Cavalry)
  ─ executes JS in Cavalry's JS Engine
  ─ returns HTTP response text
  ⚠ api.log() output may NOT appear in response body
        │
        ▼
  Cavalry              (api.* namespace)
```

**Transport:** stdio (`StdioServerTransport`)
**Stallion endpoint:** `POST http://127.0.0.1:8080/post`
**Connectivity check:** `GET http://127.0.0.1:8080/` with 2-second timeout
**Return value from Cavalry:** raw HTTP response text — `api.log()` output is NOT guaranteed to surface under Stallion v0.7

---

### A3. Compiler Pipeline Files (exist, offline, NOT connected to MCP runtime)

All files under `src/compiler/`. None are imported by `src/index.ts`.

| File | Role |
|------|------|
| `motionDSL.ts` | DSL types: `MotionProgram`, `MotionClip`, `MotionTarget`, `CanonicalNodeType`, `CompiledPlan`, controlled vocabularies (`CONTROLLED_ATTRS`, `EASING_TYPES`, `PRESET_IDS`) |
| `motionCompiler.ts` | `compile(program)` — runs `validateProgram` → preset expansion → `finalizeProgram` → `validateOps` → returns `CompiledPlan` |
| `validators.ts` | `validateProgram()`, `validateClip()`, `validateOps()`, `validateOp()` — pure, throw `MotionValidationError`, no mutation |
| `finalizeProgram.ts` | Hard runtime boundary: throws on `existingLayerByName` and non-canonical `compilerOwned` types |
| `cavalryGenerator.ts` | `generate(plan)` — `CompiledPlan → Cavalry JS string`; throws `GeneratorError` on contract violations |
| `nodeRegistry.ts` | `CANONICAL_NODE_TYPES`, `isCanonicalNodeType()`, `ALIAS_MAP`, `canonicalize()` |
| `sceneIdentityResolver.ts` | `emitReconciliation()` — generates JS reconciliation block for `compilerOwned` targets |
| `mcIdGenerator.ts` | `generateMcId(layerType)` — format `MC_<type>_<base36-ts>_<base36-random>` |
| `intentParser.ts` | NL string → `MotionProgram`; calls `resolveVocabulary()` first |
| `semanticResolver.ts` | `resolveSemantics()`, `resolveSemanticsWithTrace()` — splits raw input into `constructorFields`, `runtimeAttributes`, `motionIntent` |
| `semanticMappings.ts` | `PRESET_MOTION_MAP`, `DIRECTIONAL_SLIDE_MAP`, `CONSTRUCTOR_FIELD_KEYS`, `MOTION_INPUT_KEYS` |
| `vocabulary/vocabulary.ts` | Static ordered vocabulary definitions |
| `vocabulary/matchVocabulary.ts` | Token-based exact matching engine |
| `vocabulary/resolveVocabulary.ts` | Resolver pipeline — `resolveVocabulary()` |
| `presets/` | `bounce_in`, `fade_in`, `slide_left`, `scale_pop` |

**Confirmed by live execution (2026-05-08):** Compiler output manually passed to `cavalry_run_script` produced a correct bouncing animation.

---

### A4. Schema / Probe / Sync Files (exist, offline)

All files under `src/schema/`.

| File | Role |
|------|------|
| `attributeRegistry.ts` | `ATTRIBUTE_REGISTRY` (approved snapshot, human-reviewed), `isApprovedAttribute()`, `NEGATIVELY_CONFIRMED_ATTRIBUTES`, `isNegativelyConfirmed()` |
| `probeAttribute.ts` | `buildProbeScript()`, `parseProbeResponse()`, `probeAttribute()`, `sweepNodeType()` — three-state result model |
| `attributeSync.ts` | `computeDiff()`, `runSyncSession()`, `accumulate()` — read-only diff proposals, `MIN_RUNS_REQUIRED = 2` |
| `index.ts` | Public re-export surface for the schema package |

---

### A5. Verified Attribute Registry

Source: `src/schema/attributeRegistry.ts` — `ATTRIBUTE_REGISTRY["textShape"]`. Seeded from live `api.set()` + `api.get()` execution on 2026-05-08. **Only `textShape` has an approved registry.**

| Attribute Path | Value Type | Verified |
|----------------|-----------|----------|
| `position.x` | number (px) | 2026-05-08 |
| `position.y` | number (px) | 2026-05-08 |
| `scale.x` | number | 2026-05-08 |
| `scale.y` | number | 2026-05-08 |
| `rotation` | number (deg) | 2026-05-08 |
| `opacity` | number (0–100) | 2026-05-08 |
| `fontSize` | number | 2026-05-08 |
| `fill.color` | hex string | 2026-05-08 |
| `fontColor` | hex string | 2026-05-08 — correct text color path (not `color`, `textColor`, `fill`, `style.fill`) |
| `text` | string | 2026-05-08 |

**Negatively confirmed** (probed ≥2 times, consistently failed): `color`, `textColor`, `fill`, `style.fill`, `appearance.color`, `name`

**Pending candidates** (not yet probe-confirmed): `stroke.color`, `stroke.width`, `anchor.x`, `anchor.y`

---

### A6. Verified API Calls

| API Call | Signature | Status |
|----------|-----------|--------|
| `api.create` | `(layerType, name) → internalId` | VERIFIED — returns `{type}#{N}` format |
| `api.set` | `(id, { attr: value })` | VERIFIED — requires internal ID |
| `api.keyframe` | `(id, frame, { attr: value })` | VERIFIED |
| `api.magicEasing` | `(id, attrPath, frame, easingType)` | VERIFIED — easing set on **start** keyframe affects outgoing curve |
| `api.getAllSceneLayers` | `() → string[]` | VERIFIED — returns internal IDs (`type#N`) |
| `api.getNiceName` | `(internalId) → string` | VERIFIED — returns display name from `api.create` |
| `api.layerExists` | `(internalId) → boolean` | VERIFIED |
| `api.get` | `(id, path) → value` | VERIFIED — used in identity v2 for `userData.mcId` |

**Layer ID format:** `{layerType}#{N}` (e.g. `textShape#5`). Display names are NOT usable as API identifiers.

**Easing enum strings** (must be exact — wrong strings silently fail):
`Linear`, `EaseIn`, `EaseOut`, `EaseInOut`, `BounceIn`, `BounceOut`, `BounceInOut`, `ElasticIn`, `ElasticOut`, `ElasticInOut`, `BackIn`, `BackOut`, `BackInOut`

---

### A7. Layer Identity System (v1 + v2)

Implemented in `src/compiler/sceneIdentityResolver.ts` and `src/compiler/mcIdGenerator.ts`. Not connected to MCP runtime. Manually invoked via compiler output passed to `cavalry_run_script`.

**v1 — name-based (MC__ namespace):**
- `api.getAllSceneLayers()` → filter by `api.getNiceName(id) === "MC__<compilerLayerId>"`
- 0 matches → create; 1 match → reuse; 2+ → `throw new Error("MC_DUPLICATE:...")`

**v2 — hybrid mcId + name fallback:**
- Primary: `api.get(id, "userData.mcId")` match
- Fallback: name match (only when primary returns 0 matches)
- On creation: `api.set(newId, { "userData.mcId": mcId })` persists identity

**Verified (2026-05-08):** Two consecutive executions with `compilerLayerId: "title_text"` produced exactly one layer. Second run reused existing layer.

---

### A8. Test Files (exist)

All in `src/compiler/__tests__/`.

| File | Tests | What they cover |
|------|-------|-----------------|
| `dsl-contract.test.ts` | 3 | `isCanonicalNodeType`: canonical passes, invalid fails, alias fails |
| `generator-contract.test.ts` | 3 | `generate()`: valid plan accepted, invalid state throws `GeneratorError` |
| `validator.test.ts` | 4 | `validateClip()`: canonical passes, non-canonical rejects, alias rejects, no mutation |
| `nodeRegistry.test.ts` | 6 | `canonicalize()`, `isCanonicalNodeType()`: determinism, null on unknown, identity |
| `node-registry-guard.test.ts` | 17 | Full pipeline: canonical, alias, unknown input — all three stages |

**Test runner:** `tsx --test` (primary). All 15+ tests passing as of 2026-05-09.

---

## B. ARCHITECTURAL INTENT (DESIGN LAYER)

> Intended system design. Clearly marked as **intent, not enforcement**.

---

### B1. Compiler-First NL Pipeline (intent, not enforced at runtime)

**Intent:** All natural language motion requests should flow through the compiler pipeline before reaching `cavalry_run_script`.

```
NL → intentParser → motionCompiler → cavalryGenerator → cavalry_run_script → Cavalry
```

**Reality:** This pipeline has no runtime enforcement. `cavalry_run_script` remains directly callable with arbitrary JS. The compiler is an offline module only. No MCP tool routes NL through the compiler automatically.

---

### B2. Semantic Resolver Role (intent)

**Intent:** `semanticResolver.ts` is a pre-compiler input normalizer that splits arbitrary raw input into three disjoint categories before the compiler pipeline sees it.

- `constructorFields` — `text`, `name` (layer identity)
- `runtimeAttributes` — only attributes present in the approved registry for the node type
- `motionIntent` — normalized preset ID or keyframe hints; `null` when unrecognized

Unknown input keys are dropped, not guessed. No inference, no fuzzy matching.

**Reality:** `semanticResolver` is implemented and functional. It is not wired into `intentParser` or the MCP runtime. It is a standalone module callable by application code.

---

### B3. Probe-Sync Learning Loop (intent)

**Intent:** The probe and sync system should detect registry drift without modifying the compiler's input. The loop is:

1. `probeAttribute()` / `sweepNodeType()` — executes against live Cavalry, returns three-state result
2. `computeDiff()` / `runSyncSession()` — accumulates ≥2 runs, produces diff proposal
3. Human review — inspects `addedCandidates` / `removedCandidates` and manually updates `attributeRegistry.ts`
4. Updated registry is consumed by `semanticResolver.isApprovedAttribute()` in the next compile

**Reality:** The probe and sync modules are implemented. They are not wired to any automatic trigger or scheduled job. Running a probe sweep requires manually calling `sweepNodeType()` or `probeAttribute()` in application code and passing the result to `runSyncSession()`.

---

### B4. Three-Layer Separation (intent)

**Intent:** The system is divided into three non-overlapping authority domains:

| Layer | Authority | Constraint |
|-------|-----------|------------|
| Probe | Observational only — executes runtime queries, returns valid/invalid/unknown | MUST NOT determine correctness; "unknown" ≠ invalid |
| Sync | Statistical aggregation only — accumulates probe runs, proposes diffs | MUST NOT modify registry or influence compiler |
| Compiler | Authoritative — consumes only approved registry snapshots, generates deterministic JS | MUST NOT depend on live probe results or sync summaries |

**Reality:** Cross-layer isolation is enforced by module boundaries and function signatures, not by runtime guards. Nothing prevents a caller from passing a live probe result directly to the compiler. The separation is a design discipline, not a technical lock.

---

## C. CONTRACT RULES (TESTABLE STATEMENTS)

> Every rule is written so it can be validated. Rules without tests are marked explicitly.

---

### C1. Node Registry Contracts

**C1-1.** `canonicalize(input)` MUST return a `CanonicalNodeType` for any input in `CANONICAL_NODE_TYPES` or `ALIAS_MAP`, and `null` for all other inputs.
→ **test:** `nodeRegistry.test.ts`, `node-registry-guard.test.ts`

**C1-2.** `isCanonicalNodeType(value)` MUST return `true` only for strings present in `CANONICAL_NODE_TYPES`.
→ **test:** `nodeRegistry.test.ts` (I4), `dsl-contract.test.ts` (I1, I2, I3)

**C1-3.** Alias strings MUST NOT pass `isCanonicalNodeType`. Alias resolution is the sole responsibility of `canonicalize()`.
→ **test:** `dsl-contract.test.ts` (I3), `validator.test.ts` (I3), `node-registry-guard.test.ts` (I2, I4)

**C1-4.** `canonicalize()` MUST NOT be called inside `validateClip()`, `validateOps()`, or `generate()`.
→ **UNVERIFIABLE (documentation only)** — no lint rule enforces this. Verified by code inspection of `validators.ts` and `cavalryGenerator.ts`.

---

### C2. Validator Contracts

**C2-1.** `validateProgram(program)` MUST throw `MotionValidationError` for any `MotionProgram` that violates DSL invariants (wrong version, non-canonical layerType, out-of-range frames, unknown preset, unknown attribute).
→ **test:** `validator.test.ts` (I1, I2, I3), `node-registry-guard.test.ts` (I4)

**C2-2.** `validateClip()` MUST NOT mutate its input object.
→ **test:** `validator.test.ts` (I4), `node-registry-guard.test.ts` (I5)

**C2-3.** `validateClip()` error path MUST throw only `MotionValidationError` — no other error types.
→ **test:** `validator.test.ts` (I3)

**C2-4.** `validateOps()` MUST reject any op whose `attr` is not in `CONTROLLED_ATTRS` and any `easing` op whose `type` is not in `EASING_TYPES`.
→ **MISSING TEST COVERAGE** — no test file exercises `validateOps()` or `validateOp()` directly.

---

### C3. Compiler Contracts

**C3-1.** `compile(program)` MUST call `validateProgram(program)` before any other operation.
→ **UNVERIFIABLE (documentation only)** — enforced by code order in `motionCompiler.ts:60`. No test asserts this ordering contract directly.

**C3-2.** `compile(program)` MUST call `validateOps()` on the expanded ops before returning.
→ **UNVERIFIABLE (documentation only)** — enforced by code order in `motionCompiler.ts:87`. No test asserts this.

**C3-3.** `finalizeProgram()` MUST throw an `Error` if any clip target has `kind === "existingLayerByName"`.
→ **MISSING TEST COVERAGE** — `finalizeProgram.ts` has a hard throw at line 9 but no dedicated test file.

**C3-4.** `finalizeProgram()` MUST throw an `Error` if any `compilerOwned` target has a non-canonical `layerType`.
→ **MISSING TEST COVERAGE** — same file, line 16.

**C3-5.** The pipeline order is: `canonicalize()` → `validateProgram()` → `compile()` → `generate()`.
→ **test:** `node-registry-guard.test.ts` (I6) — asserts this order for all three input scenarios.

---

### C4. Generator Contracts

**C4-1.** `generate(plan)` MUST accept any valid `CompiledPlan` without throwing.
→ **test:** `generator-contract.test.ts` (I1)

**C4-2.** `generate(plan)` MUST throw `GeneratorError` (and only `GeneratorError`) for any compiler contract violation.
→ **test:** `generator-contract.test.ts` (I2, I3)

**C4-3.** `generate(plan)` MUST throw `GeneratorError` for any target with `kind === "existingLayerByName"`.
→ **MISSING TEST COVERAGE** — enforced at line 55 of `cavalryGenerator.ts` but no dedicated test.

**C4-4.** Generated JS MUST NOT contain alias strings. The canonical type is the only type emitted in `api.create()` calls.
→ **test:** `node-registry-guard.test.ts` — asserts `output.includes('api.create("textShape"')` and `!output.includes("basicText")`.

**C4-5.** `cavalryGenerator.ts` is the ONLY compiler file that references `api.*` Cavalry namespace calls.
→ **UNVERIFIABLE (documentation only)** — enforced by convention and code inspection.

---

### C5. Attribute Registry Contracts

**C5-1.** `isApprovedAttribute(nodeType, attribute)` MUST return `true` only for attributes explicitly present in `ATTRIBUTE_REGISTRY[nodeType]`. A `false` return means UNKNOWN — not confirmed invalid.
→ **MISSING TEST COVERAGE** — no test file for `attributeRegistry.ts`.

**C5-2.** `ATTRIBUTE_REGISTRY` MUST NOT be auto-updated. Every update requires human review of a diff produced by `computeDiff()`.
→ **UNVERIFIABLE (documentation only)** — no runtime guard prevents manual edits to the file.

**C5-3.** `isNegativelyConfirmed()` MUST NOT be used in validation, probe decision logic, or diff computation. It is a historical log lookup only.
→ **UNVERIFIABLE (documentation only)** — enforced by documentation and code inspection. The function is not called from any validator or compiler file.

---

### C6. Probe Contracts

**C6-1.** `parseProbeResponse()` MUST classify `PROBE_PASS` as `"valid"`, `PROBE_FAIL:` as `"invalid"`, and all other responses (including `PROBE_ERROR:` and absent markers) as `"unknown"`.
→ **MISSING TEST COVERAGE** — `parseProbeResponse()` is pure and deterministic but has no test file.

**C6-2.** `"unknown"` probe result MUST NOT be treated as `"invalid"`. Absent data is not negative evidence.
→ **UNVERIFIABLE (documentation only)** — enforced by `parseProbeResponse()` implementation and `attributeSync.ts` filter logic. No test asserts the semantic separation explicitly.

**C6-3.** `probeAttribute()` connectivity failure MUST return `{ status: "unknown" }`, never `{ status: "invalid" }`.
→ **MISSING TEST COVERAGE** — enforced by `probeAttribute.ts:371` catch block but no test.

---

### C7. Sync Contracts

**C7-1.** `computeDiff()` MUST NOT modify `ATTRIBUTE_REGISTRY` or any `AttributeRegistry` object.
→ **MISSING TEST COVERAGE** — function is read-only by implementation but no mutation test exists.

**C7-2.** `isConfirmedValidCandidate(runs)` MUST return `true` only when ≥ `MIN_RUNS_REQUIRED` explicit (non-unknown) runs ALL return `"valid"`.
→ **MISSING TEST COVERAGE** — no test file for `attributeSync.ts`.

**C7-3.** `isInconsistent(runs)` MUST NOT promote inconsistent results to either candidate list in `computeDiff()`.
→ **MISSING TEST COVERAGE**

---

### C8. Semantic Resolver Contracts

**C8-1.** `resolveSemantics()` MUST drop any attribute key not present in `ATTRIBUTE_REGISTRY[nodeType]`. It MUST NOT guess, infer, or fuzzy-match.
→ **MISSING TEST COVERAGE** — no test file for `semanticResolver.ts`.

**C8-2.** `resolveSemantics()` MUST NOT mutate its input record.
→ **MISSING TEST COVERAGE**

**C8-3.** `assertSemanticTrace()` MUST use strict equality only — no fuzzy matching, no scoring.
→ **MISSING TEST COVERAGE** — function is pure and deterministic but has no test file.

---

## D. KNOWN LIMITATIONS (EXPLICIT)

> No softening language.

---

**D1. No runtime enforcement of compiler-first pipeline.**
`cavalry_run_script` is directly callable with raw arbitrary JavaScript. Any caller — including Claude acting on NL input — can bypass the compiler entirely. The NL → compiler-only constraint is a documentation rule, not a code constraint.

**D2. `api.log()` output is unreliable under Stallion v0.7.**
`api.log()` output may not appear in the Stallion HTTP response body. This makes it impossible to reliably retrieve values (layer IDs, attribute readbacks) from Cavalry within a single script execution. Any tool or pattern that depends on `api.log()` returning data is fragile.

**D3. HTTP 200 does not mean visual correctness.**
Stallion returns HTTP 200 for any executed script, including ones with wrong attribute paths, nonsensical values, or silently rejected API calls. The MCP returns `"Script executed successfully."` when Stallion returns an empty body. There is no visual feedback loop.

**D4. Attribute validation depends on registry completeness.**
`isApprovedAttribute()` returns `false` for any attribute not in `ATTRIBUTE_REGISTRY`. This is a safety boundary but not a complete truth: an attribute absent from the registry may still be valid in Cavalry. The registry covers only `textShape` as of 2026-05-08.

**D5. Probe system is read-only and asynchronous. It has no automatic trigger.**
There is no scheduled probe sweep, no hook that runs probes on startup, and no mechanism that automatically updates the registry. The probe-sync loop only runs when manually invoked by application code.

**D6. `existingLayerByName` target kind is rejected at generation time.**
The DSL accepts `existingLayerByName` (the validator passes it if `name` is a non-empty string). The generator throws `GeneratorError` for it. There is no verified scene-query API for name-based layer lookup in the v1 runtime.

**D7. Identity system only protects `compilerOwned` targets.**
`existingLayerById` targets carry no identity guarantee — the caller must supply a valid internal ID, which requires a prior scene query. Layer IDs are not persistent across `cavalry_run_script` calls.

**D8. `MC_DUPLICATE` error halts the entire script.**
If two layers share the same `MC__` name or `userData.mcId`, the reconciliation `throw` stops the script at that target. All animation ops for subsequent targets do not execute.

**D9. Registry approved date is frozen.**
`ATTRIBUTE_REGISTRY["textShape"].approvedAt = "2026-05-08"`. No subsequent live probe has been run. The registry may have drifted from the current Cavalry runtime. Probe candidates `stroke.color`, `stroke.width`, `anchor.x`, `anchor.y` remain unverified.

**D10. Only one canonical node type exists.**
`CANONICAL_NODE_TYPES = ["textShape"]`. No other layer type has a verified attribute registry or a confirmed `api.create()` call. All other Cavalry layer types are unknown to the compiler pipeline.

**D11. README describes a system that does not exist.**
README lists 21 tools; current `src/index.ts` has 2. The example conversation flow in README is impossible with the current 2-tool implementation.

---

## E. TOOL SURFACE — NL FLOW vs BYPASS

### ALLOWED IN NL → MOTION FLOW (architectural intent)

The compiler pipeline (`intentParser → motionCompiler → cavalryGenerator`) is the intended path for all natural language motion requests.

There is no MCP tool named `cavalry_compile`. The compiler is invoked by calling its TypeScript functions directly in application code, then passing the output string to `cavalry_run_script`.

### NOT ALLOWED IN NL → MOTION FLOW

**`cavalry_run_script`** — bypass tool. Executes arbitrary raw JavaScript directly in Cavalry. No compiler validation. No attribute registry check. Silent failure on wrong API usage.

> NL → motion requests MUST be validated against the compiler pipeline contract rules (§C). Any use of `cavalry_run_script` for NL input is outside contract scope. Enforcement depends entirely on tool routing discipline — there is no runtime guard.

### DEBUGGING AND MANUAL SCRIPTS

`cavalry_run_script` is explicitly permitted for:
- Debugging compiler output (manually passing generated JS)
- One-off manual scene operations
- Running probe scripts from `src/schema/probeAttribute.ts`

---

## F. CONTRACT → CODE MAPPING

| Contract Rule | File | Function / Constant | Test |
|---------------|------|---------------------|------|
| C1-1: canonicalize determinism | `nodeRegistry.ts` | `canonicalize()` | `nodeRegistry.test.ts` |
| C1-2: isCanonicalNodeType guard | `nodeRegistry.ts` | `isCanonicalNodeType()` | `nodeRegistry.test.ts`, `dsl-contract.test.ts` |
| C1-3: alias strings fail canonical guard | `nodeRegistry.ts` | `isCanonicalNodeType()` | `dsl-contract.test.ts` (I3), `validator.test.ts` (I3) |
| C1-4: no canonicalize inside compiler | `validators.ts`, `cavalryGenerator.ts` | — | **MISSING TEST COVERAGE** |
| C2-1: validateProgram throws on DSL violations | `validators.ts` | `validateProgram()` | `validator.test.ts`, `node-registry-guard.test.ts` |
| C2-2: validateClip no mutation | `validators.ts` | `validateClip()` | `validator.test.ts` (I4) |
| C2-3: only MotionValidationError thrown | `validators.ts` | `validateClip()` | `validator.test.ts` (I3) |
| C2-4: validateOps rejects unknown attrs | `validators.ts` | `validateOp()` | **MISSING TEST COVERAGE** |
| C3-1: validateProgram called first in compile() | `motionCompiler.ts:60` | `compile()` | **MISSING TEST COVERAGE** |
| C3-2: validateOps called last in compile() | `motionCompiler.ts:87` | `compile()` | **MISSING TEST COVERAGE** |
| C3-3: finalizeProgram rejects existingLayerByName | `finalizeProgram.ts:9` | `finalizeProgram()` | **MISSING TEST COVERAGE** |
| C3-4: finalizeProgram rejects non-canonical type | `finalizeProgram.ts:16` | `finalizeProgram()` | **MISSING TEST COVERAGE** |
| C3-5: pipeline order enforced | `node-registry-guard.test.ts` | full pipeline | `node-registry-guard.test.ts` (I6) |
| C4-1: generate() accepts valid plan | `cavalryGenerator.ts` | `generate()` | `generator-contract.test.ts` (I1) |
| C4-2: generate() throws only GeneratorError | `cavalryGenerator.ts` | `generate()` | `generator-contract.test.ts` (I2, I3) |
| C4-3: generate() rejects existingLayerByName | `cavalryGenerator.ts:55` | `emitTargetResolution()` | **MISSING TEST COVERAGE** |
| C4-4: aliases absent from generated JS | `cavalryGenerator.ts` | `generate()` | `node-registry-guard.test.ts` (I2) |
| C4-5: only cavalryGenerator uses api.* | `cavalryGenerator.ts` | — | **MISSING TEST COVERAGE** |
| C5-1: isApprovedAttribute lookup only | `attributeRegistry.ts` | `isApprovedAttribute()` | **MISSING TEST COVERAGE** |
| C5-2: ATTRIBUTE_REGISTRY no auto-update | `attributeRegistry.ts` | `ATTRIBUTE_REGISTRY` | **UNVERIFIABLE** |
| C5-3: isNegativelyConfirmed not used in validation | `attributeRegistry.ts` | `isNegativelyConfirmed()` | **UNVERIFIABLE** |
| C6-1: parseProbeResponse classification | `probeAttribute.ts` | `parseProbeResponse()` | **MISSING TEST COVERAGE** |
| C6-2: unknown ≠ invalid | `probeAttribute.ts`, `attributeSync.ts` | filter logic | **MISSING TEST COVERAGE** |
| C6-3: connection failure → unknown | `probeAttribute.ts:371` | `probeAttribute()` catch | **MISSING TEST COVERAGE** |
| C7-1: computeDiff() is read-only | `attributeSync.ts` | `computeDiff()` | **MISSING TEST COVERAGE** |
| C7-2: isConfirmedValidCandidate threshold | `attributeSync.ts` | `isConfirmedValidCandidate()` | **MISSING TEST COVERAGE** |
| C7-3: inconsistent results not promoted | `attributeSync.ts` | `computeDiff()` | **MISSING TEST COVERAGE** |
| C8-1: semanticResolver drops unknown attrs | `semanticResolver.ts` | `resolveSemantics()` | **MISSING TEST COVERAGE** |
| C8-2: semanticResolver no mutation | `semanticResolver.ts` | `resolveSemantics()` | **MISSING TEST COVERAGE** |
| C8-3: assertSemanticTrace strict equality | `semanticResolver.ts` | `assertSemanticTrace()` | **MISSING TEST COVERAGE** |

---

## G. ARCHIVED IMPLEMENTATION REFERENCE

### `archive_versions/index_pre_stallion_v07.ts`

18-tool wrapper implementation, broken by Stallion v0.7's changed `api.log()` behavior. Not in active use.

All value-returning tools depended on `api.log()` output flowing back through Stallion's HTTP response. The entire wrapper layer was replaced with a single raw-script passthrough.

---

_Last updated: 2026-05-09 | Branch: motion-runtime | Restructured as contract spec_
