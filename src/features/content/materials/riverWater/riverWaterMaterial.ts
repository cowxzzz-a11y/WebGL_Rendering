import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Plane } from '@babylonjs/core/Maths/math.plane'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture'
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { DetailDescriptor } from '../../../../shared/types'
import { colorItem, numberItem, selectItem, textItem } from '../../../../ui/detailPanel'

const riverWaterVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 v_WorldPos;
varying vec3 v_WorldNormal;
varying vec2 v_UV;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  v_WorldPos = worldPosition.xyz;
  v_WorldNormal = normalize(mat3(world) * normal);
  v_UV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const riverWaterFragmentShader = `
precision highp float;

uniform float u_Time;
uniform vec3 u_CameraPos;
uniform vec3 u_ShallowColor;
uniform vec3 u_DeepColor;
uniform vec3 u_FoamColor;
uniform vec3 u_LightDir;
uniform vec3 u_LightColor;
uniform vec3 u_SkyColor;
uniform float u_NormalStrength;
uniform float u_NormalTiling;
uniform float u_WaveScale;
uniform float u_NormalSpeed;
uniform float u_FlowSpeed;
uniform float u_FoamAmount;
uniform float u_FresnelPower;
uniform float u_FresnelStrength;
uniform float u_Opacity;
uniform float u_EnvironmentMode;
uniform float u_SceneEnvironmentIntensity;
uniform float u_OwnEnvironmentIntensity;
uniform float u_AmbientStrength;
uniform float u_GlintStrength;
uniform float u_MultiAngleReflection;
uniform float u_ReflectionEnabled;
uniform mat4 view;
uniform mat4 u_ReflectionMatrix;
uniform sampler2D u_ReflectionSampler;

varying vec3 v_WorldPos;
varying vec3 v_WorldNormal;
varying vec2 v_UV;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += noise(p) * amplitude;
    p *= 2.03;
    amplitude *= 0.5;
  }

  return value;
}

float riverWaveHeight(vec2 p, float time) {
  vec2 flowA = vec2(p.x * 0.74 + time * u_FlowSpeed, p.y * 1.18 - time * 0.18);
  vec2 flowB = vec2(p.x * -0.34 + time * 0.42, p.y * 0.86 + time * u_FlowSpeed);
  float large = fbm(flowA * u_NormalTiling * 0.09);
  float detail = fbm(flowB * u_NormalTiling * 0.22);
  float ripple = sin((p.x * 2.2 + p.y * 0.7) * u_NormalTiling * 0.18 + time * 3.4);
  return large * 0.62 + detail * 0.32 + ripple * 0.06;
}

vec3 sampleWaterNormal(vec2 p, float time) {
  float e = 0.08;
  float h = riverWaveHeight(p, time);
  float hx = riverWaveHeight(p + vec2(e, 0.0), time) - h;
  float hy = riverWaveHeight(p + vec2(0.0, e), time) - h;
  return normalize(vec3(-hx * u_NormalStrength, 0.42, -hy * u_NormalStrength));
}

void main(void) {
  vec3 viewDir = normalize(u_CameraPos - v_WorldPos);
  vec3 meshNormal = normalize(v_WorldNormal);
  vec2 waterPos = v_WorldPos.xz + v_UV * 0.35;
  vec2 patternPos = waterPos / max(u_WaveScale, 0.01);
  float time = u_Time * u_NormalSpeed;

  vec3 waterNormal = sampleWaterNormal(patternPos, time);
  vec3 normal = normalize(mix(meshNormal, waterNormal, clamp(u_NormalStrength, 0.0, 1.0)));

  float depthNoise = fbm(patternPos * 0.18 + vec2(time * 0.08, -time * 0.05));
  vec3 waterColor = mix(u_ShallowColor, u_DeepColor, smoothstep(0.18, 0.92, depthNoise));

  float sceneEnv = clamp(u_SceneEnvironmentIntensity, 0.0, 3.0);
  float ownEnv = clamp(u_OwnEnvironmentIntensity, 0.0, 3.0);
  float modeEnvMask = u_EnvironmentMode > 0.5 && u_EnvironmentMode < 1.5 ? sceneEnv : 1.0;
  float envFactor = ownEnv;
  if (u_EnvironmentMode > 0.5 && u_EnvironmentMode < 1.5) {
    envFactor = sceneEnv;
  } else if (u_EnvironmentMode >= 1.5) {
    envFactor = max(sceneEnv, ownEnv * 0.62);
  }

  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), u_FresnelPower) * u_FresnelStrength;
  vec3 halfDir = normalize(viewDir + u_LightDir);
  float tightSpec = pow(max(dot(reflect(-u_LightDir, normal), viewDir), 0.0), 64.0);
  float broadSpec = pow(max(dot(normal, halfDir), 0.0), 9.0) * 0.22;
  float sideReflectionA = pow(abs(dot(viewDir, normalize(vec3(0.84, 0.42, 0.34)))), 2.2);
  float sideReflectionB = pow(abs(dot(viewDir, normalize(vec3(-0.72, 0.5, 0.48)))), 2.4);
  float sideReflectionC = pow(abs(dot(viewDir, normalize(vec3(0.22, 0.64, -0.74)))), 2.0);
  float sideReflectionD = pow(abs(dot(viewDir, normalize(vec3(-0.38, 0.58, -0.72)))), 2.1);
  float horizonSheen = pow(1.0 - abs(dot(viewDir, meshNormal)), 1.35);

  float streamLines = fbm(vec2(patternPos.x * 1.8 + time * u_FlowSpeed * 2.0, patternPos.y * 9.0));
  float foamBands = smoothstep(0.72, 0.95, streamLines);
  float foamEdges = smoothstep(0.54, 0.72, fbm(patternPos * vec2(0.42, 2.6) + vec2(time * 0.6, 0.0)));
  float foam = clamp((foamBands * 0.7 + foamEdges * 0.3) * u_FoamAmount, 0.0, 1.0);

  float microSparkle = smoothstep(0.62, 1.0, fbm(patternPos * 4.8 + vec2(time * 1.2, time * 0.35)));
  float fineSparkle = smoothstep(0.74, 0.99, fbm(patternPos * 7.0 + vec2(time * 1.35, -time * 0.45)));
  vec2 elongatedA = vec2(patternPos.x * 0.36 + patternPos.y * 0.08, patternPos.y * 2.4 - time * 0.55);
  vec2 elongatedB = vec2(patternPos.x * -0.24 + patternPos.y * 0.14, patternPos.y * 1.8 + time * 0.38);
  float longHighlightA = smoothstep(0.68, 0.94, fbm(elongatedA * 1.6));
  float longHighlightB = smoothstep(0.74, 0.97, fbm(elongatedB * 2.1));
  float brokenHighlights = (longHighlightA * 0.56 + longHighlightB * 0.34 + fineSparkle * 0.18)
    * (0.38 + fbm(patternPos * 3.2 + vec2(time * 0.35, -time * 0.22)) * 0.72);
  float waveRidges = smoothstep(0.66, 0.92, abs(riverWaveHeight(patternPos * 0.56, time) - riverWaveHeight(patternPos * 0.56 + vec2(0.28, -0.19), time)) * 2.8);
  float angleSparkle = 0.42 + 0.58 * pow(abs(dot(viewDir, normalize(vec3(0.2, 0.92, 0.18)))), 1.35);
  float omniSparkle = (microSparkle * 0.32 + fineSparkle * 0.28 + waveRidges * 0.4) * (0.55 + horizonSheen * 0.45);
  float multiAngleSheen = (sideReflectionA + sideReflectionB + sideReflectionC + sideReflectionD + horizonSheen * 0.62) * 0.42 * u_MultiAngleReflection;
  float alwaysOnReflection = clamp((brokenHighlights * 0.5 + omniSparkle * 0.28 + waveRidges * 0.18) * u_MultiAngleReflection, 0.0, 0.9);
  float sparkle = (tightSpec * 0.42 + broadSpec * 0.75 + omniSparkle * angleSparkle * 0.34 + multiAngleSheen * 0.22 + alwaysOnReflection * 0.78) * u_GlintStrength * (0.55 + envFactor);

  vec3 reflectionTint = mix(u_SkyColor, vec3(1.0, 1.0, 0.96), 0.58);
  vec3 fallbackReflection = u_SkyColor * envFactor * (0.46 + fresnel * 0.42 + multiAngleSheen * 0.14 + omniSparkle * 0.12)
    + reflectionTint * alwaysOnReflection * (0.38 + envFactor * 0.34);

  vec3 reflectionUVW = vec3(u_ReflectionMatrix * (view * vec4(v_WorldPos, 1.0)));
    vec2 reflectionUV = reflectionUVW.xy / reflectionUVW.z;
  reflectionUV.y = 1.0 - reflectionUV.y;
  reflectionUV += waterNormal.xz * (0.008 + u_NormalStrength * 0.006);
  float reflectionInBounds =
    step(0.0, reflectionUV.x) * step(reflectionUV.x, 1.0) *
    step(0.0, reflectionUV.y) * step(reflectionUV.y, 1.0);
  vec3 planarReflection = texture2D(u_ReflectionSampler, clamp(reflectionUV, vec2(0.002), vec2(0.998))).rgb;
  float planarAmount = clamp(
    (0.55 + fresnel * 0.52 + horizonSheen * 0.14 + multiAngleSheen * 0.06) *
    reflectionInBounds * u_ReflectionEnabled,
    0.0,
    0.94
  );
  vec3 reflection = mix(
    fallbackReflection,
    planarReflection * (0.72 + envFactor * 0.22),
    planarAmount
  );
  float diffuse = max(dot(normal, u_LightDir), 0.0);
  vec3 lighting = waterColor * (u_AmbientStrength * modeEnvMask + envFactor * 0.18 + diffuse * 0.22 * (0.28 + modeEnvMask * 0.72));
  lighting *= 1.0 - planarAmount * 0.42;
  vec3 color = lighting + reflection + u_LightColor * sparkle * 0.75 * (0.18 + modeEnvMask * 0.82);
  color = mix(color, u_FoamColor, foam);

  float alpha = clamp(u_Opacity + fresnel * 0.18 + foam * 0.08, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`

