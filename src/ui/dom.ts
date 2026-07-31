import {
  ArrowLeft,
  BarChart3,
  Box,
  Camera,
  FolderOpen,
  FolderTree,
  Focus,
  Grid2x2Plus,
  Maximize,
  Menu,
  Move3d,
  Palette,
  Plus,
  Rotate3d,
  Share2,
  SlidersHorizontal,
  X,
  createIcons,
} from 'lucide'
import { shareDescription, shareTitle, shareUrl } from '../shared/constants'

export type AppDom = {
  canvas: HTMLCanvasElement
  projectManager: HTMLDivElement
  projectBackButton: HTMLButtonElement
  loadingScreen: HTMLDivElement
  loadingPercent: HTMLDivElement
  loadingBarFill: HTMLDivElement
  loadingLabel: HTMLDivElement
  status: HTMLDivElement
  shareActions: HTMLElement
  contentBrowserButton: HTMLButtonElement
  contentBrowserPanel: HTMLDivElement
  shareWechatButton: HTMLButtonElement
  shareOverlay: HTMLDivElement
  shareWechatGuide: HTMLDivElement
  shareQrPopup: HTMLDivElement
  shareQrCanvas: HTMLCanvasElement
  shareQrClose: HTMLButtonElement
  sceneTabs: HTMLElement
  viewportPropertiesButton: HTMLButtonElement
  outlinerPanel: HTMLElement
  panelCollapseToggle: HTMLButtonElement
  touchModeToggle: HTMLButtonElement
  saveConfigButton: HTMLButtonElement
  resetConfigButton: HTMLButtonElement
  sceneOutline: HTMLElement
  detailPanel: HTMLElement
  glbImportInput: HTMLInputElement
  importButton: HTMLButtonElement
  importModePopup: HTMLDivElement
  frameToggle: HTMLButtonElement
  frameOverlay: HTMLDivElement
  frameOverlayClose: HTMLButtonElement
  frameGrid: HTMLDivElement
  selectionModePanel: HTMLDivElement
  resetCameraButton: HTMLButtonElement
  dockResetCameraButton: HTMLButtonElement
}

