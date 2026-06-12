import type { Material } from '@babylonjs/core/Materials/material'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { DetailDescriptor } from '../../shared/types'
import { collectMaterialsFromMaterial } from '../material/materialUtils'

type DetailRegistry = Map<string, () => DetailDescriptor>

type DynamicDetailsRegistryOptions = {
  detailRegistry: DetailRegistry
  createMeshDetail: (mesh: AbstractMesh) => DetailDescriptor
  createMaterialDetail: (material: Material) => DetailDescriptor
}

export const createDynamicDetailsRegistry = ({
  detailRegistry,
  createMeshDetail,
  createMaterialDetail,
}: DynamicDetailsRegistryOptions) => {
  const dynamicDetailIds = new Set<string>()

  const unregisterImportedDetails = () => {
    dynamicDetailIds.forEach((detailId) => detailRegistry.delete(detailId))
    dynamicDetailIds.clear()
  }

  const registerImportedDetails = (meshes: AbstractMesh[], materials: Set<Material>) => {
    meshes.forEach((mesh) => {
      const detailId = `mesh:${mesh.uniqueId}`

      dynamicDetailIds.add(detailId)
      detailRegistry.set(detailId, () => createMeshDetail(mesh))
    })

    materials.forEach((material) => {
      const detailId = `material:${material.uniqueId}`

      dynamicDetailIds.add(detailId)
      detailRegistry.set(detailId, () => createMaterialDetail(material))
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
