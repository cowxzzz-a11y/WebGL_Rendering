import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import sharp from "sharp";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { mat4 } from "gl-matrix";
import { Logger, NodeIO, Primitive, PropertyType } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  KHRMeshQuantization,
  KHRTextureBasisu,
} from "@gltf-transform/extensions";
import {
  compactPrimitive,
  dedup,
  dequantizePrimitive,
  joinPrimitives,
  palette,
  prune,
  simplifyPrimitive,
  transformPrimitive,
  weldPrimitive,
} from "@gltf-transform/functions";

const KNOWN_FLAGS = new Set(["KEEP", "MERGE", "INST", "DECAL", "LOD"]);

const DEFAULT_TEXTURE_FORMAT = "webp";
const DEFAULT_GEOMETRY_MODE = "local";
const DEFAULT_UNTAGGED_MODE = "compress";
const DEFAULT_QUALITY_PROFILE = "balanced";
const DEFAULT_PALETTE_MIN = 5;
const KTX_MIN_VERSION = "4.3.0";
const DEFAULT_KTX_HINT = "E:\\Software\\KTX-Software\\bin\\ktx.exe";
const MIPMAP_FILTER = "lanczos4";
const MIPMAP_FILTER_SCALE = 1;
const DEFAULT_WEBP_EFFORT = 5;
const DEFAULT_WEBP_QUALITY_BASE = 92;
const DEFAULT_WEBP_QUALITY_EMISSIVE = 94;
const DEFAULT_WEBP_QUALITY_OTHER = 90;
const DEFAULT_SIMPLIFY_SCALE = 1;
const DEFAULT_SIMPLIFY_MIN_TRIANGLES = 500;
const DEFAULT_QUANTIZE_MIN_TRIANGLES = 2000;
const MAX_SAFE_SLENDERNESS = 80;
const MAX_SAFE_FLATNESS = 0.08;
const EPSILON = 1e-6;
const QUALITY_PROFILES = {
  quality: {
    maxTextureSizeColor: [768, 768],
    maxTextureSizeData: [512, 512],
    etc1sQLevel: 72,
    etc1sCLevel: 3,
    uastcQuality: 1,
    uastcRdoNormal: 0.9,
    uastcRdoData: 1.6,
    uastcRdoOther: 2.0,
  },
  balanced: {
    maxTextureSizeColor: [512, 512],
    maxTextureSizeData: [384, 384],
    etc1sQLevel: 45,
    etc1sCLevel: 2,
    uastcQuality: 0,
    uastcRdoNormal: 1.0,
    uastcRdoData: 1.75,
    uastcRdoOther: 2.25,
  },
  compact: {
    maxTextureSizeColor: [288, 288],
    maxTextureSizeData: [192, 192],
    etc1sQLevel: 12,
    etc1sCLevel: 1,
    uastcQuality: 0,
    uastcRdoNormal: 1.2,
    uastcRdoData: 2.0,
    uastcRdoOther: 2.5,
  },
};

async function main() {
  const [inputPath, outputPath, ...rest] = process.argv.slice(2);

  if (!inputPath || !outputPath) {
    throw new Error(
      [
        "Usage:",
        "node smart-optimize.mjs <input.glb> <output.glb>",
        "[--texture-format=ktx2|webp|none]",
        "[--geometry-mode=local|none]",
        "[--untagged-mode=compress|local|merge-local|none]",
        "[--quality-profile=quality|balanced|compact]",
        "[--color-max-size=<pixels>]",
        "[--data-max-size=<pixels>]",
        "[--webp-quality-base=<0-100>]",
        "[--webp-quality-emissive=<0-100>]",
        "[--webp-quality-other=<0-100>]",
        "[--webp-effort=<0-6>]",
        "[--no-palette]",
        "[--palette-min=<count>]",
        "[--simplify-scale=<number>]",
        "[--simplify-min-triangles=<count>]",
        "[--quantize-min-triangles=<count>]",
        "[--ktx-path=<path-to-ktx.exe>]",
      ].join(" ")
    );
  }

  const options = parseArgs(rest);

  await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const [dracoDecoder, dracoEncoder] = await Promise.all([
    draco3d.createDecoderModule(),
    draco3d.createEncoderModule(),
  ]);

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": dracoDecoder,
      "draco3d.encoder": dracoEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });

  console.log(`Input: ${inputPath}`);
  const document = await io.read(inputPath);
  document.setLogger(new Logger(Logger.Verbosity.ERROR));

  const fixedMimeCount = repairTextureMimeTypes(document);
  const paletteStats = await applySolidMaterialPalette(document, options);
  const mergeStats = mergeByNaming(document);
  const keepTargets =
    options.geometryMode === "local" ? collectKeepGeometryTargets(document) : [];
  const reservedGeometryNodes = new Set([
    ...mergeStats.mergedGroups.map((group) => group.carrierNode),
    ...keepTargets.map((group) => group.carrierNode),
  ]);
  const untaggedPrep = prepareUntaggedGeometry(document, options, reservedGeometryNodes);

  let textureStats = {
    format: options.textureFormat,
    converted: 0,
    skipped: 0,
    etc1sCount: 0,
    uastcCount: 0,
    ktxBinary: null,
  };

  if (options.textureFormat === "ktx2") {
    textureStats = await compressTexturesToKTX2(document, options);
  } else if (options.textureFormat === "webp") {
    textureStats = await compressTexturesToWebP(document, options);
  }

  let geometryStats = {
    candidateGroupCount: 0,
    protectedGroupCount: 0,
    simplifiedPrimitiveCount: 0,
    weldedPrimitiveCount: 0,
    weldedVertexDelta: 0,
    quantizedGroupCount: 0,
    trianglesBefore: 0,
    trianglesAfter: 0,
    simplifiedCarriers: [],
    quantizedCarriers: [],
    protectedCarriers: [],
  };

  if (options.geometryMode === "local") {
    geometryStats = await optimizeGeometryTargets(document, [
      ...mergeStats.mergedGroups,
      ...untaggedPrep.targets,
      ...keepTargets,
    ], options);
  }

  await document.transform(
    dedup(),
    prune({
      propertyTypes: [
        PropertyType.NODE,
        PropertyType.MESH,
        PropertyType.PRIMITIVE,
        PropertyType.ACCESSOR,
        PropertyType.MATERIAL,
        PropertyType.TEXTURE,
        PropertyType.BUFFER,
      ],
      keepLeaves: false,
      keepAttributes: true,
      keepSolidTextures: false,
    })
  );

  await io.write(outputPath, document);

  console.log("");
  console.log("Smart optimize done.");
  console.log(`Fixed texture mime types: ${fixedMimeCount}`);
  console.log(`Palette enabled: ${paletteStats.enabled ? "yes" : "no"}`);
  console.log(
    `Palette materials: ${paletteStats.materialsBefore} -> ${paletteStats.materialsAfter}`
  );
  console.log(`Palette textures created: ${paletteStats.createdTextures}`);
  console.log(`Merged business groups: ${mergeStats.boundaryCount}`);
  console.log(`Created merged carrier nodes: ${mergeStats.groupCount}`);
  console.log(`Consumed source MERGE meshes: ${mergeStats.sourceNodeCount}`);
  console.log(`Created merged primitives: ${mergeStats.primitiveCount}`);
  console.log(`Untagged mode: ${options.untaggedMode}`);
  console.log(`Merged untagged groups: ${untaggedPrep.mergeStats.boundaryCount}`);
  console.log(`Created untagged carrier nodes: ${untaggedPrep.mergeStats.groupCount}`);
  console.log(`Consumed untagged source meshes: ${untaggedPrep.mergeStats.sourceNodeCount}`);
  console.log(`Created untagged merged primitives: ${untaggedPrep.mergeStats.primitiveCount}`);
  console.log(`Texture format: ${textureStats.format}`);
  console.log(`Quality profile: ${options.qualityProfile}`);
  const effectiveProfile = getQualityProfile(options.qualityProfile, options);
  console.log(
    `Texture max size color/data: ${effectiveProfile.maxTextureSizeColor[0]} / ${effectiveProfile.maxTextureSizeData[0]}`
  );
  console.log(`Texture converted: ${textureStats.converted}`);
  console.log(`Texture skipped: ${textureStats.skipped}`);
  if (textureStats.format === "webp") {
    console.log(
      `WebP quality base/emissive/other: ${resolveWebPQuality("base", options)} / ${resolveWebPQuality("emissive", options)} / ${resolveWebPQuality("other", options)}`
    );
    console.log(`WebP effort: ${options.webpEffort}`);
  }
  if (textureStats.format === "ktx2") {
    console.log(`KTX ETC1S textures: ${textureStats.etc1sCount}`);
    console.log(`KTX UASTC textures: ${textureStats.uastcCount}`);
    console.log(`KTX binary: ${textureStats.ktxBinary ?? "not used"}`);
  }
  console.log(`Geometry mode: ${options.geometryMode}`);
  console.log(`Simplify scale: ${formatDecimal(options.simplifyScale)}`);
  console.log(`Simplify min triangles: ${options.simplifyMinTriangles}`);
  console.log(`Quantize min triangles: ${options.quantizeMinTriangles}`);
  console.log(`Geometry safe groups: ${geometryStats.candidateGroupCount}`);
  console.log(`Geometry protected groups: ${geometryStats.protectedGroupCount}`);
  console.log(`Geometry welded primitives: ${geometryStats.weldedPrimitiveCount}`);
  console.log(`Geometry welded vertices saved: ${geometryStats.weldedVertexDelta}`);
  console.log(`Geometry simplified primitives: ${geometryStats.simplifiedPrimitiveCount}`);
  console.log(`Geometry quantized groups: ${geometryStats.quantizedGroupCount}`);
  console.log(`Geometry triangles: ${geometryStats.trianglesBefore} -> ${geometryStats.trianglesAfter}`);
  if (geometryStats.simplifiedCarriers.length > 0) {
    console.log(
      `Geometry simplified carriers: ${formatSummaryList(geometryStats.simplifiedCarriers)}`
    );
  }
  if (geometryStats.quantizedCarriers.length > 0) {
    console.log(
      `Geometry quantized carriers: ${formatSummaryList(geometryStats.quantizedCarriers)}`
    );
  }
  if (geometryStats.protectedCarriers.length > 0) {
    console.log(
      `Geometry protected carriers: ${formatSummaryList(geometryStats.protectedCarriers)}`
    );
  }
  console.log(`Output: ${outputPath}`);
}

