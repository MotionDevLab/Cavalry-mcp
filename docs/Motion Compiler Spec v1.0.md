Motion Compiler Spec v1.0
Node Registry Guard System (Final, Enforceable)

1. System Overview

The system enforces a deterministic compilation pipeline with strict boundary separation:

Input → Canonicalization → DSL → Compiler → Generator → Output

Only CanonicalNodeType is allowed inside the DSL and beyond.

2. Pipeline Architecture
   Raw Input
   ↓
   canonicalize()
   ↓
   CanonicalNodeType | null
   ↓ (null → reject, stop)
   MotionTarget (DSL)
   ↓
   validateClip()
   ↓
   CompiledPlan
   ↓
   Generator (assert + emit)
   ↓
   JS Output
3. Canonicalization Layer (INPUT ONLY)
   Responsibility

Resolve all external strings into canonical types.

Function
canonicalize(input: string): CanonicalNodeType | null
Rules (STRICT)
Must be applied to all external inputs
Accepts UI / LLM / JSON / tools / tests
Output is ONLY:
CanonicalNodeType
null (invalid → stop pipeline)
HARD CONSTRAINT

Aliases exist ONLY here.

4. DSL BOUNDARY (MotionTarget)
   layerType: CanonicalNodeType
   Rules (STRICT)
   Must NEVER contain raw strings
   Must NEVER contain aliases
   Must NEVER be constructed without canonicalization
   No transformation logic allowed
   Invariant

If MotionTarget exists → it is canonical.

5. COMPILER (VALIDATION ONLY)
   Responsibility

Verify correctness of DSL without modifying it.

Function
validateClip(clip)
Rules (STRICT)
Pure function
No mutation
No normalization
No alias resolution
Required check
isCanonicalNodeType(clip.target.layerType)
Error
MotionValidationError → invalid DSL input 6. GENERATOR (EMISSION + CONTRACT GUARD)
Responsibility

Emit final executable JS.

Rules (STRICT)
Assumes compiler output is valid
Must enforce final invariant check:
isCanonicalNodeType(target.layerType)
Error
GeneratorError → compiler contract violation (NOT user error)
Meaning

This indicates broken compiler pipeline logic.

7. ALIAS SYSTEM (UX ONLY)
   Structure
   ALIAS_MAP → CanonicalNodeType
   Rules (STRICT)
   Exists ONLY in input layer
   NEVER referenced in compiler
   NEVER referenced in generator
   NEVER stored in DSL
   Semantic Model
   Canonical Alias
   runtime truth user vocabulary
   stable evolving
   execution-verified input convenience
8. DATA FLOW (FINAL)
   RAW INPUT
   ↓
   canonicalize()
   ↓
   CanonicalNodeType | null
   ↓
   MotionTarget (DSL)
   ↓
   validateClip()
   ↓
   CompiledPlan
   ↓
   Generator assertion
   ↓
   Cavalry JS emission
9. SYSTEM INVARIANTS (HARD RULES)
   I1 — DSL purity

No aliases may exist in DSL or compiler.

I2 — compiler immutability

Compiler does NOT transform data.

I3 — generator contract

Generator validates compiler correctness only.

I4 — alias isolation

Alias system is input-only and never downstream.

I5 — error separation
MotionValidationError = user/DSL issue
GeneratorError = compiler bug 10. FAILURE MODEL
Stage Failure Meaning
canonicalize null invalid input
validateClip MotionValidationError invalid DSL
generator GeneratorError compiler contract broken 11. GENERATOR CONTRACT RULE
Precondition

CompiledPlan is assumed valid.

Enforcement
if (!isCanonicalNodeType(target.layerType)) {
throw new GeneratorError("Compiler contract violation");
}
Meaning
Never user fault
Always internal system fault 12. ENFORCEMENT CHECKLIST (FOR AGENTS)
❌ FORBIDDEN
Construct MotionTarget from raw strings
Use aliases inside compiler or generator
Mutate DSL in validation
Skip canonicalize() for external inputs
Treat aliases as runtime ontology
✅ REQUIRED
Always call canonicalize() before DSL construction
Enforce CanonicalNodeType at DSL boundary
Use validateClip only for invariant checking
Keep alias resolution strictly in input layer
Maintain generator contract assertion 13. ARCHITECTURAL GUARANTEE

The compiler only processes canonical data.
The generator only emits validated plans.
Aliases never enter compilation or execution.
Any violation is a deterministic system fault.

14. VERSION LOCK
    v1.0 guarantees:
    Canonical-only DSL
    Strict alias isolation
    Non-mutating compiler
    Contract-guarded generator
    Deterministic error taxonomy
