import fs from 'fs';
import path from 'path';

function pad4(n) {
  return (n + 3) & ~3;
}

function paddedBuffer(buffer, padByte = 0) {
  const paddedLength = pad4(buffer.length);
  if (paddedLength === buffer.length) return buffer;
  const out = Buffer.alloc(paddedLength, padByte);
  buffer.copy(out);
  return out;
}

function normalizeMms3d(input) {
  const gltf = JSON.parse(JSON.stringify(input));

  if (Array.isArray(gltf.buffers)) {
    for (const buffer of gltf.buffers) {
      if (buffer.dir && !buffer.uri) {
        buffer.uri = buffer.dir;
      }
      delete buffer.dir;
    }
  }

  if (Array.isArray(gltf.bufferViews)) {
    for (const view of gltf.bufferViews) {
      if (view.buffers !== undefined && view.buffer === undefined) view.buffer = view.buffers;
      if (view.byteLengths !== undefined && view.byteLength === undefined) view.byteLength = view.byteLengths;
      if (view.byteOffsets !== undefined && view.byteOffset === undefined) view.byteOffset = view.byteOffsets;
      if (view.byteStrides !== undefined && view.byteStride === undefined) view.byteStride = view.byteStrides;
      delete view.buffers;
      delete view.byteLengths;
      delete view.byteOffsets;
      delete view.byteStrides;
    }
  }

  if (Array.isArray(gltf.accessors)) {
    for (const accessor of gltf.accessors) {
      if (accessor.component !== undefined && accessor.componentType === undefined) {
        accessor.componentType = accessor.component;
      }
      if (accessor.bufferViews !== undefined && accessor.bufferView === undefined) {
        accessor.bufferView = accessor.bufferViews;
      }
      if (accessor.byteOffsets !== undefined && accessor.byteOffset === undefined) {
        accessor.byteOffset = accessor.byteOffsets;
      }
      delete accessor.component;
      delete accessor.bufferViews;
      delete accessor.byteOffsets;
    }
  }

  return gltf;
}

function dataUriToBuffer(uri) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
  if (!match) {
    throw new Error('Only embedded data URI buffers are supported by this converter.');
  }
  return Buffer.from(match[3], match[2] ? 'base64' : 'utf8');
}

function writeGlb(gltf, outPath) {
  if (!Array.isArray(gltf.buffers) || gltf.buffers.length !== 1) {
    throw new Error(`Expected exactly one embedded buffer, got ${gltf.buffers?.length || 0}.`);
  }

  const bin = dataUriToBuffer(gltf.buffers[0].uri);
  gltf.buffers[0] = { byteLength: bin.length };

  const jsonBuffer = paddedBuffer(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const binBuffer = paddedBuffer(bin, 0x00);
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binBuffer]));
}

function convertFile(inPath, outPath) {
  const input = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const gltf = normalizeMms3d(input);
  writeGlb(gltf, outPath);
}

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Usage: node tools/convert-mms3d-to-glb.js <input-file-or-dir> <output-dir>');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const stat = fs.statSync(inputPath);

if (stat.isDirectory()) {
  const files = fs.readdirSync(inputPath).filter((name) => name.toLowerCase().endsWith('.mms3d'));
  for (const file of files) {
    const inFile = path.join(inputPath, file);
    const outFile = path.join(outputPath, file.replace(/\.mms3d$/i, '.glb'));
    convertFile(inFile, outFile);
    console.log(`${file} -> ${path.basename(outFile)}`);
  }
} else {
  const outFile = fs.statSync(outputPath, { throwIfNoEntry: false })?.isDirectory()
    ? path.join(outputPath, path.basename(inputPath).replace(/\.mms3d$/i, '.glb'))
    : outputPath;
  convertFile(inputPath, outFile);
  console.log(`${path.basename(inputPath)} -> ${outFile}`);
}