const customWaterMaterialKey = 'viewer.content.material.riverWater'

type RiverWaterParams = {
  shallowColor: Color3
  deepColor: Color3
  foamColor: Color3
  normalStrength: number
  normalTiling: number
  waveScale: number
  normalSpeed: number
  flowSpeed: number
  foamAmount: number
  fresnelPower: number
  fresnelStrength: number
  opacity: number
  environmentMode: 'own' | 'scene' | 'mixed'
  ownEnvironmentIntensity: number
  ambientStrength: number
  glintStrength: number
  multiAngleReflection: number
}

type RiverWaterNumberParam =
  | 'normalStrength'
  | 'normalTiling'
  | 'waveScale'
  | 'normalSpeed'
  | 'flowSpeed'
  | 'foamAmount'
  | 'fresnelPower'
  | 'fresnelStrength'
  | 'opacity'
  | 'ownEnvironmentIntensity'
  | 'ambientStrength'
  | 'glintStrength'
  | 'multiAngleReflection'

type RiverWaterMaterialOptions = {
  scene: Scene
  camera: ArcRotateCamera
  sunLight: DirectionalLight
  mesh: AbstractMesh
  waveScale?: number
}

const createDefaultRiverWaterParams = (): RiverWaterParams => ({
  shallowColor: new Color3(0.08, 0.42, 0.36),
  deepColor: new Color3(0.0, 0.09, 0.16),
  foamColor: new Color3(0.88, 0.98, 0.95),
  normalStrength: 0.85,
  normalTiling: 16,
  waveScale: 1,
  normalSpeed: 0.72,
  flowSpeed: 0.55,
  foamAmount: 0.42,
  fresnelPower: 4.5,
  fresnelStrength: 0.78,
  opacity: 0.82,
  environmentMode: 'mixed',
  ownEnvironmentIntensity: 0.9,
  ambientStrength: 0.48,
  glintStrength: 0.72,
  multiAngleReflection: 0.85,
})

