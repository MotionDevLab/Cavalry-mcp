# ACTIVE_CONTEXT.md — Cavalry MCP Architecture Contract

> **Purpose:** Contract-based system specification. Every critical claim maps to a verifiable runtime fact or test.
>
> **Authority:** This document supersedes README.md and CLAUDE.md where they conflict.
>
> **Final principle:** Only rules that map to code or tests are considered enforceable. All other statements are architectural intent.

---

## System Status Summary

**Text-on-canvas compiler pipeline status (2026-05-15): production-stable for `textShape`.**

| Phase | Status | Result |
|-------|--------|--------|
| Phase 1 | COMPLETE | `constructorFields` wired from semantic resolution into compiler-owned targets |
| Phase 2A | COMPLETE | `textShape.text` attribute validated by probe and runtime visual confirmation |
| Phase 2B | COMPLETE | Unified constructorField mapping and emission finalized |

The text pipeline no longer depends on runtime attribute discovery. `textShape.text` is a confirmed Cavalry visual binding, mapped deterministically to the `text` attribute and applied through the compiler-generated runtime path.

---

## A. RUNTIME FACTS (VERIFIED)

> Only facts directly observable in code. No interpretation.

---

### A1. MCP Tool Surface

**`src/index.ts`** — v1.2.1

**Production surface (always registered):**

| Tool | Input | What it does |
|------|-------|--------------|
| `cavalry_ping` | none | `GET 127.0.0.1:8080/` with 2s timeout; returns boolean |
| `cavalry_run_motion` | `prompt: string`, `layerId?: string`, `startFrame?: number`, `durationFrames?: number` | Routes NL through compiler pipeline: `parseIntent → buildProgramFromIntent → compile → generate → sendAuthorizedToCavalry` |

**Debug surface (registered only when `process.env.CAVALRY_MCP_DEBUG === "1"`):**

| Tool | Input | What it does |
|------|-------|--------------|
| `cavalry_run_script` | `rawJs: string` | Pattern-validates JS, sends raw string to Stallion via `sendRawToCavalry`. Debug-only. Unreachable from the NL compiler pipeline. |

**Production MCP sessions expose exactly two tools: `cavalry_ping` and `cavalry_run_motion`.** `cavalry_run_script` is absent from production sessions.

**Enforced architecture (`src/index.ts`):**
- `registerTools(server)` is the sole MCP tool registration surface. Called exactly once from `main()`. Idempotency-guarded: double-call throws `"registerTools: already invoked. Tool registry is bootstrap-only and single-call."` AST enforcement: no `server.tool()` call exists outside `registerTools`; no `new McpServer()` exists outside `main()` — validated by G2 AST walk on every CI run.
- `process.env.CAVALRY_MCP_DEBUG` is read at `registerTools()` call time, not at module load time. Static env-capture bypass is structurally impossible.
- `main()` is ESM-entry guarded: `process.argv[1] === fileURLToPath(import.meta.url)`. Test imports of `src/index.ts` do not start `StdioServerTransport` and do not block the event loop.
- `handleRunMotion` calls `sendAuthorizedToCavalry` only. `sendRawToCavalry` is architecturally unreachable from the NL pipeline by import structure — enforced by G4 source-level assertion.
- `handleRunScript` calls `sendRawToCavalry` only. Registered only when `CAVALRY_MCP_DEBUG === "1"`.

`validateCode()` blocks Node.js-dangerous patterns (`process.exit`, `child_process`, `require(`, `fs.`, `net.`) in both `runCompiled` and `runRaw`. Does NOT validate Cavalry API correctness.

---

### A2. Execution Flow (observed, verified)

**Production path (`cavalry_run_motion` — always registered):**

