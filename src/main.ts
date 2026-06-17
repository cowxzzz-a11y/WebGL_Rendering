import './styles/index.css'
import '@babylonjs/core/Culling/ray'
import '@babylonjs/core/Helpers/sceneHelpers'
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader'
import '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import '@babylonjs/loaders/glTF'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent'
import '@babylonjs/core/Rendering/prePassRendererSceneComponent'
import { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import { Material } from '@babylonjs/core/Materials/material'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { ViewerConfig } from './features/config/viewerConfig'
import { applyViewerConfigSnapshot } from './features/config/viewerConfigRuntime'
import type { ApplyViewerConfigOptions } from './features/config/viewerConfigRuntime'
import { configureLocalKtx2Decoder } from './core/ktx2'
import { clearCameraInertia, createViewerCamera, setSinglePointerPanMode, tuneTouchCameraControls } from './core/camera'
import {
  createViewerEngineScene,
  setStoredViewerEnginePreference,
} from './core/engine'
import type { ViewerEnginePreference } from './core/engine'
import { createSceneLights } from './core/lights'
import { createClassicPipeline } from './core/pipeline'
import { defaultEnvironmentKey, hdrEnvironmentOptions } from './features/assets/defaultAssets'
import { setupWechatShare } from './features/share/wechatShare'
import { collectPbrMaterialsFromMaterial } from './features/material/materialUtils'
import { tuneImportedMaterial } from './features/material/importedMaterialRendering'
import { createLightDirectionHelperController } from './features/lights/lightDirectionHelpers'
import type { LightDirectionHelperController } from './features/lights/lightDirectionHelpers'
import { createFrameMetricsController } from './features/metrics/frameMetrics'
import { createBillboardController } from './features/billboard/billboardController'
import type { BillboardController } from './features/billboard/billboardController'
import { setupContentBrowser } from './features/content/contentBrowser'
import {
  applyRiverWaterMaterial,
  createRiverWaterMaterialDetail,
  isRiverWaterMaterial,
} from './features/content/materials/riverWaterMaterial'
import { createEnvironmentController } from './features/environment/environmentController'
import type { EnvironmentController } from './features/environment/environmentController'
import { createLightmapController } from './features/lightmap/lightmapController'
import type { LightmapController } from './features/lightmap/lightmapController'
import { getProjectById, getProjectEntries } from './features/projects/projectAssets'
import type { ProjectEntry } from './features/projects/projectAssets'
import { renderProjectManager } from './features/projects/projectManager'
import { renderRealtimePanel as renderRealtimePanelContent } from './features/rendering/realtimePanel'
import { createRealtimeRenderingController } from './features/rendering/realtimeRuntime'
import type { RealtimeRenderingController } from './features/rendering/realtimeRuntime'
import { renderGeneralPanelContent, renderViewportPanelContent } from './features/panels/viewerPanels'
import { createDynamicDetailsRegistry } from './features/details/dynamicDetailsRegistry'
import { createMaterialDetail as createMaterialDetailDescriptor, createMeshDetail as createMeshDetailDescriptor, createModelDetail as createModelDetailDescriptor } from './features/details/modelDetails'
import { registerStaticDetails } from './features/details/staticDetails'
import { getCurrentModelSignature as getModelSignature } from './features/model/modelIdentity'
import { setupModelImportControls } from './features/model/modelImportControls'
import { getImportProgressMessage, getModelFrame, getSceneFrameRadius, isBakedFloor } from './features/model/modelImportUtils'
import { getImportedDisplayName, makeModelOutlineNode } from './features/model/modelOutline'
import { createKeyboardNavigationController } from './features/navigation/keyboardNavigation'
import { createSelectionController } from './features/selection/selectionController'
import type { SelectionController } from './features/selection/selectionController'
import { legacyEnvironmentUrl } from './shared/constants'
import type {
  DetailDescriptor,
  OutlineNode,
  PanelTab,
} from './shared/types'
import { queryAppDom, renderAppShell } from './ui/dom'
import { renderDetailDescriptor, renderDetailPlaceholder, textItem } from './ui/detailPanel'
import { createPanelTabsRenderer, makeOutlineBranch } from './ui/outliner'
import { clamp } from './utils/math'

configureLocalKtx2Decoder()

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root was not found.')
}

renderAppShell(app)

const isConstrainedMobileRuntime =
  window.matchMedia('(pointer: coarse), (max-width: 760px)').matches ||
  /MicroMessenger/i.test(navigator.userAgent)

const {
  canvas,
  projectManager,
  projectBackButton,
  status,
  shareActions,
  contentBrowserButton,
  contentBrowserPanel,
  shareWechatButton,
  shareOverlay,
  shareWechatGuide,
  shareQrPopup,
  shareQrCanvas,
  shareQrClose,
  sceneTabs,
  outlinerPanel,
  panelCollapseToggle,
  touchModeToggle,
  saveConfigButton,
  resetConfigButton,
  sceneOutline,
  detailPanel,
  glbImportInput,
  importButton,
  importModePopup,
  frameToggle,
  frameOverlay,
  frameOverlayClose,
  frameGrid,
  selectionModePanel,
  selectModePartButton,
  selectModeModelButton,
  resetCameraButton,
} = queryAppDom()

let activeTabId = 'tech'
let selectedDetailId: string | null = null
let selectionMode: 'part' | 'model' = 'part'
let currentMeshNodes: OutlineNode[] = []
let importedFileName = '\u672a\u5bfc\u5165'
let generalActiveSubTab = '\u73af\u5883'
const detailRegistry = new Map<string, () => DetailDescriptor>()
let importedMeshes: AbstractMesh[] = []
let importedMaterialTotal = 0
let currentModelRoots: TransformNode[] = []
let importedFileNames: string[] = []
let sceneCenter = Vector3.Zero()
let sceneRadius = 8
const lightHelperVisible = {
  hemi: false,
  sun: false,
}
const lightHelperTouched = {
  hemi: false,
  sun: false,
}
let panelCollapsed = isConstrainedMobileRuntime
let environmentController: EnvironmentController
let selectionController: SelectionController
let lightDirectionHelpers: LightDirectionHelperController
let billboardController: BillboardController
let lightmapController: LightmapController

