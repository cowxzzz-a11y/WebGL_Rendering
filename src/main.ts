import './style.css'
import '@babylonjs/core/Culling/ray'
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader'
import '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import '@babylonjs/loaders/glTF'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { Scene } from '@babylonjs/core/scene'
import { configStorageKey } from './viewerConfig'
import type { ColorConfig, VectorConfig, ViewerConfig } from './viewerConfig'

type OutlineNode = {
  name: string
  kind: string
  detailId?: string
  open?: boolean
  children?: OutlineNode[]
}

type PanelTab = {
  id: string
  label: string
  nodes: OutlineNode[]
}

type DetailItem =
  | {
      type: 'number'
      label: string
      value: number
      min?: number
      max?: number
      step?: number
      onChange: (value: number) => void
    }
  | {
      type: 'color'
      label: string
      value: Color3 | Color4
      onChange: (value: Color3) => void
    }
  | {
      type: 'checkbox'
      label: string
      value: boolean
      onChange: (value: boolean) => void
    }
  | {
      type: 'text'
      label: string
      value: string
    }

type DetailSection = {
  title: string
  items: DetailItem[]
}

type DetailDescriptor = {
  title: string
  kind: string
  sections: DetailSection[]
}

const modelUrl = new URL('../assets/test/\u5efa\u7b51.glb', import.meta.url).href
const environmentUrl = '/environment.env'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root was not found.')
}

app.innerHTML = `
  <canvas id="renderCanvas" aria-label="Babylon building render"></canvas>
  <aside class="outliner-panel" aria-label="Scene panel">
    <header id="sceneTabs" class="outliner-tabs" aria-label="Scene panel tabs"></header>
    <div class="config-actions" aria-label="Config actions">
      <button id="saveConfig" type="button">\u4fdd\u5b58</button>
      <button id="resetConfig" type="button">\u91cd\u7f6e</button>
    </div>
    <section id="sceneOutline" class="outliner-tree"></section>
    <section id="detailPanel" class="detail-panel" hidden></section>
  </aside>
  <input id="glbImportInput" class="import-file-input" type="file" accept=".glb,model/gltf-binary" />
  <div id="status" class="status">Loading scene...</div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas')
const status = document.querySelector<HTMLDivElement>('#status')
const sceneTabs = document.querySelector<HTMLElement>('#sceneTabs')
const saveConfigButton = document.querySelector<HTMLButtonElement>('#saveConfig')
const resetConfigButton = document.querySelector<HTMLButtonElement>('#resetConfig')
const sceneOutline = document.querySelector<HTMLElement>('#sceneOutline')
const detailPanel = document.querySelector<HTMLElement>('#detailPanel')
const glbImportInput = document.querySelector<HTMLInputElement>('#glbImportInput')

if (
  !canvas ||
  !status ||
  !sceneTabs ||
  !saveConfigButton ||
  !resetConfigButton ||
  !sceneOutline ||
  !detailPanel ||
  !glbImportInput
) {
  throw new Error('Scene elements were not created.')
}

let activeTabId = 'outline'
let selectedDetailId: string | null = null
let currentMeshNodes: OutlineNode[] = []
let importedFileName = '\u5efa\u7b51.glb'
let importShouldReplace = false
const detailRegistry = new Map<string, () => DetailDescriptor>()
let selectedMesh: AbstractMesh | null = null
let selectionBox: LinesMesh | null = null
let focusAnimation:
  | {
      elapsed: number
      duration: number
      from: Vector3
      to: Vector3
      mesh: AbstractMesh
    }
  | null = null

const setStatus = (message: string | null) => {
  status.textContent = message ?? ''
  status.hidden = message === null
}

const makeOutlineRow = (node: OutlineNode) => {
  const row = document.createElement('div')
  const icon = document.createElement('span')
  const name = document.createElement('span')

  row.className = 'outliner-row'
  row.dataset.detailActive = String(node.detailId === selectedDetailId)
  icon.className = 'outliner-icon'
  icon.dataset.kind = node.kind
  name.className = 'outliner-name'
  name.textContent = node.name
  row.append(icon, name)

  if (node.detailId) {
    row.tabIndex = 0
    row.role = 'button'
    row.addEventListener('click', (event) => {
      event.stopPropagation()
      selectDetail(node.detailId)
    })
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectDetail(node.detailId)
      }
    })
  }

  return row
}

const makeOutlineBranch = (node: OutlineNode) => {
  if (!node.children?.length) {
    const leaf = document.createElement('div')
    leaf.className = 'outliner-leaf'
    leaf.append(makeOutlineRow(node))
    return leaf
  }

  const details = document.createElement('details')
  const summary = document.createElement('summary')
  const children = document.createElement('div')

  details.className = 'outliner-branch'
  details.open = node.open ?? true
  summary.append(makeOutlineRow(node))
  children.className = 'outliner-children'
  node.children.forEach((child) => children.append(makeOutlineBranch(child)))
  details.append(summary, children)

  return details
}

const getPanelTabs = (meshNodes: OutlineNode[] = []): PanelTab[] => [
  {
    id: 'outline',
    label: '\u5927\u7eb2',
    nodes: [
      {
        name: importedFileName,
        kind: 'model',
        detailId: 'model:building',
        open: true,
        children: meshNodes.length > 0 ? meshNodes : [{ name: 'Loading...', kind: 'mesh' }],
      },
    ],
  },
  {
    id: 'camera',
    label: '\u6444\u50cf\u673a',
    nodes: [{ name: 'Camera', kind: 'camera', detailId: 'camera:main' }],
  },
  {
    id: 'lights',
    label: '\u706f\u5149',
    nodes: [
      {
        name: 'Lights',
        kind: 'collection',
        open: true,
        children: [
          { name: 'HemiLight', kind: 'light', detailId: 'light:hemi' },
          { name: 'SunLight', kind: 'light', detailId: 'light:sun' },
        ],
      },
    ],
  },
  {
    id: 'world',
    label: 'World',
    nodes: [
      {
        name: 'World',
        kind: 'world',
        detailId: 'world:main',
        open: true,
        children: [
          { name: 'environment.env', kind: 'texture', detailId: 'texture:environment' },
          { name: 'KHR PBR Neutral', kind: 'color', detailId: 'color:image-processing' },
          { name: 'ClassicPipeline', kind: 'pipeline', detailId: 'pipeline:classic' },
        ],
      },
    ],
  },
  {
    id: 'import',
    label: '\u5bfc\u5165',
    nodes: [],
  },
]

const renderPanelTabs = (tabs: PanelTab[]) => {
  sceneTabs.textContent = ''
  tabs.forEach((tab) => {
    const button = document.createElement('button')

    button.className = 'outliner-tab'
    button.type = 'button'
    button.textContent = tab.label
    button.ariaSelected = String(tab.id === activeTabId)
    button.addEventListener('click', () => {
      activeTabId = tab.id
      setOutline(currentMeshNodes)
    })
    sceneTabs.append(button)
  })
}

const renderImportPanel = () => {
  sceneOutline.textContent = ''

  const panel = document.createElement('div')
  const title = document.createElement('div')
  const fileRow = document.createElement('div')
  const fileLabel = document.createElement('span')
  const fileName = document.createElement('strong')
  const modeRow = document.createElement('label')
  const modeText = document.createElement('span')
  const replaceCheckbox = document.createElement('input')
  const importButton = document.createElement('button')
  const note = document.createElement('p')

  panel.className = 'import-panel'
  title.className = 'import-title'
  title.textContent = 'GLB'
  fileRow.className = 'import-file-row'
  fileLabel.textContent = '\u5f53\u524d'
  fileName.textContent = importedFileName
  modeRow.className = 'import-mode-row'
  modeText.textContent = '\u5bfc\u5165\u65f6\u66ff\u6362\u5f53\u524d\u6a21\u578b'
  replaceCheckbox.type = 'checkbox'
  replaceCheckbox.checked = importShouldReplace
  replaceCheckbox.addEventListener('change', () => {
    importShouldReplace = replaceCheckbox.checked
  })
  importButton.className = 'import-button'
  importButton.type = 'button'
  importButton.textContent = '\u5bfc\u5165 GLB'
  importButton.addEventListener('click', () => {
    glbImportInput.value = ''
    glbImportInput.click()
  })
  note.className = 'import-note'
  note.textContent = '\u9ed8\u8ba4\u4e0e\u5f53\u524d\u6a21\u578b\u5171\u5b58\uff1b\u52fe\u9009\u66ff\u6362\u540e\uff0c\u5bfc\u5165\u65f6\u4f1a\u5148\u6e05\u6389\u5df2\u6709 GLB\u3002'

  fileRow.append(fileLabel, fileName)
  modeRow.append(replaceCheckbox, modeText)
  panel.append(title, fileRow, modeRow, importButton, note)
  sceneOutline.append(panel)
}

const setOutline = (meshNodes: OutlineNode[] = []) => {
  currentMeshNodes = meshNodes
  const tabs = getPanelTabs(meshNodes)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]

  renderPanelTabs(tabs)
  sceneOutline.textContent = ''

  if (activeTab.id === 'import') {
    renderImportPanel()
    return
  }

  activeTab.nodes.forEach((node) => sceneOutline.append(makeOutlineBranch(node)))
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const colorToHex = (color: Color3 | Color4) => {
  const channelToHex = (channel: number) => {
    const value = clamp(Math.round(channel * 255), 0, 255)
    return value.toString(16).padStart(2, '0')
  }

  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`
}

