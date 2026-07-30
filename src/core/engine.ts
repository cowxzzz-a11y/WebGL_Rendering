import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import { Engine } from '@babylonjs/core/Engines/engine'
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Scene } from '@babylonjs/core/scene'

export type ViewerEnginePreference = 'auto' | 'webgl2' | 'webgpu'
export type ViewerEngineMode = 'webgl2' | 'webgpu'

type CreateViewerSceneOptions = {
  canvas: HTMLCanvasElement
  hasHdrEnvironments: boolean
  legacyEnvironmentUrl: string
  isConstrainedMobileRuntime: boolean
}

export const viewerEnginePreferenceStorageKey = 'webgl-rendering-engine-preference'

const enginePreferences: ViewerEnginePreference[] = ['auto', 'webgl2', 'webgpu']

export const normalizeViewerEnginePreference = (value: string | null | undefined): ViewerEnginePreference =>
  enginePreferences.includes(value as ViewerEnginePreference) ? value as ViewerEnginePreference : 'auto'

export const getStoredViewerEnginePreference = () => {
  const urlPreference = new URLSearchParams(window.location.search).get('renderer')

  if (urlPreference) {
    return normalizeViewerEnginePreference(urlPreference)
  }

  const storedPreference = normalizeViewerEnginePreference(window.localStorage.getItem(viewerEnginePreferenceStorageKey))
  return storedPreference === 'webgpu' ? 'webgl2' : storedPreference
}

export const setStoredViewerEnginePreference = (preference: ViewerEnginePreference) => {
  window.localStorage.setItem(viewerEnginePreferenceStorageKey, preference)
}

export const getViewerEnginePreferenceOptions = () => [...enginePreferences]

const createWebGlEngine = (canvas: HTMLCanvasElement) =>
  new Engine(canvas, true, {
    antialias: true,
    preserveDrawingBuffer: true,
    stencil: true,
  })

const shouldUseWebGpuForAuto = (_webgpuSupported: boolean, _isConstrainedMobileRuntime: boolean) => false

const createEngine = async (
  canvas: HTMLCanvasElement,
  preference: ViewerEnginePreference,
  isConstrainedMobileRuntime: boolean,
) => {
  const webgpuSupported = await WebGPUEngine.IsSupportedAsync
  const shouldTryWebGpu =
    preference === 'webgpu' ||
    (preference === 'auto' && shouldUseWebGpuForAuto(webgpuSupported, isConstrainedMobileRuntime))

  if (shouldTryWebGpu && webgpuSupported) {
    try {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
      })
      await engine.initAsync()
      return {
        engine: engine as AbstractEngine,
        engineMode: 'webgpu' as ViewerEngineMode,
        enginePreference: preference,
        webgpuSupported,
        fallbackReason: null as string | null,
      }
    } catch (error) {
      console.warn('WebGPU engine initialization failed; falling back to WebGL2.', error)
      return {
        engine: createWebGlEngine(canvas) as AbstractEngine,
        engineMode: 'webgl2' as ViewerEngineMode,
        enginePreference: preference,
        webgpuSupported,
        fallbackReason: 'WebGPU 初始化失败，已回退到 WebGL2',
      }
    }
  }

  return {
    engine: createWebGlEngine(canvas) as AbstractEngine,
    engineMode: 'webgl2' as ViewerEngineMode,
    enginePreference: preference,
    webgpuSupported,
    fallbackReason: preference === 'webgpu' && !webgpuSupported ? '当前浏览器不支持 WebGPU，已回退到 WebGL2' : null,
  }
}

export const createViewerEngineScene = async ({
  canvas,
  hasHdrEnvironments,
  legacyEnvironmentUrl,
  isConstrainedMobileRuntime,
}: CreateViewerSceneOptions) => {
  const {
    engine,
    engineMode,
    enginePreference,
    webgpuSupported,
    fallbackReason,
  } = await createEngine(canvas, getStoredViewerEnginePreference(), isConstrainedMobileRuntime)

  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.6))

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.79, 0.82, 0.84, 1)
  scene.environmentTexture = hasHdrEnvironments ? null : CubeTexture.CreateFromPrefilteredData(legacyEnvironmentUrl, scene)
  scene.environmentIntensity = 1

  const imageProcessing = scene.imageProcessingConfiguration
  imageProcessing.isEnabled = true
  imageProcessing.toneMappingEnabled = true
  imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
  imageProcessing.exposure = 1
  imageProcessing.contrast = 1
  imageProcessing.colorCurvesEnabled = false
  imageProcessing.colorGradingEnabled = false
  imageProcessing.ditheringEnabled = true

  return {
    engine,
    scene,
    imageProcessing,
    engineMode,
    enginePreference,
    webgpuSupported,
    fallbackReason,
  }
}