const getEnvironmentState = () => environmentController.getState()

const getCurrentEnvironmentLabel = () => environmentController.getCurrentLabel()

const getCurrentEnvironmentUrl = () => environmentController.getCurrentUrl()

const applyPanelCollapsedState = () => {
  const panelRight = Number.parseFloat(window.getComputedStyle(outlinerPanel).right) || 12
  outlinerPanel.classList.toggle('outliner-panel-collapsed', panelCollapsed)
  panelCollapseToggle.classList.toggle('panel-collapse-toggle-collapsed', panelCollapsed)
  outlinerPanel.style.transform = panelCollapsed ? `translateX(${outlinerPanel.offsetWidth + panelRight}px)` : 'translateX(0)'
  panelCollapseToggle.style.right = panelCollapsed ? `${panelRight}px` : `calc(${panelRight}px + var(--panel-width))`
  panelCollapseToggle.textContent = panelCollapsed ? '<' : '>'
  panelCollapseToggle.ariaLabel = panelCollapsed ? '\u5c55\u5f00\u53c2\u6570\u9762\u677f' : '\u6536\u8d77\u53c2\u6570\u9762\u677f'
  panelCollapseToggle.title = panelCollapsed ? '\u5c55\u5f00\u53c2\u6570\u9762\u677f' : '\u6536\u8d77\u53c2\u6570\u9762\u677f'
}

panelCollapseToggle.addEventListener('click', () => {
  panelCollapsed = !panelCollapsed
  applyPanelCollapsedState()
})

applyPanelCollapsedState()

const setStatus = (message: string | null) => {
  status.textContent = message ?? ''
  status.hidden = message === null
}

