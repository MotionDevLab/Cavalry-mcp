# ACTIVE_CONTEXT.md — Cavalry MCP Architecture Ground Truth

> **Purpose:** Single source of truth for anyone working on this system.
> Written from direct code analysis on 2026-05-08. Supersedes README where they conflict.

---

## A. Real System Architecture

### Execution Flow (actual, verified)

```
User natural language
        │
        ▼
  Claude (LLM)
  ─ interprets intent ─► generates raw JavaScript
        │
        │  MCP stdio transport
        ▼
  Node.js MCP Server  (dist/index.js)
  ─ validateCode()     (blocks Node.js dangerous patterns only)
  ─ logCode()          (console.log to stderr, DEBUG=true)
        │
        │  HTTP POST to 127.0.0.1:8080/post
        │  body: { type: "script", code: "<raw JS string>" }
        ▼
  Stallion v0.7        (HTTP server inside Cavalry)
  ─ receives JSON payload
  ─ executes JS in Cavalry's JS Engine
  ─ returns HTTP response text
        │
        ▼
  Cavalry              (animation software, JS Engine)
  ─ api.* namespace    (scene manipulation)
  ─ ui.* namespace     (UI interactions)
```

### Key Implementation Facts

- **Transport:** stdio (MCP SDK `StdioServerTransport`)
- **Stallion endpoint:** `POST http://127.0.0.1:8080/post`
- **Payload type used:** always `"script"` (other types `javaScriptShape`, `skslShader`, `renderSetupExpression` exist in interface but are unused)
- **Connectivity check:** `GET http://127.0.0.1:8080/` with 2-second timeout
- **Code safety validation:** pattern-match block list only (`process.exit`, `child_process`, `require(`, `fs.`, `net.`); does NOT validate Cavalry API correctness
- **Return value from Cavalry:** raw HTTP response text from Stallion — `api.log()` output is **not guaranteed** to surface in this response under Stallion v0.7 (see Known Issues)
- **MCP SDK version:** `@modelcontextprotocol/sdk ^1.12.1`

---

## B. Tool Inventory (Current Implementation Only)

### Branch: `motion-runtime` — src/index.ts

The current branch exposes exactly **2 tools**:

| Tool                 | Category      | Input          | What it actually does                                               |
| -------------------- | ------------- | -------------- | ------------------------------------------------------------------- |
| `cavalry_ping`       | Connectivity  | none           | `GET 127.0.0.1:8080/` with 2s timeout; returns boolean reachability |
| `cavalry_run_script` | Raw execution | `code: string` | Validates JS, sends raw string to Stallion, returns response text   |

**That is the complete tool surface of the current system.**

### Branch: archived in `archive_versions/index_pre_stallion_v07.ts`

The pre-v0.7 implementation had **18 additional tools** (all removed to fix Stallion v0.7 compatibility):

| Tool                            | Category       | Cavalry API used                                                              |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `cavalry_create_layer`          | Scene creation | `api.create(type, name)` → `api.log(layerId)`                                 |
| `cavalry_set_attribute`         | Attributes     | `api.set(layerId, attrMap)`                                                   |
| `cavalry_get_attribute`         | Attributes     | `api.get(layerId, path)` → `api.log(val)`                                     |
| `cavalry_connect`               | Attributes     | `api.connect(src, srcAttr, tgt, tgtAttr)`                                     |
| `cavalry_keyframe`              | Animation      | `api.keyframe(layerId, frame, attrMap)`                                       |
| `cavalry_magic_easing`          | Animation      | `api.magicEasing(layerId, attrPath, frame, type)`                             |
| `cavalry_get_scene_layers`      | Scene query    | `api.getAllSceneLayers()` → `api.log()`                                       |
| `cavalry_get_selected_layers`   | Scene query    | `api.getSelection()` → `api.log()`                                            |
| `cavalry_select_layers`         | Scene control  | `api.select(ids)`                                                             |
| `cavalry_delete_layers`         | Scene control  | `api.deleteLayer(ids)`                                                        |
| `cavalry_get_composition_info`  | Scene query    | `api.getActiveComp()`, `api.get()`, `api.getInFrame/OutFrame()` → `api.log()` |
| `cavalry_set_current_frame`     | Playback       | `api.setCurrentFrame(n)`                                                      |
| `cavalry_render_png`            | Render         | `api.renderPNGFrame(path, scale)`                                             |
| `cavalry_set_generator`         | Layer config   | `api.setGenerator(id, generatorId)`                                           |
| `cavalry_duplicate_layer`       | Scene control  | `api.select()` + `api.duplicateSelection()` → `api.log()`                     |
| `cavalry_get_bounding_box`      | Scene query    | `api.getBoundingBox(id)` → `api.log()`                                        |
| `cavalry_save_scene`            | File I/O       | `api.saveScene(path?)`                                                        |
| `cavalry_open_scene`            | File I/O       | `api.loadScene(path)`                                                         |
| `cavalry_add_dynamic_attribute` | Layer config   | `api.addDynamic(id, name, type)`                                              |

