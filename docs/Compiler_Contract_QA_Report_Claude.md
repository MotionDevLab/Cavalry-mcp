COMPILER CONTRACT QA REPORT
System under test: src/compiler/ — nodeRegistry → motionDSL → validators → cavalryGenerator

PART 1 — ALIAS INPUTS
TEST A-1

INPUT: "text"
LAYER: canonicalize("text") → "textShape"
Check Expected Observed
canonicalize("text") returns "textShape" CanonicalNodeType "textShape" ✓
isCanonicalNodeType("text") returns false false (alias, not canonical) false ✓
validateClip with layerType:"text" throws MotionValidationError throws (confirmed in test suite) ✓
generate() with layerType:"text" in compilerOwned target throws GeneratorError throws GeneratorError ✓
CLASSIFICATION: OK

Alias resolves to canonical at the input layer only. The alias string "text" never reaches validator or generator as a valid value. validateClip rejects it with MotionValidationError. The generator calls isCanonicalNodeType and throws GeneratorError. Boundary is clean.

TEST A-2

INPUT: "textLayer"
Check Expected Observed
canonicalize("textLayer") → "textShape" CanonicalNodeType "textShape" ✓
isCanonicalNodeType("textLayer") → false false false ✓
Validator rejects "textLayer" as layerType MotionValidationError throws ✓
CLASSIFICATION: OK

Same boundary behavior as "text". Alias is registered in ALIAS_MAP for input-layer use only. Not accepted by any downstream layer.

TEST A-3

INPUT: "rectangle"
Check Expected Observed
canonicalize("rectangle") null (not in ALIAS_MAP) null ✓
isCanonicalNodeType("rectangle") false false ✓
validateClip with layerType:"rectangle" MotionValidationError throws ✓
CLASSIFICATION: OK

"rectangle" is not registered as an alias or canonical type. Pipeline stops at input layer with null. Downstream layers correctly reject it.

TEST A-4

INPUT: "rect"
Check Expected Observed
canonicalize("rect") null null ✓
DSL/validator/generator exposure rejected all reject ✓
CLASSIFICATION: OK

Not in ALIAS_MAP, not canonical. Clean rejection.

TEST A-5

INPUT: "circle"
Check Expected Observed
canonicalize("circle") null null ✓
Downstream exposure rejected all reject ✓
CLASSIFICATION: OK

PART 2 — INVALID INPUTS
TEST B-1

INPUT: "basicText"
Check Expected Observed
canonicalize("basicText") null null ✓
isCanonicalNodeType("basicText") false false ✓ (in nodeRegistry test)
validateClip with "basicText" MotionValidationError throws ✓ (in validator test)
CLASSIFICATION: OK

TEST B-2

INPUT: "" (empty string)
Check Expected Observed
canonicalize("") null null ✓ (in nodeRegistry test suite: ["basicText", "basicShape", "notANode", ""])
isCanonicalNodeType("") false false ✓
validateClip with layerType:"" MotionValidationError WARNING — see note
NOTE: validateClip checks !clip.target.layerType on line 142 before reaching isCanonicalNodeType. An empty string is falsy in JavaScript. The guard is:

if (!clip.target.layerType || typeof clip.target.layerType !== "string") {
throw new MotionValidationError("compilerOwned requires non-empty layerType", ...)
}
Empty string hits the !clip.target.layerType branch and throws MotionValidationError with message "compilerOwned requires non-empty layerType" — not the canonical-check message. The error is correct in type, but fires via a separate guard than the isCanonicalNodeType check.

CLASSIFICATION: OK — rejection is correct. Error message is distinct from the canonical-check path; not a violation, but the dual-guard means two different messages can be produced for non-canonical input depending on whether the value is falsy.

TEST B-3

INPUT: "undefined" (string literal)
Check Expected Observed
canonicalize("undefined") null null ✓
isCanonicalNodeType("undefined") false false ✓
validateClip with layerType:"undefined" MotionValidationError throws via isCanonicalNodeType check ✓
CLASSIFICATION: OK

The string "undefined" is truthy, not in CANONICAL_NODE_TYPES, so it falls through to the isCanonicalNodeType check and is rejected correctly.

