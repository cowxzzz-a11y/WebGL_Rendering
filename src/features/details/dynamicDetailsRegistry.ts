import type { Material } from '@babylonjs/core/Materials/material'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { DetailDescriptor } from '../../shared/types'
import { collectMaterialsFromMaterial } from '../material/materialUtils'

type DetailRegistry = Map<string, () => DetailDescriptor>

type DynamicDetailsRegistryOptions = {
  detailRegistry: DetailRegistry
  createMeshDetail: (mesh: AbstractMesh) => DetailDescriptor
  createModelDetail: (root: TransformNode, meshes: AbstractMesh[]) => DetailDescriptor
  getModelRoots: () => TransformNode[]
  getMeshesForRoot: (root: TransformNode) => AbstractMesh[]
}

export const createDynamicDetailsRegistry = ({
  detailRegistry,
  createMeshDetail,
  createModelDetail,
  getModelRoots,
  getMeshesForRoot,
}: DynamicDetailsRegistryOptions) => {
  const dynamicDetailIds = new Set<string>()

  const unregisterImportedDetails = () => {
    dynamicDetailIds.forEach((detailId) => detailRegistry.delete(detailId))
    dynamicDetailIds.clear()
  }

  // Keep the former materials argument accepted while the dev server hot-reloads.
  // Older registry closures still read it, so omitting it can break project opening
  // until a full page refresh even though material detail routes are no longer used.
  const registerImportedDetails = (meshes: AbstractMesh[], _legacyMaterials?: Set<Material>) => {
    const roots = getModelRoots()
    roots.forEach((root) => {
      const detailId = `model:${root.uniqueId}`
      dynamicDetailIds.add(detailId)
      detailRegistry.set(detailId, () => createModelDetail(root, getMeshesForRoot(root)))
    })

    meshes.forEach((mesh) => {
      const detailId = `mesh:${mesh.uniqueId}`

      dynamicDetailIds.add(detailId)
      detailRegistry.set(detailId, () => createMeshDetail(mesh))
    })

  }

  const refreshImportedDetails = (meshes: AbstractMesh[]) => {
    const materials = new Set<Material>()

    meshes.forEach((mesh) => collectMaterialsFromMaterial(mesh.material, materials))
    unregisterImportedDetails()
    registerImportedDetails(meshes, materials)

    return materials.size
  }

  return {
    unregisterImportedDetails,
    registerImportedDetails,
    refreshImportedDetails,
  }
}
