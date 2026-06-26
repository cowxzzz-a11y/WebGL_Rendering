export type VectorConfig = [number, number, number]
export type ColorConfig = [number, number, number]

type DeepPartial<T> = T extends VectorConfig | ColorConfig
  ? T
  : T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type ViewerConfig = {
  configVersion?: number
  modelSignature?: string | null
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
      shadowMapSize: number
      shadowBias: number
    }
  }
  world: {
    environmentTexture?: string
    environmentBackgroundEnabled?: boolean
    environmentRotationY?: number
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
  rendering?: {
    realtimeEffectsEnabled: boolean
    shadowEnabled: boolean
    shadowFilterMode: number
    ssaoEnabled: boolean
    ssaoStrength: number
    ssaoRadius: number
    ssaoSamples: number
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
      refractionEnabled?: boolean
      refractionIntensity?: number
      translucencyEnabled?: boolean
      translucencyIntensity?: number
      scatteringEnabled?: boolean
      indexOfRefraction?: number
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

export type ViewerConfigInput = DeepPartial<ViewerConfig>
export type ViewerProjectConfigInput = ViewerConfigInput & {
  cameraFov?: number
  cameraRadius?: number
  cameraAlpha?: number
  cameraBeta?: number
  cameraTarget?: VectorConfig
  cameraWheelPrecision?: number
  cameraPanningSensibility?: number
  hemiIntensity?: number
  hemiDiffuse?: ColorConfig
  hemiGroundColor?: ColorConfig
  hemiDirection?: VectorConfig
  sunIntensity?: number
  sunDiffuse?: ColorConfig
  sunSpecular?: ColorConfig
  sunDirection?: VectorConfig
  sunPosition?: VectorConfig
  sunShadowMapSize?: number
  sunShadowBias?: number
  environmentTexture?: string
  environmentBackgroundEnabled?: boolean
  environmentRotationY?: number
  environmentIntensity?: number
  clearColor?: ColorConfig
  exposure?: number
  contrast?: number
  ditheringEnabled?: boolean
  toneMappingEnabled?: boolean
  samples?: number
  fxaaEnabled?: boolean
  bloomEnabled?: boolean
  sharpenEnabled?: boolean
  grainEnabled?: boolean
  realtimeEffectsEnabled?: boolean
  shadowEnabled?: boolean
  shadowFilterMode?: number
  ssaoEnabled?: boolean
  ssaoStrength?: number
  ssaoRadius?: number
  ssaoSamples?: number
}

export const configStorageKey = 'babylon-rendering-viewer-config'
