import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const geologyDir = path.join(projectRoot, 'assets', '\u5730\u5c42')
const dataPath = path.join(geologyDir, 'data.json')
const plyDir = path.join(geologyDir, 'StructSurface')
const manifestPath = path.join(plyDir, 'coordinate-transform.json')

const dataText = fs.readFileSync(dataPath, 'utf8')
const data = JSON.parse(dataText)
const [originX, originY, originZ = 0] = data.world_Center
const existingManifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : null
const existingByTarget = new Map(
  (existingManifest?.files ?? []).map((item) => [item.targetName.toLocaleLowerCase('en-US'), item]),
)

if (![originX, originY, originZ].every(Number.isFinite)) {
  throw new Error('data.json contains an invalid world_Center')
}

const references = []
const walk = (node) => {
  const fileKey = node?.objectData?.fileKey
  if (node?.objectType === 'StructSurface' && typeof fileKey === 'string' && /^StructSurface[\\/]/i.test(fileKey)) {
    references.push({
      text: node.text,
      objectId: node.objectId,
      dataId: node.dataId,
      fileKey,
      sourceName: fileKey.split(/[\\/]/).at(-1),
      targetName: `${node.text}.ply`,
    })
  }
  for (const child of node?.children ?? []) {
    walk(child)
  }
}
walk(data)

const invalidName = /[<>:"/\\|?*]/
const targetNames = new Set()
for (const item of references) {
  if (!item.text || invalidName.test(item.text)) {
    throw new Error(`Invalid StructSurface file name: ${item.text}`)
  }
  const key = item.targetName.toLocaleLowerCase('en-US')
  if (targetNames.has(key)) {
    throw new Error(`Duplicate StructSurface file name: ${item.targetName}`)
  }
  targetNames.add(key)
}

const findHeader = (buffer) => {
  const marker = Buffer.from('end_header')
  const markerAt = buffer.indexOf(marker)
  if (markerAt < 0) {
    throw new Error('PLY is missing end_header')
  }
  let dataAt = markerAt + marker.length
  if (buffer[dataAt] === 13) dataAt += 1
  if (buffer[dataAt] === 10) dataAt += 1
  return {
    header: buffer.subarray(0, dataAt).toString('ascii'),
    dataAt,
  }
}

const parseLayout = (header) => {
  const format = header.match(/^format\s+(\S+)\s+/m)?.[1]
  const vertexCount = Number(header.match(/^element\s+vertex\s+(\d+)\s*$/m)?.[1])
  const vertexBlock = header.match(/^element\s+vertex\s+\d+\s*$([\s\S]*?)(?=^element\s|^end_header)/m)?.[1]
  const properties = [...(vertexBlock ?? '').matchAll(/^property\s+(?!list\b)(\S+)\s+(\S+)\s*$/gm)]

  if (format !== 'ascii' || !Number.isInteger(vertexCount) || properties.length < 3) {
    throw new Error(`Unsupported StructSurface PLY layout: ${format ?? 'unknown'}`)
  }

  const coordinates = properties.slice(0, 3).map((match) => match[2])
  if (coordinates.join(',') !== 'x,y,z') {
    throw new Error(`PLY vertex coordinates must be the first x/y/z properties, got ${coordinates.join(',')}`)
  }
  return { format, vertexCount }
}

const formatNumber = (value) => {
  if (Object.is(value, -0)) return '0'
  return Number(value.toPrecision(17)).toString()
}

const addTransformComments = (header) => {
  const cleanHeader = header
    .replace(/^comment coordinate_space .*\r?\n/gm, '')
    .replace(/^comment coordinate_transform_version .*\r?\n/gm, '')
    .replace(/^comment source_gis_origin .*\r?\n/gm, '')
    .replace(/^comment axis_mapping .*\r?\n/gm, '')
    .replace(/^comment scene_alignment .*\r?\n/gm, '')
  const comments = [
    'comment coordinate_space local_scene_y_up',
    'comment coordinate_transform_version 2',
    `comment source_gis_origin ${originX} ${originY} ${originZ}`,
    'comment axis_mapping scene_x=gis_x-origin_x scene_y=gis_z-origin_z scene_z=origin_y-gis_y',
    'comment scene_alignment 0 0 0',
  ].join('\n')
  return cleanHeader.replace(/end_header(\r?\n)$/, `${comments}$1end_header$1`)
}

const updateBounds = (bounds, values) => {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], values[axis])
    bounds.max[axis] = Math.max(bounds.max[axis], values[axis])
  }
}