const hexToColor3 = (hex: string) => {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16) / 255
  const g = Number.parseInt(value.slice(2, 4), 16) / 255
  const b = Number.parseInt(value.slice(4, 6), 16) / 255

  return new Color3(r, g, b)
}

const renderDetail = (descriptor: DetailDescriptor) => {
  detailPanel.textContent = ''
  detailPanel.hidden = false

  const header = document.createElement('header')
  const title = document.createElement('div')
  const eyebrow = document.createElement('span')
  const name = document.createElement('strong')
  const closeButton = document.createElement('button')

  header.className = 'detail-header'
  title.className = 'detail-title'
  eyebrow.className = 'detail-kind'
  eyebrow.textContent = descriptor.kind
  name.textContent = descriptor.title
  closeButton.className = 'detail-close'
  closeButton.type = 'button'
  closeButton.textContent = 'X'
  closeButton.ariaLabel = 'Close detail panel'
  closeButton.addEventListener('click', () => {
    selectedDetailId = null
    detailPanel.hidden = true
    setOutline(currentMeshNodes)
  })
  title.append(eyebrow, name)
  header.append(title, closeButton)
  detailPanel.append(header)

  descriptor.sections.forEach((section) => {
    const sectionElement = document.createElement('section')
    const sectionTitle = document.createElement('h3')

    sectionElement.className = 'detail-section'
    sectionTitle.textContent = section.title
    sectionElement.append(sectionTitle)

    section.items.forEach((item) => {
      const row = document.createElement('label')
      const label = document.createElement('span')

      row.className = 'detail-field'
      label.textContent = item.label
      row.append(label)

      if (item.type === 'number') {
        const controlGroup = document.createElement('div')
        const slider = document.createElement('input')
        const input = document.createElement('input')
        const min = item.min ?? 0
        const max = item.max ?? 1
        const step = item.step ?? 0.01

        controlGroup.className = 'detail-number'
        slider.type = 'range'
        slider.min = String(min)
        slider.max = String(max)
        slider.step = String(step)
        slider.value = String(clamp(item.value, min, max))
        input.type = 'number'
        input.min = String(min)
        input.max = String(max)
        input.step = String(step)
        input.value = String(Number(item.value.toFixed(4)))

        const update = (rawValue: string) => {
          const value = Number.parseFloat(rawValue)

          if (Number.isNaN(value)) {
            return
          }

          const nextValue = clamp(value, min, max)
          slider.value = String(nextValue)
          input.value = String(Number(nextValue.toFixed(4)))
          item.onChange(nextValue)
        }

        slider.addEventListener('input', () => update(slider.value))
        input.addEventListener('input', () => update(input.value))
        controlGroup.append(slider, input)
        row.append(controlGroup)
      }

      if (item.type === 'color') {
        const input = document.createElement('input')

        input.type = 'color'
        input.value = colorToHex(item.value)
        input.addEventListener('input', () => item.onChange(hexToColor3(input.value)))
        row.append(input)
      }

      if (item.type === 'checkbox') {
        const input = document.createElement('input')

        input.type = 'checkbox'
        input.checked = item.value
        input.addEventListener('change', () => item.onChange(input.checked))
        row.append(input)
      }

      if (item.type === 'text') {
        const value = document.createElement('output')

        value.textContent = item.value
        row.append(value)
      }

      sectionElement.append(row)
    })

    detailPanel.append(sectionElement)
  })
}

