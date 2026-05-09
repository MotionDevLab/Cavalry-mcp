- Node Registry Guard v1 — Architecture Analysis

1. Recommended Architecture
   The Node Registry Guard is a single new module (src/compiler/nodeRegistry.ts) that provides a closed canonical type set and alias normalization function. It integrates at exactly two points in the existing pipeline: one type-level change in motionDSL.ts and one validation call in validators.ts. No other file changes.

Its responsibilities are strictly bounded:

Define what Cavalry node types are valid for api.create
Map known aliases to their canonical form
Reject anything not in the canonical set
It has no awareness of attributes, presets, easing, identity, or generation.

2. Canonicalization Boundary
   The single correct boundary is the compiler input gate: validateClip inside validators.ts.

Analysis of each option:

Intent parser — wrong boundary. The intent parser maps natural language to preset vocabulary. It has no concept of node types. It also cannot be the canonicalization boundary because MotionProgram objects can be constructed without going through the intent parser at all (direct DSL authoring, LLM-generated programs, future callers). Any canonicalization placed here would be easily bypassed.

Motion DSL — not a code boundary, it is a type definition file. It can express the constraint via a CanonicalNodeType instead of string, but the DSL itself cannot enforce normalization. It is the right place for the type definition; it is not the enforcement point.

Compiler phase (validateProgram / validateClip) — correct. This is the existing enforcement point for every other closed vocabulary in the system. CONTROLLED_ATTRS is validated here. EASING_TYPES is validated here. PRESET_IDS is validated here. All of them are validated through validators.ts before generation proceeds. Node types must follow the same pattern for architectural consistency and so the compiler behaves as a single total-validation checkpoint.

Generator phase — too late. The generator's contract must be that it only receives already-validated input. If the generator validates node types, it means the compiler passed through unvalidated data. That is a contract violation, not a safety layer.

Where aliases stop existing: inside validateClip. A compilerOwned target enters validation carrying a raw string for layerType. By the time validateClip returns, that string has been confirmed canonical. The CompiledPlan produced by the compiler contains only canonical types. Aliases are not present anywhere downstream of this boundary.

Where canonical node types become mandatory: at the CompiledPlan boundary. The MotionTarget.compilerOwned.layerType field in the DSL carries a CanonicalNodeType (enforced statically by TypeScript). The CompiledPlan targets carry that type unchanged.

Where invalid ontology is rejected: inside validateClip, before any clip is expanded through a preset, before any op is emitted. The same structural location as all other v1 vocabulary rejections.

3. Generator Contract
   The generator MUST receive ONLY canonical runtime-safe node types. It must never receive:

Aliases ("text", "rectangle", "shape")
Raw user strings of unknown origin
Inferred node names based on LLM training knowledge
Unresolved ontology (any string not in CANONICAL_NODE_TYPES)
The generator's contract, by the time it sees a ResolvedTarget with kind === "compilerOwned", is that target.layerType is a member of CANONICAL_NODE_TYPES. This is guaranteed by two enforcement layers that run upstream:

TypeScript static type: layerType: CanonicalNodeType (catches violations at program authoring time)
Runtime validator: validateClip calls isCanonicalNodeType(clip.target.layerType) and throws MotionValidationError if false
The generator itself does not perform node type validation. It trusts the compile-time contract. If a GeneratorError is added for this, it is a defensive backstop only — it must not be the primary enforcement point.

This matches how ControlledAttr and EasingType are already handled: they are TypeScript union types defined in motionDSL.ts, validated in validators.ts, and trusted in cavalryGenerator.ts.

4. Source of Truth
   The single authoritative source of truth is a compiler registry module: src/compiler/nodeRegistry.ts.

Ownership analysis:

Prompts — not valid. Prompts are not executable constraints. They are consumed by an LLM and produce probabilistic output. A type that "exists" in a prompt is not verified to exist at runtime.

ACTIVE_CONTEXT.md — not the enforcement authority. ACTIVE_CONTEXT.md is an architecture document for human and LLM orientation. It documents which types are verified. It is not imported by TypeScript; it cannot throw. It is updated to reflect what the code module contains, not the reverse.

Runtime checks (querying Cavalry for valid types) — explicitly out of scope for v1. Even if feasible, this requires a live Cavalry connection, which is not present at compile time. The Stallion/Cavalry failure model means runtime discovery cannot be trusted for compile-time guarantees.

