#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { sendToCavalry, pingStallion } from "./stallion.js";

const server = new McpServer({
  name: "cavalry-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Helper: wraps Cavalry script execution with error handling
// ---------------------------------------------------------------------------
async function runScript(code: string): Promise<string> {
  try {
    const result = await sendToCavalry(code);
    return result || "Script executed successfully.";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ECONNREFUSED")) {
      return "Error: Could not connect to Cavalry. Make sure Cavalry is running and the Stallion script is active (Scripts > Stallion).";
    }
    return `Error: ${message}`;
  }
}

// ---------------------------------------------------------------------------
// Tool: ping — check if Cavalry is reachable
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_ping",
  "Check if Cavalry is running and the Stallion bridge is reachable",
  {},
  async () => {
    const reachable = await pingStallion();
    return {
      content: [
        {
          type: "text",
          text: reachable
            ? "Cavalry is reachable via Stallion."
            : "Cavalry is not reachable. Make sure Cavalry is running and the Stallion script is active (Scripts > Stallion).",
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: run_script — execute arbitrary JavaScript in Cavalry
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_run_script",
  "Execute arbitrary JavaScript in Cavalry's JavaScript Editor. Use Cavalry's api, cavalry, and ui namespaces. This is the most flexible tool — use it when no specialized tool fits.",
  { code: z.string().describe("JavaScript code to execute in Cavalry") },
  async ({ code }) => {
    const result = await runScript(code);
    return { content: [{ type: "text", text: result }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: create_layer — create a layer in the scene
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_create_layer",
  `Create a new layer in the Cavalry scene. Common layer types: basicShape, textShape, null, colorPlane, ellipse, rectangle, group, subMesh, linearGradient, cameraRig, pathfinder, duplicator, connectShape, noiseDeformer, meshDeformer, stagger, trail, spreadsheet, csvAsset, soundAsset, imageAsset, videoAsset, javaScriptUtility, javaScriptShape.`,
  {
    layerType: z
      .string()
      .describe('The layer type ID, e.g. "textShape", "basicShape", "null"'),
    name: z.string().describe("Display name for the new layer"),
  },
  async ({ layerType, name }) => {
    const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const code = `var layerId = api.create("${layerType}", "${escapedName}");\napi.log(layerId);`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: `Created layer: ${result}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: set_attributes — set attributes on a layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_attribute",
  `Set one or more attributes on a Cavalry layer. Attributes use dot-notation paths, e.g. "position.x", "fontSize", "fill.color".`,
  {
    layerId: z.string().describe("The layer ID (e.g. from create_layer)"),
    attributes: z
      .record(z.unknown())
      .describe(
        'Key-value map of attribute paths to values, e.g. {"fontSize": 48, "position.x": 100}',
      ),
  },
  async ({ layerId, attributes }) => {
    const attrJson = JSON.stringify(attributes);
    const code = `api.set("${layerId}", ${attrJson});`;
    const result = await runScript(code);
    return {
      content: [
        { type: "text", text: `Attributes set on ${layerId}: ${result}` },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_attribute — read an attribute value
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_attribute",
  "Read the value of an attribute from a Cavalry layer.",
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z
      .string()
      .describe('The attribute path, e.g. "position.x", "fontSize"'),
  },
  async ({ layerId, attrPath }) => {
    const code = `var val = api.get("${layerId}", "${attrPath}");\napi.log(JSON.stringify(val));`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: result }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: connect — connect attributes between layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_connect",
  `Connect an output attribute to an input attribute between layers. Use "id" as the outAttr to connect a layer's main output.`,
  {
    sourceLayerId: z.string().describe("Source layer ID"),
    sourceAttr: z
      .string()
      .describe('Source attribute path (use "id" for the main output)'),
    targetLayerId: z.string().describe("Target layer ID"),
    targetAttr: z.string().describe("Target attribute path"),
    force: z
      .boolean()
      .optional()
      .describe(
        "If true, overwrite any existing connection on the target attribute",
      ),
  },
  async ({ sourceLayerId, sourceAttr, targetLayerId, targetAttr, force }) => {
    const forceArg = force ? ", true" : "";
    const code = `api.connect("${sourceLayerId}", "${sourceAttr}", "${targetLayerId}", "${targetAttr}"${forceArg});`;
    const result = await runScript(code);
    return {
      content: [
        {
          type: "text",
          text: `Connected ${sourceLayerId}.${sourceAttr} → ${targetLayerId}.${targetAttr}: ${result}`,
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: keyframe — set a keyframe
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_keyframe",
  "Set a keyframe on a layer attribute at a specific frame.",
  {
    layerId: z.string().describe("The layer ID"),
    frame: z.number().describe("The frame number"),
    attributes: z
      .record(z.unknown())
      .describe(
        'Key-value map of attribute paths to values at this frame, e.g. {"position.x": 0}',
      ),
  },
  async ({ layerId, frame, attributes }) => {
    const attrJson = JSON.stringify(attributes);
    const code = `api.keyframe("${layerId}", ${frame}, ${attrJson});`;
    const result = await runScript(code);
    return {
      content: [
        {
          type: "text",
          text: `Keyframe set on ${layerId} at frame ${frame}: ${result}`,
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: magic_easing — apply easing to a keyframe
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_magic_easing",
  `Apply Magic Easing to a keyframed attribute. Easing types include: EaseIn, EaseOut, EaseInOut, BounceIn, BounceOut, BounceInOut, ElasticIn, ElasticOut, ElasticInOut, BackIn, BackOut, BackInOut, Linear.`,
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().describe("The attribute path"),
    frame: z.number().describe("The frame to apply easing at"),
    easingType: z.string().describe('Easing type, e.g. "EaseInOut", "BounceOut"'),
  },
  async ({ layerId, attrPath, frame, easingType }) => {
    const code = `api.magicEasing("${layerId}", "${attrPath}", ${frame}, "${easingType}");`;
    const result = await runScript(code);
    return {
      content: [{ type: "text", text: `Easing applied: ${result}` }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_scene_layers — list all layers in the scene
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_scene_layers",
  "Get a list of all layers in the current Cavalry scene with their IDs and types.",
  {},
  async () => {
    const code = `
var layers = api.getAllSceneLayers();
var info = [];
for (var i = 0; i < layers.length; i++) {
  var name = api.getNiceName(layers[i]);
  var type = api.getLayerType(layers[i]);
  info.push(layers[i] + " | " + type + " | " + name);
}
api.log(info.join("\\n"));
`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: result }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_selected_layers — get currently selected layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_selected_layers",
  "Get the currently selected layers in Cavalry.",
  {},
  async () => {
    const code = `
var sel = api.getSelection();
var info = [];
for (var i = 0; i < sel.length; i++) {
  var name = api.getNiceName(sel[i]);
  var type = api.getLayerType(sel[i]);
  info.push(sel[i] + " | " + type + " | " + name);
}
api.log(info.join("\\n"));
`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: result }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: select_layers — set the selection
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_select_layers",
  "Select specific layers in Cavalry by their IDs.",
  {
    layerIds: z
      .array(z.string())
      .describe("Array of layer IDs to select"),
  },
  async ({ layerIds }) => {
    const idsJson = JSON.stringify(layerIds);
    const code = `api.select(${idsJson});`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: `Selection set: ${result}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: delete_layers — delete layers from the scene
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_delete_layers",
  "Delete layers from the Cavalry scene by their IDs.",
  {
    layerIds: z
      .array(z.string())
      .describe("Array of layer IDs to delete"),
  },
  async ({ layerIds }) => {
    const idsJson = JSON.stringify(layerIds);
    const code = `api.deleteLayer(${idsJson});`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: `Layers deleted: ${result}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_composition_info — get active composition details
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_composition_info",
  "Get information about the active composition (resolution, frame range, FPS).",
  {},
  async () => {
    const code = `
var comp = api.getActiveComp();
var resX = api.get(comp, "resolution.x");
var resY = api.get(comp, "resolution.y");
var inFrame = api.getInFrame();
var outFrame = api.getOutFrame();
var fps = api.get(comp, "frameRate");
api.log(JSON.stringify({
  compId: comp,
  resolution: { x: resX, y: resY },
  inFrame: inFrame,
  outFrame: outFrame,
  fps: fps
}));
`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: result }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: set_current_frame — jump to a specific frame
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_current_frame",
  "Set the playhead to a specific frame in the timeline.",
  {
    frame: z.number().describe("Frame number to jump to"),
  },
  async ({ frame }) => {
    const code = `api.setCurrentFrame(${frame});`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: `Frame set to ${frame}: ${result}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: render_png — render a single frame as PNG
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_render_png",
  "Render the current frame as a PNG file.",
  {
    filePath: z
      .string()
      .describe("Absolute file path for the output PNG"),
    scale: z
      .number()
      .optional()
      .describe("Scale percentage (100 = 1x, 200 = 2x). Defaults to 100."),
  },
  async ({ filePath, scale }) => {
    const s = scale ?? 100;
    const escapedPath = filePath.replace(/\\/g, "\\\\");
    const code = `api.renderPNGFrame("${escapedPath}", ${s});`;
    const result = await runScript(code);
    return {
      content: [{ type: "text", text: `Rendered to ${filePath}: ${result}` }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: set_generator — set a generator on a layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_generator",
  `Set a generator on a layer. For example, set a Basic Shape to use an ellipse or rectangle generator. Use api.getGenerators(layerId) to discover available generators.`,
  {
    layerId: z.string().describe("The layer ID"),
    generatorId: z
      .string()
      .describe('The generator ID, e.g. "ellipse", "rectangle", "star"'),
  },
  async ({ layerId, generatorId }) => {
    const code = `api.setGenerator("${layerId}", "${generatorId}");`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: `Generator set: ${result}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: duplicate_layer — duplicate a layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_duplicate_layer",
  "Duplicate a layer in the scene.",
  {
    layerId: z.string().describe("The layer ID to duplicate"),
  },
  async ({ layerId }) => {
    const code = `api.select(["${layerId}"]);\nvar duped = api.duplicateSelection();\napi.log(JSON.stringify(duped));`;
    const result = await runScript(code);
    return {
      content: [{ type: "text", text: `Duplicated: ${result}` }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_bounding_box — get layer bounding box
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_bounding_box",
  "Get the bounding box of a layer (useful for positioning).",
  {
    layerId: z.string().describe("The layer ID"),
  },
  async ({ layerId }) => {
    const code = `var bb = api.getBoundingBox("${layerId}");\napi.log(JSON.stringify(bb));`;
    const result = await runScript(code);
    return { content: [{ type: "text", text: result }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: save_scene — save the current scene
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_save_scene",
  "Save the current Cavalry scene. Optionally save to a new path.",
  {
    filePath: z
      .string()
      .optional()
      .describe("Optional file path for 'Save As'. Omit to save in-place."),
  },
  async ({ filePath }) => {
    let code: string;
    if (filePath) {
      const escaped = filePath.replace(/\\/g, "\\\\");
      code = `api.saveScene("${escaped}");`;
    } else {
      code = `api.saveScene();`;
    }
    const result = await runScript(code);
    return { content: [{ type: "text", text: `Scene saved: ${result}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: open_scene — open a scene file
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_open_scene",
  "Open a Cavalry scene file (.cv).",
  {
    filePath: z.string().describe("Absolute path to the .cv file"),
  },
  async ({ filePath }) => {
    const escaped = filePath.replace(/\\/g, "\\\\");
    const code = `api.loadScene("${escaped}");`;
    const result = await runScript(code);
    return {
      content: [{ type: "text", text: `Scene opened: ${result}` }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: add_dynamic_attribute — add a dynamic attribute to a layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_add_dynamic_attribute",
  `Add a dynamic attribute to a layer (e.g., on a JavaScript Utility). Types: "int", "double", "bool", "string", "color", "int2d", "double2d", "position2d".`,
  {
    layerId: z.string().describe("The layer ID"),
    attrName: z.string().describe("Name for the new attribute"),
    attrType: z
      .string()
      .describe(
        'Type of attribute: "int", "double", "bool", "string", "color", "int2d", "double2d", "position2d"',
      ),
  },
  async ({ layerId, attrName, attrType }) => {
    const escapedName = attrName.replace(/"/g, '\\"');
    const code = `api.addDynamic("${layerId}", "${escapedName}", "${attrType}");`;
    const result = await runScript(code);
    return {
      content: [{ type: "text", text: `Dynamic attribute added: ${result}` }],
    };
  },
);

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start cavalry-mcp server:", err);
  process.exit(1);
});
