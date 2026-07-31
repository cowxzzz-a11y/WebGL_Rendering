import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial'
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { DetailDescriptor } from '../../../../shared/types'
import { colorItem, numberItem, textItem, textureItem } from '../../../../ui/detailPanel'

const noiseTextureUrl = new URL(
  './blue-noise-void-cluster-128.png',
  import.meta.url,
).href

const materialKey = 'viewer.content.material.ditherFade'
const pluginName = 'ViewerDitherFade'

const glslFragmentDefinitions = `
uniform float ditherFadeOpacity;
uniform float ditherFadeTimeSeconds;
uniform float dtaaTriplanarEnabled;
uniform float dtaaTriplanarGamma;
uniform vec2 dtaaTriplanarScale;
uniform sampler2D ditherFadeNoiseTexture;
uniform sampler2D dtaaTriplanarTexture;

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

vec4 viewerTriplanarSample(vec3 worldPosition, vec3 worldNormal) {
  vec3 normal = normalize(worldNormal);
  vec3 weights = pow(abs(normal), vec3(4.0));
  weights /= max(weights.x + weights.y + weights.z, 0.00001);

  vec2 scale = max(dtaaTriplanarScale, vec2(0.00001));
  vec2 uvX = worldPosition.zy * scale;
  vec2 uvY = worldPosition.xz * scale;
  vec2 uvZ = worldPosition.xy * scale;

  // Keep opposite faces oriented consistently instead of mirrored.
  uvX.x *= normal.x < 0.0 ? -1.0 : 1.0;
  uvY.x *= normal.y < 0.0 ? -1.0 : 1.0;
  uvZ.x *= normal.z >= 0.0 ? -1.0 : 1.0;

  vec4 sampleX = texture2D(dtaaTriplanarTexture, uvX);
  vec4 sampleY = texture2D(dtaaTriplanarTexture, uvY);
  vec4 sampleZ = texture2D(dtaaTriplanarTexture, uvZ);
  return sampleX * weights.x + sampleY * weights.y + sampleZ * weights.z;
}
`

const wgslFragmentDefinitions = `
var ditherFadeNoiseTexture: texture_2d<f32>;
var ditherFadeNoiseTextureSampler: sampler;
var dtaaTriplanarTexture: texture_2d<f32>;
var dtaaTriplanarTextureSampler: sampler;

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

fn viewerTriplanarSample(
  worldPosition: vec3f,
  worldNormal: vec3f
) -> vec4f {
  let normal: vec3f = normalize(worldNormal);
  var weights: vec3f = pow(abs(normal), vec3f(4.0));
  weights /= max(weights.x + weights.y + weights.z, 0.00001);

  let scale: vec2f = max(uniforms.dtaaTriplanarScale, vec2f(0.00001));
  var uvX: vec2f = worldPosition.zy * scale;
  var uvY: vec2f = worldPosition.xz * scale;
  var uvZ: vec2f = worldPosition.xy * scale;
  uvX.x *= select(1.0, -1.0, normal.x < 0.0);
  uvY.x *= select(1.0, -1.0, normal.y < 0.0);
  uvZ.x *= select(1.0, -1.0, normal.z >= 0.0);

  let sampleX: vec4f = textureSample(
    dtaaTriplanarTexture,
    dtaaTriplanarTextureSampler,
    uvX
  );
  let sampleY: vec4f = textureSample(
    dtaaTriplanarTexture,
    dtaaTriplanarTextureSampler,
    uvY
  );
  let sampleZ: vec4f = textureSample(
    dtaaTriplanarTexture,
    dtaaTriplanarTextureSampler,
    uvZ
  );
  return sampleX * weights.x + sampleY * weights.y + sampleZ * weights.z;
}
`

class DitherFadePlugin extends MaterialPluginBase {
  opacity: number
  uvScaleU: number
  uvScaleV: number

  private readonly material: PBRMaterial
  private readonly scene: Scene
  private readonly noiseTexture: Texture
  private readonly fallbackTexture: RawTexture
  private elapsedSeconds = 0
  private lastFrameId = -1

