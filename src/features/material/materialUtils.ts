import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'

export const collectMaterialsFromMaterial = (material: unknown, target: Set<Material>) => {
  if (material instanceof MultiMaterial) {
    material.subMaterials.forEach((subMaterial) => {
      if (subMaterial instanceof Material) {
        target.add(subMaterial)
      }
    })
    return
  }

  if (material instanceof Material) {
    target.add(material)
  }
}

export const collectPbrMaterialsFromMaterial = (material: unknown, target: Set<PBRMaterial>) => {
  if (material instanceof PBRMaterial) {
    target.add(material)
    return
  }

  if (material instanceof MultiMaterial) {
    material.subMaterials.forEach((subMaterial) => {
      if (subMaterial instanceof PBRMaterial) {
        target.add(subMaterial)
      }
    })
  }
}

export const isTransparentPbrMaterial = (material: PBRMaterial) => {
  const mode = material.transparencyMode

  return (
    material.alpha < 0.999 ||
    mode === Material.MATERIAL_ALPHABLEND ||
    mode === Material.MATERIAL_ALPHATESTANDBLEND ||
    material.subSurface.isRefractionEnabled
  )
}

export const isTransparentMaterial = (material: unknown) => {
  if (material instanceof PBRMaterial) {
    return isTransparentPbrMaterial(material)
  }

  if (material instanceof MultiMaterial) {
    return material.subMaterials.some(
      (subMaterial) => subMaterial instanceof PBRMaterial && isTransparentPbrMaterial(subMaterial),
    )
  }

  return false
}

export const isTransparentMesh = (mesh: AbstractMesh) => {
  return mesh.visibility < 0.999 || isTransparentMaterial(mesh.material)
}

export const getMeshesUsingPbrMaterial = (material: PBRMaterial, meshes: AbstractMesh[]) => {
  return meshes.filter((mesh) => {
    if (mesh.material === material) {
      return true
    }

    return mesh.material instanceof MultiMaterial && mesh.material.subMaterials.includes(material)
  })
}
