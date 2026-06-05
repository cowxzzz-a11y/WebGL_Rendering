import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { getMeshesUsingPbrMaterial } from '../material/materialUtils'

export const getNodeIdentity = (name: string | null | undefined, fallback: string) => {
  const normalized = name?.trim()
  return normalized && normalized !== '__root__' ? normalized : fallback
}

export const getMeshKey = (mesh: AbstractMesh) => {
  const segments: string[] = []
  let current: TransformNode | AbstractMesh | null = mesh

  while (current) {
    segments.push(getNodeIdentity(current.name, `${current.getClassName()}:${current.uniqueId}`))
    current = current.parent instanceof TransformNode || current.parent instanceof AbstractMesh ? current.parent : null
  }

  return segments.reverse().join('/')
}

export const getMaterialKey = (material: PBRMaterial, meshes: AbstractMesh[]) => {
  const materialName = material.name?.trim()

  if (materialName) {
    return `name:${materialName}`
  }

  const linkedMeshes = getMeshesUsingPbrMaterial(material, meshes)
    .map((mesh) => getMeshKey(mesh))
    .sort()

  return linkedMeshes.length > 0 ? `meshes:${linkedMeshes.join('|')}` : `id:${material.uniqueId}`
}

export const getCurrentModelSignature = (roots: TransformNode[], meshes: AbstractMesh[]) => {
  if (roots.length === 0 || meshes.length === 0) {
    return null
  }

  const rootNames = roots.map((root) => root.name).sort()
  const meshKeys = meshes.map((mesh) => getMeshKey(mesh)).sort()
  return `${rootNames.join('|')}::${meshKeys.join('|')}`
}
