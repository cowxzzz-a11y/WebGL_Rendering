import { Engine } from '@babylonjs/core/Engines/engine'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Scene } from '@babylonjs/core/scene'

type CreateViewerSceneOptions = {
  canvas: HTMLCanvasElement
  hasHdrEnvironments: boolean
  legacyEnvironmentUrl: string
}

export const createViewerEngineScene = ({
  canvas,
  hasHdrEnvironments,
  legacyEnvironmentUrl,
}: CreateViewerSceneOptions) => {
  const engine = new Engine(canvas, true, {
    antialias: true,
    preserveDrawingBuffer: true,
    stencil: true,
  })

  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.6))

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.79, 0.82, 0.84, 1)
  scene.environmentTexture = hasHdrEnvironments ? null : CubeTexture.CreateFromPrefilteredData(legacyEnvironmentUrl, scene)
  scene.environmentIntensity = 0.55

  const imageProcessing = scene.imageProcessingConfiguration
  imageProcessing.isEnabled = true
  imageProcessing.toneMappingEnabled = true
  imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
  imageProcessing.exposure = 1
  imageProcessing.contrast = 1
  imageProcessing.colorCurvesEnabled = false
  imageProcessing.colorGradingEnabled = false
  imageProcessing.ditheringEnabled = true

  return { engine, scene, imageProcessing }
}

