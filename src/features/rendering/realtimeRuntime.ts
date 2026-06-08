import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline'
import { SSRRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline'
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
  getImportedMeshes: () => AbstractMesh[]
  isBillboardMesh: (mesh: AbstractMesh) => boolean
  getRealtimeEnabled: () => boolean
  initShadowGenerator: () => void
  flushSceneRenderCaches: () => void
}

export type RealtimeRenderingController = ReturnType<typeof createRealtimeRenderingController>

export const createRealtimeRenderingController = ({
  scene,
  camera,
  sunLight,
  getShadowGenerator,
  getImportedMeshes,
  isBillboardMesh,
  getRealtimeEnabled,
  initShadowGenerator,
  flushSceneRenderCaches,
}: RealtimeRenderingControllerOptions) => {
  let ssao2Pipeline: SSAO2RenderingPipeline | null = null
  let ssrPipeline: SSRRenderingPipeline | null = null
  let shadowEnabledPreference = true
  let ssaoEnabledPreference = false
  let ssaoStrength = 0.55
  let ssaoRadius = 0.75
  let ssaoSamples = 16
  let ssrEnabledPreference = true
  let shadowFilterMode = 6
  let savedSunIntensity = 0.62
  let geometryBufferRenderer: GeometryBufferRenderer | null = null
  const meshFXFlags = new WeakMap<AbstractMesh, { receiveSSAO: boolean }>()

  const ensureGeometryBufferRenderer = (enableReflectivity = false) => {
    geometryBufferRenderer ??= scene.enableGeometryBufferRenderer()

    if (geometryBufferRenderer) {
      geometryBufferRenderer.useSpecificClearForDepthTexture = true

      if (enableReflectivity) {
        geometryBufferRenderer.enableReflectivity = true
      }
    }

    return geometryBufferRenderer
  }

  const configureSsaoPipelineDefaults = (pipeline: SSAO2RenderingPipeline) => {
    pipeline.maxZ = Math.max(camera.maxZ, 120)
    pipeline.radius = ssaoRadius
    pipeline.samples = ssaoSamples
    pipeline.totalStrength = ssaoEnabledPreference ? ssaoStrength : 0
  }

  const configureSsrPipelineDefaults = (pipeline: SSRRenderingPipeline) => {
    pipeline.step = 2
    pipeline.maxSteps = 512
    pipeline.thickness = 1
    pipeline.strength = 1
    pipeline.roughnessFactor = 0.2
    pipeline.enableAutomaticThicknessComputation = true
    pipeline.backfaceForceDepthWriteTransparentMeshes = false
    pipeline.attenuateBackfaceReflection = true
    pipeline.environmentTexture = scene.environmentTexture instanceof CubeTexture ? scene.environmentTexture : null
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

  const ensureSsrPipeline = () => {
    ensureGeometryBufferRenderer(true)
    updateGBufferRenderList()

    if (!ssrPipeline) {
      ssrPipeline = new SSRRenderingPipeline('SSR', scene, [camera], true)
    }

    configureSsrPipelineDefaults(ssrPipeline)
    return ssrPipeline
  }

  const resetRealtimePipelines = () => {
    ssao2Pipeline?.dispose()
    ssao2Pipeline = null

    ssrPipeline?.dispose(true)
    ssrPipeline = null

    scene.disableGeometryBufferRenderer()
    scene.disablePrePassRenderer()
    scene.resetCachedMaterial()
    geometryBufferRenderer = null
  }

  const getRealtimeShadowMeshes = () =>
    getImportedMeshes().filter((mesh) => !isBillboardMesh(mesh) && !isTransparentMesh(mesh))

  const applyRealtimeShadowState = () => {
    const shadowEnabled = getRealtimeEnabled() && shadowEnabledPreference
    const shadowMap = getShadowGenerator()?.getShadowMap()

    sunLight.shadowEnabled = shadowEnabled
    if (shadowMap) {
      shadowMap.renderList = shadowEnabled ? getRealtimeShadowMeshes() : []
    }

    getImportedMeshes().forEach((mesh) => {
      mesh.receiveShadows = shadowEnabled && !isBillboardMesh(mesh) && !isTransparentMesh(mesh)
    })
  }

  const syncImportedMeshRenderingState = (mesh: AbstractMesh) => {
    const transparent = isTransparentMesh(mesh)
    const currentFlags = meshFXFlags.get(mesh)

    meshFXFlags.set(mesh, {
      receiveSSAO: transparent ? false : (currentFlags?.receiveSSAO ?? true),
    })

    mesh.renderingGroupId = 0
    mesh.receiveShadows = !transparent && getRealtimeEnabled() && shadowEnabledPreference
  }

  const refreshImportedRenderingState = () => {
    const materials = new Set<PBRMaterial>()

    getImportedMeshes().forEach((mesh) => {
      collectPbrMaterialsFromMaterial(mesh.material, materials)
    })

    materials.forEach(syncImportedMaterialRenderingState)
    getImportedMeshes().forEach(syncImportedMeshRenderingState)
    if (ssrPipeline) {
      configureSsrPipelineDefaults(ssrPipeline)
    }
    initShadowGenerator()
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
    if (ssrPipeline) {
      configureSsrPipelineDefaults(ssrPipeline)
    }
    flushSceneRenderCaches()
  }

  const disableRealtimeEffects = () => {
    savedSunIntensity = sunLight.intensity
    sunLight.intensity = 0
    applyRealtimeShadowState()
    resetRealtimePipelines()
    flushSceneRenderCaches()
  }

  const enableRealtimeEffects = () => {
    sunLight.intensity = savedSunIntensity
    refreshImportedRenderingState()
    applyRealtimeShadowState()

    if (ssaoEnabledPreference) {
      ensureSsaoPipeline()
      applySsaoSettings()
    } else if (ssao2Pipeline) {
      ssao2Pipeline.totalStrength = 0
    }

    if (ssrEnabledPreference) {
      ensureSsrPipeline().isEnabled = true
    } else if (ssrPipeline) {
      ssrPipeline.isEnabled = false
    }
  }

  return {
    getShadowEnabled: () => shadowEnabledPreference,
    setShadowEnabled: (value: boolean) => { shadowEnabledPreference = value },
    getShadowFilterMode: () => shadowFilterMode,
    setShadowFilterMode: (value: number) => { shadowFilterMode = value },
    getSsaoEnabled: () => ssaoEnabledPreference,
    setSsaoEnabled: (value: boolean) => { ssaoEnabledPreference = value },
    getSsaoStrength: () => ssaoStrength,
    setSsaoStrength: (value: number) => { ssaoStrength = value },
    getSsaoRadius: () => ssaoRadius,
    setSsaoRadius: (value: number) => { ssaoRadius = value },
    getSsaoSamples: () => ssaoSamples,
    setSsaoSamples: (value: number) => { ssaoSamples = value },
    getSsrEnabled: () => ssrEnabledPreference,
    setSsrEnabled: (value: boolean) => { ssrEnabledPreference = value },
    getSsaoPipeline: () => ssao2Pipeline,
    getSsrPipeline: () => ssrPipeline,
    getRealtimeShadowMeshes,
    ensureSsaoPipeline,
    ensureSsrPipeline,
    applyRealtimeShadowState,
    applySsaoSettings,
    resetRealtimePipelines,
    disableRealtimeEffects,
    enableRealtimeEffects,
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
