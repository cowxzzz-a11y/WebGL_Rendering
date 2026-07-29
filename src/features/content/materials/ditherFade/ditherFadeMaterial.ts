import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { DetailDescriptor } from '../../../../shared/types'
import { colorItem, numberItem, textItem } from '../../../../ui/detailPanel'

const noiseTextureUrl = new URL(
  './blue-noise-void-cluster-128.png',
  import.meta.url,
).href

const materialKey = 'viewer.content.material.ditherFade'
const pluginName = 'ViewerDitherFade'

const glslFragmentDefinitions = `
uniform float ditherFadeOpacity;
uniform float ditherFadeTimeSeconds;
uniform sampler2D ditherFadeNoiseTexture;

// Jorge Jimenez's Interleaved Gradient Noise, also used throughout UE's
// temporal rendering path. Every sample is one render-target pixel, so the
// dissolve grain never scales with the mesh or camera distance.
float viewerInterleavedGradientNoise(vec2 pixel, float frame) {
  vec2 shiftedPixel = floor(pixel) + frame * vec2(47.0, 17.0) * 0.695;
  return fract(52.9829189 * fract(dot(
    shiftedPixel,
    vec2(0.06711056, 0.00583715)
  )));
}

float viewerBlueNoise(vec2 pixel) {
  // Sampling texel centres avoids driver-dependent choices on texel borders.
  vec2 uv = fract((floor(pixel) + 0.5) / 128.0);
  return texture2D(ditherFadeNoiseTexture, uv).r;
}

float viewerDitherThreshold(vec2 pixel) {
  vec2 integerPixel = floor(pixel);
  float stableNoise = viewerBlueNoise(integerPixel);

  // Fixed 15 Hz pulse independent of render frame rate. Every animated pixel
  // changes on the same beat and in the same horizontal direction, but only a
  // sparse 1.5% selection moves by one screen pixel.
  float pulseStep = floor(ditherFadeTimeSeconds * 30.0);
  float animationState = mod(pulseStep, 2.0);
  float animatedMask = step(
    0.985,
    viewerInterleavedGradientNoise(integerPixel, 0.0)
  );
  float shiftedNoise = viewerBlueNoise(
    integerPixel + vec2(animationState, 0.0)
  );
  return mix(stableNoise, shiftedNoise, animatedMask * animationState);
}

float viewerDitherSideShade(vec3 worldNormal) {
  // Coverage stays identical on every face. Only the PBR colour is shaded:
  // walls remain legible while steep terrain naturally becomes darker.
  float upFacing = abs(normalize(worldNormal).y);
  return mix(0.68, 1.0, smoothstep(0.08, 0.85, upFacing));
}
`

const wgslFragmentDefinitions = `
var ditherFadeNoiseTexture: texture_2d<f32>;
var ditherFadeNoiseTextureSampler: sampler;

fn viewerInterleavedGradientNoise(pixel: vec2f, frame: f32) -> f32 {
  let shiftedPixel: vec2f =
    floor(pixel) + frame * vec2f(47.0, 17.0) * 0.695;
  return fract(52.9829189 * fract(dot(
    shiftedPixel,
    vec2f(0.06711056, 0.00583715)
  )));
}

fn viewerBlueNoise(pixel: vec2f) -> f32 {
  let uv: vec2f = fract((floor(pixel) + vec2f(0.5)) / 128.0);
  return textureSample(
    ditherFadeNoiseTexture,
    ditherFadeNoiseTextureSampler,
    uv
  ).r;
}

fn viewerDitherThreshold(pixel: vec2f) -> f32 {
  let integerPixel: vec2f = floor(pixel);
  let stableNoise: f32 = viewerBlueNoise(integerPixel);
  let pulseStep: f32 = floor(uniforms.ditherFadeTimeSeconds * 30.0);
  let animationState: f32 =
    pulseStep - floor(pulseStep / 2.0) * 2.0;
  let animatedMask: f32 = select(
    0.0,
    1.0,
    viewerInterleavedGradientNoise(integerPixel, 0.0) >= 0.985
  );
  let shiftedNoise: f32 = viewerBlueNoise(
    integerPixel + vec2f(animationState, 0.0)
  );
  return mix(stableNoise, shiftedNoise, animatedMask * animationState);
}

fn viewerDitherSideShade(worldNormal: vec3f) -> f32 {
  let upFacing: f32 = abs(normalize(worldNormal).y);
  return mix(0.68, 1.0, smoothstep(0.08, 0.85, upFacing));
}
`

