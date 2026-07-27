import earcut from 'earcut'
import type { Scene } from '@babylonjs/core/scene'
import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Plane } from '@babylonjs/core/Maths/math.plane'
import { Matrix, Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { GizmoManager } from '@babylonjs/core/Gizmos/gizmoManager'
import { createCheckbox, createModule, createSelect, createSlider } from '../../ui/controls'

type ClippingSide = 'positive' | 'negative'

type ClippingState = {
  enabled: boolean
  helperVisible: boolean
  keepSide: ClippingSide
  position: Vector3
  rotation: Vector3
  capEnabled: boolean
}

export type ClippingController = {
  renderPanel: (panel: HTMLElement, mode?: 'full' | 'quick') => void
  setSceneFrame: (center: Vector3, radius: number) => void
  resetForSceneFrame: (center: Vector3, radius: number) => void
  clear: () => void
}

const positiveSideLabel = '\u6cd5\u7ebf\u6b63\u4fa7'
const negativeSideLabel = '\u6cd5\u7ebf\u53cd\u4fa7'

const toDegrees = (value: number) => (value * 180) / Math.PI

const toRadians = (value: number) => (value * Math.PI) / 180

const getPositionStep = (radius: number) => {
  const base = Math.max(radius / 1000, 0.0001)
  return Number(base.toPrecision(2))
}

type CapBinding = {
  source: AbstractMesh
  capMesh: Mesh
  capMaterial: StandardMaterial
}

type PlaneBasis = {
  origin: Vector3
  normal: Vector3
  u: Vector3
  v: Vector3
}

type CapPoint = {
  key: string
  world: Vector3
  projected: Vector2
}

type CapLoop = {
  points: CapPoint[]
  area: number
  parent: number
  depth: number
}

type CapGeometry = {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

const signedArea = (points: CapPoint[]) => {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index].projected
    const next = points[(index + 1) % points.length].projected
    area += current.x * next.y - next.x * current.y
  }
  return area * 0.5
}

const pointInPolygon = (point: Vector2, polygon: CapPoint[]) => {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index].projected
    const previousPoint = polygon[previous].projected
    const crossesY = currentPoint.y > point.y !== previousPoint.y > point.y
    if (!crossesY) {
      continue
    }
    const xAtY =
      ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
        (previousPoint.y - currentPoint.y) +
      currentPoint.x
    if (point.x < xAtY) {
      inside = !inside
    }
  }
  return inside
}

const createPlaneBasis = (origin: Vector3, normal: Vector3): PlaneBasis => {
  const normalized = normal.normalizeToNew()
  const reference = Math.abs(Vector3.Dot(normalized, Vector3.Up())) > 0.92 ? Vector3.Right() : Vector3.Up()
  const u = Vector3.Cross(reference, normalized).normalize()
  const v = Vector3.Cross(normalized, u).normalize()
  return {
    origin: origin.clone(),
    normal: normalized,
    u,
    v,
  }
}

const projectToBasis = (point: Vector3, basis: PlaneBasis) => {
  const relative = point.subtract(basis.origin)
  return new Vector2(Vector3.Dot(relative, basis.u), Vector3.Dot(relative, basis.v))
}

const getPointFromPositions = (positions: ArrayLike<number>, index: number, world: Matrix) => {
  const offset = index * 3
  const local = new Vector3(positions[offset], positions[offset + 1], positions[offset + 2])
  return Vector3.TransformCoordinates(local, world)
}

const getGeometrySource = (mesh: AbstractMesh) => {
  if (mesh.getClassName() === 'InstancedMesh') {
    return (mesh as unknown as { sourceMesh?: AbstractMesh }).sourceMesh ?? mesh
  }
  return mesh
}

const createSequentialIndices = (vertexCount: number) => {
  const indices = new Array<number>(vertexCount)
  for (let index = 0; index < vertexCount; index += 1) {
    indices[index] = index
  }
  return indices
}

const cleanLoop = (points: CapPoint[], tolerance: number) => {
  const unique = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length]
    return point.projected.subtract(previous.projected).lengthSquared() > tolerance * tolerance
  })

  let changed = true
  while (changed && unique.length > 3) {
    changed = false
    for (let index = 0; index < unique.length; index += 1) {
      const previous = unique[(index + unique.length - 1) % unique.length].projected
      const current = unique[index].projected
      const next = unique[(index + 1) % unique.length].projected
      const ax = current.x - previous.x
      const ay = current.y - previous.y
      const bx = next.x - current.x
      const by = next.y - current.y
      const cross = Math.abs(ax * by - ay * bx)
      const lengthScale = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by))
      if (lengthScale > 0 && cross / lengthScale < 1e-5) {
        unique.splice(index, 1)
        changed = true
        break
      }
    }
  }

  return unique
}