const getRiverWaterParams = (material: ShaderMaterial): RiverWaterParams => {
  if (!material.metadata?.riverWaterParams) {
    material.metadata = {
      ...material.metadata,
      riverWaterParams: createDefaultRiverWaterParams(),
    }
  }

  const params = material.metadata.riverWaterParams as RiverWaterParams
  if (!Number.isFinite(params.waveScale)) {
    params.waveScale = 1
  }
  return params
}

const applyRiverWaterParams = (material: ShaderMaterial, params: RiverWaterParams) => {
  const environmentMode = params.environmentMode === 'scene' ? 1 : params.environmentMode === 'mixed' ? 2 : 0

  material.setColor3('u_ShallowColor', params.shallowColor)
  material.setColor3('u_DeepColor', params.deepColor)
  material.setColor3('u_FoamColor', params.foamColor)
  material.setFloat('u_NormalStrength', params.normalStrength)
  material.setFloat('u_NormalTiling', params.normalTiling)
  material.setFloat('u_WaveScale', params.waveScale)
  material.setFloat('u_NormalSpeed', params.normalSpeed)
  material.setFloat('u_FlowSpeed', params.flowSpeed)
  material.setFloat('u_FoamAmount', params.foamAmount)
  material.setFloat('u_FresnelPower', params.fresnelPower)
  material.setFloat('u_FresnelStrength', params.fresnelStrength)
  material.setFloat('u_Opacity', params.opacity)
  material.setFloat('u_EnvironmentMode', environmentMode)
  material.setFloat('u_OwnEnvironmentIntensity', params.ownEnvironmentIntensity)
  material.setFloat('u_AmbientStrength', params.ambientStrength)
  material.setFloat('u_GlintStrength', params.glintStrength)
  material.setFloat('u_MultiAngleReflection', params.multiAngleReflection)
  material.alpha = params.opacity
}

