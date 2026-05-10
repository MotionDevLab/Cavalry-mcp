1. Attribute Registry Coverage Issues
   CONTROLLED_ATTRS (motionDSL.ts) — 6 attributes:
   position.x, position.y, scale.x, scale.y, rotation, opacity

ATTRIBUTE_REGISTRY["textShape"] (attributeRegistry.ts) — 10 attributes:
position.x, position.y, scale.x, scale.y, rotation, opacity, fontSize, fill.color, fontColor, text

Finding 1.A — Registry attributes unreachable by the preset pipeline (4 attributes)

The following are in ATTRIBUTE_REGISTRY["textShape"] but NOT in CONTROLLED_ATTRS:

Attribute Registry valueType
fontSize number
fill.color color
fontColor color
text string
validateOp() gates all emitted ops against CONTROLLED_ATTRS (isControlledAttr()), not against ATTRIBUTE_REGISTRY. These 4 attributes cannot be emitted by any preset. Any preset that attempts to use them will be rejected by validateOp().

Finding 1.B — Attribute in CONTROLLED_ATTRS with no preset coverage

rotation is in CONTROLLED_ATTRS and in ATTRIBUTE_REGISTRY["textShape"], but zero presets emit ops with attr: "rotation". It is declared but dead.

Finding 1.C — Hardcoded attribute path outside all registry checks

"userData.mcId" appears as a raw string literal in sceneIdentityResolver.ts lines 114 and 129:

api.get(..., "userData.mcId")
api.set(..., { "userData.mcId": ... })
This path is not in CONTROLLED_ATTRS and not in ATTRIBUTE_REGISTRY["textShape"]. It is emitted into generated JS without validation by either registry.

2. Validation Boundary Violations
   Finding 2.A — Two parallel, unsynchronized attribute registries

The compiler has two separate attribute validation paths that are never reconciled:

Path Source Used by
isControlledAttr() CONTROLLED_ATTRS in motionDSL.ts validateOp() in validators.ts — the active pipeline gate
isApprovedAttribute() ATTRIBUTE_REGISTRY in attributeRegistry.ts semanticResolver.ts only
semanticResolver.ts has zero import sites in the codebase (grep "from.\*semanticResolver" returns no matches). It is exported but never called in the live pipeline. isApprovedAttribute() is therefore never invoked during cavalry_run_motion execution.

The CONTROLLED_ATTRS / isControlledAttr() path is the sole active attribute gate.

Finding 2.B — userData.mcId bypasses both registries

Confirmed from Finding 1.C. The sceneIdentityResolver.ts emitter writes "userData.mcId" as a raw hardcoded string into the generated JS. This path passes through no registry guard — neither isControlledAttr() nor isApprovedAttribute() — before reaching the Stallion transport.

Finding 2.C — No fallback attribute resolution found

No fallback attribute resolution logic exists. Unrecognized attributes in validateOp() throw immediately. semanticResolver.ts silently drops unknown attributes (no fallback assignment). No silent coercion or synonym mapping detected in the active pipeline.

3. Node Type Expansion Safety
   VERDICT: NOT SAFE

All registries and guards are node-type-agnostic for the preset pipeline. Specific reasons:

Reason A — CONTROLLED_ATTRS has no per-node-type dimension

CONTROLLED_ATTRS is a flat global list. validateOp() checks isControlledAttr(op.attr) without knowing which node type the op targets. If a second canonical type is added with a different attribute surface (e.g., does not support opacity or rotation), the validator will not reject ops targeting that type with unsupported attributes. They will reach Cavalry and silently fail.

Reason B — buildProgram.ts line 66 hardcodes the default layer type

const layerType = resolvedType ?? "textShape";
When targetHint is absent or its name is unrecognized by canonicalize(), the factory unconditionally produces a textShape target. A second canonical type is only reachable through explicit hint resolution. The fallback never surfaces the new type regardless of any other compiler context.

Reason C — semanticResolver.ts defaults nodeType = "textShape"

export function resolveSemantics(input, nodeType = "textShape")
Callers that omit nodeType always validate runtime attributes against the textShape registry. Since semanticResolver currently has no callers in the live pipeline this has no immediate effect, but it means any future integration point that calls resolveSemantics() without passing nodeType will silently apply textShape attribute validation to non-textShape targets.

4. Generator Integrity Issues
   No violations found.

cavalryGenerator.ts imports only: typed DSL interfaces (CompiledPlan, ControlledAttr, EasingType, MotionOp, ResolvedTarget), emitReconciliation from sceneIdentityResolver.ts, and isCanonicalNodeType from nodeRegistry.ts.

It does not import from intentParser.ts, semanticResolver.ts, vocabulary/, or any NL-layer module. It does not reference ATTRIBUTE_REGISTRY. All emitted attribute keys enter via MotionOp.attr typed as ControlledAttr, validated upstream by validateOp() before reaching the generator. emitAttrMap() accepts Record<string, number> but only receives values that have already passed isControlledAttr() in the prior validation stage.

The generator is source-pure: it derives all output exclusively from the CompiledPlan struct.
