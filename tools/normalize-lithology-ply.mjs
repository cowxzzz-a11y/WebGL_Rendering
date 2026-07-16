import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const geologyDir = path.join(projectRoot, 'assets', '地层')
const dataPath = path.join(geologyDir, 'data.json')
const plyDir = path.join(geologyDir, 'LithologyEntity')
const manifestPath = path.join(plyDir, 'coordinate-transform.json')
const centeredOuterShellNames = new Set(['徐庄组∈2x0.ply', '徐庄组∈2x_1.ply', '徐庄组∈2x_2.ply'])
const outerShellAlignment = [542.5279, 0, -1382.08354]

const dataText = fs.readFileSync(dataPath, 'utf8')
const data = JSON.parse(dataText)
const [originX, originY, originZ = 0] = data.world_Center

if (![originX, originY, originZ].every(Number.isFinite)) {
  throw new Error('data.json 中的 world_Center 无效')
}

const referenced = []
const walk = (node) => {
  const fileKey = node?.objectData?.fileKey
  if (typeof fileKey === 'string' && /^LithologyEntity[\\/]/i.test(fileKey)) {
    referenced.push({
      text: node.text,
      strataName: node.objectData['地层名称'] ?? node.text,
      objectId: node.objectId,
      fileKey,
      sourceName: fileKey.split(/[\\/]/).at(-1),
      targetName: `${node.text}.ply`,
    })
  }
  for (const child of node?.children ?? []) walk(child)
}
walk(data)

const invalidName = /[<>:"/\\|?*]/
for (const item of referenced) {
  if (!item.text || invalidName.test(item.text)) {
    throw new Error(`无法用作 Windows 文件名的地层名称: ${item.text}`)
  }
}

const targetNames = new Set()
for (const item of referenced) {
  const key = item.targetName.toLocaleLowerCase('zh-CN')
  if (targetNames.has(key)) throw new Error(`重复的目标文件名: ${item.targetName}`)
  targetNames.add(key)
}

const scalarSizes = {
  char: 1,
  int8: 1,
  uchar: 1,
  uint8: 1,
  short: 2,
  int16: 2,
  ushort: 2,
  uint16: 2,
  int: 4,
  int32: 4,
  uint: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8,
}

const findHeader = (buffer) => {
  const marker = Buffer.from('end_header')
  const markerAt = buffer.indexOf(marker)
  if (markerAt < 0) throw new Error('PLY 缺少 end_header')
  let dataAt = markerAt + marker.length
  if (buffer[dataAt] === 13) dataAt += 1
  if (buffer[dataAt] === 10) dataAt += 1
  return { header: buffer.subarray(0, dataAt).toString('ascii'), dataAt }
}

const parseVertexLayout = (header) => {
  const format = header.match(/^format\s+(\S+)\s+/m)?.[1]
  const vertexCount = Number(header.match(/^element\s+vertex\s+(\d+)\s*$/m)?.[1])
  const vertexBlock = header.match(/^element\s+vertex\s+\d+\s*$([\s\S]*?)(?=^element\s|^end_header)/m)?.[1]
  if (!format || !Number.isInteger(vertexCount) || !vertexBlock) {
    throw new Error('PLY 顶点头信息无效')
  }

  const properties = [...vertexBlock.matchAll(/^property\s+(?!list\b)(\S+)\s+(\S+)\s*$/gm)].map((match) => ({
    type: match[1],
    name: match[2],
  }))
  const offsets = new Map()
  let stride = 0
  for (const property of properties) {
    const size = scalarSizes[property.type]
    if (!size) throw new Error(`不支持的 PLY 属性类型: ${property.type}`)
    offsets.set(property.name, { offset: stride, type: property.type })
    stride += size
  }
  for (const axis of ['x', 'y', 'z']) {
    if (!offsets.has(axis)) throw new Error(`PLY 顶点缺少 ${axis} 属性`)
  }
  return { format, vertexCount, offsets, stride }
}

const readScalarLE = (buffer, offset, type) => {
  if (type === 'double' || type === 'float64') return buffer.readDoubleLE(offset)
  if (type === 'float' || type === 'float32') return buffer.readFloatLE(offset)
  throw new Error(`坐标属性必须是 float/double，实际为 ${type}`)
}

const writeScalarLE = (buffer, value, offset, type) => {
  if (type === 'double' || type === 'float64') return buffer.writeDoubleLE(value, offset)
  if (type === 'float' || type === 'float32') return buffer.writeFloatLE(value, offset)
  throw new Error(`坐标属性必须是 float/double，实际为 ${type}`)
}

const formatNumber = (value) => {
  if (Object.is(value, -0)) return '0'
  return Number(value.toPrecision(17)).toString()
}

const addTransformComments = (header, alignment) => {
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
    `comment scene_alignment ${alignment[0]} ${alignment[1]} ${alignment[2]}`,
  ].join('\n')
  return cleanHeader.replace(/end_header(\r?\n)$/, `${comments}$1end_header$1`)
}

