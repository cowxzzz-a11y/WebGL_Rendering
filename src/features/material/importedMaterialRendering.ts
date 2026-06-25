import { Engine } from '@babylonjs/core/Engines/engine'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { isTransparentPbrMaterial } from './materialUtils'
import { clamp } from '../../utils/math'

const isArchitecturalGlassMaterial = (material: PBRMaterial) => {
  const name = material.name.toLowerCase()

  return name.includes('glass') || name.includes('window') || name.includes('\u73bb\u7483')
}

const hasPbrAlphaTexture = (material: PBRMaterial) =>
  Boolean(material.opacityTexture || (material.albedoTexture && material.albedoTexture.hasAlpha))

const isFoliageLikeMaterial = (material: PBRMaterial) => {
  const name = material.name.toLowerCase()

  return (
    name.includes('leaf') ||
    name.includes('leaves') ||
    name.includes('foliage') ||
    name.includes('tree') ||
    name.includes('branch') ||
    name.includes('\u53f6') ||
    name.includes('\u6811')
  )
}

const isAlphaCutoutPbrMaterial = (material: PBRMaterial) =>
  !isArchitecturalGlassMaterial(material) &&
  !material.subSurface.isRefractionEnabled &&
  (
    material.transparencyMode === Material.MATERIAL_ALPHATEST ||
    (hasPbrAlphaTexture(material) && (material.alpha >= 0.999 || isFoliageLikeMaterial(material)))
  )

const normalizeImportedAlphaCutoutMaterial = (material: PBRMaterial) => {
  if (!isAlphaCutoutPbrMaterial(material)) {
    return
  }

  if (material.albedoTexture?.hasAlpha) {
    material.useAlphaFromAlbedoTexture = true
  }

  material.alpha = 1
  material.alphaCutOff = clamp(material.alphaCutOff || 0.4, 0.25, 0.55)
  material.transparencyMode = Material.MATERIAL_ALPHATEST
  material.backFaceCulling = false
  material.twoSidedLighting = true
  material.needDepthPrePass = false
  material.separateCullingPass = false
  material.forceDepthWrite = true
  material.markAsDirty(Material.MiscDirtyFlag | Material.TextureDirtyFlag)
}

const normalizeImportedMaterialTransparency = (material: PBRMaterial) => {
  const hasAlphaTexture = hasPbrAlphaTexture(material)
  const looksOpaque =
    material.alpha >= 0.999 &&
    !hasAlphaTexture &&
    !material.subSurface.isRefractionEnabled &&
    material.transparencyMode === Material.MATERIAL_ALPHABLEND

  if (!looksOpaque) {
    return
  }

  material.transparencyMode = Material.MATERIAL_OPAQUE
  material.needDepthPrePass = false
  material.separateCullingPass = false
  material.forceDepthWrite = true
  material.markAsDirty(Material.MiscDirtyFlag | Material.TextureDirtyFlag)
}

const normalizeImportedGlassMaterial = (material: PBRMaterial) => {
  const looksLikeGlass = isArchitecturalGlassMaterial(material) || material.subSurface.isRefractionEnabled

  if (!looksLikeGlass) {
    return
  }

  material.subSurface.isRefractionEnabled = true
  material.subSurface.refractionIntensity = Math.max(material.subSurface.refractionIntensity, 0.35)
  material.subSurface.isTranslucencyEnabled = false
  material.subSurface.isScatteringEnabled = false
  material.alpha = Math.min(material.alpha, 0.88)
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.alphaMode = Engine.ALPHA_COMBINE
  material.albedoColor = new Color3(0.08, 0.12, 0.16)
  material.roughness = Math.min(material.roughness ?? 0.18, 0.18)
  material.metallic = 0
  material.environmentIntensity = Math.max(material.environmentIntensity, 1.8)
  material.specularIntensity = Math.max(material.specularIntensity, 1)
  material.needDepthPrePass = false
  material.separateCullingPass = false
  material.forceDepthWrite = false
  syncImportedGlassEnvironmentTexture(material)
  material.markAsDirty(Material.MiscDirtyFlag | Material.TextureDirtyFlag)
}

export const syncImportedGlassEnvironmentTexture = (
  material: PBRMaterial,
  environmentTexture: BaseTexture | null = material.getScene().environmentTexture,
) => {
  const looksLikeGlass = isArchitecturalGlassMaterial(material) || material.subSurface.isRefractionEnabled

  if (!looksLikeGlass) {
    return
  }

  material.reflectionTexture = environmentTexture?.isReady() ? environmentTexture : null
  material.subSurface.refractionTexture = null
  material.subSurface.linkRefractionWithTransparency = false
  material.markAsDirty(Material.MiscDirtyFlag | Material.TextureDirtyFlag)
}

export const syncImportedMaterialRenderingState = (material: PBRMaterial) => {
  if (isAlphaCutoutPbrMaterial(material)) {
    material.needDepthPrePass = false
    material.separateCullingPass = false
    material.forceDepthWrite = true
    material.twoSidedLighting = !material.backFaceCulling
    return
  }

  const transparent = isTransparentPbrMaterial(material)
  const glass = isArchitecturalGlassMaterial(material) && transparent

  material.needDepthPrePass = transparent && !glass
  material.separateCullingPass = transparent && !glass
  material.forceDepthWrite = false
  material.twoSidedLighting = !material.backFaceCulling
}

export const tuneImportedMaterial = (material: PBRMaterial) => {
  normalizeImportedGlassMaterial(material)
  normalizeImportedAlphaCutoutMaterial(material)
  normalizeImportedMaterialTransparency(material)

  const transparent = isTransparentPbrMaterial(material)

  material.maxSimultaneousLights = 4
  material.directIntensity = transparent ? Math.max(material.directIntensity, 0.8) : 1
  material.environmentIntensity = transparent ? Math.max(material.environmentIntensity, 1.1) : 0.55
  material.specularIntensity = transparent ? Math.max(material.specularIntensity, 0.75) : 0.45
  material.backFaceCulling = false

  if (!transparent && (material.roughness === null || material.roughness === undefined)) {
    material.roughness = 0.78
  }
  syncImportedMaterialRenderingState(material)
}