```
User natural language
        │  MCP stdio transport
        ▼
  cavalry_run_motion
  ─ parseIntent()          (NL → MotionProgram IR; null on unrecognised input → returns error, Stallion never contacted)
  ─ buildProgramFromIntent()
  ─ compile()              (MotionProgram → CompiledPlan; rejects on DSL violations)
  ─ generate()             (CompiledPlan → CompiledJs + TrustToken via mintTrustToken())
  ─ runCompiled()
  ─ validateCode()         (Node.js dangerous patterns blocked)
  ─ sendAuthorizedToCavalry(AuthorizedExecution)
        │  consumeTrustToken(token)  ← throws on unknown/consumed token
        │  HTTP POST 127.0.0.1:8080/post
        │  body: { type: "script", code: "<CompiledJs>" }
        ▼
  Stallion v0.7            (HTTP server inside Cavalry)
  ─ executes JS in Cavalry's JS Engine
  ─ returns HTTP response text
  ⚠ api.log() output may NOT appear in response body
        │
        ▼
  Cavalry                  (api.* namespace)
```

**Debug path (`cavalry_run_script` — registered only when `CAVALRY_MCP_DEBUG=1`):**

```
rawJs string
        │  MCP stdio transport
        ▼
  cavalry_run_script
  ─ runRaw()
  ─ validateCode()         (Node.js dangerous patterns blocked)
  ─ sendRawToCavalry(code) ← no TrustToken; debug surface only
        │  HTTP POST 127.0.0.1:8080/post
        │  body: { type: "script", code: "<raw JS string>" }
        ▼
  Stallion v0.7
```

`sendRawToCavalry` is architecturally unreachable from `handleRunMotion`. The two execution paths share `validateCode()` and `postScript()` but are structurally separate entry points.

**Transport:** stdio (`StdioServerTransport`)
**Stallion endpoint:** `POST http://127.0.0.1:8080/post`
**Connectivity check:** `GET http://127.0.0.1:8080/` with 2-second timeout
**Return value from Cavalry:** raw HTTP response text — `api.log()` output is NOT guaranteed to surface under Stallion v0.7

---

### A3. Compiler Pipeline Files (compiler pipeline, imported by `src/index.ts`)

All files under `src/compiler/`. The full pipeline (`parseIntent → buildProgramFromIntent → compile → generate`) is imported and called by `src/index.ts` via `handleRunMotion`.

| File | Role |
|------|------|
| `motionDSL.ts` | DSL types: `MotionProgram`, `MotionClip`, `MotionTarget`, `CanonicalNodeType`, `CompiledPlan`, controlled vocabularies (`CONTROLLED_ATTRS`, `EASING_TYPES`, `PRESET_IDS`) |
| `motionCompiler.ts` | `compile(program)` — runs `validateProgram` → preset expansion → `finalizeProgram` → `validateOps` → returns `CompiledPlan` |
| `validators.ts` | `validateProgram()`, `validateClip()`, `validateOps()`, `validateOp()` — pure, throw `MotionValidationError`, no mutation |
| `finalizeProgram.ts` | Hard runtime boundary: throws on `existingLayerByName` and non-canonical `compilerOwned` types |
| `cavalryGenerator.ts` | `generate(plan)` — `CompiledPlan → AuthorizedExecution { code: CompiledJs, token: TrustToken }`; mints `TrustToken` via `mintTrustToken()`; throws `GeneratorError` on contract violations. Only authorized JS emission site. |
| `nodeRegistry.ts` | `CANONICAL_NODE_TYPES`, `isCanonicalNodeType()`, `ALIAS_MAP`, `canonicalize()` |
| `sceneIdentityResolver.ts` | `emitReconciliation()` — generates JS reconciliation block for `compilerOwned` targets; resolves layer identity, maps constructorFields, and emits post-resolution `api.set()` |
| `constructorFieldMapping.ts` | `resolveConstructorAttr()` — maps semantic constructor fields to confirmed Cavalry attribute paths (`textShape.text → text`) |
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

### A3.1. Text ConstructorField Pipeline (Stable Runtime Path)

