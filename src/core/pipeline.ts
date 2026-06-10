import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { Scene } from '@babylonjs/core/scene'

type ClassicImageProcessing = {
  toneMappingEnabled: boolean
  toneMappingType: number
  exposure: number
  contrast: number
  ditheringEnabled: boolean
}

export type ClassicPipeline = {
  name: string
  samples: number
  fxaaEnabled: boolean
  imageProcessingEnabled: boolean
  imageProcessing: ClassicImageProcessing
  bloomEnabled: boolean
  chromaticAberrationEnabled: boolean
  sharpenEnabled: boolean
  grainEnabled: boolean
}

export const createClassicPipeline = (scene: Scene, camera: ArcRotateCamera) => {
  let pipeline: ClassicPipeline

  try {
    pipeline = new DefaultRenderingPipeline('ClassicPipeline', true, scene, [camera])
  } catch (error) {
    console.warn('Default rendering pipeline was not available; falling back to scene image processing.', error)
    pipeline = {
      name: 'SceneImageProcessing',
      samples: 1,
      fxaaEnabled: false,
      imageProcessingEnabled: true,
      imageProcessing: scene.imageProcessingConfiguration,
      bloomEnabled: false,
      chromaticAberrationEnabled: false,
      sharpenEnabled: false,
      grainEnabled: false,
    }
  }

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