Compiler registry module — correct. Parallel to how CONTROLLED_ATTRS in motionDSL.ts is the single source of truth for valid attribute paths: it is a TypeScript constant array, imported by the validator, enforced at compile time.

Ownership boundary: the registry module owns the canonical type set and the alias table. When a new type is confirmed via live execution, it is added to the registry module. ACTIVE_CONTEXT.md is then updated to document the confirmation. The code is authoritative; the documentation is descriptive.

Validation authority: validators.ts is the enforcement layer. It imports from the registry and calls the validation function. It does not duplicate the type list inline.

5. Failure Semantics
   All failures must occur before code generation, inside validateClip, as MotionValidationError throws.

Exact behavior for each case:

Case Behavior
Unknown alias (e.g. "basicText") Canonicalize returns null → MotionValidationError thrown with path clips[N].target.layerType and the invalid string included in the message
Unsupported runtime primitive (e.g. a type that may exist in Cavalry but is not yet in the verified registry) Same as unknown alias — registry is closed; unverified types are treated identically to invalid types
Invalid node type (any non-canonical string) Same throw — no distinction between "wrong name" and "unverified name" at v1
Unverified node type Same throw — the registry only contains verified types; "might exist" is not a valid registry entry
Why failure must occur before generation and not at runtime:

Cavalry returns HTTP 200 even when api.create is called with an invalid node type. The observed error ("Could not create a node of type: basicText") was discovered only via explicit inspection of Cavalry's behavior — not from any error signal returned by Stallion. If the compiler does not reject invalid types, they reach Cavalry silently. The created layer does not exist. All subsequent api.set, api.keyframe, and api.magicEasing calls operate on a null reference. No error is surfaced. The animation appears to succeed.

The only reliable safety net is compile-time rejection. Runtime failure is undetectable in this system.

6. Alias Strategy
   Aliases normalize immediately, at the compiler input boundary, and do not survive into any downstream phase.

Specific policy per question:

Should aliases normalize immediately? Yes. Alias resolution is a one-time O(1) lookup against the alias map. There is no reason to carry an alias forward — doing so is a deferred error risk.

Should aliases survive into later compiler phases? No. The DSL's MotionTarget.compilerOwned.layerType must be CanonicalNodeType. If an alias is accepted at DSL authoring time (by calling canonicalize before construction), it is replaced by the canonical form before it enters the DSL. If it enters the DSL as an alias string, the TypeScript compiler rejects it at authoring time and the runtime validator rejects it inside validateClip.

Should aliases be reversible? No. The alias table is a one-way mapping. The canonical form is what the system knows; the alias form is an input convenience that must be discarded immediately. Storing the alias for reconstruction would serve no deterministic purpose.

Should aliases exist in the DSL itself? No. The DSL's layerType field is typed CanonicalNodeType. An alias string is structurally invalid at the DSL level. The alias map lives exclusively in the registry module.

Deterministic implications of alias persistence: if an alias survives past the validator, it could reach the generator and be passed directly to api.create. The generator currently emits api.create(target.layerType, ...) using the literal string. An alias string would produce a Cavalry runtime error that returns no failure signal. The entire animated layer would be silently absent. This is the exact failure mode observed with basicText. Immediate alias normalization eliminates this class of failure entirely.

Safe alias examples (v1 — only aliasing to VERIFIED canonical types):

"text" → "textShape" (textShape verified via ACTIVE_CONTEXT.md execution logs)
"textLayer" → "textShape"
Note: basicShape appears in archived documentation but has NOT been confirmed via live execution in the current system. It must NOT be added to the alias table until it is verified. Adding an alias to an unverified canonical is the same failure mode as adding a raw invalid type.

7. Canonical Type Flow
   Proposed flow, with analysis of each stage:

intent string or DSL author input
│
▼
[NodeRegistry.canonicalize(input)]
→ known alias → canonical string
→ canonical type → canonical string (identity)
→ unknown string → null
│
▼ null → caller receives error before DSL construction
[MotionTarget construction]
layerType: CanonicalNodeType ← TypeScript type enforces at authoring time
│
▼
[MotionProgram (DSL)]
all layerType values are CanonicalNodeType
│
▼
[motionCompiler.compile(program)]
→ validateProgram(program)
→ validateClip(clip, index)
→ isCanonicalNodeType(clip.target.layerType)
→ false → throw MotionValidationError("unsupported node type ...", path)
→ true → passes
│
▼
[CompiledPlan]
targets[N].target.layerType = CanonicalNodeType (guaranteed by validator)
│
▼
[cavalryGenerator.generate(plan)]
→ emitTargetResolution(t, varName)
→ api.create(target.layerType, nameVar)
→ layerType is canonical, no mapping needed
│
▼
[Generated JS string]
api.create("textShape", "MC\_\_title_text")
│
▼
[Stallion → Cavalry runtime]
→ valid node created
Is the proposed flow correct? Yes, with one clarification: alias normalization must occur before DSL construction, not inside the validator. The validator only confirms canonical membership — it does not mutate. If the validator were to mutate the clip object (replace an alias with a canonical), it would violate the pure-validator contract already established in this codebase.