  constructor(
    material: PBRMaterial,
    scene: Scene,
    opacity: number,
    uvScaleU: number,
    uvScaleV: number,
  ) {
    super(material, pluginName, 200, {}, true, true)
    this.material = material
    this.scene = scene
    this.opacity = opacity
    this.uvScaleU = uvScaleU
    this.uvScaleV = uvScaleV
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
    this.fallbackTexture = RawTexture.CreateRGBATexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    )
    this.fallbackTexture.gammaSpace = false
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
var viewerTriplanarNormalW: vec3f;
#ifdef NORMAL
viewerTriplanarNormalW = normalize(fragmentInputs.vNormalW);
#else
viewerTriplanarNormalW = normalize(cross(
  dpdx(fragmentInputs.vPositionW),
  dpdy(fragmentInputs.vPositionW)
));
#endif
var viewerTriplanarColor: vec3f = viewerTriplanarSample(
  fragmentInputs.vPositionW,
  viewerTriplanarNormalW
).rgb;
viewerTriplanarColor = mix(
  viewerTriplanarColor,
  toLinearSpaceVec3(viewerTriplanarColor),
  uniforms.dtaaTriplanarGamma
);
surfaceAlbedo = mix(
  surfaceAlbedo,
  vAlbedoColor.rgb * viewerTriplanarColor,
  uniforms.dtaaTriplanarEnabled
);
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
vec3 viewerTriplanarNormalW;
#ifdef NORMAL
viewerTriplanarNormalW = normalize(vNormalW);
#else
viewerTriplanarNormalW = normalize(cross(
  dFdx(vPositionW),
  dFdy(vPositionW)
));
#endif
vec3 viewerTriplanarColor = viewerTriplanarSample(
  vPositionW,
  viewerTriplanarNormalW
).rgb;
viewerTriplanarColor = mix(
  viewerTriplanarColor,
  toLinearSpace(viewerTriplanarColor),
  dtaaTriplanarGamma
);
surfaceAlbedo = mix(
  surfaceAlbedo,
  vAlbedoColor.rgb * viewerTriplanarColor,
  dtaaTriplanarEnabled
);
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
surfaceAlbedo *= viewerDitherSideShade(geometricNormalW);
`,
    }
  }

  getUniforms() {
    return {
      externalUniforms: [
        'ditherFadeOpacity',
        'ditherFadeTimeSeconds',
        'dtaaTriplanarEnabled',
        'dtaaTriplanarGamma',
        'dtaaTriplanarScale',
      ],
    }
  }

  getSamplers(samplers: string[]) {
    samplers.push('ditherFadeNoiseTexture')
    samplers.push('dtaaTriplanarTexture')
  }

  getActiveTextures(activeTextures: Texture[]) {
    activeTextures.push(this.noiseTexture)
    const sourceTexture = this.material.albedoTexture
    if (sourceTexture instanceof Texture) activeTextures.push(sourceTexture)
  }

  hasTexture(texture: Texture) {
    return texture === this.noiseTexture ||
      texture === this.material.albedoTexture ||
      texture === this.fallbackTexture
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
    const sourceTexture = this.material.albedoTexture
    const hasSourceTexture = sourceTexture instanceof Texture
    effect.setFloat('dtaaTriplanarEnabled', hasSourceTexture ? 1 : 0)
    effect.setFloat(
      'dtaaTriplanarGamma',
      hasSourceTexture && sourceTexture.gammaSpace ? 1 : 0,
    )
    effect.setFloat2(
      'dtaaTriplanarScale',
      Math.max(this.uvScaleU, 0.0001) * 0.01,
      Math.max(this.uvScaleV, 0.0001) * 0.01,
    )
    effect.setTexture('ditherFadeNoiseTexture', this.noiseTexture)
    effect.setTexture(
      'dtaaTriplanarTexture',
      hasSourceTexture ? sourceTexture : this.fallbackTexture,
    )
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
    this.fallbackTexture.dispose()
  }

}

type Params = {
  baseColor: Color3
  emissiveColor: Color3
  opacity: number
  metallic: number
  roughness: number
  ambientStrength: number
  directIntensity: number
  specularIntensity: number
  normalStrength: number
  ambientOcclusionStrength: number
  uvScaleU: number
  uvScaleV: number
}

type NumberParam = Exclude<keyof Params, 'baseColor' | 'emissiveColor'>

const getReferenceTexture = (material?: AbstractMesh['material']) =>
  material instanceof PBRMaterial
    ? material.albedoTexture ??
      material.bumpTexture ??
      material.metallicTexture ??
      material.ambientTexture ??
      material.emissiveTexture
    : null

const createParams = (sourceMaterial?: AbstractMesh['material']): Params => {
  const referenceTexture = getReferenceTexture(sourceMaterial)
  const textureScale = referenceTexture instanceof Texture ? referenceTexture : null
  return {
    baseColor: sourceMaterial instanceof PBRMaterial
    ? sourceMaterial.albedoColor.clone()
    : new Color3(0.48, 0.54, 0.62),
    emissiveColor: sourceMaterial instanceof PBRMaterial
      ? sourceMaterial.emissiveColor.clone()
      : Color3.Black(),
    opacity: 1,
    metallic: sourceMaterial instanceof PBRMaterial ? sourceMaterial.metallic ?? 0.05 : 0.05,
    roughness: sourceMaterial instanceof PBRMaterial ? sourceMaterial.roughness ?? 0.58 : 0.58,
    ambientStrength: sourceMaterial instanceof PBRMaterial
      ? sourceMaterial.environmentIntensity
      : 1,
    directIntensity: sourceMaterial instanceof PBRMaterial ? sourceMaterial.directIntensity : 1,
    specularIntensity: sourceMaterial instanceof PBRMaterial ? sourceMaterial.specularIntensity : 1,
    normalStrength: sourceMaterial instanceof PBRMaterial ? sourceMaterial.bumpTexture?.level ?? 1 : 1,
    ambientOcclusionStrength: sourceMaterial instanceof PBRMaterial
      ? sourceMaterial.ambientTextureStrength
      : 1,
    uvScaleU: textureScale?.uScale ?? 0.06,
    uvScaleV: textureScale?.vScale ?? 0.06,
  }
}

const getParams = (material: PBRMaterial): Params => {
  if (!material.metadata?.ditherFadeParams) {
    material.metadata = { ...material.metadata, ditherFadeParams: createParams(material) }
  }
  const params = material.metadata.ditherFadeParams as Params
  params.emissiveColor ??= material.emissiveColor.clone()
  params.directIntensity ??= material.directIntensity
  params.specularIntensity ??= material.specularIntensity
  params.normalStrength ??= material.bumpTexture?.level ?? 1
  params.ambientOcclusionStrength ??= material.ambientTextureStrength
  params.uvScaleU ??= 0.06
  params.uvScaleV ??= 0.06
  return params
}

const getPlugin = (material: PBRMaterial) =>
  material.metadata?.ditherFadePlugin as DitherFadePlugin | undefined

const getPbrTextures = (material: PBRMaterial) => [
  material.albedoTexture,
  material.bumpTexture,
  material.metallicTexture,
  material.ambientTexture,
  material.emissiveTexture,
].filter((texture): texture is Texture => texture instanceof Texture)

const applyParams = (material: PBRMaterial, params: Params) => {
  material.albedoColor.copyFrom(params.baseColor)
  material.emissiveColor.copyFrom(params.emissiveColor)
  material.metallic = params.metallic
  material.roughness = params.roughness
  material.environmentIntensity = params.ambientStrength
  material.directIntensity = params.directIntensity
  material.specularIntensity = params.specularIntensity
  material.ambientTextureStrength = params.ambientOcclusionStrength
  if (material.bumpTexture) material.bumpTexture.level = params.normalStrength
  getPbrTextures(material).forEach((texture) => {
    texture.uScale = params.uvScaleU
    texture.vScale = params.uvScaleV
  })
  const plugin = getPlugin(material)
  if (plugin) {
    plugin.opacity = params.opacity
    plugin.uvScaleU = params.uvScaleU
    plugin.uvScaleV = params.uvScaleV
  }
}

type PbrTextureSlot = 'albedo' | 'normal' | 'metallicRoughness' | 'ambientOcclusion' | 'emissive'

type UploadedTextureRecord = {
  texture: Texture
  url: string
  fileName: string
}

const getUploadedTextures = (material: PBRMaterial) => {
  material.metadata = material.metadata || {}
  material.metadata.dtaaUploadedTextures ??= {}
  return material.metadata.dtaaUploadedTextures as Partial<Record<PbrTextureSlot, UploadedTextureRecord>>
}

const getTextureForSlot = (material: PBRMaterial, slot: PbrTextureSlot) => {
  if (slot === 'albedo') return material.albedoTexture
  if (slot === 'normal') return material.bumpTexture
  if (slot === 'metallicRoughness') return material.metallicTexture
  if (slot === 'ambientOcclusion') return material.ambientTexture
  return material.emissiveTexture
}

const setTextureForSlot = (material: PBRMaterial, slot: PbrTextureSlot, texture: Texture | null) => {
  if (slot === 'albedo') material.albedoTexture = texture
  if (slot === 'normal') material.bumpTexture = texture
  if (slot === 'metallicRoughness') material.metallicTexture = texture
  if (slot === 'ambientOcclusion') material.ambientTexture = texture
  if (slot === 'emissive') material.emissiveTexture = texture
  material.markAsDirty(Material.TextureDirtyFlag)
}

const releaseUploadedTexture = (material: PBRMaterial, slot: PbrTextureSlot) => {
  const uploaded = getUploadedTextures(material)
  const record = uploaded[slot]
  if (!record) return
  record.texture.dispose()
  URL.revokeObjectURL(record.url)
  delete uploaded[slot]
}

const uploadTexture = (
  material: PBRMaterial,
  params: Params,
  slot: PbrTextureSlot,
  file: File,
) => {
  releaseUploadedTexture(material, slot)
  const url = URL.createObjectURL(file)
  const extensionMatch = file.name.toLowerCase().match(/(\.[a-z0-9]+)$/)
  const texture = new Texture(url, material.getScene(), {
    noMipmap: false,
    invertY: false,
    samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
    mimeType: file.type || undefined,
    forcedExtension: extensionMatch?.[1],
    gammaSpace: slot === 'albedo' || slot === 'emissive',
  })
  texture.name = file.name
  texture.uScale = params.uvScaleU
  texture.vScale = params.uvScaleV
  if (slot === 'normal') texture.level = params.normalStrength
  if (slot === 'metallicRoughness') {
    material.useMetallnessFromMetallicTextureBlue = true
    material.useRoughnessFromMetallicTextureGreen = true
    material.useRoughnessFromMetallicTextureAlpha = false
  }
  getUploadedTextures(material)[slot] = { texture, url, fileName: file.name }
  setTextureForSlot(material, slot, texture)
}

const createTextureDetailItem = (
  material: PBRMaterial,
  params: Params,
  label: string,
  slot: PbrTextureSlot,
) => {
  const uploaded = getUploadedTextures(material)[slot]
  const texture = getTextureForSlot(material, slot)
  const fileName = uploaded?.fileName ?? texture?.name ?? null
  const previewUrl = uploaded?.url ?? (texture instanceof Texture ? texture.url : null)
  return textureItem(
    label,
    fileName,
    previewUrl,
    (file) => uploadTexture(material, params, slot, file),
    () => {
      releaseUploadedTexture(material, slot)
      setTextureForSlot(material, slot, null)
    },
  )
}

export const isDitherFadeMaterial = (
  material: AbstractMesh['material'],
): material is PBRMaterial =>
  material instanceof PBRMaterial && material.metadata?.contentMaterial === materialKey

export const getDitherFadeOpacity = (material: PBRMaterial) =>
  getParams(material).opacity

export const setDitherFadeOpacity = (material: PBRMaterial, opacity: number) => {
  const params = getParams(material)
  params.opacity = Math.max(0, Math.min(1, opacity))
  applyParams(material, params)
}

export const syncDitherFadeProjection = (
  target: PBRMaterial,
  source: PBRMaterial,
) => {
  if (!isDitherFadeMaterial(source)) {
    return false
  }

  const sourceParams = getParams(source)
  let targetParams = target.metadata?.ditherFadeParams as Params | undefined
  if (!targetParams) {
    targetParams = {
      ...sourceParams,
      baseColor: sourceParams.baseColor.clone(),
      emissiveColor: sourceParams.emissiveColor.clone(),
    }
  } else {
    targetParams.baseColor.copyFrom(sourceParams.baseColor)
    targetParams.emissiveColor.copyFrom(sourceParams.emissiveColor)
    targetParams.opacity = sourceParams.opacity
    targetParams.metallic = sourceParams.metallic
    targetParams.roughness = sourceParams.roughness
    targetParams.ambientStrength = sourceParams.ambientStrength
    targetParams.directIntensity = sourceParams.directIntensity
    targetParams.specularIntensity = sourceParams.specularIntensity
    targetParams.normalStrength = sourceParams.normalStrength
    targetParams.ambientOcclusionStrength = sourceParams.ambientOcclusionStrength
    targetParams.uvScaleU = sourceParams.uvScaleU
    targetParams.uvScaleV = sourceParams.uvScaleV
  }

  let plugin = getPlugin(target)
  if (!plugin) {
    plugin = new DitherFadePlugin(
      target,
      target.getScene(),
      targetParams.opacity,
      targetParams.uvScaleU,
      targetParams.uvScaleV,
    )
  }
  target.metadata = {
    ...target.metadata,
    contentMaterial: materialKey,
    originalMaterialName: source.name,
    ditherFadeParams: targetParams,
    ditherFadePlugin: plugin,
    clippingCapProjection: true,
  }
  applyParams(target, targetParams)
  return true
}

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

  const createMaterial = (source: Material | null) => {
    if (isDitherFadeMaterial(source)) {
      applyParams(source, getParams(source))
      return source
    }

    const params = createParams(source)
    const material = source instanceof PBRMaterial
      ? source.clone('DTAA透明', true)
      : new PBRMaterial('DTAA透明', scene)
    const plugin = new DitherFadePlugin(
      material,
      scene,
      params.opacity,
      params.uvScaleU,
      params.uvScaleV,
    )

    material.metadata = {
      ...material.metadata,
      contentMaterial: materialKey,
      originalMaterialName: source?.name ?? null,
      ditherFadeParams: params,
      ditherFadePlugin: plugin,
    }
    material.alpha = 1
    material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE
    material.forceDepthWrite = true
    applyParams(material, params)
    return material
  }

  if (previousMaterial instanceof MultiMaterial) {
    const converted = previousMaterial.clone(`${previousMaterial.name}_DTAA`)
    converted.subMaterials = previousMaterial.subMaterials.map((subMaterial) =>
      subMaterial instanceof Material ? createMaterial(subMaterial) : null
    )
    mesh.material = converted
    mesh.receiveShadows = true
    return converted
  }

  const material = createMaterial(previousMaterial)
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
    title: 'DTAA透明',
    kind: 'DTAA透明材质',
    sections: [
      {
        title: 'PBR 基础',
        items: [
          numberItem('透明度', params.opacity, 0, 1, 0.01, updateNumber('opacity')),
          colorItem('基础颜色', params.baseColor, (value) => {
            params.baseColor = value
            applyParams(material, params)
          }),
          colorItem('自发光颜色', params.emissiveColor, (value) => {
            params.emissiveColor = value
            applyParams(material, params)
          }),
          numberItem('金属度', params.metallic, 0, 1, 0.01, updateNumber('metallic')),
          numberItem('粗糙度', params.roughness, 0, 1, 0.01, updateNumber('roughness')),
          numberItem('环境亮度', params.ambientStrength, 0, 1, 0.01, updateNumber('ambientStrength')),
          numberItem('直接光照', params.directIntensity, 0, 2, 0.01, updateNumber('directIntensity')),
          numberItem('高光强度', params.specularIntensity, 0, 2, 0.01, updateNumber('specularIntensity')),
        ],
      },
      {
        title: 'PBR 贴图',
        items: [
          createTextureDetailItem(material, params, '基础颜色', 'albedo'),
          createTextureDetailItem(material, params, '法线', 'normal'),
          createTextureDetailItem(material, params, '金属/粗糙度', 'metallicRoughness'),
          createTextureDetailItem(material, params, '环境遮蔽 AO', 'ambientOcclusion'),
          createTextureDetailItem(material, params, '自发光', 'emissive'),
          numberItem('法线强度', params.normalStrength, 0, 3, 0.01, updateNumber('normalStrength')),
          numberItem('AO 强度', params.ambientOcclusionStrength, 0, 2, 0.01, updateNumber('ambientOcclusionStrength')),
          numberItem('U', params.uvScaleU, 0.01, 50, 0.01, updateNumber('uvScaleU')),
          numberItem('V', params.uvScaleV, 0.01, 50, 0.01, updateNumber('uvScaleV')),
        ],
      },
      {
        title: '来源',
        items: [
          textItem('类型', 'material.dtaa'),
          textItem('原材质', material.metadata?.originalMaterialName ?? '无'),
        ],
      },
    ],
  }
}
