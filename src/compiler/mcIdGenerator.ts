/**
 * mcId Generator — stable-ish unique identifiers for compiler-owned layers.
 *
 * Generated ids are embedded in MotionProgram definitions at authoring time
 * and stored in Cavalry's `userData.mcId` field after layer creation.
 * The same mcId travels with the serialized program on every re-run, so
 * Cavalry can find the layer even if its display name was changed by the user.
 *
 * Format: MC_<layerType>_<base36-timestamp>_<base36-random>
 * Example: MC_textShape_lzk0abc_3f7gq
 *
 * Uniqueness guarantee: timestamp + 5 random base-36 chars ≈ 60 million
 * combinations per millisecond — sufficient for scene-scale usage.
 * Not a UUID; no external deps required.
 */
export function generateMcId(layerType: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `MC_${layerType}_${ts}_${rand}`;
}
