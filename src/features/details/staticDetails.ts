import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import type { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import type { ClassicPipeline } from '../../core/pipeline'
import type { EnvironmentState } from '../environment/environmentController'
import type { DetailDescriptor, EnvironmentOption } from '../../shared/types'
import { checkboxItem, colorItem, numberItem, selectItem, textItem, vectorItems } from '../../ui/detailPanel'

type DetailRegistry = Map<string, () => DetailDescriptor>

type LightHelperControls = {
  isVisible: () => boolean
  setVisible: (value: boolean) => void
  update: () => void
}

type StaticDetailsOptions = {
  detailRegistry: DetailRegistry
  getImportedFileName: () => string
  getImportedMeshCount: () => number
  getImportedMaterialTotal: () => number
  camera: ArcRotateCamera
  hemiLight: HemisphericLight
  sunLight: DirectionalLight
  hemiLightHelper: LightHelperControls
  sunLightHelper: LightHelperControls
  getShadowMapSize: () => number
  setShadowMapSize: (value: number) => void
  getShadowBias: () => number
  setShadowBias: (value: number) => void
  scene: Scene
  imageProcessing: ImageProcessingConfiguration
  pipeline: ClassicPipeline
  hdrEnvironmentOptions: EnvironmentOption[]
  getEnvironmentState: () => EnvironmentState
  setSceneEnvironmentTexture: (environmentKey: string) => void
  setGlobalEnvironmentIntensity: (value: number) => void
  getCurrentEnvironmentLabel: () => string
  getCurrentEnvironmentUrl: () => string
}

export const registerStaticDetails = ({
  detailRegistry,
  getImportedFileName,
  getImportedMeshCount,
  getImportedMaterialTotal,
  camera,
  hemiLight,
  sunLight,
  hemiLightHelper,
  sunLightHelper,
  getShadowMapSize,
  setShadowMapSize,
  getShadowBias,
  setShadowBias,
  scene,
  imageProcessing,
  pipeline,
  hdrEnvironmentOptions,
  getEnvironmentState,
  setSceneEnvironmentTexture,
  setGlobalEnvironmentIntensity,
  getCurrentEnvironmentLabel,
  getCurrentEnvironmentUrl,
}: StaticDetailsOptions) => {
  detailRegistry.set('model:building', () => ({
    title: getImportedFileName(),
    kind: '\u6a21\u578b',
    sections: [
      {
        title: '\u8d44\u6e90',
        items: [
          textItem('\u6587\u4ef6', getImportedFileName()),
          textItem('\u7f51\u683c', String(getImportedMeshCount())),
          textItem('\u6750\u8d28', String(getImportedMaterialTotal())),
        ],
      },
    ],
  }))

  detailRegistry.set('camera:main', () => ({
    title: camera.name,
    kind: '\u6444\u50cf\u673a',
    sections: [
      {
        title: '\u955c\u5934',
        items: [
          numberItem('FOV', camera.fov, 0.1, 1.6, 0.01, (value) => {
            camera.fov = value
          }),
          numberItem('\u534a\u5f84', camera.radius, camera.lowerRadiusLimit ?? 0.03, Math.max(camera.upperRadiusLimit ?? 500, 1), 0.1, (value) => {
            camera.radius = value
          }),
          numberItem('Alpha', camera.alpha, -Math.PI * 2, Math.PI * 2, 0.01, (value) => {
            camera.alpha = value
          }),
          numberItem('Beta', camera.beta, camera.lowerBetaLimit ?? 0.01, camera.upperBetaLimit ?? Math.PI, 0.01, (value) => {
            camera.beta = value
          }),
          numberItem('minZ', camera.minZ, 0.001, 100, 0.001, (value) => {
            camera.minZ = value
          }),
          numberItem('maxZ', camera.maxZ, 10, 50000, 1, (value) => {
            camera.maxZ = value
          }),
        ],
      },
      {
        title: '\u76ee\u6807',
        items: vectorItems(camera.target, ['X', 'Y', 'Z'], -200, 200, 0.01),
      },
      {
        title: '\u63a7\u5236',
        items: [
          numberItem('\u6eda\u8f6e\u7cbe\u5ea6', camera.wheelPrecision, 1, 80, 1, (value) => {
            camera.wheelDeltaPercentage = 0
            camera.wheelPrecision = value
          }),
          numberItem('\u5e73\u79fb\u7075\u654f\u5ea6', camera.panningSensibility, 1, 200, 1, (value) => {
            camera.panningSensibility = value
          }),
        ],
      },
    ],
  }))

  detailRegistry.set('light:hemi', () => ({
    title: hemiLight.name,
    kind: '\u73af\u5883\u5149',
    sections: [
      {
        title: '\u5149\u7167',
        items: [
          numberItem('\u5f3a\u5ea6', hemiLight.intensity, 0, 3, 0.01, (value) => {
            hemiLight.intensity = value
          }),
          colorItem('Diffuse', hemiLight.diffuse, (value) => {
            hemiLight.diffuse = value
          }),
          colorItem('Ground', hemiLight.groundColor, (value) => {
            hemiLight.groundColor = value
          }),
        ],
      },
      {
        title: '\u65b9\u5411',
        items: [
          checkboxItem('\u65b9\u5411\u53ef\u89c6\u5316', hemiLightHelper.isVisible(), (value) => {
            hemiLightHelper.setVisible(value)
            hemiLightHelper.update()
          }),
          ...vectorItems(hemiLight.direction, ['X', 'Y', 'Z'], -1, 1, 0.01, hemiLightHelper.update),
        ],
      },
    ],
  }))

  detailRegistry.set('light:sun', () => ({
    title: sunLight.name,
    kind: '\u65b9\u5411\u5149',
    sections: [
      {
        title: '\u5149\u7167',
        items: [
          numberItem('\u5f3a\u5ea6', sunLight.intensity, 0, 10, 0.01, (value) => {
            sunLight.intensity = value
          }),
          colorItem('Diffuse', sunLight.diffuse, (value) => {
            sunLight.diffuse = value
          }),
          colorItem('Specular', sunLight.specular, (value) => {
            sunLight.specular = value
          }),
        ],
      },
      {
        title: '\u65b9\u5411',
        items: [
          checkboxItem('\u65b9\u5411\u53ef\u89c6\u5316', sunLightHelper.isVisible(), (value) => {
            sunLightHelper.setVisible(value)
            sunLightHelper.update()
          }),
          ...vectorItems(sunLight.direction, ['X', 'Y', 'Z'], -1, 1, 0.01, sunLightHelper.update),
        ],
      },
      {
        title: '\u4f4d\u7f6e',
        items: vectorItems(sunLight.position, ['X', 'Y', 'Z'], -200, 200, 0.01),
      },
      {
        title: '\u9634\u5f71',
        items: [
          numberItem('\u8d28\u91cf', getShadowMapSize(), 512, 4096, 512, setShadowMapSize),
          numberItem('Bias', getShadowBias(), 0, 0.01, 0.0001, setShadowBias),
        ],
      },
    ],
  }))

  detailRegistry.set('world:main', () => ({
    title: 'World',
    kind: 'World',
    sections: [
      {
        title: '\u73af\u5883',
        items: [
          ...(hdrEnvironmentOptions.length > 0
            ? [
                selectItem(
                  'HDR',
                  getEnvironmentState().selectedEnvironmentKey ?? '',
                  hdrEnvironmentOptions.map((option) => ({
                    label: option.label,
                    value: option.key,
                  })),
                  setSceneEnvironmentTexture,
                ),
              ]
            : []),
          numberItem(
            '\u73af\u5883\u5f3a\u5ea6',
            getEnvironmentState().globalEnvironmentIntensity,
            0,
            2,
            0.01,
            setGlobalEnvironmentIntensity,
          ),
          colorItem('\u80cc\u666f\u8272', scene.clearColor, (value) => {
            scene.clearColor = new Color4(value.r, value.g, value.b, 1)
          }),
        ],
      },
      {
        title: '\u753b\u9762',
        items: [
          numberItem('Exposure', imageProcessing.exposure, 0, 3, 0.01, (value) => {
            imageProcessing.exposure = value
            pipeline.imageProcessing.exposure = value
          }),
          numberItem('Contrast', imageProcessing.contrast, 0, 3, 0.01, (value) => {
            imageProcessing.contrast = value
            pipeline.imageProcessing.contrast = value
          }),
          checkboxItem('Dithering', imageProcessing.ditheringEnabled, (value) => {
            imageProcessing.ditheringEnabled = value
            pipeline.imageProcessing.ditheringEnabled = value
          }),
        ],
      },
    ],
  }))

  detailRegistry.set('texture:environment', () => ({
    title: getCurrentEnvironmentLabel(),
    kind: '\u73af\u5883\u8d34\u56fe',
    sections: [
      {
        title: '\u8d44\u6e90',
        items: [
          textItem('URL', getCurrentEnvironmentUrl()),
          textItem('\u7c7b\u578b', hdrEnvironmentOptions.length > 0 ? 'HDRCubeTexture' : 'Prefiltered CubeTexture'),
        ],
      },
    ],
  }))

  detailRegistry.set('color:image-processing', () => ({
    title: 'KHR PBR Neutral',
    kind: '\u8272\u5f69\u7ba1\u7406',
    sections: [
      {
        title: '\u8c03\u6574',
        items: [
          checkboxItem('Tone Mapping', imageProcessing.toneMappingEnabled, (value) => {
            imageProcessing.toneMappingEnabled = value
            pipeline.imageProcessing.toneMappingEnabled = value
          }),
          numberItem('Exposure', imageProcessing.exposure, 0, 3, 0.01, (value) => {
            imageProcessing.exposure = value
            pipeline.imageProcessing.exposure = value
          }),
          numberItem('Contrast', imageProcessing.contrast, 0, 3, 0.01, (value) => {
            imageProcessing.contrast = value
            pipeline.imageProcessing.contrast = value
          }),
        ],
      },
    ],
  }))

  detailRegistry.set('pipeline:classic', () => ({
    title: pipeline.name,
    kind: '\u6e32\u67d3\u7ba1\u7ebf',
    sections: [
      {
        title: '\u6297\u952f\u9f7f',
        items: [
          numberItem('Samples', pipeline.samples, 1, 8, 1, (value) => {
            pipeline.samples = Math.round(value)
          }),
          checkboxItem('FXAA', pipeline.fxaaEnabled, (value) => {
            pipeline.fxaaEnabled = value
          }),
        ],
      },
      {
        title: '\u6548\u679c',
        items: [
          checkboxItem('Bloom', pipeline.bloomEnabled, (value) => {
            pipeline.bloomEnabled = value
          }),
          checkboxItem('Sharpen', pipeline.sharpenEnabled, (value) => {
            pipeline.sharpenEnabled = value
          }),
          checkboxItem('Grain', pipeline.grainEnabled, (value) => {
            pipeline.grainEnabled = value
          }),
        ],
      },
    ],
  }))
}
