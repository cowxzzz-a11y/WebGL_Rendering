import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import type { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import type { EnvironmentOption } from '../../shared/types'
import { createCheckbox, createColorInput, createModule, createNumberInput, createSelect, createSlider } from '../../ui/controls'

type GeneralPanelOptions = {
  activeSubTab: string
  setActiveSubTab: (value: string) => void
  hdrEnvironmentOptions: EnvironmentOption[]
  selectedEnvironmentKey: string
  environmentBackgroundEnabled: boolean
  environmentRotationY: number
  globalEnvironmentIntensity: number
  imageProcessing: ImageProcessingConfiguration
  pipeline: DefaultRenderingPipeline
  hemiLight: HemisphericLight
  getCurrentEnvironmentUrl: () => string
  getClearColor: () => Color4
  setClearColor: (value: Color4) => void
  setSceneEnvironmentTexture: (value: string) => void
  setEnvironmentBackgroundEnabled: (value: boolean) => void
  setEnvironmentRotationY: (value: number) => void
  setGlobalEnvironmentIntensity: (value: number) => void
  updateEnvironmentBackground: () => void
  applyEnvironmentRotation: () => void
  resetHemiLightHelper: () => void
  setHemiLightHelperVisible: (value: boolean) => void
  getHemiLightHelperVisible: () => boolean
  updateLightDirectionHelpers: () => void
}

export const renderGeneralPanelContent = ({
  activeSubTab,
  setActiveSubTab,
  hdrEnvironmentOptions,
  selectedEnvironmentKey,
  environmentBackgroundEnabled,
  environmentRotationY,
  globalEnvironmentIntensity,
  imageProcessing,
  pipeline,
  hemiLight,
  getCurrentEnvironmentUrl,
  getClearColor,
  setClearColor,
  setSceneEnvironmentTexture,
  setEnvironmentBackgroundEnabled,
  setEnvironmentRotationY,
  setGlobalEnvironmentIntensity,
  updateEnvironmentBackground,
  applyEnvironmentRotation,
  resetHemiLightHelper,
  setHemiLightHelperVisible,
  getHemiLightHelperVisible,
  updateLightDirectionHelpers,
}: GeneralPanelOptions) => {
  const panel = document.createElement('div')
  panel.className = 'tech-panel'
  const subTabs = document.createElement('div')
  subTabs.className = 'tech-sub-tabs'
  const postPanel = document.createElement('div')
  const environmentPanel = document.createElement('div')

  ;['\u73af\u5883', '\u540e\u671f'].forEach((label) => {
    const button = document.createElement('button')
    button.className = 'tech-sub-tab'
    button.textContent = label
    button.ariaSelected = String(label === activeSubTab)
    button.addEventListener('click', () => {
      setActiveSubTab(label)
      subTabs.querySelectorAll('.tech-sub-tab').forEach((tab) => {
        ;(tab as HTMLElement).ariaSelected = String((tab as HTMLElement).textContent === label)
      })
      postPanel.hidden = label !== '\u540e\u671f'
      environmentPanel.hidden = label !== '\u73af\u5883'
    })
    subTabs.append(button)
  })

  renderGeneralPostPanel(postPanel, {
    imageProcessing,
    pipeline,
    getClearColor,
    setClearColor,
  })
  renderGeneralEnvironmentPanel(environmentPanel, {
    hdrEnvironmentOptions,
    selectedEnvironmentKey,
    environmentBackgroundEnabled,
    environmentRotationY,
    globalEnvironmentIntensity,
    hemiLight,
    getCurrentEnvironmentUrl,
    setSceneEnvironmentTexture,
    setEnvironmentBackgroundEnabled,
    setEnvironmentRotationY,
    setGlobalEnvironmentIntensity,
    updateEnvironmentBackground,
    applyEnvironmentRotation,
    resetHemiLightHelper,
    setHemiLightHelperVisible,
    getHemiLightHelperVisible,
    updateLightDirectionHelpers,
  })

  postPanel.hidden = activeSubTab !== '\u540e\u671f'
  environmentPanel.hidden = activeSubTab !== '\u73af\u5883'
  panel.append(subTabs, environmentPanel, postPanel)
  return panel
}

const renderGeneralPostPanel = (
  panel: HTMLElement,
  {
    imageProcessing,
    pipeline,
    getClearColor,
    setClearColor,
  }: Pick<GeneralPanelOptions, 'imageProcessing' | 'pipeline' | 'getClearColor' | 'setClearColor'>,
) => {
  const postBody: HTMLElement[] = []
  const clearColor = getClearColor()

  postBody.push(createColorInput('\u80cc\u666f\u8272', new Color3(clearColor.r, clearColor.g, clearColor.b), (color) => {
    setClearColor(new Color4(color.r, color.g, color.b, 1))
  }))
  postBody.push(createSlider('Exposure', imageProcessing.exposure, 0, 3, 0.01, (value) => {
    imageProcessing.exposure = value
    pipeline.imageProcessing.exposure = value
  }))
  postBody.push(createSlider('Contrast', imageProcessing.contrast, 0, 3, 0.01, (value) => {
    imageProcessing.contrast = value
    pipeline.imageProcessing.contrast = value
  }))
  postBody.push(createCheckbox('Tone Mapping', imageProcessing.toneMappingEnabled, (value) => {
    imageProcessing.toneMappingEnabled = value
    pipeline.imageProcessing.toneMappingEnabled = value
  }))
  postBody.push(createCheckbox('Dithering', imageProcessing.ditheringEnabled, (value) => {
    imageProcessing.ditheringEnabled = value
    pipeline.imageProcessing.ditheringEnabled = value
  }))

  panel.append(createModule('\u540e\u671f', postBody))
}

const renderGeneralEnvironmentPanel = (
  panel: HTMLElement,
  {
    hdrEnvironmentOptions,
    selectedEnvironmentKey,
    environmentBackgroundEnabled,
    environmentRotationY,
    globalEnvironmentIntensity,
    hemiLight,
    getCurrentEnvironmentUrl,
    setSceneEnvironmentTexture,
    setEnvironmentBackgroundEnabled,
    setEnvironmentRotationY,
    setGlobalEnvironmentIntensity,
    updateEnvironmentBackground,
    applyEnvironmentRotation,
    resetHemiLightHelper,
    setHemiLightHelperVisible,
    getHemiLightHelperVisible,
    updateLightDirectionHelpers,
  }: Omit<GeneralPanelOptions, 'activeSubTab' | 'setActiveSubTab' | 'imageProcessing' | 'pipeline' | 'getClearColor' | 'setClearColor'>,
) => {
  const environmentBody: HTMLElement[] = []

  if (hdrEnvironmentOptions.length > 0) {
    environmentBody.push(
      createSelect(
        'HDR',
        hdrEnvironmentOptions.map((option) => option.key),
        selectedEnvironmentKey ?? hdrEnvironmentOptions[0].key,
        (value) => setSceneEnvironmentTexture(value),
      ),
    )
  }

  environmentBody.push(createCheckbox('\u663e\u793a\u73af\u5883\u80cc\u666f', environmentBackgroundEnabled, (value) => {
    setEnvironmentBackgroundEnabled(value)
    updateEnvironmentBackground()
  }))
  environmentBody.push(createSlider('HDR \u65cb\u8f6c', environmentRotationY, -180, 180, 1, (value) => {
    setEnvironmentRotationY(value)
    applyEnvironmentRotation()
  }))
  environmentBody.push(createSlider('\u73af\u5883\u5f3a\u5ea6', globalEnvironmentIntensity, 0, 2, 0.01, (value) => {
    setGlobalEnvironmentIntensity(value)
  }))

  const sourceRow = document.createElement('div')
  sourceRow.className = 'tech-row tech-row-stack'
  const sourceLabel = document.createElement('span')
  sourceLabel.className = 'tech-label'
  sourceLabel.textContent = 'Source'
  const sourceValue = document.createElement('span')
  sourceValue.className = 'tech-text'
  sourceValue.textContent = getCurrentEnvironmentUrl()
  sourceRow.append(sourceLabel, sourceValue)
  environmentBody.push(sourceRow)
  panel.append(createModule('\u73af\u5883', environmentBody))

  const hemiBody: HTMLElement[] = []
  resetHemiLightHelper()
  hemiBody.push(createSlider('\u534a\u7403\u5149\u5f3a\u5ea6', hemiLight.intensity, 0, 3, 0.01, (value) => {
    hemiLight.intensity = value
  }))
  hemiBody.push(createColorInput('Diffuse', hemiLight.diffuse, (value) => {
    hemiLight.diffuse = value
  }))
  hemiBody.push(createColorInput('Ground', hemiLight.groundColor, (value) => {
    hemiLight.groundColor = value
  }))

  const directionRow = document.createElement('div')
  directionRow.className = 'tech-row'
  const directionLabel = document.createElement('span')
  directionLabel.className = 'tech-label'
  directionLabel.textContent = '\u65b9\u5411'
  const directionWrap = document.createElement('div')
  directionWrap.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;flex:1'
  ;(['x', 'y', 'z'] as const).forEach((axis) => {
    const input = document.createElement('input')
    input.type = 'number'
    input.step = '0.01'
    input.min = '-1'
    input.max = '1'
    input.value = String(hemiLight.direction[axis])
    input.style.cssText = 'min-width:0;width:100%'
    input.addEventListener('input', () => {
      const value = Number.parseFloat(input.value)
      if (!Number.isNaN(value)) {
        hemiLight.direction[axis] = value
        updateLightDirectionHelpers()
      }
    })
    directionWrap.append(input)
  })
  directionRow.append(directionLabel, directionWrap)
  hemiBody.push(directionRow)
  hemiBody.push(createCheckbox('\u65b9\u5411\u53ef\u89c6\u5316', getHemiLightHelperVisible(), (value) => {
    setHemiLightHelperVisible(value)
    updateLightDirectionHelpers()
  }))
  panel.append(createModule('\u534a\u7403\u5149', hemiBody))
}

export const buildCameraPanelContent = (camera: ArcRotateCamera) => {
  const panel = document.createElement('div')
  panel.className = 'tech-panel'

  const lensBody: HTMLElement[] = []
  lensBody.push(createSlider('FOV', camera.fov, 0.1, 1.6, 0.01, (value) => {
    camera.fov = value
  }))
  lensBody.push(createSlider('\u534a\u5f84', camera.radius, 0.35, Math.max(camera.upperRadiusLimit ?? 500, 1), 0.1, (value) => {
    camera.radius = value
  }))
  lensBody.push(createSlider('Alpha', camera.alpha, -Math.PI * 2, Math.PI * 2, 0.01, (value) => {
    camera.alpha = value
  }))
  lensBody.push(createSlider('Beta', camera.beta, camera.lowerBetaLimit ?? 0.01, camera.upperBetaLimit ?? Math.PI, 0.01, (value) => {
    camera.beta = value
  }))
  lensBody.push(createNumberInput('minZ', camera.minZ, 0.001, 100, 0.001, (value) => {
    camera.minZ = value
  }))
  lensBody.push(createNumberInput('maxZ', camera.maxZ, 10, 50000, 1, (value) => {
    camera.maxZ = value
  }))

  const targetBody: HTMLElement[] = []
  ;(['x', 'y', 'z'] as const).forEach((axis) => {
    targetBody.push(createNumberInput(axis.toUpperCase(), camera.target[axis], -200, 200, 0.01, (value) => {
      camera.target[axis] = value
    }))
  })

  const controlsBody: HTMLElement[] = []
  controlsBody.push(createSlider('\u6eda\u8f6e\u7cbe\u5ea6', camera.wheelPrecision, 1, 80, 1, (value) => {
    camera.wheelPrecision = value
  }))
  controlsBody.push(createSlider('\u5e73\u79fb\u7075\u654f\u5ea6', camera.panningSensibility, 1, 200, 1, (value) => {
    camera.panningSensibility = value
  }))

  panel.append(createModule('\u955c\u5934', lensBody))
  panel.append(createModule('\u76ee\u6807', targetBody))
  panel.append(createModule('\u63a7\u5236', controlsBody))
  return panel
}

type ViewportPanelOptions = {
  activeSubTab: string
  setActiveSubTab: (value: string) => void
  camera: ArcRotateCamera
  renderBillboardPanel: (panel: HTMLElement) => void
}

export const renderViewportPanelContent = ({
  activeSubTab,
  setActiveSubTab,
  camera,
  renderBillboardPanel,
}: ViewportPanelOptions) => {
  const panel = document.createElement('div')
  panel.className = 'tech-panel'
  const subTabs = document.createElement('div')
  subTabs.className = 'tech-sub-tabs'
  const cameraPanel = document.createElement('div')
  const billboardPanel = document.createElement('div')

  ;['\u6444\u50cf\u673a', '\u5e7f\u544a\u724c'].forEach((label) => {
    const button = document.createElement('button')
    button.className = 'tech-sub-tab'
    button.textContent = label
    button.ariaSelected = String(label === activeSubTab)
    button.addEventListener('click', () => {
      setActiveSubTab(label)
      subTabs.querySelectorAll('.tech-sub-tab').forEach((tab) => {
        ;(tab as HTMLElement).ariaSelected = String((tab as HTMLElement).textContent === label)
      })
      cameraPanel.hidden = label !== '\u6444\u50cf\u673a'
      billboardPanel.hidden = label !== '\u5e7f\u544a\u724c'
      if (label === '\u5e7f\u544a\u724c') {
        renderBillboardPanel(billboardPanel)
      }
    })
    subTabs.append(button)
  })

  cameraPanel.append(buildCameraPanelContent(camera))
  renderBillboardPanel(billboardPanel)
  cameraPanel.hidden = activeSubTab !== '\u6444\u50cf\u673a'
  billboardPanel.hidden = activeSubTab !== '\u5e7f\u544a\u724c'
  panel.append(subTabs, cameraPanel, billboardPanel)
  return panel
}
