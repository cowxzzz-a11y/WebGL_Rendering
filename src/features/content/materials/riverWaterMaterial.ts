import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { DetailDescriptor } from '../../../shared/types'
import { colorItem, numberItem, selectItem, textItem } from '../../../ui/detailPanel'

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
  float time = u_Time * u_NormalSpeed;

  vec3 waterNormal = sampleWaterNormal(waterPos, time);
  vec3 normal = normalize(mix(meshNormal, waterNormal, clamp(u_NormalStrength, 0.0, 1.0)));

  float depthNoise = fbm(waterPos * 0.18 + vec2(time * 0.08, -time * 0.05));
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
  float sideReflectionA = pow(max(dot(viewDir, normalize(vec3(0.84, 0.42, 0.34))), 0.0), 3.0);
  float sideReflectionB = pow(max(dot(viewDir, normalize(vec3(-0.72, 0.5, 0.48))), 0.0), 3.4);
  float horizonSheen = pow(1.0 - abs(dot(viewDir, meshNormal)), 2.1);

  float streamLines = fbm(vec2(waterPos.x * 1.8 + time * u_FlowSpeed * 2.0, waterPos.y * 9.0));
  float foamBands = smoothstep(0.72, 0.95, streamLines);
  float foamEdges = smoothstep(0.54, 0.72, fbm(waterPos * vec2(0.42, 2.6) + vec2(time * 0.6, 0.0)));
  float foam = clamp((foamBands * 0.7 + foamEdges * 0.3) * u_FoamAmount, 0.0, 1.0);
  float microSparkle = smoothstep(0.72, 1.0, fbm(waterPos * 4.8 + vec2(time * 1.2, time * 0.35)));
  float angleSparkle = pow(max(dot(viewDir, normalize(vec3(0.2, 0.92, 0.18))), 0.0), 2.2);
  float multiAngleSheen = (sideReflectionA + sideReflectionB + horizonSheen * 0.35) * u_MultiAngleReflection;
  float sparkle = (tightSpec + broadSpec + microSparkle * angleSparkle * 0.16 + multiAngleSheen * 0.24) * u_GlintStrength * (0.35 + envFactor);

  vec3 reflection = u_SkyColor * envFactor * (0.22 + fresnel * 0.7 + multiAngleSheen * 0.18);
  float diffuse = max(dot(normal, u_LightDir), 0.0);
  vec3 lighting = waterColor * (u_AmbientStrength * modeEnvMask + envFactor * 0.18 + diffuse * 0.22 * (0.28 + modeEnvMask * 0.72));
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
}

const createDefaultRiverWaterParams = (): RiverWaterParams => ({
  shallowColor: new Color3(0.08, 0.42, 0.36),
  deepColor: new Color3(0.0, 0.09, 0.16),
  foamColor: new Color3(0.88, 0.98, 0.95),
  normalStrength: 0.85,
  normalTiling: 16,
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

  return material.metadata.riverWaterParams as RiverWaterParams
}

const applyRiverWaterParams = (material: ShaderMaterial, params: RiverWaterParams) => {
  const environmentMode = params.environmentMode === 'scene' ? 1 : params.environmentMode === 'mixed' ? 2 : 0

  material.setColor3('u_ShallowColor', params.shallowColor)
  material.setColor3('u_DeepColor', params.deepColor)
  material.setColor3('u_FoamColor', params.foamColor)
  material.setFloat('u_NormalStrength', params.normalStrength)
  material.setFloat('u_NormalTiling', params.normalTiling)
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
}: RiverWaterMaterialOptions) => {
  const previousMaterial = mesh.material

  if (isRiverWaterMaterial(previousMaterial)) {
    previousMaterial.dispose()
  }

  const startedAt = performance.now()
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
      ],
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

  material.onBindObservable.add(() => {
    material.setFloat('u_Time', (performance.now() - startedAt) / 1000)
    material.setVector3('u_CameraPos', camera.globalPosition)
    material.setVector3('u_LightDir', sunLight.direction.negate().normalize())
    material.setFloat('u_SceneEnvironmentIntensity', scene.environmentIntensity)
  })

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