const setEnginePreference = (value: ViewerEnginePreference) => {
  setStoredViewerEnginePreference(value)
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('renderer', value)
  window.history.replaceState(null, '', nextUrl)
  setStatus(`正在切换渲染器到 ${value.toUpperCase()}...`)
  window.setTimeout(() => {
    window.location.reload()
  }, 120)
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

const renderPanelTabs = createPanelTabsRenderer(
  sceneTabs,
  () => activeTabId,
  (tabId) => {
    activeTabId = tabId
  },
  () => setOutline(currentMeshNodes),
)

let techActiveSubTab = '\u5b9e\u65f6\u6e32\u67d3'
let viewportActiveSubTab = '\u6444\u50cf\u673a'
let savedLightmaps = new WeakMap<PBRMaterial, BaseTexture>()
let realtimeController: RealtimeRenderingController

const hideDetailPanel = () => {
  detailPanel.hidden = true
  detailPanel.textContent = ''
}

const renderOutlineDetailPlaceholder = () => {
  selectedDetailId = null
  renderDetailPlaceholder(detailPanel)
}

const isBillboardMesh = (mesh: AbstractMesh) => billboardController.hasBillboard(mesh)

const applyRealtimeShadowState = () => realtimeController.applyRealtimeShadowState()

const resetRealtimePipelines = () => realtimeController.resetRealtimePipelines()

const disableRealtimeEffects = () => realtimeController.disableRealtimeEffects()

const enableRealtimeEffects = () => realtimeController.enableRealtimeEffects()

const restoreRealtimeLightState = () => realtimeController.restoreRealtimeLightState()

const updateGBufferRenderList = () => realtimeController.updateGBufferRenderList()

const refreshImportedRenderingState = () => realtimeController.refreshImportedRenderingState()

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

const renderGeneralPanel = () => {
  const environmentState = getEnvironmentState()

  hideDetailPanel()
  sceneOutline.textContent = ''
  sceneOutline.append(renderGeneralPanelContent({
    activeSubTab: generalActiveSubTab,
    setActiveSubTab: (value) => { generalActiveSubTab = value },
    hdrEnvironmentOptions,
    selectedEnvironmentKey: environmentState.selectedEnvironmentKey,
    environmentBackgroundEnabled: environmentState.environmentBackgroundEnabled,
    environmentRotationY: environmentState.environmentRotationY,
    globalEnvironmentIntensity: environmentState.globalEnvironmentIntensity,
    imageProcessing,
    pipeline,
    hemiLight,
    getCurrentEnvironmentUrl,
    getClearColor: () => scene.clearColor,
    setClearColor: (value) => { scene.clearColor = value },
    setSceneEnvironmentTexture: (value) => { void setSceneEnvironmentTexture(value) },
    setEnvironmentBackgroundEnabled: environmentController.setEnvironmentBackgroundEnabled,
    setEnvironmentRotationY: environmentController.setEnvironmentRotationY,
    setGlobalEnvironmentIntensity: environmentController.setGlobalEnvironmentIntensity,
    updateEnvironmentBackground: environmentController.updateEnvironmentBackground,
    applyEnvironmentRotation: environmentController.applyEnvironmentRotation,
    resetHemiLightHelper: () => {
      lightHelperTouched.hemi = false
      lightHelperVisible.hemi = false
    },
    setHemiLightHelperVisible: (value) => {
      lightHelperTouched.hemi = true
      lightHelperVisible.hemi = value
    },
    getHemiLightHelperVisible: () => lightHelperTouched.hemi && lightHelperVisible.hemi,
    updateLightDirectionHelpers: () => updateLightDirectionHelpers(),
    enginePreference,
    engineMode,
    webgpuSupported,
    engineFallbackReason,
    setEnginePreference,
  }))
}

const renderBillboardPanel = (panel: HTMLElement) => {
  billboardController.renderPanel(panel)
}

const renderViewportPanel = () => {
  selectedDetailId = null
  hideDetailPanel()
  sceneOutline.textContent = ''
  sceneOutline.append(renderViewportPanelContent({
    activeSubTab: viewportActiveSubTab,
    setActiveSubTab: (value) => { viewportActiveSubTab = value },
    camera,
    renderBillboardPanel,
  }))
}
const renderRealtimePanel = (panel: HTMLElement) => {
  renderRealtimePanelContent({
    panel,
    sunLight,
    shadowGenerator,
    getShadowEnabled: realtimeController.getShadowEnabled,
    setShadowEnabled: realtimeController.setShadowEnabled,
    getShadowFilterMode: realtimeController.getShadowFilterMode,
    setShadowFilterMode: realtimeController.setShadowFilterMode,
    getShadowMapSize: () => shadowMapSize,
    setShadowMapSize: (value) => { shadowMapSize = value },
    getSsaoEnabled: realtimeController.getSsaoEnabled,
    setSsaoEnabled: realtimeController.setSsaoEnabled,
    getSsaoStrength: realtimeController.getSsaoStrength,
    setSsaoStrength: realtimeController.setSsaoStrength,
    getSsaoRadius: realtimeController.getSsaoRadius,
    setSsaoRadius: realtimeController.setSsaoRadius,
    getSsaoSamples: realtimeController.getSsaoSamples,
    setSsaoSamples: realtimeController.setSsaoSamples,
    getSsrEnabled: realtimeController.getSsrEnabled,
    setSsrEnabled: realtimeController.setSsrEnabled,
    getSsaoPipeline: realtimeController.getSsaoPipeline,
    getSsrPipeline: realtimeController.getSsrPipeline,
    ensureSsaoPipeline: realtimeController.ensureSsaoPipeline,
    ensureSsrPipeline: realtimeController.ensureSsrPipeline,
    applyRealtimeShadowState,
    applySsaoSettings: realtimeController.applySsaoSettings,
    flushSceneRenderCaches,
    refreshImportedRenderingState,
    initShadowGenerator,
    resetSunLightHelper: () => {
      lightHelperTouched.sun = false
      lightHelperVisible.sun = false
    },
    setSunLightHelperVisible: (value) => {
      lightHelperTouched.sun = true
      lightHelperVisible.sun = value
    },
    getSunLightHelperVisible: () => lightHelperTouched.sun && lightHelperVisible.sun,
    updateLightDirectionHelpers: () => updateLightDirectionHelpers(),
  })
}
const renderBakePanel = (panel: HTMLElement) => {
  lightmapController.renderPanel(panel)
}

let techPanelCache: {
  panel: HTMLElement
  subTabs: HTMLElement
  realtimePanel: HTMLElement
  bakePanel: HTMLElement
  shadowToggle: HTMLInputElement | null
} | null = null

const renderTechPanel = () => {
  hideDetailPanel()
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
      techPanelCache.shadowToggle.checked = realtimeController.getShadowEnabled()
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
  sceneOutline.classList.toggle('outliner-tree-outline', activeTab.id === 'outline')

  const showSelectionPanel = activeTab.id === 'outline' && currentModelRoots.length > 0
  selectionModePanel.style.display = showSelectionPanel ? 'grid' : 'none'

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

  if (!selectedDetailId || !detailRegistry.has(selectedDetailId)) {
    renderDetailPlaceholder(detailPanel)
  }

  activeTab.nodes.forEach((node) =>
    sceneOutline.append(
      makeOutlineBranch(node, {
        getActiveDetailId: () => selectedDetailId,
        getMeshFromDetailId,
        onDetailSelect: selectDetail,
        onFocusTarget: startFocusAnimationForTarget,
        onMeshSelect: selectMesh,
        onVisibilityToggle: (node) => {
          setOutline(currentMeshNodes)
          if (node.detailId === selectedDetailId) {
            selectDetail(node.detailId)
          }
        },
      }),
    ),
  )
}

const renderDetail = (descriptor: DetailDescriptor) => {
  renderDetailDescriptor(detailPanel, descriptor)
}

const selectDetail = (detailId: string | undefined) => {
  if (!detailId) {
    return
  }

  if (detailId.startsWith('model:')) {
    clearMeshSelection()
  }

  const getDetail = detailRegistry.get(detailId)

  if (!getDetail) {
    if (activeTabId === 'outline') {
      renderOutlineDetailPlaceholder()
      setOutline(currentMeshNodes)
    }
    return
  }

  selectedDetailId = detailId
  renderDetail(getDetail())
  setOutline(currentMeshNodes)
}

const getMeshFromDetailId = (detailId: string | undefined) => selectionController.getMeshFromDetailId(detailId)

const getMeshesForRoot = (root: TransformNode) => selectionController.getMeshesForRoot(root)

const clearMeshSelection = () => selectionController.clearSelection()

const selectMesh = (mesh: AbstractMesh) => selectionController.selectMesh(mesh)

const startFocusAnimationForTarget = (target: AbstractMesh | TransformNode) =>
  selectionController.startFocusAnimationForTarget(target)

const updateFocusAnimation = () => selectionController.updateFocusAnimation()

const updateSelectionBox = () => selectionController.updateSelectionBox()

const {
  engine,
  scene,
  imageProcessing,
  engineMode,
  enginePreference,
  webgpuSupported,
  fallbackReason: engineFallbackReason,
} = await createViewerEngineScene({
  canvas,
  hasHdrEnvironments: hdrEnvironmentOptions.length > 0 && !isConstrainedMobileRuntime,
  legacyEnvironmentUrl,
  isConstrainedMobileRuntime,
})

environmentController = createEnvironmentController({
  scene,
  environmentOptions: hdrEnvironmentOptions,
  defaultEnvironmentKey,
  initialIntensity: scene.environmentIntensity,
  setStatus,
  refreshOutline: () => setOutline(currentMeshNodes),
  onEnvironmentTextureChanged: () => realtimeController.syncImportedEnvironmentTextures(),
})

const camera = createViewerCamera({
  canvas,
  scene,
})

tuneTouchCameraControls({
  camera,
  sceneCenter,
  sceneRadius,
})

const tuneCameraControlsForCurrentScene = () => {
  tuneTouchCameraControls({
    camera,
    sceneCenter,
    sceneRadius,
  })
}

let singleTouchPanMode = false
const touchModeHint = document.querySelector<HTMLElement>('.mobile-gesture-hint')

const applyTouchMode = () => {
  setSinglePointerPanMode(camera, singleTouchPanMode)
  touchModeToggle.setAttribute('aria-pressed', String(singleTouchPanMode))
  touchModeToggle.ariaLabel = singleTouchPanMode ? '切换为旋转模式' : '切换为平移模式'
  touchModeToggle.title = singleTouchPanMode ? '切换为旋转模式' : '切换为平移模式'
  const modeText = touchModeToggle.querySelector<HTMLElement>('.touch-mode-text')
  if (modeText) {
    modeText.textContent = singleTouchPanMode ? '平移' : '旋转'
  }
  if (touchModeHint) {
    const dragHint = document.createElement('span')
    const pinchHint = document.createElement('span')
    dragHint.textContent = singleTouchPanMode ? '单指拖动：平移' : '单指拖动：旋转'
    pinchHint.textContent = '双指捏合：拉近 / 拉远'
    touchModeHint.replaceChildren(dragHint, pinchHint)
  }
}

touchModeToggle.addEventListener('click', () => {
  singleTouchPanMode = !singleTouchPanMode
  applyTouchMode()
})

applyTouchMode()

selectionController = createSelectionController({
  canvas,
  scene,
  camera,
  getImportedMeshes: () => importedMeshes,
  getDeltaTime: () => engine.getDeltaTime(),
  getSingleTouchPanMode: () => singleTouchPanMode,
  onSelectDetail: selectDetail,
  onClearDetail: () => {
    if (activeTabId === 'outline') {
      renderOutlineDetailPlaceholder()
      setOutline(currentMeshNodes)
    } else {
      selectedDetailId = null
      hideDetailPanel()
    }
  },
  onOutlineChanged: () => setOutline(currentMeshNodes),
  getSelectionMode: () => selectionMode,
  getModelRootForMesh,
})

billboardController = createBillboardController({
  camera,
  scene,
  getModelIndexForMesh: (mesh) => {
    const root = getModelRootForMesh(mesh)
    return root ? currentModelRoots.indexOf(root) : -1
  },
  getModelNameForMesh,
  getModelNames: () => importedFileNames,
  getSelectableMeshes,
  onRenderStateChanged: () => {
    applyRealtimeShadowState()
    updateGBufferRenderList()
  },
  onSceneCacheInvalidated: flushSceneRenderCaches,
})

lightmapController = createLightmapController({
  scene,
  getImportedMeshes: () => importedMeshes,
  getGroupParentKeyForMesh: (mesh, baseName) => {
    const root = getModelRootForMesh(mesh)
    return mesh.parent && mesh.parent !== root ? `node:${mesh.parent.uniqueId}` : `base:${baseName}`
  },
  getModelKeyForMesh: (mesh) => {
    const root = getModelRootForMesh(mesh)
    const rootIndex = root ? currentModelRoots.indexOf(root) : -1
    return rootIndex >= 0 ? String(rootIndex) : 'ungrouped'
  },
  getModelNameForMesh,
  getSelectableMeshes,
})

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault()
})

