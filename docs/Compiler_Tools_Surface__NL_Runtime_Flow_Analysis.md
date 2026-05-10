Verification Results (fresh evidence, no speculation)
Typecheck: tsc --noEmit — exit 0, zero errors
Build: npm run build — exit 0, clean compile
Unit tests: dist/runtime-tests/cavalryRuntimeHarness.test.js — 5/5 pass

Final Architecture
Tool Surface (2 tools + ping)
Tool Path Purpose
cavalry_ping direct → Stallion health check
cavalry_run_motion NL → compiler pipeline → Stallion only NL path
cavalry_run_script raw JS → Stallion debug/bypass only
NL Runtime Flow (cavalry_run_motion)
prompt
→ parseIntent() intentParser.ts — controlled vocab, null on miss
→ buildProgramFromIntent() buildProgram.ts — MotionProgram factory
→ compile() motionCompiler.ts — validates + expands presets
→ finalizeProgram() finalizeProgram.ts — hard runtime boundary gate
→ generate() cavalryGenerator.ts — ONLY layer touching api.\* strings
→ runScript() index.ts — Node safety check + Stallion dispatch
Fail-fast at every stage — Stallion is never called when the compiler rejects.

Compiler Bypass Risks
Risk Status
api.\* calls in compiler layers (buildProgram, compile, intentParser) None confirmed — grep clean
runScript/sendToCavalry inside compiler None — grep clean
sceneIdentityResolver used outside generator None — only imported by cavalryGenerator.ts
Raw JS inlined in cavalry_run_motion handler None — all JS comes from generate()
cavalry_run_script on NL path Structurally impossible — separate tool, no shared logic with run_motion
The only remaining bypass risk is operator error: a caller using cavalry_run_script for NL requests. That's a usage contract violation, not a code path vulnerability. The tool description explicitly warns against it, and there's no code path that could silently route NL through the bypass.
