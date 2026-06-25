import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { createCheckbox, createColorInput, createModule, createSelect, createSlider } from '../../ui/controls'

type RealtimePanelOptions = {
  panel: HTMLElement
  sunLight: DirectionalLight
  getShadowGenerator: () => ShadowGenerator | undefined
  ensureShadowGenerator: () => ShadowGenerator | undefined
  getRealtimeEffectsEnabled: () => boolean
  setRealtimeEffectsEnabled: (value: boolean) => void
  getShadowEnabled: () => boolean
  setShadowEnabled: (value: boolean) => void
  getShadowFilterMode: () => number
  setShadowFilterMode: (value: number) => void
  getShadowMapSize: () => number
  setShadowMapSize: (value: number) => void
  getSsaoEnabled: () => boolean
  setSsaoEnabled: (value: boolean) => void
  getSsaoStrength: () => number
  setSsaoStrength: (value: number) => void
  getSsaoRadius: () => number
  setSsaoRadius: (value: number) => void
  getSsaoSamples: () => number
  setSsaoSamples: (value: number) => void
  applySsaoSettings: () => void
  flushSceneRenderCaches: () => void
  refreshImportedRenderingState: () => void
  applyRealtimeEffectsState: () => void
  resetSunLightHelper: () => void
  setSunLightHelperVisible: (value: boolean) => void
  getSunLightHelperVisible: () => boolean
  updateLightDirectionHelpers: () => void
}

const createRangeNumberRow = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const text = document.createElement('span')
  text.className = 'tech-label'
  text.textContent = label
  const range = document.createElement('input')
  range.type = 'range'
  range.min = String(min)
  range.max = String(max)
  range.step = String(step)
  range.value = String(value)
  const number = document.createElement('input')
  number.type = 'number'
  number.className = 'tech-number'
  number.min = String(min)
  number.max = String(max)
  number.step = String(step)
  number.value = String(value)
  const sync = (nextValue: number) => {
    onChange(nextValue)
    range.value = String(nextValue)
    number.value = String(nextValue)
  }

  range.addEventListener('input', () => sync(Number.parseFloat(range.value)))
  number.addEventListener('change', () => sync(Number.parseFloat(number.value)))
  row.append(text, range, number)
  return row
}

