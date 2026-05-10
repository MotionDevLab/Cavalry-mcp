import { isCanonicalNodeType } from "./nodeRegistry.js";
import type { MotionProgram } from "./motionDSL.js";

export function finalizeProgram(program: MotionProgram): MotionProgram {
  for (const clip of program.clips) {
    const t = clip.target;

    // HARD RUNTIME BOUNDARY: no name-based targets allowed
    if (t.kind === "existingLayerByName") {
      throw new Error(
        "FINALIZER: existingLayerByName is not allowed at runtime",
      );
    }

    // CANONICAL TYPE SAFETY ONLY (no structural validation duplication)
    if (t.kind === "compilerOwned" && !isCanonicalNodeType(t.layerType)) {
      throw new Error(`FINALIZER: invalid canonical type '${t.layerType}'`);
    }
  }

  return program;
}
