import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline'
import type { GeometryBufferRenderer } from '@babylonjs/core/Rendering/geometryBufferRenderer'
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent'
import '@babylonjs/core/Rendering/prePassRendererSceneComponent'
import type { Scene } from '@babylonjs/core/scene'
import { syncImportedGlassEnvironmentTexture, syncImportedMaterialRenderingState } from '../material/importedMaterialRendering'
import { collectPbrMaterialsFromMaterial, isTransparentMesh } from '../material/materialUtils'

type RealtimeRenderingControllerOptions = {
  scene: Scene
  camera: ArcRotateCamera
  sunLight: DirectionalLight
  getShadowGenerator: () => ShadowGenerator | undefined
  ensureShadowGenerator: () => ShadowGenerator | undefined
  disposeShadowGenerator: () => void
  getImportedMeshes: () => AbstractMesh[]
  isBillboardMesh: (mesh: AbstractMesh) => boolean
  flushSceneRenderCaches: () => void
}

export type RealtimeRenderingController = ReturnType<typeof createRealtimeRenderingController>

export const createRealtimeRenderingController = ({
  scene,
  camera,
  sunLight,
  getShadowGenerator,
  ensureShadowGenerator,
  disposeShadowGenerator,
  getImportedMeshes,
  isBillboardMesh,
  flushSceneRenderCaches,
}: RealtimeRenderingControllerOptions) => {
  let ssao2Pipeline: SSAO2RenderingPipeline | null = null
  let realtimeEffectsEnabledPreference = true
  let shadowEnabledPreference = true
  let ssaoEnabledPreference = false
  let ssaoStrength = 0.55
  let ssaoRadius = 0.75
  let ssaoSamples = 16
  let shadowFilterMode = 6
  let savedSunIntensity = 3
  let geometryBufferRenderer: GeometryBufferRenderer | null = null
  const meshFXFlags = new WeakMap<AbstractMesh, { receiveSSAO: boolean }>()

  const getShadowActive = () => realtimeEffectsEnabledPreference && shadowEnabledPreference

  const getSsaoActive = () => realtimeEffectsEnabledPreference && ssaoEnabledPreference

  const ensureGeometryBufferRenderer = () => {
    geometryBufferRenderer ??= scene.enableGeometryBufferRenderer()

    if (geometryBufferRenderer) {
      geometryBufferRenderer.useSpecificClearForDepthTexture = true
    }

    return geometryBufferRenderer
  }

  const configureSsaoPipelineDefaults = (pipeline: SSAO2RenderingPipeline) => {
    pipeline.maxZ = Math.max(camera.maxZ, 120)
    pipeline.radius = ssaoRadius
    pipeline.samples = ssaoSamples
    pipeline.totalStrength = ssaoStrength
  }

  const updateGBufferRenderList = () => {
    if (!geometryBufferRenderer) {
      return
    }

    const meshes = getImportedMeshes()
    const list = meshes.filter((mesh) =>
      !isBillboardMesh(mesh)
      && (meshFXFlags.get(mesh)?.receiveSSAO ?? true)
      && !isTransparentMesh(mesh),
    )

    geometryBufferRenderer.renderList = list.length > 0 ? list : null
  }

  const ensureSsaoPipeline = () => {
    const renderer = ensureGeometryBufferRenderer()
    updateGBufferRenderList()

    if (!ssao2Pipeline) {
      ssao2Pipeline = new SSAO2RenderingPipeline('SSAO2', scene, { ssaoRatio: 0.5, blurRatio: 1.0 }, [camera], renderer ?? true)
    }

    configureSsaoPipelineDefaults(ssao2Pipeline)
    return ssao2Pipeline
  }

  const applySsaoSettings = () => {
    if (!ssao2Pipeline) {
      return
    }

    configureSsaoPipelineDefaults(ssao2Pipeline)
  }

  const releaseSharedRenderersIfIdle = () => {
    if (ssao2Pipeline) {
      return
    }

    scene.disableGeometryBufferRenderer()
    scene.disablePrePassRenderer()
    scene.resetCachedMaterial()
    geometryBufferRenderer = null
  }

  const disposeSsaoPipeline = () => {
    ssao2Pipeline?.dispose()
    ssao2Pipeline = null
    releaseSharedRenderersIfIdle()
  }

  const resetRealtimePipelines = () => {
    ssao2Pipeline?.dispose()
    ssao2Pipeline = null

    scene.disableGeometryBufferRenderer()
    scene.disablePrePassRenderer()
    scene.resetCachedMaterial()
    geometryBufferRenderer = null
  }

  const getRealtimeShadowMeshes = () =>
    getImportedMeshes().filter((mesh) => !isBillboardMesh(mesh) && !isTransparentMesh(mesh))

  const applyRealtimeShadowState = () => {
    const shadowEnabled = getShadowActive()
    const shadowGenerator = shadowEnabled ? ensureShadowGenerator() : getShadowGenerator()
    const shadowMap = getShadowGenerator()?.getShadowMap()

    sunLight.shadowEnabled = shadowEnabled
    if (shadowGenerator && shadowMap) {
      shadowMap.renderList = shadowEnabled ? getRealtimeShadowMeshes() : []
    }

    getImportedMeshes().forEach((mesh) => {
      mesh.receiveShadows = shadowEnabled && !isBillboardMesh(mesh) && !isTransparentMesh(mesh)
    })

    if (!shadowEnabled) {
      disposeShadowGenerator()
    }
  }

  const syncImportedMeshRenderingState = (mesh: AbstractMesh) => {
    const transparent = isTransparentMesh(mesh)
    const currentFlags = meshFXFlags.get(mesh)

    meshFXFlags.set(mesh, {
      receiveSSAO: transparent ? false : (currentFlags?.receiveSSAO ?? true),
    })

    mesh.renderingGroupId = 0
    mesh.receiveShadows = !transparent && getShadowActive()
  }

  const refreshImportedRenderingState = () => {
    const materials = new Set<PBRMaterial>()

    getImportedMeshes().forEach((mesh) => {
      collectPbrMaterialsFromMaterial(mesh.material, materials)
    })

    materials.forEach(syncImportedMaterialRenderingState)
    getImportedMeshes().forEach(syncImportedMeshRenderingState)
    applyRealtimeShadowState()
    updateGBufferRenderList()
    flushSceneRenderCaches()
  }

  const syncImportedEnvironmentTextures = () => {
    const materials = new Set<PBRMaterial>()

    getImportedMeshes().forEach((mesh) => {
      collectPbrMaterialsFromMaterial(mesh.material, materials)
    })

    materials.forEach((material) => {
      syncImportedGlassEnvironmentTexture(material)
    })
    flushSceneRenderCaches()
  }

  const setRealtimeEffectsEnabled = (value: boolean) => {
    if (realtimeEffectsEnabledPreference === value) {
      return
    }

    if (!value) {
      savedSunIntensity = sunLight.intensity
      realtimeEffectsEnabledPreference = false
      sunLight.intensity = 0
      applyRealtimeShadowState()
      resetRealtimePipelines()
      flushSceneRenderCaches()
      return
    }

    realtimeEffectsEnabledPreference = true
    sunLight.intensity = savedSunIntensity
    refreshImportedRenderingState()
    applyRealtimeShadowState()

    if (getImportedMeshes().length === 0) {
      return
    }

    try {
      if (getSsaoActive()) {
        ensureSsaoPipeline()
        applySsaoSettings()
      }

    } catch (error) {
      console.warn('Realtime post-processing pipeline was not available.', error)
    }
  }

  const restoreRealtimeLightState = () => {
    realtimeEffectsEnabledPreference = true
    sunLight.intensity = savedSunIntensity
    applyRealtimeShadowState()
    resetRealtimePipelines()
    flushSceneRenderCaches()
  }

  const applyRealtimeEffectsState = () => {
    if (!realtimeEffectsEnabledPreference) {
      sunLight.intensity = 0
      applyRealtimeShadowState()
      resetRealtimePipelines()
      flushSceneRenderCaches()
      return
    }

    sunLight.intensity = savedSunIntensity
    applyRealtimeShadowState()

    if (getImportedMeshes().length > 0) {
      try {
        if (getSsaoActive()) {
          ensureSsaoPipeline()
          applySsaoSettings()
        } else {
          disposeSsaoPipeline()
        }
      } catch (error) {
        console.warn('SSAO pipeline was not available; disabling SSAO.', error)
        ssaoEnabledPreference = false
        disposeSsaoPipeline()
      }

    } else {
      resetRealtimePipelines()
    }

    flushSceneRenderCaches()
  }

  return {
    getRealtimeEffectsEnabled: () => realtimeEffectsEnabledPreference,
    setRealtimeEffectsEnabled,
    getShadowEnabled: () => shadowEnabledPreference,
    setShadowEnabled: (value: boolean) => {
      shadowEnabledPreference = value
      applyRealtimeShadowState()
    },
    getShadowFilterMode: () => shadowFilterMode,
    setShadowFilterMode: (value: number) => { shadowFilterMode = value },
    getSsaoEnabled: () => ssaoEnabledPreference,
    setSsaoEnabled: (value: boolean) => {
      ssaoEnabledPreference = value
      try {
        if (getSsaoActive()) {
          ensureSsaoPipeline()
          applySsaoSettings()
        } else {
          disposeSsaoPipeline()
        }
      } catch (error) {
        console.warn('SSAO pipeline was not available; disabling SSAO.', error)
        ssaoEnabledPreference = false
        disposeSsaoPipeline()
      }
      flushSceneRenderCaches()
    },
    getSsaoStrength: () => ssaoStrength,
    setSsaoStrength: (value: number) => { ssaoStrength = value },
    getSsaoRadius: () => ssaoRadius,
    setSsaoRadius: (value: number) => { ssaoRadius = value },
    getSsaoSamples: () => ssaoSamples,
    setSsaoSamples: (value: number) => { ssaoSamples = value },
    getSsaoPipeline: () => ssao2Pipeline,
    getRealtimeShadowMeshes,
    ensureSsaoPipeline,
    applyRealtimeShadowState,
    applySsaoSettings,
    applyRealtimeEffectsState,
    resetRealtimePipelines,
    restoreRealtimeLightState,
    updateGBufferRenderList,
    refreshImportedRenderingState,
    syncImportedEnvironmentTextures,
    getReceiveSsao: (mesh: AbstractMesh) => meshFXFlags.get(mesh)?.receiveSSAO ?? true,
    setReceiveSsao: (mesh: AbstractMesh, value: boolean) => {
      meshFXFlags.set(mesh, { receiveSSAO: value })
      updateGBufferRenderList()
    },
    updateSsaoMaxZ: (maxZ: number) => {
      if (ssao2Pipeline) {
        ssao2Pipeline.maxZ = Math.max(maxZ, 120)
      }
    },
  }
}