TEST B-4

INPUT: "TEXT" (uppercase)
Check Expected Observed
canonicalize("TEXT") null (ALIAS_MAP is case-sensitive) null ✓
isCanonicalNodeType("TEXT") false false ✓
Downstream rejection MotionValidationError throws ✓
CLASSIFICATION: OK

No case-insensitive matching in any layer. ALIAS_MAP and CANONICAL_NODE_TYPES are both case-sensitive. "TEXT" is not normalized anywhere in the pipeline.

TEST B-5

INPUT: " text " (whitespace-padded)
Check Expected Observed
canonicalize(" text ") null — no trim in canonicalize null ✓
isCanonicalNodeType(" text ") false false ✓
Downstream rejection MotionValidationError throws ✓
CLASSIFICATION: OK

canonicalize does not trim input. ALIAS_MAP[" text "] is undefined, returns null. Correct behavior — normalization is the caller's responsibility, not the registry's.

TEST B-6

INPUT: "notANode"
Check Expected Observed
canonicalize("notANode") null null ✓ (covered in nodeRegistry test)
Downstream rejected all reject ✓
CLASSIFICATION: OK

PART 3 — NATURAL LANGUAGE INPUTS
These inputs are processed by parseIntent() in intentParser.ts. They never reach nodeRegistry, validators, or cavalryGenerator directly via the intent pipeline.

TEST C-1

INPUT: "create a title text layer"
Check Expected Observed
parseIntent("create a title text layer") Should match "fade_in" via phrase scan or return null Returns null — no phrase in VOCABULARY matches
If null returned — pipeline stops null, no DSL constructed null ✓
Does any alias ("text") leak into DSL construction? No — intent parser returns null entirely No DSL constructed ✓
Note: normalize("create a title text layer") → "create a title text layer". VOCABULARY scans for exact substring matches: "fade in", "fadein", etc. The word "text" alone does not match any phrase. The intent parser returns null.

CLASSIFICATION: OK

No leakage. A null return from parseIntent means the pipeline never enters DSL construction. No alias or node type string reaches any downstream layer.

TEST C-2

INPUT: "make a rectangle animation"
Check Expected Observed
parseIntent("make a rectangle animation") null null ✓
"rectangle" enters DSL? No No — intent parser null-stops ✓
CLASSIFICATION: OK

"rectangle" does not match any VOCABULARY phrase. Pipeline stops at null.

TEST C-3

INPUT: "build a fade-in text block"
Check Expected Observed
parseIntent("build a fade-in text block") Should match preset "fade_in" normalize(input) → "build a fade-in text block" — contains "fade-in" which is in VOCABULARY → returns { preset: "fade_in" } ✓
Does the returned IntentRecognition contain any node type or alias? No — only { preset: "fade_in" } Correct: no layerType is produced by parser ✓
Can this result construct a DSL without a layerType being separately supplied? Only if a higher layer adds one — intent parser itself does not IntentRecognition has no layerType field ✓
CLASSIFICATION: OK

The intent parser returns { preset: "fade_in" } with an optional targetHint. Neither field contains a node type. Any layerType must be injected by a higher layer, which is responsible for calling canonicalize() before passing to DSL. The parser itself introduces no alias leakage.

PART 4 — BOUNDARY INTEGRITY CHECKS
BOUNDARY CHECK 1 — Does the validator call canonicalize?

Code path: validators.ts imports isCanonicalNodeType from nodeRegistry.ts. It does not import canonicalize.

// validators.ts line 22
import { isCanonicalNodeType } from "./nodeRegistry.js";
canonicalize is not called. The validator performs a pure check only.

RESULT: OK — Validator is not performing alias resolution.

BOUNDARY CHECK 2 — Does the generator call canonicalize?

// cavalryGenerator.ts line 25
import { isCanonicalNodeType } from "./nodeRegistry.js";
canonicalize is not imported. The generator calls only isCanonicalNodeType, which is a pure predicate with no side effects.

RESULT: OK — Generator performs only a guard check, no normalization.

BOUNDARY CHECK 3 — Generator error type on contract violation

emitTargetResolution (line 50):

