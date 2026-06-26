import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import type { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import type { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import { tuneTouchCameraControls } from '../../core/camera'
import type { ClassicPipeline } from '../../core/pipeline'
import { viewerConfigVersion } from '../../shared/constants'
import type { EnvironmentController } from '../environment/environmentController'
import { getMaterialKey, getMeshKey } from '../model/modelIdentity'
import { assignColor3, assignVector, colorToConfig, vectorToConfig } from './configMapping'
import { configStorageKey, type ViewerConfig, type ViewerProjectConfigInput } from './viewerConfig'

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
  getSceneCenter: () => Vector3
  getSceneRadius: () => number
  getShadowMapSize: () => number
  getShadowBias: () => number
  applyShadowConfig: (shadowMapSize: number, shadowBias: number) => void
  getRealtimeEffectsEnabled: () => boolean
  setRealtimeEffectsEnabled: (value: boolean) => void
  setSavedSunIntensity: (value: number) => void
  getShadowEnabled: () => boolean
  setShadowEnabled: (value: boolean) => void
  getShadowFilterMode: () => number
  setShadowFilterMode: (value: number) => void
  getSsaoEnabled: () => boolean
  setSsaoEnabled: (value: boolean) => void
  getSsaoStrength: () => number
  setSsaoStrength: (value: number) => void
  getSsaoRadius: () => number
  setSsaoRadius: (value: number) => void
  getSsaoSamples: () => number
  setSsaoSamples: (value: number) => void
  applyRealtimeEffectsState: () => void
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
  getRealtimeEffectsEnabled,
  getShadowEnabled,
  getShadowFilterMode,
  getSsaoEnabled,
  getSsaoStrength,
  getSsaoRadius,
  getSsaoSamples,
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
    rendering: {
      realtimeEffectsEnabled: getRealtimeEffectsEnabled(),
      shadowEnabled: getShadowEnabled(),
      shadowFilterMode: getShadowFilterMode(),
      ssaoEnabled: getSsaoEnabled(),
      ssaoStrength: getSsaoStrength(),
      ssaoRadius: getSsaoRadius(),
      ssaoSamples: getSsaoSamples(),
    },
    materials,
    meshes,
  }
}