const selectDetail = (detailId: string | undefined) => {
  if (!detailId) {
    return
  }

  const getDetail = detailRegistry.get(detailId)

  if (!getDetail) {
    return
  }

  selectedDetailId = detailId
  renderDetail(getDetail())
  setOutline(currentMeshNodes)
}

const getMeshFocusPoint = (mesh: AbstractMesh) => {
  mesh.computeWorldMatrix(true)
  mesh.refreshBoundingInfo(true, false)

  return mesh.getBoundingInfo().boundingBox.centerWorld.clone()
}

const getSelectionBoxLines = (mesh: AbstractMesh) => {
  mesh.computeWorldMatrix(true)
  mesh.refreshBoundingInfo(true, false)

  const boundingBox = mesh.getBoundingInfo().boundingBox
  const min = boundingBox.minimumWorld
  const max = boundingBox.maximumWorld
  const corners = [
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
    new Vector3(min.x, max.y, max.z),
  ]

  return [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
    [corners[4], corners[5]],
    [corners[5], corners[6]],
    [corners[6], corners[7]],
    [corners[7], corners[4]],
    [corners[0], corners[4]],
    [corners[1], corners[5]],
    [corners[2], corners[6]],
    [corners[3], corners[7]],
  ]
}

const updateSelectionBox = () => {
  if (!selectedMesh) {
    selectionBox?.dispose()
    selectionBox = null
    return
  }

  const lines = getSelectionBoxLines(selectedMesh)

  if (!selectionBox) {
    selectionBox = MeshBuilder.CreateLineSystem(
      'SelectionBoundingBox',
      {
        lines,
        updatable: true,
      },
      scene,
    )
    selectionBox.color = new Color3(1, 0.86, 0.08)
    selectionBox.isPickable = false
    selectionBox.renderingGroupId = 2
    return
  }

  MeshBuilder.CreateLineSystem('SelectionBoundingBox', { lines, instance: selectionBox })
}

const clearMeshSelection = () => {
  if (selectedMesh) {
    selectedMesh.showBoundingBox = false
    selectedMesh = null
  }

  selectionBox?.dispose()
  selectionBox = null
  focusAnimation = null
  selectedDetailId = null
  detailPanel.hidden = true
  setOutline(currentMeshNodes)
}

const selectMesh = (mesh: AbstractMesh) => {
  if (selectedMesh && selectedMesh !== mesh) {
    selectedMesh.showBoundingBox = false
  }

  selectedMesh = mesh
  updateSelectionBox()
  selectDetail(`mesh:${mesh.uniqueId}`)
}

const startSelectedFocusAnimation = () => {
  if (!selectedMesh || focusAnimation?.mesh === selectedMesh) {
    return
  }

  focusAnimation = {
    elapsed: 0,
    duration: 0.55,
    from: camera.target.clone(),
    to: getMeshFocusPoint(selectedMesh),
    mesh: selectedMesh,
  }
}

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2

const updateFocusAnimation = () => {
  if (!focusAnimation) {
    return
  }

  focusAnimation.elapsed += engine.getDeltaTime() / 1000
  const progress = clamp(focusAnimation.elapsed / focusAnimation.duration, 0, 1)
  const easedProgress = easeInOutCubic(progress)
  const nextTarget = Vector3.Lerp(focusAnimation.from, focusAnimation.to, easedProgress)

  camera.setTarget(nextTarget, false, true, true)

  if (progress >= 1) {
    focusAnimation = null
  }
}

setOutline()

const engine = new Engine(canvas, true, {
  antialias: true,
  preserveDrawingBuffer: true,
  stencil: true,
})

engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.6))

const scene = new Scene(engine)
scene.clearColor = new Color4(0.79, 0.82, 0.84, 1)
scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(environmentUrl, scene)
scene.environmentIntensity = 0.55

const imageProcessing = scene.imageProcessingConfiguration
imageProcessing.isEnabled = true
imageProcessing.toneMappingEnabled = true
imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
imageProcessing.exposure = 1
imageProcessing.contrast = 1
imageProcessing.colorCurvesEnabled = false
imageProcessing.colorGradingEnabled = false
imageProcessing.ditheringEnabled = true

const camera = new ArcRotateCamera(
  'Camera',
  -Math.PI / 2.15,
  Math.PI / 2.62,
  8,
  new Vector3(0, 1.5, 0),
  scene,
)
camera.minZ = 0.03
camera.fov = 0.72
camera.wheelPrecision = 8
camera.wheelDeltaPercentage = 0.06
camera.pinchPrecision = 75
camera.lowerRadiusLimit = 0.35
camera.upperRadiusLimit = 500
camera.lowerBetaLimit = 0.18
camera.upperBetaLimit = Math.PI / 2.02
camera.panningSensibility = 45
camera.panningDistanceLimit = null
camera.attachControl(canvas, true)

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault()
})

const selectionClickMaxDistance = 5
let pointerSelectionState:
  | {
      x: number
      y: number
      button: number
      dragged: boolean
    }
  | null = null

canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 2) {
    clearMeshSelection()
    return
  }

  if (event.button !== 0) {
    return
  }

  pointerSelectionState = {
    x: event.clientX,
    y: event.clientY,
    button: event.button,
    dragged: false,
  }
})

canvas.addEventListener('pointermove', (event) => {
  if (!pointerSelectionState || pointerSelectionState.button !== 0) {
    return
  }

  const distance = Math.hypot(event.clientX - pointerSelectionState.x, event.clientY - pointerSelectionState.y)

  if (distance <= selectionClickMaxDistance) {
    return
  }

  pointerSelectionState.dragged = true
  startSelectedFocusAnimation()
})

canvas.addEventListener('pointerup', (event) => {
  if (!pointerSelectionState || pointerSelectionState.button !== 0) {
    pointerSelectionState = null
    return
  }

  const distance = Math.hypot(event.clientX - pointerSelectionState.x, event.clientY - pointerSelectionState.y)
  const shouldSelect = !pointerSelectionState.dragged && distance <= selectionClickMaxDistance

  pointerSelectionState = null

  if (!shouldSelect) {
    return
  }

  const pickInfo = scene.pick(scene.pointerX, scene.pointerY, (mesh) => importedMeshes.includes(mesh))

  if (pickInfo?.hit && pickInfo.pickedMesh) {
    selectMesh(pickInfo.pickedMesh)
  }
})

const hemiLight = new HemisphericLight('HemiLight', new Vector3(0, 1, 0), scene)
hemiLight.intensity = 0.22
hemiLight.diffuse = new Color3(0.9, 0.94, 1)
hemiLight.groundColor = new Color3(0.34, 0.35, 0.36)

const sunLight = new DirectionalLight('SunLight', new Vector3(-0.52, -0.82, -0.28), scene)
sunLight.intensity = 0.62
sunLight.diffuse = new Color3(1, 0.965, 0.91)
sunLight.specular = new Color3(0.65, 0.62, 0.58)
sunLight.position = new Vector3(8, 10, 6)

const pipeline = new DefaultRenderingPipeline('ClassicPipeline', true, scene, [camera])
pipeline.samples = 4
pipeline.fxaaEnabled = true
pipeline.imageProcessingEnabled = true
pipeline.imageProcessing.toneMappingEnabled = true
pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
pipeline.imageProcessing.exposure = 1
pipeline.imageProcessing.contrast = 1
pipeline.imageProcessing.ditheringEnabled = true
pipeline.bloomEnabled = false
pipeline.chromaticAberrationEnabled = false
pipeline.grainEnabled = false
pipeline.sharpenEnabled = false

let importedMeshes: AbstractMesh[] = []
let importedMaterialTotal = 0
let currentModelRoots: TransformNode[] = []
let importedFileNames: string[] = []
let sceneCenter = Vector3.Zero()
let sceneRadius = 8
let defaultConfig: ViewerConfig | null = null
const dynamicDetailIds = new Set<string>()
const lightHelperVisible = {
  hemi: false,
  sun: false,
}
const lightHelperMeshes = new Map<keyof typeof lightHelperVisible, LinesMesh>()

const vectorToConfig = (vector: Vector3): VectorConfig => [vector.x, vector.y, vector.z]

const colorToConfig = (color: Color3 | Color4): ColorConfig => [color.r, color.g, color.b]

const assignVector = (target: Vector3, config: VectorConfig) => {
  target.x = config[0]
  target.y = config[1]
  target.z = config[2]
}

const assignColor3 = (target: Color3, config: ColorConfig) => {
  target.r = config[0]
  target.g = config[1]
  target.b = config[2]
}

const getMaterialKey = (material: PBRMaterial) => material.name || String(material.uniqueId)

const getMeshKey = (mesh: AbstractMesh) => mesh.name || String(mesh.uniqueId)

const getArrowLines = (direction: Vector3) => {
  const normalized = direction.lengthSquared() > 0.0001 ? direction.normalizeToNew() : new Vector3(0, -1, 0)
  const length = Math.max(sceneRadius * 0.95, 6)
  const start = sceneCenter.subtract(normalized.scale(length * 0.5))
  const end = sceneCenter.add(normalized.scale(length * 0.5))
  const side = Math.abs(Vector3.Dot(normalized, Vector3.Up())) > 0.92 ? Vector3.Right() : Vector3.Up()
  const right = Vector3.Cross(normalized, side).normalize()
  const up = Vector3.Cross(right, normalized).normalize()
  const headLength = length * 0.16
  const headWidth = headLength * 0.48
  const headBase = end.subtract(normalized.scale(headLength))

  return [
    [start, end],
    [end, headBase.add(right.scale(headWidth))],
    [end, headBase.subtract(right.scale(headWidth))],
    [end, headBase.add(up.scale(headWidth))],
    [end, headBase.subtract(up.scale(headWidth))],
  ]
}

const setLightDirectionHelper = (id: keyof typeof lightHelperVisible, direction: Vector3, color: Color3) => {
  const currentMesh = lightHelperMeshes.get(id)

  if (!lightHelperVisible[id]) {
    currentMesh?.dispose()
    lightHelperMeshes.delete(id)
    return
  }

  const lines = getArrowLines(direction)
  const helper =
    currentMesh ??
    MeshBuilder.CreateLineSystem(
      `${id}LightDirectionHelper`,
      {
        lines,
        updatable: true,
      },
      scene,
    )

  helper.color = color
  helper.isPickable = false
  helper.renderingGroupId = 2
  MeshBuilder.CreateLineSystem(`${id}LightDirectionHelper`, { lines, instance: helper })
  lightHelperMeshes.set(id, helper)
}

const updateLightDirectionHelpers = () => {
  setLightDirectionHelper('hemi', hemiLight.direction, new Color3(0.45, 0.68, 1))
  setLightDirectionHelper('sun', sunLight.direction, new Color3(1, 0.82, 0.22))
}