**System behavior:** `text` constructorField is fully supported end-to-end for `textShape`. Text rendering is deterministic across both layer creation and layer reuse. There are no branching differences between create/reuse paths: the layer is resolved first, then constructorFields are applied once.

Stable runtime path:

```
cavalry_run_motion(text)
  → buildProgramFromIntent
    → semanticResolver (constructorFields extraction)
      → MotionTarget (compilerOwned)
        → sceneIdentityResolver
          → mapConstructorFields
          → emitConstructorFieldLines
            → api.set(layer, { text: value })
```

Final pipeline definition:

- Semantic layer extracts `constructorFields`.
- Compiler attaches them to `MotionTarget.compilerOwned`.
- Scene resolver resolves layer identity through create or reuse reconciliation.
- ConstructorFields are mapped once via `mapConstructorFields`.
- Emission layer produces a single consolidated `api.set` call.
- Cavalry renders text immediately on canvas.

Confirmed attribute binding:

```
textShape.text → Cavalry visual text layer content
```

`api.set` for constructorFields is emitted once per execution after layer resolution. The same emission path applies whether the layer is newly created or reused.

Verified runtime (2026-05-15):

```
cavalry_run_motion({ text: "TESTING" })

→ Layer: MC__textshape
→ Canvas: "TESTING" rendered correctly
→ Animation: opacity 0 → 100
→ Re-run: identical output (idempotent behavior confirmed)
→ No fallback to default "Cavalry"
```

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
| `text` | string | 2026-05-08; runtime visual binding confirmed 2026-05-15 |

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

Implemented in `src/compiler/sceneIdentityResolver.ts` and `src/compiler/mcIdGenerator.ts`. Invoked automatically via the `cavalryGenerator.ts` → `sceneIdentityResolver.ts` delegation path when `cavalry_run_motion` processes a `compilerOwned` target.

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

**Compiler tests** — `src/compiler/__tests__/`:

| File | Tests | What they cover |
|------|-------|-----------------|
| `dsl-contract.test.ts` | 3 | `isCanonicalNodeType`: canonical passes, invalid fails, alias fails |
| `generator-contract.test.ts` | 3 | `generate()`: valid plan accepted, invalid state throws `GeneratorError` |
| `validator.test.ts` | 4 | `validateClip()`: canonical passes, non-canonical rejects, alias rejects, no mutation |
| `nodeRegistry.test.ts` | 6 | `canonicalize()`, `isCanonicalNodeType()`: determinism, null on unknown, identity |
| `node-registry-guard.test.ts` | 17 | Full pipeline: canonical, alias, unknown input — all three stages |
| `constructor-fields.test.ts` | 6 | CF1-CF5 + CF-PIPELINE: text constructorField propagation, post-resolution emission, create/reuse parity |
| `constructor-field-mapping.test.ts` | 3 | CMAP: `textShape.text` confirmed mapping, unknown layer rejection, invalid mapping guard |

**CI guard tests** — `src/__tests__/` (added in v1.2.1):

| File | Tests | What they cover |
|------|-------|-----------------|
| `tool-surface-snapshot.test.ts` | 4 | G1: production surface = {cavalry_ping, cavalry_run_motion}; debug surface adds cavalry_run_script; double-call throws |
| `bootstrap.test.ts` | 6 | G2: AST-enforced: `server.tool()` only inside `registerTools`; `new McpServer()` only inside `main`; grep defense-in-depth; idempotency |
| `api-grep.test.ts` | 5 | G3: file-exact allowlist for Cavalry JS emission; `mintTrustToken` single non-test import; `CompiledJs` single non-test cast site |
| `nl-firewall.test.ts` | 8 | G4: unrecognised NL returns "Cavalry was NOT contacted"; valid presets reach execution layer; `handleRunMotion` never calls `sendRawToCavalry` |
| `trust-token.test.ts` | 14 | G5: unknown sessionId rejected; single-use enforcement; copy-literal-after-consumption invalid; invalid issuer throws; successful path; frozen token |