const { hemiLight, sunLight } = createSceneLights(scene)
lightDirectionHelpers = createLightDirectionHelperController({
  scene,
  getSceneCenter: () => sceneCenter,
  getSceneRadius: () => sceneRadius,
})

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
  realtimeController.getRealtimeShadowMeshes().forEach((mesh) => shadowGenerator.addShadowCaster(mesh))
  applyRealtimeShadowState()
}

const pipeline = createClassicPipeline(scene, camera)

const setSceneEnvironmentTexture = environmentController.setSceneEnvironmentTexture

realtimeController = createRealtimeRenderingController({
  scene,
  camera,
  sunLight,
  getShadowGenerator: () => shadowGenerator,
  getImportedMeshes: () => importedMeshes,
  isBillboardMesh,
  getRealtimeEnabled: () => techActiveSubTab === '\u5b9e\u65f6\u6e32\u67d3',
  initShadowGenerator,
  flushSceneRenderCaches,
})

initShadowGenerator()
setOutline()
const initialEnvironmentKey = getEnvironmentState().selectedEnvironmentKey
if (!isConstrainedMobileRuntime && hdrEnvironmentOptions.length > 0 && initialEnvironmentKey) {
  void setSceneEnvironmentTexture(initialEnvironmentKey, {
    force: true,
    showLoadingStatus: false,
    refreshOutline: false,
  })
}

const updateCameraDepthRange = () => {
  const effectiveRadius = Math.max(camera.radius, camera.lowerRadiusLimit ?? 0.35, 0.35)
  const effectiveSceneRadius = Math.max(sceneRadius, effectiveRadius, 1)

  camera.minZ = clamp(effectiveRadius * 0.005, 0.05, 2.5)
  camera.maxZ = Math.max(effectiveSceneRadius * 20, effectiveRadius * 12, 120)
  realtimeController?.updateSsaoMaxZ(camera.maxZ)
}

const getCurrentModelSignature = () => {
  return getModelSignature(currentModelRoots, importedMeshes)
}