export const renderRealtimePanel = ({
  panel,
  sunLight,
  getShadowGenerator,
  ensureShadowGenerator,
  getRealtimeEffectsEnabled,
  setRealtimeEffectsEnabled,
  getShadowEnabled,
  setShadowEnabled,
  getShadowFilterMode,
  setShadowFilterMode,
  getShadowMapSize,
  setShadowMapSize,
  getSsaoEnabled,
  setSsaoEnabled,
  getSsaoStrength,
  setSsaoStrength,
  getSsaoRadius,
  setSsaoRadius,
  getSsaoSamples,
  setSsaoSamples,
  applySsaoSettings,
  flushSceneRenderCaches,
  refreshImportedRenderingState,
  applyRealtimeEffectsState,
  resetSunLightHelper,
  setSunLightHelperVisible,
  getSunLightHelperVisible,
  updateLightDirectionHelpers,
}: RealtimePanelOptions) => {
  const realtimeBody: HTMLElement[] = []
  realtimeBody.push(createCheckbox('\u5b9e\u65f6\u6e32\u67d3\u603b\u5f00\u5173', getRealtimeEffectsEnabled(), (value) => {
    setRealtimeEffectsEnabled(value)
    applyRealtimeEffectsState()
  }))
  panel.append(createModule('\u5b9e\u65f6\u6e32\u67d3', realtimeBody))

  const sunBody: HTMLElement[] = []
  resetSunLightHelper()
  sunBody.push(createColorInput('\u5149\u6e90\u989c\u8272', sunLight.diffuse, (color) => { sunLight.diffuse = color }))
  sunBody.push(createColorInput('Specular', sunLight.specular, (color) => { sunLight.specular = color }))
  sunBody.push(createSlider('\u5149\u6e90\u5f3a\u5ea6', sunLight.intensity, 0, 10, 0.01, (value) => { sunLight.intensity = value }))
  sunBody.push(createCheckbox('\u65b9\u5411\u53ef\u89c6\u5316', getSunLightHelperVisible(), (value) => {
    setSunLightHelperVisible(value)
    updateLightDirectionHelpers()
  }))

  const dirRow = document.createElement('div')
  dirRow.className = 'tech-row'
  const dirLabel = document.createElement('span')
  dirLabel.className = 'tech-label'
  dirLabel.textContent = '\u65b9\u5411'
  const dirVals = document.createElement('div')
  dirVals.style.cssText = 'display:flex;gap:4px;flex:1'
  ;['X', 'Y', 'Z'].forEach((axis, index) => {
    const axisWrap = document.createElement('div')
    axisWrap.style.cssText = 'display:flex;align-items:center;gap:2px'
    const axisLabel = document.createElement('span')
    axisLabel.style.cssText = 'font-size:10px;color:#9aa4a1;width:12px'
    axisLabel.textContent = axis
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '-1'
    input.max = '1'
    input.step = '0.01'
    input.value = String(sunLight.direction.asArray()[index])
    input.style.cssText = 'width:100%'
    input.addEventListener('input', () => {
      const values = sunLight.direction.asArray()
      values[index] = Number.parseFloat(input.value)
      sunLight.direction = Vector3.FromArray(values)
      updateLightDirectionHelpers()
    })
    axisWrap.append(axisLabel, input)
    dirVals.append(axisWrap)
  })
  dirRow.append(dirLabel, dirVals)
  sunBody.push(dirRow)

  const positionRow = document.createElement('div')
  positionRow.className = 'tech-row'
  const positionLabel = document.createElement('span')
  positionLabel.className = 'tech-label'
  positionLabel.textContent = '\u4f4d\u7f6e'
  const positionVals = document.createElement('div')
  positionVals.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;flex:1'
  ;(['x', 'y', 'z'] as const).forEach((axis) => {
    const input = document.createElement('input')
    input.type = 'number'
    input.step = '0.01'
    input.min = '-200'
    input.max = '200'
    input.value = String(sunLight.position[axis])
    input.style.cssText = 'min-width:0;width:100%'
    input.addEventListener('input', () => {
      const value = Number.parseFloat(input.value)
      if (!Number.isNaN(value)) {
        sunLight.position[axis] = value
      }
    })
    positionVals.append(input)
  })
  positionRow.append(positionLabel, positionVals)
  sunBody.push(positionRow)
  panel.append(createModule('\u592a\u9633\u5149', sunBody))

  const shadowBody: HTMLElement[] = []
  shadowBody.push(createCheckbox('\u9634\u5f71\u5f00\u5173', getShadowEnabled(), (value) => {
    setShadowEnabled(value)
    flushSceneRenderCaches()
  }))

  const filterNames = ['PCF', 'PCSS', 'ESM']
  const filterMap: Record<string, number> = { PCF: 6, PCSS: 7, ESM: 1 }
  const currentFilter = filterNames.find((key) => filterMap[key] === getShadowFilterMode()) || 'PCF'
  shadowBody.push(createSelect('\u9634\u5f71\u7c7b\u578b', filterNames, currentFilter, (value) => {
    const nextMode = filterMap[value]
    const shadowGenerator = ensureShadowGenerator()
    setShadowFilterMode(nextMode)
    if (!shadowGenerator) {
      return
    }
    if (nextMode === 1) {
      shadowGenerator.useExponentialShadowMap = true
    } else if (nextMode === 6) {
      shadowGenerator.usePercentageCloserFiltering = true
    } else if (nextMode === 7) {
      shadowGenerator.useContactHardeningShadow = true
    }
  }))

  shadowBody.push(createSlider('\u9634\u5f71\u900f\u660e\u5ea6', getShadowGenerator()?.darkness ?? 0, 0, 1, 0.01, (value) => {
    const shadowGenerator = ensureShadowGenerator()
    if (shadowGenerator) shadowGenerator.darkness = value
  }))
  shadowBody.push(createSlider('Bias', getShadowGenerator()?.bias ?? 0.0001, 0, 0.01, 0.0001, (value) => {
    const shadowGenerator = ensureShadowGenerator()
    if (shadowGenerator) shadowGenerator.bias = value
  }))
  shadowBody.push(createSlider('\u6b63\u5e38\u504f\u7f6e', getShadowGenerator()?.normalBias ?? 0.01, 0, 0.1, 0.001, (value) => {
    const shadowGenerator = ensureShadowGenerator()
    if (shadowGenerator) shadowGenerator.normalBias = value
  }))
  shadowBody.push(createSlider('\u8d28\u91cf', getShadowMapSize(), 512, 4096, 512, (value) => {
    setShadowMapSize(value)
    applyRealtimeEffectsState()
  }))
  panel.append(createModule('\u5b9e\u65f6\u9634\u5f71', shadowBody))

  const ssaoBody: HTMLElement[] = []
  ssaoBody.push(createCheckbox('SSAO \u5f00\u5173', getSsaoEnabled(), (value) => {
    setSsaoEnabled(value)
    refreshImportedRenderingState()
  }))
  ssaoBody.push(createSlider('\u906e\u853d\u5f3a\u5ea6', getSsaoStrength(), 0, 3, 0.01, (value) => {
    setSsaoStrength(value)
    applySsaoSettings()
  }))
  ssaoBody.push(createRangeNumberRow('\u91c7\u6837\u534a\u5f84', getSsaoRadius(), 0.1, 100, 0.1, (value) => {
    setSsaoRadius(value)
    applySsaoSettings()
  }))
  ssaoBody.push(createSlider('\u91c7\u6837\u6570', getSsaoSamples(), 4, 64, 1, (value) => {
    setSsaoSamples(value)
    applySsaoSettings()
  }))
  panel.append(createModule('SSAO 2', ssaoBody))
}