export const renderAppShell = (app: HTMLDivElement) => {
  app.innerHTML = `
  <canvas id="renderCanvas" aria-label="三维场景视口"></canvas>
  <div id="loadingScreen" class="loading-screen" hidden>
    <div class="loading-box">
      <div id="loadingPercent" class="loading-percent">0%</div>
      <div class="loading-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div id="loadingBarFill" class="loading-bar-fill"></div>
      </div>
      <div id="loadingLabel" class="loading-label">正在加载模型...</div>
    </div>
  </div>
  <div id="projectManager" class="project-manager" aria-label="项目管理器"></div>

  <header class="viewer-topbar" aria-label="视口主工具栏">
    <div class="viewer-topbar-start">
      <button id="projectBackButton" class="project-back-button" type="button" aria-label="返回我的项目" title="返回我的项目" hidden>
        <i data-lucide="arrow-left" aria-hidden="true"></i>
        <span>我的项目</span>
      </button>
      <span class="topbar-divider" aria-hidden="true"></span>
      <div class="scene-title" title="当前场景">
        <strong>场景_001</strong>
        <span>已保存</span>
      </div>
    </div>
    <nav id="sceneTabs" class="viewer-mode-tabs" aria-label="工作模式"></nav>
    <div class="viewer-topbar-actions">
      <button id="viewportPropertiesButton" class="topbar-icon-button viewport-properties-button" type="button" aria-label="视口属性" aria-pressed="false" title="视口属性">
        <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
        <span>视口属性</span>
      </button>
      <button class="topbar-icon-button" type="button" data-panel-tab="general" data-panel-subtab="渲染" aria-label="渲染设置" title="渲染设置">
        <i data-lucide="palette" aria-hidden="true"></i>
      </button>
      <button id="resetCameraButton" class="reset-camera-button topbar-icon-button" type="button" aria-label="重置视角" title="重置视角">
        <i data-lucide="camera" aria-hidden="true"></i>
      </button>
      <button id="fullscreenButton" class="topbar-icon-button" type="button" aria-label="切换全屏" title="切换全屏">
        <i data-lucide="maximize" aria-hidden="true"></i>
      </button>
    </div>
  </header>

  <nav class="workspace-rail" aria-label="工作区导航">
    <button class="workspace-rail-button" type="button" data-workspace-panel="scene" aria-label="场景" aria-pressed="false" title="场景">
      <i data-lucide="folder-tree" aria-hidden="true"></i>
      <span>场景</span>
    </button>
    <button id="contentBrowserButton" class="content-browser-button workspace-rail-button" type="button" data-workspace-panel="content" aria-label="内容" aria-pressed="false" aria-expanded="false" title="内容">
      <i data-lucide="folder-open" aria-hidden="true"></i>
      <span>内容</span>
    </button>
    <button id="panelCollapseToggle" class="panel-collapse-toggle" type="button" aria-label="收起场景面板" title="收起场景面板">
      <i data-lucide="menu" aria-hidden="true"></i>
    </button>
  </nav>

  <aside id="outlinerPanel" class="outliner-panel" aria-label="场景面板">
    <header class="drawer-header">
      <div>
        <span class="drawer-eyebrow">SCENE</span>
        <h2>场景</h2>
      </div>
      <div class="drawer-header-actions">
        <span class="drawer-count" aria-label="已加载场景">01</span>
        <button id="scenePanelClose" class="panel-close-button" type="button" aria-label="关闭场景面板" title="关闭场景面板">
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
      </div>
    </header>
    <label class="scene-search">
      <span class="sr-only">搜索节点</span>
      <input id="sceneSearch" type="search" placeholder="搜索节点" autocomplete="off" />
    </label>
    <div id="selectionModePanel" class="config-actions" aria-label="选择模式" style="display: none;">
      <button id="saveConfig" type="button" style="display: none;">保存</button>
      <button id="resetConfig" type="button" style="display: none;">重置</button>
    </div>
    <section id="sceneOutline" class="outliner-tree"></section>
  </aside>

  <section id="detailPanel" class="detail-panel inspector-panel" aria-label="属性面板" hidden></section>
  <div id="contentBrowserPanel" class="content-browser-panel" aria-label="内容浏览器" aria-hidden="true"></div>

  <div class="share-actions" data-url="${shareUrl}" data-title="${shareTitle}" data-desc="${shareDescription}" aria-label="视口快捷工具">
    <button id="touchModeToggle" class="touch-mode-toggle dock-button" type="button" aria-pressed="false" aria-label="切换为平移模式" title="旋转 / 平移">
      <i data-lucide="rotate-3d" aria-hidden="true"></i>
      <span class="touch-mode-text sr-only">旋转</span>
    </button>
    <button id="frameToggle" class="frame-toggle-button share-button dock-button" type="button" aria-label="性能统计" title="性能统计">
      <i data-lucide="bar-chart-3" aria-hidden="true"></i>
    </button>
    <button id="importButton" class="import-button-icon share-button dock-button dock-button-primary" type="button" aria-label="导入 GLB" title="导入 GLB">
      <i data-lucide="plus" aria-hidden="true"></i>
    </button>
    <div id="importModePopup" class="import-mode-popup" hidden>
      <button type="button" data-mode="replace">替换场景</button>
      <button type="button" data-mode="insert">追加模型</button>
    </div>
    <button id="dockResetCameraButton" class="dock-button" type="button" aria-label="重置视角" title="重置视角">
      <i data-lucide="focus" aria-hidden="true"></i>
    </button>
    <button id="shareWechat" class="share-button dock-button" type="button" aria-label="分享" title="分享">
      <i data-lucide="share-2" aria-hidden="true"></i>
    </button>
  </div>

  <div class="mobile-gesture-hint" aria-label="视口操作提示">
    <span>左键旋转</span>
    <span>中键平移</span>
    <span>滚轮缩放</span>
  </div>
  <input id="glbImportInput" class="import-file-input" type="file" accept=".glb,model/gltf-binary" />
  <div id="status" class="status">正在加载场景...</div>

  <div id="shareOverlay" class="share-overlay" aria-modal="true" role="dialog">
    <div id="shareWechatGuide" class="share-wechat-guide" hidden>
      <div class="guide-text">点击右上角分享，选择转发给朋友</div>
    </div>
    <div id="shareQrPopup" class="share-qr-popup" hidden>
      <canvas id="shareQrCanvas" aria-label="分享二维码"></canvas>
      <p>扫码分享</p>
      <button id="shareQrClose" class="share-qr-close" type="button">关闭</button>
    </div>
  </div>
  <div id="frameOverlay" class="frame-overlay">
    <div class="frame-overlay-content">
      <header class="frame-overlay-header">
        <h2>性能统计</h2>
        <button id="frameOverlayClose" class="frame-overlay-close" type="button" aria-label="关闭">×</button>
      </header>
      <div id="frameGrid" class="frame-grid"></div>
    </div>
  </div>
  `

  createIcons({
    icons: {
      ArrowLeft,
      BarChart3,
      Box,
      Camera,
      FolderOpen,
      FolderTree,
      Focus,
      Grid2x2Plus,
      Maximize,
      Menu,
      Move3d,
      Palette,
      Plus,
      Rotate3d,
      Share2,
      SlidersHorizontal,
      X,
    },
  })

  document.querySelector<HTMLButtonElement>('#fullscreenButton')?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void app.requestFullscreen()
    }
  })
}