function parseArgs(args) {
  const options = {
    textureFormat: DEFAULT_TEXTURE_FORMAT,
    geometryMode: DEFAULT_GEOMETRY_MODE,
    untaggedMode: DEFAULT_UNTAGGED_MODE,
    qualityProfile: DEFAULT_QUALITY_PROFILE,
    colorMaxSize: null,
    dataMaxSize: null,
    webpQualityBase: null,
    webpQualityEmissive: null,
    webpQualityOther: null,
    webpEffort: DEFAULT_WEBP_EFFORT,
    enablePalette: true,
    paletteMin: DEFAULT_PALETTE_MIN,
    simplifyScale: DEFAULT_SIMPLIFY_SCALE,
    simplifyMinTriangles: DEFAULT_SIMPLIFY_MIN_TRIANGLES,
    quantizeMinTriangles: DEFAULT_QUANTIZE_MIN_TRIANGLES,
    ktxPath: null,
  };

  for (const arg of args) {
    if (arg === "--compress-textures") {
      options.textureFormat = "ktx2";
      continue;
    }

    if (arg === "--no-texture-compress") {
      options.textureFormat = "none";
      continue;
    }

    if (arg === "--no-geometry-opt") {
      options.geometryMode = "none";
      continue;
    }

    if (arg === "--meshopt") {
      throw new Error(
        "Meshopt stays disabled for this project. Use the built-in local geometry mode instead."
      );
    }

    if (arg.startsWith("--texture-format=")) {
      const value = arg.slice("--texture-format=".length).trim().toLowerCase();
      if (!["ktx2", "webp", "none"].includes(value)) {
        throw new Error(`Unsupported texture format: ${value}`);
      }
      options.textureFormat = value;
      continue;
    }

    if (arg.startsWith("--geometry-mode=")) {
      const value = arg.slice("--geometry-mode=".length).trim().toLowerCase();
      if (!["local", "none"].includes(value)) {
        throw new Error(`Unsupported geometry mode: ${value}`);
      }
      options.geometryMode = value;
      continue;
    }

    if (arg.startsWith("--untagged-mode=")) {
      const value = arg.slice("--untagged-mode=".length).trim().toLowerCase();
      if (!["compress", "local", "merge-local", "none"].includes(value)) {
        throw new Error(`Unsupported untagged mode: ${value}`);
      }
      options.untaggedMode = value;
      continue;
    }

    if (arg.startsWith("--quality-profile=")) {
      const value = arg.slice("--quality-profile=".length).trim().toLowerCase();
      if (!Object.hasOwn(QUALITY_PROFILES, value)) {
        throw new Error(`Unsupported quality profile: ${value}`);
      }
      options.qualityProfile = value;
      continue;
    }

    if (arg.startsWith("--color-max-size=")) {
      options.colorMaxSize = parseIntegerOption(
        arg,
        "--color-max-size=",
        16,
        8192
      );
      continue;
    }

    if (arg.startsWith("--data-max-size=")) {
      options.dataMaxSize = parseIntegerOption(
        arg,
        "--data-max-size=",
        16,
        8192
      );
      continue;
    }

    if (arg.startsWith("--webp-quality-base=")) {
      options.webpQualityBase = parseIntegerOption(
        arg,
        "--webp-quality-base=",
        0,
        100
      );
      continue;
    }

    if (arg.startsWith("--webp-quality-emissive=")) {
      options.webpQualityEmissive = parseIntegerOption(
        arg,
        "--webp-quality-emissive=",
        0,
        100
      );
      continue;
    }

    if (arg.startsWith("--webp-quality-other=")) {
      options.webpQualityOther = parseIntegerOption(
        arg,
        "--webp-quality-other=",
        0,
        100
      );
      continue;
    }

    if (arg.startsWith("--webp-effort=")) {
      options.webpEffort = parseIntegerOption(arg, "--webp-effort=", 0, 6);
      continue;
    }

    if (arg === "--no-palette") {
      options.enablePalette = false;
      continue;
    }

    if (arg.startsWith("--palette-min=")) {
      options.paletteMin = parseIntegerOption(arg, "--palette-min=", 2, 4096);
      continue;
    }

    if (arg.startsWith("--simplify-scale=")) {
      options.simplifyScale = parseNumberOption(
        arg,
        "--simplify-scale=",
        0,
        4
      );
      continue;
    }

    if (arg.startsWith("--simplify-min-triangles=")) {
      options.simplifyMinTriangles = parseIntegerOption(
        arg,
        "--simplify-min-triangles=",
        0,
        10000000
      );
      continue;
    }

    if (arg.startsWith("--quantize-min-triangles=")) {
      options.quantizeMinTriangles = parseIntegerOption(
        arg,
        "--quantize-min-triangles=",
        0,
        10000000
      );
      continue;
    }

    if (arg.startsWith("--ktx-path=")) {
      options.ktxPath = arg.slice("--ktx-path=".length).trim();
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseIntegerOption(arg, prefix, min, max) {
  const raw = arg.slice(prefix.length).trim();
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || String(value) !== raw) {
    throw new Error(`Invalid integer for ${prefix}: ${raw}`);
  }
  if (value < min || value > max) {
    throw new Error(`Value out of range for ${prefix}: ${value}`);
  }
  return value;
}

function parseNumberOption(arg, prefix, min, max) {
  const raw = arg.slice(prefix.length).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for ${prefix}: ${raw}`);
  }
  if (value < min || value > max) {
    throw new Error(`Value out of range for ${prefix}: ${value}`);
  }
  return value;
}

async function applySolidMaterialPalette(document, options) {
  const root = document.getRoot();
  const materialsBefore = root.listMaterials().length;
  const paletteTexturesBefore = countPaletteTextures(root.listTextures());

  if (!options.enablePalette) {
    return {
      enabled: false,
      materialsBefore,
      materialsAfter: materialsBefore,
      createdTextures: 0,
    };
  }

  await document.transform(
    palette({
      min: options.paletteMin,
      keepAttributes: false,
      cleanup: true,
    })
  );

  const materialsAfter = root.listMaterials().length;
  const paletteTexturesAfter = countPaletteTextures(root.listTextures());

  return {
    enabled: true,
    materialsBefore,
    materialsAfter,
    createdTextures: Math.max(0, paletteTexturesAfter - paletteTexturesBefore),
  };
}

function countPaletteTextures(textures) {
  return textures.filter((texture) =>
    (texture.getName() || "").startsWith("Palette")
  ).length;
}

function createMergeStats() {
  return {
    boundaryCount: 0,
    sourceNodeCount: 0,
    primitiveCount: 0,
    groupCount: 0,
    mergedGroups: [],
  };
}

function mergeByNaming(document) {
  const root = document.getRoot();
  const materialRefs = new Map();
  const stats = createMergeStats();

  root.listMaterials().forEach((material, index) => materialRefs.set(material, index));

  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) {
      if (!isBoundaryNode(child)) {
        continue;
      }

      const mergeUnits = collectMergeUnits(child);
      if (mergeUnits.length === 0) {
        continue;
      }

      const result = mergeUnitsIntoBoundary(
        document,
        child,
        mergeUnits,
        materialRefs,
        "merged"
      );
      if (!result) {
        continue;
      }

      stats.boundaryCount += 1;
      stats.sourceNodeCount += result.sourceNodeCount;
      stats.primitiveCount += result.primitiveCount;
      stats.groupCount += result.groups.length;
      stats.mergedGroups.push(...result.groups);
    }
  }

  return stats;
}

function isBoundaryNode(node) {
  if (!node || node.listChildren().length === 0) {
    return false;
  }

  const flags = parseFlags(node.getName()).flags;
  if (flags.has("MERGE") || flags.has("INST") || flags.has("DECAL") || flags.has("LOD")) {
    return false;
  }

  return true;
}

function collectMergeUnits(boundaryNode) {
  const units = [];

  const visit = (node) => {
    if (node !== boundaryNode) {
      const parsed = parseFlags(node.getName());
      const flags = parsed.flags;

      if (flags.has("KEEP") || flags.has("INST") || flags.has("LOD")) {
        return;
      }

      if (flags.has("MERGE")) {
        const unit = collectMeshesForMergeUnit(node);
        if (unit.meshEntries.length > 0) {
          units.push(unit);
        }
        return;
      }

      if (flags.has("DECAL")) {
        return;
      }
    }

    for (const child of node.listChildren()) {
      visit(child);
    }
  };

  visit(boundaryNode);
  return units;
}

function collectMeshesForMergeUnit(rootNode) {
  const meshEntries = [];

  const visit = (node, inheritedFlags) => {
    const currentFlags = unionFlags(inheritedFlags, parseFlags(node.getName()).flags);

    if (node !== rootNode && (currentFlags.has("KEEP") || currentFlags.has("INST") || currentFlags.has("LOD"))) {
      return;
    }

    if (node.getMesh()) {
      meshEntries.push({
        node,
        flags: currentFlags,
      });
    }

    for (const child of node.listChildren()) {
      visit(child, currentFlags);
    }
  };

  visit(rootNode, new Set());

  return {
    rootNode,
    flags: parseFlags(rootNode.getName()).flags,
    meshEntries,
  };
}

function mergeUnitsIntoBoundary(
  document,
  boundaryNode,
  mergeUnits,
  materialRefs,
  nameTag = "merged"
) {
  const bucketMap = new Map();
  const contributedNodes = new Set();
  const targetWorldMatrix = boundaryNode.getWorldMatrix();
  const targetWorldInverse = mat4.invert(mat4.create(), targetWorldMatrix);

  for (const unit of mergeUnits) {
    for (const meshEntry of unit.meshEntries) {
      const meshNode = meshEntry.node;
      const mesh = meshNode.getMesh();
      if (!mesh) {
        continue;
      }

      const policy = classifyMergePolicy(meshEntry.flags);
      const relativeMatrix = mat4.multiply(
        mat4.create(),
        targetWorldInverse,
        meshNode.getWorldMatrix()
      );

      let contributed = false;

      for (const sourcePrimitive of mesh.listPrimitives()) {
        if (sourcePrimitive.listTargets().length > 0) {
          continue;
        }

        const primitive = clonePrimitive(sourcePrimitive);
        compactPrimitive(primitive);
        dequantizePrimitive(primitive);
        transformPrimitive(primitive, relativeMatrix);

        const joinKey = createJoinGroupKey(primitive, materialRefs);
        const bucketKey = `${policy}||${joinKey}`;
        if (!bucketMap.has(bucketKey)) {
          bucketMap.set(bucketKey, {
            policy,
            primitives: [],
            sourceFlags: new Set(),
            sourceNames: new Set(),
          });
        }

        const bucket = bucketMap.get(bucketKey);
        bucket.primitives.push(primitive);
        mergeFlagsInto(bucket.sourceFlags, meshEntry.flags);
        bucket.sourceNames.add(meshNode.getName() || unit.rootNode.getName() || "unnamed");
        contributed = true;
      }

      if (contributed) {
        contributedNodes.add(meshNode);
      }
    }
  }

  if (bucketMap.size === 0) {
    return null;
  }

  const policyGroups = new Map();

  for (const bucket of bucketMap.values()) {
    if (!policyGroups.has(bucket.policy)) {
      policyGroups.set(bucket.policy, []);
    }
    policyGroups.get(bucket.policy).push(bucket);
  }

  const groups = [];
  let primitiveCount = 0;

  for (const [policy, buckets] of policyGroups) {
    const carrierNode = document.createNode(
      `${safeNodeName(boundaryNode.getName())}_${nameTag}_${policy}`
    );
    const mergedMesh = document.createMesh(
      `${safeNodeName(boundaryNode.getName())}_${nameTag}_${policy}_mesh`
    );

    for (const bucket of buckets) {
      const mergedPrimitive =
        bucket.primitives.length === 1
          ? bucket.primitives[0]
          : joinPrimitives(bucket.primitives, { skipValidation: false });

      mergedMesh.addPrimitive(mergedPrimitive);
      primitiveCount += 1;
    }

    carrierNode.setMesh(mergedMesh);
    boundaryNode.addChild(carrierNode);

    const sourceFlags = buckets.reduce((flags, bucket) => {
      mergeFlagsInto(flags, bucket.sourceFlags);
      return flags;
    }, new Set());

    groups.push({
      boundaryNode,
      carrierNode,
      policy,
      sourceFlags,
    });
  }

  for (const meshNode of contributedNodes) {
    meshNode.setMesh(null);
  }

  return {
    sourceNodeCount: contributedNodes.size,
    primitiveCount,
    groups,
  };
}

function classifyMergePolicy(flags) {
  return flags.has("DECAL") ? "protected" : "safe";
}

function collectKeepGeometryTargets(document) {
  const targets = [];

  for (const scene of document.getRoot().listScenes()) {
    for (const child of scene.listChildren()) {
      visitKeepGeometryTargets(child, new Set(), targets);
    }
  }

  return targets;
}

function visitKeepGeometryTargets(node, inheritedFlags, targets) {
  const flags = unionFlags(inheritedFlags, parseFlags(node.getName()).flags);

  if (node.getMesh() && flags.has("KEEP") && !flags.has("INST") && !flags.has("LOD")) {
    targets.push({
      kind: "keep",
      carrierNode: node,
      policy: classifyMergePolicy(flags),
      sourceFlags: flags,
      allowSimplify: true,
    });
  }

  for (const child of node.listChildren()) {
    visitKeepGeometryTargets(child, flags, targets);
  }
}

async function optimizeGeometryTargets(document, geometryTargets, options) {
  const stats = {
    candidateGroupCount: 0,
    protectedGroupCount: 0,
    simplifiedPrimitiveCount: 0,
    weldedPrimitiveCount: 0,
    weldedVertexDelta: 0,
    quantizedGroupCount: 0,
    trianglesBefore: 0,
    trianglesAfter: 0,
    simplifiedCarriers: [],
    quantizedCarriers: [],
    protectedCarriers: [],
  };

  for (const group of geometryTargets) {
    const carrierNode = ensureGeometryCarrierNode(document, group);
    const mesh = carrierNode.getMesh();
    if (!mesh) {
      continue;
    }

    const beforeTriangles = getMeshTriangleCount(mesh);
    for (const primitive of mesh.listPrimitives()) {
      const beforeVertices = getPrimitiveVertexCountForUpload(primitive);
      if (beforeVertices > 0 && primitive.listTargets().length === 0) {
        weldPrimitive(primitive, { overwrite: true });
        const afterVertices = getPrimitiveVertexCountForUpload(primitive);
        if (afterVertices > 0 && afterVertices < beforeVertices) {
          stats.weldedPrimitiveCount += 1;
          stats.weldedVertexDelta += beforeVertices - afterVertices;
        }
      }
    }

    if (group.policy !== "safe") {
      stats.protectedGroupCount += 1;
      stats.trianglesBefore += beforeTriangles;
      stats.trianglesAfter += beforeTriangles;
      stats.protectedCarriers.push(carrierNode.getName() || "unnamed");
      continue;
    }

    stats.candidateGroupCount += 1;
    stats.trianglesBefore += beforeTriangles;
    let simplifiedInCarrier = 0;
    const allowSimplify = group.allowSimplify !== false;

    if (allowSimplify) {
      for (const primitive of mesh.listPrimitives()) {
        if (!isPrimitiveEligibleForSimplify(primitive)) {
          continue;
        }

        const triangleCount = getPrimitiveTriangleCount(primitive);
        if (triangleCount < options.simplifyMinTriangles) {
          continue;
        }

        const extents = getPrimitiveExtents(primitive);
        if (isRiskyThinPrimitive(extents)) {
          continue;
        }

        const settings = pickSimplifySettings(triangleCount, options.simplifyScale);
        if (settings.ratio >= 0.999 && settings.error <= EPSILON) {
          continue;
        }
        simplifyPrimitive(primitive, {
          simplifier: MeshoptSimplifier,
          ratio: settings.ratio,
          error: settings.error,
          lockBorder: settings.lockBorder,
        });
        stats.simplifiedPrimitiveCount += 1;
        simplifiedInCarrier += 1;
      }
    }

    const afterSimplifyTriangles = getMeshTriangleCount(mesh);
    if (simplifiedInCarrier > 0) {
      stats.simplifiedCarriers.push(
        `${carrierNode.getName() || "unnamed"} (${beforeTriangles} -> ${afterSimplifyTriangles})`
      );
    }
    if (afterSimplifyTriangles >= options.quantizeMinTriangles) {
      const quantized = quantizeMeshOnCarrierNode(carrierNode);
      if (quantized) {
        stats.quantizedGroupCount += 1;
        stats.quantizedCarriers.push(carrierNode.getName() || "unnamed");
      }
    }

    stats.trianglesAfter += getMeshTriangleCount(mesh);
  }

  if (stats.quantizedGroupCount > 0) {
    document.createExtension(KHRMeshQuantization).setRequired(true);
  }

  return stats;
}

function ensureGeometryCarrierNode(document, group) {
  if (group.kind !== "keep") {
    return group.carrierNode;
  }

  const sourceNode = group.carrierNode;
  if (!sourceNode.getMesh()) {
    return sourceNode;
  }

  if (sourceNode.listChildren().length === 0) {
    return sourceNode;
  }

  const isolatedNode = document.createNode(
    `${safeNodeName(sourceNode.getName())}_keep_mesh`
  );

  isolatedNode.setMesh(sourceNode.getMesh());
  sourceNode.setMesh(null);
  sourceNode.addChild(isolatedNode);
  group.carrierNode = isolatedNode;

  return isolatedNode;
}

function prepareUntaggedGeometry(document, options, skipNodes = new Set()) {
  const emptyStats = createMergeStats();

  if (options.geometryMode !== "local" || options.untaggedMode === "none") {
    return {
      targets: [],
      mergeStats: emptyStats,
    };
  }

  if (options.untaggedMode === "merge-local") {
    const mergeStats = mergeUntaggedByHierarchy(document, skipNodes);
    const mergedCarrierNodes = new Set(skipNodes);
    for (const group of mergeStats.mergedGroups) {
      mergedCarrierNodes.add(group.carrierNode);
      group.allowSimplify = true;
    }

    return {
      targets: [
        ...mergeStats.mergedGroups,
        ...collectUntaggedGeometryTargets(document, true, mergedCarrierNodes),
      ],
      mergeStats,
    };
  }

  return {
    targets: collectUntaggedGeometryTargets(
      document,
      options.untaggedMode === "local",
      skipNodes
    ),
    mergeStats: emptyStats,
  };
}

function collectUntaggedGeometryTargets(document, allowSimplify, skipNodes = new Set()) {
  const targets = [];

  for (const scene of document.getRoot().listScenes()) {
    for (const child of scene.listChildren()) {
      visitUntaggedGeometryTargets(child, new Set(), targets, allowSimplify, skipNodes);
    }
  }

  return targets;
}

function visitUntaggedGeometryTargets(
  node,
  inheritedFlags,
  targets,
  allowSimplify,
  skipNodes
) {
  if (skipNodes.has(node)) {
    return;
  }

  const flags = unionFlags(inheritedFlags, parseFlags(node.getName()).flags);
  if (flags.size > 0) {
    return;
  }

  if (node.getMesh()) {
    targets.push({
      kind: "untagged",
      carrierNode: node,
      policy: "safe",
      sourceFlags: flags,
      allowSimplify,
    });
  }

  for (const child of node.listChildren()) {
    visitUntaggedGeometryTargets(child, flags, targets, allowSimplify, skipNodes);
  }
}

function mergeUntaggedByHierarchy(document, skipNodes = new Set()) {
  const root = document.getRoot();
  const materialRefs = new Map();
  const stats = createMergeStats();

  root.listMaterials().forEach((material, index) => materialRefs.set(material, index));

  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) {
      if (!isBoundaryNode(child) || skipNodes.has(child)) {
        continue;
      }

      const mergeUnit = collectUntaggedMergeUnit(child, skipNodes);
      if (mergeUnit.meshEntries.length === 0) {
        continue;
      }

      const result = mergeUnitsIntoBoundary(
        document,
        child,
        [mergeUnit],
        materialRefs,
        "untagged"
      );
      if (!result) {
        continue;
      }

      stats.boundaryCount += 1;
      stats.sourceNodeCount += result.sourceNodeCount;
      stats.primitiveCount += result.primitiveCount;
      stats.groupCount += result.groups.length;
      stats.mergedGroups.push(...result.groups);
    }
  }

  return stats;
}

function collectUntaggedMergeUnit(boundaryNode, skipNodes = new Set()) {
  const meshEntries = [];

  const visit = (node, inheritedFlags) => {
    if (skipNodes.has(node)) {
      return;
    }

    const currentFlags = unionFlags(inheritedFlags, parseFlags(node.getName()).flags);
    if (currentFlags.size > 0) {
      return;
    }

    if (node.getMesh()) {
      meshEntries.push({
        node,
        flags: currentFlags,
      });
    }

    for (const child of node.listChildren()) {
      visit(child, currentFlags);
    }
  };

  visit(boundaryNode, new Set());

  return {
    rootNode: boundaryNode,
    flags: new Set(),
    meshEntries,
  };
}

function isPrimitiveEligibleForSimplify(primitive) {
  const mode = primitive.getMode();
  if (
    mode !== Primitive.Mode.TRIANGLES &&
    mode !== Primitive.Mode.TRIANGLE_STRIP &&
    mode !== Primitive.Mode.TRIANGLE_FAN
  ) {
    return false;
  }

  if (primitive.listTargets().length > 0) {
    return false;
  }

  if (!primitive.getAttribute("POSITION")) {
    return false;
  }

  const material = primitive.getMaterial();
  if (material && material.getAlphaMode && material.getAlphaMode() !== "OPAQUE") {
    return false;
  }

  return true;
}

function pickSimplifySettings(triangleCount, scale = DEFAULT_SIMPLIFY_SCALE) {
  let settings;

  if (triangleCount >= 250000) {
    settings = { ratio: 0.42, error: 0.005, lockBorder: false };
  } else if (triangleCount >= 100000) {
    settings = { ratio: 0.48, error: 0.004, lockBorder: false };
  } else if (triangleCount >= 20000) {
    settings = { ratio: 0.54, error: 0.0025, lockBorder: false };
  } else if (triangleCount >= 5000) {
    settings = { ratio: 0.66, error: 0.0015, lockBorder: false };
  } else {
    settings = { ratio: 0.8, error: 0.0009, lockBorder: false };
  }

  if (scale <= EPSILON) {
    return {
      ratio: 1,
      error: 0,
      lockBorder: settings.lockBorder,
    };
  }

  const normalizedScale = clampNumber(scale, 0, 4);
  const ratio = clampNumber(
    1 - (1 - settings.ratio) * normalizedScale,
    0.08,
    0.995
  );
  const error = settings.error * Math.max(normalizedScale, 0.25);

  return {
    ratio,
    error,
    lockBorder: settings.lockBorder,
  };
}

function getMeshTriangleCount(mesh) {
  let count = 0;
  for (const primitive of mesh.listPrimitives()) {
    count += getPrimitiveTriangleCount(primitive);
  }
  return count;
}

function getPrimitiveTriangleCount(primitive) {
  const mode = primitive.getMode();
  const indices = primitive.getIndices();
  const renderCount = indices ? indices.getCount() : primitive.getAttribute("POSITION")?.getCount() ?? 0;

  if (mode === Primitive.Mode.TRIANGLES) {
    return Math.floor(renderCount / 3);
  }

  if (mode === Primitive.Mode.TRIANGLE_STRIP || mode === Primitive.Mode.TRIANGLE_FAN) {
    return Math.max(0, renderCount - 2);
  }

  return 0;
}

function getPrimitiveVertexCountForUpload(primitive) {
  return primitive.getAttribute("POSITION")?.getCount() ?? 0;
}

function getPrimitiveExtents(primitive) {
  const position = primitive.getAttribute("POSITION");
  if (!position) {
    return [0, 0, 0];
  }

  const min = position.getMin([]);
  const max = position.getMax([]);

  return [
    Math.abs((max[0] ?? 0) - (min[0] ?? 0)),
    Math.abs((max[1] ?? 0) - (min[1] ?? 0)),
    Math.abs((max[2] ?? 0) - (min[2] ?? 0)),
  ];
}

function isRiskyThinPrimitive(extents) {
  const sorted = extents.slice().sort((a, b) => a - b);
  const minAxis = sorted[0];
  const midAxis = sorted[1];
  const maxAxis = sorted[2];

  if (maxAxis <= EPSILON) {
    return true;
  }

  if (minAxis <= EPSILON) {
    return true;
  }

  const slenderness = maxAxis / Math.max(minAxis, EPSILON);
  const flatness = minAxis / Math.max(midAxis, EPSILON);

  return slenderness >= MAX_SAFE_SLENDERNESS && flatness <= MAX_SAFE_FLATNESS;
}

function quantizeMeshOnCarrierNode(node) {
  const mesh = node.getMesh();
  if (!mesh) {
    return false;
  }

  const volume = getMeshQuantizationVolume(mesh);
  if (!volume) {
    return false;
  }

  const transform = createNodeTransform(volume);
  if (!transform) {
    return false;
  }

  const inverse = mat4.invert(mat4.create(), transform.matrix);
  if (!inverse) {
    return false;
  }

  for (const primitive of mesh.listPrimitives()) {
    quantizePrimitiveAttributes(primitive, inverse);
  }

  const nodeMatrix = node.getMatrix();
  const updatedMatrix = mat4.multiply(mat4.create(), nodeMatrix, transform.matrix);
  node.setMatrix(updatedMatrix);

  return true;
}

function getMeshQuantizationVolume(mesh) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let found = false;

  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute("POSITION");
    if (!position) {
      continue;
    }

    const primitiveMin = position.getMin([]);
    const primitiveMax = position.getMax([]);
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], primitiveMin[i] ?? 0);
      max[i] = Math.max(max[i], primitiveMax[i] ?? 0);
    }
    found = true;
  }

  if (!found) {
    return null;
  }

  return { min, max };
}

function createNodeTransform(volume) {
  const offset = [
    volume.min[0] + (volume.max[0] - volume.min[0]) * 0.5,
    volume.min[1] + (volume.max[1] - volume.min[1]) * 0.5,
    volume.min[2] + (volume.max[2] - volume.min[2]) * 0.5,
  ];

  const scale = Math.max(
    (volume.max[0] - volume.min[0]) * 0.5,
    (volume.max[1] - volume.min[1]) * 0.5,
    (volume.max[2] - volume.min[2]) * 0.5
  );

  if (!Number.isFinite(scale) || scale <= EPSILON) {
    return null;
  }

  const matrix = mat4.fromValues(
    scale,
    0,
    0,
    0,
    0,
    scale,
    0,
    0,
    0,
    0,
    scale,
    0,
    offset[0],
    offset[1],
    offset[2],
    1
  );

  return { matrix };
}

function quantizePrimitiveAttributes(primitive, inverseMatrix) {
  const semantics = primitive.listSemantics();

  for (const semantic of semantics) {
    const accessor = primitive.getAttribute(semantic);
    if (!accessor) {
      continue;
    }

    if (semantic === "POSITION") {
      const dstAccessor = accessor.clone();
      remapPositionAccessor(dstAccessor, inverseMatrix);
      quantizeNormalizedAccessor(dstAccessor, Int16Array, 14, [-1, 1]);
      primitive.setAttribute(semantic, dstAccessor);
      continue;
    }

    if (semantic === "NORMAL" || semantic === "TANGENT") {
      if (accessor.getComponentSize() <= 1 && accessor.getNormalized()) {
        continue;
      }

      const dstAccessor = accessor.clone();
      quantizeNormalizedAccessor(dstAccessor, Int8Array, 8, [-1, 1]);
      primitive.setAttribute(semantic, dstAccessor);
      continue;
    }

    if (semantic.startsWith("TEXCOORD_")) {
      const range = getAccessorRange(accessor);
      if (range.min.some((value) => value < 0) || range.max.some((value) => value > 1)) {
        continue;
      }

      if (accessor.getComponentSize() <= 2 && accessor.getNormalized()) {
        continue;
      }

      const dstAccessor = accessor.clone();
      quantizeNormalizedAccessor(dstAccessor, Uint16Array, 12, [0, 1]);
      primitive.setAttribute(semantic, dstAccessor);
      continue;
    }

    if (semantic.startsWith("COLOR_")) {
      if (accessor.getComponentSize() <= 1 && accessor.getNormalized()) {
        continue;
      }

      const dstAccessor = accessor.clone();
      quantizeNormalizedAccessor(dstAccessor, Uint8Array, 8, [0, 1]);
      primitive.setAttribute(semantic, dstAccessor);
    }
  }

  const indices = primitive.getIndices();
  const position = primitive.getAttribute("POSITION");
  if (indices && position && position.getCount() < 65535) {
    indices.setArray(new Uint16Array(indices.getArray()));
  }
}

function remapPositionAccessor(accessor, inverseMatrix) {
  const element = [0, 0, 0];

  for (let i = 0; i < accessor.getCount(); i += 1) {
    accessor.getElement(i, element);
    const x = element[0];
    const y = element[1];
    const z = element[2];
    const w = 1;

    const nx =
      inverseMatrix[0] * x +
      inverseMatrix[4] * y +
      inverseMatrix[8] * z +
      inverseMatrix[12] * w;
    const ny =
      inverseMatrix[1] * x +
      inverseMatrix[5] * y +
      inverseMatrix[9] * z +
      inverseMatrix[13] * w;
    const nz =
      inverseMatrix[2] * x +
      inverseMatrix[6] * y +
      inverseMatrix[10] * z +
      inverseMatrix[14] * w;

    accessor.setElement(i, [nx, ny, nz]);
  }
}

function quantizeNormalizedAccessor(accessor, ctor, bits, range) {
  const srcCount = accessor.getCount();
  const element = [];
  const dstArray = new ctor(accessor.getArray().length);
  const signed = ctor === Int8Array || ctor === Int16Array;
  const signBits = signed ? 1 : 0;
  const quantBits = bits - signBits;
  const storageBits = ctor.BYTES_PER_ELEMENT * 8 - signBits;
  const scale = Math.pow(2, quantBits) - 1;
  const lo = storageBits - quantBits;
  const hi = 2 * quantBits - storageBits;

  let index = 0;
  for (let i = 0; i < srcCount; i += 1) {
    accessor.getElement(i, element);
    for (let j = 0; j < element.length; j += 1) {
      let value = clamp(element[j], range);
      value = Math.round(Math.abs(value) * scale);
      value = (value << lo) | (value >> Math.max(0, hi));
      dstArray[index] = value * Math.sign(element[j]);
      index += 1;
    }
  }

  accessor.setArray(dstArray).setNormalized(true).setSparse(false);
}

function getAccessorRange(accessor) {
  return {
    min: accessor.getMinNormalized([]),
    max: accessor.getMaxNormalized([]),
  };
}

async function compressTexturesToKTX2(document, options) {
  const root = document.getRoot();
  const textureUsage = buildTextureUsageMap(root.listMaterials());
  const ktxBinary = await resolveKtxBinary(options.ktxPath);
  const ktxVersion = await readKtxVersion(ktxBinary);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gltf-optimize-ktx-"));
  const basisuExtension = document.createExtension(KHRTextureBasisu).setRequired(true);

  const stats = {
    format: "ktx2",
    converted: 0,
    skipped: 0,
    etc1sCount: 0,
    uastcCount: 0,
    ktxBinary,
  };

  try {
    const textures = root.listTextures();

    for (let index = 0; index < textures.length; index += 1) {
      const texture = textures[index];
      const usages = textureUsage.get(texture) || [];

      if (usages.length === 0 || !texture.getImage()) {
        stats.skipped += 1;
        continue;
      }

      if (texture.getMimeType() === "image/ktx2") {
        stats.skipped += 1;
        continue;
      }

      const prepared = await prepareTextureForKTX(texture, usages, options);
      const inputPath = path.join(tmpDir, `texture_${index}.png`);
      const outputPath = path.join(tmpDir, `texture_${index}.ktx2`);

      await fs.writeFile(inputPath, prepared.image);
      const params = createKtxCreateParams(prepared, ktxVersion, options);
      await runCommand(ktxBinary, ["create", ...params, inputPath, outputPath]);

      const payload = await fs.readFile(outputPath);
      texture.setImage(payload);
      texture.setMimeType("image/ktx2");

      if (texture.getURI()) {
        texture.setURI(replaceExtension(texture.getURI(), ".ktx2"));
      }

      stats.converted += 1;
      if (prepared.mode === "etc1s") {
        stats.etc1sCount += 1;
      } else {
        stats.uastcCount += 1;
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  if (stats.converted === 0) {
    basisuExtension.dispose();
  }

  return stats;
}

async function prepareTextureForKTX(texture, usages, options) {
  const profile = getQualityProfile(options.qualityProfile, options);
  const source = texture.getImage();
  const sharpImage = sharp(source, { limitInputPixels: true });
  const [metadata, imageStats] = await Promise.all([sharpImage.metadata(), sharpImage.stats()]);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const channels = metadata.channels ?? 4;
  const hasAlpha = Boolean(metadata.hasAlpha) || channels === 4;
  const opaqueAlpha =
    hasAlpha &&
    imageStats.channels.length >= 4 &&
    imageStats.channels[3].min === 255 &&
    imageStats.channels[3].max === 255;
  const effectiveHasAlpha = hasAlpha && !opaqueAlpha;
  const slots = new Set(usages.map((usage) => usage.slot));
  const isNormal = slots.has("normalTexture");
  const isData =
    isNormal ||
    slots.has("metallicRoughnessTexture") ||
    slots.has("occlusionTexture");
  const maxTextureSize = isData ? profile.maxTextureSizeData : profile.maxTextureSizeColor;
  const resize = fitWithin(width, height, maxTextureSize[0], maxTextureSize[1]);
  const targetWidth = ceilMultipleOfFour(Math.max(4, resize[0]));
  const targetHeight = ceilMultipleOfFour(Math.max(4, resize[1]));
  const colorSpace = isData ? "linear" : "srgb";
  const mode = isNormal ? "uastc" : "etc1s";
  const format = pickKtxFormat({
    channels,
    hasAlpha: effectiveHasAlpha,
    colorSpace,
  });

  let pipeline = sharp(source, { limitInputPixels: true }).resize(targetWidth, targetHeight, {
    fit: "fill",
    kernel: "lanczos3",
  });

  if (!effectiveHasAlpha) {
    pipeline = pipeline.removeAlpha();
  }

  const image = await pipeline.png().toBuffer();

  return {
    image,
    mode,
    format,
    colorSpace,
    isNormal,
    isData,
  };
}

function buildTextureUsageMap(materials) {
  const usageMap = new Map();

  for (const material of materials) {
    const materialName = material.getName() || "";
    const alphaMode = material.getAlphaMode ? material.getAlphaMode() : "OPAQUE";
    const slots = [
      ["baseColorTexture", material.getBaseColorTexture()],
      ["normalTexture", material.getNormalTexture()],
      ["metallicRoughnessTexture", material.getMetallicRoughnessTexture()],
      ["occlusionTexture", material.getOcclusionTexture()],
      ["emissiveTexture", material.getEmissiveTexture()],
    ];

    for (const [slot, texture] of slots) {
      if (!texture) {
        continue;
      }

      if (!usageMap.has(texture)) {
        usageMap.set(texture, []);
      }

      usageMap.get(texture).push({ materialName, slot, alphaMode });
    }
  }

  return usageMap;
}

function createKtxCreateParams(prepared, version, options) {
  const profile = getQualityProfile(options.qualityProfile, options);
  const params = [
    "--format",
    prepared.format,
    "--generate-mipmap",
    "--mipmap-filter",
    MIPMAP_FILTER,
    "--mipmap-filter-scale",
    String(MIPMAP_FILTER_SCALE),
    "--assign-tf",
    prepared.colorSpace === "srgb" ? "srgb" : "linear",
    "--assign-primaries",
    prepared.colorSpace === "srgb" ? "bt709" : "none",
    "--no-warn-on-color-conversions",
    "--encode",
    prepared.mode === "uastc" ? "uastc" : "basis-lz",
  ];

  if (prepared.mode === "uastc") {
    params.push("--uastc-quality", String(profile.uastcQuality), "--uastc-rdo", "--zstd", "18");
    if (prepared.isNormal) {
      params.push("--uastc-rdo-l", String(profile.uastcRdoNormal));
    } else if (prepared.isData) {
      params.push("--uastc-rdo-l", String(profile.uastcRdoData));
    } else {
      params.push("--uastc-rdo-l", String(profile.uastcRdoOther));
    }
  } else {
    params.push("--qlevel", String(profile.etc1sQLevel), "--clevel", String(profile.etc1sCLevel));
  }

  if (prepared.isNormal) {
    params.push("--normal-mode");
  }

  if (supportsThreads(version)) {
    params.push("--threads", String(pickThreadCount()));
  }

  return params;
}

function getQualityProfile(name, options = {}) {
  const profile = QUALITY_PROFILES[name] || QUALITY_PROFILES[DEFAULT_QUALITY_PROFILE];
  const colorMax = options.colorMaxSize ?? profile.maxTextureSizeColor[0];
  const dataMax = options.dataMaxSize ?? profile.maxTextureSizeData[0];

  return {
    ...profile,
    maxTextureSizeColor: [colorMax, colorMax],
    maxTextureSizeData: [dataMax, dataMax],
  };
}

function pickKtxFormat({ channels, hasAlpha, colorSpace }) {
  const suffix = colorSpace === "srgb" ? "SRGB" : "UNORM";

  if (channels <= 1 && !hasAlpha) {
    return `R8_${suffix}`;
  }

  if (channels === 2 && !hasAlpha) {
    return `R8G8_${suffix}`;
  }

  if (channels === 3 && !hasAlpha) {
    return `R8G8B8_${suffix}`;
  }

  return `R8G8B8A8_${suffix}`;
}

async function compressTexturesToWebP(document, options) {
  const root = document.getRoot();
  const textureUsage = buildTextureUsageMap(root.listMaterials());
  const profile = getQualityProfile(options.qualityProfile, options);
  const stats = {
    format: "webp",
    converted: 0,
    skipped: 0,
    etc1sCount: 0,
    uastcCount: 0,
    ktxBinary: null,
  };

  for (const texture of root.listTextures()) {
    const usages = textureUsage.get(texture) || [];
    if (usages.length === 0 || !texture.getImage()) {
      stats.skipped += 1;
      continue;
    }

    const slots = new Set(usages.map((usage) => usage.slot));
    const isData =
      slots.has("normalTexture") ||
      slots.has("metallicRoughnessTexture") ||
      slots.has("occlusionTexture");
    const maxTextureSize = isData ? profile.maxTextureSizeData : profile.maxTextureSizeColor;
    const metadata = await sharp(texture.getImage(), { limitInputPixels: true }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const resize = fitWithin(
      width,
      height,
      maxTextureSize[0],
      maxTextureSize[1]
    );

    const buffer = await sharp(texture.getImage(), { limitInputPixels: true })
      .resize(resize[0], resize[1], {
        fit: "inside",
        kernel: "lanczos3",
      })
      .webp({
        quality: pickWebPQuality(usages, options),
        effort: options.webpEffort,
      })
      .toBuffer();

    texture.setImage(buffer);
    texture.setMimeType("image/webp");
    if (texture.getURI()) {
      texture.setURI(replaceExtension(texture.getURI(), ".webp"));
    }
    stats.converted += 1;
  }

  return stats;
}

function pickWebPQuality(usages, options) {
  const slots = new Set(usages.map((usage) => usage.slot));

  if (slots.has("baseColorTexture")) {
    return resolveWebPQuality("base", options);
  }

  if (slots.has("emissiveTexture")) {
    return resolveWebPQuality("emissive", options);
  }

  return resolveWebPQuality("other", options);
}

function resolveWebPQuality(kind, options) {
  if (kind === "base") {
    return options.webpQualityBase ?? DEFAULT_WEBP_QUALITY_BASE;
  }

  if (kind === "emissive") {
    return options.webpQualityEmissive ?? DEFAULT_WEBP_QUALITY_EMISSIVE;
  }

  return options.webpQualityOther ?? DEFAULT_WEBP_QUALITY_OTHER;
}

async function resolveKtxBinary(explicitPath) {
  const candidates = [];

  if (explicitPath) {
    candidates.push(explicitPath);
  }

  if (process.env.KTX_CLI_PATH) {
    candidates.push(process.env.KTX_CLI_PATH);
  }

  candidates.push(
    DEFAULT_KTX_HINT,
    "E:\\Software\\KTX-Software\\ktx.exe",
    "ktx"
  );

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      if (candidate !== "ktx") {
        await fs.access(candidate);
      }

      const version = await readKtxVersion(candidate);
      if (compareVersions(version.replace(/^v/i, ""), KTX_MIN_VERSION) < 0) {
        continue;
      }
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    [
      `Unable to find a usable KTX CLI (${KTX_MIN_VERSION}+).`,
      "Expected one of:",
      `- ${DEFAULT_KTX_HINT}`,
      "- a path passed with --ktx-path=...",
      "- a ktx binary available on PATH",
    ].join("\n")
  );
}

async function readKtxVersion(binaryPath) {
  const { stdout, stderr } = await runCommand(binaryPath, ["--version"]);
  const text = `${stdout}${stderr}`.trim();
  const match = text.match(/v?(\d+\.\d+\.\d+)/i);

  if (!match) {
    throw new Error(`Unable to read KTX version from: ${binaryPath}`);
  }

  return match[1];
}

function supportsThreads(version) {
  return compareVersions(version, "4.3.0") >= 0;
}

function pickThreadCount() {
  return Math.max(2, Math.min(os.cpus().length || 2, 8));
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          [`Command failed: ${command} ${args.join(" ")}`, stdout.trim(), stderr.trim()]
            .filter(Boolean)
            .join("\n")
        )
      );
    });
  });
}

function repairTextureMimeTypes(document) {
  let fixed = 0;

  for (const texture of document.getRoot().listTextures()) {
    const mimeType = texture.getMimeType();
    if (mimeType && mimeType !== "image/" && mimeType !== "application/octet-stream") {
      continue;
    }

    const inferred =
      inferMimeTypeFromUri(texture.getURI()) || inferMimeTypeFromBytes(texture.getImage());

    if (inferred) {
      texture.setMimeType(inferred);
      fixed += 1;
    }
  }

  return fixed;
}

function inferMimeTypeFromUri(uri = "") {
  const ext = path.extname(uri || "").toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  if (ext === ".ktx2") {
    return "image/ktx2";
  }
  return null;
}

function inferMimeTypeFromBytes(bytes) {
  if (!bytes || bytes.length < 12) {
    return null;
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    bytes[0] === 0xab &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x58 &&
    bytes[4] === 0x20 &&
    bytes[5] === 0x32 &&
    bytes[6] === 0x30 &&
    bytes[7] === 0xbb
  ) {
    return "image/ktx2";
  }

  return null;
}

function parseFlags(name = "") {
  let rest = name || "";
  const flags = new Set();

  while (true) {
    const match = /^([A-Z]+)_/.exec(rest);
    if (!match || !KNOWN_FLAGS.has(match[1])) {
      break;
    }

    flags.add(match[1]);
    rest = rest.slice(match[0].length);
  }

  return {
    flags,
    baseName: rest || name || "unnamed",
  };
}

function safeNodeName(name) {
  const parsed = parseFlags(name);
  return parsed.baseName || "merged";
}

function createJoinGroupKey(primitive, materialRefs) {
  const material = primitive.getMaterial();
  const indices = primitive.getIndices();
  const semantics = primitive.listSemantics().slice().sort();

  const attributeKey = semantics
    .map((semantic) => {
      const accessor = primitive.getAttribute(semantic);
      return [
        semantic,
        accessor.getType(),
        accessor.getComponentType(),
        accessor.getNormalized() ? "n" : "u",
      ].join(":");
    })
    .join("|");

  return [
    primitive.getMode(),
    material ? materialRefs.get(material) ?? material.getName() ?? "mat" : "nomat",
    indices ? indices.getComponentType() : "noindices",
    attributeKey,
  ].join("||");
}

function clonePrimitive(sourcePrimitive) {
  const primitive = sourcePrimitive.clone();

  for (const semantic of primitive.listSemantics()) {
    primitive.setAttribute(semantic, primitive.getAttribute(semantic).clone());
  }

  const indices = primitive.getIndices();
  if (indices) {
    primitive.setIndices(indices.clone());
  }

  return primitive;
}

function unionFlags(left, right) {
  const result = new Set(left);
  for (const flag of right) {
    result.add(flag);
  }
  return result;
}

function mergeFlagsInto(target, source) {
  for (const flag of source) {
    target.add(flag);
  }
}

function formatSummaryList(items, limit = 12) {
  if (items.length <= limit) {
    return items.join(", ");
  }

  const head = items.slice(0, limit).join(", ");
  return `${head}, ... (+${items.length - limit} more)`;
}

function replaceExtension(uri, ext) {
  const current = uri || "texture";
  const parsedExt = path.extname(current);
  if (!parsedExt) {
    return `${current}${ext}`;
  }
  return `${current.slice(0, -parsedExt.length)}${ext}`;
}

function fitWithin(width, height, maxWidth, maxHeight) {
  if (width <= 0 || height <= 0) {
    return [maxWidth, maxHeight];
  }

  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return [Math.round(width * scale), Math.round(height * scale)];
}

function ceilMultipleOfFour(value) {
  if (value <= 4) {
    return 4;
  }

  return value % 4 === 0 ? value : value + 4 - (value % 4);
}

function clamp(value, range) {
  return Math.min(Math.max(value, range[0]), range[1]);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDecimal(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map((value) => Number(value));
  const rightParts = right.split(".").map((value) => Number(value));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < maxLength; i += 1) {
    const leftValue = leftParts[i] ?? 0;
    const rightValue = rightParts[i] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

main().catch((error) => {
  console.error("");
  console.error("Smart optimize failed.");
  console.error(error);
  process.exit(1);
});
