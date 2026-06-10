import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import type { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import { tuneTouchCameraControls } from '../../core/camera'
import type { ClassicPipeline } from '../../core/pipeline'
import { desktopPanningSensibility, mobilePanningSensibility, viewerConfigVersion } from '../../shared/constants'
import type { EnvironmentController } from '../environment/environmentController'
import { getMaterialKey, getMeshKey } from '../model/modelIdentity'
import { assignColor3, assignVector, colorToConfig, vectorToConfig } from './configMapping'
import { configStorageKey, type ViewerConfig } from './viewerConfig'

export type ApplyViewerConfigOptions = {
  includeCamera?: boolean
  includeMaterials?: boolean
  includeMeshes?: boolean
}

type ViewerConfigRuntime = {
  scene: Scene
  camera: ArcRotateCamera
  imageProcessing: ImageProcessingConfiguration
  pipeline: ClassicPipeline
  hemiLight: HemisphericLight
  sunLight: DirectionalLight
  environmentController: EnvironmentController
  getImportedMeshes: () => AbstractMesh[]
  getCurrentModelSignature: () => string | null
  getShadowMapSize: () => number
  getShadowBias: () => number
  applyShadowConfig: (shadowMapSize: number, shadowBias: number) => void
  resetLightHelpers: () => void
  updateSceneBoundsFromCurrentModels: () => void
  updateGBufferRenderList: () => void
  updateLightDirectionHelpers: () => void
  refreshSelectedDetail: () => void
}

export const createViewerConfigSnapshot = ({
  scene,
  camera,
  imageProcessing,
  pipeline,
  hemiLight,
  sunLight,
  environmentController,
  getImportedMeshes,
  getCurrentModelSignature,
  getShadowMapSize,
  getShadowBias,
}: ViewerConfigRuntime): ViewerConfig => {
  const importedMeshes = getImportedMeshes()
  const materials: ViewerConfig['materials'] = {}
  const meshes: ViewerConfig['meshes'] = {}

  scene.materials.forEach((material) => {
    if (material instanceof PBRMaterial) {
      materials[getMaterialKey(material, importedMeshes)] = {
        alpha: material.alpha,
        metallic: material.metallic ?? null,
        roughness: material.roughness ?? null,
        albedoColor: colorToConfig(material.albedoColor),
        emissiveColor: colorToConfig(material.emissiveColor),
        directIntensity: material.directIntensity,
        environmentIntensity: material.environmentIntensity,
        specularIntensity: material.specularIntensity,
        maxSimultaneousLights: material.maxSimultaneousLights,
        refractionEnabled: material.subSurface.isRefractionEnabled,
        refractionIntensity: material.subSurface.refractionIntensity,
        translucencyEnabled: material.subSurface.isTranslucencyEnabled,
        translucencyIntensity: material.subSurface.translucencyIntensity,
        scatteringEnabled: material.subSurface.isScatteringEnabled,
        indexOfRefraction: material.subSurface.indexOfRefraction,
      }
    }
  })

  importedMeshes.forEach((mesh) => {
    meshes[getMeshKey(mesh)] = {
      isVisible: mesh.isVisible,
      visibility: mesh.visibility,
      receiveShadows: mesh.receiveShadows,
      position: vectorToConfig(mesh.position),
      rotation: vectorToConfig(mesh.rotation),
      scaling: vectorToConfig(mesh.scaling),
    }
  })

  const environmentState = environmentController.getState()

  return {
    configVersion: viewerConfigVersion,
    modelSignature: getCurrentModelSignature(),
    camera: {
      fov: camera.fov,
      radius: camera.radius,
      alpha: camera.alpha,
      beta: camera.beta,
      target: vectorToConfig(camera.target),
      wheelPrecision: camera.wheelPrecision,
      panningSensibility: camera.panningSensibility,
    },
    lights: {
      hemi: {
        intensity: hemiLight.intensity,
        diffuse: colorToConfig(hemiLight.diffuse),
        groundColor: colorToConfig(hemiLight.groundColor),
        direction: vectorToConfig(hemiLight.direction),
        helperVisible: false,
      },
      sun: {
        intensity: sunLight.intensity,
        diffuse: colorToConfig(sunLight.diffuse),
        specular: colorToConfig(sunLight.specular),
        direction: vectorToConfig(sunLight.direction),
        position: vectorToConfig(sunLight.position),
        helperVisible: false,
        shadowMapSize: getShadowMapSize(),
        shadowBias: getShadowBias(),
      },
    },
    world: {
      environmentTexture: environmentState.selectedEnvironmentKey ?? undefined,
      environmentBackgroundEnabled: environmentState.environmentBackgroundEnabled,
      environmentRotationY: environmentState.environmentRotationY,
      environmentIntensity: environmentState.globalEnvironmentIntensity,
      clearColor: colorToConfig(scene.clearColor),
      exposure: imageProcessing.exposure,
      contrast: imageProcessing.contrast,
      ditheringEnabled: imageProcessing.ditheringEnabled,
      toneMappingEnabled: imageProcessing.toneMappingEnabled,
    },
    pipeline: {
      samples: pipeline.samples,
      fxaaEnabled: pipeline.fxaaEnabled,
      bloomEnabled: pipeline.bloomEnabled,
      sharpenEnabled: pipeline.sharpenEnabled,
      grainEnabled: pipeline.grainEnabled,
    },
    materials,
    meshes,
  }
}

export const applyViewerConfigSnapshot = (
  runtime: ViewerConfigRuntime,
  config: ViewerConfig,
  {
    includeCamera = true,
    includeMaterials = true,
    includeMeshes = true,
  }: ApplyViewerConfigOptions = {},
) => {
  const {
    scene,
    camera,
    imageProcessing,
    pipeline,
    hemiLight,
    sunLight,
    environmentController,
    getImportedMeshes,
    applyShadowConfig,
    resetLightHelpers,
    updateSceneBoundsFromCurrentModels,
    updateGBufferRenderList,
    updateLightDirectionHelpers,
    refreshSelectedDetail,
  } = runtime
  const importedMeshes = getImportedMeshes()

  if (includeCamera) {
    camera.fov = config.camera.fov
    camera.radius = config.camera.radius
    camera.alpha = config.camera.alpha
    camera.beta = config.camera.beta
    assignVector(camera.target, config.camera.target)
    camera.wheelPrecision = config.camera.wheelPrecision
    camera.panningSensibility = config.camera.panningSensibility
    tuneTouchCameraControls({
      camera,
      desktopPanningSensibility,
      mobilePanningSensibility,
    })
  }

  hemiLight.intensity = config.lights.hemi.intensity
  assignColor3(hemiLight.diffuse, config.lights.hemi.diffuse)
  assignColor3(hemiLight.groundColor, config.lights.hemi.groundColor)
  assignVector(hemiLight.direction, config.lights.hemi.direction)

  sunLight.intensity = config.lights.sun.intensity
  assignColor3(sunLight.diffuse, config.lights.sun.diffuse)
  assignColor3(sunLight.specular, config.lights.sun.specular)
  assignVector(sunLight.direction, config.lights.sun.direction)
  assignVector(sunLight.position, config.lights.sun.position)
  resetLightHelpers()

  if ('shadowMapSize' in config.lights.sun) {
    applyShadowConfig(config.lights.sun.shadowMapSize, config.lights.sun.shadowBias)
  }

  if (config.world.environmentTexture) {
    void environmentController.setSceneEnvironmentTexture(config.world.environmentTexture)
  }

  environmentController.setEnvironmentBackgroundEnabled(config.world.environmentBackgroundEnabled ?? false)
  environmentController.setEnvironmentRotationY(config.world.environmentRotationY ?? 0)
  environmentController.updateEnvironmentBackground()
  environmentController.applyEnvironmentRotation()
  environmentController.setGlobalEnvironmentIntensity(config.world.environmentIntensity)
  scene.clearColor = new Color4(config.world.clearColor[0], config.world.clearColor[1], config.world.clearColor[2], 1)
  imageProcessing.exposure = config.world.exposure
  imageProcessing.contrast = config.world.contrast
  imageProcessing.ditheringEnabled = config.world.ditheringEnabled
  imageProcessing.toneMappingEnabled = config.world.toneMappingEnabled
  pipeline.imageProcessing.exposure = config.world.exposure
  pipeline.imageProcessing.contrast = config.world.contrast
  pipeline.imageProcessing.ditheringEnabled = config.world.ditheringEnabled
  pipeline.imageProcessing.toneMappingEnabled = config.world.toneMappingEnabled

  pipeline.samples = config.pipeline.samples
  pipeline.fxaaEnabled = config.pipeline.fxaaEnabled
  pipeline.bloomEnabled = config.pipeline.bloomEnabled
  pipeline.sharpenEnabled = config.pipeline.sharpenEnabled
  pipeline.grainEnabled = config.pipeline.grainEnabled

  if (includeMaterials) {
    scene.materials.forEach((material) => {
      if (!(material instanceof PBRMaterial)) {
        return
      }

      const materialConfig = config.materials[getMaterialKey(material, importedMeshes)]

      if (!materialConfig) {
        return
      }

      material.alpha = materialConfig.alpha
      material.metallic = materialConfig.metallic
      material.roughness = materialConfig.roughness
      assignColor3(material.albedoColor, materialConfig.albedoColor)
      assignColor3(material.emissiveColor, materialConfig.emissiveColor)
      material.directIntensity = materialConfig.directIntensity
      material.environmentIntensity = materialConfig.environmentIntensity
      material.specularIntensity = materialConfig.specularIntensity
      material.maxSimultaneousLights = materialConfig.maxSimultaneousLights
      material.subSurface.isRefractionEnabled = materialConfig.refractionEnabled ?? material.subSurface.isRefractionEnabled
      material.subSurface.refractionIntensity = materialConfig.refractionIntensity ?? material.subSurface.refractionIntensity
      material.subSurface.isTranslucencyEnabled = materialConfig.translucencyEnabled ?? material.subSurface.isTranslucencyEnabled
      material.subSurface.translucencyIntensity = materialConfig.translucencyIntensity ?? material.subSurface.translucencyIntensity
      material.subSurface.isScatteringEnabled = materialConfig.scatteringEnabled ?? material.subSurface.isScatteringEnabled
      material.subSurface.indexOfRefraction = materialConfig.indexOfRefraction ?? material.subSurface.indexOfRefraction
    })
  }

  if (includeMeshes) {
    importedMeshes.forEach((mesh) => {
      const meshConfig = config.meshes[getMeshKey(mesh)]

      if (!meshConfig) {
        return
      }

      mesh.isVisible = meshConfig.isVisible
      mesh.visibility = meshConfig.visibility
      mesh.receiveShadows = meshConfig.receiveShadows
      assignVector(mesh.position, meshConfig.position)
      assignVector(mesh.rotation, meshConfig.rotation)
      assignVector(mesh.scaling, meshConfig.scaling)
    })
  }

  updateSceneBoundsFromCurrentModels()
  updateGBufferRenderList()
  updateLightDirectionHelpers()
  refreshSelectedDetail()
}

export const loadStoredViewerConfig = (storage: Storage = window.localStorage) => {
  const rawConfig = storage.getItem(configStorageKey)

  if (!rawConfig) {
    return null
  }

  try {
    return JSON.parse(rawConfig) as ViewerConfig
  } catch {
    return null
  }
}