const setRiverWaterDefaults = (material: ShaderMaterial, sunLight: DirectionalLight) => {
  const lightDir = sunLight.direction.negate().normalize()
  const params = createDefaultRiverWaterParams()

  material.metadata = {
    ...material.metadata,
    riverWaterParams: params,
  }
  applyRiverWaterParams(material, params)
  material.setVector3('u_LightDir', lightDir)
  material.setColor3('u_LightColor', sunLight.diffuse ?? new Color3(1, 0.86, 0.58))
  material.setColor3('u_SkyColor', new Color3(0.18, 0.48, 0.7))
}

export const isRiverWaterMaterial = (material: AbstractMesh['material']): material is ShaderMaterial =>
  material instanceof ShaderMaterial && material.metadata?.contentMaterial === customWaterMaterialKey

export const applyRiverWaterMaterial = ({
  scene,
  camera,
  sunLight,
  mesh,
  waveScale,
}: RiverWaterMaterialOptions) => {
  const previousMaterial = mesh.material

  if (isRiverWaterMaterial(previousMaterial)) {
    previousMaterial.dispose()
  }

  const startedAt = performance.now()
  const waterCenter = mesh.getBoundingInfo().boundingBox.centerWorld
  const reflectionTexture = new MirrorTexture(
    `RiverWaterReflection_${mesh.uniqueId}`,
    { ratio: 0.5 },
    scene,
    true,
  )
  reflectionTexture.mirrorPlane = new Plane(0, -1, 0, waterCenter.y + 0.02)
  reflectionTexture.renderList = scene.meshes.filter((candidate) =>
    candidate !== mesh && !candidate.isDisposed() && candidate.material !== null
  )
  reflectionTexture.wrapU = Texture.CLAMP_ADDRESSMODE
  reflectionTexture.wrapV = Texture.CLAMP_ADDRESSMODE
  reflectionTexture.anisotropicFilteringLevel = 1
  reflectionTexture.clearColor = new Color4(0.18, 0.48, 0.7, 1)

  const material = new ShaderMaterial(
    `RiverWater_${mesh.uniqueId}`,
    scene,
    {
      vertexSource: riverWaterVertexShader,
      fragmentSource: riverWaterFragmentShader,
    },
    {
      attributes: ['position', 'normal', 'uv'],
      uniforms: [
        'world',
        'worldViewProjection',
        'u_Time',
        'u_CameraPos',
        'u_ShallowColor',
        'u_DeepColor',
        'u_FoamColor',
        'u_LightDir',
        'u_LightColor',
        'u_SkyColor',
        'u_NormalStrength',
        'u_NormalTiling',
        'u_WaveScale',
        'u_NormalSpeed',
        'u_FlowSpeed',
        'u_FoamAmount',
        'u_FresnelPower',
        'u_FresnelStrength',
        'u_Opacity',
        'u_EnvironmentMode',
        'u_SceneEnvironmentIntensity',
        'u_OwnEnvironmentIntensity',
        'u_AmbientStrength',
        'u_GlintStrength',
        'u_MultiAngleReflection',
        'u_ReflectionEnabled',
        'u_ReflectionMatrix',
        'view',
      ],
      samplers: ['u_ReflectionSampler'],
      needAlphaBlending: true,
    },
  )

  material.metadata = {
    contentMaterial: customWaterMaterialKey,
    originalMaterialName: previousMaterial?.name ?? null,
  }
  material.backFaceCulling = false
  material.alpha = 0.82
  setRiverWaterDefaults(material, sunLight)
  if (Number.isFinite(waveScale)) {
    const params = getRiverWaterParams(material)
    params.waveScale = Math.min(20, Math.max(0.1, waveScale as number))
    applyRiverWaterParams(material, params)
  }
  material.setTexture('u_ReflectionSampler', reflectionTexture)

  material.onBindObservable.add(() => {
    const realtimeReflectionEnabled = sunLight.intensity > 0
    reflectionTexture.refreshRate = realtimeReflectionEnabled
      ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
      : RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    material.setFloat('u_Time', (performance.now() - startedAt) / 1000)
    material.setVector3('u_CameraPos', camera.globalPosition)
    material.setVector3('u_LightDir', sunLight.direction.negate().normalize())
    material.setFloat('u_SceneEnvironmentIntensity', scene.environmentIntensity)
    material.setFloat('u_ReflectionEnabled', realtimeReflectionEnabled ? 1 : 0)
    material.setMatrix('u_ReflectionMatrix', reflectionTexture.getReflectionTextureMatrix())
  })

  let reflectionDisposed = false
  const disposeReflection = () => {
    if (reflectionDisposed) return
    reflectionDisposed = true
    reflectionTexture.dispose()
  }
  material.onDisposeObservable.add(disposeReflection)
  mesh.onDisposeObservable.add(disposeReflection)

  mesh.material = material
  mesh.receiveShadows = false

  return material
}