const normalizePly = (sourcePath, targetPath, alignment) => {
  const input = fs.readFileSync(sourcePath)
  const { header, dataAt } = findHeader(input)
  const layout = parseVertexLayout(header)
  const localVersion1 = header.includes('scene_z=gis_y-origin_y')
  const alreadyCorrect = header.includes('scene_z=origin_y-gis_y')
  let output

  if (layout.format === 'binary_little_endian') {
    const body = Buffer.from(input.subarray(dataAt))
    if (!alreadyCorrect) {
      for (let index = 0; index < layout.vertexCount; index += 1) {
        const base = index * layout.stride
        const px = layout.offsets.get('x')
        const py = layout.offsets.get('y')
        const pz = layout.offsets.get('z')
        const x = readScalarLE(body, base + px.offset, px.type)
        const y = readScalarLE(body, base + py.offset, py.type)
        const z = readScalarLE(body, base + pz.offset, pz.type)
        const sceneX = localVersion1 ? x + alignment[0] : x - originX + alignment[0]
        const sceneY = localVersion1 ? y + alignment[1] : z - originZ + alignment[1]
        const sceneZ = localVersion1 ? -z + alignment[2] : originY - y + alignment[2]
        writeScalarLE(body, sceneX, base + px.offset, px.type)
        writeScalarLE(body, sceneY, base + py.offset, py.type)
        writeScalarLE(body, sceneZ, base + pz.offset, pz.type)
      }
    }
    output = Buffer.concat([Buffer.from(addTransformComments(header, alignment), 'ascii'), body])
  } else if (layout.format === 'ascii') {
    const sourceText = input.toString('utf8')
    const sourceHeader = sourceText.slice(0, dataAt)
    const lines = sourceText.slice(dataAt).split(/\r?\n/)
    if (!alreadyCorrect) {
      for (let index = 0; index < layout.vertexCount; index += 1) {
        const values = lines[index].trim().split(/\s+/)
        const x = Number(values[0])
        const y = Number(values[1])
        const z = Number(values[2])
        values[0] = formatNumber(localVersion1 ? x + alignment[0] : x - originX + alignment[0])
        values[1] = formatNumber(localVersion1 ? y + alignment[1] : z - originZ + alignment[1])
        values[2] = formatNumber(localVersion1 ? -z + alignment[2] : originY - y + alignment[2])
        lines[index] = values.join(' ')
      }
    }
    output = Buffer.from(addTransformComments(sourceHeader, alignment) + lines.join('\n'), 'utf8')
  } else {
    throw new Error(`不支持的 PLY 格式: ${layout.format}`)
  }

  const temporaryPath = `${targetPath}.tmp`
  fs.writeFileSync(temporaryPath, output)
  fs.renameSync(temporaryPath, targetPath)
  if (path.resolve(sourcePath) !== path.resolve(targetPath)) fs.unlinkSync(sourcePath)

  return {
    format: layout.format,
    vertices: layout.vertexCount,
    transformed: !alreadyCorrect,
    sceneAlignment: alignment,
  }
}

const originalFiles = fs.readdirSync(plyDir).filter((name) => name.toLowerCase().endsWith('.ply'))
const referenceBySource = new Map(referenced.map((item) => [item.sourceName.toLocaleLowerCase('zh-CN'), item]))
const results = []

for (const sourceName of originalFiles) {
  const mapping = referenceBySource.get(sourceName.toLocaleLowerCase('zh-CN'))
  const targetName = mapping?.targetName ?? sourceName
  const sourcePath = path.join(plyDir, sourceName)
  const targetPath = path.join(plyDir, targetName)
  if (sourcePath !== targetPath && fs.existsSync(targetPath)) {
    throw new Error(`目标文件已存在: ${targetName}`)
  }
  const alignment = centeredOuterShellNames.has(targetName) ? outerShellAlignment : [0, 0, 0]
  const info = normalizePly(sourcePath, targetPath, alignment)
  results.push({
    sourceName,
    targetName,
    referencedByDataJson: Boolean(mapping),
    text: mapping?.text ?? null,
    strataName: mapping?.strataName ?? null,
    objectId: mapping?.objectId ?? null,
    ...info,
  })
}

let updatedDataText = dataText
for (const item of referenced) {
  const oldValue = JSON.stringify(item.fileKey).slice(1, -1)
  const newValue = JSON.stringify(`LithologyEntity\\${item.targetName}`).slice(1, -1)
  if (!updatedDataText.includes(oldValue)) throw new Error(`data.json 中找不到 fileKey: ${item.fileKey}`)
  updatedDataText = updatedDataText.replaceAll(oldValue, newValue)
}
fs.writeFileSync(dataPath, updatedDataText, 'utf8')

const manifest = {
  coordinateSpace: 'local_scene_y_up',
  units: 'meter',
  sourceGisOrigin: [originX, originY, originZ],
  transform: {
    x: 'gis_x - origin_x',
    y: 'gis_z - origin_z',
    z: 'origin_y - gis_y',
  },
  outerShellAlignment: {
    files: [...centeredOuterShellNames],
    translation: outerShellAlignment,
    reason: 'Matches the existing target.glb scene registration.',
  },
  dataJsonWorldCenterPreserved: true,
  files: results,
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`已处理 ${results.length} 个 PLY，其中 ${results.filter((item) => item.referencedByDataJson).length} 个按 data.json 重命名。`)
for (const result of results) {
  console.log(`${result.sourceName} -> ${result.targetName} (${result.vertices} vertices${result.referencedByDataJson ? '' : ', data.json 未引用'})`)
}