**Test runner:** `npm test` → `tsx --test "src/**/*.test.ts"`. **79/79 tests passing as of 2026-05-15.**

**Text constructorField validation:** CF1-CF5 + CF-PIPELINE validated; CMAP tests passing; constructorField emission verified deterministic.

---

### A9. Runtime Implementation Structure

**`src/index.ts`** — MCP server entry point

| Export | Signature | Role |
|--------|-----------|------|
| `registerTools(server)` | `(McpServer) → void` | Bootstrap-only tool registry. Idempotency-guarded. |
| `handlePing()` | `() → Promise<Response>` | `cavalry_ping` handler |
| `handleRunMotion(params)` | `({ prompt, layerId?, startFrame?, durationFrames? }) → Promise<Response>` | `cavalry_run_motion` handler — full compiler pipeline |
| `handleRunScript(params)` | `({ rawJs }) → Promise<Response>` | `cavalry_run_script` handler — debug bypass only |
| `__resetBootstrapForTests()` | `() → void` | Test-only: resets idempotency guard. No production use. |
| `runCompiled(exec)` | `(AuthorizedExecution) → Promise<string>` | Calls `validateCode()` then `sendAuthorizedToCavalry()` |
| `runRaw(code)` | `(string) → Promise<string>` | Calls `validateCode()` then `sendRawToCavalry()` |

**`src/stallion.ts`** — Stallion HTTP bridge

| Export | Signature | Role |
|--------|-----------|------|
| `pingStallion()` | `() → Promise<boolean>` | GET `127.0.0.1:8080/` with 2s timeout |
| `sendAuthorizedToCavalry(exec, type?)` | `(AuthorizedExecution, string?) → Promise<string>` | Calls `consumeTrustToken(exec.token)` then `postScript()` |
| `sendRawToCavalry(code, type?)` | `(string, string?) → Promise<string>` | Calls `postScript()` directly — no token |
| `postScript(code, type?)` | private | `POST 127.0.0.1:8080/post` |

**`src/runtime/trustToken.ts`** — Execution authorization

| Export | Signature | Role |
|--------|-----------|------|
| `TrustToken` | `type` | `{ sessionId: string, issuedBy: "cavalryGenerator", timestamp: number }` — frozen on mint |
| `AuthorizedExecution` | `type` | `{ code: CompiledJs, token: TrustToken }` |
| `mintTrustToken()` | `() → TrustToken` | Mints token, registers `sessionId` in `liveTokens`. Called only from `cavalryGenerator.generate()`. |
| `consumeTrustToken(token)` | `(TrustToken) → void` | Registry lookup + single-use deletion. Throws on unknown or consumed sessionId. |
| `__resetTrustRegistryForTests()` | `() → void` | Test-only: clears `liveTokens`. No production use. |

**`src/compiler/cavalryGenerator.ts`** — Branded JS lowering

| Export | Signature | Role |
|--------|-----------|------|
| `CompiledJs` | `type` | `string & { readonly __compiledJs: unique symbol }` — generator-owned brand |
| `generate(plan)` | `(CompiledPlan) → AuthorizedExecution` | Only authorized JS emission site. Mints `TrustToken` on success. |

---

### A10. CI/Security Enforcement Summary (v1.2.1)

| Guard | Test File | Enforcement Mechanism | Status |
|-------|-----------|-----------------------|--------|
| G1 — Tool Surface | `tool-surface-snapshot.test.ts` | Stub `McpServer` records `tool()` calls; asserts exact set per env | ✅ 4 tests |
| G2 — Bootstrap-Only Registry | `bootstrap.test.ts` | TypeScript Compiler API AST walk: `server.tool()` only inside `registerTools`; `new McpServer()` only inside `main` | ✅ 6 tests |
| G3 — Compiler Emission Allowlist | `api-grep.test.ts` | File-exact allowlist; AST template-literal detection; `mintTrustToken` single-import; `CompiledJs` single-cast-site | ✅ 5 tests |
| G4 — NL Firewall | `nl-firewall.test.ts` | Direct `handleRunMotion` calls; source-level brace-count + line-walk | ✅ 8 tests |
| G5 — TrustToken Single-Use | `trust-token.test.ts` | Registry-based sessionId lookup; single-use deletion; copy-literal; issuer check | ✅ 14 tests |