const updateSceneBoundsFromCurrentModels = () => {
  if (currentModelRoots.length === 0) {
    sceneCenter = Vector3.Zero()
    sceneRadius = 8
    tuneCameraControlsForCurrentScene()
    clearCameraInertia(camera)
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
  sceneRadius = getSceneFrameRadius(size)
  tuneCameraControlsForCurrentScene()
  clearCameraInertia(camera)
  updateCameraDepthRange()
  updateLightDirectionHelpers()
}

const updateLightDirectionHelpers = () => {
  lightDirectionHelpers.setHelper('hemi', hemiLight.direction, new Color3(0.45, 0.68, 1), lightHelperVisible.hemi)
  lightDirectionHelpers.setHelper('sun', sunLight.direction, new Color3(1, 0.82, 0.22), lightHelperVisible.sun)
}

window.setTimeout(() => {
  lightHelperVisible.hemi = false
  lightHelperVisible.sun = false
  lightHelperTouched.hemi = false
  lightHelperTouched.sun = false
  updateLightDirectionHelpers()
  setOutline(currentMeshNodes)
}, 0)

const getViewerConfigRuntime = () => ({
  scene,
  camera,
  imageProcessing,
  pipeline,
  hemiLight,
  sunLight,
  environmentController,
  getImportedMeshes: () => importedMeshes,
  getCurrentModelSignature,
  getSceneCenter: () => sceneCenter,
  getSceneRadius: () => sceneRadius,
  getShadowMapSize: () => shadowMapSize,
  getShadowBias: () => shadowBias,
  applyShadowConfig: (nextShadowMapSize: number, nextShadowBias: number) => {
    shadowMapSize = nextShadowMapSize
    shadowBias = nextShadowBias
    initShadowGenerator()
  },
  resetLightHelpers: () => {
    lightHelperVisible.hemi = false
    lightHelperTouched.hemi = false
    lightHelperVisible.sun = false
    lightHelperTouched.sun = false
  },
  updateSceneBoundsFromCurrentModels,
  updateGBufferRenderList,
  updateLightDirectionHelpers,
  refreshSelectedDetail: () => {
    if (!selectedDetailId) {
      return
    }

    const getDetail = detailRegistry.get(selectedDetailId)
    if (getDetail) {
      renderDetail(getDetail())
    }
  },
})

const applyViewerConfig = (config: ViewerConfig, options: ApplyViewerConfigOptions = {}) => {
  applyViewerConfigSnapshot(getViewerConfigRuntime(), config, options)
}

const showTemporaryStatus = (message: string) => {
  setStatus(message)
  window.setTimeout(() => {
    setStatus(null)
  }, 1600)
}

setupWechatShare({
  dom: {
    shareActions,
    shareWechatButton,
    shareOverlay,
    shareWechatGuide,
    shareQrPopup,
    shareQrCanvas,
    shareQrClose,
  },
  showTemporaryStatus,
})

setupContentBrowser({
  button: contentBrowserButton,
  panel: contentBrowserPanel,
  onAssetActivate: (kind) => {
    if (kind !== 'material.riverWater') {
      return
    }

    const selectedMesh = selectionController.getSelectedMesh() ?? getMeshFromDetailId(selectedDetailId ?? undefined)
    if (!selectedMesh || selectedMesh.isDisposed()) {
      showTemporaryStatus('请先在场景里选中一个网格')
      return
    }

    applyRiverWaterMaterial({
      scene,
      camera,
      sunLight,
      mesh: selectedMesh,
    })
    refreshImportedDetails()
    rebuildImportedOutline()
    selectMesh(selectedMesh)
    refreshImportedRenderingState()
    flushSceneRenderCaches()
    showTemporaryStatus(`已应用河流水材质：${selectedMesh.name || `Mesh ${selectedMesh.uniqueId}`}`)
  },
})

saveConfigButton.hidden = true
resetConfigButton.hidden = true

const createMeshDetail = (mesh: AbstractMesh): DetailDescriptor => createMeshDetailDescriptor({
  mesh,
  getReceiveSsao: realtimeController.getReceiveSsao,
  setReceiveSsao: realtimeController.setReceiveSsao,
})

const createMaterialDetail = (material: Material): DetailDescriptor => {
  if (isRiverWaterMaterial(material)) {
    return createRiverWaterMaterialDetail(material)
  }

  if (material instanceof PBRMaterial) {
    return createMaterialDetailDescriptor({
      material,
      refreshImportedRenderingState,
    })
  }

  return {
    title: material.name || `Material ${material.uniqueId}`,
    kind: '材质',
    sections: [
      {
        title: '基础',
        items: [
          textItem('类型', material.getClassName()),
        ],
      },
    ],
  }
}

const applyExplosion = (root: TransformNode, meshes: AbstractMesh[], intensity: number) => {
  root.metadata = root.metadata || {}
  root.metadata.explosionIntensity = intensity

  const scaleFactor = root.metadata.modelRadius * 1.5

  const sortedMeshes = [...meshes].sort((a, b) => {
    let depthA = 0
    let depthB = 0
    let currA = a.parent
    let currB = b.parent
    while (currA && currA !== root) { depthA++; currA = currA.parent; }
    while (currB && currB !== root) { depthB++; currB = currB.parent; }
    return depthA - depthB
  })

  sortedMeshes.forEach((mesh) => {
    const originalPosLocal = mesh.metadata.originalPositionRootLocal
    if (!originalPosLocal) return

    const dir = mesh.metadata.explosionDirRootLocal
    const dist = mesh.metadata.originalDistance || 0

    const targetPosRootLocal = originalPosLocal.add(dir.scale(intensity * scaleFactor * (0.5 + 0.5 * dist)))
    const targetWorldPos = Vector3.TransformCoordinates(targetPosRootLocal, root.getWorldMatrix())

    mesh.setAbsolutePosition(targetWorldPos)
    mesh.computeWorldMatrix(true)
  })

  updateSelectionBox()
}

const createModelDetail = (root: TransformNode, meshes: AbstractMesh[]) => createModelDetailDescriptor({
  root,
  meshes,
  onExplosionChange: (value) => {
    applyExplosion(root, meshes, value)
  }
})

const dynamicDetailsRegistry = createDynamicDetailsRegistry({
  detailRegistry,
  createMeshDetail,
  createMaterialDetail,
  createModelDetail,
  getModelRoots: () => currentModelRoots,
  getMeshesForRoot,
})

registerStaticDetails({
  detailRegistry,
  getImportedFileName: () => importedFileName,
  getImportedMeshCount: () => importedMeshes.length,
  getImportedMaterialTotal: () => importedMaterialTotal,
  camera,
  hemiLight,
  sunLight,
  hemiLightHelper: {
    isVisible: () => lightHelperTouched.hemi && lightHelperVisible.hemi,
    setVisible: (value) => {
      lightHelperTouched.hemi = true
      lightHelperVisible.hemi = value
    },
    update: updateLightDirectionHelpers,
  },
  sunLightHelper: {
    isVisible: () => lightHelperTouched.sun && lightHelperVisible.sun,
    setVisible: (value) => {
      lightHelperTouched.sun = true
      lightHelperVisible.sun = value
    },
    update: updateLightDirectionHelpers,
  },
  getShadowMapSize: () => shadowMapSize,
  setShadowMapSize: (value) => {
    shadowMapSize = value
    initShadowGenerator()
  },
  getShadowBias: () => shadowBias,
  setShadowBias: (value) => {
    shadowBias = value
    shadowGenerator.bias = value
  },
  scene,
  imageProcessing,
  pipeline,
  hdrEnvironmentOptions,
  getEnvironmentState,
  setSceneEnvironmentTexture: (value) => {
    void setSceneEnvironmentTexture(value)
  },
  setGlobalEnvironmentIntensity: environmentController.setGlobalEnvironmentIntensity,
  getCurrentEnvironmentLabel,
  getCurrentEnvironmentUrl,
})

setOutline(currentMeshNodes)

const frameHierarchy = (root: TransformNode, meshes: AbstractMesh[]) => {
  const frame = getModelFrame(root, meshes)

  sceneCenter = frame.center
  sceneRadius = frame.radius
  tuneCameraControlsForCurrentScene()
  clearCameraInertia(camera)
  camera.setTarget(frame.target)
  camera.radius = frame.radius
  camera.alpha = -Math.PI / 2.15
  camera.beta = Math.PI / 2.62

  sunLight.position = frame.center.add(new Vector3(8, 10, 6))

  updateCameraDepthRange()
  updateLightDirectionHelpers()
}

const frameCurrentModels = () => {
  if (currentModelRoots.length === 0 || importedMeshes.length === 0) {
    return
  }

  importedMeshes.forEach((mesh) => {
    if (mesh.isDisposed()) {
      return
    }

    mesh.computeWorldMatrix(true)
    mesh.refreshBoundingInfo(true, false)
  })

  const frameMeshes = importedMeshes.filter((mesh) => !mesh.isDisposed() && !isBakedFloor(mesh))
  const boundsMeshes = frameMeshes.length > 0 ? frameMeshes : importedMeshes.filter((mesh) => !mesh.isDisposed())
  let aggregateMin = Vector3.Zero()
  let aggregateMax = Vector3.Zero()
  let hasBounds = false

  currentModelRoots.forEach((root) => {
    if (root.isDisposed()) {
      return
    }

    root.computeWorldMatrix(true)
    const bounds = root.getHierarchyBoundingVectors(true, (mesh) => boundsMeshes.includes(mesh))

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
  const center = aggregateMin.add(aggregateMax).scale(0.5)
  const radius = getSceneFrameRadius(size)

  sceneCenter = center
  sceneRadius = radius
  tuneCameraControlsForCurrentScene()
  clearCameraInertia(camera)
  camera.setTarget(center.add(new Vector3(0, size.y * 0.02, 0)))
  camera.radius = radius
  camera.alpha = -Math.PI / 2.15
  camera.beta = Math.PI / 2.62
  sunLight.position = center.add(new Vector3(8, 10, 6))

  updateCameraDepthRange()
  updateLightDirectionHelpers()
}

const ensureCurrentModelsRenderable = () => {
  const renderableMeshes = importedMeshes.filter((mesh) => !mesh.isDisposed())

  currentModelRoots.forEach((root) => {
    if (!root.isDisposed()) {
      root.setEnabled(true)
    }
  })

  renderableMeshes.forEach((mesh) => {
    mesh.setEnabled(true)
    mesh.isVisible = true
    mesh.visibility = 1
    mesh.alwaysSelectAsActiveMesh = true
    mesh.computeWorldMatrix(true)
    mesh.refreshBoundingInfo(true, false)
  })

  let framesRemaining = 4
  const restoreAutomaticCulling = () => {
    framesRemaining -= 1
    if (framesRemaining > 0) {
      requestAnimationFrame(restoreAutomaticCulling)
      return
    }

    renderableMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.alwaysSelectAsActiveMesh = false
      }
    })
  }

  requestAnimationFrame(restoreAutomaticCulling)
}

