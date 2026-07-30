import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Material } from '@babylonjs/core/Materials/material'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { DetailDescriptor } from '../../../../shared/types'
import { checkboxItem, colorItem, numberItem, textItem, textureItem } from '../../../../ui/detailPanel'

const materialKey = 'viewer.content.material.standardPbr'

type PbrTextureSlot = 'albedo' | 'normal' | 'metallicRoughness' | 'ambientOcclusion' | 'emissive'

type UploadedTextureRecord = {
  texture: Texture
  url: string
  fileName: string
}

type StandardPbrParams = {
  uvScaleU: number
  uvScaleV: number
  normalStrength: number
  ambientOcclusionStrength: number
}

const getReferenceTexture = (material: PBRMaterial) =>
  material.albedoTexture ??
  material.bumpTexture ??
  material.metallicTexture ??
  material.ambientTexture ??
  material.emissiveTexture

const getParams = (material: PBRMaterial): StandardPbrParams => {
  material.metadata = material.metadata || {}
  if (!material.metadata.standardPbrParams) {
    const reference = getReferenceTexture(material)
    material.metadata.standardPbrParams = {
      uvScaleU: reference instanceof Texture ? reference.uScale : 0.06,
      uvScaleV: reference instanceof Texture ? reference.vScale : 0.06,
      normalStrength: material.bumpTexture?.level ?? 1,
      ambientOcclusionStrength: material.ambientTextureStrength,
    } satisfies StandardPbrParams
  }
  return material.metadata.standardPbrParams as StandardPbrParams
}

const getPbrTextures = (material: PBRMaterial) => [
  material.albedoTexture,
  material.bumpTexture,
  material.metallicTexture,
  material.ambientTexture,
  material.emissiveTexture,
].filter((texture): texture is Texture => texture instanceof Texture)

const applyTextureParams = (material: PBRMaterial, params: StandardPbrParams) => {
  getPbrTextures(material).forEach((texture) => {
    texture.uScale = params.uvScaleU
    texture.vScale = params.uvScaleV
  })
  if (material.bumpTexture) material.bumpTexture.level = params.normalStrength
  material.ambientTextureStrength = params.ambientOcclusionStrength
  material.markAsDirty(Material.TextureDirtyFlag | Material.MiscDirtyFlag)
}

const getUploadedTextures = (material: PBRMaterial) => {
  material.metadata = material.metadata || {}
  material.metadata.standardPbrUploadedTextures ??= {}
  return material.metadata.standardPbrUploadedTextures as Partial<Record<PbrTextureSlot, UploadedTextureRecord>>
}

const getTextureForSlot = (material: PBRMaterial, slot: PbrTextureSlot) => {
  if (slot === 'albedo') return material.albedoTexture
  if (slot === 'normal') return material.bumpTexture
  if (slot === 'metallicRoughness') return material.metallicTexture
  if (slot === 'ambientOcclusion') return material.ambientTexture
  return material.emissiveTexture
}

const setTextureForSlot = (material: PBRMaterial, slot: PbrTextureSlot, texture: Texture | null) => {
  if (slot === 'albedo') material.albedoTexture = texture
  if (slot === 'normal') material.bumpTexture = texture
  if (slot === 'metallicRoughness') material.metallicTexture = texture
  if (slot === 'ambientOcclusion') material.ambientTexture = texture
  if (slot === 'emissive') material.emissiveTexture = texture
  material.markAsDirty(Material.TextureDirtyFlag)
}

const releaseUploadedTexture = (material: PBRMaterial, slot: PbrTextureSlot) => {
  const uploaded = getUploadedTextures(material)
  const record = uploaded[slot]
  if (!record) return
  record.texture.dispose()
  URL.revokeObjectURL(record.url)
  delete uploaded[slot]
}

const uploadTexture = (
  material: PBRMaterial,
  params: StandardPbrParams,
  slot: PbrTextureSlot,
  file: File,
) => {
  releaseUploadedTexture(material, slot)
  const url = URL.createObjectURL(file)
  const extensionMatch = file.name.toLowerCase().match(/(\.[a-z0-9]+)$/)
  const texture = new Texture(url, material.getScene(), {
    noMipmap: false,
    invertY: false,
    samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
    mimeType: file.type || undefined,
    forcedExtension: extensionMatch?.[1],
    gammaSpace: slot === 'albedo' || slot === 'emissive',
  })
  texture.name = file.name
  texture.uScale = params.uvScaleU
  texture.vScale = params.uvScaleV
  if (slot === 'normal') texture.level = params.normalStrength
  if (slot === 'metallicRoughness') {
    material.useMetallnessFromMetallicTextureBlue = true
    material.useRoughnessFromMetallicTextureGreen = true
    material.useRoughnessFromMetallicTextureAlpha = false
  }
  getUploadedTextures(material)[slot] = { texture, url, fileName: file.name }
  setTextureForSlot(material, slot, texture)
}

