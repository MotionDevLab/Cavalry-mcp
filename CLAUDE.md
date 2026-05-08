# CLAUDE.md — Operational Behavior Contract

> This file defines **how Claude must behave** when operating inside this system.
> It is an execution contract, not architecture documentation.
>
> For system architecture, tool inventory, and runtime constraints see:
> **[ACTIVE_CONTEXT.md](ACTIVE_CONTEXT.md)** — authoritative source of truth.
> If this file conflicts with ACTIVE_CONTEXT.md, ACTIVE_CONTEXT.md wins.

---

## System Identity

This system is a **JavaScript execution runtime for Cavalry via MCP + Stallion**.

It is NOT a natural language animation system.
It does NOT have a semantic layer, animation primitives, or intent-to-plan mapping.

Claude's role: **deterministic JavaScript generator** for the Cavalry `api.*` namespace.

---

## Execution Model

### Always

- Use `cavalry_run_script` for every operation that touches Cavalry
- Generate **complete, self-contained JavaScript** in a single execution unit
- Include all layer creation, attribute setting, keyframing, and easing in one script call when they are part of the same operation
- Treat every execution as **stateless** — no values persist between calls

### Never

- Assume multiple tools are available beyond `cavalry_ping` and `cavalry_run_script`
- Rely on state, layer IDs, or attribute values from a previous execution
- Chain tool calls expecting output from one to feed into another
- Assume any orchestration layer exists outside of what is explicitly documented in ACTIVE_CONTEXT.md

---

## API GROUNDING LAYER RULE (HIGH PRIORITY)

Claude MUST treat the following as the ONLY authoritative sources for Cavalry API usage:

- ACTIVE_CONTEXT.md (runtime truth + observed system behavior)
- src/index.ts (actual MCP tool surface definitions)
- Verified Stallion v0.7 runtime behavior from this repository

### HARD CONSTRAINT

It is STRICTLY FORBIDDEN to:

- invent or assume any api.* methods not explicitly confirmed in:
  - ACTIVE_CONTEXT.md
  - src/index.ts implementations
  - previously executed and verified scripts in this repository
- rely on training data or external knowledge of Cavalry API
- assume animation helpers or abstractions (e.g. bounce(), fadeIn(), animate())

### SOURCE OF TRUTH PRIORITY

If there is any conflict, the order of authority is:

1. ACTIVE_CONTEXT.md (runtime reality)
2. src/index.ts (tool surface definition)
3. Verified executed scripts in this repository
4. Everything else is invalid

### SAFE GENERATION RULE

If a required API capability is not explicitly confirmed:

- use only:
  - api.create
  - api.set
  - api.keyframe
  - api.magicEasing
  - api.get (inspection only)

- decompose all animation logic into explicit numeric operations
- never assume higher-level animation primitives exist

### FAILURE MODEL ASSUMPTION

- Stallion may return HTTP 200 even if script is incorrect
- Cavalry may silently ignore invalid API calls
- MCP layer does not validate visual correctness

Therefore:
> correctness must be guaranteed at generation time, not runtime

### DESIGN PRINCIPLE

Only APIs proven to work in this repository are considered real.
Everything else is invalid unless explicitly verified through execution.

---

## Cavalry JavaScript Rules

### Namespace

- Use **only** the `api.*` namespace for scene manipulation
- `ui.*` is available inside Cavalry but is not routed through this MCP server — do not use it
- Do not use `console.log` — it has no effect in Cavalry's JS engine

### Attribute Paths

Use exact dot-notation strings. Common correct paths:

```
position.x        position.y
scale.x           scale.y
rotation
opacity
fontSize
fill.color
stroke.color      stroke.width
```

Wrong paths silently fail. When uncertain, query with `api.get(layerId, path)` first.

### Easing Enums

Must be spelled exactly. Valid `api.magicEasing` type strings:

```
Linear
EaseIn          EaseOut         EaseInOut
BounceIn        BounceOut       BounceInOut
ElasticIn       ElasticOut      ElasticInOut
BackIn          BackOut         BackInOut
```

Wrong enum strings silently fail.

### api.log() Constraint

`api.log()` **does not reliably return values** through Stallion v0.7's HTTP response pipe.

- Do not depend on `api.log()` output to retrieve layer IDs, attribute values, or query results
- If a script must produce output (e.g. to confirm a layer ID), use `JSON.stringify` combined with a return-value approach consistent with how Stallion surfaces response text — and verify this works for your Stallion version before relying on it
- When layer IDs are needed across operations, generate them deterministically or hardcode a known scene query at the top of the script

---

## Animation Construction Rules

All animations must be **explicitly and numerically defined**.

Abstract intent is not valid input to a script. Translate all animation concepts before writing code:

| Abstract concept | Required explicit form |
|-----------------|----------------------|
| "bounce" | keyframes on `position.y` at specific frames + `BounceOut` easing via `api.magicEasing` |
| "fade in" | keyframes on `opacity` from 0 to 100 across defined frame range |
| "slide from left" | keyframes on `position.x` from negative offset to target at defined frames |
| "smooth motion" | explicit in/out frame values + `EaseInOut` easing |

Every animation requires:
1. At least two keyframes with numeric values — set via `api.keyframe(layerId, frame, { attr: value })`
2. Easing applied per keyframe per attribute — set via `api.magicEasing(layerId, attrPath, frame, easingType)`
3. All frame numbers as integers relative to the composition's in/out range

---

## Failure Model

HTTP 200 from Stallion means the script was **received and executed**. It does not mean:

- The animation looks correct
- Layers were created as intended
- Attribute values were accepted
- Easing was applied to the correct keyframe
- The script produced any visible output

There is **no visual feedback loop**. Claude cannot observe rendered output.

Operational consequence: generate scripts that are correct by construction, not by iteration. Do not rely on "try and check" workflows.

---

## MCP Client Compatibility

This server must work with any standard MCP protocol client:

- Claude Desktop
- Claude Code
- OpenAI Codex (MCP-compatible)
- Any future MCP-compliant agent

Rules enforced by this contract:

- All behavior must be **stateless and transport-agnostic**
- Do not use Claude-specific UI capabilities, tool-chaining assumptions, or hidden orchestration
- Treat `cavalry_ping` and `cavalry_run_script` as generic RPC endpoints
- All inputs and outputs must be plain text — no binary, no streaming, no session state
- Scripts must produce deterministic outputs given identical inputs

---

## ACTIVE_CONTEXT.md Update Policy

ACTIVE_CONTEXT.md is the authoritative architecture record. Claude may **propose** updates only when:

### Permitted triggers

- A new MCP client is confirmed compatible (add to compatibility record)
- Stallion or Cavalry execution behavior changes are observed during implementation
- The MCP tool surface changes (tools added or removed from `src/index.ts`)
- A verified architectural constraint is discovered that is not yet documented

### Rules for any proposed update

- Update must be based on **observed or implemented** changes — not speculation
- Must preserve the historical record of system evolution (do not rewrite prior facts)
- Must not change sections unrelated to the observed change
- Must be proposed to the user for review before writing — do not silently modify ACTIVE_CONTEXT.md

### What never triggers an update

- Natural language ambiguity in a user request
- Assumptions about how Cavalry might work
- Convenience rewrites or reformatting
- Anything not grounded in actual code or confirmed runtime behavior

---

## File Responsibilities

| File | Owns |
|------|------|
| `ACTIVE_CONTEXT.md` | System reality: architecture, tool inventory, runtime constraints, known issues |
| `CLAUDE.md` | Operational behavior: how to generate code, what rules to follow, failure model |
| `src/index.ts` | Authoritative source of actual tool definitions |
| `src/stallion.ts` | Authoritative source of Stallion HTTP bridge implementation |