const disposeCurrentModels = () => {
  clearMeshSelection()
  billboardController.clearAll()
  dynamicDetailsRegistry.unregisterImportedDetails()
  currentModelRoots.forEach((root) => root.dispose(false, false))
  currentModelRoots = []
  importedMeshes = []
  importedMaterialTotal = 0
  importedFileNames = []
  importedFileName = '\u672a\u5bfc\u5165'
  savedLightmaps = new WeakMap<PBRMaterial, BaseTexture>()
  const shadowMap = shadowGenerator.getShadowMap()
  if (shadowMap) {
    shadowMap.renderList = []
  }
  updateGBufferRenderList()
  setOutline([])
}

function flushSceneRenderCaches() {
  scene.resetCachedMaterial()
  scene.cleanCachedTextureBuffer()
  engine.wipeCaches(true)
}

const rebuildImportedOutline = () => {
  importedFileName = getImportedDisplayName(importedFileName, importedFileNames)
  setOutline(
    currentModelRoots.map((modelRoot, index) =>
      makeModelOutlineNode(importedFileNames[index] ?? modelRoot.name, modelRoot, getMeshesForRoot(modelRoot)),
    ),
  )
}

const refreshImportedDetails = () => {
  importedMaterialTotal = dynamicDetailsRegistry.refreshImportedDetails(importedMeshes)
}

