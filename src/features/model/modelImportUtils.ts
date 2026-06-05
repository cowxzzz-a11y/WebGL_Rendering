import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'

type ImportProgressEvent = {
  lengthComputable: boolean
  loaded: number
  total: number
}

export const isBakedFloor = (mesh: AbstractMesh) => mesh.name === '\u5e73\u9762' || /floor/i.test(mesh.name)

export const getImportProgressMessage = (fileName: string, event: ImportProgressEvent) => {
  if (!event.lengthComputable || event.total <= 0) {
    return `\u6b63\u5728\u5bfc\u5165 ${fileName}...`
  }

  return `\u6b63\u5728\u5bfc\u5165 ${fileName} ${Math.round((event.loaded / event.total) * 100)}%`
}

export const getModelFrame = (root: TransformNode, meshes: AbstractMesh[]) => {
  meshes.forEach((mesh) => {
    mesh.computeWorldMatrix(true)
    mesh.refreshBoundingInfo(true, false)
  })
  root.computeWorldMatrix(true)

  const frameMeshes = meshes.filter((mesh) => !isBakedFloor(mesh))
  const bounds =
    frameMeshes.length > 0
      ? root.getHierarchyBoundingVectors(true, (mesh) => frameMeshes.includes(mesh))
      : root.getHierarchyBoundingVectors(true)
  const size = bounds.max.subtract(bounds.min)
  const center = bounds.min.add(bounds.max).scale(0.5)
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001)
  const radius = Math.max(maxDimension * 1.48, 4)

  return {
    center,
    radius,
    size,
    target: center.add(new Vector3(0, size.y * 0.02, 0)),
  }
}