**`CompiledJs` brand enforcement:** exactly one `as CompiledJs` cast in non-test source → `src/compiler/cavalryGenerator.ts`. CI fails on any additional cast.

**`mintTrustToken` import enforcement:** exactly one non-test, non-definition-file import → `src/compiler/cavalryGenerator.ts`. CI fails on any additional import or barrel re-export.

**Total:** 79/79 tests passing as of 2026-05-15. CF1-CF5 + CF-PIPELINE validated, CMAP tests passing, and constructorField emission verified deterministic.

---

## B. ARCHITECTURAL INTENT (DESIGN LAYER)

> Intended system design. Clearly marked as **intent, not enforcement**.

---

### B0. Enforced System Invariants (v1.2.1 — enforced in code + CI)

These invariants are **enforced** — each maps to a runtime constraint, a branded type, or a CI guard test that fails on violation.

| # | Invariant | Enforcement |
|---|-----------|-------------|
| I1 | **NL Routing Firewall.** Natural language enters only via `cavalry_run_motion`. NL never reaches `sendRawToCavalry` or any raw execution surface. | G4 source-level assertion; import structure of `handleRunMotion` |
| I2 | **Tool Surface Isolation.** Production surface = `{cavalry_ping, cavalry_run_motion}`. `cavalry_run_script` registered iff `CAVALRY_MCP_DEBUG === "1"`. | G1 stub test; env read at call time |
| I3 | **Compiler IR Integrity.** Branded `MotionProgram` and `CompiledPlan`. No compiler stage emits JS or executable strings; only `cavalryGenerator` produces `CompiledJs`. | Branded `unique symbol` types; G3 allowlist |
| I4 | **Execution Authorization.** A `TrustToken` minted only inside `cavalryGenerator` is required for execution. Tokens are single-use, registry-validated, generator-minted. | G5 trust-token tests; `consumeTrustToken()` in `sendAuthorizedToCavalry` |
| I5 | **Generator-Only JS Emission.** Executable Cavalry JS may only be constructed inside `cavalryGenerator.ts` and its delegated helper `sceneIdentityResolver.ts`. | G3 file-exact allowlist; `CompiledJs` single-cast-site assertion |
| I6 | **No NL Fallback Execution.** Any failure during intent parsing, compilation, or plan finalization terminates before Stallion contact. No fallback routes NL into raw execution. | `handleRunMotion` returns error response before `runCompiled()` on any compiler failure |
| I7 | **Validator Purity.** Validation stages reject or report; they do not mutate IR, inject defaults, normalize attributes, infer intent, or synthesize behavior. | `validateClip()` no-mutation test (C2-2); structural enforcement via `CompiledPlan` brand |
| I8 | **Generator Purity.** `cavalryGenerator` is a pure lowering stage from validated `CompiledPlan` → `CompiledJs`. No reinterpretation, no fallback, no upstream mutation. | `CompiledJs` brand; `generate()` accepts only `CompiledPlan` |
| I9 | **Tool Registry Bootstrap.** Tool registry is constructed in a single deterministic `registerTools(server)` call. No module-scope, lazy, or runtime tool mutation. | G2 AST walk; idempotency guard; ESM entry-point guard |
| CF-T1 | **Text ConstructorFields Bind Deterministically.** ConstructorFields for `textShape` are fully deterministic and bind directly to Cavalry visual state via the `text` attribute. | `constructor-field-mapping.test.ts`; 2026-05-15 runtime verification |
| CF-T2 | **Text ConstructorFields Apply on Create and Reuse.** ConstructorFields are applied on both layer creation and layer reuse with no divergence between reconciliation paths. | `constructor-fields.test.ts` CF4-CF5; post-resolution emission in `sceneIdentityResolver.ts` |
| CF-T3 | **Single ConstructorField Emission.** `api.set` for constructorFields is emitted exactly once per execution per resolved layer. | `constructor-fields.test.ts` CF4-CF5 + CF-PIPELINE; `emitConstructorFieldLines()` |