if (!isCanonicalNodeType(t.target.layerType)) {
throw new GeneratorError("Compiler contract violation");
}
existingLayerByName path (line 55–58):

throw new GeneratorError(
`Target kind "${t.target.kind}" not supported by v1 generator...`
);
Unresolved ref path (line 168–170):

throw new GeneratorError(`unresolved target ref: ${ref}`);
Non-finite number path (line 124–126):

throw new GeneratorError(`refusing to emit non-finite number ${value}`);
All error throws in the generator use GeneratorError. Confirmed by test suite (I3).

RESULT: OK — Generator error boundary is clean.

BOUNDARY CHECK 4 — existingLayerByName unsupported path

The DSL accepts existingLayerByName as a valid MotionTarget kind. The validator accepts it (validates only that name is a non-empty string — lines 119–124 of validators.ts). The generator rejects it at emitTargetResolution with GeneratorError.

This is a DESIGN OBSERVATION: a valid DSL document (passes validator) can produce a GeneratorError. This is not a contract violation — the validator's contract is DSL structural validity, and the generator's contract is explicit about what it supports. However:

The validator does NOT check existingLayerByName against generator capability.
A caller that follows DSL-valid → generate() will hit an unexpected GeneratorError.
CLASSIFICATION: WARNING — existingLayerByName passes the validator but is rejected by the generator. The gap is known and documented in motionDSL.ts line 108: "existingLayerByName is reserved in the DSL surface but rejected by the generator." The contract is documented but not enforced at the validator boundary. A strict QA position flags this as an incomplete enforcement point.

BOUNDARY CHECK 5 — parseIntent input validation

export function parseIntent(text: string): IntentRecognition | null {
if (typeof text !== "string" || text.length === 0) return null;
Correctly null-gates on non-string and empty string before any processing. Whitespace-only inputs would not produce a match (normalize trims, then no phrase matches). Null is returned.

RESULT: OK

SUMMARY TABLE

# Input Expected Observed Classification

A-1 "text" Alias resolves at input layer; rejected downstream Correct at all layers OK
A-2 "textLayer" Same as "text" Correct at all layers OK
A-3 "rectangle" null from canonicalize; rejected null + rejected OK
A-4 "rect" null from canonicalize; rejected null + rejected OK
A-5 "circle" null from canonicalize; rejected null + rejected OK
B-1 "basicText" null; rejected null + rejected OK
B-2 "" null; falsy-guard in validator null; rejected via falsy branch OK
B-3 "undefined" null; canonical-check rejection null + rejected OK
B-4 "TEXT" null (case-sensitive); rejected null + rejected OK
B-5 " text " null (no trim in canonicalize); rejected null + rejected OK
B-6 "notANode" null; rejected null + rejected OK
C-1 "create a title text layer" null from parseIntent null — no phrase match OK
C-2 "make a rectangle animation" null from parseIntent null — no phrase match OK
C-3 "build a fade-in text block" { preset: "fade_in" }, no layerType Correct — preset only, no alias OK
BC-4 existingLayerByName in DSL WARNING — validator passes, generator rejects Confirmed gap WARNING
VIOLATIONS
None found.

WARNINGS
W-1 — existingLayerByName validator/generator gap

Root cause category: boundary design issue
The existingLayerByName target kind is accepted by the validator (MotionValidationError is not thrown) but explicitly rejected by the generator (GeneratorError is thrown).
A pipeline that calls validateProgram() then generate() will receive a runtime GeneratorError on a structurally valid program.
The behavior is documented in motionDSL.ts but is not enforced at the validator boundary. No test covers this specific path.
ROOT CAUSE CATEGORIES FOUND
Category Status
Alias leakage None
DSL contamination None
Validator impurity None
Generator contract failure None
Boundary design issue W-1 (existingLayerByName)
FINAL SYSTEM STATUS
DEGRADED
Reason: One confirmed WARNING (W-1). No violations. All alias, invalid, and natural language inputs are handled correctly at every layer boundary. The existingLayerByName DSL kind creates a documented but unenforced validator/generator gap. The system is functional and contract-correct for all supported inputs, but the gap is a latent failure mode for any caller that constructs a DSL with existingLayerByName.