**Why they were removed:** All value-returning tools depended on `api.log()` output flowing back through Stallion's HTTP response. This broke under Stallion v0.7. Rather than fix each tool, the entire wrapper layer was removed and replaced with a single raw-script passthrough.

---

## B2. Verified Attribute Paths (Confirmed via Execution)

These attribute paths have been confirmed working through live script execution on 2026-05-08.

| Layer Type | Attribute Path | Value Format | Notes                                                                                                        |
| ---------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| textShape  | `fontSize`     | number       | confirmed                                                                                                    |
| textShape  | `opacity`      | 0–100        | confirmed                                                                                                    |
| textShape  | `fill.color`   | hex string   | confirmed                                                                                                    |
| textShape  | `fontColor`    | hex string   | confirmed — correct path for text color (not `color`, `textColor`, `fill`, `style.fill`, `appearance.color`) |
| textShape  | `text`         | string       | confirmed                                                                                                    |
| any        | `position.x`   | number (px)  | confirmed via execution                                                                                      |
| any        | `position.y`   | number (px)  | confirmed via execution                                                                                      |
| any        | `scale.x`      | number       | confirmed via execution                                                                                      |
| any        | `scale.y`      | number       | confirmed via execution                                                                                      |
| any        | `rotation`     | number (deg) | confirmed via execution                                                                                      |

### Verified API Calls

| API Call                | Signature                           | Status                                                                                                                      |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `api.create`            | `(layerType, name) → internalId`    | VERIFIED — returns internal ID in `{type}#{N}` format (e.g. `textShape#11`); display name is stored separately              |
| `api.set`               | `(id, { attr: value, ... })`        | VERIFIED — requires internal ID; display name as first arg does NOT work                                                    |
| `api.keyframe`          | `(id, frame, { attr: value })`      | VERIFIED — animates correctly between keyframes                                                                             |
| `api.magicEasing`       | `(id, attrPath, frame, easingType)` | VERIFIED — easing applies to the START keyframe, affecting the outgoing curve; applying to end keyframe has no effect       |
| `api.getAllSceneLayers` | `() → string[]`                     | VERIFIED — returns array of internal IDs (`textShape#N` format); same format as `api.create` return value                   |
| `api.getNiceName`       | `(internalId) → string`             | VERIFIED — returns the display name passed as second arg to `api.create`; the ONLY confirmed way to look up a layer by name |
| `api.layerExists`       | `(internalId) → boolean`            | VERIFIED — works with internal IDs; returns false for display names                                                         |

### Verified Layer ID Facts

- Internal ID format: `{layerType}#{N}` (e.g. `textShape#5`, `compNode#1`)
- Display names (second param to `api.create`) are NOT usable as API identifiers
- `api.get(id, "name")` does NOT work — "name" is not a valid attribute path
- No dedicated name-lookup function exists (`getLayerByName`, `find`, etc. are all undefined)
- `api.getNiceName(internalId)` is the ONLY verified mechanism for display-name retrieval

---

## C. Known Runtime Issues

### 1. `api.log()` Return Pipe — Stallion v0.7 Constraint

The primary reason for the Stallion v0.7 refactor.