const createViewerConfig = (): ViewerConfig => {
  const materials: ViewerConfig['materials'] = {}
  const meshes: ViewerConfig['meshes'] = {}

  scene.materials.forEach((material) => {
    if (material instanceof PBRMaterial) {
      materials[getMaterialKey(material)] = {
        alpha: material.alpha,
        metallic: material.metallic ?? null,
        roughness: material.roughness ?? null,
        albedoColor: colorToConfig(material.albedoColor),
        emissiveColor: colorToConfig(material.emissiveColor),
        directIntensity: material.directIntensity,
        environmentIntensity: material.environmentIntensity,
        specularIntensity: material.specularIntensity,
        maxSimultaneousLights: material.maxSimultaneousLights,
      }
    }
  })

  importedMeshes.forEach((mesh) => {
    meshes[getMeshKey(mesh)] = {
      isVisible: mesh.isVisible,
      visibility: mesh.visibility,
      receiveShadows: mesh.receiveShadows,
      position: vectorToConfig(mesh.position),
      rotation: vectorToConfig(mesh.rotation),
      scaling: vectorToConfig(mesh.scaling),
    }
  })

  return {
    camera: {
      fov: camera.fov,
      radius: camera.radius,
      alpha: camera.alpha,
      beta: camera.beta,
      target: vectorToConfig(camera.target),
      wheelPrecision: camera.wheelPrecision,
      panningSensibility: camera.panningSensibility,
    },
    lights: {
      hemi: {
        intensity: hemiLight.intensity,
        diffuse: colorToConfig(hemiLight.diffuse),
        groundColor: colorToConfig(hemiLight.groundColor),
        direction: vectorToConfig(hemiLight.direction),
        helperVisible: lightHelperVisible.hemi,
      },
      sun: {
        intensity: sunLight.intensity,
        diffuse: colorToConfig(sunLight.diffuse),
        specular: colorToConfig(sunLight.specular),
        direction: vectorToConfig(sunLight.direction),
        position: vectorToConfig(sunLight.position),
        helperVisible: lightHelperVisible.sun,
      },
    },
    world: {
      environmentIntensity: scene.environmentIntensity,
      clearColor: colorToConfig(scene.clearColor),
      exposure: imageProcessing.exposure,
      contrast: imageProcessing.contrast,
      ditheringEnabled: imageProcessing.ditheringEnabled,
      toneMappingEnabled: imageProcessing.toneMappingEnabled,
    },
    pipeline: {
      samples: pipeline.samples,
      fxaaEnabled: pipeline.fxaaEnabled,
      bloomEnabled: pipeline.bloomEnabled,
      sharpenEnabled: pipeline.sharpenEnabled,
      grainEnabled: pipeline.grainEnabled,
    },
    materials,
    meshes,
  }
}

const applyViewerConfig = (config: ViewerConfig) => {
  camera.fov = config.camera.fov
  camera.radius = config.camera.radius
  camera.alpha = config.camera.alpha
  camera.beta = config.camera.beta
  assignVector(camera.target, config.camera.target)
  camera.wheelPrecision = config.camera.wheelPrecision
  camera.panningSensibility = config.camera.panningSensibility

  hemiLight.intensity = config.lights.hemi.intensity
  assignColor3(hemiLight.diffuse, config.lights.hemi.diffuse)
  assignColor3(hemiLight.groundColor, config.lights.hemi.groundColor)
  assignVector(hemiLight.direction, config.lights.hemi.direction)
  lightHelperVisible.hemi = config.lights.hemi.helperVisible

  sunLight.intensity = config.lights.sun.intensity
  assignColor3(sunLight.diffuse, config.lights.sun.diffuse)
  assignColor3(sunLight.specular, config.lights.sun.specular)
  assignVector(sunLight.direction, config.lights.sun.direction)
  assignVector(sunLight.position, config.lights.sun.position)
  lightHelperVisible.sun = config.lights.sun.helperVisible

  scene.environmentIntensity = config.world.environmentIntensity
  scene.clearColor = new Color4(config.world.clearColor[0], config.world.clearColor[1], config.world.clearColor[2], 1)
  imageProcessing.exposure = config.world.exposure
  imageProcessing.contrast = config.world.contrast
  imageProcessing.ditheringEnabled = config.world.ditheringEnabled
  imageProcessing.toneMappingEnabled = config.world.toneMappingEnabled
  pipeline.imageProcessing.exposure = config.world.exposure
  pipeline.imageProcessing.contrast = config.world.contrast
  pipeline.imageProcessing.ditheringEnabled = config.world.ditheringEnabled
  pipeline.imageProcessing.toneMappingEnabled = config.world.toneMappingEnabled

  pipeline.samples = config.pipeline.samples
  pipeline.fxaaEnabled = config.pipeline.fxaaEnabled
  pipeline.bloomEnabled = config.pipeline.bloomEnabled
  pipeline.sharpenEnabled = config.pipeline.sharpenEnabled
  pipeline.grainEnabled = config.pipeline.grainEnabled

  scene.materials.forEach((material) => {
    if (!(material instanceof PBRMaterial)) {
      return
    }

    const materialConfig = config.materials[getMaterialKey(material)]

    if (!materialConfig) {
      return
    }

    material.alpha = materialConfig.alpha
    material.metallic = materialConfig.metallic
    material.roughness = materialConfig.roughness
    assignColor3(material.albedoColor, materialConfig.albedoColor)
    assignColor3(material.emissiveColor, materialConfig.emissiveColor)
    material.directIntensity = materialConfig.directIntensity
    material.environmentIntensity = materialConfig.environmentIntensity
    material.specularIntensity = materialConfig.specularIntensity
    material.maxSimultaneousLights = materialConfig.maxSimultaneousLights
  })

  importedMeshes.forEach((mesh) => {
    const meshConfig = config.meshes[getMeshKey(mesh)]

    if (!meshConfig) {
      return
    }

    mesh.isVisible = meshConfig.isVisible
    mesh.visibility = meshConfig.visibility
    mesh.receiveShadows = meshConfig.receiveShadows
    assignVector(mesh.position, meshConfig.position)
    assignVector(mesh.rotation, meshConfig.rotation)
    assignVector(mesh.scaling, meshConfig.scaling)
  })

  updateLightDirectionHelpers()

  if (selectedDetailId) {
    const getDetail = detailRegistry.get(selectedDetailId)
    if (getDetail) {
      renderDetail(getDetail())
    }
  }
}