const createTextureDetailItem = (
  material: PBRMaterial,
  params: StandardPbrParams,
  label: string,
  slot: PbrTextureSlot,
) => {
  const uploaded = getUploadedTextures(material)[slot]
  const texture = getTextureForSlot(material, slot)
  const fileName = uploaded?.fileName ?? texture?.name ?? null
  const previewUrl = uploaded?.url ?? (texture instanceof Texture ? texture.url : null)
  return textureItem(
    label,
    fileName,
    previewUrl,
    (file) => uploadTexture(material, params, slot, file),
    () => {
      releaseUploadedTexture(material, slot)
      setTextureForSlot(material, slot, null)
    },
  )
}

const copyPbrSurface = (source: PBRMaterial, target: PBRMaterial) => {
  target.albedoColor.copyFrom(source.albedoColor)
  target.emissiveColor.copyFrom(source.emissiveColor)
  target.reflectivityColor.copyFrom(source.reflectivityColor)
  target.alpha = source.alpha
  target.metallic = source.metallic
  target.roughness = source.roughness
  target.albedoTexture = source.albedoTexture
  target.bumpTexture = source.bumpTexture
  target.metallicTexture = source.metallicTexture
  target.ambientTexture = source.ambientTexture
  target.emissiveTexture = source.emissiveTexture
  target.opacityTexture = source.opacityTexture
  target.reflectionTexture = source.reflectionTexture
  target.useAlphaFromAlbedoTexture = source.useAlphaFromAlbedoTexture
  target.useMetallnessFromMetallicTextureBlue = source.useMetallnessFromMetallicTextureBlue
  target.useRoughnessFromMetallicTextureGreen = source.useRoughnessFromMetallicTextureGreen
  target.useRoughnessFromMetallicTextureAlpha = source.useRoughnessFromMetallicTextureAlpha
  target.ambientTextureStrength = source.ambientTextureStrength
  target.directIntensity = source.directIntensity
  target.environmentIntensity = source.environmentIntensity
  target.specularIntensity = source.specularIntensity
  target.maxSimultaneousLights = source.maxSimultaneousLights
  target.backFaceCulling = source.backFaceCulling
  target.twoSidedLighting = source.twoSidedLighting
  target.transparencyMode = source.transparencyMode
  target.alphaCutOff = source.alphaCutOff
}

export const markAsStandardPbrMaterial = (material: PBRMaterial) => {
  if (material.metadata?.contentMaterial === 'viewer.content.material.ditherFade') {
    return material
  }
  material.metadata = {
    ...material.metadata,
    contentMaterial: materialKey,
    originalMaterialName: material.metadata?.originalMaterialName ?? material.name,
  }
  getParams(material)
  return material
}

export const isStandardPbrMaterial = (
  material: AbstractMesh['material'],
): material is PBRMaterial =>
  material instanceof PBRMaterial &&
  material.metadata?.contentMaterial === materialKey

export const applyStandardPbrMaterial = ({
  scene,
  mesh,
}: {
  scene: Scene
  mesh: AbstractMesh
}) => {
  const previousMaterial = mesh.material

  const createMaterial = (source: Material | null) => {
    let material: PBRMaterial
    if (
      source instanceof PBRMaterial &&
      source.metadata?.contentMaterial !== 'viewer.content.material.ditherFade'
    ) {
      material = source
    } else {
      material = new PBRMaterial('\u6807\u51c6PBR\u6750\u8d28', scene)
      if (source instanceof PBRMaterial) {
        copyPbrSurface(source, material)
      } else {
        material.albedoColor = new Color3(0.8, 0.8, 0.8)
        material.metallic = 0
        material.roughness = 0.5
        material.environmentIntensity = 1
      }
    }

    markAsStandardPbrMaterial(material)
    applyTextureParams(material, getParams(material))
    return material
  }

  if (previousMaterial instanceof MultiMaterial) {
    const converted = previousMaterial.clone(`${previousMaterial.name}_PBR`)
    converted.subMaterials = previousMaterial.subMaterials.map((subMaterial) =>
      subMaterial instanceof Material ? createMaterial(subMaterial) : null
    )
    mesh.material = converted
    return converted
  }

  const material = createMaterial(previousMaterial)
  mesh.material = material
  return material
}