---

### B1. Compiler-First NL Pipeline (**enforced as of v1.2.1**)

**Enforced:** All natural language motion requests flow through the compiler pipeline. `cavalry_run_script` is env-gated and unreachable from the NL path.

```
NL → cavalry_run_motion → intentParser → buildProgramFromIntent → compile → generate → sendAuthorizedToCavalry → Cavalry
```

The production surface (`cavalry_ping` + `cavalry_run_motion`) has no direct raw-JS execution path. `cavalry_run_script` (`sendRawToCavalry`) is available only when `CAVALRY_MCP_DEBUG=1` and is architecturally separated — `handleRunMotion` cannot reach `sendRawToCavalry` by import structure (enforced by G4).

---

### B2. Semantic Resolver Role (intent)

**Intent:** `semanticResolver.ts` is a pre-compiler input normalizer that splits arbitrary raw input into three disjoint categories before the compiler pipeline sees it.

- `constructorFields` — `text`, `name` (layer identity)
- `runtimeAttributes` — only attributes present in the approved registry for the node type
- `motionIntent` — normalized preset ID or keyframe hints; `null` when unrecognized

Unknown input keys are dropped, not guessed. No inference, no fuzzy matching.

**Reality:** `semanticResolver` is implemented and functional. For the `cavalry_run_motion` text path, `buildProgramFromIntent` consumes semantic `constructorFields` and attaches them to `MotionTarget.compilerOwned`. `sceneIdentityResolver` then resolves layer identity, maps constructorFields through `mapConstructorFields`, and emits one post-resolution `api.set` through `emitConstructorFieldLines`. This is the stable runtime path for `textShape.text`.

---

### B3. Probe-Sync Learning Loop (intent)

**Intent:** The probe and sync system should detect registry drift without modifying the compiler's input. It remains available for future attribute discovery outside the confirmed `textShape.text` constructorField pipeline. The loop is:

1. `probeAttribute()` / `sweepNodeType()` — executes against live Cavalry, returns three-state result
2. `computeDiff()` / `runSyncSession()` — accumulates ≥2 runs, produces diff proposal
3. Human review — inspects `addedCandidates` / `removedCandidates` and manually updates `attributeRegistry.ts`
4. Updated registry is consumed by `semanticResolver.isApprovedAttribute()` in the next compile

**Reality:** The probe and sync modules are implemented. They are not wired to any automatic trigger or scheduled job. Running a probe sweep requires manually calling `sweepNodeType()` or `probeAttribute()` in application code and passing the result to `runSyncSession()`. Probing is not required for `textShape.text` rendering validation; that binding is already confirmed and production-stable.

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

### B5. MotionOps IR Expansion Compatibility (forward path)

The current `CompiledPlan` IR is minimal (preset-based, four operations). Future expansion toward a formal MotionOps IR layer (AE-MCP-style operation graph with explicit operation schemas) is anticipated. Any IR expansion **must preserve** all enforced invariants:

- **Deterministic compilation** — same NL input + same plan input → same `CompiledJs` output
- **Validator-first architecture** — no IR stage generates JS; only `cavalryGenerator` lowers to `CompiledJs`
- **Generator-only JS emission** — `cavalryGenerator.ts` + `sceneIdentityResolver.ts` remain the only authorized JS emission sites (G3 allowlist must be revised if additional authorized files are introduced)
- **Explicit operation schemas** — all new IR operations must be typed and schema-validated before reaching the generator
- **No direct NL → JS execution** — any new path must go through `mintTrustToken()` + `sendAuthorizedToCavalry()`, never `sendRawToCavalry()`