The cleanest decomposition: canonicalize() is called by whoever constructs a MotionTarget. The validator confirms the result. These are distinct responsibilities.

Where is the hard compiler boundary? validateProgram inside motionCompiler.compile. Nothing passes this point without a verified canonical type. The boundary is the same as the existing hard boundary for attrs, easing, and presets.

8. Registry Scope (v1 Only)
   V1 must be minimal, static, and closed.

What belongs in v1:

Component In v1? Reasoning
CANONICAL_NODE_TYPES constant array Yes Core requirement
CanonicalNodeType TypeScript type Yes Enables static enforcement
isCanonicalNodeType(value) function Yes Runtime validation
ALIAS_MAP alias table Yes Maps known user-facing strings to canonical types
canonicalize(input) function Yes One-way alias resolution
Dynamic type discovery No Requires live Cavalry connection; defeats compile-time guarantees
Capability metadata (what attrs each type supports) No Different system entirely; scope creep
Runtime feature detection No Fallback on runtime state is not deterministic
Plugin architecture No No use case in v1; adds complexity with no safety benefit
Adaptive aliasing (fuzzy match, distance scoring) No Non-deterministic; violates closed vocabulary philosophy
Ontology expansion systems No Registry grows only when types are verified via direct execution
Tradeoffs of minimal static registry:

Risk: registry becomes stale relative to Cavalry's actual supported types. A valid type is rejected because it hasn't been verified yet.

Why this is the correct tradeoff: the failure mode of a minimal registry is a compile-time error ("type not in verified registry"). This is discoverable and fixable. The failure mode of an expanded or adaptive registry is a runtime silent failure ("type accepted by compiler, rejected by Cavalry silently"). Silent runtime failure is the problem this guard exists to prevent. Overcaution at compile time is preferable to undercaution at runtime.

9. Integration Strategy
   Node Registry Guard integrates with the existing system via one new file and two small changes. No existing system is redesigned.

New file: src/compiler/nodeRegistry.ts

Exports CANONICAL_NODE_TYPES (const array)
Exports CanonicalNodeType (TypeScript union type derived from the array)
Exports isCanonicalNodeType(value: unknown): value is CanonicalNodeType
Exports ALIAS_MAP (readonly Record mapping alias strings to CanonicalNodeType)
Exports canonicalize(input: string): CanonicalNodeType | null
Change 1: src/compiler/motionDSL.ts

Import CanonicalNodeType from nodeRegistry.ts
Change compilerOwned.layerType: string → compilerOwned.layerType: CanonicalNodeType
This is a type-only change. All existing valid uses of compilerOwned with "textShape" pass through unchanged because "textShape" is in CANONICAL_NODE_TYPES. No other DSL types change.
Change 2: src/compiler/validators.ts

Import isCanonicalNodeType from nodeRegistry.ts
In validateClip, inside the compilerOwned branch, after the existing non-empty check, add:
if (!isCanonicalNodeType(clip.target.layerType)) {
throw new MotionValidationError(
`node type "${clip.target.layerType}" not in canonical registry`,
`${root}.target.layerType`
)
}
Parallel structure to the existing isControlledAttr, isEasingType, isPresetId checks.
No changes to:

motionCompiler.ts — delegates validation; no node type logic
cavalryGenerator.ts — generator contract is satisfied by upstream validation
sceneIdentityResolver.ts — receives validated layerType unchanged; api.create call is correct
presets/\*.ts — presets emit MotionOp[]; they do not create layers or reference node types
intentParser.ts — maps text to presets; node types are not in its domain
src/index.ts — MCP surface is unchanged; compiler is not connected to MCP runtime
Integration with identity system: The identity resolver (sceneIdentityResolver.ts) emits api.create(target.layerType, ...). When target.layerType is guaranteed canonical by the time the generator calls emitReconciliation, the api.create call is safe. The identity system trusts the type it receives; Node Registry Guard makes that trust warranted.

