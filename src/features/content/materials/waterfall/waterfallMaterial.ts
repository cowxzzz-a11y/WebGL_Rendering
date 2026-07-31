import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { DetailDescriptor } from '../../../../shared/types'
import { colorItem, numberItem, textItem } from '../../../../ui/detailPanel'

const waterfallVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 v_WorldPos;
varying vec3 v_WorldNormal;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  v_WorldPos = worldPosition.xyz;
  v_WorldNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const waterfallFragmentShader = `
precision highp float;

uniform float u_Time;
uniform vec3 u_CameraPos;
uniform vec3 u_LightDir;
uniform vec3 u_LightColor;
uniform vec3 u_WaterColor;
uniform vec3 u_DeepColor;
uniform vec3 u_FoamColor;
uniform vec3 u_BoundsMin;
uniform vec3 u_BoundsSize;
uniform vec3 u_CrossAxis;
uniform float u_CrossOrigin;
uniform float u_CrossSize;
uniform float u_FlowSpeed;
uniform float u_PatternScale;
uniform float u_StreakDensity;
uniform float u_Turbulence;
uniform float u_FoamAmount;
uniform float u_Opacity;
uniform float u_FresnelStrength;
uniform float u_EnvironmentIntensity;

varying vec3 v_WorldPos;
varying vec3 v_WorldNormal;

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
    p = p * 2.03 + vec2(7.13, 3.71);
    amplitude *= 0.5;
  }

  return value;
}

void main(void) {
  float safeHeight = max(u_BoundsSize.y, 0.001);
  float height01 = clamp((v_WorldPos.y - u_BoundsMin.y) / safeHeight, 0.0, 1.0);
  float cross01 = (dot(v_WorldPos, u_CrossAxis) - u_CrossOrigin) / max(u_CrossSize, 0.001);
  float scale = max(u_PatternScale, 0.05);
  float time = u_Time * u_FlowSpeed;

  // Positive time in the world-Y coordinate makes the features travel downward.
  float fallCoord = height01 * (8.0 / scale) + time;
  float broadWarp = fbm(vec2(cross01 * 2.1, fallCoord * 0.16 + time * 0.08)) - 0.5;
  float fineWarp = noise(vec2(cross01 * 7.0, fallCoord * 0.42)) - 0.5;
  float warpedCross = cross01 + (broadWarp * 0.16 + fineWarp * 0.035) * u_Turbulence;

  float density = max(u_StreakDensity, 1.0);
  float curtain = fbm(vec2(warpedCross * density, fallCoord * 0.72));
  float narrowStreaks = fbm(vec2(warpedCross * density * 2.7 + 4.2, fallCoord * 1.12));
  float brokenFlow = fbm(vec2(warpedCross * density * 0.62 - 3.4, fallCoord * 1.7));
  float longRibbons = smoothstep(0.48, 0.9, curtain);
  float thinRibbons = smoothstep(0.67, 0.96, narrowStreaks);
  float droplets = smoothstep(0.72, 0.98, brokenFlow)
    * smoothstep(0.08, 0.42, height01)
    * (1.0 - smoothstep(0.68, 0.98, height01));

  float edgeNoise = noise(vec2(cross01 * 8.0, time * 0.55));
  float topFoam = smoothstep(0.79 - edgeNoise * 0.04, 1.0, height01);
  float bottomFoam = 1.0 - smoothstep(0.0, 0.22 + edgeNoise * 0.055, height01);
  float impactBursts = smoothstep(
    0.48,
    0.92,
    fbm(vec2(warpedCross * density * 1.35, height01 * 5.0 - time * 1.8))
  ) * bottomFoam;
  float foam = clamp(
    (topFoam * 0.5 + bottomFoam * 0.82 + impactBursts * 0.65 + thinRibbons * 0.2)
      * u_FoamAmount,
    0.0,
    1.0
  );

  // Break up the perfectly rectangular GLB silhouette without requiring UVs.
  float sideDistance = min(cross01, 1.0 - cross01);
  float sideBreakup = fbm(vec2(height01 * 5.4 - time * 0.32, cross01 * 2.0));
  float sideWidth = 0.018 + sideBreakup * 0.045;
  float sideMask = smoothstep(sideWidth, sideWidth + 0.055, sideDistance);

  vec3 meshNormal = normalize(v_WorldNormal);
  vec3 viewDir = normalize(u_CameraPos - v_WorldPos);
  float fresnel = pow(1.0 - abs(dot(meshNormal, viewDir)), 2.35) * u_FresnelStrength;
  float diffuse = max(dot(meshNormal, u_LightDir), 0.0);
  float flowBrightness = 0.38 + longRibbons * 0.34 + thinRibbons * 0.28 + droplets * 0.18;

  vec3 color = mix(u_DeepColor, u_WaterColor, flowBrightness);
  color *= 0.58 + u_EnvironmentIntensity * 0.28 + diffuse * 0.3;
  color += u_LightColor * (thinRibbons * 0.14 + fresnel * 0.3);
  color = mix(color, u_FoamColor, foam);

  float alphaTexture = 0.5 + longRibbons * 0.27 + thinRibbons * 0.16 + foam * 0.2;
  float alpha = clamp((u_Opacity * alphaTexture + fresnel * 0.08) * sideMask, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`