const transformPly = (sourcePath) => {
  const input = fs.readFileSync(sourcePath)
  const { header, dataAt } = findHeader(input)
  const layout = parseLayout(header)
  const alreadyCorrect = header.includes('scene_z=origin_y-gis_y')
  const lines = input.subarray(dataAt).toString('utf8').split(/\r?\n/)
  const sourceBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  const sceneBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }

  for (let index = 0; index < layout.vertexCount; index += 1) {
    const values = lines[index].trim().split(/\s+/)
    const source = values.slice(0, 3).map(Number)
    if (!source.every(Number.isFinite)) {
      throw new Error(`Invalid vertex ${index} in ${path.basename(sourcePath)}`)
    }
    updateBounds(sourceBounds, source)

    const scene = alreadyCorrect
      ? source
      : [
          source[0] - originX,
          source[2] - originZ,
          originY - source[1],
        ]
    updateBounds(sceneBounds, scene)
    values[0] = formatNumber(scene[0])
    values[1] = formatNumber(scene[1])
    values[2] = formatNumber(scene[2])
    lines[index] = values.join(' ')
  }

  return {
    output: Buffer.from(addTransformComments(header) + lines.join('\n'), 'utf8'),
    format: layout.format,
    vertices: layout.vertexCount,
    transformed: !alreadyCorrect,
    sourceBounds,
    sceneBounds,
  }
}

const sourceFiles = new Set(
  fs.readdirSync(plyDir)
    .filter((name) => name.toLowerCase().endsWith('.ply'))
    .map((name) => name.toLocaleLowerCase('en-US')),
)
for (const item of references) {
  if (!sourceFiles.has(item.sourceName.toLocaleLowerCase('en-US'))) {
    throw new Error(`Missing StructSurface source file: ${item.sourceName}`)
  }
}

const prepared = references.map((item) => {
  const sourcePath = path.join(plyDir, item.sourceName)
  const existing = existingByTarget.get(item.targetName.toLocaleLowerCase('en-US'))
  return {
    ...item,
    sourcePath,
    targetPath: path.join(plyDir, item.targetName),
    originalSourceName: existing?.sourceName ?? item.sourceName,
    originalSourceBounds: existing?.sourceBounds ?? null,
    previouslyTransformed: Boolean(existing?.transformed),
    ...transformPly(sourcePath),
  }
})

for (const item of prepared) {
  if (item.sourcePath !== item.targetPath && fs.existsSync(item.targetPath)) {
    throw new Error(`StructSurface target already exists: ${item.targetName}`)
  }
}

for (const item of prepared) {
  const temporaryPath = `${item.targetPath}.tmp`
  fs.writeFileSync(temporaryPath, item.output)
  fs.renameSync(temporaryPath, item.targetPath)
}

let updatedDataText = dataText
for (const item of prepared) {
  const oldValue = JSON.stringify(item.fileKey).slice(1, -1)
  const newValue = JSON.stringify(`StructSurface\\${item.targetName}`).slice(1, -1)
  if (!updatedDataText.includes(oldValue)) {
    throw new Error(`data.json fileKey not found: ${item.fileKey}`)
  }
  updatedDataText = updatedDataText.replaceAll(oldValue, newValue)
}
const dataTemporaryPath = `${dataPath}.tmp`
fs.writeFileSync(dataTemporaryPath, updatedDataText, 'utf8')
fs.renameSync(dataTemporaryPath, dataPath)

for (const item of prepared) {
  if (path.resolve(item.sourcePath) !== path.resolve(item.targetPath)) {
    fs.unlinkSync(item.sourcePath)
  }
}

const manifest = {
  coordinateSpace: 'local_scene_y_up',
  units: 'meter',
  sourceGisOrigin: [originX, originY, originZ],
  transform: {
    x: 'gis_x - origin_x',
    y: 'gis_z - origin_z',
    z: 'origin_y - gis_y',
  },
  dataJsonWorldCenterPreserved: true,
  files: prepared.map((item) => ({
    sourceName: item.originalSourceName,
    targetName: item.targetName,
    text: item.text,
    objectId: item.objectId,
    dataId: item.dataId,
    format: item.format,
    vertices: item.vertices,
    transformed: item.previouslyTransformed || item.transformed,
    sceneAlignment: [0, 0, 0],
    sourceBounds: item.originalSourceBounds ?? item.sourceBounds,
    sceneBounds: item.sceneBounds,
  })),
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`Processed ${prepared.length} StructSurface PLY files.`)
for (const item of prepared) {
  console.log(`${item.sourceName} -> ${item.targetName} (${item.vertices} vertices)`)
}