10. What v1 Must Not Do
    No fuzzy matching. Levenshtein distance, "did you mean", closest neighbor, or any approximate match. Unknown types throw; they are not corrected.
    No LLM-generated recovery. No calling an LLM to suggest a valid alternative node type. That path is non-deterministic and violates the compiler's contract with the caller.
    No automatic correction. No silent substitution of an invalid type with a "reasonable default". Invisible type coercion is a category of the same failure class as basicText reaching the runtime.
    No runtime type discovery. No querying Cavalry for its actual supported node types at compile time or execution time. The registry is a static compile-time artifact.
    No partial generation. If one target in a MotionProgram has an invalid node type, the entire program fails. No partial scripts are emitted. No "skip this layer and continue" behavior.
    No runtime retries. No "try basicText, catch, try textShape" pattern.
    No capability metadata. The registry does not encode which attributes are valid per node type. That is a different validation concern, not in v1 scope.
    No unverified types. The registry does not accept "probable" or "likely supported" node types. Only types confirmed via direct live execution belong in CANONICAL_NODE_TYPES.
    No alias persistence past the validation boundary. Aliases exist only in ALIAS_MAP in the registry module. They are resolved before DSL construction or rejected at validateClip. No alias string appears in any CompiledPlan or generated JS.
11. Final Recommended Implementation Order
    Create src/compiler/nodeRegistry.ts — define CANONICAL_NODE_TYPES with only currently-verified types ("textShape" confirmed; others require live verification before inclusion), CanonicalNodeType, isCanonicalNodeType, ALIAS_MAP, canonicalize.
    Update src/compiler/motionDSL.ts — change compilerOwned.layerType: string to compilerOwned.layerType: CanonicalNodeType. Verify TypeScript compiles cleanly with the existing preset and generator code.
    Update src/compiler/validators.ts — add isCanonicalNodeType call inside the compilerOwned branch of validateClip. Error message must include the invalid string and the path.
    Verify existing integration test — the bounce_in preset on a textShape target (the verified end-to-end run documented in ACTIVE_CONTEXT.md) must still compile and produce identical JS output. No regressions.
    Verify rejection behavior — confirm that a compilerOwned target with layerType: "basicText" throws MotionValidationError at validateProgram call, before any code generation occurs.
    Update ACTIVE_CONTEXT.md — add a verified node types table (parallel to the verified attribute paths table in Section B2). Document that textShape is confirmed. Document that basicText is confirmed invalid. Note that basicShape is unverified and not in the registry.
    Summary of the design:

The guard is architecturally a peer to the existing CONTROLLED_ATTRS and EASING_TYPES systems — a closed static vocabulary enforced at the compiler input boundary. One new module. Two small additive changes. The failure mode shifts from silent Cavalry runtime rejection to a typed MotionValidationError thrown before any JavaScript is generated. The generator receives only canonical types and trusts that contract unconditionally.

- Node Registry Guard v1 — Architectural Corrections

1. Final Canonicalization Boundary
   Canonicalization occurs before MotionTarget construction, in the input-handling layer. It is not part of the compilation pipeline.

The contradiction in the previous design is resolved by the constraint already present in the codebase: every validator in validators.ts is a pure invariant-checker. isControlledAttr, isEasingType, isPresetId — all are pure membership tests that throw on violation and never mutate their argument. validateClip is structurally the same. This contract cannot be broken for node types without creating a category inconsistency in the validator layer.

Therefore:

Where aliases are allowed to exist: only in ALIAS_MAP inside nodeRegistry.ts, and in whatever caller-side code handles raw user or LLM input before constructing a MotionTarget. Aliases do not exist inside the compiler pipeline.

Where aliases are removed: before MotionTarget construction. Any caller receiving a user-facing string calls canonicalize() from nodeRegistry.ts and receives either a CanonicalNodeType or null. If null, the error belongs to the caller — the DSL is never constructed with an invalid type.

Where CanonicalNodeType becomes enforced: at the DSL boundary. The motionDSL.ts type definition changes layerType: string to layerType: CanonicalNodeType. TypeScript enforces this at authoring time for all typed callers. For dynamically-constructed programs (deserialized JSON, LLM output bypassing the type system), validateClip enforces it at runtime as a pure membership check — confirming the invariant already holds, not establishing it.