The `CompiledJs` brand and `TrustToken` registry are designed to be forward-compatible with expanded IR operation types without requiring changes to the execution authorization layer.

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

**D1. ~~No runtime enforcement of compiler-first pipeline.~~ (Resolved in v1.2.1)**
`cavalry_run_script` is now env-gated (`CAVALRY_MCP_DEBUG=1` only) and absent from the production MCP surface. `handleRunMotion` routes exclusively through the compiler pipeline and cannot reach `sendRawToCavalry` by import structure. The four-layer enforcement (Bootstrap G2, Env-gate G1, Compiler IR brands I3, TrustToken G5) closes this limitation. See §B0 (Invariants I1, I2, I4) and §A1 for current enforcement status.

**D2. `api.log()` output is unreliable under Stallion v0.7.**
`api.log()` output may not appear in the Stallion HTTP response body. This makes it impossible to reliably retrieve values (layer IDs, attribute readbacks) from Cavalry within a single script execution. Any tool or pattern that depends on `api.log()` returning data is fragile.

**D3. HTTP 200 does not mean visual correctness.**
Stallion returns HTTP 200 for any executed script, including ones with wrong attribute paths, nonsensical values, or silently rejected API calls. The MCP returns `"Script executed successfully."` when Stallion returns an empty body. There is no visual feedback loop.

**D4. Attribute validation depends on registry completeness outside confirmed constructorFields.**
`isApprovedAttribute()` returns `false` for any runtime attribute not in `ATTRIBUTE_REGISTRY`. This is a safety boundary but not a complete truth: an attribute absent from the registry may still be valid in Cavalry. The `textShape.text` constructorField path is confirmed and does not depend on runtime attribute discovery. Other runtime attributes and future layer types still depend on registry completeness.

**D5. Probe system is read-only and asynchronous. It has no automatic trigger.**
There is no scheduled probe sweep, no hook that runs probes on startup, and no mechanism that automatically updates the registry. The probe-sync loop only runs when manually invoked by application code.

**D6. `existingLayerByName` target kind is rejected at generation time.**
The DSL accepts `existingLayerByName` (the validator passes it if `name` is a non-empty string). The generator throws `GeneratorError` for it. There is no verified scene-query API for name-based layer lookup in the v1 runtime.

**D7. Identity system only protects `compilerOwned` targets.**
`existingLayerById` targets carry no identity guarantee — the caller must supply a valid internal ID, which requires a prior scene query. Layer IDs are not persistent across `cavalry_run_script` calls.

**D8. `MC_DUPLICATE` error halts the entire script.**
If two layers share the same `MC__` name or `userData.mcId`, the reconciliation `throw` stops the script at that target. All animation ops for subsequent targets do not execute.

**D9. Registry approved date is historical; text constructorField binding is current.**
`ATTRIBUTE_REGISTRY["textShape"].approvedAt = "2026-05-08"`. `textShape.text` was additionally confirmed through runtime visual validation on 2026-05-15 and is production-stable for text rendering. Probe candidates `stroke.color`, `stroke.width`, `anchor.x`, `anchor.y` remain unverified.

**D10. Only one canonical node type exists.**
`CANONICAL_NODE_TYPES = ["textShape"]`. No other layer type has a verified attribute registry or a confirmed `api.create()` call. All other Cavalry layer types are unknown to the compiler pipeline.

**D11. README describes a system that does not exist.**
README lists 21 tools; current `src/index.ts` has 2. The example conversation flow in README is impossible with the current 2-tool implementation.

---

## E. TOOL SURFACE — NL FLOW vs BYPASS

### NL → MOTION FLOW (enforced, v1.2.1)