- **Problem:** Stallion v0.7 changed script execution behavior; `api.log()` output may not be captured in the HTTP response body that `sendToCavalry()` reads via `response.text()`
- **Effect:** Tools in the archived version that used `api.log(layerId)` to return the created layer ID became unreliable — Claude could not get the ID back to chain operations
- **Current workaround:** Raw `cavalry_run_script` lets Claude write JS that captures values differently, but there is no documented reliable alternative to `api.log()` for returning values

### 2. Execution Success ≠ Visual Correctness

- Stallion returns HTTP 200 on any executed script, even one that silently fails inside Cavalry
- The MCP returns `"Script executed successfully."` when Stallion returns empty body
- Claude has no way to observe whether an animation looks right, whether a layer was actually created, or whether values were applied
- There is no visual feedback loop

### 3. No Semantic Validation Layer

- `validateCode()` only blocks Node.js-dangerous patterns (not Cavalry-specific errors)
- A script with wrong attribute paths, wrong layer types, or nonsensical animation values passes validation and returns "success"
- Example: `api.set(id, {"position.invalid": 999})` returns success even if Cavalry ignores or rejects it

### 4. Tool Description Inconsistency

- `cavalry_run_script` description says "Use console.log for debugging"
- Cavalry's actual debug function is `api.log()`, not `console.log`
- This misleads Claude when generating scripts

### 5. README Describes a Non-Existent Tool Layer

- README lists 21 tools; current `src/index.ts` has 2
- README's "Available tools" table is entirely out of date
- The "Example conversation" flow in README is impossible with the current 2-tool implementation

### 6. No Layer ID Persistence

- Every `cavalry_run_script` call is a standalone stateless execution
- Layer IDs created in one script call are not automatically passed to the next
- Claude must write multi-step scripts as a single execution unit, or manage IDs manually through `api.log()` return values (which may not work — see Issue 1)

---

## D. README vs Reality Audit

| README Claim                                                                                                                 | Actual Reality                                                                     | Gap Type                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| "Create layers, set attributes, animate with keyframes, render frames, and more — all through natural language"              | Natural language → LLM generates raw JS → executes                                 | Overclaim: system is a scripting bridge, not a natural language system |
| 21 tools listed in the "Available tools" table                                                                               | 2 tools exist in current code                                                      | Wrong: README was not updated after the Stallion v0.7 refactor         |
| "cavalry_create_layer — Create a layer (textShape, basicShape, null, etc.)"                                                  | This tool does not exist in current code                                           | Outdated: lives in archived file only                                  |
| Example: "Create a bouncing text that says Hello World" / "Claude will: 1. Create a textShape layer, 2. Set text content..." | Claude must produce all of this as a single raw JS string via `cavalry_run_script` | Misleading: implies 4-step tool chain that cannot execute              |
| Implies structured attribute access and keyframe control via discrete tools                                                  | All of this must be hand-written JS inside a single `code` parameter               | Wrong abstraction level depicted                                       |

---

## E. Current System State

### Branch: `motion-runtime` (HEAD, current)

**Status: WORKING** as a raw JavaScript execution bridge.

- 2 tools only: `cavalry_ping`, `cavalry_run_script`
- Script-based execution verified end-to-end (MCP → Stallion → Cavalry)
- Animation changes occur when correct JS is explicitly provided
- System is stable and reliable for script execution

**What it is:** A remote JavaScript REPL for Cavalry, accessible from Claude.

**What it is not:** A natural language animation system.

### Branch: `claude/mcp-cavalry-plugin-ltNOc` (main branch for PRs)

- Contains the same 2-commit history
- No additional semantic layer work present

### Directory: `src/compiler/` (untracked, offline only)

**Status: EXISTS, pipeline VERIFIED offline, NOT connected to MCP runtime.**