const pruneEmptyModelRoots = () => {
  const nextRoots: TransformNode[] = []
  const nextNames: string[] = []

  currentModelRoots.forEach((root, index) => {
    if (getMeshesForRoot(root).length > 0) {
      nextRoots.push(root)
      nextNames.push(importedFileNames[index] ?? root.name)
      return
    }

    root.dispose(false, false)
  })

  currentModelRoots = nextRoots
  importedFileNames = nextNames
}

const deleteSelectedMesh = () => {
  const selectedMesh = selectionController.getSelectedMesh()

  if (!selectedMesh || selectedMesh.isDisposed()) {
    return false
  }

  const mesh = selectedMesh
  const deletedName = mesh.name || `Mesh ${mesh.uniqueId}`
  const shadowMap = shadowGenerator.getShadowMap()

  billboardController.pruneMesh(mesh)
  lightmapController.pruneMesh(mesh)
  if (shadowMap?.renderList) {
    shadowMap.renderList = shadowMap.renderList.filter((item) => item !== mesh)
  }

  clearMeshSelection()
  mesh.dispose(false, true)
  importedMeshes = importedMeshes.filter((item) => item !== mesh && !item.isDisposed())

  pruneEmptyModelRoots()
  refreshImportedDetails()
  rebuildImportedOutline()
  flushSceneRenderCaches()
  setStatus(`闂備浇顕уù鐑藉箠閹捐绠熼梽鍥Φ閹版澘绀冩い鏃傚帶閻庮參鎮峰鍛暭閻㈩垱顨婇崺?${deletedName}`)

  return true
}

type LoadModelOptions = {
  shouldContinue?: () => boolean
}

const loadModel = async (
  source: string | File,
  fileName: string,
  replaceExisting = false,
  options: LoadModelOptions = {},
) => {
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
      if (options.shouldContinue && !options.shouldContinue()) {
        return
      }

      setStatus(getImportProgressMessage(fileName, event))
    },
  })

  if (options.shouldContinue && !options.shouldContinue()) {
    result.meshes.forEach((mesh) => mesh.dispose(false, false))
    result.transformNodes.forEach((node) => node.dispose(false, false))
    result.animationGroups.forEach((group) => group.dispose())
    result.skeletons.forEach((skeleton) => skeleton.dispose())
    flushSceneRenderCaches()
    return
  }

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

  // Initialize explosion metadata and cached positions relative to model root
  const bounds = root.getHierarchyBoundingVectors(true, (m) => result.meshes.includes(m))
  const modelCenter = bounds.min.add(bounds.max).scale(0.5)
  const modelRadius = Math.max(bounds.max.subtract(bounds.min).length() * 0.5, 0.5)

  root.metadata = root.metadata || {}
  root.metadata.modelCenter = modelCenter
  root.metadata.modelRadius = modelRadius
  root.metadata.explosionIntensity = 0

  root.computeWorldMatrix(true)
  const invRootMatrix = root.getWorldMatrix().clone().invert()

  result.meshes.forEach((mesh) => {
    mesh.metadata = mesh.metadata || {}
    mesh.metadata.originalPosition = mesh.position.clone()

    mesh.computeWorldMatrix(true)
    const originalWorldPos = mesh.getAbsolutePosition().clone()
    const originalPosRootLocal = Vector3.TransformCoordinates(originalWorldPos, invRootMatrix)
    mesh.metadata.originalWorldPosition = originalWorldPos
    mesh.metadata.originalPositionRootLocal = originalPosRootLocal

    const meshCenterWorld = mesh.getBoundingInfo().boundingBox.centerWorld.clone()
    const meshCenterRootLocal = Vector3.TransformCoordinates(meshCenterWorld, invRootMatrix)
    const modelCenterRootLocal = Vector3.TransformCoordinates(modelCenter, invRootMatrix)

    let dirRootLocal = meshCenterRootLocal.subtract(modelCenterRootLocal)
    if (dirRootLocal.length() < 0.001) {
      dirRootLocal = originalPosRootLocal.clone()
      if (dirRootLocal.length() < 0.001) {
        dirRootLocal = new Vector3(0, 1, 0)
      }
    }
    const originalDistance = dirRootLocal.length()
    mesh.metadata.explosionDirRootLocal = dirRootLocal.normalize()
    mesh.metadata.originalDistance = originalDistance
  })

  dynamicDetailsRegistry.registerImportedDetails(result.meshes, new Set<Material>(materials))
  rebuildImportedOutline()
  frameHierarchy(root, result.meshes)

  if (replaceExisting && techActiveSubTab === '\u5b9e\u65f6\u6e32\u67d3') {
    enableRealtimeEffects()
  }

  flushSceneRenderCaches()
  setStatus(null)
}

setupModelImportControls({
  glbImportInput,
  importButton,
  importModePopup,
  loadModel: (file, fileName, replaceExisting) => loadModel(file, fileName, replaceExisting),
  showTemporaryStatus,
  setStatus,
})

const updateSelectionModeUI = () => {
  selectModePartButton.classList.toggle('active', selectionMode === 'part')
  selectModeModelButton.classList.toggle('active', selectionMode === 'model')
}

selectModePartButton.addEventListener('click', () => {
  if (selectionMode === 'part') return
  selectionMode = 'part'
  updateSelectionModeUI()
  clearMeshSelection()
})

selectModeModelButton.addEventListener('click', () => {
  if (selectionMode === 'model') return
  selectionMode = 'model'
  updateSelectionModeUI()
  clearMeshSelection()
})