`cavalry_run_motion` is the **only** MCP tool that accepts natural language motion requests. It routes NL through the full compiler pipeline:

```
cavalry_run_motion → parseIntent → buildProgramFromIntent → compile → generate → sendAuthorizedToCavalry
```

A `TrustToken` minted by `cavalryGenerator.generate()` is required for execution. Any compiler stage failure returns an error before Stallion is contacted.

Supported NL presets: `fade_in`, `bounce_in`, `slide_left`, `scale_pop`.

For `textShape` rendering, the compiler also supports `text` constructorField propagation through `buildProgramFromIntent → MotionTarget.compilerOwned → sceneIdentityResolver → api.set(layer, { text: value })`. This path is deterministic for both create and reuse reconciliation.

### BYPASS PATH (debug only, env-gated)

**`cavalry_run_script`** — registered only when `CAVALRY_MCP_DEBUG=1`. Absent from production sessions.

Accepts `rawJs: string`. No compiler validation, no `TrustToken`, no attribute registry check. Executes raw JS directly in Cavalry via `sendRawToCavalry`. Silent failure on wrong API usage.

`cavalry_run_script` is explicitly permitted for:
- Debugging compiler output (manually passing generated JS)
- One-off manual scene operations
- Running probe scripts from `src/schema/probeAttribute.ts`

**NL input via `cavalry_run_script` is outside contract scope — structurally prevented in production sessions by the env gate.**

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
| C4-5: only cavalryGenerator uses api.* | `cavalryGenerator.ts`, `sceneIdentityResolver.ts` | — | `api-grep.test.ts` (G3 file-exact allowlist) |
| G1: production tool surface = {cavalry_ping, cavalry_run_motion} | `src/index.ts` | `registerTools()` | `tool-surface-snapshot.test.ts` |
| G2: server.tool() only inside registerTools (AST) | `src/index.ts` | `registerTools()` | `bootstrap.test.ts` |
| G2: new McpServer() only inside main() (AST) | `src/index.ts` | `main()` | `bootstrap.test.ts` |
| G3: api.* emission file-exact allowlist | `cavalryGenerator.ts`, `sceneIdentityResolver.ts` | — | `api-grep.test.ts` |
| G3: mintTrustToken single non-test import | `runtime/trustToken.ts`, `compiler/cavalryGenerator.ts` | `mintTrustToken()` | `api-grep.test.ts` |
| G3: CompiledJs single non-test cast site | `compiler/cavalryGenerator.ts` | `as CompiledJs` | `api-grep.test.ts` |
| G4: unrecognised NL never contacts Stallion | `src/index.ts` | `handleRunMotion()` | `nl-firewall.test.ts` |
| G4: handleRunMotion never calls sendRawToCavalry | `src/index.ts` | `handleRunMotion()` | `nl-firewall.test.ts` |
| G5: TrustToken unknown sessionId rejected | `runtime/trustToken.ts` | `consumeTrustToken()` | `trust-token.test.ts` |
| G5: TrustToken single-use enforcement | `runtime/trustToken.ts` | `consumeTrustToken()` | `trust-token.test.ts` |
| CF-T1: `textShape.text` deterministic visual binding | `constructorFieldMapping.ts` | `resolveConstructorAttr()` | `constructor-field-mapping.test.ts` |
| CF-T2: constructorFields apply on create and reuse | `sceneIdentityResolver.ts` | `emitReconciliation()` | `constructor-fields.test.ts` CF4-CF5 |
| CF-T3: single constructorField `api.set` per resolved layer | `sceneIdentityResolver.ts` | `emitConstructorFieldLines()` | `constructor-fields.test.ts` CF4-CF5 + CF-PIPELINE |
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

_Last updated: 2026-05-15 | Branch: motion-runtime | v1.2.1 — text-on-canvas compiler pipeline production-stable. 79/79 tests passing. D1 resolved. §B0 invariants and CF-T1-CF-T3 text constructorField invariants enforced/verified._
