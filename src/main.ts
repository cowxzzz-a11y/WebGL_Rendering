import './style.css'
import '@babylonjs/core/Culling/ray'
import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader'
import '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import '@babylonjs/loaders/glTF'
import * as KTX2DECODER from '@babylonjs/ktx2decoder'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { KhronosTextureContainer2 } from '@babylonjs/core/Misc/khronosTextureContainer2'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline'
import { SSRRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline'
import { GeometryBufferRenderer } from '@babylonjs/core/Rendering/geometryBufferRenderer'
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent'
import '@babylonjs/core/Rendering/prePassRendererSceneComponent'
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import { Material } from '@babylonjs/core/Materials/material'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { Scene } from '@babylonjs/core/scene'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import { configStorageKey } from './viewerConfig'
import type { ColorConfig, VectorConfig, ViewerConfig } from './viewerConfig'
import mscBasisTranscoderJsUrl from '@babylonjs/ktx2decoder/wasm/msc_basis_transcoder.js?url'
import mscBasisTranscoderWasmUrl from '@babylonjs/ktx2decoder/wasm/msc_basis_transcoder.wasm?url'
import uastcAstcWasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_astc.wasm?url'
import uastcBc7WasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_bc7.wasm?url'
import uastcR8WasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_r8_unorm.wasm?url'
import uastcRg8WasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_rg8_unorm.wasm?url'
import uastcRgbaSrgbWasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_rgba8_srgb_v2.wasm?url'
import uastcRgbaUnormWasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_rgba8_unorm_v2.wasm?url'
import zstdWasmUrl from '@babylonjs/ktx2decoder/wasm/zstddec.wasm?url'

type OutlineNode = {
  name: string
  kind: string
  detailId?: string
  visibilityTarget?: {
    getVisible: () => boolean
    setVisible: (visible: boolean) => void
  }
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
  | {
      type: 'select'
      label: string
      value: string
      options: Array<{
        label: string
        value: string
      }>
      onChange: (value: string) => void
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

type BillboardBinding = {
  mesh: AbstractMesh
  material: StandardMaterial
  texture: Texture
  originalMaterial: AbstractMesh['material']
  originalBillboardMode: number
  originalRotation: Vector3
  originalRotationQuaternion: Quaternion | null
  originalHorizontalNormal: Vector3
}

type DefaultModel = {
  url: string
  fileName: string
}

type EnvironmentOption = {
  key: string
  label: string
  loadUrl: () => Promise<string>
  resolvedUrl: string | null
}

type QRCodeInstance = {
  addData: (text: string) => void
  make: () => void
  getModuleCount: () => number
  isDark: (row: number, col: number) => boolean
}

type QRCodeFactory = (typeNumber: number, errorCorrectionLevel: string) => QRCodeInstance
type WindowWithQRCode = Window & { qrcode?: QRCodeFactory }
type ArcRotateTouchInput = {
  angularSensibilityX: number
  angularSensibilityY: number
  multiTouchPanAndZoom: boolean
  multiTouchPanning: boolean
  panningSensibility: number
  pinchDeltaPercentage: number
  pinchPrecision: number
  pinchZoom: boolean
  useNaturalPinchZoom: boolean
}

const shareTitle = '3D \u5efa\u7b51\u6a21\u578b\u67e5\u770b\u5668'
const shareDescription = '\u5728\u7ebf\u67e5\u770b\u548c\u5206\u4eab 3D \u5efa\u7b51\u6a21\u578b\uff0c\u652f\u6301\u706f\u5149\u3001\u6750\u8d28\u548c\u6a21\u578b\u5bfc\u5165\u8c03\u8282\u3002'
const shareUrl = 'https://3d.puffina.xyz/'
const viewerConfigVersion = 2
const desktopPanningSensibility = 45
const mobilePanningSensibility = 18
const defaultModelUrls = import.meta.glob<string>('../assets/target.glb', {
  eager: true,
  query: '?url',
  import: 'default',
})
const defaultModels: DefaultModel[] = Object.entries(defaultModelUrls)
  .map(([path, url]) => ({
    url,
    fileName: path.replace(/^\.\.\/assets\//, 'assets/'),
  }))
const hdrEnvironmentUrls = import.meta.glob<string>('./assets/hdr/*.hdr', {
  query: '?url',
  import: 'default',
})
const hdrEnvironmentOptions: EnvironmentOption[] = Object.entries(hdrEnvironmentUrls)
  .map(([path, loadUrl]) => ({
    key: path.replace(/^\.\/assets\/hdr\//, ''),
    label: path.replace(/^\.\/assets\/hdr\//, ''),
    loadUrl,
    resolvedUrl: null,
  }))
  .sort((a, b) => a.label.localeCompare(b.label, 'en'))
const legacyEnvironmentUrl = '/environment.env'
const preferredDefaultEnvironmentKey = 'studio_small_09_4k.hdr'
const defaultEnvironmentKey =
  hdrEnvironmentOptions.find((option) => option.key === preferredDefaultEnvironmentKey)?.key ??
  hdrEnvironmentOptions[0]?.key ??
  null

const configureLocalKtx2Decoder = () => {
  KTX2DECODER.LiteTranscoder_UASTC_ASTC.WasmModuleURL = uastcAstcWasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_BC7.WasmModuleURL = uastcBc7WasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_R8_UNORM.WasmModuleURL = uastcR8WasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_RG8_UNORM.WasmModuleURL = uastcRg8WasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_RGBA_SRGB.WasmModuleURL = uastcRgbaSrgbWasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_RGBA_UNORM.WasmModuleURL = uastcRgbaUnormWasmUrl
  KTX2DECODER.MSCTranscoder.JSModuleURL = mscBasisTranscoderJsUrl
  KTX2DECODER.MSCTranscoder.WasmModuleURL = mscBasisTranscoderWasmUrl
  KTX2DECODER.ZSTDDecoder.WasmModuleURL = zstdWasmUrl

  // Keep KTX2 decoding inside the app bundle instead of runtime CDN fetches.
  ;(globalThis as typeof globalThis & { KTX2DECODER?: typeof KTX2DECODER }).KTX2DECODER = KTX2DECODER
  KhronosTextureContainer2.DefaultNumWorkers = 0
}

configureLocalKtx2Decoder()

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root was not found.')
}

app.innerHTML = `
  <canvas id="renderCanvas" aria-label="Babylon building render"></canvas>
  <div class="share-actions" data-url="${shareUrl}" data-title="${shareTitle}" data-desc="${shareDescription}">
    <button id="frameToggle" class="frame-toggle-button share-button" type="button" aria-label="Frame stats" title="Frame stats">
      <svg viewBox="0 0 100 80" aria-hidden="true" width="24" height="20">
        <rect x="25" y="45" width="10" height="20" rx="4" fill="currentColor" />
        <rect x="42" y="20" width="10" height="45" rx="4" fill="currentColor" />
        <rect x="59" y="34" width="10" height="31" rx="4" fill="currentColor" />
      </svg>
    </button>
    <button id="importButton" class="import-button-icon share-button" type="button" aria-label="Import GLB" title="Import GLB">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" />
      </svg>
    </button>
    <div id="importModePopup" class="import-mode-popup" hidden>
      <button type="button" data-mode="replace">\u66ff\u6362</button>
      <button type="button" data-mode="insert">\u8ffd\u52a0</button>
    </div>
    <button id="shareWechat" class="share-button" type="button" aria-label="Share" title="Share">
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path d="M690.1 377.4c5.9 0 11.8.2 17.6.5-24.4-128.7-158.3-227.1-319.9-227.1C209 150.8 64 270.8 64 420.2c0 81.1 43.6 154.2 111.9 203.6l-29.5 88.3 99.4-49.7c37.4 9.8 75.2 14.8 105 14.8 11.1 0 21.9-1 32.5-2.4C377 637.9 369.6 598.9 369.6 558.2c0-99.8 88-180.8 320.5-180.8zM445.8 276c21.2 0 36.8 15.6 36.8 36.8s-15.6 36.8-36.8 36.8-36.8-15.6-36.8-36.8 15.7-36.8 36.8-36.8zm-159.2 73.6c-21.2 0-36.8-15.6-36.8-36.8s15.6-36.8 36.8-36.8 36.8 15.6 36.8 36.8-15.6 36.8-36.8 36.8z" />
        <path d="M912 558.2c0-122.7-122.5-222.5-273.2-222.5-160.1 0-273.2 99.8-273.2 222.5s113.1 222.5 273.2 222.5c31.4 0 62.8-9.8 94.2-19.6l80.6 49.7-19.6-78.5C862 693.4 912 631.7 912 558.2zM554 534.4c-15.6 0-29.5-13.9-29.5-29.5s13.9-29.5 29.5-29.5 29.5 13.9 29.5 29.5-13.9 29.5-29.5 29.5zm185.8 0c-15.6 0-29.5-13.9-29.5-29.5s13.9-29.5 29.5-29.5 29.5 13.9 29.5 29.5-13.9 29.5-29.5 29.5z" />
      </svg>
    </button>
  </div>
  <button id="panelCollapseToggle" class="panel-collapse-toggle" type="button" aria-label="Toggle panel" title="Toggle panel">&gt;</button>
  <aside id="outlinerPanel" class="outliner-panel" aria-label="Scene panel">
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
  <div id="shareOverlay" class="share-overlay" aria-modal="true" role="dialog">
    <div id="shareWechatGuide" class="share-wechat-guide" hidden>
      <div class="guide-arrow">\u2197</div>
      <div class="guide-text">\u70b9\u51fb\u53f3\u4e0a\u89d2\u300c\u00b7\u00b7\u00b7\u300d<br />\u9009\u62e9\u300c\u8f6c\u53d1\u7ed9\u670b\u53cb\u300d<br />\u5373\u53ef\u751f\u6210\u5fae\u4fe1\u5361\u7247</div>
    </div>
    <div id="shareQrPopup" class="share-qr-popup" hidden>
      <canvas id="shareQrCanvas" aria-label="QR code"></canvas>
      <p>\u626b\u7801\u5206\u4eab</p>
      <button id="shareQrClose" class="share-qr-close" type="button">\u5173\u95ed</button>
    </div>
  </div>
  <div id="frameOverlay" class="frame-overlay">
    <div class="frame-overlay-content">
      <header class="frame-overlay-header">
        <h2>\u6027\u80fd\u7edf\u8ba1</h2>
        <button id="frameOverlayClose" class="frame-overlay-close" type="button">&times;</button>
      </header>
      <div id="frameGrid" class="frame-grid"></div>
    </div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#renderCanvas')
const status = document.querySelector<HTMLDivElement>('#status')
const shareActions = document.querySelector<HTMLElement>('.share-actions')
const shareWechatButton = document.querySelector<HTMLButtonElement>('#shareWechat')
const shareOverlay = document.querySelector<HTMLDivElement>('#shareOverlay')
const shareWechatGuide = document.querySelector<HTMLDivElement>('#shareWechatGuide')
const shareQrPopup = document.querySelector<HTMLDivElement>('#shareQrPopup')
const shareQrCanvas = document.querySelector<HTMLCanvasElement>('#shareQrCanvas')
const shareQrClose = document.querySelector<HTMLButtonElement>('#shareQrClose')
const sceneTabs = document.querySelector<HTMLElement>('#sceneTabs')
const outlinerPanel = document.querySelector<HTMLElement>('#outlinerPanel')
const panelCollapseToggle = document.querySelector<HTMLButtonElement>('#panelCollapseToggle')
const saveConfigButton = document.querySelector<HTMLButtonElement>('#saveConfig')
const resetConfigButton = document.querySelector<HTMLButtonElement>('#resetConfig')
const sceneOutline = document.querySelector<HTMLElement>('#sceneOutline')
const detailPanel = document.querySelector<HTMLElement>('#detailPanel')
const glbImportInput = document.querySelector<HTMLInputElement>('#glbImportInput')
const importButton = document.querySelector<HTMLButtonElement>('#importButton')
const importModePopup = document.querySelector<HTMLDivElement>('#importModePopup')
const frameToggle = document.querySelector<HTMLButtonElement>('#frameToggle')
const frameOverlay = document.querySelector<HTMLDivElement>('#frameOverlay')
const frameOverlayClose = document.querySelector<HTMLButtonElement>('#frameOverlayClose')
const frameGrid = document.querySelector<HTMLDivElement>('#frameGrid')

if (
  !canvas ||
  !status ||
  !shareActions ||
  !shareWechatButton ||
  !shareOverlay ||
  !shareWechatGuide ||
  !shareQrPopup ||
  !shareQrCanvas ||
  !shareQrClose ||
  !sceneTabs ||
  !outlinerPanel ||
  !panelCollapseToggle ||
  !saveConfigButton ||
  !resetConfigButton ||
  !sceneOutline ||
  !detailPanel ||
  !glbImportInput ||
  !importButton ||
  !importModePopup ||
  !frameToggle ||
  !frameOverlay ||
  !frameOverlayClose ||
  !frameGrid
) {
  throw new Error('Scene elements were not created.')
}

let activeTabId = 'tech'
let selectedDetailId: string | null = null
let currentMeshNodes: OutlineNode[] = []
let importedFileName = '\u672a\u5bfc\u5165'
let importShouldReplace = false
let selectedEnvironmentKey = defaultEnvironmentKey
let generalActiveSubTab = '\u73af\u5883'
let environmentBackgroundEnabled = false
let environmentRotationY = 0
let globalEnvironmentIntensity = 0.55
const detailRegistry = new Map<string, () => DetailDescriptor>()
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
const lightHelperTouched = {
  hemi: false,
  sun: false,
}
const lightHelperMeshes = new Map<keyof typeof lightHelperVisible, TransformNode>()
let panelCollapsed = false
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
let environmentSkybox: AbstractMesh | null = null

const getSelectedEnvironmentOption = () =>
  hdrEnvironmentOptions.find((option) => option.key === selectedEnvironmentKey) ?? null

const getCurrentEnvironmentLabel = () => getSelectedEnvironmentOption()?.label ?? 'environment.env'

const getCurrentEnvironmentUrl = () => getSelectedEnvironmentOption()?.resolvedUrl ?? 'Lazy loaded'

const degreesToRadians = (value: number) => (value * Math.PI) / 180

panelCollapseToggle.addEventListener('click', () => {
  panelCollapsed = !panelCollapsed
  outlinerPanel.classList.toggle('outliner-panel-collapsed', panelCollapsed)
  panelCollapseToggle.classList.toggle('panel-collapse-toggle-collapsed', panelCollapsed)
  outlinerPanel.style.transform = panelCollapsed ? `translateX(${outlinerPanel.offsetWidth + 12}px)` : 'translateX(0)'
  panelCollapseToggle.style.right = panelCollapsed ? '12px' : 'calc(12px + var(--panel-width))'
  panelCollapseToggle.textContent = panelCollapsed ? '<' : '>'
  panelCollapseToggle.ariaLabel = panelCollapsed ? '\u5c55\u5f00\u53c2\u6570\u9762\u677f' : '\u6536\u8d77\u53c2\u6570\u9762\u677f'
  panelCollapseToggle.title = panelCollapsed ? '\u5c55\u5f00\u53c2\u6570\u9762\u677f' : '\u6536\u8d77\u53c2\u6570\u9762\u677f'
})

const applyEnvironmentRotation = () => {
  const rotation = degreesToRadians(environmentRotationY)
  const environmentTexture = scene.environmentTexture as (BaseTexture & { rotationY?: number }) | null

  if (environmentTexture && typeof environmentTexture.rotationY === 'number') {
    environmentTexture.rotationY = rotation
  }


  const skyboxTexture = (environmentSkybox?.material as { reflectionTexture?: BaseTexture } | null | undefined)
    ?.reflectionTexture as (BaseTexture & { rotationY?: number }) | null | undefined

  if (skyboxTexture && typeof skyboxTexture.rotationY === 'number') {
    skyboxTexture.rotationY = rotation
  }
}

const updateEnvironmentBackground = () => {
  environmentSkybox?.dispose()
  environmentSkybox = null

  if (!environmentBackgroundEnabled || !scene.environmentTexture) {
    return
  }

  environmentSkybox = scene.createDefaultSkybox(scene.environmentTexture, true, 1000, 0, false)
  applyEnvironmentRotation()
}

const setStatus = (message: string | null) => {
  status.textContent = message ?? ''
  status.hidden = message === null
}

const makeOutlineRow = (node: OutlineNode) => {
  const row = document.createElement('div')
  const icon = node.visibilityTarget ? document.createElement('button') : document.createElement('span')
  const name = document.createElement('span')

  row.className = 'outliner-row'
  row.dataset.detailActive = String(node.detailId === selectedDetailId)
  icon.className = 'outliner-icon'
  icon.dataset.kind = node.kind
  if (node.visibilityTarget) {
    const button = icon as HTMLButtonElement
    button.type = 'button'
    icon.classList.add('outliner-visibility')
    icon.dataset.visible = String(node.visibilityTarget.getVisible())
    icon.ariaLabel = node.visibilityTarget.getVisible() ? 'Hide object' : 'Show object'
    icon.addEventListener('click', (event) => {
      event.stopPropagation()
      node.visibilityTarget!.setVisible(!node.visibilityTarget!.getVisible())
      setOutline(currentMeshNodes)
      if (node.detailId === selectedDetailId) {
        selectDetail(node.detailId)
      }
    })
  }
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
    id: 'general',
    label: '\u901a\u7528',
    nodes: [],
  },
  {
    id: 'viewport',
    label: '\u89c6\u53e3\u63a7\u5236',
    nodes: [],
  },
  {
    id: 'tech',
    label: '\u5149\u5f71\u6a21\u5f0f',
    nodes: [],
  },
]

let cachedTabsContainer: HTMLElement | null = null

const renderPanelTabs = (tabs: PanelTab[]) => {
  let container = cachedTabsContainer

  if (!container || !sceneTabs.contains(container)) {
    sceneTabs.textContent = ''

    container = document.createElement('div')
    container.className = 'tabs'

    tabs.forEach((tab) => {
      const input = document.createElement('input')
      input.type = 'radio'
      input.id = `tab-${tab.id}`
      input.name = 'tabs'
      input.checked = tab.id === activeTabId
      input.addEventListener('change', () => {
        if (input.checked) {
          activeTabId = tab.id
          setOutline(currentMeshNodes)
        }
      })
      const label = document.createElement('label')
      label.className = 'tab'
      label.htmlFor = `tab-${tab.id}`
      label.textContent = tab.label
      container!.append(input, label)
    })

    const glider = document.createElement('span')
    glider.className = 'glider'
    container!.append(glider)

    sceneTabs.append(container!)
    cachedTabsContainer = container
  }

  const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
  tabs.forEach((tab, i) => {
    radios[i].checked = tab.id === activeTabId
  })

  const updateGlider = () => {
    const labels = container.querySelectorAll<HTMLLabelElement>('.tab')
    const glider = container.querySelector<HTMLSpanElement>('.glider')!
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId)
    const activeLabel = labels[activeIndex]
    if (activeLabel) {
      glider.style.width = `${activeLabel.offsetWidth}px`
      glider.style.transform = `translateX(${activeLabel.offsetLeft}px)`
    }
  }

  requestAnimationFrame(updateGlider)
}

let techActiveSubTab = '\u5b9e\u65f6\u6e32\u67d3'
let viewportActiveSubTab = '\u6444\u50cf\u673a'
let ssao2Pipeline: SSAO2RenderingPipeline | null = null
let ssrPipeline: SSRRenderingPipeline | null = null
let shadowEnabledPreference = true
let ssaoEnabledPreference = false
let ssaoStrength = 0.55
let ssaoRadius = 0.75
let ssaoSamples = 16
let ssrEnabledPreference = true
let shadowFilterMode = 6
let savedSunIntensity = 0.62
let savedLightmaps = new WeakMap<PBRMaterial, BaseTexture>()
let geometryBufferRenderer: GeometryBufferRenderer | null = null
let selectedBillboardMeshIds = new Set<string>()
let billboardSheetUrl = ''
let billboardSheetFileName = ''
let billboardSheetWidth = 0
let billboardSheetHeight = 0
let billboardColumns = 4
let billboardRows = 2
let billboardDirections = 8
let billboardStartFrame = 1
let billboardAngleOffset = 0
let billboardLockY = true
let billboardAutoFrame = true
let billboardRotateMesh = true
let billboardDoubleSided = true
let billboardModelFilter = '__all__'
const billboardBindings = new Map<number, BillboardBinding>()

const ensureGeometryBufferRenderer = (enableReflectivity = false) => {
  geometryBufferRenderer ??= scene.enableGeometryBufferRenderer()

  if (geometryBufferRenderer) {
    geometryBufferRenderer.useSpecificClearForDepthTexture = true

    if (enableReflectivity) {
      geometryBufferRenderer.enableReflectivity = true
    }
  }

  return geometryBufferRenderer
}

const configureSsaoPipelineDefaults = (pipeline: SSAO2RenderingPipeline) => {
  pipeline.maxZ = Math.max(camera.maxZ, 120)
  pipeline.radius = ssaoRadius
  pipeline.samples = ssaoSamples
  pipeline.totalStrength = ssaoEnabledPreference ? ssaoStrength : 0
}

const configureSsrPipelineDefaults = (pipeline: SSRRenderingPipeline) => {
  pipeline.step = 2
  pipeline.maxSteps = 512
  pipeline.thickness = 1
  pipeline.strength = 1
  pipeline.roughnessFactor = 0.2
  pipeline.enableAutomaticThicknessComputation = true
  pipeline.backfaceForceDepthWriteTransparentMeshes = false
  pipeline.attenuateBackfaceReflection = true

  pipeline.environmentTexture = scene.environmentTexture instanceof CubeTexture ? scene.environmentTexture : null
}

const ensureSsaoPipeline = () => {
  const renderer = ensureGeometryBufferRenderer()
  updateGBufferRenderList()

  if (!ssao2Pipeline) {
    ssao2Pipeline = new SSAO2RenderingPipeline('SSAO2', scene, { ssaoRatio: 0.5, blurRatio: 1.0 }, [camera], renderer ?? true)
  }

  configureSsaoPipelineDefaults(ssao2Pipeline)
  return ssao2Pipeline
}

const applySsaoSettings = () => {
  if (!ssao2Pipeline) {
    return
  }

  configureSsaoPipelineDefaults(ssao2Pipeline)
}

const ensureSsrPipeline = () => {
  ensureGeometryBufferRenderer(true)
  updateGBufferRenderList()

  if (!ssrPipeline) {
    ssrPipeline = new SSRRenderingPipeline('SSR', scene, [camera], true)
  }

  configureSsrPipelineDefaults(ssrPipeline)
  return ssrPipeline
}

const resetRealtimePipelines = () => {
  ssao2Pipeline?.dispose()
  ssao2Pipeline = null

  ssrPipeline?.dispose(true)
  ssrPipeline = null

  scene.disableGeometryBufferRenderer()
  scene.disablePrePassRenderer()
  scene.resetCachedMaterial()
  geometryBufferRenderer = null
}

const getRealtimeShadowMeshes = () => importedMeshes.filter((mesh) => !isTransparentMesh(mesh))

const applyRealtimeShadowState = () => {
  const realtimeEnabled = techActiveSubTab === '\u5b9e\u65f6\u6e32\u67d3'
  const shadowEnabled = realtimeEnabled && shadowEnabledPreference
  const shadowMap = shadowGenerator?.getShadowMap()

  sunLight.shadowEnabled = shadowEnabled
  if (shadowMap) {
    shadowMap.renderList = shadowEnabled ? getRealtimeShadowMeshes() : []
  }

  importedMeshes.forEach((mesh) => {
    mesh.receiveShadows = shadowEnabled && !isTransparentMesh(mesh)
  })
}

const disableRealtimeEffects = () => {
  savedSunIntensity = sunLight.intensity
  sunLight.intensity = 0
  applyRealtimeShadowState()
  resetRealtimePipelines()
  flushSceneRenderCaches()
}

const enableRealtimeEffects = () => {
  sunLight.intensity = savedSunIntensity
  refreshImportedRenderingState()
  applyRealtimeShadowState()

  if (ssaoEnabledPreference) {
    ensureSsaoPipeline()
    applySsaoSettings()
  } else if (ssao2Pipeline) {
    ssao2Pipeline.totalStrength = 0
  }

  if (ssrEnabledPreference) {
    ensureSsrPipeline().isEnabled = true
  } else if (ssrPipeline) {
    ssrPipeline.isEnabled = false
  }
}

const meshFXFlags = new WeakMap<AbstractMesh, { receiveSSAO: boolean }>()

const updateGBufferRenderList = () => {
  if (!geometryBufferRenderer) return
  const list = importedMeshes.filter((m) => (meshFXFlags.get(m)?.receiveSSAO ?? true) && !isTransparentMesh(m))
  geometryBufferRenderer.renderList = list.length > 0 ? list : null
}

const syncImportedMaterialRenderingState = (material: PBRMaterial) => {
  const transparent = isTransparentPbrMaterial(material)
  const depthWritingGlass = isArchitecturalGlassMaterial(material) && transparent

  material.needDepthPrePass = transparent
  material.separateCullingPass = transparent && !depthWritingGlass
  material.forceDepthWrite = depthWritingGlass
  material.twoSidedLighting = !material.backFaceCulling
}

const isArchitecturalGlassMaterial = (material: PBRMaterial) => {
  const name = material.name.toLowerCase()

  return name.includes('glass') || name.includes('window') || name.includes('\u73bb\u7483')
}

const normalizeImportedMaterialTransparency = (material: PBRMaterial) => {
  const hasAlphaTexture = Boolean(material.opacityTexture || (material.albedoTexture && material.albedoTexture.hasAlpha))
  const looksOpaque =
    material.alpha >= 0.999 &&
    !hasAlphaTexture &&
    !material.subSurface.isRefractionEnabled &&
    material.transparencyMode === Material.MATERIAL_ALPHABLEND

  if (!looksOpaque) {
    return
  }

  material.transparencyMode = Material.MATERIAL_OPAQUE
  material.needDepthPrePass = false
  material.separateCullingPass = false
  material.forceDepthWrite = true
  material.markAsDirty(Material.MiscDirtyFlag | Material.TextureDirtyFlag)
}

const normalizeImportedGlassMaterial = (material: PBRMaterial) => {
  const looksLikeGlass = isArchitecturalGlassMaterial(material) || material.subSurface.isRefractionEnabled

  if (!looksLikeGlass) {
    return
  }

  material.subSurface.isRefractionEnabled = true
  material.subSurface.refractionIntensity = Math.max(material.subSurface.refractionIntensity, 0.35)
  material.subSurface.isTranslucencyEnabled = false
  material.subSurface.isScatteringEnabled = false
  material.alpha = Math.min(material.alpha, 0.88)
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.alphaMode = Engine.ALPHA_COMBINE
  material.albedoColor = new Color3(0.08, 0.12, 0.16)
  material.roughness = Math.min(material.roughness ?? 0.18, 0.18)
  material.metallic = 0
  material.environmentIntensity = Math.max(material.environmentIntensity, 1.8)
  material.specularIntensity = Math.max(material.specularIntensity, 1)
  material.needDepthPrePass = true
  material.separateCullingPass = false
  material.forceDepthWrite = true
  material.markAsDirty(Material.MiscDirtyFlag | Material.TextureDirtyFlag)
}

const syncImportedMeshRenderingState = (mesh: AbstractMesh) => {
  const transparent = isTransparentMesh(mesh)
  const currentFlags = meshFXFlags.get(mesh)

  meshFXFlags.set(mesh, {
    receiveSSAO: transparent ? false : (currentFlags?.receiveSSAO ?? true),
  })

  mesh.renderingGroupId = 0
  mesh.receiveShadows = !transparent && techActiveSubTab === '\u5b9e\u65f6\u6e32\u67d3' && shadowEnabledPreference
}

const refreshImportedRenderingState = () => {
  const materials = new Set<PBRMaterial>()

  importedMeshes.forEach((mesh) => {
    collectPbrMaterialsFromMaterial(mesh.material, materials)
  })

  materials.forEach(syncImportedMaterialRenderingState)
  importedMeshes.forEach(syncImportedMeshRenderingState)
  initShadowGenerator()
  updateGBufferRenderList()
  flushSceneRenderCaches()
}

const disableLightmaps = () => {
  scene.materials.forEach((mat) => {
    if (mat instanceof PBRMaterial && mat.lightmapTexture) {
      savedLightmaps.set(mat, mat.lightmapTexture)
      mat.lightmapTexture = null
      mat.markAsDirty(Material.TextureDirtyFlag)
    }
  })
}

const enableLightmaps = () => {
  scene.materials.forEach((mat) => {
    if (mat instanceof PBRMaterial && savedLightmaps.has(mat)) {
      const tex = savedLightmaps.get(mat)
      if (tex) {
        mat.lightmapTexture = tex
        mat.useLightmapAsShadowmap = true
        mat.markAsDirty(Material.TextureDirtyFlag)
      }
    }
  })
}

const createSlider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const val = document.createElement('span')
  val.className = 'tech-value'
  val.textContent = String(value)
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  input.addEventListener('input', () => {
    const v = parseFloat(input.value)
    val.textContent = String(v)
    onChange(v)
  })
  row.append(lbl, input, val)
  return row
}

const createCheckbox = (label: string, value: boolean, onChange: (v: boolean) => void) => {
  const row = document.createElement('label')
  row.className = 'tech-row tech-row-checkbox'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.autocomplete = 'off'
  cb.defaultChecked = value
  cb.checked = value
  cb.addEventListener('click', () => onChange(cb.checked))
  const span = document.createElement('span')
  span.textContent = label
  row.append(cb, span)
  ;[0, 100, 500, 1500, 3000].forEach((delay) => {
    window.setTimeout(() => {
      cb.checked = value
    }, delay)
  })
  return row
}

const createSelect = (label: string, options: string[], value: string, onChange: (v: string) => void) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const sel = document.createElement('select')
  sel.className = 'tech-select'
  options.forEach((opt) => {
    const el = document.createElement('option')
    el.value = opt
    el.textContent = opt
    if (opt === value) el.selected = true
    sel.append(el)
  })
  sel.addEventListener('change', () => onChange(sel.value))
  row.append(lbl, sel)
  return row
}

const createColorInput = (label: string, color: Color3, onChange: (c: Color3) => void) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const hex = colorToHex(color)
  const input = document.createElement('input')
  input.type = 'color'
  input.value = hex
  input.addEventListener('input', () => {
    onChange(hexToColor3(input.value))
  })
  row.append(lbl, input)
  return row
}

const createNumberInput = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const input = document.createElement('input')
  input.type = 'number'
  input.className = 'tech-number'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(Number(value.toFixed(4)))
  input.addEventListener('input', () => {
    const nextValue = Number.parseFloat(input.value)
    if (!Number.isNaN(nextValue)) {
      onChange(clamp(nextValue, min, max))
    }
  })
  row.append(lbl, input)
  return row
}

const createModule = (title: string, bodyContent: HTMLElement[], open = true) => {
  const mod = document.createElement('div')
  mod.className = 'tech-module'
  const header = document.createElement('div')
  header.className = 'tech-module-header'
  header.textContent = title
  const body = document.createElement('div')
  body.className = 'tech-module-body'
  if (!open) body.hidden = true
  bodyContent.forEach((el) => body.append(el))
  header.addEventListener('click', () => {
    body.hidden = !body.hidden
  })
  mod.append(header, body)
  return mod
}

const getSelectableMeshes = () =>
  importedMeshes.filter((mesh) => mesh.name !== '_root' && mesh.name !== '__root__')

const getModelRootForMesh = (mesh: AbstractMesh) => {
  let parent = mesh.parent

  while (parent) {
    if (parent instanceof TransformNode && currentModelRoots.includes(parent)) {
      return parent
    }
    parent = parent.parent
  }

  return null
}

const getModelNameForMesh = (mesh: AbstractMesh) => {
  const root = getModelRootForMesh(mesh)
  const index = root ? currentModelRoots.indexOf(root) : -1

  return index >= 0 ? importedFileNames[index] ?? root!.name : '\u672a\u5206\u7ec4'
}

const getBillboardTargetMeshes = () =>
  getSelectableMeshes().filter((mesh) => selectedBillboardMeshIds.has(String(mesh.uniqueId)))

const getOriginalRotationQuaternion = (mesh: AbstractMesh) =>
  mesh.rotationQuaternion?.clone() ?? Quaternion.FromEulerAngles(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z)

const getBillboardLocalNormal = (mesh: AbstractMesh) => {
  const positions = mesh.getVerticesData('position')

  if (!positions || positions.length < 3) {
    return Vector3.Forward()
  }

  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]

  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis]
      min[axis] = Math.min(min[axis], value)
      max[axis] = Math.max(max[axis], value)
    }
  }

  const extents = max.map((value, index) => value - min[index])
  const normalAxis = extents.indexOf(Math.min(...extents))

  if (normalAxis === 0) return Vector3.Right()
  if (normalAxis === 1) return Vector3.Up()
  return Vector3.Forward()
}

const getHorizontalNormal = (normal: Vector3, rotation: Quaternion) => {
  const matrix = new Matrix()
  rotation.toRotationMatrix(matrix)
  const horizontal = Vector3.TransformNormal(normal, matrix)
  horizontal.y = 0

  if (horizontal.lengthSquared() < 0.000001) {
    return Vector3.Forward()
  }

  return horizontal.normalize()
}

const normalizeFrameIndex = (index: number) => {
  const totalFrames = Math.max(1, billboardColumns * billboardRows)
  return ((index % totalFrames) + totalFrames) % totalFrames
}

const applyBillboardFrame = (binding: BillboardBinding, frameIndex: number) => {
  const col = frameIndex % billboardColumns
  const row = Math.floor(frameIndex / billboardColumns)

  binding.texture.uScale = 1 / Math.max(1, billboardColumns)
  binding.texture.vScale = 1 / Math.max(1, billboardRows)
  binding.texture.uOffset = col / Math.max(1, billboardColumns)
  binding.texture.vOffset = (Math.max(1, billboardRows) - 1 - row) / Math.max(1, billboardRows)
}

const getBillboardFrameForMesh = (mesh: AbstractMesh) => {
  if (!billboardAutoFrame) {
    return normalizeFrameIndex(billboardStartFrame - 1)
  }

  const meshPosition = mesh.getAbsolutePosition()
  const cameraPosition = camera.position
  const dx = cameraPosition.x - meshPosition.x
  const dz = cameraPosition.z - meshPosition.z
  const angle = Math.atan2(dx, dz)
  const step = (Math.PI * 2) / Math.max(1, billboardDirections)
  const offset = degreesToRadians(billboardAngleOffset)
  const directionIndex = Math.round((angle + offset) / step)

  return normalizeFrameIndex(directionIndex + billboardStartFrame - 1)
}

const updateBillboards = () => {
  billboardBindings.forEach((binding) => {
    binding.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_NONE
    binding.material.backFaceCulling = !billboardDoubleSided

    if (billboardLockY && billboardRotateMesh) {
      const toCamera = camera.position.subtract(binding.mesh.getAbsolutePosition())
      toCamera.y = 0

      if (toCamera.lengthSquared() > 0.000001) {
        toCamera.normalize()
        const cross = Vector3.Cross(binding.originalHorizontalNormal, toCamera)
        const dot = Vector3.Dot(binding.originalHorizontalNormal, toCamera)
        const yaw = Math.atan2(cross.y, dot)
        const yawRotation = Quaternion.RotationAxis(Vector3.Up(), yaw)
        const originalRotation = binding.originalRotationQuaternion ?? Quaternion.FromEulerAngles(
          binding.originalRotation.x,
          binding.originalRotation.y,
          binding.originalRotation.z,
        )
        binding.mesh.rotationQuaternion = yawRotation.multiply(originalRotation)
      }
    } else {
      if (binding.originalRotationQuaternion) {
        binding.mesh.rotationQuaternion = binding.originalRotationQuaternion.clone()
      } else {
        binding.mesh.rotationQuaternion = null
        binding.mesh.rotation.copyFrom(binding.originalRotation)
      }
    }

    applyBillboardFrame(binding, getBillboardFrameForMesh(binding.mesh))
  })
}

const removeBillboardFromMesh = (mesh: AbstractMesh) => {
  const binding = billboardBindings.get(mesh.uniqueId)

  if (!binding) return

  mesh.material = binding.originalMaterial
  mesh.billboardMode = binding.originalBillboardMode
  if (binding.originalRotationQuaternion) {
    mesh.rotationQuaternion = binding.originalRotationQuaternion.clone()
  } else {
    mesh.rotationQuaternion = null
    mesh.rotation.copyFrom(binding.originalRotation)
  }
  binding.texture.dispose()
  binding.material.dispose()
  billboardBindings.delete(mesh.uniqueId)
}

const clearAllBillboards = () => {
  Array.from(billboardBindings.values()).forEach((binding) => removeBillboardFromMesh(binding.mesh))
}

const applyBillboardToMesh = (mesh: AbstractMesh) => {
  if (!billboardSheetUrl) return

  removeBillboardFromMesh(mesh)

  const texture = new Texture(billboardSheetUrl, scene, false, false)
  texture.name = billboardSheetFileName || '\u5e7f\u544a\u724c\u96ea\u78a7\u56fe'
  texture.hasAlpha = true
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE

  const material = new StandardMaterial(`Billboard_${mesh.name || mesh.uniqueId}`, scene)
  material.diffuseTexture = texture
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  material.emissiveColor = Color3.White()
  material.disableLighting = true
  material.useAlphaFromDiffuseTexture = true
  material.backFaceCulling = !billboardDoubleSided
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.needDepthPrePass = true
  const originalRotation = mesh.rotation.clone()
  const originalRotationQuaternion = mesh.rotationQuaternion?.clone() ?? null
  const originalRotationForNormal = getOriginalRotationQuaternion(mesh)

  const binding: BillboardBinding = {
    mesh,
    material,
    texture,
    originalMaterial: mesh.material,
    originalBillboardMode: mesh.billboardMode,
    originalRotation,
    originalRotationQuaternion,
    originalHorizontalNormal: getHorizontalNormal(getBillboardLocalNormal(mesh), originalRotationForNormal),
  }

  mesh.material = material
  mesh.billboardMode = AbstractMesh.BILLBOARDMODE_NONE
  billboardBindings.set(mesh.uniqueId, binding)
  updateBillboards()
  applyBillboardFrame(binding, getBillboardFrameForMesh(mesh))
}

const applyBillboardToTargets = () => {
  getBillboardTargetMeshes().forEach(applyBillboardToMesh)
  flushSceneRenderCaches()
}

const loadBillboardSheetFile = (file: File, onReady?: () => void) => {
  if (billboardSheetUrl) {
    URL.revokeObjectURL(billboardSheetUrl)
  }

  const url = URL.createObjectURL(file)
  billboardSheetUrl = url
  billboardSheetFileName = file.name
  billboardSheetWidth = 0
  billboardSheetHeight = 0

  const image = new Image()
  image.onload = () => {
    billboardSheetWidth = image.naturalWidth
    billboardSheetHeight = image.naturalHeight
    onReady?.()
  }
  image.onerror = () => {
    onReady?.()
  }
  image.src = url
}

const renderGeneralPostPanel = (panel: HTMLElement) => {
  const postBody: HTMLElement[] = []

  postBody.push(createColorInput('\u80cc\u666f\u8272', new Color3(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b), (color) => {
    scene.clearColor = new Color4(color.r, color.g, color.b, 1)
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

const renderGeneralEnvironmentPanel = (panel: HTMLElement) => {
  const environmentBody: HTMLElement[] = []

  if (hdrEnvironmentOptions.length > 0) {
    environmentBody.push(
      createSelect(
        'HDR',
        hdrEnvironmentOptions.map((option) => option.key),
        selectedEnvironmentKey ?? hdrEnvironmentOptions[0].key,
        (value) => {
          void setSceneEnvironmentTexture(value)
        },
      ),
    )
  }

  environmentBody.push(createCheckbox('\u663e\u793a\u73af\u5883\u80cc\u666f', environmentBackgroundEnabled, (value) => {
    environmentBackgroundEnabled = value
    updateEnvironmentBackground()
  }))
  environmentBody.push(createSlider('HDR \u65cb\u8f6c', environmentRotationY, -180, 180, 1, (value) => {
    environmentRotationY = value
    applyEnvironmentRotation()
  }))
  environmentBody.push(createSlider('\u73af\u5883\u5f3a\u5ea6', globalEnvironmentIntensity, 0, 2, 0.01, (value) => {
    globalEnvironmentIntensity = value
    scene.environmentIntensity = value
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
  lightHelperTouched.hemi = false
  lightHelperVisible.hemi = false
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
  hemiBody.push(createCheckbox('\u65b9\u5411\u53ef\u89c6\u5316', lightHelperTouched.hemi && lightHelperVisible.hemi, (value) => {
    lightHelperTouched.hemi = true
    lightHelperVisible.hemi = value
    updateLightDirectionHelpers()
  }))
  panel.append(createModule('\u534a\u7403\u5149', hemiBody))
}

const renderGeneralPanel = () => {
  sceneOutline.textContent = ''

  const panel = document.createElement('div')
  panel.className = 'tech-panel'

  const subTabs = document.createElement('div')
  subTabs.className = 'tech-sub-tabs'

  const postPanel = document.createElement('div')
  const environmentPanel = document.createElement('div')

  const tabs = ['\u73af\u5883', '\u540e\u671f']
  tabs.forEach((label) => {
    const button = document.createElement('button')

    button.className = 'tech-sub-tab'
    button.textContent = label
    button.ariaSelected = String(label === generalActiveSubTab)
    button.addEventListener('click', () => {
      generalActiveSubTab = label
      subTabs.querySelectorAll('.tech-sub-tab').forEach((tab) => {
        ;(tab as HTMLElement).ariaSelected = String((tab as HTMLElement).textContent === label)
      })
      postPanel.hidden = label !== '\u540e\u671f'
      environmentPanel.hidden = label !== '\u73af\u5883'
    })
    subTabs.append(button)
  })

  renderGeneralPostPanel(postPanel)
  renderGeneralEnvironmentPanel(environmentPanel)

  postPanel.hidden = generalActiveSubTab !== '\u540e\u671f'
  environmentPanel.hidden = generalActiveSubTab !== '\u73af\u5883'

  panel.append(subTabs, environmentPanel, postPanel)
  sceneOutline.append(panel)
}

const buildCameraPanelContent = () => {
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

const renderBillboardPanel = (panel: HTMLElement) => {
  panel.textContent = ''

  const root = document.createElement('div')
  root.className = 'bake-panel'

  const meshCard = document.createElement('section')
  meshCard.className = 'bake-card'
  const meshTitle = document.createElement('div')
  meshTitle.className = 'bake-card-title'
  meshTitle.innerHTML = '<strong>\u5e7f\u544a\u724c\u5bf9\u8c61</strong><span>\u9009\u62e9 GLB \u5185\u7684\u9762\u7247\u7f51\u683c</span>'

  const toolbar = document.createElement('div')
  toolbar.className = 'billboard-toolbar'

  const modelSelect = document.createElement('select')
  modelSelect.className = 'tech-select'
  const allOption = document.createElement('option')
  allOption.value = '__all__'
  allOption.textContent = '\u5168\u90e8 GLB'
  modelSelect.append(allOption)
  importedFileNames.forEach((name, index) => {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = name
    modelSelect.append(option)
  })
  modelSelect.value = billboardModelFilter

  const selectVisibleBtn = document.createElement('button')
  selectVisibleBtn.type = 'button'
  selectVisibleBtn.textContent = '\u5168\u9009'
  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.textContent = '\u53d6\u6d88\u5168\u9009'
  const searchWrap = document.createElement('label')
  searchWrap.className = 'bake-search'
  const searchInput = document.createElement('input')
  searchInput.type = 'search'
  searchInput.placeholder = '\u641c\u7d22\u5bf9\u8c61\u540d\u79f0...'
  searchWrap.append(searchInput)
  const selectionCount = document.createElement('span')
  selectionCount.className = 'bake-selection-count'
  toolbar.append(modelSelect, selectVisibleBtn, clearBtn, searchWrap, selectionCount)

  const list = document.createElement('div')
  list.className = 'bake-mesh-list'

  const getFilteredMeshes = () => {
    const query = searchInput.value.trim().toLowerCase()
    return getSelectableMeshes().filter((mesh) => {
      const modelIndex = currentModelRoots.indexOf(getModelRootForMesh(mesh) as TransformNode)
      const modelMatches = billboardModelFilter === '__all__' || String(modelIndex) === billboardModelFilter
      const nameMatches = mesh.name.toLowerCase().includes(query)
      return modelMatches && nameMatches
    })
  }

  const syncRows = () => {
    const meshes = getSelectableMeshes()
    selectedBillboardMeshIds = new Set([...selectedBillboardMeshIds].filter((id) => meshes.some((mesh) => String(mesh.uniqueId) === id)))
    list.textContent = ''

    const filteredMeshes = getFilteredMeshes()
    if (filteredMeshes.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'bake-empty'
      empty.textContent = meshes.length === 0 ? '\u8bf7\u5148\u52a0\u8f7d\u6a21\u578b' : '\u6ca1\u6709\u5339\u914d\u7684\u5bf9\u8c61'
      list.append(empty)
    }

    filteredMeshes.forEach((mesh) => {
      const id = String(mesh.uniqueId)
      const row = document.createElement('div')
      row.className = 'billboard-mesh-row bake-mesh-row'
      row.classList.toggle('selected', selectedBillboardMeshIds.has(id))
      row.classList.toggle('applied', billboardBindings.has(mesh.uniqueId))
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = selectedBillboardMeshIds.has(id)
      cb.addEventListener('click', (event) => event.stopPropagation())
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedBillboardMeshIds.add(id)
        } else {
          selectedBillboardMeshIds.delete(id)
        }
        row.classList.toggle('selected', cb.checked)
        updateBillboardSelectionCount(root)
      })

      row.addEventListener('click', () => {
        selectedBillboardMeshIds = new Set([id])
        syncRows()
      })

      const icon = document.createElement('span')
      icon.className = 'bake-mesh-icon'
      icon.textContent = billboardBindings.has(mesh.uniqueId) ? '\u25c8' : '\u25a1'
      const nameWrap = document.createElement('span')
      nameWrap.className = 'billboard-mesh-name'
      const name = document.createElement('strong')
      name.textContent = mesh.name || `Mesh ${mesh.uniqueId}`
      const model = document.createElement('small')
      model.textContent = getModelNameForMesh(mesh)
      nameWrap.append(name, model)
      row.append(cb, icon, nameWrap)
      list.append(row)
    })

    updateBillboardSelectionCount(root)
  }

  modelSelect.addEventListener('change', () => {
    billboardModelFilter = modelSelect.value
    syncRows()
  })
  searchInput.addEventListener('input', syncRows)
  selectVisibleBtn.addEventListener('click', () => {
    getFilteredMeshes().forEach((mesh) => selectedBillboardMeshIds.add(String(mesh.uniqueId)))
    syncRows()
  })
  clearBtn.addEventListener('click', () => {
    getFilteredMeshes().forEach((mesh) => selectedBillboardMeshIds.delete(String(mesh.uniqueId)))
    syncRows()
  })
  meshCard.append(meshTitle, toolbar, list)

  const sheetCard = document.createElement('section')
  sheetCard.className = 'bake-card'
  const sheetTitle = document.createElement('div')
  sheetTitle.className = 'bake-card-title'
  sheetTitle.innerHTML = '<strong>\u96ea\u78a7\u56fe</strong><span>\u4e00\u5f20\u56fe\u5305\u542b\u6240\u6709\u89d2\u5ea6</span>'
  const sheetInfo = document.createElement('div')
  sheetInfo.className = 'billboard-sheet-info'
  const sheetName = document.createElement('strong')
  sheetName.textContent = billboardSheetFileName || '\u672a\u4e0a\u4f20'
  const sheetMeta = document.createElement('span')
  sheetMeta.textContent =
    billboardSheetWidth > 0 && billboardSheetHeight > 0
      ? `${billboardSheetWidth} \u00d7 ${billboardSheetHeight}`
      : '\u652f\u6301 PNG / JPG / WEBP'
  sheetInfo.append(sheetName, sheetMeta)

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.png,.jpg,.jpeg,.webp,.bmp'
  fileInput.hidden = true
  const uploadBtn = document.createElement('button')
  uploadBtn.type = 'button'
  uploadBtn.className = 'tech-upload-btn'
  uploadBtn.textContent = '\u4e0a\u4f20\u96ea\u78a7\u56fe'
  uploadBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    loadBillboardSheetFile(file, () => {
      applyBillboardToTargets()
      renderBillboardPanel(panel)
    })
  })
  sheetCard.append(sheetTitle, sheetInfo, uploadBtn, fileInput)

  const layoutBody: HTMLElement[] = []
  layoutBody.push(createNumberInput('\u5217\u6570', billboardColumns, 1, 16, 1, (value) => {
    billboardColumns = Math.max(1, Math.round(value))
    updateBillboards()
  }))
  layoutBody.push(createNumberInput('\u884c\u6570', billboardRows, 1, 16, 1, (value) => {
    billboardRows = Math.max(1, Math.round(value))
    updateBillboards()
  }))
  layoutBody.push(createNumberInput('\u65b9\u5411\u6570', billboardDirections, 1, 32, 1, (value) => {
    billboardDirections = Math.max(1, Math.round(value))
    updateBillboards()
  }))
  layoutBody.push(createNumberInput('\u8d77\u59cb\u683c', billboardStartFrame, 1, 64, 1, (value) => {
    billboardStartFrame = Math.max(1, Math.round(value))
    updateBillboards()
  }))
  layoutBody.push(createSlider('\u89d2\u5ea6\u504f\u79fb', billboardAngleOffset, -180, 180, 1, (value) => {
    billboardAngleOffset = value
    updateBillboards()
  }))

  const orientBody: HTMLElement[] = []
  orientBody.push(createCheckbox('\u9501\u5b9a Y \u8f74\u9762\u5411\u76f8\u673a', billboardLockY, (value) => {
    billboardLockY = value
    updateBillboards()
  }))
  orientBody.push(createCheckbox('\u81ea\u52a8\u6309\u76f8\u673a\u89d2\u5ea6\u5207\u683c', billboardAutoFrame, (value) => {
    billboardAutoFrame = value
    updateBillboards()
  }))
  orientBody.push(createCheckbox('\u65cb\u8f6c\u9762\u7247', billboardRotateMesh, (value) => {
    billboardRotateMesh = value
    updateBillboards()
  }))
  orientBody.push(createCheckbox('\u6750\u8d28\u53cc\u9762\u663e\u793a', billboardDoubleSided, (value) => {
    billboardDoubleSided = value
    updateBillboards()
  }))

  const actionsCard = document.createElement('section')
  actionsCard.className = 'bake-card'
  const actions = document.createElement('div')
  actions.className = 'bake-lightmap-grid'
  const applyBtn = document.createElement('button')
  applyBtn.type = 'button'
  applyBtn.className = 'bake-action-primary'
  applyBtn.textContent = '\u5e94\u7528\u5230\u5df2\u9009\u5bf9\u8c61'
  applyBtn.disabled = !billboardSheetUrl || selectedBillboardMeshIds.size === 0
  applyBtn.addEventListener('click', () => {
    applyBillboardToTargets()
    renderBillboardPanel(panel)
  })
  const removeBtn = document.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'bake-action-danger'
  removeBtn.textContent = '\u79fb\u9664\u5df2\u9009\u5e7f\u544a\u724c'
  removeBtn.disabled = selectedBillboardMeshIds.size === 0
  removeBtn.addEventListener('click', () => {
    getBillboardTargetMeshes().forEach(removeBillboardFromMesh)
    renderBillboardPanel(panel)
  })
  actions.append(applyBtn, removeBtn)
  actionsCard.append(actions)

  root.append(meshCard, sheetCard, createModule('\u5e03\u5c40', layoutBody), createModule('\u671d\u5411', orientBody), actionsCard)
  panel.append(root)
  syncRows()
}

const updateBillboardSelectionCount = (root: HTMLElement) => {
  const count = root.querySelector<HTMLElement>('.bake-selection-count')
  if (count) {
    count.textContent = `\u5df2\u9009 ${selectedBillboardMeshIds.size} / ${getSelectableMeshes().length}`
  }
}

const renderViewportPanel = () => {
  selectedDetailId = null
  detailPanel.hidden = true
  detailPanel.textContent = ''
  sceneOutline.textContent = ''

  const panel = document.createElement('div')
  panel.className = 'tech-panel'
  const subTabs = document.createElement('div')
  subTabs.className = 'tech-sub-tabs'
  const cameraPanel = document.createElement('div')
  const billboardPanel = document.createElement('div')

  ;['\u6444\u50cf\u673a', '\u5e7f\u544a\u724c'].forEach((label) => {
    const btn = document.createElement('button')
    btn.className = 'tech-sub-tab'
    btn.textContent = label
    btn.ariaSelected = String(label === viewportActiveSubTab)
    btn.addEventListener('click', () => {
      viewportActiveSubTab = label
      subTabs.querySelectorAll('.tech-sub-tab').forEach((tab) => {
        ;(tab as HTMLElement).ariaSelected = String((tab as HTMLElement).textContent === label)
      })
      cameraPanel.hidden = label !== '\u6444\u50cf\u673a'
      billboardPanel.hidden = label !== '\u5e7f\u544a\u724c'
      if (label === '\u5e7f\u544a\u724c') {
        renderBillboardPanel(billboardPanel)
      }
    })
    subTabs.append(btn)
  })

  cameraPanel.append(buildCameraPanelContent())
  renderBillboardPanel(billboardPanel)
  cameraPanel.hidden = viewportActiveSubTab !== '\u6444\u50cf\u673a'
  billboardPanel.hidden = viewportActiveSubTab !== '\u5e7f\u544a\u724c'
  panel.append(subTabs, cameraPanel, billboardPanel)
  sceneOutline.append(panel)
}

const renderRealtimePanel = (panel: HTMLElement) => {
  // --- Sun Light ---
  const sunBody: HTMLElement[] = []
  lightHelperTouched.sun = false
  lightHelperVisible.sun = false
  sunBody.push(createColorInput('\u5149\u6e90\u989c\u8272', sunLight.diffuse, (c) => { sunLight.diffuse = c }))
  sunBody.push(createColorInput('Specular', sunLight.specular, (c) => { sunLight.specular = c }))
  sunBody.push(createSlider('\u5149\u6e90\u5f3a\u5ea6', sunLight.intensity, 0, 3, 0.01, (v) => { sunLight.intensity = v }))
  sunBody.push(createCheckbox('\u65b9\u5411\u53ef\u89c6\u5316', lightHelperTouched.sun && lightHelperVisible.sun, (value) => {
    lightHelperTouched.sun = true
    lightHelperVisible.sun = value
    updateLightDirectionHelpers()
  }))

  const dirRow = document.createElement('div')
  dirRow.className = 'tech-row'
  const dirLabel = document.createElement('span')
  dirLabel.className = 'tech-label'
  dirLabel.textContent = '\u65b9\u5411'
  const dirVals = document.createElement('div')
  dirVals.style.cssText = 'display:flex;gap:4px;flex:1'
  ;['X', 'Y', 'Z'].forEach((axis, i) => {
    const axisWrap = document.createElement('div')
    axisWrap.style.cssText = 'display:flex;align-items:center;gap:2px'
    const axisLabel = document.createElement('span')
    axisLabel.style.cssText = 'font-size:10px;color:#9aa4a1;width:12px'
    axisLabel.textContent = axis
    const inp = document.createElement('input')
    inp.type = 'range'
    inp.min = '-1'
    inp.max = '1'
    inp.step = '0.01'
    inp.value = String(sunLight.direction.asArray()[i])
    inp.style.cssText = 'width:100%'
    inp.addEventListener('input', () => {
      const arr = sunLight.direction.asArray()
      arr[i] = parseFloat(inp.value)
      sunLight.direction = Vector3.FromArray(arr)
      updateLightDirectionHelpers()
    })
    axisWrap.append(axisLabel, inp)
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

  // --- Real-time Shadow ---
  const shadowBody: HTMLElement[] = []
  applyRealtimeShadowState()
  const shadowToggle = createCheckbox('\u9634\u5f71\u5f00\u5173', shadowEnabledPreference, (v) => {
    shadowEnabledPreference = v
    applyRealtimeShadowState()
    flushSceneRenderCaches()
  })
  shadowBody.push(shadowToggle)

  const filterNames = ['PCF', 'PCSS', 'ESM']
  const filterMap: Record<string, number> = { PCF: 6, PCSS: 7, ESM: 1 }
  const currentFilter = filterNames.find((k) => filterMap[k] === shadowFilterMode) || 'PCF'
  shadowBody.push(createSelect('\u9634\u5f71\u7c7b\u578b', filterNames, currentFilter, (v) => {
    shadowFilterMode = filterMap[v]
    if (shadowFilterMode === 1) {
      shadowGenerator.useExponentialShadowMap = true
    } else if (shadowFilterMode === 6) {
      shadowGenerator.usePercentageCloserFiltering = true
    } else if (shadowFilterMode === 7) {
      shadowGenerator.useContactHardeningShadow = true
    }
  }))

  shadowBody.push(createSlider('\u9634\u5f71\u900f\u660e\u5ea6', shadowGenerator.darkness, 0, 1, 0.01, (v) => { shadowGenerator.darkness = v }))
  shadowBody.push(createSlider('Bias', shadowGenerator.bias, 0, 0.01, 0.0001, (v) => { shadowGenerator.bias = v }))
  shadowBody.push(createSlider('\u6b63\u5e38\u504f\u7f6e', shadowGenerator.normalBias, 0, 0.1, 0.001, (v) => { shadowGenerator.normalBias = v }))
  shadowBody.push(createSlider('\u8d28\u91cf', shadowMapSize, 512, 4096, 512, (v) => {
    shadowMapSize = v
    initShadowGenerator()
  }))
  panel.append(createModule('\u5b9e\u65f6\u9634\u5f71', shadowBody))

  // --- SSAO 2 ---
  const ssaoBody: HTMLElement[] = []
  const ssaoToggle = createCheckbox('SSAO \u5f00\u5173', ssaoEnabledPreference, (v) => {
    ssaoEnabledPreference = v

    if (v) {
      ensureSsaoPipeline()
      applySsaoSettings()
    } else {
      if (ssao2Pipeline) ssao2Pipeline.totalStrength = 0
    }

    refreshImportedRenderingState()
  })
  ssaoBody.push(ssaoToggle)
  ssaoBody.push(createSlider('\u906e\u853d\u5f3a\u5ea6', ssaoStrength, 0, 3, 0.01, (v) => {
    ssaoStrength = v
    applySsaoSettings()
  }))
  const radiusRow = document.createElement('div')
  radiusRow.className = 'tech-row'
  const radiusLabel = document.createElement('span')
  radiusLabel.className = 'tech-label'
  radiusLabel.textContent = '\u91c7\u6837\u534a\u5f84'
  const radiusInput = document.createElement('input')
  radiusInput.type = 'range'
  radiusInput.min = '0.1'
  radiusInput.max = '100'
  radiusInput.step = '0.1'
  radiusInput.value = String(ssaoRadius)
  const radiusNum = document.createElement('input')
  radiusNum.type = 'number'
  radiusNum.className = 'tech-number'
  radiusNum.min = '0.1'
  radiusNum.max = '100'
  radiusNum.step = '0.1'
  radiusNum.value = String(ssaoRadius)
  const onRadiusChange = (v: number) => {
    ssaoRadius = v
    applySsaoSettings()
    radiusInput.value = String(v)
    radiusNum.value = String(v)
  }
  radiusInput.addEventListener('input', () => onRadiusChange(parseFloat(radiusInput.value)))
  radiusNum.addEventListener('change', () => onRadiusChange(parseFloat(radiusNum.value)))
  radiusRow.append(radiusLabel, radiusInput, radiusNum)
  ssaoBody.push(radiusRow)
  ssaoBody.push(createSlider('\u91c7\u6837\u6570', ssaoSamples, 4, 64, 1, (v) => {
    ssaoSamples = v
    applySsaoSettings()
  }))
  panel.append(createModule('SSAO 2', ssaoBody))

  // --- SSR ---
  const ssrBody: HTMLElement[] = []
  const ssrToggle = createCheckbox('SSR \u5f00\u5173', ssrPipeline ? ssrPipeline.isEnabled : false, (v) => {
    ssrEnabledPreference = v

    if (v) {
      ensureSsrPipeline().isEnabled = true
    } else {
      if (ssrPipeline) ssrPipeline.isEnabled = false
    }

    refreshImportedRenderingState()
  })
  ssrBody.push(ssrToggle)
  ssrBody.push(createSlider('\u53cd\u5c04\u5f3a\u5ea6', ssrPipeline?.strength ?? 1, 0, 2, 0.01, (v) => { if (ssrPipeline) ssrPipeline.strength = v }))
  const ssrMaxDistRow = document.createElement('div')
  ssrMaxDistRow.className = 'tech-row'
  const ssrMaxDistLabel = document.createElement('span')
  ssrMaxDistLabel.className = 'tech-label'
  ssrMaxDistLabel.textContent = '\u6700\u5927\u8ddd\u79bb'
  const ssrMaxDistInput = document.createElement('input')
  ssrMaxDistInput.type = 'range'
  ssrMaxDistInput.min = '0'
  ssrMaxDistInput.max = '5000'
  ssrMaxDistInput.step = '1'
  ssrMaxDistInput.value = String(ssrPipeline?.maxDistance ?? 1000)
  const ssrMaxDistNum = document.createElement('input')
  ssrMaxDistNum.type = 'number'
  ssrMaxDistNum.className = 'tech-number'
  ssrMaxDistNum.min = '0'
  ssrMaxDistNum.max = '5000'
  ssrMaxDistNum.step = '1'
  ssrMaxDistNum.value = String(ssrPipeline?.maxDistance ?? 1000)
  const onMaxDistChange = (v: number) => { if (ssrPipeline) ssrPipeline.maxDistance = v; ssrMaxDistInput.value = String(v); ssrMaxDistNum.value = String(v) }
  ssrMaxDistInput.addEventListener('input', () => onMaxDistChange(parseFloat(ssrMaxDistInput.value)))
  ssrMaxDistNum.addEventListener('change', () => onMaxDistChange(parseFloat(ssrMaxDistNum.value)))
  ssrMaxDistRow.append(ssrMaxDistLabel, ssrMaxDistInput, ssrMaxDistNum)
  ssrBody.push(ssrMaxDistRow)
  const ssrStepRow = document.createElement('div')
  ssrStepRow.className = 'tech-row'
  const ssrStepLabel = document.createElement('span')
  ssrStepLabel.className = 'tech-label'
  ssrStepLabel.textContent = '\u6b65\u957f (Step)'
  const ssrStepInput = document.createElement('input')
  ssrStepInput.type = 'range'
  ssrStepInput.min = '1'
  ssrStepInput.max = '20'
  ssrStepInput.step = '1'
  ssrStepInput.value = String(ssrPipeline?.step ?? 5)
  const ssrStepNum = document.createElement('input')
  ssrStepNum.type = 'number'
  ssrStepNum.className = 'tech-number'
  ssrStepNum.min = '1'
  ssrStepNum.max = '20'
  ssrStepNum.step = '1'
  ssrStepNum.value = String(ssrPipeline?.step ?? 5)
  const onStepChange = (v: number) => { if (ssrPipeline) ssrPipeline.step = v; ssrStepInput.value = String(v); ssrStepNum.value = String(v) }
  ssrStepInput.addEventListener('input', () => onStepChange(parseFloat(ssrStepInput.value)))
  ssrStepNum.addEventListener('change', () => onStepChange(parseFloat(ssrStepNum.value)))
  ssrStepRow.append(ssrStepLabel, ssrStepInput, ssrStepNum)
  ssrBody.push(ssrStepRow)
  const ssrThickRow = document.createElement('div')
  ssrThickRow.className = 'tech-row'
  const ssrThickLabel = document.createElement('span')
  ssrThickLabel.className = 'tech-label'
  ssrThickLabel.textContent = '\u539a\u5ea6 (Thickness)'
  const ssrThickInput = document.createElement('input')
  ssrThickInput.type = 'range'
  ssrThickInput.min = '0.1'
  ssrThickInput.max = '20'
  ssrThickInput.step = '0.1'
  ssrThickInput.value = String(ssrPipeline?.thickness ?? 2)
  const ssrThickNum = document.createElement('input')
  ssrThickNum.type = 'number'
  ssrThickNum.className = 'tech-number'
  ssrThickNum.min = '0.1'
  ssrThickNum.max = '20'
  ssrThickNum.step = '0.1'
  ssrThickNum.value = String(ssrPipeline?.thickness ?? 2)
  const onThickChange = (v: number) => { if (ssrPipeline) ssrPipeline.thickness = v; ssrThickInput.value = String(v); ssrThickNum.value = String(v) }
  ssrThickInput.addEventListener('input', () => onThickChange(parseFloat(ssrThickInput.value)))
  ssrThickNum.addEventListener('change', () => onThickChange(parseFloat(ssrThickNum.value)))
  ssrThickRow.append(ssrThickLabel, ssrThickInput, ssrThickNum)
  ssrBody.push(ssrThickRow)
  ssrBody.push(createSlider('\u7c97\u7cd9\u5ea6', ssrPipeline?.roughnessFactor ?? 0.2, 0, 1, 0.01, (v) => { if (ssrPipeline) ssrPipeline.roughnessFactor = v }))
  panel.append(createModule('SSR', ssrBody))
}

let selectedBakeMeshIds = new Set<string>()
let selectedUVChannel = 1
let lightmapInvertY = false
let lastLightmapUrl = ''
let lastLightmapFileName = ''
let lastLightmapFileSize = 0
const lightmapTextureMeta = new WeakMap<Texture, { url: string; fileName: string; fileSize: number; uvChannel: number }>()

const getBakeTargetMeshes = () => {
  return importedMeshes.filter((mesh) => selectedBakeMeshIds.has(String(mesh.uniqueId)))
}

const getMeshLightmapTexture = (mesh: AbstractMesh) => {
  if (mesh.material instanceof MultiMaterial) {
    for (const sm of mesh.material.subMaterials) {
      if (sm instanceof PBRMaterial && sm.lightmapTexture) {
        return sm.lightmapTexture
      }
    }

    return null
  }

  if (mesh.material instanceof PBRMaterial) {
    return mesh.material.lightmapTexture
  }

  return null
}

const getMaterialUsageCount = (material: Material) =>
  importedMeshes.reduce((count, mesh) => {
    if (mesh.material === material) return count + 1

    if (mesh.material instanceof MultiMaterial && mesh.material.subMaterials.includes(material)) {
      return count + 1
    }

    return count
  }, 0)

const ensureUniqueBakeMaterial = (mesh: AbstractMesh) => {
  if (mesh.material instanceof PBRMaterial) {
    if (getMaterialUsageCount(mesh.material) > 1) {
      mesh.material = mesh.material.clone(`${mesh.material.name}_bake_${mesh.uniqueId}`)
    }

    return
  }

  if (mesh.material instanceof MultiMaterial) {
    const source = mesh.material
    const cloned = new MultiMaterial(`${source.name}_bake_${mesh.uniqueId}`, scene)
    cloned.subMaterials = source.subMaterials.map((sm) => {
      if (sm instanceof PBRMaterial) {
        return sm.clone(`${sm.name}_bake_${mesh.uniqueId}`)
      }

      return sm
    })
    mesh.material = cloned
  }
}

const createLightmapTextureFromCurrent = () => {
  if (!lastLightmapUrl) return null

  const texture = new Texture(lastLightmapUrl, scene, undefined, lightmapInvertY)
  texture.coordinatesIndex = selectedUVChannel
  lightmapTextureMeta.set(texture, {
    url: lastLightmapUrl,
    fileName: lastLightmapFileName,
    fileSize: lastLightmapFileSize,
    uvChannel: selectedUVChannel,
  })

  return texture
}

const applyLightmapToMesh = (mesh: AbstractMesh, texture: Texture) => {
  ensureUniqueBakeMaterial(mesh)

  if (mesh.material instanceof MultiMaterial) {
    mesh.material.subMaterials.forEach((sm) => {
      if (sm instanceof PBRMaterial) {
        sm.lightmapTexture = texture
        sm.useLightmapAsShadowmap = true
        sm.markAsDirty(Material.TextureDirtyFlag)
      }
    })
  } else if (mesh.material instanceof PBRMaterial) {
    mesh.material.lightmapTexture = texture
    mesh.material.useLightmapAsShadowmap = true
    mesh.material.markAsDirty(Material.TextureDirtyFlag)
  }
}

const clearLightmapFromMesh = (mesh: AbstractMesh) => {
  if (mesh.material instanceof MultiMaterial) {
    mesh.material.subMaterials.forEach((sm) => {
      if (sm instanceof PBRMaterial) {
        sm.lightmapTexture = null
        sm.useLightmapAsShadowmap = false
        sm.markAsDirty(Material.TextureDirtyFlag)
      }
    })
  } else if (mesh.material instanceof PBRMaterial) {
    mesh.material.lightmapTexture = null
    mesh.material.useLightmapAsShadowmap = false
    mesh.material.markAsDirty(Material.TextureDirtyFlag)
  }
}

const applyLightmapToTarget = () => {
  getBakeTargetMeshes().forEach((mesh) => {
    const texture = createLightmapTextureFromCurrent()
    if (texture) applyLightmapToMesh(mesh, texture)
  })
}

const setLightmapLevelForTarget = (level: number) => {
  const targets = getBakeTargetMeshes()
  if (targets.length > 0) {
    targets.forEach((mesh) => {
      if (mesh.material instanceof MultiMaterial) {
        mesh.material.subMaterials.forEach((sm) => {
          if (sm instanceof PBRMaterial && sm.lightmapTexture) {
            sm.lightmapTexture.level = level
          }
        })
      } else if (mesh.material instanceof PBRMaterial && mesh.material.lightmapTexture) {
        mesh.material.lightmapTexture.level = level
      }
    })
  } else {
    scene.materials.forEach((mat) => {
      if (mat instanceof PBRMaterial && mat.lightmapTexture) {
        mat.lightmapTexture.level = level
      }
    })
  }
}

const getBakeSelectableMeshes = () =>
  getSelectableMeshes()

const updateBakeSelectionCount = (root: HTMLElement) => {
  const count = root.querySelector<HTMLElement>('.bake-selection-count')
  if (count) {
    count.textContent = `已选 ${selectedBakeMeshIds.size} / ${getBakeSelectableMeshes().length}`
  }
}

const renderBakePanel = (panel: HTMLElement) => {
  panel.textContent = ''

  const root = document.createElement('div')
  root.className = 'bake-panel'

  const meshCard = document.createElement('section')
  meshCard.className = 'bake-card'
  const meshTitle = document.createElement('div')
  meshTitle.className = 'bake-card-title'
  meshTitle.innerHTML = '<strong>\u9009\u62e9\u76ee\u6807\u5bf9\u8c61</strong><span>\u652f\u6301\u591a\u9009</span>'

  const toolbar = document.createElement('div')
  toolbar.className = 'bake-toolbar'
  const selectAllBtn = document.createElement('button')
  selectAllBtn.type = 'button'
  selectAllBtn.textContent = '\u5168\u9009'
  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.textContent = '\u6e05\u7a7a'
  const searchWrap = document.createElement('label')
  searchWrap.className = 'bake-search'
  const searchInput = document.createElement('input')
  searchInput.type = 'search'
  searchInput.placeholder = '\u641c\u7d22\u5bf9\u8c61\u540d\u79f0...'
  searchWrap.append(searchInput)
  const selectionCount = document.createElement('span')
  selectionCount.className = 'bake-selection-count'
  toolbar.append(selectAllBtn, clearBtn, searchWrap, selectionCount)

  const list = document.createElement('div')
  list.className = 'bake-mesh-list'

  const syncRows = () => {
    const query = searchInput.value.trim().toLowerCase()
    const meshes = getBakeSelectableMeshes()
    selectedBakeMeshIds = new Set([...selectedBakeMeshIds].filter((id) => meshes.some((mesh) => String(mesh.uniqueId) === id)))
    list.textContent = ''

    const filteredMeshes = meshes.filter((mesh) => mesh.name.toLowerCase().includes(query))
    if (filteredMeshes.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'bake-empty'
      empty.textContent = meshes.length === 0 ? '\u8bf7\u5148\u52a0\u8f7d\u6a21\u578b' : '\u6ca1\u6709\u5339\u914d\u7684\u5bf9\u8c61'
      list.append(empty)
    }

    filteredMeshes.forEach((mesh) => {
      const id = String(mesh.uniqueId)
      const row = document.createElement('div')
      row.className = 'bake-mesh-row'
      row.classList.toggle('selected', selectedBakeMeshIds.has(id))
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = selectedBakeMeshIds.has(id)
      cb.addEventListener('click', (event) => {
        event.stopPropagation()
      })
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedBakeMeshIds.add(id)
        } else {
          selectedBakeMeshIds.delete(id)
        }
        row.classList.toggle('selected', cb.checked)
        updateBakeSelectionCount(root)
        renderLightmapSummary()
      })
      row.addEventListener('click', () => {
        selectedBakeMeshIds = new Set([id])
        syncRows()
        renderLightmapSummary()
      })
      const icon = document.createElement('span')
      icon.className = 'bake-mesh-icon'
      icon.textContent = '\u25a1'
      const name = document.createElement('span')
      name.className = 'bake-mesh-name'
      name.textContent = mesh.name || `Mesh ${mesh.uniqueId}`
      row.append(cb, icon, name)
      list.append(row)
    })

    updateBakeSelectionCount(root)
  }

  selectAllBtn.addEventListener('click', () => {
    getBakeSelectableMeshes().forEach((mesh) => selectedBakeMeshIds.add(String(mesh.uniqueId)))
    syncRows()
    renderLightmapSummary()
  })
  clearBtn.addEventListener('click', () => {
    selectedBakeMeshIds.clear()
    syncRows()
    renderLightmapSummary()
  })
  searchInput.addEventListener('input', syncRows)
  meshCard.append(meshTitle, toolbar, list)

  const uvRow = document.createElement('div')
  uvRow.className = 'tech-row'
  const uvLabel = document.createElement('span')
  uvLabel.className = 'tech-label'
  uvLabel.textContent = 'UV \u901a\u9053'
  const uvToggle = document.createElement('div')
  uvToggle.className = 'tech-uv-toggle'
  ;['UV1', 'UV2'].forEach((label) => {
    const btn = document.createElement('button')
    btn.className = 'tech-uv-btn'
    btn.textContent = label
    const idx = label === 'UV2' ? 1 : 0
    if (idx === selectedUVChannel) btn.classList.add('active')
    btn.addEventListener('click', () => {
      selectedUVChannel = idx
      uvToggle.querySelectorAll('.tech-uv-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
    uvToggle.append(btn)
  })
  uvRow.append(uvLabel, uvToggle)

  const invYRow = document.createElement('label')
  invYRow.className = 'tech-row tech-row-checkbox'
  const invYCb = document.createElement('input')
  invYCb.type = 'checkbox'
  invYCb.checked = lightmapInvertY
  invYCb.addEventListener('change', () => {
    lightmapInvertY = invYCb.checked
  })
  const invYSpan = document.createElement('span')
  invYSpan.textContent = '\u53cd\u8f6c Y \u8f74 (Invert Y)'
  invYRow.append(invYCb, invYSpan)

  const lightmapCard = document.createElement('section')
  lightmapCard.className = 'bake-card'
  const lightmapTitle = document.createElement('div')
  lightmapTitle.className = 'bake-card-title'
  lightmapTitle.innerHTML = '<strong>\u5149\u7167\u8d34\u56fe</strong><span>\u5355\u5f20\u8d34\u56fe\u5c06\u5e94\u7528\u5230\u6240\u6709\u5df2\u9009\u5bf9\u8c61</span>'
  const lightmapGrid = document.createElement('div')
  lightmapGrid.className = 'bake-lightmap-grid'
  const lightmapInfo = document.createElement('div')
  lightmapInfo.className = 'bake-lightmap-info'
  const uploadDrop = document.createElement('button')
  uploadDrop.type = 'button'
  uploadDrop.className = 'bake-upload-drop'
  uploadDrop.innerHTML = '<strong>\u4e0a\u4f20\u5149\u7167\u8d34\u56fe</strong><span>\u652f\u6301 PNG / JPG / TGA / EXR</span>'
  const uploadBtn = document.createElement('button')
  uploadBtn.type = 'button'
  uploadBtn.className = 'bake-action-primary'
  uploadBtn.textContent = '\u5e94\u7528\u5230\u5df2\u9009\u5bf9\u8c61'
  const deleteBtn = document.createElement('button')
  deleteBtn.type = 'button'
  deleteBtn.className = 'bake-action-danger'
  deleteBtn.textContent = '\u5220\u9664\u5149\u7167\u7eb9\u7406'
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.png,.jpg,.jpeg,.tga,.exr,.hdr'
  fileInput.hidden = true
  uploadDrop.addEventListener('click', () => fileInput.click())
  uploadBtn.addEventListener('click', () => {
    if (lastLightmapUrl) {
      applyLightmapToTarget()
      renderLightmapSummary()
    } else {
      fileInput.click()
    }
  })
  deleteBtn.addEventListener('click', () => {
    getBakeTargetMeshes().forEach(clearLightmapFromMesh)
    renderLightmapSummary()
  })
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    lastLightmapUrl = url
    lastLightmapFileName = file.name
    lastLightmapFileSize = file.size
    applyLightmapToTarget()
    renderLightmapSummary()
    fileInput.value = ''
  })

  const formatFileSize = (size: number) => {
    if (size <= 0) return '\u672a\u77e5\u5927\u5c0f'
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  function renderLightmapSummary() {
    const targets = getBakeTargetMeshes()
    const textures = targets.map(getMeshLightmapTexture).filter((texture): texture is Texture => Boolean(texture))
    const textureSet = new Set(textures)
    const firstTexture = textures[0] ?? null
    const firstMeta = firstTexture ? lightmapTextureMeta.get(firstTexture) : null
    lightmapInfo.textContent = ''

    const preview = document.createElement('div')
    preview.className = 'bake-lightmap-preview'
    const meta = document.createElement('div')
    meta.className = 'bake-lightmap-meta'
    const title = document.createElement('strong')
    const detail = document.createElement('span')
    const status = document.createElement('em')

    if (firstTexture) {
      if (firstMeta?.url) {
        preview.style.backgroundImage = `url("${firstMeta.url}")`
      }
      title.textContent = textureSet.size > 1 ? '\u591a\u4e2a\u5149\u7167\u8d34\u56fe' : firstMeta?.fileName || firstTexture.name || '\u5df2\u52a0\u8f7d\u5149\u7167\u8d34\u56fe'
      detail.textContent = [
        firstMeta ? formatFileSize(firstMeta.fileSize) : '\u5df2\u5e94\u7528',
        (firstMeta?.uvChannel ?? firstTexture.coordinatesIndex) === 1 ? 'UV2' : 'UV1',
      ].join('  |  ')
      status.textContent = targets.length > 0 ? '\u53ef\u7528' : '\u672a\u9009\u62e9\u5bf9\u8c61'
    } else {
      title.textContent = targets.length > 0 ? '\u672a\u5e94\u7528\u5149\u7167\u8d34\u56fe' : '\u8bf7\u9009\u62e9\u76ee\u6807\u5bf9\u8c61'
      detail.textContent = '\u4e0a\u4f20\u6216\u9009\u62e9\u8d34\u56fe\u540e\uff0c\u53ef\u7edf\u4e00\u5e94\u7528\u5230\u5df2\u9009\u5bf9\u8c61'
      status.textContent = targets.length > 0 ? '\u7b49\u5f85\u8d34\u56fe' : '\u65e0\u76ee\u6807'
    }

    meta.append(title, detail, status)
    lightmapInfo.append(preview, meta)
    uploadBtn.disabled = selectedBakeMeshIds.size === 0
    deleteBtn.disabled = selectedBakeMeshIds.size === 0 || textureSet.size === 0
    updateBakeSelectionCount(root)
  }

  const actionRow = document.createElement('div')
  actionRow.className = 'bake-action-row'
  actionRow.append(uploadBtn, deleteBtn)
  lightmapGrid.append(lightmapInfo, uploadDrop)
  lightmapCard.append(lightmapTitle, lightmapGrid, actionRow, fileInput)

  const optionsCard = document.createElement('section')
  optionsCard.className = 'bake-card bake-options-card'
  const optionsTitle = document.createElement('div')
  optionsTitle.className = 'bake-card-title'
  optionsTitle.innerHTML = '<strong>UV \u901a\u9053</strong>'
  const strength = createSlider('\u5149\u7167\u8d34\u56fe\u5f3a\u5ea6', 1, 0, 2, 0.01, (v) => {
    setLightmapLevelForTarget(v)
  })
  optionsCard.append(optionsTitle, uvRow, invYRow, strength)

  root.append(meshCard, lightmapCard, optionsCard)
  panel.append(root)
  syncRows()
  renderLightmapSummary()
}

let techPanelCache: {
  panel: HTMLElement
  subTabs: HTMLElement
  realtimePanel: HTMLElement
  bakePanel: HTMLElement
  shadowToggle: HTMLInputElement | null
} | null = null

const renderTechPanel = () => {
  sceneOutline.textContent = ''

  if (!techPanelCache) {
    const panel = document.createElement('div')
    panel.className = 'tech-panel'

    const subTabs = document.createElement('div')
    subTabs.className = 'tech-sub-tabs'

    const realtimePanel = document.createElement('div')
    const bakePanel = document.createElement('div')

    const tabs = ['\u5b9e\u65f6\u6e32\u67d3', '\u6a21\u578b\u70d8\u70e4']
    tabs.forEach((label) => {
      const btn = document.createElement('button')
      btn.className = 'tech-sub-tab'
      btn.textContent = label
      btn.ariaSelected = String(label === techActiveSubTab)
      btn.addEventListener('click', () => {
        if (label === techActiveSubTab) return

        techActiveSubTab = label
        try {
          if (label === '\u6a21\u578b\u70d8\u70e4') {
            disableRealtimeEffects()
            enableLightmaps()
          } else {
            disableLightmaps()
            enableRealtimeEffects()
          }
        } catch (e) {
          console.error('Tech mode switch error', e)
        }
        subTabs.querySelectorAll('.tech-sub-tab').forEach((b) => {
          ;(b as HTMLElement).ariaSelected = String((b as HTMLElement).textContent === label)
        })
        realtimePanel.hidden = label !== '\u5b9e\u65f6\u6e32\u67d3'
        bakePanel.hidden = label !== '\u6a21\u578b\u70d8\u70e4'
      })
      subTabs.append(btn)
    })

    if (techActiveSubTab === '\u5b9e\u65f6\u6e32\u67d3') {
      enableRealtimeEffects()
    }
    renderRealtimePanel(realtimePanel)
    renderBakePanel(bakePanel)

    if (techActiveSubTab !== '\u5b9e\u65f6\u6e32\u67d3') realtimePanel.hidden = true
    if (techActiveSubTab !== '\u6a21\u578b\u70d8\u70e4') bakePanel.hidden = true

    panel.append(subTabs, realtimePanel, bakePanel)
    sceneOutline.append(panel)
    const st = realtimePanel.querySelector('.tech-row-checkbox input[type=\'checkbox\']') as HTMLInputElement | null
    techPanelCache = { panel, subTabs, realtimePanel, bakePanel, shadowToggle: st }
  } else {
    techPanelCache.subTabs.querySelectorAll('.tech-sub-tab').forEach((b) => {
      ;(b as HTMLElement).ariaSelected = String((b as HTMLElement).textContent === techActiveSubTab)
    })
    techPanelCache.realtimePanel.hidden = techActiveSubTab !== '\u5b9e\u65f6\u6e32\u67d3'
    techPanelCache.bakePanel.hidden = techActiveSubTab !== '\u6a21\u578b\u70d8\u70e4'
    if (techPanelCache.shadowToggle) {
      techPanelCache.shadowToggle.checked = shadowEnabledPreference
    }
    renderBakePanel(techPanelCache.bakePanel)
    sceneOutline.append(techPanelCache.panel)
  }
}

const setOutline = (meshNodes: OutlineNode[] = []) => {
  currentMeshNodes = meshNodes
  const tabs = getPanelTabs(meshNodes)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  activeTabId = activeTab.id

  renderPanelTabs(tabs)
  sceneOutline.textContent = ''

  if (activeTab.id === 'tech') {
    renderTechPanel()
    return
  }

  if (activeTab.id === 'general') {
    renderGeneralPanel()
    return
  }

  if (activeTab.id === 'viewport') {
    renderViewportPanel()
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
  closeButton.textContent = 'x'
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

      if (item.type === 'select') {
        const select = document.createElement('select')

        select.className = 'tech-select'
        item.options.forEach((option) => {
          const optionElement = document.createElement('option')

          optionElement.value = option.value
          optionElement.textContent = option.label
          optionElement.selected = option.value === item.value
          select.append(optionElement)
        })
        select.addEventListener('change', () => item.onChange(select.value))
        row.append(select)
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

const engine = new Engine(canvas, true, {
  antialias: true,
  preserveDrawingBuffer: true,
  stencil: true,
})

engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.6))

const scene = new Scene(engine)
scene.clearColor = new Color4(0.79, 0.82, 0.84, 1)
scene.environmentTexture = hdrEnvironmentOptions.length > 0 ? null : CubeTexture.CreateFromPrefilteredData(legacyEnvironmentUrl, scene)
scene.environmentIntensity = 0.55
globalEnvironmentIntensity = scene.environmentIntensity

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
camera.fov = 0.72
camera.wheelPrecision = 8
camera.wheelDeltaPercentage = 0.06
camera.pinchPrecision = 28
camera.pinchDeltaPercentage = 0.012
camera.useNaturalPinchZoom = true
camera.lowerRadiusLimit = 0.35
camera.upperRadiusLimit = 500
camera.lowerBetaLimit = 0.18
camera.upperBetaLimit = Math.PI / 2.02
camera.panningSensibility = desktopPanningSensibility
camera.panningDistanceLimit = null
camera.attachControl(canvas, true)

const isMobileViewport = () => window.matchMedia('(pointer: coarse), (max-width: 760px)').matches

const tuneTouchCameraControls = () => {
  const panningSensibility = isMobileViewport() ? mobilePanningSensibility : desktopPanningSensibility
  const pointersInput = camera.inputs.attached.pointers as Partial<ArcRotateTouchInput> | undefined

  camera.panningSensibility = panningSensibility

  if (!pointersInput) {
    return
  }

  pointersInput.multiTouchPanning = true
  pointersInput.multiTouchPanAndZoom = true
  pointersInput.pinchZoom = true
  pointersInput.useNaturalPinchZoom = true
  pointersInput.pinchPrecision = isMobileViewport() ? 22 : 28
  pointersInput.pinchDeltaPercentage = isMobileViewport() ? 0.016 : 0.012
  pointersInput.panningSensibility = panningSensibility
  pointersInput.angularSensibilityX = isMobileViewport() ? 780 : 1000
  pointersInput.angularSensibilityY = isMobileViewport() ? 780 : 1000
}

tuneTouchCameraControls()

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
hemiLight.intensity = 1
hemiLight.diffuse = new Color3(0.9, 0.94, 1)
hemiLight.groundColor = new Color3(0.34, 0.35, 0.36)

const sunLight = new DirectionalLight('SunLight', new Vector3(-0.52, -0.82, -0.28), scene)
sunLight.intensity = 0.62
sunLight.diffuse = new Color3(1, 0.965, 0.91)
sunLight.specular = new Color3(0.65, 0.62, 0.58)
sunLight.position = new Vector3(8, 10, 6)

let shadowGenerator: ShadowGenerator
let shadowMapSize = 2048
let shadowBias = 0.0001
let shadowNormalBias = 0.01
const initShadowGenerator = () => {
  shadowGenerator?.dispose()
  shadowGenerator = new ShadowGenerator(shadowMapSize, sunLight)
  shadowGenerator.usePercentageCloserFiltering = true
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH
  shadowGenerator.bias = shadowBias
  shadowGenerator.normalBias = shadowNormalBias
  importedMeshes.filter((mesh) => !isTransparentMesh(mesh)).forEach((mesh) => shadowGenerator.addShadowCaster(mesh))
  applyRealtimeShadowState()
}

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

const resolveEnvironmentUrl = async (option: EnvironmentOption) => {
  option.resolvedUrl ??= await option.loadUrl()
  return option.resolvedUrl
}

let environmentLoadToken = 0

const setSceneEnvironmentTexture = async (
  environmentKey: string,
  {
    force = false,
    showLoadingStatus = true,
    refreshOutline = true,
  }: {
    force?: boolean
    showLoadingStatus?: boolean
    refreshOutline?: boolean
  } = {},
) => {

  if (!force && selectedEnvironmentKey === environmentKey) {
    return
  }

  const option = hdrEnvironmentOptions.find((entry) => entry.key === environmentKey)

  if (!option) {
    return
  }

  selectedEnvironmentKey = option.key
  const loadToken = ++environmentLoadToken

  if (showLoadingStatus) {
    setStatus(`Loading environment: ${option.label}`)
  }

  try {
    const previousTexture = scene.environmentTexture
    const url = await resolveEnvironmentUrl(option)

    if (loadToken !== environmentLoadToken) {
      return
    }

    const nextTexture = new HDRCubeTexture(
      url,
      scene,
      256,
      false,
      true,
      false,
      true,
      () => {
        if (loadToken === environmentLoadToken) {
          setStatus(null)
          if (refreshOutline) {
            setOutline(currentMeshNodes)
          }
        }
      },
      (message, exception) => {
        if (loadToken === environmentLoadToken) {
          console.error('Environment texture load failed', message, exception)
          setStatus(`Environment load failed: ${option.label}`)
        }
      },
    )

    nextTexture.rotationY = degreesToRadians(environmentRotationY)
    scene.environmentTexture = nextTexture
    scene.environmentIntensity = globalEnvironmentIntensity
    updateEnvironmentBackground()

    if (previousTexture && previousTexture !== nextTexture) {
      previousTexture.dispose()
    }
  } catch (error) {
    if (loadToken === environmentLoadToken) {
      console.error('Environment texture resolve failed', error)
      setStatus(`Environment load failed: ${option.label}`)
    }
    return
  }

  if (refreshOutline) {
    setOutline(currentMeshNodes)
  }
}

initShadowGenerator()
setOutline()
window.setTimeout(() => {
  lightHelperVisible.hemi = false
  lightHelperVisible.sun = false
  lightHelperTouched.hemi = false
  lightHelperTouched.sun = false
  updateLightDirectionHelpers()
  setOutline(currentMeshNodes)
}, 0)
if (hdrEnvironmentOptions.length > 0 && selectedEnvironmentKey) {
  await setSceneEnvironmentTexture(selectedEnvironmentKey, {
    force: true,
    showLoadingStatus: false,
    refreshOutline: false,
  })
}

const collectPbrMaterialsFromMaterial = (material: unknown, target: Set<PBRMaterial>) => {
  if (material instanceof PBRMaterial) {
    target.add(material)
    return
  }

  if (material instanceof MultiMaterial) {
    material.subMaterials.forEach((subMaterial) => {
      if (subMaterial instanceof PBRMaterial) {
        target.add(subMaterial)
      }
    })
  }
}

const isTransparentPbrMaterial = (material: PBRMaterial) => {
  const mode = material.transparencyMode

  return (
    material.alpha < 0.999 ||
    mode === Material.MATERIAL_ALPHABLEND ||
    mode === Material.MATERIAL_ALPHATESTANDBLEND ||
    material.subSurface.isRefractionEnabled
  )
}

const isTransparentMaterial = (material: unknown) => {
  if (material instanceof PBRMaterial) {
    return isTransparentPbrMaterial(material)
  }

  if (material instanceof MultiMaterial) {
    return material.subMaterials.some((subMaterial) => subMaterial instanceof PBRMaterial && isTransparentPbrMaterial(subMaterial))
  }

  return false
}

const isTransparentMesh = (mesh: AbstractMesh) => {
  return mesh.visibility < 0.999 || isTransparentMaterial(mesh.material)
}

const getMeshesUsingPbrMaterial = (material: PBRMaterial) => {
  return importedMeshes.filter((mesh) => {
    if (mesh.material === material) {
      return true
    }

    return mesh.material instanceof MultiMaterial && mesh.material.subMaterials.includes(material)
  })
}

const vectorToConfig = (vector: Vector3): VectorConfig => [vector.x, vector.y, vector.z]

const colorToConfig = (color: Color3 | Color4): ColorConfig => [color.r, color.g, color.b]

const updateCameraDepthRange = () => {
  const effectiveRadius = Math.max(camera.radius, camera.lowerRadiusLimit ?? 0.35, 0.35)
  const effectiveSceneRadius = Math.max(sceneRadius, effectiveRadius, 1)

  camera.minZ = clamp(effectiveRadius * 0.005, 0.05, 2.5)
  camera.maxZ = Math.max(effectiveSceneRadius * 20, effectiveRadius * 12, 120)
  if (ssao2Pipeline) {
    ssao2Pipeline.maxZ = Math.max(camera.maxZ, 120)
  }
}

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

const getNodeIdentity = (name: string | null | undefined, fallback: string) => {
  const normalized = name?.trim()
  return normalized && normalized !== '__root__' ? normalized : fallback
}

const getMeshKey = (mesh: AbstractMesh) => {
  const segments: string[] = []
  let current: TransformNode | AbstractMesh | null = mesh

  while (current) {
    segments.push(getNodeIdentity(current.name, `${current.getClassName()}:${current.uniqueId}`))
    current = current.parent instanceof TransformNode || current.parent instanceof AbstractMesh ? current.parent : null
  }

  return segments.reverse().join('/')
}

const getMaterialKey = (material: PBRMaterial) => {
  const materialName = material.name?.trim()

  if (materialName) {
    return `name:${materialName}`
  }

  const linkedMeshes = getMeshesUsingPbrMaterial(material)
    .map((mesh) => getMeshKey(mesh))
    .sort()

  return linkedMeshes.length > 0 ? `meshes:${linkedMeshes.join('|')}` : `id:${material.uniqueId}`
}

const getCurrentModelSignature = () => {
  if (currentModelRoots.length === 0 || importedMeshes.length === 0) {
    return null
  }

  const roots = currentModelRoots.map((root) => root.name).sort()
  const meshes = importedMeshes.map((mesh) => getMeshKey(mesh)).sort()
  return `${roots.join('|')}::${meshes.join('|')}`
}

const hasCompatibleModelSignature = (config: ViewerConfig) => {
  const currentSignature = getCurrentModelSignature()
  return Boolean(config.modelSignature && currentSignature && config.modelSignature === currentSignature)
}

const updateSceneBoundsFromCurrentModels = () => {
  if (currentModelRoots.length === 0) {
    sceneCenter = Vector3.Zero()
    sceneRadius = 8
    updateCameraDepthRange()
    updateLightDirectionHelpers()
    return
  }

  let aggregateMin = Vector3.Zero()
  let aggregateMax = Vector3.Zero()
  let hasBounds = false
  const frameMeshes = importedMeshes.filter((mesh) => !isBakedFloor(mesh))

  currentModelRoots.forEach((root) => {
    root.computeWorldMatrix(true)

    const bounds =
      frameMeshes.length > 0
        ? root.getHierarchyBoundingVectors(true, (mesh) => frameMeshes.includes(mesh))
        : root.getHierarchyBoundingVectors(true)

    if (!hasBounds) {
      aggregateMin = bounds.min.clone()
      aggregateMax = bounds.max.clone()
      hasBounds = true
      return
    }

    aggregateMin = Vector3.Minimize(aggregateMin, bounds.min)
    aggregateMax = Vector3.Maximize(aggregateMax, bounds.max)
  })

  if (!hasBounds) {
    return
  }

  const size = aggregateMax.subtract(aggregateMin)
  sceneCenter = aggregateMin.add(aggregateMax).scale(0.5)
  sceneRadius = Math.max(Math.max(size.x, size.y, size.z, 0.001) * 1.48, 4)
  updateCameraDepthRange()
  updateLightDirectionHelpers()
}

type ApplyViewerConfigOptions = {
  includeCamera?: boolean
  includeMaterials?: boolean
  includeMeshes?: boolean
}

const getArrowGeometry = (direction: Vector3) => {
  const normalized = direction.lengthSquared() > 0.0001 ? direction.normalizeToNew() : new Vector3(0, -1, 0)
  const length = Math.max(sceneRadius * 1.15, 7)
  const start = sceneCenter.subtract(normalized.scale(length * 0.5))
  const end = sceneCenter.add(normalized.scale(length * 0.5))
  const headLength = length * 0.18
  const shaftLength = length - headLength
  const shaftDiameter = Math.max(sceneRadius * 0.018, 0.08)
  const headDiameter = Math.max(sceneRadius * 0.085, 0.36)
  const headBase = end.subtract(normalized.scale(headLength))

  return {
    normalized,
    shaftCenter: start.add(headBase).scale(0.5),
    shaftDiameter,
    shaftLength,
    headCenter: headBase.add(normalized.scale(headLength * 0.5)),
    headDiameter,
    headLength,
  }
}

const setLightDirectionHelper = (id: keyof typeof lightHelperVisible, direction: Vector3, color: Color3) => {
  const currentHelper = lightHelperMeshes.get(id)

  if (!lightHelperVisible[id]) {
    currentHelper?.dispose(false, true)
    lightHelperMeshes.delete(id)
    return
  }

  currentHelper?.dispose(false, true)

  const geometry = getArrowGeometry(direction)
  const rotation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), geometry.normalized, new Quaternion())
  const root = new TransformNode(`${id}LightDirectionHelper`, scene)
  const material = new StandardMaterial(`${id}LightDirectionHelperMaterial`, scene)

  material.diffuseColor = color
  material.emissiveColor = color
  material.disableLighting = true
  material.disableDepthWrite = true

  const shaft = MeshBuilder.CreateCylinder(
    `${id}LightDirectionHelperShaft`,
    {
      height: geometry.shaftLength,
      diameter: geometry.shaftDiameter,
      tessellation: 18,
    },
    scene,
  )
  shaft.position.copyFrom(geometry.shaftCenter)
  shaft.rotationQuaternion = rotation.clone()
  shaft.material = material
  shaft.parent = root

  const head = MeshBuilder.CreateCylinder(
    `${id}LightDirectionHelperHead`,
    {
      height: geometry.headLength,
      diameterTop: 0,
      diameterBottom: geometry.headDiameter,
      tessellation: 24,
    },
    scene,
  )
  head.position.copyFrom(geometry.headCenter)
  head.rotationQuaternion = rotation.clone()
  head.material = material
  head.parent = root

  ;[shaft, head].forEach((mesh) => {
    mesh.isPickable = false
    mesh.alwaysSelectAsActiveMesh = true
    mesh.renderingGroupId = 3
  })

  lightHelperMeshes.set(id, root)
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
        refractionEnabled: material.subSurface.isRefractionEnabled,
        refractionIntensity: material.subSurface.refractionIntensity,
        translucencyEnabled: material.subSurface.isTranslucencyEnabled,
        translucencyIntensity: material.subSurface.translucencyIntensity,
        scatteringEnabled: material.subSurface.isScatteringEnabled,
        indexOfRefraction: material.subSurface.indexOfRefraction,
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
    configVersion: viewerConfigVersion,
    modelSignature: getCurrentModelSignature(),
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
        helperVisible: false,
      },
      sun: {
        intensity: sunLight.intensity,
        diffuse: colorToConfig(sunLight.diffuse),
        specular: colorToConfig(sunLight.specular),
        direction: vectorToConfig(sunLight.direction),
        position: vectorToConfig(sunLight.position),
        helperVisible: false,
        shadowMapSize,
        shadowBias,
      },
    },
    world: {
      environmentTexture: selectedEnvironmentKey ?? undefined,
      environmentBackgroundEnabled,
      environmentRotationY,
      environmentIntensity: globalEnvironmentIntensity,
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

const applyViewerConfig = (
  config: ViewerConfig,
  {
    includeCamera = true,
    includeMaterials = true,
    includeMeshes = true,
  }: ApplyViewerConfigOptions = {},
) => {
  if (includeCamera) {
    camera.fov = config.camera.fov
    camera.radius = config.camera.radius
    camera.alpha = config.camera.alpha
    camera.beta = config.camera.beta
    assignVector(camera.target, config.camera.target)
    camera.wheelPrecision = config.camera.wheelPrecision
    camera.panningSensibility = config.camera.panningSensibility
    tuneTouchCameraControls()
  }

  hemiLight.intensity = config.lights.hemi.intensity
  assignColor3(hemiLight.diffuse, config.lights.hemi.diffuse)
  assignColor3(hemiLight.groundColor, config.lights.hemi.groundColor)
  assignVector(hemiLight.direction, config.lights.hemi.direction)
  lightHelperVisible.hemi = false
  lightHelperTouched.hemi = false

  sunLight.intensity = config.lights.sun.intensity
  assignColor3(sunLight.diffuse, config.lights.sun.diffuse)
  assignColor3(sunLight.specular, config.lights.sun.specular)
  assignVector(sunLight.direction, config.lights.sun.direction)
  assignVector(sunLight.position, config.lights.sun.position)
  lightHelperVisible.sun = false
  lightHelperTouched.sun = false

  if ('shadowMapSize' in config.lights.sun) {
    shadowMapSize = config.lights.sun.shadowMapSize
    shadowBias = config.lights.sun.shadowBias
    initShadowGenerator()
  }

  if (config.world.environmentTexture) {
    void setSceneEnvironmentTexture(config.world.environmentTexture)
  }

  environmentBackgroundEnabled = config.world.environmentBackgroundEnabled ?? false
  environmentRotationY = config.world.environmentRotationY ?? 0
  updateEnvironmentBackground()
  applyEnvironmentRotation()

  globalEnvironmentIntensity = config.world.environmentIntensity
  scene.environmentIntensity = globalEnvironmentIntensity
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

  if (includeMaterials) {
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
      material.subSurface.isRefractionEnabled = materialConfig.refractionEnabled ?? material.subSurface.isRefractionEnabled
      material.subSurface.refractionIntensity = materialConfig.refractionIntensity ?? material.subSurface.refractionIntensity
      material.subSurface.isTranslucencyEnabled = materialConfig.translucencyEnabled ?? material.subSurface.isTranslucencyEnabled
      material.subSurface.translucencyIntensity = materialConfig.translucencyIntensity ?? material.subSurface.translucencyIntensity
      material.subSurface.isScatteringEnabled = materialConfig.scatteringEnabled ?? material.subSurface.isScatteringEnabled
      material.subSurface.indexOfRefraction = materialConfig.indexOfRefraction ?? material.subSurface.indexOfRefraction
    })
  }

  if (includeMeshes) {
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
  }

  updateSceneBoundsFromCurrentModels()
  updateGBufferRenderList()
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

const applyPendingStoredConfig = () => {
  if (!pendingStoredConfig) {
    return
  }

  const canApplyModelScopedSettings = hasCompatibleModelSignature(pendingStoredConfig)

  applyViewerConfig(pendingStoredConfig, {
    includeCamera: canApplyModelScopedSettings,
    includeMaterials: canApplyModelScopedSettings,
    includeMeshes: canApplyModelScopedSettings,
  })
  updateLightDirectionHelpers()
  setOutline(currentMeshNodes)

  pendingStoredConfig = null
}

const showTemporaryStatus = (message: string) => {
  setStatus(message)
  window.setTimeout(() => {
    setStatus(null)
  }, 1600)
}

let qrCodeScriptPromise: Promise<void> | null = null

const getShareData = () => ({
  url: shareActions.dataset.url || window.location.href,
  title: shareActions.dataset.title || document.title,
  desc: shareActions.dataset.desc || '',
})

const loadQRCodeScript = () => {
  const qrWindow = window as WindowWithQRCode

  if (qrWindow.qrcode) {
    return Promise.resolve()
  }

  qrCodeScriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')

    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('QR code script failed to load.'))
    document.head.append(script)
  })

  return qrCodeScriptPromise
}

const renderShareQRCode = (text: string, size = 208) => {
  const qrFactory = (window as WindowWithQRCode).qrcode

  if (!qrFactory) {
    return
  }

  const qr = qrFactory(0, 'M')
  qr.addData(text)
  qr.make()

  const context = shareQrCanvas.getContext('2d')

  if (!context) {
    return
  }

  const moduleCount = qr.getModuleCount()
  const cellSize = Math.floor(size / moduleCount)
  const canvasSize = cellSize * moduleCount

  shareQrCanvas.width = canvasSize
  shareQrCanvas.height = canvasSize
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvasSize, canvasSize)
  context.fillStyle = '#111111'

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (qr.isDark(row, col)) {
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize)
      }
    }
  }
}

const showShareOverlay = (mode: 'guide' | 'qr') => {
  shareWechatGuide.hidden = mode !== 'guide'
  shareQrPopup.hidden = mode !== 'qr'
  shareOverlay.classList.add('active')
}

const hideShareOverlay = () => {
  shareOverlay.classList.remove('active')
}

const handleWechatShare = async () => {
  const { url } = getShareData()
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent)

  if (isWeChat) {
    showShareOverlay('guide')
    return
  }

  showShareOverlay('qr')

  try {
    await loadQRCodeScript()
    renderShareQRCode(url)
  } catch (error) {
    console.error(error)
    showTemporaryStatus('\u4e8c\u7ef4\u7801\u52a0\u8f7d\u5931\u8d25\uff0c\u5df2\u590d\u5236\u5206\u4eab\u94fe\u63a5')
    await navigator.clipboard?.writeText(url)
  }
}

shareWechatButton.addEventListener('click', handleWechatShare)
shareQrClose.addEventListener('click', hideShareOverlay)
shareOverlay.addEventListener('click', (event) => {
  if (event.target === shareOverlay || (event.target instanceof Element && event.target.closest('.share-wechat-guide'))) {
    hideShareOverlay()
  }
})

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

importButton.addEventListener('click', (event) => {
  event.stopPropagation()
  importModePopup.hidden = !importModePopup.hidden
})

importModePopup.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    importShouldReplace = btn.dataset.mode === 'replace'
    importModePopup.hidden = true
    glbImportInput.value = ''
    glbImportInput.click()
  })
})

document.addEventListener('click', (event) => {
  if (!importButton.contains(event.target as Node) && !importModePopup.contains(event.target as Node)) {
    importModePopup.hidden = true
  }
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

const selectItem = (
  label: string,
  value: string,
  options: Array<{
    label: string
    value: string
  }>,
  onChange: (value: string) => void,
): DetailItem => ({
  type: 'select',
  label,
  value,
  options,
  onChange,
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
        numberItem('\u900f\u660e\u5ea6', mesh.visibility, 0, 1, 0.01, (value) => {
          mesh.visibility = value
        }),
        checkboxItem('\u63a5\u6536\u9634\u5f71', mesh.receiveShadows, (value) => {
          mesh.receiveShadows = value
        }),
        checkboxItem('\u63a5\u6536 SSAO', meshFXFlags.get(mesh)?.receiveSSAO ?? true, (value) => {
          meshFXFlags.set(mesh, { receiveSSAO: value })
          updateGBufferRenderList()
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
          refreshImportedRenderingState()
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
        checkboxItem('\u53cc\u9762\u6e32\u67d3', !material.backFaceCulling, (value) => {
          material.backFaceCulling = !value
          refreshImportedRenderingState()
        }),
      ],
    },
    {
      title: '\u5149\u7167',
      items: [
        numberItem('Direct', material.directIntensity, 0, 2, 0.01, (value) => {
          material.directIntensity = value
        }),
        numberItem('Environment', material.environmentIntensity, 0, 5, 0.01, (value) => {
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
    {
      title: '\u900f\u5c04 / \u6b21\u8868\u9762',
      items: [
        checkboxItem('\u900f\u5c04', material.subSurface.isRefractionEnabled, (value) => {
          material.subSurface.isRefractionEnabled = value
          refreshImportedRenderingState()
        }),
        numberItem('\u900f\u5c04\u5f3a\u5ea6', material.subSurface.refractionIntensity, 0, 1, 0.01, (value) => {
          material.subSurface.refractionIntensity = value
        }),
        checkboxItem('\u6b21\u8868\u9762\u534a\u900f\u660e', material.subSurface.isTranslucencyEnabled, (value) => {
          material.subSurface.isTranslucencyEnabled = value
          refreshImportedRenderingState()
        }),
        numberItem('\u6b21\u8868\u9762\u5f3a\u5ea6', material.subSurface.translucencyIntensity, 0, 1, 0.01, (value) => {
          material.subSurface.translucencyIntensity = value
        }),
        checkboxItem('\u6b21\u8868\u9762\u6563\u5c04', material.subSurface.isScatteringEnabled, (value) => {
          material.subSurface.isScatteringEnabled = value
        }),
        numberItem('IOR', material.subSurface.indexOfRefraction, 1, 2.5, 0.01, (value) => {
          material.subSurface.indexOfRefraction = value
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
        checkboxItem('\u65b9\u5411\u53ef\u89c6\u5316', lightHelperTouched.hemi && lightHelperVisible.hemi, (value) => {
          lightHelperTouched.hemi = true
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
        checkboxItem('\u65b9\u5411\u53ef\u89c6\u5316', lightHelperTouched.sun && lightHelperVisible.sun, (value) => {
          lightHelperTouched.sun = true
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
    {
      title: '\u9634\u5f71',
      items: [
        numberItem('\u8d28\u91cf', shadowMapSize, 512, 4096, 512, (value) => {
          shadowMapSize = value
          initShadowGenerator()
        }),
        numberItem('Bias', shadowBias, 0, 0.01, 0.0001, (value) => {
          shadowBias = value
          shadowGenerator.bias = value
        }),
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
                selectedEnvironmentKey ?? '',
                hdrEnvironmentOptions.map((option) => ({
                  label: option.label,
                  value: option.key,
                })),
                (value) => {
                  void setSceneEnvironmentTexture(value)
                },
              ),
            ]
          : []),
        numberItem('\u73af\u5883\u5f3a\u5ea6', globalEnvironmentIntensity, 0, 2, 0.01, (value) => {
          globalEnvironmentIntensity = value
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

  updateCameraDepthRange()
  updateLightDirectionHelpers()
}

const tuneImportedMaterial = (material: PBRMaterial) => {
  normalizeImportedGlassMaterial(material)
  normalizeImportedMaterialTransparency(material)

  const transparent = isTransparentPbrMaterial(material)

  material.forceIrradianceInFragment = true
  material.maxSimultaneousLights = 4
  material.directIntensity = transparent ? Math.max(material.directIntensity, 0.48) : 0.48
  material.environmentIntensity = Math.max(material.environmentIntensity, 1.5)
  material.specularIntensity = transparent ? Math.max(material.specularIntensity, 0.75) : 0.45
  material.backFaceCulling = false

  if (!transparent && (material.roughness === null || material.roughness === undefined)) {
    material.roughness = 0.78
  }
  syncImportedMaterialRenderingState(material)
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
  clearAllBillboards()
  unregisterImportedDetails()
  currentModelRoots.forEach((root) => root.dispose(false, true))
  currentModelRoots = []
  importedMeshes = []
  importedMaterialTotal = 0
  importedFileNames = []
  importedFileName = '\u672a\u5bfc\u5165'
  const shadowMap = shadowGenerator.getShadowMap()
  if (shadowMap) {
    shadowMap.renderList = []
  }
  setOutline([])
}

function flushSceneRenderCaches() {
  scene.resetCachedMaterial()
  scene.cleanCachedTextureBuffer()
  engine.wipeCaches(true)
}

const makeMeshOutlineNodes = (meshes: AbstractMesh[]): OutlineNode[] =>
  meshes.filter((m) => m.name !== '_root' && m.name !== '__root__').map((mesh) => ({
    name: mesh.name || `Mesh ${mesh.uniqueId}`,
    kind: 'mesh',
    detailId: `mesh:${mesh.uniqueId}`,
    visibilityTarget: {
      getVisible: () => mesh.isVisible,
      setVisible: (visible) => {
        mesh.isVisible = visible
      },
    },
    open: true,
    children:
      mesh.material instanceof PBRMaterial
        ? [{ name: mesh.material.name || `Material ${mesh.material.uniqueId}`, kind: 'material', detailId: `material:${mesh.material.uniqueId}` }]
        : undefined,
  }))

const makeModelOutlineNode = (fileName: string, root: TransformNode, meshes: AbstractMesh[]): OutlineNode => ({
  name: fileName,
  kind: 'model',
  visibilityTarget: {
    getVisible: () => root.isEnabled(false),
    setVisible: (visible) => {
      root.setEnabled(visible)
    },
  },
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

  if (replaceExisting) {
    disposeCurrentModels()
    resetRealtimePipelines()
    flushSceneRenderCaches()
  }

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

  topLevelNodes.forEach((node) => {
    node.parent = root
  })

  result.meshes.forEach((mesh) => {
    mesh.receiveShadows = true
    collectPbrMaterialsFromMaterial(mesh.material, materials)
  })

  materials.forEach(tuneImportedMaterial)
  currentModelRoots.push(root)
  importedMeshes = [...importedMeshes, ...result.meshes]
  refreshImportedRenderingState()
  importedMaterialTotal += materials.size
  importedFileNames.push(fileName)
  importedFileName = getImportedDisplayName()
  registerImportedDetails(result.meshes, materials)
  setOutline(
    currentModelRoots.map((modelRoot, index) =>
      makeModelOutlineNode(
        importedFileNames[index] ?? modelRoot.name,
        modelRoot,
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

  if (replaceExisting && techActiveSubTab === '\u5b9e\u65f6\u6e32\u67d3') {
    enableRealtimeEffects()
  }

  flushSceneRenderCaches()

  defaultConfig = createViewerConfig()

  if (shouldApplyStoredConfig && pendingStoredConfig) {
    applyPendingStoredConfig()
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

const loadDefaultModels = async () => {
  if (defaultModels.length === 0) {
    setStatus('\u672a\u5728 assets \u4e2d\u627e\u5230 target.glb')
    return
  }

  const failedModels: string[] = []

  for (const model of defaultModels) {
    try {
      await loadModel(model.url, model.fileName)
    } catch (error) {
      console.error(`Failed to load ${model.fileName}`, error)
      failedModels.push(model.fileName)
    }
  }

  if (importedMeshes.length > 0 && pendingStoredConfig) {
    applyPendingStoredConfig()
  }

  if (failedModels.length > 0) {
    setStatus(`\u5df2\u5bfc\u5165 ${defaultModels.length - failedModels.length} \u4e2a GLB\uff0c${failedModels.length} \u4e2a\u5931\u8d25`)
    return
  }

  setStatus(null)
}

loadDefaultModels().catch((error) => {
  console.error(error)
  setStatus('Failed to load assets GLB files')
})

let sceneInstrumentation: SceneInstrumentation | undefined
try {
  sceneInstrumentation = new SceneInstrumentation(scene)
  sceneInstrumentation.captureFrameTime = true
} catch {
  // scene instrumentation not supported
}

let frameUpdateTimer = 0
const frameUpdateInterval = 0.8

const frameMetrics: { label: string; get: () => string }[] = [
  { label: 'FPS', get: () => String(Math.round(engine.getFps())) },
  { label: 'Draw Calls', get: () => String(sceneInstrumentation?.drawCallsCounter.current ?? 0) },
  { label: 'Triangles', get: () => String(scene.getActiveIndices() ?? 0) },
  { label: 'Meshes', get: () => String(scene.getActiveMeshes().length) + ' / ' + String(scene.meshes.length) },
]
let frameOverlayVisible = false

const updateFrameGrid = () => {
  frameGrid.textContent = ''
  for (const metric of frameMetrics) {
    const row = document.createElement('div')
    row.className = 'frame-metric'
    const label = document.createElement('span')
    label.className = 'frame-metric-label'
    label.textContent = metric.label
    const value = document.createElement('span')
    value.className = 'frame-metric-value'
    value.textContent = metric.get()
    row.append(label, value)
    frameGrid.append(row)
  }
}

frameToggle.addEventListener('click', () => {
  frameOverlayVisible = !frameOverlayVisible
  frameOverlay.classList.toggle('frame-overlay-open', frameOverlayVisible)
  frameToggle.classList.toggle('frame-toggle-active', frameOverlayVisible)
  if (frameOverlayVisible) updateFrameGrid()
})

frameOverlayClose.addEventListener('click', () => {
  frameOverlayVisible = false
  frameOverlay.classList.remove('frame-overlay-open')
  frameToggle.classList.remove('frame-toggle-active')
})

engine.runRenderLoop(() => {
  try {
    updateKeyboardNavigation()
    updateBillboards()
    updateFocusAnimation()
    updateSelectionBox()
    updateCameraDepthRange()
    if (frameOverlayVisible) {
      frameUpdateTimer += engine.getDeltaTime()
      if (frameUpdateTimer >= frameUpdateInterval * 1000) {
        frameUpdateTimer = 0
        updateFrameGrid()
      }
    }
  } catch (error) {
    console.error(error)
    pressedKeys.clear()
  }

  scene.render()
})

window.addEventListener('resize', () => {
  engine.resize()
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.6))
  tuneTouchCameraControls()
})