const classifyLoops = (loops: CapPoint[][], tolerance: number) => {
  const records = loops
    .map((points) => ({
      points,
      area: signedArea(points),
      parent: -1,
      depth: 0,
    }))
    .filter((loop) => loop.points.length >= 3 && Math.abs(loop.area) > tolerance * tolerance)
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area))

  records.forEach((loop, loopIndex) => {
    let parent = -1
    let parentArea = Number.POSITIVE_INFINITY
    for (let candidateIndex = 0; candidateIndex < loopIndex; candidateIndex += 1) {
      const candidate = records[candidateIndex]
      const candidateArea = Math.abs(candidate.area)
      if (candidateArea >= parentArea) {
        continue
      }
      if (pointInPolygon(loop.points[0].projected, candidate.points)) {
        parent = candidateIndex
        parentArea = candidateArea
      }
    }
    loop.parent = parent
    loop.depth = parent === -1 ? 0 : records[parent].depth + 1
  })

  return records
}

const orientLoop = (loop: CapLoop, clockwise: boolean) => {
  const area = signedArea(loop.points)
  const isClockwise = area < 0
  return isClockwise === clockwise ? loop.points : loop.points.slice().reverse()
}

const triangulateLoops = (
  loops: CapPoint[][],
  basis: PlaneBasis,
  normal: Vector3,
  tolerance: number,
): CapGeometry => {
  const geometry: CapGeometry = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
  }
  const classified = classifyLoops(loops, tolerance)
  const flipWinding = Vector3.Dot(normal, basis.normal) < 0

  classified.forEach((outer, outerIndex) => {
    if (outer.depth % 2 !== 0) {
      return
    }

    const rings = [orientLoop(outer, false)]
    classified.forEach((hole) => {
      if (hole.parent === outerIndex && hole.depth === outer.depth + 1) {
        rings.push(orientLoop(hole, true))
      }
    })

    const flat: number[] = []
    const holeIndices: number[] = []
    const combined: CapPoint[] = []
    rings.forEach((ring, ringIndex) => {
      if (ringIndex > 0) {
        holeIndices.push(combined.length)
      }
      ring.forEach((point) => {
        flat.push(point.projected.x, point.projected.y)
        combined.push(point)
      })
    })

    const localIndices = earcut(flat, holeIndices, 2)
    if (localIndices.length === 0) {
      return
    }

    const baseIndex = geometry.positions.length / 3
    combined.forEach((point) => {
      geometry.positions.push(point.world.x, point.world.y, point.world.z)
      geometry.normals.push(normal.x, normal.y, normal.z)
      geometry.uvs.push(
        Vector3.Dot(point.world.subtract(basis.origin), basis.u),
        Vector3.Dot(point.world.subtract(basis.origin), basis.v),
      )
    })

    for (let index = 0; index < localIndices.length; index += 3) {
      const a = baseIndex + localIndices[index]
      const b = baseIndex + localIndices[index + 1]
      const c = baseIndex + localIndices[index + 2]
      geometry.indices.push(a, flipWinding ? c : b, flipWinding ? b : c)
    }
  })

  return geometry
}

const buildLoopsFromSegments = (
  pointMap: Map<string, CapPoint>,
  edgeSet: Set<string>,
  adjacency: Map<string, Set<string>>,
  tolerance: number,
) => {
  const loops: CapPoint[][] = []

  while (edgeSet.size > 0) {
    const firstEdge = edgeSet.values().next().value as string
    const [start, firstNext] = firstEdge.split('|')
    const loopKeys = [start]
    let previous = start
    let current = firstNext
    edgeSet.delete(firstEdge)

    for (let guard = 0; guard < pointMap.size + 4; guard += 1) {
      loopKeys.push(current)
      if (current === start) {
        break
      }

      const neighbors = adjacency.get(current)
      if (!neighbors) {
        break
      }

      let next: string | null = null
      for (const candidate of neighbors) {
        if (candidate === previous) {
          continue
        }
        const candidateEdge = edgeKey(current, candidate)
        if (edgeSet.has(candidateEdge)) {
          next = candidate
          break
        }
      }
      if (!next) {
        for (const candidate of neighbors) {
          const candidateEdge = edgeKey(current, candidate)
          if (edgeSet.has(candidateEdge)) {
            next = candidate
            break
          }
        }
      }
      if (!next) {
        break
      }

      edgeSet.delete(edgeKey(current, next))
      previous = current
      current = next
    }

    if (loopKeys[loopKeys.length - 1] !== start) {
      continue
    }

    loopKeys.pop()
    const loop = cleanLoop(
      loopKeys.map((key) => pointMap.get(key)).filter((point): point is CapPoint => !!point),
      tolerance,
    )
    if (loop.length >= 3) {
      loops.push(loop)
    }
  }

  return loops
}