const waterfallMaterialKey = 'viewer.content.material.waterfall'

type WaterfallParams = {
  waterColor: Color3
  deepColor: Color3
  foamColor: Color3
  flowSpeed: number
  patternScale: number
  streakDensity: number
  turbulence: number
  foamAmount: number
  opacity: number
  fresnelStrength: number
}

type WaterfallNumberParam =
  | 'flowSpeed'
  | 'patternScale'
  | 'streakDensity'
  | 'turbulence'
  | 'foamAmount'
  | 'opacity'
  | 'fresnelStrength'

type WaterfallMaterialOptions = {
  scene: Scene
  camera: ArcRotateCamera
  sunLight: DirectionalLight
  mesh: AbstractMesh
}

const createDefaultWaterfallParams = (): WaterfallParams => ({
  waterColor: new Color3(0.18, 0.66, 0.78),
  deepColor: new Color3(0.015, 0.16, 0.22),
  foamColor: new Color3(0.9, 0.99, 1.0),
  flowSpeed: 1.35,
  patternScale: 1,
  streakDensity: 9,
  turbulence: 0.72,
  foamAmount: 0.9,
  opacity: 0.86,
  fresnelStrength: 0.72,
})

const getWaterfallParams = (material: ShaderMaterial): WaterfallParams => {
  if (!material.metadata?.waterfallParams) {
    material.metadata = {
      ...material.metadata,
      waterfallParams: createDefaultWaterfallParams(),
    }
  }

  return material.metadata.waterfallParams as WaterfallParams
}

const applyWaterfallParams = (material: ShaderMaterial, params: WaterfallParams) => {
  material.setColor3('u_WaterColor', params.waterColor)
  material.setColor3('u_DeepColor', params.deepColor)
  material.setColor3('u_FoamColor', params.foamColor)
  material.setFloat('u_FlowSpeed', params.flowSpeed)
  material.setFloat('u_PatternScale', params.patternScale)
  material.setFloat('u_StreakDensity', params.streakDensity)
  material.setFloat('u_Turbulence', params.turbulence)
  material.setFloat('u_FoamAmount', params.foamAmount)
  material.setFloat('u_Opacity', params.opacity)
  material.setFloat('u_FresnelStrength', params.fresnelStrength)
  material.alpha = params.opacity
}

const updateAutomaticProjection = (material: ShaderMaterial, mesh: AbstractMesh) => {
  mesh.computeWorldMatrix(true)
  mesh.refreshBoundingInfo(true, false)
  const bounds = mesh.getBoundingInfo().boundingBox
  const minimum = bounds.minimumWorld
  const maximum = bounds.maximumWorld
  const size = maximum.subtract(minimum)
  const useWorldX = size.x >= size.z
  const crossAxis = useWorldX ? Vector3.Right() : Vector3.Forward()

  material.setVector3('u_BoundsMin', minimum)
  material.setVector3('u_BoundsSize', size)
  material.setVector3('u_CrossAxis', crossAxis)
  material.setFloat('u_CrossOrigin', useWorldX ? minimum.x : minimum.z)
  material.setFloat('u_CrossSize', Math.max(useWorldX ? size.x : size.z, 0.001))
}

export const isWaterfallMaterial = (material: AbstractMesh['material']): material is ShaderMaterial =>
  material instanceof ShaderMaterial && material.metadata?.contentMaterial === waterfallMaterialKey

