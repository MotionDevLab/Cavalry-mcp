import type { MotionNode } from "../compiler/motionDSL.js";

export const canonicalNode: MotionNode = {
  layerType: "textShape",
  attrs: {},
} as MotionNode;

export const invalidNode: any = {
  layerType: "notCanonical",
  attrs: {},
};