export const createClippingController = (scene: Scene): ClippingController => {
  const state: ClippingState = {
    enabled: false,
    helperVisible: true,
    keepSide: 'positive',
    position: Vector3.Zero(),
    rotation: Vector3.Zero(),
    capEnabled: true,
  }

  const frameCenter = Vector3.Zero()
  let frameRadius = 8
  const frameBoundsMin = new Vector3(-8, -8, -8)
  const frameBoundsMax = new Vector3(8, 8, 8)
  let hasCustomTransform = false
  const activePanels = new Map<HTMLElement, 'full' | 'quick'>()
  let scheduledCapSyncId: number | undefined

  const helperMaterial = new StandardMaterial('__clipping_plane_helper_material', scene)
  helperMaterial.diffuseColor = new Color3(0.2, 0.68, 0.92)
  helperMaterial.emissiveColor = new Color3(0.08, 0.34, 0.5)
  helperMaterial.alpha = 0.24
  helperMaterial.backFaceCulling = false
  helperMaterial.disableLighting = true

  const helperPlane = MeshBuilder.CreatePlane(
    '__clipping_plane_helper',
    { size: 1, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  )
  helperPlane.material = helperMaterial
  helperPlane.isPickable = false
  helperPlane.renderingGroupId = 2
  helperPlane.alwaysSelectAsActiveMesh = true
  helperPlane.setEnabled(false)

  const clippingPivot = new TransformNode('__clipping_plane_pivot', scene)
  helperPlane.parent = clippingPivot

  const gizmoManager = new GizmoManager(scene)
  gizmoManager.usePointerToAttachGizmos = false
  gizmoManager.enableAutoPicking = false
  gizmoManager.clearGizmoOnEmptyPointerEvent = false
  gizmoManager.positionGizmoEnabled = true
  gizmoManager.rotationGizmoEnabled = true

  const positionGizmo = gizmoManager.gizmos.positionGizmo
  const rotationGizmo = gizmoManager.gizmos.rotationGizmo
  if (positionGizmo) {
    positionGizmo.scaleRatio = 0.78
    positionGizmo.planarGizmoEnabled = false
  }
  if (rotationGizmo) {
    rotationGizmo.scaleRatio = 0.48
  }

  const capBindings = new Map<number, CapBinding>()

  const getTolerance = () => Math.max(frameRadius * 1e-6, 1e-5)

  const getColorProperty = (material: Material, propertyName: string) => {
    const value = (material as unknown as Record<string, unknown>)[propertyName]
    return value instanceof Color3 ? value : null
  }

  const getMaterialMainColor = (material: Material): Color3 => {
    if (material.getClassName() === 'MultiMaterial') {
      const subMaterials = (material as unknown as { subMaterials: Material[] }).subMaterials
      if (subMaterials && subMaterials.length > 0) {
        for (const subMat of subMaterials) {
          if (subMat) {
            const color = getMaterialMainColor(subMat)
            if (color) return color
          }
        }
      }
    }
    return (
      getColorProperty(material, 'albedoColor') ??
      getColorProperty(material, 'diffuseColor') ??
      getColorProperty(material, 'baseColor') ??
      getColorProperty(material, 'emissiveColor') ??
      new Color3(0.5, 0.5, 0.5)
    )
  }

  const getVertexColor = (mesh: AbstractMesh): Color3 | null => {
    const source = getGeometrySource(mesh)

    if (source && source.useVertexColors && source.isVerticesDataPresent(VertexBuffer.ColorKind)) {
      const colors = source.getVerticesData(VertexBuffer.ColorKind)
      if (colors) {
        const stride = (source as unknown as { geometry?: { getVertexBuffer: (kind: string) => { getSize: () => number } | null } })
          .geometry?.getVertexBuffer(VertexBuffer.ColorKind)?.getSize() ?? 4
        const limit = Math.min(colors.length, 1000 * stride)
        for (let i = 0; i < limit; i += stride) {
          const r = colors[i]
          const g = colors[i + 1]
          const b = colors[i + 2]
          if (r < 0.99 || g < 0.99 || b < 0.99) {
            return new Color3(r, g, b)
          }
        }
        if (colors.length >= 3) {
          return new Color3(colors[0], colors[1], colors[2])
        }
      }
    }
    return null
  }

  const getMeshColor = (mesh: AbstractMesh): Color3 => {
    const vertexColor = getVertexColor(mesh)
    if (vertexColor) return vertexColor

    if (mesh.material) {
      return getMaterialMainColor(mesh.material)
    }
    return new Color3(0.5, 0.5, 0.5)
  }

  const createCapMaterial = (source: AbstractMesh) => {
    const color = getMeshColor(source)
    const material = new StandardMaterial(`__clipping_cap_material_${source.uniqueId}`, scene)
    material.diffuseColor = color.clone()
    material.emissiveColor = color.scale(0.82)
    material.alpha = 1
    material.transparencyMode = Material.MATERIAL_OPAQUE
    material.backFaceCulling = false
    material.disableLighting = true
    material.disableDepthWrite = false
    material.forceDepthWrite = true
    return material
  }

  const disposeCapBinding = (binding: CapBinding) => {
    binding.capMesh.dispose(false, false)
    binding.capMaterial.dispose()
  }

  const disposeAllCapBindings = () => {
    capBindings.forEach(disposeCapBinding)
    capBindings.clear()
  }

  const cancelScheduledCapSync = () => {
    if (scheduledCapSyncId === undefined) {
      return
    }
    window.clearTimeout(scheduledCapSyncId)
    scheduledCapSyncId = undefined
  }

  const hideCapBindings = () => {
    capBindings.forEach((binding) => binding.capMesh.setEnabled(false))
  }

  const getTargetMeshes = () => {
    return scene.meshes.filter((mesh): mesh is AbstractMesh => {
      return (
        !!mesh.material &&
        mesh.isEnabled() &&
        !mesh.name.startsWith('__') &&
        mesh.name !== 'skyBox' &&
        mesh.name !== 'background'
      )
    })
  }

  const updateFrameBounds = () => {
    const targetMeshes = getTargetMeshes()
    if (targetMeshes.length === 0) {
      const fallback = new Vector3(frameRadius, frameRadius, frameRadius)
      frameBoundsMin.copyFrom(frameCenter.subtract(fallback))
      frameBoundsMax.copyFrom(frameCenter.add(fallback))
      return
    }

    const minimum = new Vector3(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    )
    const maximum = new Vector3(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    )

    targetMeshes.forEach((mesh) => {
      mesh.computeWorldMatrix(true)
      mesh.refreshBoundingInfo(true, false)
      const bounds = mesh.getBoundingInfo().boundingBox
      minimum.minimizeInPlace(bounds.minimumWorld)
      maximum.maximizeInPlace(bounds.maximumWorld)
    })

    if (
      Number.isFinite(minimum.x) &&
      Number.isFinite(minimum.y) &&
      Number.isFinite(minimum.z) &&
      Number.isFinite(maximum.x) &&
      Number.isFinite(maximum.y) &&
      Number.isFinite(maximum.z)
    ) {
      frameBoundsMin.copyFrom(minimum)
      frameBoundsMax.copyFrom(maximum)
    }
  }

  const excludeFromRenderPasses = (mesh: AbstractMesh) => {
    const meshScene = mesh.getScene()
    if ((meshScene as unknown as { geometryBufferRenderer?: { excludeMesh: (target: AbstractMesh) => void } }).geometryBufferRenderer) {
      try {
        ;(meshScene as unknown as { geometryBufferRenderer: { excludeMesh: (target: AbstractMesh) => void } }).geometryBufferRenderer.excludeMesh(mesh)
      } catch {
        // Some renderer variants do not expose exclusion for generated meshes.
      }
    }
    if ((meshScene as unknown as { prePassRenderer?: { excludeMesh: (target: AbstractMesh) => void } }).prePassRenderer) {
      try {
        ;(meshScene as unknown as { prePassRenderer: { excludeMesh: (target: AbstractMesh) => void } }).prePassRenderer.excludeMesh(mesh)
      } catch {
        // Some renderer variants do not expose exclusion for generated meshes.
      }
    }
  }

  const getOrCreateCapBinding = (mesh: AbstractMesh) => {
    let binding = capBindings.get(mesh.uniqueId)
    if (binding) {
      return binding
    }

    const capMaterial = createCapMaterial(mesh)
    const capMesh = new Mesh(`__clipping_cap_mesh_${mesh.uniqueId}`, scene)
    capMesh.material = capMaterial
    capMesh.renderingGroupId = 0
    capMesh.isPickable = false
    capMesh.receiveShadows = false
    capMesh.alwaysSelectAsActiveMesh = true
    excludeFromRenderPasses(capMesh)

    binding = {
      source: mesh,
      capMesh,
      capMaterial,
    }
    capBindings.set(mesh.uniqueId, binding)
    return binding
  }

  const addGraphEdge = (
    pointMap: Map<string, CapPoint>,
    edgeSet: Set<string>,
    adjacency: Map<string, Set<string>>,
    a: CapPoint,
    b: CapPoint,
  ) => {
    if (a.key === b.key) {
      return
    }
    pointMap.set(a.key, a)
    pointMap.set(b.key, b)
    const key = edgeKey(a.key, b.key)
    if (edgeSet.has(key)) {
      edgeSet.delete(key)
      return
    }
    edgeSet.add(key)
    if (!adjacency.has(a.key)) {
      adjacency.set(a.key, new Set())
    }
    if (!adjacency.has(b.key)) {
      adjacency.set(b.key, new Set())
    }
    adjacency.get(a.key)!.add(b.key)
    adjacency.get(b.key)!.add(a.key)
  }

  const createCapPoint = (world: Vector3, basis: PlaneBasis, tolerance: number, offset: Vector3): CapPoint => {
    const projected = projectToBasis(world, basis)
    const x = Math.round(projected.x / tolerance)
    const y = Math.round(projected.y / tolerance)
    const snappedProjected = new Vector2(x * tolerance, y * tolerance)
    const snappedWorld = basis.origin
      .add(basis.u.scale(snappedProjected.x))
      .add(basis.v.scale(snappedProjected.y))
      .add(offset)

    return {
      key: `${x},${y}`,
      world: snappedWorld,
      projected: snappedProjected,
    }
  }

  const intersectEdge = (
    start: Vector3,
    end: Vector3,
    startDistance: number,
    endDistance: number,
    tolerance: number,
  ) => {
    const startOnPlane = Math.abs(startDistance) <= tolerance
    const endOnPlane = Math.abs(endDistance) <= tolerance

    if (startOnPlane && endOnPlane) {
      return [start, end]
    }
    if (startOnPlane) {
      return [start]
    }
    if (endOnPlane) {
      return [end]
    }
    if (startDistance * endDistance > 0) {
      return []
    }

    const ratio = startDistance / (startDistance - endDistance)
    return [start.add(end.subtract(start).scale(ratio))]
  }

  const buildCapGeometry = (
    mesh: AbstractMesh,
    basis: PlaneBasis,
    capNormal: Vector3,
    clipNormal: Vector3,
  ) => {
    const source = getGeometrySource(mesh)
    const positions = source.getVerticesData(VertexBuffer.PositionKind)
    if (!positions || positions.length < 9) {
      return null
    }

    const rawIndices = source.getIndices()
    const indices = rawIndices && rawIndices.length > 0 ? Array.from(rawIndices) : createSequentialIndices(positions.length / 3)
    const world = mesh.computeWorldMatrix(true)
    const tolerance = getTolerance()
    const capOffset = clipNormal.scale(-tolerance * 0.5)
    const pointMap = new Map<string, CapPoint>()
    const edgeSet = new Set<string>()
    const adjacency = new Map<string, Set<string>>()

    for (let index = 0; index + 2 < indices.length; index += 3) {
      const v0 = getPointFromPositions(positions, indices[index], world)
      const v1 = getPointFromPositions(positions, indices[index + 1], world)
      const v2 = getPointFromPositions(positions, indices[index + 2], world)
      const d0 = Vector3.Dot(v0.subtract(basis.origin), basis.normal)
      const d1 = Vector3.Dot(v1.subtract(basis.origin), basis.normal)
      const d2 = Vector3.Dot(v2.subtract(basis.origin), basis.normal)

      if (d0 > tolerance && d1 > tolerance && d2 > tolerance) {
        continue
      }
      if (d0 < -tolerance && d1 < -tolerance && d2 < -tolerance) {
        continue
      }

      const intersections = [
        ...intersectEdge(v0, v1, d0, d1, tolerance),
        ...intersectEdge(v1, v2, d1, d2, tolerance),
        ...intersectEdge(v2, v0, d2, d0, tolerance),
      ]
      const capPoints: CapPoint[] = []
      intersections.forEach((point) => {
        const capPoint = createCapPoint(point, basis, tolerance, capOffset)
        if (!capPoints.some((existing) => existing.key === capPoint.key)) {
          capPoints.push(capPoint)
        }
      })

      if (capPoints.length < 2) {
        continue
      }

      if (capPoints.length > 2) {
        let bestA = capPoints[0]
        let bestB = capPoints[1]
        let bestDistance = 0
        for (let a = 0; a < capPoints.length; a += 1) {
          for (let b = a + 1; b < capPoints.length; b += 1) {
            const distance = capPoints[a].projected.subtract(capPoints[b].projected).lengthSquared()
            if (distance > bestDistance) {
              bestDistance = distance
              bestA = capPoints[a]
              bestB = capPoints[b]
            }
          }
        }
        addGraphEdge(pointMap, edgeSet, adjacency, bestA, bestB)
      } else {
        addGraphEdge(pointMap, edgeSet, adjacency, capPoints[0], capPoints[1])
      }
    }

    const loops = buildLoopsFromSegments(pointMap, edgeSet, adjacency, tolerance)
    if (loops.length === 0) {
      return null
    }

    const geometry = triangulateLoops(loops, basis, capNormal, tolerance)
    return geometry.indices.length > 0 ? geometry : null
  }

  const applyCapGeometry = (binding: CapBinding, geometry: CapGeometry | null) => {
    const color = getMeshColor(binding.source)
    binding.capMaterial.diffuseColor.copyFrom(color)
    binding.capMaterial.emissiveColor.copyFrom(color.scale(0.82))
    binding.capMaterial.clipPlane = Plane.FromPositionAndNormal(
      state.position.add(getClipNormal().scale(Math.max(frameRadius * 20, 1000))),
      getClipNormal(),
    )

    if (!geometry) {
      binding.capMesh.setEnabled(false)
      return
    }

    binding.capMesh.setVerticesData(VertexBuffer.PositionKind, geometry.positions, true)
    binding.capMesh.setVerticesData(VertexBuffer.NormalKind, geometry.normals, true)
    binding.capMesh.setVerticesData(VertexBuffer.UVKind, geometry.uvs, true)
    binding.capMesh.setIndices(geometry.indices)
    binding.capMesh.setEnabled(true)
  }

  const syncCapBindings = () => {
    cancelScheduledCapSync()
    const targetMeshes = getTargetMeshes()

    if (!state.enabled || !state.capEnabled) {
      hideCapBindings()
      return
    }

    const targetIds = new Set(targetMeshes.map((mesh) => mesh.uniqueId))
    capBindings.forEach((binding, meshId) => {
      if (!targetIds.has(meshId) || binding.source.isDisposed()) {
        disposeCapBinding(binding)
        capBindings.delete(meshId)
      }
    })

    const displayNormal = getDisplayNormal()
    const clipNormal = getClipNormal()
    const capNormal = clipNormal
    const basis = createPlaneBasis(state.position, displayNormal)

    targetMeshes.forEach((mesh) => {
      const binding = getOrCreateCapBinding(mesh)
      const geometry = buildCapGeometry(mesh, basis, capNormal, clipNormal)
      applyCapGeometry(binding, geometry)
    })
  }

  const scheduleCapBindingsSync = () => {
    cancelScheduledCapSync()
    hideCapBindings()

    if (!state.enabled || !state.capEnabled) {
      return
    }

    scheduledCapSyncId = window.setTimeout(() => {
      scheduledCapSyncId = undefined
      syncCapBindings()
    }, 70)
  }

  const markClipDefinesDirty = () => {
    scene.materials.forEach((material) => {
      material.markAsDirty(Material.MiscDirtyFlag)
    })
  }

  const getDisplayNormal = () => {
    const rotation = Matrix.RotationYawPitchRoll(state.rotation.y, state.rotation.x, state.rotation.z)
    return Vector3.TransformNormal(Vector3.Forward(), rotation).normalize()
  }

  const getClipNormal = () => {
    const displayNormal = getDisplayNormal()
    return state.keepSide === 'positive' ? displayNormal.scale(-1) : displayNormal
  }

  const getFrameCorners = () => {
    const corners: Vector3[] = []
    ;[frameBoundsMin.x, frameBoundsMax.x].forEach((x) => {
      ;[frameBoundsMin.y, frameBoundsMax.y].forEach((y) => {
        ;[frameBoundsMin.z, frameBoundsMax.z].forEach((z) => {
          corners.push(new Vector3(x, y, z))
        })
      })
    })
    return corners
  }

  const getHelperPlaneSize = () => {
    const rotation = Matrix.RotationYawPitchRoll(state.rotation.y, state.rotation.x, state.rotation.z)
    const localX = Vector3.TransformNormal(Vector3.Right(), rotation).normalize()
    const localY = Vector3.TransformNormal(Vector3.Up(), rotation).normalize()
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    getFrameCorners().forEach((corner) => {
      const relative = corner.subtract(frameCenter)
      const x = Vector3.Dot(relative, localX)
      const y = Vector3.Dot(relative, localY)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    })

    const minimumSize = Math.max(frameRadius * 0.05, 0.01)
    return {
      width: Math.max((maxX - minX) * 1.08, minimumSize),
      height: Math.max((maxY - minY) * 1.08, minimumSize),
    }
  }

  const syncHelperPlane = () => {
    helperPlane.setEnabled(state.enabled && state.helperVisible)
    clippingPivot.setEnabled(state.enabled && state.helperVisible)
    gizmoManager.attachToNode(state.enabled && state.helperVisible ? clippingPivot : null)
    if (!state.enabled || !state.helperVisible) {
      return
    }

    const planeSize = getHelperPlaneSize()
    helperPlane.scaling.set(planeSize.width, planeSize.height, 1)
    helperPlane.position.setAll(0)
    helperPlane.rotation.setAll(0)
    clippingPivot.rotationQuaternion = null
    clippingPivot.rotation.copyFrom(state.rotation)
    clippingPivot.position.copyFrom(state.position)
    clippingPivot.scaling.setAll(1)

    if (state.keepSide === 'positive') {
      helperMaterial.diffuseColor = new Color3(0.2, 0.68, 0.92)
      helperMaterial.emissiveColor = new Color3(0.08, 0.34, 0.5)
    } else {
      helperMaterial.diffuseColor = new Color3(0.95, 0.62, 0.24)
      helperMaterial.emissiveColor = new Color3(0.5, 0.22, 0.05)
    }

  }

  const applyClipPlane = (definesMayChange = false, capSync: 'immediate' | 'deferred' = 'immediate') => {
    const hadClipPlane = scene.clipPlane !== null
    const clipNormal = getClipNormal()
    scene.clipPlane = state.enabled ? Plane.FromPositionAndNormal(state.position, clipNormal) : null

    syncHelperPlane()
    if (capSync === 'deferred') {
      scheduleCapBindingsSync()
    } else {
      syncCapBindings()
    }

    if (definesMayChange || hadClipPlane !== (scene.clipPlane !== null)) {
      markClipDefinesDirty()
    }
  }

  const rerenderPanel = () => {
    activePanels.forEach((mode, panel) => {
      if (panel.isConnected) {
        renderPanel(panel, mode)
      } else {
        activePanels.delete(panel)
      }
    })
  }

  const setSceneFrame = (center: Vector3, radius: number) => {
    frameCenter.copyFrom(center)
    frameRadius = Math.max(radius, 0.001)
    updateFrameBounds()

    if (!hasCustomTransform) {
      state.position.copyFrom(frameCenter)
    }

    applyClipPlane()
    rerenderPanel()
  }

  const syncStateFromGizmo = (capSync: 'immediate' | 'deferred') => {
    state.position.copyFrom(clippingPivot.position)
    const rotation = clippingPivot.rotationQuaternion?.toEulerAngles() ?? clippingPivot.rotation
    state.rotation.copyFrom(rotation)
    hasCustomTransform = true
    applyClipPlane(false, capSync)
  }

  positionGizmo?.onDragObservable.add(() => {
    syncStateFromGizmo('deferred')
  })
  positionGizmo?.onDragEndObservable.add(() => {
    syncStateFromGizmo('immediate')
    rerenderPanel()
  })
  rotationGizmo?.onDragObservable.add(() => {
    syncStateFromGizmo('deferred')
  })
  rotationGizmo?.onDragEndObservable.add(() => {
    syncStateFromGizmo('immediate')
    rerenderPanel()
  })
  const resetPlaneTransform = () => {
    hasCustomTransform = false
    state.position.copyFrom(frameCenter)
    state.rotation.set(0, 0, 0)
    applyClipPlane()
    rerenderPanel()
  }

  const resetForSceneFrame = (center: Vector3, radius: number) => {
    state.enabled = false
    state.helperVisible = true
    state.keepSide = 'positive'
    state.rotation.set(0, 0, 0)
    hasCustomTransform = false
    setSceneFrame(center, radius)
    applyClipPlane(true)
  }

  const renderPanel = (panel: HTMLElement, mode: 'full' | 'quick' = 'full') => {
    activePanels.set(panel, mode)
    panel.textContent = ''

    const radius = Math.max(frameRadius, 0.001)
    const span = Math.max(radius * 1.2, 0.1)
    const step = getPositionStep(radius)
    const min = frameCenter.subtract(new Vector3(span, span, span))
    const max = frameCenter.add(new Vector3(span, span, span))

    const switchBody: HTMLElement[] = []
    switchBody.push(createCheckbox('\u542f\u7528\u5256\u5207', state.enabled, (value) => {
      state.enabled = value
      applyClipPlane(true)
      rerenderPanel()
    }))
    if (mode === 'full') {
      switchBody.push(createCheckbox('\u663e\u793a\u5256\u5207\u9762\u4e0e\u64cd\u7eb5\u5668', state.helperVisible, (value) => {
        state.helperVisible = value
        applyClipPlane()
        rerenderPanel()
      }))
    }
    switchBody.push(createSelect(
      '\u4fdd\u7559\u4fa7',
      [positiveSideLabel, negativeSideLabel],
      state.keepSide === 'positive' ? positiveSideLabel : negativeSideLabel,
      (value) => {
        state.keepSide = value === positiveSideLabel ? 'positive' : 'negative'
        hasCustomTransform = true
        applyClipPlane()
      },
    ))
    switchBody.push(createCheckbox('\u542f\u7528\u5c01\u53e3', state.capEnabled, (value) => {
      state.capEnabled = value
      applyClipPlane()
      rerenderPanel()
    }))

    const transformBody: HTMLElement[] = []
    ;(['x', 'y', 'z'] as const).forEach((axis) => {
      transformBody.push(createSlider(
        axis.toUpperCase(),
        state.position[axis],
        min[axis],
        max[axis],
        step,
        (value) => {
          state.position[axis] = value
          hasCustomTransform = true
          applyClipPlane(false, 'deferred')
        },
        (value) => {
          state.position[axis] = value
          hasCustomTransform = true
          applyClipPlane()
        },
      ))
    })
    if (mode === 'full') {
      ;(['x', 'y', 'z'] as const).forEach((axis) => {
        transformBody.push(createSlider(
          `R${axis.toUpperCase()}`,
          toDegrees(state.rotation[axis]),
          -180,
          180,
          1,
          (value) => {
            state.rotation[axis] = toRadians(value)
            hasCustomTransform = true
            applyClipPlane(false, 'deferred')
          },
          (value) => {
            state.rotation[axis] = toRadians(value)
            hasCustomTransform = true
            applyClipPlane()
          },
        ))
      })
    }

    const resetRow = document.createElement('div')
    resetRow.className = 'tech-row'
    const resetButton = document.createElement('button')
    resetButton.type = 'button'
    resetButton.className = 'tech-upload-btn'
    resetButton.textContent = '\u91cd\u7f6e\u5256\u5207\u9762'
    resetButton.addEventListener('click', resetPlaneTransform)
    resetRow.append(resetButton)
    transformBody.push(resetRow)

    panel.append(createModule(mode === 'quick' ? '\u5256\u5207\u5de5\u5177' : '\u5256\u5207', switchBody))
    panel.append(createModule(mode === 'quick' ? '\u4f4d\u7f6e' : '\u53d8\u6362', transformBody))
  }

  return {
    renderPanel,
    setSceneFrame,
    resetForSceneFrame,
    clear: () => {
      state.enabled = false
      cancelScheduledCapSync()
      applyClipPlane(true)
      disposeAllCapBindings()
    },
  }
}
