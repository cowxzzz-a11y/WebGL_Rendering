import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { Scene } from '@babylonjs/core/scene'

export const createClassicPipeline = (scene: Scene, camera: ArcRotateCamera) => {
  const pipeline = new DefaultRenderingPipeline('ClassicPipeline', true, scene, [camera])
  pipeline.samples = 4
  pipeline.fxaaEnabled = true
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = true
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
  pipeline.imageProcessing.exposure = 1
  pipeline.imageProcessing.contrast = 1
  pipeline.imageProcessing.ditheringEnabled = true
  pipeline.bloomEnabled = false
  pipeline.chromaticAberrationEnabled = false
  pipeline.grainEnabled = false
  pipeline.sharpenEnabled = false

  return pipeline
}