export const createStandardPbrMaterialDetail = (
  material: PBRMaterial,
  refreshImportedRenderingState: () => void,
): DetailDescriptor => {
  const params = getParams(material)
  const updateTextureNumber = (key: keyof StandardPbrParams) => (value: number) => {
    params[key] = value
    applyTextureParams(material, params)
  }

  return {
    title: material.name || '\u6807\u51c6PBR\u6750\u8d28',
    kind: '\u6807\u51c6PBR\u6750\u8d28',
    sections: [
      {
        title: 'PBR \u57fa\u7840',
        items: [
          numberItem('\u900f\u660e\u5ea6', material.alpha, 0, 1, 0.01, (value) => {
            material.alpha = value
            material.markAsDirty(Material.MiscDirtyFlag)
            refreshImportedRenderingState()
          }),
          colorItem('\u57fa\u7840\u989c\u8272', material.albedoColor, (value) => {
            material.albedoColor = value
            material.markAsDirty(Material.MiscDirtyFlag)
          }),
          colorItem('\u81ea\u53d1\u5149\u989c\u8272', material.emissiveColor, (value) => {
            material.emissiveColor = value
            material.markAsDirty(Material.MiscDirtyFlag)
          }),
          numberItem('\u91d1\u5c5e\u5ea6', material.metallic ?? 0, 0, 1, 0.01, (value) => {
            material.metallic = value
            material.markAsDirty(Material.MiscDirtyFlag)
          }),
          numberItem('\u7c97\u7cd9\u5ea6', material.roughness ?? 0.5, 0, 1, 0.01, (value) => {
            material.roughness = value
            material.markAsDirty(Material.MiscDirtyFlag)
          }),
          numberItem('\u73af\u5883\u4eae\u5ea6', material.environmentIntensity, 0, 5, 0.01, (value) => {
            material.environmentIntensity = value
            material.markAsDirty(Material.MiscDirtyFlag)
          }),
          numberItem('\u76f4\u63a5\u5149\u7167', material.directIntensity, 0, 2, 0.01, (value) => {
            material.directIntensity = value
            material.markAsDirty(Material.MiscDirtyFlag)
          }),
          numberItem('\u9ad8\u5149\u5f3a\u5ea6', material.specularIntensity, 0, 2, 0.01, (value) => {
            material.specularIntensity = value
            material.markAsDirty(Material.MiscDirtyFlag)
          }),
          checkboxItem('\u53cc\u9762\u6e32\u67d3', !material.backFaceCulling, (value) => {
            material.backFaceCulling = !value
            material.twoSidedLighting = value
            material.markAsDirty(Material.MiscDirtyFlag)
            refreshImportedRenderingState()
          }),
        ],
      },
      {
        title: 'PBR \u8d34\u56fe',
        items: [
          createTextureDetailItem(material, params, '\u57fa\u7840\u989c\u8272', 'albedo'),
          createTextureDetailItem(material, params, '\u6cd5\u7ebf', 'normal'),
          createTextureDetailItem(material, params, '\u91d1\u5c5e/\u7c97\u7cd9\u5ea6', 'metallicRoughness'),
          createTextureDetailItem(material, params, '\u73af\u5883\u906e\u853d AO', 'ambientOcclusion'),
          createTextureDetailItem(material, params, '\u81ea\u53d1\u5149', 'emissive'),
          numberItem('\u6cd5\u7ebf\u5f3a\u5ea6', params.normalStrength, 0, 3, 0.01, updateTextureNumber('normalStrength')),
          numberItem('AO \u5f3a\u5ea6', params.ambientOcclusionStrength, 0, 2, 0.01, updateTextureNumber('ambientOcclusionStrength')),
          numberItem('U', params.uvScaleU, 0.01, 50, 0.01, updateTextureNumber('uvScaleU')),
          numberItem('V', params.uvScaleV, 0.01, 50, 0.01, updateTextureNumber('uvScaleV')),
        ],
      },
      {
        title: '\u6765\u6e90',
        items: [
          textItem('\u7c7b\u578b', 'material.pbr'),
          textItem('\u539f\u6750\u8d28', material.metadata?.originalMaterialName ?? material.name),
        ],
      },
    ],
  }
}