const loadStoredConfig = () => {
  const rawConfig = window.localStorage.getItem(configStorageKey)

  if (!rawConfig) {
    return null
  }

  try {
    return JSON.parse(rawConfig) as ViewerConfig
  } catch {
    return null
  }
}

let pendingStoredConfig = loadStoredConfig()

const showTemporaryStatus = (message: string) => {
  setStatus(message)
  window.setTimeout(() => {
    setStatus(null)
  }, 1600)
}

const saveCurrentConfig = () => {
  window.localStorage.setItem(configStorageKey, JSON.stringify(createViewerConfig(), null, 2))
  showTemporaryStatus('\u914d\u7f6e\u5df2\u4fdd\u5b58')
}

const resetCurrentConfig = () => {
  if (!defaultConfig) {
    return
  }

  window.localStorage.removeItem(configStorageKey)
  pendingStoredConfig = null
  applyViewerConfig(defaultConfig)
  showTemporaryStatus('\u5df2\u91cd\u7f6e\u4e3a\u9ed8\u8ba4\u914d\u7f6e')
}

saveConfigButton.addEventListener('click', saveCurrentConfig)
resetConfigButton.addEventListener('click', resetCurrentConfig)
glbImportInput.addEventListener('change', () => {
  const file = glbImportInput.files?.[0]

  if (!file) {
    return
  }

  if (!/\.glb$/i.test(file.name)) {
    showTemporaryStatus('\u8bf7\u9009\u62e9 .glb \u6587\u4ef6')
    glbImportInput.value = ''
    return
  }

  const replaceExisting = importShouldReplace

  loadModel(file, file.name, false, replaceExisting)
    .then(() => {
      showTemporaryStatus(replaceExisting ? `${file.name} \u5df2\u66ff\u6362\u5bfc\u5165` : `${file.name} \u5df2\u5171\u5b58\u5bfc\u5165`)
    })
    .catch((error) => {
      console.error(error)
      setStatus(`\u5bfc\u5165 ${file.name} \u5931\u8d25`)
    })
    .finally(() => {
      glbImportInput.value = ''
    })
})

const numberItem = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): DetailItem => ({
  type: 'number',
  label,
  value,
  min,
  max,
  step,
  onChange,
})

const colorItem = (label: string, value: Color3 | Color4, onChange: (value: Color3) => void): DetailItem => ({
  type: 'color',
  label,
  value,
  onChange,
})

const checkboxItem = (label: string, value: boolean, onChange: (value: boolean) => void): DetailItem => ({
  type: 'checkbox',
  label,
  value,
  onChange,
})

const textItem = (label: string, value: string): DetailItem => ({
  type: 'text',
  label,
  value,
})

const vectorItems = (
  vector: Vector3,
  labels: [string, string, string],
  min: number,
  max: number,
  step: number,
  afterChange?: () => void,
): DetailItem[] => [
  numberItem(labels[0], vector.x, min, max, step, (value) => {
    vector.x = value
    afterChange?.()
  }),
  numberItem(labels[1], vector.y, min, max, step, (value) => {
    vector.y = value
    afterChange?.()
  }),
  numberItem(labels[2], vector.z, min, max, step, (value) => {
    vector.z = value
    afterChange?.()
  }),
]

const createMeshDetail = (mesh: AbstractMesh): DetailDescriptor => ({
  title: mesh.name,
  kind: '\u7f51\u683c',
  sections: [
    {
      title: '\u663e\u793a',
      items: [
        checkboxItem('\u53ef\u89c1', mesh.isVisible, (value) => {
          mesh.isVisible = value
        }),
        numberItem('\u900f\u660e\u5ea6', mesh.visibility, 0, 1, 0.01, (value) => {
          mesh.visibility = value
        }),
        checkboxItem('\u63a5\u6536\u9634\u5f71', mesh.receiveShadows, (value) => {
          mesh.receiveShadows = value
        }),
      ],
    },
    {
      title: '\u4f4d\u7f6e',
      items: vectorItems(mesh.position, ['X', 'Y', 'Z'], -200, 200, 0.01),
    },
    {
      title: '\u65cb\u8f6c',
      items: vectorItems(mesh.rotation, ['X', 'Y', 'Z'], -Math.PI, Math.PI, 0.01),
    },
    {
      title: '\u7f29\u653e',
      items: vectorItems(mesh.scaling, ['X', 'Y', 'Z'], 0.01, 10, 0.01),
    },
  ],
})

const createMaterialDetail = (material: PBRMaterial): DetailDescriptor => ({
  title: material.name,
  kind: '\u6750\u8d28',
  sections: [
    {
      title: '\u57fa\u7840',
      items: [
        numberItem('Alpha', material.alpha, 0, 1, 0.01, (value) => {
          material.alpha = value
        }),
        numberItem('Metallic', material.metallic ?? 0, 0, 1, 0.01, (value) => {
          material.metallic = value
        }),
        numberItem('Roughness', material.roughness ?? 0.5, 0, 1, 0.01, (value) => {
          material.roughness = value
        }),
        colorItem('Albedo', material.albedoColor, (value) => {
          material.albedoColor = value
        }),
        colorItem('Emissive', material.emissiveColor, (value) => {
          material.emissiveColor = value
        }),
      ],
    },
    {
      title: '\u5149\u7167',
      items: [
        numberItem('Direct', material.directIntensity, 0, 2, 0.01, (value) => {
          material.directIntensity = value
        }),
        numberItem('Environment', material.environmentIntensity, 0, 2, 0.01, (value) => {
          material.environmentIntensity = value
        }),
        numberItem('Specular', material.specularIntensity, 0, 2, 0.01, (value) => {
          material.specularIntensity = value
        }),
        numberItem('Max Lights', material.maxSimultaneousLights, 0, 8, 1, (value) => {
          material.maxSimultaneousLights = Math.round(value)
        }),
      ],
    },
  ],
})