resetCameraButton.addEventListener('click', () => {
  if (currentModelRoots.length > 0 && importedMeshes.length > 0) {
    frameCurrentModels()
  } else {
    sceneCenter = Vector3.Zero()
    sceneRadius = 8
    tuneCameraControlsForCurrentScene()
    clearCameraInertia(camera)
    camera.setTarget(new Vector3(0, 1.5, 0))
    camera.radius = 8
    camera.alpha = -Math.PI / 2.15
    camera.beta = Math.PI / 2.62
    updateCameraDepthRange()
    updateLightDirectionHelpers()
  }
})

const keyboardNavigationController = createKeyboardNavigationController({
  camera,
  getDeltaTime: () => engine.getDeltaTime(),
  onEscape: clearMeshSelection,
  onDelete: deleteSelectedMesh,
})

const projects = getProjectEntries()
let projectLoadSerial = 0

const showProjectManager = () => {
  projectLoadSerial += 1
  disposeCurrentModels()
  techActiveSubTab = '\u5b9e\u65f6\u6e32\u67d3'
  restoreRealtimeLightState()
  flushSceneRenderCaches()
  projectManager.hidden = false
  projectBackButton.hidden = true
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.delete('project')
  window.history.replaceState(null, '', nextUrl)
  setStatus(null)
}

const loadProject = async (project: ProjectEntry) => {
  const loadSerial = projectLoadSerial + 1
  projectLoadSerial = loadSerial
  projectManager.hidden = true
  projectBackButton.hidden = false
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('project', project.routeId)
  window.history.replaceState(null, '', nextUrl)
  setStatus(`正在加载项目 ${project.title}...`)

  if (project.models.length === 0) {
    setStatus(`项目 ${project.title} 没有可加载的 GLB`)
    projectManager.hidden = false
    projectBackButton.hidden = true
    return
  }

  try {
    for (const [index, model] of project.models.entries()) {
      await loadModel(model.url, model.fileName, index === 0, {
        shouldContinue: () => loadSerial === projectLoadSerial,
      })
      if (loadSerial !== projectLoadSerial) {
        return
      }
    }

    if (project.config.config) {
      applyViewerConfig(project.config.config)
    }

    if (project.lightmaps.length > 0) {
      const result = await lightmapController.applyProjectLightmaps(project.lightmaps)
      if (loadSerial !== projectLoadSerial) {
        return
      }
      if (result.missing.length > 0) {
        console.warn('Project lightmaps had no matching mesh/material:', result.missing)
      }
    }

    if (project.config.customMaterials) {
      for (const [meshName, materialKind] of Object.entries(project.config.customMaterials)) {
        const targetMesh = importedMeshes.find((m) => m.name === meshName)
        if (!targetMesh || targetMesh.isDisposed()) {
          console.warn(`Custom material target mesh not found: ${meshName}`)
          continue
        }
        if (materialKind === 'material.riverWater') {
          applyRiverWaterMaterial({ scene, camera, sunLight, mesh: targetMesh })
        }
      }
    }

    ensureCurrentModelsRenderable()

    if (project.config.mode === 'baked') {
      techActiveSubTab = '\u6a21\u578b\u70d8\u70e4'
      disableRealtimeEffects()
      enableLightmaps()
    } else {
      techActiveSubTab = '\u5b9e\u65f6\u6e32\u67d3'
      enableRealtimeEffects()
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    if (loadSerial !== projectLoadSerial) {
      return
    }

    frameCurrentModels()

    if (project.config.camera) {
      const cc = project.config.camera
      if (cc.target) {
        camera.target.x = cc.target[0]
        camera.target.y = cc.target[1]
        camera.target.z = cc.target[2]
      }
      if (cc.position) {
        const dx = cc.position[0] - camera.target.x
        const dy = cc.position[1] - camera.target.y
        const dz = cc.position[2] - camera.target.z
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (r > 0) {
          camera.radius = r
          camera.alpha = Math.atan2(dx, dz)
          camera.beta = Math.acos(Math.max(-1, Math.min(1, dy / r)))
        }
      } else {
        if (cc.alpha !== undefined) camera.alpha = cc.alpha
        if (cc.beta !== undefined) camera.beta = cc.beta
        if (cc.radius !== undefined) camera.radius = cc.radius
      }
    }

    flushSceneRenderCaches()

    setOutline(currentMeshNodes)
    setStatus(null)
  } catch (error) {
    console.error(error)
    const msg = `项目 ${project.title} 加载失败: ${error instanceof Error ? error.message : '未知错误'}`
    setStatus(msg)
    projectManager.hidden = false
    projectBackButton.hidden = true
  }
}

projectBackButton.addEventListener('click', showProjectManager)

renderProjectManager({
  root: projectManager,
  projects,
  onProjectSelect: (project) => {
    void loadProject(project)
  },
})

const initialProjectParam = new URLSearchParams(window.location.search).get('project')
const initialProjectId = initialProjectParam ? decodeURIComponent(initialProjectParam) : null
if (initialProjectId) {
  const initialProject = getProjectById(initialProjectParam ?? initialProjectId) ?? getProjectById(initialProjectId)
  if (initialProject) {
    void loadProject(initialProject)
  } else {
    setStatus(`未找到项目 ${initialProjectId}`)
  }
} else {
  setStatus(null)
}

const frameMetricsController = createFrameMetricsController({
  engine,
  scene,
  frameGrid,
  frameOverlay,
  frameOverlayClose,
  frameToggle,
  getImportedMeshes: () => importedMeshes,
})

engine.runRenderLoop(() => {
  try {
    keyboardNavigationController.update()
    billboardController.update()
    updateFocusAnimation()
    updateSelectionBox()
    updateCameraDepthRange()
    frameMetricsController.update(engine.getDeltaTime())
  } catch (error) {
    console.error(error)
    keyboardNavigationController.clearPressedKeys()
  }

  scene.render()
})

window.addEventListener('resize', () => {
  engine.resize()
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.6))
  applyPanelCollapsedState()
  tuneTouchCameraControls({
    camera,
    sceneCenter,
    sceneRadius,
  })
})
