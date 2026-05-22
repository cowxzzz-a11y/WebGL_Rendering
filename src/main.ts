import './style.css'
import '@babylonjs/core/Culling/ray'
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
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
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
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent'
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

type DefaultModel = {
  url: string
  fileName: string
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
const environmentUrl = '/environment.env'

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
    <button id="frameToggle" class="frame-toggle-button share-button" type="button" aria-label="性能指标" title="性能指标">
      <svg viewBox="0 0 100 80" aria-hidden="true" width="24" height="20">
        <rect x="25" y="45" width="10" height="20" rx="4" fill="currentColor" />
        <rect x="42" y="20" width="10" height="45" rx="4" fill="currentColor" />
        <rect x="59" y="34" width="10" height="31" rx="4" fill="currentColor" />
      </svg>
    </button>
    <button id="importButton" class="import-button-icon share-button" type="button" aria-label="导入 GLB" title="导入 GLB">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" />
      </svg>
    </button>
    <div id="importModePopup" class="import-mode-popup" hidden>
      <button type="button" data-mode="replace">替换</button>
      <button type="button" data-mode="insert">置入</button>
    </div>
    <button id="shareWechat" class="share-button" type="button" aria-label="微信分享" title="微信分享">
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path d="M690.1 377.4c5.9 0 11.8.2 17.6.5-24.4-128.7-158.3-227.1-319.9-227.1C209 150.8 64 270.8 64 420.2c0 81.1 43.6 154.2 111.9 203.6l-29.5 88.3 99.4-49.7c37.4 9.8 75.2 14.8 105 14.8 11.1 0 21.9-1 32.5-2.4C377 637.9 369.6 598.9 369.6 558.2c0-99.8 88-180.8 320.5-180.8zM445.8 276c21.2 0 36.8 15.6 36.8 36.8s-15.6 36.8-36.8 36.8-36.8-15.6-36.8-36.8 15.7-36.8 36.8-36.8zm-159.2 73.6c-21.2 0-36.8-15.6-36.8-36.8s15.6-36.8 36.8-36.8 36.8 15.6 36.8 36.8-15.6 36.8-36.8 36.8z" />
        <path d="M912 558.2c0-122.7-122.5-222.5-273.2-222.5-160.1 0-273.2 99.8-273.2 222.5s113.1 222.5 273.2 222.5c31.4 0 62.8-9.8 94.2-19.6l80.6 49.7-19.6-78.5C862 693.4 912 631.7 912 558.2zM554 534.4c-15.6 0-29.5-13.9-29.5-29.5s13.9-29.5 29.5-29.5 29.5 13.9 29.5 29.5-13.9 29.5-29.5 29.5zm185.8 0c-15.6 0-29.5-13.9-29.5-29.5s13.9-29.5 29.5-29.5 29.5 13.9 29.5 29.5-13.9 29.5-29.5 29.5z" />
      </svg>
    </button>
  </div>
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
  <div id="shareOverlay" class="share-overlay" aria-modal="true" role="dialog">
    <div id="shareWechatGuide" class="share-wechat-guide" hidden>
      <div class="guide-arrow">\u2197</div>
      <div class="guide-text">\u70b9\u51fb\u53f3\u4e0a\u89d2\u300c\u00b7\u00b7\u00b7\u300d<br />\u9009\u62e9\u300c\u8f6c\u53d1\u7ed9\u670b\u53cb\u300d<br />\u5373\u53ef\u751f\u6210\u5fae\u4fe1\u5361\u7247</div>
    </div>
    <div id="shareQrPopup" class="share-qr-popup" hidden>
      <canvas id="shareQrCanvas" aria-label="\u5fae\u4fe1\u5206\u4eab\u4e8c\u7ef4\u7801"></canvas>
      <p>\u6253\u5f00\u5fae\u4fe1\u626b\u4e00\u626b\u5206\u4eab</p>
      <button id="shareQrClose" class="share-qr-close" type="button">关闭</button>
    </div>
  </div>
  <div id="frameOverlay" class="frame-overlay">
    <div class="frame-overlay-content">
      <header class="frame-overlay-header">
        <h2>性能指标</h2>
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
    label: '\u540e\u671f',
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
    id: 'camera',
    label: '\u6444\u50cf\u673a',
    nodes: [{ name: 'Camera', kind: 'camera', detailId: 'camera:main' }],
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
let ssao2Pipeline: SSAO2RenderingPipeline | null = null
let ssrPipeline: SSRRenderingPipeline | null = null
let shadowFilterMode = 6
let savedSunIntensity = 0.62
let savedLightmaps = new WeakMap<PBRMaterial, BaseTexture>()

const disableRealtimeEffects = () => {
  savedSunIntensity = sunLight.intensity
  sunLight.intensity = 0
  sunLight.shadowEnabled = false
  const map = shadowGenerator.getShadowMap()
  if (map) map.renderList = []
  if (ssao2Pipeline) ssao2Pipeline.totalStrength = 0
  if (ssrPipeline) ssrPipeline.isEnabled = false
  importedMeshes.forEach((m) => { m.receiveShadows = false })
}

const enableRealtimeEffects = () => {
  sunLight.intensity = savedSunIntensity
  sunLight.shadowEnabled = true
  const map = shadowGenerator.getShadowMap()
  if (map) map.renderList = [...importedMeshes]
  importedMeshes.forEach((m) => { m.receiveShadows = true })
  if (!geometryBufferRenderer) {
    geometryBufferRenderer = scene.enableGeometryBufferRenderer()
  }
  if (!ssao2Pipeline) {
    ssao2Pipeline = new SSAO2RenderingPipeline('SSAO2', scene, { ssaoRatio: 0.5, blurRatio: 1.0 }, [camera], geometryBufferRenderer ?? true)
    ssao2Pipeline.maxZ = Math.max(camera.maxZ, 120)
  } else {
    ssao2Pipeline.totalStrength = 1
  }
  if (!ssrPipeline) {
    ssrPipeline = new SSRRenderingPipeline('SSR', scene, [camera], true)
    ssrPipeline.step = 5
    ssrPipeline.maxSteps = 2000
    ssrPipeline.thickness = 2
  } else {
    ssrPipeline.isEnabled = true
  }
  scene.materials.forEach((mat) => {
    if (mat instanceof PBRMaterial && savedLightmaps.has(mat)) {
      mat.lightmapTexture = null
    }
  })
}

let geometryBufferRenderer: GeometryBufferRenderer | null = null

const disableLightmaps = () => {
  scene.materials.forEach((mat) => {
    if (mat instanceof PBRMaterial && mat.lightmapTexture) {
      savedLightmaps.set(mat, mat.lightmapTexture)
      mat.lightmapTexture = null
    }
  })
}

const enableLightmaps = () => {
  scene.materials.forEach((mat) => {
    if (mat instanceof PBRMaterial && savedLightmaps.has(mat)) {
      const tex = savedLightmaps.get(mat)
      if (tex) mat.lightmapTexture = tex
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
  cb.checked = value
  cb.addEventListener('change', () => onChange(cb.checked))
  const span = document.createElement('span')
  span.textContent = label
  row.append(cb, span)
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

const renderRealtimePanel = (panel: HTMLElement) => {
  // --- Sun Light ---
  const sunBody: HTMLElement[] = []
  sunBody.push(createColorInput('\u5149\u6e90\u989c\u8272', sunLight.diffuse, (c) => { sunLight.diffuse = c }))
  sunBody.push(createSlider('\u5149\u6e90\u5f3a\u5ea6', sunLight.intensity, 0, 3, 0.01, (v) => { sunLight.intensity = v }))

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
  panel.append(createModule('\u592a\u9633\u5149', sunBody))

  // --- Real-time Shadow ---
  const shadowBody: HTMLElement[] = []
  const shadowMap = shadowGenerator.getShadowMap()
  let shadowEnabled = shadowMap ? (shadowMap.renderList?.length ?? 0) > 0 : false
  const shadowToggle = createCheckbox('\u9634\u5f71\u5f00\u5173', shadowEnabled, (v) => {
    const map = shadowGenerator.getShadowMap()
    if (map) {
      map.renderList = v ? [...importedMeshes] : []
    }
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
  const ssaoToggle = createCheckbox('SSAO \u5f00\u5173', ssao2Pipeline ? ssao2Pipeline.totalStrength > 0 : false, (v) => {
    if (v) {
      if (!ssao2Pipeline) {
        if (!geometryBufferRenderer) {
          geometryBufferRenderer = scene.enableGeometryBufferRenderer()
        }
        ssao2Pipeline = new SSAO2RenderingPipeline('SSAO2', scene, { ssaoRatio: 0.5, blurRatio: 1.0 }, [camera], geometryBufferRenderer ?? true)
      }
      ssao2Pipeline.totalStrength = 1
    } else {
      if (ssao2Pipeline) ssao2Pipeline.totalStrength = 0
    }
  })
  ssaoBody.push(ssaoToggle)
  ssaoBody.push(createSlider('\u906e\u853d\u5f3a\u5ea6', ssao2Pipeline?.totalStrength ?? 1, 0, 3, 0.01, (v) => { if (ssao2Pipeline) ssao2Pipeline.totalStrength = v }))
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
  radiusInput.value = String(ssao2Pipeline?.radius ?? 2)
  const radiusNum = document.createElement('input')
  radiusNum.type = 'number'
  radiusNum.className = 'tech-number'
  radiusNum.min = '0.1'
  radiusNum.max = '100'
  radiusNum.step = '0.1'
  radiusNum.value = String(ssao2Pipeline?.radius ?? 2)
  const onRadiusChange = (v: number) => { if (ssao2Pipeline) ssao2Pipeline.radius = v; radiusInput.value = String(v); radiusNum.value = String(v) }
  radiusInput.addEventListener('input', () => onRadiusChange(parseFloat(radiusInput.value)))
  radiusNum.addEventListener('change', () => onRadiusChange(parseFloat(radiusNum.value)))
  radiusRow.append(radiusLabel, radiusInput, radiusNum)
  ssaoBody.push(radiusRow)
  ssaoBody.push(createSlider('\u91c7\u6837\u6570', ssao2Pipeline?.samples ?? 8, 4, 64, 1, (v) => { if (ssao2Pipeline) ssao2Pipeline.samples = v }))
  panel.append(createModule('SSAO 2', ssaoBody))

  // --- SSR ---
  const ssrBody: HTMLElement[] = []
  const ssrToggle = createCheckbox('SSR \u5f00\u5173', ssrPipeline ? ssrPipeline.isEnabled : false, (v) => {
    if (v) {
      if (!ssrPipeline) {
        ssrPipeline = new SSRRenderingPipeline('SSR', scene, [camera], true)
        ssrPipeline.step = 5
        ssrPipeline.maxSteps = 2000
        ssrPipeline.thickness = 2
      }
      ssrPipeline.isEnabled = true
    } else {
      if (ssrPipeline) ssrPipeline.isEnabled = false
    }
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

let selectedBakeMeshName = ''
let selectedUVChannel = 1
let lightmapInvertY = false
let lastLightmapUrl = ''
let lastLightmapTexture: Texture | null = null

const getBakeTargetMeshes = () => {
  if (selectedBakeMeshName) {
    const mesh = scene.getMeshByName(selectedBakeMeshName)
    return mesh ? [mesh] : []
  }
  return []
}

const applyLightmapToTarget = (texture: Texture) => {
  const targets = getBakeTargetMeshes()
  if (targets.length > 0) {
    targets.forEach((mesh) => {
      if (mesh.material instanceof MultiMaterial) {
        mesh.material.subMaterials.forEach((sm) => {
          if (sm instanceof PBRMaterial) {
            sm.lightmapTexture = texture
            sm.useLightmapAsShadowmap = true
          }
        })
      } else if (mesh.material instanceof PBRMaterial) {
        mesh.material.lightmapTexture = texture
        mesh.material.useLightmapAsShadowmap = true
      }
    })
  } else {
    scene.materials.forEach((mat) => {
      if (mat instanceof PBRMaterial) {
        mat.lightmapTexture = texture
        mat.useLightmapAsShadowmap = true
      }
    })
  }
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

const updateBakeMeshSelect = (sel: HTMLSelectElement) => {
  const prev = sel.value
  sel.textContent = ''
  const names = importedMeshes.filter((m) => m.name !== '_root' && m.name !== '__root__').map((m) => m.name)
  if (names.length === 0) {
    const el = document.createElement('option')
    el.value = ''
    el.textContent = '\u8bf7\u5148\u52a0\u8f7d\u6a21\u578b'
    el.disabled = true
    sel.append(el)
    return
  }
  names.forEach((name) => {
    const el = document.createElement('option')
    el.value = name
    el.textContent = name
    if (name === (prev || selectedBakeMeshName || names[0])) el.selected = true
    sel.append(el)
  })
}

const renderBakePanel = (panel: HTMLElement) => {
  const body: HTMLElement[] = []

  const meshSelect = createSelect('\u9009\u62e9\u76ee\u6807\u7f51\u683c', [], '', (v) => {
    selectedBakeMeshName = v
  })
  const sel = meshSelect.querySelector('select')!
  updateBakeMeshSelect(sel)
  body.push(meshSelect)

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
  body.push(uvRow)

  const invYRow = document.createElement('label')
  invYRow.className = 'tech-row tech-row-checkbox'
  const invYCb = document.createElement('input')
  invYCb.type = 'checkbox'
  invYCb.checked = lightmapInvertY
  invYCb.addEventListener('change', () => {
    lightmapInvertY = invYCb.checked
    if (lastLightmapUrl && lastLightmapTexture) {
      lastLightmapTexture.dispose()
      const texture = new Texture(lastLightmapUrl, scene, undefined, lightmapInvertY)
      texture.coordinatesIndex = selectedUVChannel
      applyLightmapToTarget(texture)
      lastLightmapTexture = texture
    }
  })
  const invYSpan = document.createElement('span')
  invYSpan.textContent = '\u53cd\u8f6c Y \u8f74 (Invert Y)'
  invYRow.append(invYCb, invYSpan)
  body.push(invYRow)

  const uploadRow = document.createElement('div')
  uploadRow.className = 'tech-row'
  const uploadLabel = document.createElement('span')
  uploadLabel.className = 'tech-label'
  uploadLabel.textContent = '\u5149\u7167\u8d34\u56fe'
  const uploadBtn = document.createElement('button')
  uploadBtn.className = 'tech-upload-btn'
  uploadBtn.textContent = 'Lightmap Upload'
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.png,.jpg,.exr,.hdr'
  fileInput.hidden = true
  uploadBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    if (lastLightmapUrl) URL.revokeObjectURL(lastLightmapUrl)
    lastLightmapUrl = url
    if (lastLightmapTexture) lastLightmapTexture.dispose()
    const texture = new Texture(url, scene, undefined, lightmapInvertY)
    texture.coordinatesIndex = selectedUVChannel
    applyLightmapToTarget(texture)
    lastLightmapTexture = texture
    fileInput.value = ''
  })
  uploadRow.append(uploadLabel, uploadBtn, fileInput)
  body.push(uploadRow)

  panel.append(createModule('\u5149\u7167\u8d34\u56fe\u69fd\u4f4d', body))

  const bakeBody: HTMLElement[] = []
  bakeBody.push(createSlider('\u5149\u7167\u8d34\u56fe\u5f3a\u5ea6', 1, 0, 2, 0.01, (v) => {
    setLightmapLevelForTarget(v)
  }))
  panel.append(createModule('\u70d8\u70e4\u5149\u5f71\u5fae\u8c03', bakeBody, false))
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
        try {
          if (label === '\u6a21\u578b\u70d8\u70e4') {
            disableRealtimeEffects()
            disableLightmaps()
          } else {
            enableRealtimeEffects()
            enableLightmaps()
          }
        } catch (e) {
          console.error('Tech mode switch error', e)
        }
        techActiveSubTab = label
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
      const sm = shadowGenerator.getShadowMap()
      techPanelCache.shadowToggle.checked = sm ? (sm.renderList?.length ?? 0) > 0 : false
    }
    const sel = techPanelCache.bakePanel.querySelector('select')
    if (sel) updateBakeMeshSelect(sel)
    sceneOutline.append(techPanelCache.panel)
  }
}

const setOutline = (meshNodes: OutlineNode[] = []) => {
  currentMeshNodes = meshNodes
  const tabs = getPanelTabs(meshNodes)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]

  renderPanelTabs(tabs)
  sceneOutline.textContent = ''

  if (activeTab.id === 'tech') {
    renderTechPanel()
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
  importedMeshes.forEach((mesh) => shadowGenerator.addShadowCaster(mesh))
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

let importedMeshes: AbstractMesh[] = []
initShadowGenerator()
setOutline()
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

const updateCameraDepthRange = () => {
  const effectiveRadius = Math.max(camera.radius, camera.lowerRadiusLimit ?? 0.35, 0.35)
  const effectiveSceneRadius = Math.max(sceneRadius, effectiveRadius, 1)

  camera.minZ = clamp(effectiveRadius * 0.005, 0.05, 2.5)
  camera.maxZ = Math.max(effectiveSceneRadius * 20, effectiveRadius * 12, 120)
  if (ssao2Pipeline) ssao2Pipeline.maxZ = Math.max(ssao2Pipeline.maxZ, camera.maxZ)
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
        shadowMapSize,
        shadowBias,
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
  tuneTouchCameraControls()

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

  if ('shadowMapSize' in config.lights.sun) {
    shadowMapSize = config.lights.sun.shadowMapSize
    shadowBias = config.lights.sun.shadowBias
    initShadowGenerator()
  }

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

  updateCameraDepthRange()
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
  const shadowMap = shadowGenerator.getShadowMap()
  if (shadowMap) {
    shadowMap.renderList = []
  }
  setOutline([])
}

const makeMeshOutlineNodes = (meshes: AbstractMesh[]): OutlineNode[] =>
  meshes.filter((m) => m.name !== '_root' && m.name !== '__root__').map((mesh) => ({
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
    mesh.receiveShadows = true
    shadowGenerator.addShadowCaster(mesh)

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
    applyViewerConfig(pendingStoredConfig)
    pendingStoredConfig = null
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
  { label: '帧率 (FPS)', get: () => String(Math.round(engine.getFps())) },
  { label: '渲染调用 (Draw Calls)', get: () => String(sceneInstrumentation?.drawCallsCounter.current ?? 0) },
  { label: '逻辑耗时 (CPU Time)', get: () => {
    const v = sceneInstrumentation?.frameTimeCounter.current
    return v != null ? String(Math.round(v * 10) / 10) + ' ms' : '0 ms'
  }},
  { label: '场景面数 (Triangles)', get: () => {
    const v = scene.totalVerticesPerfCounter.current
    return String(v ?? 0)
  }},
  { label: '活动网格 (Meshes)', get: () => String(scene.getActiveMeshes().length) + ' / ' + String(scene.meshes.length) },
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