detailRegistry.set('model:building', () => ({
  title: importedFileName,
  kind: '\u6a21\u578b',
  sections: [
    {
      title: '\u8d44\u6e90',
      items: [
        textItem('\u6587\u4ef6', importedFileName),
        textItem('\u7f51\u683c', String(importedMeshes.length)),
        textItem('\u6750\u8d28', String(importedMaterialTotal)),
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
        numberItem('\u534a\u5f84', camera.radius, 0.35, Math.max(camera.upperRadiusLimit ?? 500, 1), 0.1, (value) => {
          camera.radius = value
        }),
        numberItem('Alpha', camera.alpha, -Math.PI * 2, Math.PI * 2, 0.01, (value) => {
          camera.alpha = value
        }),
        numberItem('Beta', camera.beta, camera.lowerBetaLimit ?? 0.01, camera.upperBetaLimit ?? Math.PI, 0.01, (value) => {
          camera.beta = value
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
        checkboxItem('\u65b9\u5411\u53ef\u89c6\u5316', lightHelperVisible.hemi, (value) => {
          lightHelperVisible.hemi = value
          updateLightDirectionHelpers()
        }),
        ...vectorItems(hemiLight.direction, ['X', 'Y', 'Z'], -1, 1, 0.01, updateLightDirectionHelpers),
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
        numberItem('\u5f3a\u5ea6', sunLight.intensity, 0, 3, 0.01, (value) => {
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
        checkboxItem('\u65b9\u5411\u53ef\u89c6\u5316', lightHelperVisible.sun, (value) => {
          lightHelperVisible.sun = value
          updateLightDirectionHelpers()
        }),
        ...vectorItems(sunLight.direction, ['X', 'Y', 'Z'], -1, 1, 0.01, updateLightDirectionHelpers),
      ],
    },
    {
      title: '\u4f4d\u7f6e',
      items: vectorItems(sunLight.position, ['X', 'Y', 'Z'], -200, 200, 0.01),
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
        numberItem('\u73af\u5883\u5f3a\u5ea6', scene.environmentIntensity, 0, 2, 0.01, (value) => {
          scene.environmentIntensity = value
        }),
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
  title: 'environment.env',
  kind: '\u73af\u5883\u8d34\u56fe',
  sections: [
    {
      title: '\u8d44\u6e90',
      items: [textItem('URL', environmentUrl), textItem('\u7c7b\u578b', 'Prefiltered CubeTexture')],
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

setOutline(currentMeshNodes)

const isBakedFloor = (mesh: AbstractMesh) => mesh.name === '\u5e73\u9762' || /floor/i.test(mesh.name)

const frameHierarchy = (root: TransformNode, meshes: AbstractMesh[]) => {
  meshes.forEach((mesh) => {
    mesh.computeWorldMatrix(true)
    mesh.refreshBoundingInfo(true, false)
  })
  root.computeWorldMatrix(true)

  const frameMeshes = meshes.filter((mesh) => !isBakedFloor(mesh))
  const bounds =
    frameMeshes.length > 0
      ? root.getHierarchyBoundingVectors(true, (mesh) => frameMeshes.includes(mesh))
      : root.getHierarchyBoundingVectors(true)
  const size = bounds.max.subtract(bounds.min)
  const center = bounds.min.add(bounds.max).scale(0.5)
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001)
  const radius = Math.max(maxDimension * 1.48, 4)

  sceneCenter = center
  sceneRadius = radius
  camera.setTarget(center.add(new Vector3(0, size.y * 0.02, 0)))
  camera.upperRadiusLimit = Math.max(radius * 8, 500)
  camera.radius = radius
  camera.alpha = -Math.PI / 2.15
  camera.beta = Math.PI / 2.62

  sunLight.position = center.add(new Vector3(8, 10, 6))
  updateLightDirectionHelpers()
}

const tuneImportedMaterial = (material: PBRMaterial) => {
  material.forceIrradianceInFragment = true
  material.maxSimultaneousLights = 4
  material.directIntensity = 0.48
  material.environmentIntensity = 0.42
  material.specularIntensity = 0.45

  if (material.roughness === null || material.roughness === undefined) {
    material.roughness = 0.78
  }
}

const unregisterImportedDetails = () => {
  dynamicDetailIds.forEach((detailId) => detailRegistry.delete(detailId))
  dynamicDetailIds.clear()
}

const getImportedDisplayName = () => {
  if (importedFileNames.length === 0) {
    return importedFileName
  }

  if (importedFileNames.length === 1) {
    return importedFileNames[0]
  }

  return `${importedFileNames.length} \u4e2a GLB`
}

const disposeCurrentModels = () => {
  clearMeshSelection()
  unregisterImportedDetails()
  currentModelRoots.forEach((root) => root.dispose(false, true))
  currentModelRoots = []
  importedMeshes = []
  importedMaterialTotal = 0
  importedFileNames = []
  importedFileName = '\u672a\u5bfc\u5165'
  setOutline([])
}

const makeMeshOutlineNodes = (meshes: AbstractMesh[]): OutlineNode[] =>
  meshes.map((mesh) => ({
    name: mesh.name || `Mesh ${mesh.uniqueId}`,
    kind: 'mesh',
    detailId: `mesh:${mesh.uniqueId}`,
    open: true,
    children:
      mesh.material instanceof PBRMaterial
        ? [{ name: mesh.material.name || `Material ${mesh.material.uniqueId}`, kind: 'material', detailId: `material:${mesh.material.uniqueId}` }]
        : undefined,
  }))

const makeModelOutlineNode = (fileName: string, meshes: AbstractMesh[]): OutlineNode => ({
  name: fileName,
  kind: 'model',
  open: true,
  children: makeMeshOutlineNodes(meshes),
})

const registerImportedDetails = (meshes: AbstractMesh[], materials: Set<PBRMaterial>) => {
  meshes.forEach((mesh) => {
    const detailId = `mesh:${mesh.uniqueId}`

    dynamicDetailIds.add(detailId)
    detailRegistry.set(detailId, () => createMeshDetail(mesh))
  })
  materials.forEach((material) => {
    const detailId = `material:${material.uniqueId}`

    dynamicDetailIds.add(detailId)
    detailRegistry.set(detailId, () => createMaterialDetail(material))
  })
}

const getImportProgressMessage = (
  fileName: string,
  event: {
    lengthComputable: boolean
    loaded: number
    total: number
  },
) => {
  if (!event.lengthComputable || event.total <= 0) {
    return `\u6b63\u5728\u5bfc\u5165 ${fileName}...`
  }

  return `\u6b63\u5728\u5bfc\u5165 ${fileName} ${Math.round((event.loaded / event.total) * 100)}%`
}

const loadModel = async (source: string | File, fileName: string, shouldApplyStoredConfig = false, replaceExisting = false) => {
  setStatus(`\u6b63\u5728\u5bfc\u5165 ${fileName}...`)

  const result = await ImportMeshAsync(source, scene, {
    pluginExtension: '.glb',
    name: fileName,
    onProgress: (event) => {
      setStatus(getImportProgressMessage(fileName, event))
    },
  })
  const root = new TransformNode(`${fileName.replace(/\.glb$/i, '') || 'Imported'}Root`, scene)
  const topLevelNodes = [...result.transformNodes, ...result.meshes].filter((node) => !node.parent)
  const materials = new Set<PBRMaterial>()

  if (replaceExisting) {
    disposeCurrentModels()
  }

  topLevelNodes.forEach((node) => {
    node.parent = root
  })

  result.meshes.forEach((mesh) => {
    mesh.receiveShadows = false

    if (mesh.material instanceof PBRMaterial) {
      materials.add(mesh.material)
    }
  })

  materials.forEach(tuneImportedMaterial)
  currentModelRoots.push(root)
  importedMeshes = [...importedMeshes, ...result.meshes]
  importedMaterialTotal += materials.size
  importedFileNames.push(fileName)
  importedFileName = getImportedDisplayName()
  registerImportedDetails(result.meshes, materials)
  setOutline(
    currentModelRoots.map((modelRoot, index) =>
      makeModelOutlineNode(
        importedFileNames[index] ?? modelRoot.name,
        importedMeshes.filter((mesh) => {
          let parent = mesh.parent

          while (parent) {
            if (parent === modelRoot) {
              return true
            }

            parent = parent.parent
          }

          return false
        }),
      ),
    ),
  )
  frameHierarchy(root, result.meshes)

  defaultConfig = createViewerConfig()

  if (shouldApplyStoredConfig && pendingStoredConfig) {
    applyViewerConfig(pendingStoredConfig)
    pendingStoredConfig = null
  }

  setStatus(null)
}

const pressedKeys = new Set<string>()
const navigationKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'w', 'a', 's', 'd', 'q', 'e'])

const isEditingControl = () => {
  const activeElement = document.activeElement

  return activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement
}

const getNavigationKey = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase()

  if (navigationKeys.has(event.code)) {
    return event.code
  }

  if (navigationKeys.has(key)) {
    return key
  }

  return null
}

window.addEventListener(
  'keydown',
  (event) => {
  if (event.key === 'Escape') {
    clearMeshSelection()
    return
  }

  if (isEditingControl()) {
    return
  }

  const navigationKey = getNavigationKey(event)

  if (navigationKey) {
    event.preventDefault()
    pressedKeys.add(navigationKey)
  }
  },
  true,
)

window.addEventListener(
  'keyup',
  (event) => {
    const navigationKey = getNavigationKey(event)

    if (navigationKey) {
      pressedKeys.delete(navigationKey)
    }
  },
  true,
)

window.addEventListener('blur', () => {
  pressedKeys.clear()
})

const updateKeyboardNavigation = () => {
  if (pressedKeys.size === 0) {
    return
  }

  const forward = camera.getForwardRay().direction
  const movingForward = new Vector3(forward.x, 0, forward.z)

  if (movingForward.lengthSquared() < 0.0001) {
    return
  }

  movingForward.normalize()

  const right = Vector3.Cross(Vector3.Up(), movingForward).normalize()
  const movement = Vector3.Zero()

  if (pressedKeys.has('KeyW') || pressedKeys.has('w')) {
    movement.addInPlace(movingForward)
  }
  if (pressedKeys.has('KeyS') || pressedKeys.has('s')) {
    movement.subtractInPlace(movingForward)
  }
  if (pressedKeys.has('KeyD') || pressedKeys.has('d')) {
    movement.addInPlace(right)
  }
  if (pressedKeys.has('KeyA') || pressedKeys.has('a')) {
    movement.subtractInPlace(right)
  }
  if (pressedKeys.has('KeyE') || pressedKeys.has('e')) {
    movement.y += 1
  }
  if (pressedKeys.has('KeyQ') || pressedKeys.has('q')) {
    movement.y -= 1
  }

  if (movement.lengthSquared() < 0.0001) {
    return
  }

  const speedMultiplier = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') ? 3 : 1
  const slowMultiplier = pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight') ? 0.28 : 1
  const speed = Math.max(camera.radius * 0.72, 3) * speedMultiplier * slowMultiplier
  const deltaSeconds = engine.getDeltaTime() / 1000
  const offset = movement.normalize().scale(speed * deltaSeconds)

  camera.setTarget(camera.target.add(offset), false, true, true)
}

loadModel(modelUrl, '\u5efa\u7b51.glb', true)
  .catch((error) => {
    console.error(error)
    setStatus('Failed to load building.glb')
  })

engine.runRenderLoop(() => {
  try {
    updateKeyboardNavigation()
    updateFocusAnimation()
    updateSelectionBox()
  } catch (error) {
    console.error(error)
    pressedKeys.clear()
  }

  scene.render()
})

window.addEventListener('resize', () => {
  engine.resize()
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.6))
})
