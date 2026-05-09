import { canonicalize } from "../src/compiler/nodeRegistry.js";
import { compile } from "../src/compiler/motionCompiler.js";
import { generate } from "../src/compiler/cavalryGenerator.js";
import type { MotionClip, MotionProgram } from "../src/compiler/motionDSL.js";

const rawInputs = [
  { name: "TEXT_SHAPE_TEST",   rawType: "textShape"       },
  { name: "BASIC_TEXT_TEST",   rawType: "basicText"       },
  { name: "UNKNOWN_TYPE_TEST", rawType: "unknownNodeType" },
];

const validClips: MotionClip[] = [];

for (const { name, rawType } of rawInputs) {
  const canonical = canonicalize(rawType);
  if (canonical === null) {
    process.stderr.write(`[BOUNDARY REJECT] "${name}": canonicalize("${rawType}") → null — pipeline halted, no JS emitted\n`);
    continue;
  }
  process.stderr.write(`[BOUNDARY PASS]   "${name}": canonicalize("${rawType}") → "${canonical}"\n`);
  validClips.push({
    id: `clip_${name.toLowerCase()}`,
    target: { kind: "compilerOwned", compilerLayerId: name, layerType: canonical },
    preset: "fade_in",
    timing: { startFrame: 0, durationFrames: 30 },
  });
}

const program: MotionProgram = { version: "1", clips: validClips };
const plan = compile(program);
process.stdout.write(generate(plan));