export const applyWaterfallMaterial = ({
  scene,
  camera,
  sunLight,
  mesh,
}: WaterfallMaterialOptions) => {
  const previousMaterial = mesh.material

  if (isWaterfallMaterial(previousMaterial)) {
    previousMaterial.dispose()
  }

  const startedAt = performance.now()
  const material = new ShaderMaterial(
    `Waterfall_${mesh.uniqueId}`,
    scene,
    {
      vertexSource: waterfallVertexShader,
      fragmentSource: waterfallFragmentShader,
    },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'world',
        'worldViewProjection',
        'u_Time',
        'u_CameraPos',
        'u_LightDir',
        'u_LightColor',
        'u_WaterColor',
        'u_DeepColor',
        'u_FoamColor',
        'u_BoundsMin',
        'u_BoundsSize',
        'u_CrossAxis',
        'u_CrossOrigin',
        'u_CrossSize',
        'u_FlowSpeed',
        'u_PatternScale',
        'u_StreakDensity',
        'u_Turbulence',
        'u_FoamAmount',
        'u_Opacity',
        'u_FresnelStrength',
        'u_EnvironmentIntensity',
      ],
      needAlphaBlending: true,
    },
  )

  material.metadata = {
    contentMaterial: waterfallMaterialKey,
    originalMaterialName: previousMaterial?.name ?? null,
    waterfallParams: createDefaultWaterfallParams(),
  }
  material.backFaceCulling = false
  material.forceDepthWrite = false
  applyWaterfallParams(material, getWaterfallParams(material))
  updateAutomaticProjection(material, mesh)

  material.onBindObservable.add(() => {
    material.setFloat('u_Time', (performance.now() - startedAt) / 1000)
    material.setVector3('u_CameraPos', camera.globalPosition)
    material.setVector3('u_LightDir', sunLight.direction.negate().normalize())
    material.setColor3('u_LightColor', sunLight.diffuse ?? Color3.White())
    material.setFloat('u_EnvironmentIntensity', scene.environmentIntensity)
    updateAutomaticProjection(material, mesh)
  })

  mesh.material = material
  mesh.receiveShadows = false

  return material
}

export const createWaterfallMaterialDetail = (material: ShaderMaterial): DetailDescriptor => {
  const params = getWaterfallParams(material)
  const updateNumber = (key: WaterfallNumberParam) => (value: number) => {
    params[key] = value
    applyWaterfallParams(material, params)
  }
  const updateColor = (key: 'waterColor' | 'deepColor' | 'foamColor') => (value: Color3) => {
    params[key] = value
    applyWaterfallParams(material, params)
  }

  return {
    title: material.name,
    kind: '瀑布材质',
    sections: [
      {
        title: '颜色',
        items: [
          colorItem('水体颜色', params.waterColor, updateColor('waterColor')),
          colorItem('深水颜色', params.deepColor, updateColor('deepColor')),
          colorItem('泡沫颜色', params.foamColor, updateColor('foamColor')),
        ],
      },
      {
        title: '流动',
        items: [
          numberItem('下落速度', params.flowSpeed, 0, 4, 0.01, updateNumber('flowSpeed')),
          numberItem('整体纹理大小', params.patternScale, 0.1, 10, 0.05, updateNumber('patternScale')),
          numberItem('水丝密度', params.streakDensity, 1, 24, 0.1, updateNumber('streakDensity')),
          numberItem('扰动强度', params.turbulence, 0, 2, 0.01, updateNumber('turbulence')),
        ],
      },
      {
        title: '表面',
        items: [
          numberItem('泡沫强度', params.foamAmount, 0, 2, 0.01, updateNumber('foamAmount')),
          numberItem('透明度', params.opacity, 0, 1, 0.01, updateNumber('opacity')),
          numberItem('边缘反光', params.fresnelStrength, 0, 2, 0.01, updateNumber('fresnelStrength')),
        ],
      },
      {
        title: '自动投影',
        items: [
          textItem('流动方向', '世界重力向下（-Y）'),
          textItem('上下边界', '自动读取当前网格包围盒'),
          textItem('UV', '无需模型 UV'),
        ],
      },
      {
        title: '来源',
        items: [
          textItem('类型', 'material.waterfall'),
          textItem('原材质', material.metadata?.originalMaterialName ?? '无'),
        ],
      },
    ],
  }
}