const requireElement = <T extends Element>(selector: string, type: string): T => {
  const element = document.querySelector<T>(selector)

  if (!element) {
    throw new Error(`${type} element "${selector}" was not created.`)
  }

  return element
}

export const queryAppDom = (): AppDom => ({
  canvas: requireElement<HTMLCanvasElement>('#renderCanvas', 'Canvas'),
  projectManager: requireElement<HTMLDivElement>('#projectManager', 'Project manager'),
  projectBackButton: requireElement<HTMLButtonElement>('#projectBackButton', 'Project back button'),
  loadingScreen: requireElement<HTMLDivElement>('#loadingScreen', 'Loading screen'),
  loadingPercent: requireElement<HTMLDivElement>('#loadingPercent', 'Loading percent'),
  loadingBarFill: requireElement<HTMLDivElement>('#loadingBarFill', 'Loading bar fill'),
  loadingLabel: requireElement<HTMLDivElement>('#loadingLabel', 'Loading label'),
  status: requireElement<HTMLDivElement>('#status', 'Status'),
  shareActions: requireElement<HTMLElement>('.share-actions', 'Share actions'),
  contentBrowserButton: requireElement<HTMLButtonElement>('#contentBrowserButton', 'Content browser button'),
  contentBrowserPanel: requireElement<HTMLDivElement>('#contentBrowserPanel', 'Content browser panel'),
  shareWechatButton: requireElement<HTMLButtonElement>('#shareWechat', 'Share button'),
  shareOverlay: requireElement<HTMLDivElement>('#shareOverlay', 'Share overlay'),
  shareWechatGuide: requireElement<HTMLDivElement>('#shareWechatGuide', 'Share guide'),
  shareQrPopup: requireElement<HTMLDivElement>('#shareQrPopup', 'Share QR popup'),
  shareQrCanvas: requireElement<HTMLCanvasElement>('#shareQrCanvas', 'Share QR canvas'),
  shareQrClose: requireElement<HTMLButtonElement>('#shareQrClose', 'Share close button'),
  sceneTabs: requireElement<HTMLElement>('#sceneTabs', 'Scene tabs'),
  viewportPropertiesButton: requireElement<HTMLButtonElement>('#viewportPropertiesButton', 'Viewport properties button'),
  outlinerPanel: requireElement<HTMLElement>('#outlinerPanel', 'Outliner panel'),
  panelCollapseToggle: requireElement<HTMLButtonElement>('#panelCollapseToggle', 'Panel collapse toggle'),
  touchModeToggle: requireElement<HTMLButtonElement>('#touchModeToggle', 'Touch mode toggle'),
  saveConfigButton: requireElement<HTMLButtonElement>('#saveConfig', 'Save config button'),
  resetConfigButton: requireElement<HTMLButtonElement>('#resetConfig', 'Reset config button'),
  sceneOutline: requireElement<HTMLElement>('#sceneOutline', 'Scene outline'),
  detailPanel: requireElement<HTMLElement>('#detailPanel', 'Detail panel'),
  glbImportInput: requireElement<HTMLInputElement>('#glbImportInput', 'Import input'),
  importButton: requireElement<HTMLButtonElement>('#importButton', 'Import button'),
  importModePopup: requireElement<HTMLDivElement>('#importModePopup', 'Import mode popup'),
  frameToggle: requireElement<HTMLButtonElement>('#frameToggle', 'Frame toggle'),
  frameOverlay: requireElement<HTMLDivElement>('#frameOverlay', 'Frame overlay'),
  frameOverlayClose: requireElement<HTMLButtonElement>('#frameOverlayClose', 'Frame overlay close'),
  frameGrid: requireElement<HTMLDivElement>('#frameGrid', 'Frame grid'),
  selectionModePanel: requireElement<HTMLDivElement>('#selectionModePanel', 'Selection mode panel'),
  resetCameraButton: requireElement<HTMLButtonElement>('#resetCameraButton', 'Reset camera button'),
  dockResetCameraButton: requireElement<HTMLButtonElement>('#dockResetCameraButton', 'Dock reset camera button'),
})