export const createRiverWaterMaterialDetail = (material: ShaderMaterial): DetailDescriptor => {
  const params = getRiverWaterParams(material)
  const updateNumber = (key: RiverWaterNumberParam) => (value: number) => {
    params[key] = value
    applyRiverWaterParams(material, params)
  }
  const updateColor = (key: 'shallowColor' | 'deepColor' | 'foamColor') => (value: Color3) => {
    params[key] = value
    applyRiverWaterParams(material, params)
  }
  const updateEnvironmentMode = (value: string) => {
    params.environmentMode = value === 'scene' || value === 'mixed' ? value : 'own'
    applyRiverWaterParams(material, params)
  }

  return {
    title: material.name,
    kind: '河流水材质',
    sections: [
      {
        title: '颜色',
        items: [
          colorItem('浅水色', params.shallowColor, updateColor('shallowColor')),
          colorItem('深水色', params.deepColor, updateColor('deepColor')),
          colorItem('泡沫色', params.foamColor, updateColor('foamColor')),
        ],
      },
      {
        title: '流动',
        items: [
          numberItem('流速', params.flowSpeed, 0, 3, 0.01, updateNumber('flowSpeed')),
          numberItem('动画速度', params.normalSpeed, 0, 3, 0.01, updateNumber('normalSpeed')),
          numberItem('整体波纹大小', params.waveScale, 0.1, 20, 0.05, updateNumber('waveScale')),
          numberItem('波纹密度', params.normalTiling, 1, 48, 0.5, updateNumber('normalTiling')),
          numberItem('法线强度', params.normalStrength, 0, 2, 0.01, updateNumber('normalStrength')),
        ],
      },
      {
        title: '表面',
        items: [
          numberItem('泡沫强度', params.foamAmount, 0, 2, 0.01, updateNumber('foamAmount')),
          numberItem('透明度', params.opacity, 0, 1, 0.01, updateNumber('opacity')),
          numberItem('菲涅尔范围', params.fresnelPower, 0.5, 10, 0.1, updateNumber('fresnelPower')),
          numberItem('菲涅尔强度', params.fresnelStrength, 0, 2, 0.01, updateNumber('fresnelStrength')),
        ],
      },
      {
        title: '环境反射',
        items: [
          selectItem('环境模式', params.environmentMode, [
            { label: '内置反射', value: 'own' },
            { label: '跟随场景 HDR', value: 'scene' },
            { label: '混合', value: 'mixed' },
          ], updateEnvironmentMode),
          numberItem('内置环境强度', params.ownEnvironmentIntensity, 0, 2, 0.01, updateNumber('ownEnvironmentIntensity')),
          numberItem('基础亮度', params.ambientStrength, 0, 1.5, 0.01, updateNumber('ambientStrength')),
          numberItem('泛高光强度', params.glintStrength, 0, 2, 0.01, updateNumber('glintStrength')),
          numberItem('多角度反射', params.multiAngleReflection, 0, 2, 0.01, updateNumber('multiAngleReflection')),
        ],
      },
      {
        title: '来源',
        items: [
          textItem('类型', 'material.riverWater'),
          textItem('原材质', material.metadata?.originalMaterialName ?? '无'),
        ],
      },
    ],
  }
}