class DitherFadePlugin extends MaterialPluginBase {
  opacity: number

  private readonly scene: Scene
  private readonly noiseTexture: Texture
  private elapsedSeconds = 0
  private lastFrameId = -1

  constructor(material: PBRMaterial, scene: Scene, opacity: number) {
    super(material, pluginName, 200, {}, true, true)
    this.scene = scene
    this.opacity = opacity
    this.registerForExtraEvents = true
    this.noiseTexture = new Texture(
      noiseTextureUrl,
      scene,
      true,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    )
    this.noiseTexture.wrapU = Texture.WRAP_ADDRESSMODE
    this.noiseTexture.wrapV = Texture.WRAP_ADDRESSMODE
    this.noiseTexture.gammaSpace = false
  }

  getClassName() {
    return 'DitherFadePlugin'
  }

  isCompatible(shaderLanguage: ShaderLanguage) {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL) {
    if (shaderType !== 'fragment') return null
    if (shaderLanguage === ShaderLanguage.WGSL) {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: wgslFragmentDefinitions,
        CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
let viewerCoverage: f32 = clamp(uniforms.ditherFadeOpacity, 0.0, 1.0);
if (viewerCoverage <= viewerDitherThreshold(fragmentInputs.position.xy)) {
  discard;
}
`,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
surfaceAlbedo = surfaceAlbedo * viewerDitherSideShade(geometricNormalW);
`,
      }
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: glslFragmentDefinitions,
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
float viewerCoverage = clamp(ditherFadeOpacity, 0.0, 1.0);
if (viewerCoverage <= viewerDitherThreshold(gl_FragCoord.xy)) {
  discard;
}
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
surfaceAlbedo *= viewerDitherSideShade(geometricNormalW);
`,
    }
  }

  getUniforms() {
    return {
      externalUniforms: ['ditherFadeOpacity', 'ditherFadeTimeSeconds'],
    }
  }

  getSamplers(samplers: string[]) {
    samplers.push('ditherFadeNoiseTexture')
  }

  getActiveTextures(activeTextures: Texture[]) {
    activeTextures.push(this.noiseTexture)
  }

  hasTexture(texture: Texture) {
    return texture === this.noiseTexture
  }

  private bind(subMesh: SubMesh) {
    const effect = subMesh.effect
    if (!effect) return
    const frameId = this.scene.getFrameId()
    if (frameId !== this.lastFrameId) {
      const deltaSeconds = Math.min(
        Math.max(this.scene.getEngine().getDeltaTime(), 0),
        100,
      ) / 1000
      this.elapsedSeconds += deltaSeconds
      this.lastFrameId = frameId
    }
    effect.setFloat('ditherFadeOpacity', this.opacity)
    effect.setFloat('ditherFadeTimeSeconds', this.elapsedSeconds)
    effect.setTexture('ditherFadeNoiseTexture', this.noiseTexture)
  }

  bindForSubMesh(
    _uniformBuffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ) {
    this.bind(subMesh)
  }

  hardBindForSubMesh(
    _uniformBuffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ) {
    this.bind(subMesh)
  }

  dispose(_forceDisposeTextures?: boolean) {
    this.noiseTexture.dispose()
  }

}

type Params = {
  baseColor: Color3
  opacity: number
  metallic: number
  roughness: number
  ambientStrength: number
}

type NumberParam = Exclude<keyof Params, 'baseColor'>

const createParams = (sourceMaterial?: AbstractMesh['material']): Params => ({
  baseColor: sourceMaterial instanceof PBRMaterial
    ? sourceMaterial.albedoColor.clone()
    : new Color3(0.48, 0.54, 0.62),
  opacity: 0.55,
  metallic: sourceMaterial instanceof PBRMaterial ? sourceMaterial.metallic ?? 0.05 : 0.05,
  roughness: sourceMaterial instanceof PBRMaterial ? sourceMaterial.roughness ?? 0.58 : 0.58,
  ambientStrength: sourceMaterial instanceof PBRMaterial
    ? sourceMaterial.environmentIntensity
    : 0.32,
})

const getParams = (material: PBRMaterial): Params => {
  if (!material.metadata?.ditherFadeParams) {
    material.metadata = { ...material.metadata, ditherFadeParams: createParams(material) }
  }
  return material.metadata.ditherFadeParams as Params
}

const getPlugin = (material: PBRMaterial) =>
  material.metadata?.ditherFadePlugin as DitherFadePlugin | undefined

const applyParams = (material: PBRMaterial, params: Params) => {
  material.albedoColor.copyFrom(params.baseColor)
  material.metallic = params.metallic
  material.roughness = params.roughness
  material.environmentIntensity = params.ambientStrength
  const plugin = getPlugin(material)
  if (plugin) plugin.opacity = params.opacity
}

export const isDitherFadeMaterial = (
  material: AbstractMesh['material'],
): material is PBRMaterial =>
  material instanceof PBRMaterial && material.metadata?.contentMaterial === materialKey

export const applyDitherFadeMaterial = ({
  scene,
  mesh,
}: {
  scene: Scene
  camera: ArcRotateCamera
  sunLight: DirectionalLight
  mesh: AbstractMesh
}) => {
  const previousMaterial = mesh.material
  if (isDitherFadeMaterial(previousMaterial)) {
    applyParams(previousMaterial, getParams(previousMaterial))
    return previousMaterial
  }

  const params = createParams(previousMaterial)
  const material = previousMaterial instanceof PBRMaterial
    ? previousMaterial.clone(`DitherFade_${mesh.uniqueId}`, true)
    : new PBRMaterial(`DitherFade_${mesh.uniqueId}`, scene)
  const plugin = new DitherFadePlugin(material, scene, params.opacity)

  material.metadata = {
    ...material.metadata,
    contentMaterial: materialKey,
    originalMaterialName: previousMaterial?.name ?? null,
    ditherFadeParams: params,
    ditherFadePlugin: plugin,
  }
  material.alpha = 1
  material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE
  material.forceDepthWrite = true
  applyParams(material, params)
  mesh.material = material
  mesh.receiveShadows = true
  return material
}

export const createDitherFadeMaterialDetail = (
  material: PBRMaterial,
): DetailDescriptor => {
  const params = getParams(material)
  const updateNumber = (key: NumberParam) => (value: number) => {
    params[key] = value
    applyParams(material, params)
  }
  return {
    title: material.name,
    kind: '抖动透明材质',
    sections: [
      {
        title: '抖动透明',
        items: [
          numberItem('透明度', params.opacity, 0, 1, 0.01, updateNumber('opacity')),
          textItem('模式', 'UE 式时序抖动 + 屏幕像素遮罩（写入深度）'),
          textItem('颗粒尺度', '固定 1 渲染像素，不随镜头缩放'),
        ],
      },
      {
        title: 'PBR 外观',
        items: [
          colorItem('基础颜色', params.baseColor, (value) => {
            params.baseColor = value
            applyParams(material, params)
          }),
          numberItem('金属度', params.metallic, 0, 1, 0.01, updateNumber('metallic')),
          numberItem('粗糙度', params.roughness, 0, 1, 0.01, updateNumber('roughness')),
          numberItem('环境亮度', params.ambientStrength, 0, 1, 0.01, updateNumber('ambientStrength')),
        ],
      },
      {
        title: '来源',
        items: [
          textItem('类型', 'material.ditherFade'),
          textItem('原材质', material.metadata?.originalMaterialName ?? '无'),
        ],
      },
    ],
  }
}
