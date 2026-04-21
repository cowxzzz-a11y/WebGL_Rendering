export type VectorConfig = [number, number, number]
export type ColorConfig = [number, number, number]

export type ViewerConfig = {
  camera: {
    fov: number
    radius: number
    alpha: number
    beta: number
    target: VectorConfig
    wheelPrecision: number
    panningSensibility: number
  }
  lights: {
    hemi: {
      intensity: number
      diffuse: ColorConfig
      groundColor: ColorConfig
      direction: VectorConfig
      helperVisible: boolean
    }
    sun: {
      intensity: number
      diffuse: ColorConfig
      specular: ColorConfig
      direction: VectorConfig
      position: VectorConfig
      helperVisible: boolean
    }
  }
  world: {
    environmentIntensity: number
    clearColor: ColorConfig
    exposure: number
    contrast: number
    ditheringEnabled: boolean
    toneMappingEnabled: boolean
  }
  pipeline: {
    samples: number
    fxaaEnabled: boolean
    bloomEnabled: boolean
    sharpenEnabled: boolean
    grainEnabled: boolean
  }
  materials: Record<
    string,
    {
      alpha: number
      metallic: number | null
      roughness: number | null
      albedoColor: ColorConfig
      emissiveColor: ColorConfig
      directIntensity: number
      environmentIntensity: number
      specularIntensity: number
      maxSimultaneousLights: number
    }
  >
  meshes: Record<
    string,
    {
      isVisible: boolean
      visibility: number
      receiveShadows: boolean
      position: VectorConfig
      rotation: VectorConfig
      scaling: VectorConfig
    }
  >
}

export const configStorageKey = 'babylon-rendering-viewer-config'
