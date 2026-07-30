import { Material } from '@babylonjs/core/Materials/material'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { Scene } from '@babylonjs/core/scene'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type {
  ResolvedProjectPbrTextureRule,
  ResolvedProjectPbrTextureSet,
} from './projectAssets'

const stableHash = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createProjectTexture = (
  scene: Scene,
  url: string,
  fileName: string,
  gammaSpace: boolean,
  uvScaleU: number,
  uvScaleV: number,
) => {
  const texture = new Texture(url, scene, {
    noMipmap: false,
    invertY: false,
    samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
    gammaSpace,
  })
  texture.name = fileName
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  texture.uScale = uvScaleU
  texture.vScale = uvScaleV
  return texture
}

const applyTextureSet = (
  scene: Scene,
  mesh: AbstractMesh,
  material: PBRMaterial,
  textureSet: ResolvedProjectPbrTextureSet,
  rule: ResolvedProjectPbrTextureRule,
) => {
  const albedoTexture = createProjectTexture(
    scene,
    textureSet.albedoUrl,
    textureSet.albedoFileName,
    true,
    rule.uvScaleU,
    rule.uvScaleV,
  )
  material.albedoTexture = albedoTexture

  if (textureSet.normalUrl && textureSet.normalFileName) {
    material.bumpTexture = createProjectTexture(
      scene,
      textureSet.normalUrl,
      textureSet.normalFileName,
      false,
      rule.uvScaleU,
      rule.uvScaleV,
    )
  }

  if (textureSet.armUrl && textureSet.armFileName) {
    material.metallicTexture = createProjectTexture(
      scene,
      textureSet.armUrl,
      textureSet.armFileName,
      false,
      rule.uvScaleU,
      rule.uvScaleV,
    )
    material.useAmbientOcclusionFromMetallicTextureRed = true
    material.useRoughnessFromMetallicTextureGreen = true
    material.useMetallnessFromMetallicTextureBlue = true
    material.useRoughnessFromMetallicTextureAlpha = false
  }

  const params = material.metadata?.ditherFadeParams as
    | { uvScaleU?: number, uvScaleV?: number }
    | undefined
  const plugin = material.metadata?.ditherFadePlugin as
    | { uvScaleU?: number, uvScaleV?: number }
    | undefined
  if (params) {
    params.uvScaleU = rule.uvScaleU
    params.uvScaleV = rule.uvScaleV
  }
  if (plugin) {
    plugin.uvScaleU = rule.uvScaleU
    plugin.uvScaleV = rule.uvScaleV
  }

  material.metadata = {
    ...material.metadata,
    projectPbrTextureSet: textureSet.id,
    projectPbrTextureMesh: mesh.name,
  }
  material.markAsDirty(Material.TextureDirtyFlag)
}

export const applyProjectPbrTextureRules = ({
  scene,
  rules,
  modelRoots,
  modelFileNames,
  getMeshesForRoot,
}: {
  scene: Scene
  rules: ResolvedProjectPbrTextureRule[]
  modelRoots: TransformNode[]
  modelFileNames: string[]
  getMeshesForRoot: (root: TransformNode) => AbstractMesh[]
}) => {
  let applied = 0

  rules.forEach((rule) => {
    modelRoots.forEach((root, modelIndex) => {
      const modelFileName = modelFileNames[modelIndex] ?? root.name
      if (rule.model && modelFileName.toLocaleLowerCase() !== rule.model.toLocaleLowerCase()) {
        return
      }

      const matchingMeshes = getMeshesForRoot(root).filter((mesh) =>
        mesh.name.includes(rule.meshIncludes) && mesh.material instanceof PBRMaterial
      )

      matchingMeshes.forEach((mesh, meshIndex) => {
        if (!(mesh.material instanceof PBRMaterial)) return
        const textureSetIndex = rule.distribution === 'alternating'
          ? (meshIndex + rule.seed) % rule.textureSets.length
          : stableHash(`${rule.seed}:${modelFileName}:${mesh.name}`) % rule.textureSets.length
        const textureSet = rule.textureSets[textureSetIndex]
        applyTextureSet(scene, mesh, mesh.material, textureSet, rule)
        applied += 1
      })
    })
  })

  return applied
}