export const applyViewerConfigSnapshot = async (
  runtime: ViewerConfigRuntime,
  config: ViewerProjectConfigInput,
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
    getSceneCenter,
    getSceneRadius,
    applyShadowConfig,
    setRealtimeEffectsEnabled,
    setSavedSunIntensity,
    setShadowEnabled,
    setShadowFilterMode,
    setSsaoEnabled,
    setSsaoStrength,
    setSsaoRadius,
    setSsaoSamples,
    applyRealtimeEffectsState,
    resetLightHelpers,
    updateSceneBoundsFromCurrentModels,
    updateGBufferRenderList,
    updateLightDirectionHelpers,
    refreshSelectedDetail,
  } = runtime
  const importedMeshes = getImportedMeshes()
  let shouldApplyRealtimeEffectsState = false

  const cameraConfig = config.camera
  if (includeCamera && cameraConfig) {
    camera.fov = config.cameraFov ?? cameraConfig.fov ?? camera.fov
    camera.radius = config.cameraRadius ?? cameraConfig.radius ?? camera.radius
    camera.alpha = config.cameraAlpha ?? cameraConfig.alpha ?? camera.alpha
    camera.beta = config.cameraBeta ?? cameraConfig.beta ?? camera.beta
    const cameraTarget = config.cameraTarget ?? cameraConfig.target
    if (cameraTarget) {
      assignVector(camera.target, cameraTarget)
    }
    camera.wheelPrecision = config.cameraWheelPrecision ?? cameraConfig.wheelPrecision ?? camera.wheelPrecision
    camera.panningSensibility = config.cameraPanningSensibility ?? cameraConfig.panningSensibility ?? camera.panningSensibility
    tuneTouchCameraControls({
      camera,
      sceneCenter: getSceneCenter(),
      sceneRadius: getSceneRadius(),
    })
  }
  if (includeCamera && !cameraConfig) {
    camera.fov = config.cameraFov ?? camera.fov
    camera.radius = config.cameraRadius ?? camera.radius
    camera.alpha = config.cameraAlpha ?? camera.alpha
    camera.beta = config.cameraBeta ?? camera.beta
    if (config.cameraTarget) {
      assignVector(camera.target, config.cameraTarget)
    }
    camera.wheelPrecision = config.cameraWheelPrecision ?? camera.wheelPrecision
    camera.panningSensibility = config.cameraPanningSensibility ?? camera.panningSensibility
    if (
      config.cameraFov !== undefined
      || config.cameraRadius !== undefined
      || config.cameraAlpha !== undefined
      || config.cameraBeta !== undefined
      || config.cameraTarget
      || config.cameraWheelPrecision !== undefined
      || config.cameraPanningSensibility !== undefined
    ) {
      tuneTouchCameraControls({
        camera,
        sceneCenter: getSceneCenter(),
        sceneRadius: getSceneRadius(),
      })
    }
  }

  const hemiConfig = config.lights?.hemi
  if (hemiConfig || config.hemiIntensity !== undefined || config.hemiDiffuse || config.hemiGroundColor || config.hemiDirection) {
    hemiLight.intensity = config.hemiIntensity ?? hemiConfig?.intensity ?? hemiLight.intensity
    const hemiDiffuse = config.hemiDiffuse ?? hemiConfig?.diffuse
    const hemiGroundColor = config.hemiGroundColor ?? hemiConfig?.groundColor
    const hemiDirection = config.hemiDirection ?? hemiConfig?.direction
    if (hemiDiffuse) assignColor3(hemiLight.diffuse, hemiDiffuse)
    if (hemiGroundColor) assignColor3(hemiLight.groundColor, hemiGroundColor)
    if (hemiDirection) assignVector(hemiLight.direction, hemiDirection)
  }

  const sunConfig = config.lights?.sun
  if (
    sunConfig
    || config.sunIntensity !== undefined
    || config.sunDiffuse
    || config.sunSpecular
    || config.sunDirection
    || config.sunPosition
    || config.sunShadowMapSize !== undefined
    || config.sunShadowBias !== undefined
  ) {
    sunLight.intensity = config.sunIntensity ?? sunConfig?.intensity ?? sunLight.intensity
    setSavedSunIntensity(sunLight.intensity)
    const sunDiffuse = config.sunDiffuse ?? sunConfig?.diffuse
    const sunSpecular = config.sunSpecular ?? sunConfig?.specular
    const sunDirection = config.sunDirection ?? sunConfig?.direction
    const sunPosition = config.sunPosition ?? sunConfig?.position
    if (sunDiffuse) assignColor3(sunLight.diffuse, sunDiffuse)
    if (sunSpecular) assignColor3(sunLight.specular, sunSpecular)
    if (sunDirection) assignVector(sunLight.direction, sunDirection)
    if (sunPosition) assignVector(sunLight.position, sunPosition)
    resetLightHelpers()

    const sunShadowMapSize = config.sunShadowMapSize ?? sunConfig?.shadowMapSize
    const sunShadowBias = config.sunShadowBias ?? sunConfig?.shadowBias
    if (sunShadowMapSize !== undefined && sunShadowBias !== undefined) {
      applyShadowConfig(sunShadowMapSize, sunShadowBias)
    }
  }

  const worldConfig = config.world
  if (
    worldConfig
    || config.environmentTexture
    || config.environmentBackgroundEnabled !== undefined
    || config.environmentRotationY !== undefined
    || config.environmentIntensity !== undefined
    || config.clearColor
    || config.exposure !== undefined
    || config.contrast !== undefined
    || config.ditheringEnabled !== undefined
    || config.toneMappingEnabled !== undefined
  ) {
    const environmentBackgroundEnabled = config.environmentBackgroundEnabled ?? worldConfig?.environmentBackgroundEnabled
    const environmentRotationY = config.environmentRotationY ?? worldConfig?.environmentRotationY
    const environmentIntensity = config.environmentIntensity ?? worldConfig?.environmentIntensity
    const environmentTexture = config.environmentTexture ?? worldConfig?.environmentTexture
    const clearColor = config.clearColor ?? worldConfig?.clearColor
    const exposure = config.exposure ?? worldConfig?.exposure
    const contrast = config.contrast ?? worldConfig?.contrast
    const ditheringEnabled = config.ditheringEnabled ?? worldConfig?.ditheringEnabled
    const toneMappingEnabled = config.toneMappingEnabled ?? worldConfig?.toneMappingEnabled

    if (environmentBackgroundEnabled !== undefined) {
      environmentController.setEnvironmentBackgroundEnabled(environmentBackgroundEnabled)
    }
    if (environmentRotationY !== undefined) {
      environmentController.setEnvironmentRotationY(environmentRotationY)
    }
    if (environmentIntensity !== undefined) {
      environmentController.setGlobalEnvironmentIntensity(environmentIntensity)
    }
    if (environmentTexture) {
      await environmentController.setSceneEnvironmentTexture(environmentTexture)
    }
    environmentController.updateEnvironmentBackground()
    environmentController.applyEnvironmentRotation()
    if (clearColor) {
      scene.clearColor = new Color4(clearColor[0], clearColor[1], clearColor[2], 1)
    }
    if (exposure !== undefined) {
      imageProcessing.exposure = exposure
      pipeline.imageProcessing.exposure = exposure
    }
    if (contrast !== undefined) {
      imageProcessing.contrast = contrast
      pipeline.imageProcessing.contrast = contrast
    }
    if (ditheringEnabled !== undefined) {
      imageProcessing.ditheringEnabled = ditheringEnabled
      pipeline.imageProcessing.ditheringEnabled = ditheringEnabled
    }
    if (toneMappingEnabled !== undefined) {
      imageProcessing.toneMappingEnabled = toneMappingEnabled
      pipeline.imageProcessing.toneMappingEnabled = toneMappingEnabled
    }
  }

  const pipelineConfig = config.pipeline
  if (
    pipelineConfig
    || config.samples !== undefined
    || config.fxaaEnabled !== undefined
    || config.bloomEnabled !== undefined
    || config.sharpenEnabled !== undefined
    || config.grainEnabled !== undefined
  ) {
    pipeline.samples = config.samples ?? pipelineConfig?.samples ?? pipeline.samples
    pipeline.fxaaEnabled = config.fxaaEnabled ?? pipelineConfig?.fxaaEnabled ?? pipeline.fxaaEnabled
    pipeline.bloomEnabled = config.bloomEnabled ?? pipelineConfig?.bloomEnabled ?? pipeline.bloomEnabled
    pipeline.sharpenEnabled = config.sharpenEnabled ?? pipelineConfig?.sharpenEnabled ?? pipeline.sharpenEnabled
    pipeline.grainEnabled = config.grainEnabled ?? pipelineConfig?.grainEnabled ?? pipeline.grainEnabled
  }

  const renderingConfig = {
    realtimeEffectsEnabled: config.realtimeEffectsEnabled,
    shadowEnabled: config.shadowEnabled,
    shadowFilterMode: config.shadowFilterMode,
    ssaoEnabled: config.ssaoEnabled,
    ssaoStrength: config.ssaoStrength,
    ssaoRadius: config.ssaoRadius,
    ssaoSamples: config.ssaoSamples,
    ...config.rendering,
  }

  if (Object.values(renderingConfig).some((value) => value !== undefined)) {
    if (renderingConfig.shadowEnabled !== undefined) setShadowEnabled(renderingConfig.shadowEnabled)
    if (renderingConfig.shadowFilterMode !== undefined) setShadowFilterMode(renderingConfig.shadowFilterMode)
    if (renderingConfig.ssaoStrength !== undefined) setSsaoStrength(renderingConfig.ssaoStrength)
    if (renderingConfig.ssaoRadius !== undefined) setSsaoRadius(renderingConfig.ssaoRadius)
    if (renderingConfig.ssaoSamples !== undefined) setSsaoSamples(renderingConfig.ssaoSamples)
    if (renderingConfig.ssaoEnabled !== undefined) setSsaoEnabled(renderingConfig.ssaoEnabled)
    if (renderingConfig.realtimeEffectsEnabled !== undefined) {
      setRealtimeEffectsEnabled(renderingConfig.realtimeEffectsEnabled)
    }
    shouldApplyRealtimeEffectsState = true
  }

  if (includeMaterials) {
    scene.materials.forEach((material) => {
      if (!(material instanceof PBRMaterial)) {
        return
      }

      const materialConfig = config.materials?.[getMaterialKey(material, importedMeshes)]

      if (!materialConfig) {
        return
      }

      material.alpha = materialConfig.alpha ?? material.alpha
      material.metallic = materialConfig.metallic ?? material.metallic
      material.roughness = materialConfig.roughness ?? material.roughness
      if (materialConfig.albedoColor) assignColor3(material.albedoColor, materialConfig.albedoColor)
      if (materialConfig.emissiveColor) assignColor3(material.emissiveColor, materialConfig.emissiveColor)
      material.directIntensity = materialConfig.directIntensity ?? material.directIntensity
      material.environmentIntensity = materialConfig.environmentIntensity ?? material.environmentIntensity
      material.specularIntensity = materialConfig.specularIntensity ?? material.specularIntensity
      material.maxSimultaneousLights = materialConfig.maxSimultaneousLights ?? material.maxSimultaneousLights
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
      const meshConfig = config.meshes?.[getMeshKey(mesh)]

      if (!meshConfig) {
        return
      }

      mesh.isVisible = meshConfig.isVisible ?? mesh.isVisible
      mesh.visibility = meshConfig.visibility ?? mesh.visibility
      mesh.receiveShadows = meshConfig.receiveShadows ?? mesh.receiveShadows
      if (meshConfig.position) assignVector(mesh.position, meshConfig.position)
      if (meshConfig.rotation) assignVector(mesh.rotation, meshConfig.rotation)
      if (meshConfig.scaling) assignVector(mesh.scaling, meshConfig.scaling)
    })
  }

  if (shouldApplyRealtimeEffectsState) {
    applyRealtimeEffectsState()
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