- Files: `motionDSL.ts`, `motionCompiler.ts`, `cavalryGenerator.ts`, `intentParser.ts`, `validators.ts`, `presets/`, `sceneIdentityResolver.ts`
- The compiler pipeline (`MotionProgram → CompiledPlan → Cavalry JS string`) is fully implemented as a pure TypeScript module
- **The compiler now contains the first deterministic reconciliation layer** — the `compilerOwned` target kind and `SceneIdentityResolver` (see Section J)
- It is NOT imported by `src/index.ts` — it has zero influence on the live MCP execution path
- **Runtime MCP tools are unchanged** — `cavalry_ping` and `cavalry_run_script` remain the only two exposed tools
- `cavalry_run_script` remains the ONLY active execution path
- `existingLayerByName` target kind is explicitly unsupported in v1 generator (requires unverified scene-query API)
- **VERIFIED 2026-05-08:** Compiler output manually executed via `cavalry_run_script` produced correct bouncing animation (`bounce_in` preset)
- **Known preset bug fixed 2026-05-08:** `bounce_in` preset was applying `BounceOut` easing to `endFrame` — Cavalry applies easing from the keyframe it is set on going forward, so easing must be on `startFrame`. Fixed in `presets/bounceIn.ts`.
- **Identity system implemented 2026-05-08:** `compilerOwned` target kind and `SceneIdentityResolver` added; full reconciliation verified in live Cavalry. See Section J for details.

### Deterministic Layer Identity System v1 (implemented 2026-05-08)

**Status: IMPLEMENTED and VERIFIED via live execution.**

Files added/modified:

- `src/compiler/motionDSL.ts` — added `compilerOwned` target kind and `MC_NAMESPACE`/`compilerLayerName()` exports
- `src/compiler/validators.ts` — added validation for `compilerOwned` (compilerLayerId pattern `[a-zA-Z0-9_]+`, layerType non-empty)
- `src/compiler/motionCompiler.ts` — updated `targetKey()` to handle `compilerOwned`
- `src/compiler/sceneIdentityResolver.ts` (NEW) — generates reconciliation JS block
- `src/compiler/cavalryGenerator.ts` — replaced `resolveTargetIdLiteral` with `emitTargetResolution`; wired in `sceneIdentityResolver`

**Identity mechanism:**

- Identity is name-based and NOT resilient to renaming or external mutation.
- Compiler-owned layers use reserved namespace prefix `MC__` (e.g. `MC__title_text`)
- Lookup: `api.getAllSceneLayers()` → filter by `api.getNiceName(id) === "MC__<id>"`
- 0 matches → `api.create(layerType, "MC__<id>")` (create)
- 1 match → reuse existing internal ID (mutate in place)
- 2+ matches → `throw new Error("MC_DUPLICATE:...")` (hard error, no recovery)

**Verified reconciliation behavior (2026-05-08):**

- Two consecutive executions with `compilerLayerId: "title_text"` produced exactly ONE layer (`textShape#11`)
- Second run found and reused the layer — no duplicate created
- Animation applied correctly on both runs

### Archive: `archive_versions/index_pre_stallion_v07.ts`

- Full 18-tool wrapper implementation
- Broken by Stallion v0.7's changed `api.log()` behavior
- Not in active use; kept for reference

---

## F. Natural Language Gap Analysis

### Why "Create bouncing Hello World text" does NOT reliably produce correct behavior

The request must traverse **4 unmapped layers** with no assistance:

```
User: "Create bouncing Hello World text"
        │
        ▼  [GAP 1: Intent → Animation Plan]
        │  No semantic layer exists to translate intent into:
        │  - layer type selection (textShape)
        │  - attribute path knowledge (position.y, fontSize, fill.color)
        │  - animation timing decisions (which frames, what values)
        │  - easing selection (BounceOut on which attribute at which frame)
        │
        ▼  [GAP 2: Animation Plan → Tool Calls]
        │  No animation primitives exist:
        │  - no "bounce" primitive → must be expressed as keyframe + easing
        │  - no "text style" shortcut → must set fontSize, fill.color individually
        │  - no relative positioning → must use absolute pixel values
        │
        ▼  [GAP 3: Tool Calls → Cavalry JS]
        │  Claude must write correct Cavalry JS from scratch:
        │  - must know api.create(), api.set(), api.keyframe(), api.magicEasing()
        │  - must know exact attribute path strings ("position.y" not "y" or "pos.y")
        │  - must know easing enum strings ("BounceOut" not "bounce-out")
        │  - must manage layer IDs across multi-step operations in one script
        │
        ▼  [GAP 4: Execution → Visual Verification]
           No visual feedback:
           - HTTP 200 does not mean animation looks correct
           - Claude cannot see the result
           - No iteration on visual output possible
```

