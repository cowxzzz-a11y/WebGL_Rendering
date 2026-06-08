import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_KTX_HINT = path.join(SCRIPT_DIR, "bin", "ktx.exe");
const KTX_MIN_VERSION = "4.3.0";
const MIPMAP_FILTER = "lanczos4";

async function main() {
  const { files, options } = parseArgs(process.argv.slice(2));

  if (files.length === 0) {
    throw new Error([
      "Usage:",
      "node lightmap-to-ktx2.mjs <image...> [--out-dir=<dir>] [--ktx-path=<path>] [--mode=uastc|etc1s]",
      "[--zstd-level=<0-22>]",
    ].join(" "));
  }

  const ktxBinary = await resolveKtxBinary(options.ktxPath);
  const ktxVersion = await readKtxVersion(ktxBinary);
  const outDir = options.outDir ? path.resolve(options.outDir) : null;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lightmap-ktx2-"));
  let converted = 0;

  try {
    for (const file of files) {
      const sourcePath = path.resolve(file);
      const sourceDir = path.dirname(sourcePath);
      const targetDir = outDir ?? sourceDir;
      await fs.mkdir(targetDir, { recursive: true });

      const outputPath = path.join(
        targetDir,
        `${path.basename(sourcePath, path.extname(sourcePath))}.ktx2`
      );
      const prepared = await prepareLightmap(sourcePath);
      const tempInputPath = path.join(tmpDir, `${converted}_${path.basename(sourcePath)}.png`);
      await fs.writeFile(tempInputPath, prepared.image);

      await runCommand(ktxBinary, [
        "create",
        ...createKtxCreateParams({
          mode: options.mode,
          zstdLevel: options.zstdLevel,
          version: ktxVersion,
        }),
        tempInputPath,
        outputPath,
      ]);

      converted += 1;
      console.log(`${sourcePath} -> ${outputPath}`);
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`Converted ${converted} lightmap file(s).`);
}

function parseArgs(args) {
  const files = [];
  const options = {
    outDir: null,
    ktxPath: null,
    mode: "uastc",
    zstdLevel: 0,
  };

  for (const arg of args) {
    if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length).trim();
      continue;
    }
    if (arg.startsWith("--ktx-path=")) {
      options.ktxPath = arg.slice("--ktx-path=".length).trim();
      continue;
    }
    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length).trim().toLowerCase();
      if (!["uastc", "etc1s"].includes(value)) {
        throw new Error(`Unsupported mode: ${value}`);
      }
      options.mode = value;
      continue;
    }
    if (arg.startsWith("--zstd-level=")) {
      const value = Number.parseInt(arg.slice("--zstd-level=".length).trim(), 10);
      if (!Number.isInteger(value) || value < 0 || value > 22) {
        throw new Error(`Invalid zstd level: ${arg}`);
      }
      options.zstdLevel = value;
      continue;
    }
    files.push(arg);
  }

  return { files, options };
}

async function prepareLightmap(sourcePath) {
  const source = await fs.readFile(sourcePath);
  const metadata = await sharp(source, { limitInputPixels: false }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const targetWidth = ceilMultipleOfFour(Math.max(4, width));
  const targetHeight = ceilMultipleOfFour(Math.max(4, height));

  const image = await sharp(source, { limitInputPixels: false })
    .resize(targetWidth, targetHeight, {
      fit: "fill",
      kernel: "nearest",
    })
    .png()
    .toBuffer();

  return { image };
}

function createKtxCreateParams({ mode, zstdLevel, version }) {
  const params = [
    "--format",
    "R8G8B8A8_UNORM",
    "--generate-mipmap",
    "--mipmap-filter",
    MIPMAP_FILTER,
    "--assign-tf",
    "linear",
    "--assign-primaries",
    "none",
    "--no-warn-on-color-conversions",
    "--encode",
    mode === "uastc" ? "uastc" : "basis-lz",
  ];

  if (mode === "uastc") {
    params.push("--uastc-quality", "4");
    if (zstdLevel > 0) {
      params.push("--zstd", String(zstdLevel));
    }
  } else {
    params.push("--qlevel", "255", "--clevel", "5");
  }

  if (supportsThreads(version)) {
    params.push("--threads", String(Math.max(2, Math.min(os.cpus().length || 2, 8))));
  }

  return params;
}

async function resolveKtxBinary(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.KTX_CLI_PATH,
    DEFAULT_KTX_HINT,
    path.join(SCRIPT_DIR, "ktx", "ktx.exe"),
    path.join(SCRIPT_DIR, "KTX-Software", "bin", "ktx.exe"),
    "ktx",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (candidate !== "ktx") {
        await fs.access(candidate);
      }
      const version = await readKtxVersion(candidate);
      if (compareVersions(version, KTX_MIN_VERSION) >= 0) {
        return candidate;
      }
    } catch {
    }
  }

  throw new Error(`Unable to find a usable KTX CLI (${KTX_MIN_VERSION}+).`);
}

async function readKtxVersion(binaryPath) {
  const { stdout, stderr } = await runCommand(binaryPath, ["--version"]);
  const text = `${stdout}${stderr}`;
  const match = text.match(/v?(\d+\.\d+\.\d+)/i);
  if (!match) {
    throw new Error(`Unable to read KTX version from: ${binaryPath}`);
  }
  return match[1];
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
      reject(new Error([`Command failed: ${command} ${args.join(" ")}`, stdout, stderr].filter(Boolean).join("\n")));
    });
  });
}

function ceilMultipleOfFour(value) {
  return value % 4 === 0 ? value : value + 4 - (value % 4);
}

function supportsThreads(version) {
  return compareVersions(version, "4.3.0") >= 0;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

main().catch((error) => {
  console.error("");
  console.error("Lightmap KTX2 conversion failed.");
  console.error(error);
  process.exit(1);
});