Validator responsibility: invariant verification only. validateClip calls isCanonicalNodeType(clip.target.layerType) and throws MotionValidationError on failure. It does not normalize, alias-resolve, or mutate the clip. This is structurally identical to how isPresetId(clip.preset) works today.

Canonicalization belongs in: input handling, upstream of DSL construction. It is a caller-side concern, not a compiler concern. The compiler assumes the DSL it receives is already expressed in canonical vocabulary.

The cleanest deterministic boundary: the DSL entry point (MotionTarget) is the alias firewall. Anything entering the DSL is canonical. The compiler verifies that invariant and trusts it downstream.

2. Generator Responsibility (Final)
   A single defensive invariant assertion should exist in the generator. It is not validation. It is a contract enforcement point.

Determination: the assertion should exist.

Its role is neither primary validation nor duplication of the validator. It is a compiler pipeline invariant guard — the difference between these two classes of check is:

validateProgram / validateClip catches user input errors: a MotionProgram was authored with a bad type. This is expected to trigger in normal operation when programs are invalid.
Generator invariant assertion catches compiler contract violations: a CompiledPlan reached the generator with an invalid layerType. This should never trigger in a correctly-functioning pipeline. If it does, it means the pipeline itself has a bug — a new code path bypassed validateProgram, or validateProgram was modified incorrectly, or a CompiledPlan was constructed outside the compiler.
What it means if this assertion ever triggers: it is unambiguously a compiler contract violation. Not a user error. Not a bad program. A structural defect in the compiler pipeline itself. The error type must be GeneratorError (the class already exists), not MotionValidationError — these two errors have different diagnostic meanings and must remain distinct.

Its value: it makes the generator's precondition visible as executable code rather than implicit assumption. In a system where api.create with an invalid type produces silent Cavalry failure with HTTP 200, the generator is the last line of defense before invalid JS is emitted. An assertion that never fires in production is still valuable — it documents the contract and catches regressions immediately during development.

The assertion does not move validation into the generator. It is one guard call, one GeneratorError throw, placed immediately before the api.create emission. The generator remains a code-emission layer; it does not perform input validation.

3. Alias Architecture (Final)
   Canonical types and alias maps are strictly separated concerns.

They are distinct in kind, ownership, and change rate:

Dimension Canonical Types Aliases
What it describes Runtime ontology — what Cavalry accepts UX ontology — what humans or LLMs write
Change trigger A new type is confirmed via live execution A new input pattern is observed
Change authority Cavalry runtime behavior User/LLM input conventions
Verification requirement Only verified types can be canonical Any string can be an alias target, as long as the target canonical is verified
Directionality Defines reality Maps to reality
Should aliasing be automatically tied to canonical support? No. Adding a canonical type does not automatically generate aliases for it. Aliases are populated based on observed input patterns, not runtime verification events. "textShape" became canonical when verified via execution. "text" and "textLayer" become aliases when callers are found to use those strings — independently, at a different time.

Should aliasing be treated as a UX layer, not runtime ontology? Yes. The alias table is a convenience mapping for input normalization. It has no semantic meaning inside the compiler pipeline. No part of the compiler refers to aliases after the input-handling layer.

Should the alias map be isolated from the canonical registry? They may coexist in nodeRegistry.ts for v1 simplicity, but they must be explicitly separate exports with no coupling between their populations. The canonical set can be changed without touching the alias table, and vice versa. They are not a single unified structure.

Should alias policy evolve independently of runtime support? Yes. New aliases are added as input conventions are discovered. Old aliases are deprecated based on UX decisions. These have no relation to whether Cavalry's node type registry has changed. The alias table is not a claim about Cavalry's capabilities — it is a claim about what user inputs the system recognizes.

Consequence: the registry module has two clearly separated exports. The canonical set is the system's truth claim about the runtime. The alias map is the system's recognition of user-facing vocabulary. Mixing these would mean every alias implies verified runtime support and every canonical type change cascades into alias decisions — both are incorrect coupling.