### What "working in script mode" actually means

When the system "works":

- Claude has been given (or generates from training) syntactically correct Cavalry JS
- The JS uses valid `api.*` calls with correct argument types
- The operation does not depend on `api.log()` returning values
- The visual result is not verified — it may or may not look as intended

---

## G. Key Risks

| Risk                         | Severity | Description                                                                                                             |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| No semantic abstraction      | Critical | LLM must hallucinate correct Cavalry JS API calls; incorrect calls silently succeed                                     |
| api.log() unreliable         | High     | No reliable way to get return values (layer IDs, attribute values) back from Cavalry in v0.7                            |
| README misleads users        | High     | Users expect 21 tools; only 2 exist; example conversation is impossible with current code                               |
| No visual feedback loop      | High     | Claude cannot verify visual outcomes; "success" means HTTP 200, not correct animation                                   |
| Fragile multi-step state     | Medium   | Layer IDs from step 1 must be manually threaded into step 2+ in a single script                                         |
| JS injection surface         | Low      | Safety validation is pattern-matching only; does not prevent Cavalry API misuse                                         |
| Easing type knowledge        | Medium   | BounceOut, ElasticIn, etc. must be spelled exactly right; no validation; silent failure                                 |
| Identity via display name    | Medium   | `MC__` identity depends on `api.getNiceName` — user manually renaming a layer breaks reconciliation silently            |
| MC_DUPLICATE halts execution | Medium   | If two layers share the same `MC__` name, the reconciliation `throw` stops the entire script; subsequent ops do not run |
| No fallback identity         | Medium   | No UUID or `setUserData` backup exists; if `api.getNiceName` is unavailable, the identity system has no alternative     |

---

## H. System Diagram (Text)

```
┌─────────────────────────────────────────────────────────────┐
│                    USER (natural language)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       CLAUDE (LLM)                          │
│  • Interprets user intent                                   │
│  • Generates Cavalry JavaScript from training knowledge     │
│  • NO semantic animation layer                              │
│  • NO animation primitives                                  │
│  • Calls cavalry_run_script with raw JS string              │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP (stdio)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              NODE.JS MCP SERVER (src/index.ts)              │
│                                                             │
│  Tools exposed:                                             │
│  • cavalry_ping      — connectivity only                    │
│  • cavalry_run_script — raw JS passthrough                  │
│                                                             │
│  validateCode()  ← blocks Node.js patterns only             │
│  logCode()       ← DEBUG stderr output                      │
│  runScript()     ← thin wrapper around sendToCavalry()      │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP POST /post
                            │ { type: "script", code: "..." }
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            STALLION v0.7 (127.0.0.1:8080)                   │
│             [HTTP server inside Cavalry]                     │
│                                                             │
│  • Receives JSON payload                                    │
│  • Executes JS in Cavalry's engine                          │
│  • Returns HTTP response text                               │
│  ⚠ api.log() output may NOT appear in response body        │
└───────────────────────────┬─────────────────────────────────┘
                            │ Internal Cavalry API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    CAVALRY (desktop app)                    │
│                                                             │
│  api namespace:  create, set, get, keyframe,                │
│                  magicEasing, connect, select,              │
│                  getAllSceneLayers, getActiveComp,           │
│                  renderPNGFrame, loadScene, saveScene, ...  │
│                                                             │
│  ui namespace:   available but unused by current server     │
│                                                             │
│  ⚠ No visual output channel back to Claude                 │
└─────────────────────────────────────────────────────────────┘
```

---

## J. Deterministic Layer Identity System (v1)

> Implemented 2026-05-08. Lives in `src/compiler/`. Not connected to MCP tool surface.

### What it is

A stateless, compiler-owned reconciliation layer that gives each logical animation target a stable identity across repeated script executions — without persistent storage, memory, or runtime state.

### compilerOwned target type

A new DSL concept added to `MotionTarget` in `motionDSL.ts`:

```typescript
{
  kind: "compilerOwned";
  compilerLayerId: string;
  layerType: string;
}
```

- `compilerLayerId` — unique identifier assigned by the compiler (e.g. `"title_text"`)
- `layerType` — Cavalry layer type passed to `api.create` (e.g. `"textShape"`)
- The display name in Cavalry is always `MC__<compilerLayerId>` (reserved namespace)

### Reconciliation algorithm

Generated JS emitted by `cavalryGenerator.ts` for each `compilerOwned` target:

1. Call `api.getAllSceneLayers()` to enumerate all layers in the current scene
2. For each layer ID, call `api.getNiceName(id)` and compare against `"MC__<compilerLayerId>"`
3. Collect all matches into a list

Decision:

- **0 matches** → `api.create(layerType, "MC__<compilerLayerId>")` — layer is new, create it
- **1 match** → use the existing internal ID — layer is known, mutate in place
- **2+ matches** → `throw new Error("MC_DUPLICATE:...")` — hard error, execution halts, no recovery

### Guarantee

Zero duplicate layers per identity key per execution. If the script runs 100 times, exactly one `MC__<id>` layer exists in the scene.

### System properties

- **Fully stateless** — no database, no memory store, no external persistence
- **Deterministic** — same `compilerLayerId` always resolves to the same logical layer
- **Multi-agent safe** — behavior is reproducible regardless of which agent executes the script
- **Transport-agnostic** — works over any MCP-compatible transport
- **Depends only on Cavalry runtime APIs** — `api.getAllSceneLayers()` + `api.getNiceName()`

### Verified assumptions (confirmed via live execution 2026-05-08)

| Assumption                                                               | Verification                                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `api.getAllSceneLayers()` returns usable layer identifiers               | VERIFIED — same format as `api.create` return value                                          |
| `api.getNiceName(internalId)` returns the display name from `api.create` | VERIFIED — returns exact string passed as second arg                                         |
| `api.create` + `api.getNiceName` pairing supports reconciliation         | VERIFIED — two consecutive executions produced exactly one layer; second run reused existing |
| Reconciliation result is idempotent                                      | VERIFIED — repeated runs mutate in place, no duplicates                                      |

### Unverified assumptions

| Assumption                                                       | Status                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Name uniqueness is stable across different Cavalry scenes        | UNVERIFIED — only tested in a single scene                         |
| `api.getNiceName` behavior is consistent across Cavalry versions | UNVERIFIED — tested only on the version present during development |
| `api.getNiceName` behavior on composition nodes (`compNode#N`)   | UNVERIFIED — no explicit test; observed no crash                   |

### Limitations and risks

| Risk                        | Description                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display-name dependency     | Identity relies entirely on `api.getNiceName` matching `"MC__<id>"` — if Cavalry changes this behavior, identity breaks silently                            |
| Manual rename collision     | If a user manually renames a compiler-owned layer (removing or altering the `MC__` prefix), the next execution will not find it and will create a duplicate |
| Throw halts full script     | The `MC_DUPLICATE` hard error stops the entire script — all animation ops after the failing target do not execute                                           |
| No fallback identity        | There is no UUID-based or `setUserData`-based backup. If `api.getNiceName` is unavailable, the system has no alternative                                    |
| Compiler not on MCP surface | The identity system only runs when compiler output is manually passed to `cavalry_run_script`; it is not invoked automatically                              |

---

## I. Foundation for Future Work

This document establishes what the system **is** today, for use when designing what comes next.

The missing layer is:

```
natural language → [semantic intent parser] → animation plan → [primitive mapper] → Cavalry JS
```

This layer does not exist today. The current system skips directly from natural language to raw JS injection, relying entirely on LLM training knowledge of Cavalry's API.

Before that layer can be designed, the `api.log()` return pipe problem must also be solved — because without reliable return values from Cavalry, even a semantic layer cannot verify its own operations.

---

_Last updated: 2026-05-08 (identity system implementation + audit) | Branch: motion-runtime | Commit: 9fc1d9a_