4. Canonical Type Flow (Final)
   Raw string input (user, LLM output, any external source)
   │
   ▼ [INPUT HANDLING LAYER — outside compiler]
   NodeRegistry.canonicalize(input)
   known alias → CanonicalNodeType
   canonical type → CanonicalNodeType (identity)
   unknown string → null → caller error; DSL never constructed
   │
   ▼ null exits here — DSL boundary never reached
   MotionTarget constructed with layerType: CanonicalNodeType
   [TypeScript type system enforces this at authoring time]
   │
   ▼
   MotionProgram (DSL)
   all layerType fields are CanonicalNodeType
   no aliases exist anywhere in this structure
   │
   ▼
   motionCompiler.compile(program)
   → validateProgram(program)
   → validateClip(clip, i)
   → isCanonicalNodeType(clip.target.layerType)
   true → passes; invariant confirmed
   false → MotionValidationError thrown (compiler input error)
   │
   ▼
   CompiledPlan
   targets[N].target.layerType: CanonicalNodeType — guaranteed by validator
   │
   ▼
   cavalryGenerator.generate(plan)
   → emitTargetResolution(t, varName)
   → invariant assertion: isCanonicalNodeType(target.layerType)
   passes → emit api.create(target.layerType, nameVar)
   fails → GeneratorError thrown (compiler contract violation — never in correct operation)
   │
   ▼
   Generated JS string
   api.create("textShape", "MC\_\_title_text") ← canonical guaranteed
   │
   ▼
   Stallion → Cavalry runtime
5. Minimal Implementation Implications
   src/compiler/nodeRegistry.ts (new file)
   Two clearly separated sections:

Canonical registry: CANONICAL_NODE_TYPES, CanonicalNodeType, isCanonicalNodeType
Alias layer: ALIAS_MAP, canonicalize — separate, no structural coupling to the canonical set
src/compiler/motionDSL.ts (one type change)
compilerOwned.layerType: string becomes compilerOwned.layerType: CanonicalNodeType
Import CanonicalNodeType from nodeRegistry.ts
No other changes

src/compiler/validators.ts (one check added)
In validateClip, compilerOwned branch, after existing non-empty string check:
isCanonicalNodeType(clip.target.layerType) — pure membership test, throw MotionValidationError if false
No mutation. No alias resolution. Structural parallel to existing isPresetId check

src/compiler/cavalryGenerator.ts (one assertion added)
In emitTargetResolution, compilerOwned branch, before emitting the reconciliation block:
Single isCanonicalNodeType guard throwing GeneratorError if false
Distinct error class from MotionValidationError — different diagnostic meaning
One line. No restructuring of generation logic

No other files change. The input-handling layer (callers that call canonicalize() before constructing a MotionTarget) is caller-side code, not a compiler file change.

✅ Overall analysis assessment

Your design is strong, coherent, and correctly layered:

You now have a clean 4-layer system:

1. Input Layer (outside compiler)
   canonicalize()
   resolves aliases → canonical
   rejects unknowns before DSL exists

✔ Correct placement

2. DSL Boundary
   MotionTarget.layerType: CanonicalNodeType

✔ This is the critical enforcement boundary
✔ Correctly prevents alias leakage into compiler

3. Compiler (validation layer)
   validateClip
   pure invariant checking only
   no mutation
   no normalization

✔ Correct separation of concerns

4. Generator (emission guard)
   runtime assertion only
   detects compiler contract violations
   throws GeneratorError (correct distinction from validation errors)

✔ This is exactly the right role:

“this should never happen in a correct compiler”

🧠 Key architectural strength (important)

You correctly established:

🔒 Two different error domains
Domain Error type
User/program invalid input MotionValidationError
Compiler pipeline violation GeneratorError

This is excellent design discipline and prevents debugging ambiguity later.

⚠️ One subtle refinement (important)
Your statement:

“canonicalization occurs before MotionTarget construction”

✔ Correct
BUT with one clarification:

👉 It must be enforced at all entry points, not just “intended input layer”

So the real invariant should be:

Canonicalization is required BEFORE DSL construction, regardless of source (UI, LLM, JSON, test, or internal tool)

Otherwise you risk:

bypass paths in tests
internal tool shortcuts
future refactors accidentally skipping canonicalize()
🧱 Small tightening recommendation

Add this implicit rule:

✔ Canonicalization rule (strong form)

No MotionTarget may be constructed without prior canonicalize() unless the input is already proven CanonicalNodeType.

This prevents:

accidental raw string injection
future “fast paths” breaking invariants
🚀 Final verdict
Architecture quality: A / production-grade

You achieved:

Clean alias → canonical separation
Strict DSL boundary enforcement
Proper compiler vs generator responsibility split
Correct error taxonomy
No overloading of validator layer
No runtime mutation of types
Deterministic compile pipeline
🧭 If you extend this later

The only natural next step (optional, not required) is:

“Alias evolution tracking system”
telemetry of alias usage
frequency-based alias promotion suggestions
deprecation warnings

But not needed now — current system is already stable.
