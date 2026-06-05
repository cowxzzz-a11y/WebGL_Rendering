import { shareDescription, shareTitle, shareUrl } from '../shared/constants'

export type AppDom = {
  canvas: HTMLCanvasElement
  status: HTMLDivElement
  shareActions: HTMLElement
  shareWechatButton: HTMLButtonElement
  shareOverlay: HTMLDivElement
  shareWechatGuide: HTMLDivElement
  shareQrPopup: HTMLDivElement
  shareQrCanvas: HTMLCanvasElement
  shareQrClose: HTMLButtonElement
  sceneTabs: HTMLElement
  outlinerPanel: HTMLElement
  panelCollapseToggle: HTMLButtonElement
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
}

export const renderAppShell = (app: HTMLDivElement) => {
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
      <button type="button" data-mode="replace">替换</button>
      <button type="button" data-mode="insert">追加</button>
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
      <button id="saveConfig" type="button">保存</button>
      <button id="resetConfig" type="button">重置</button>
    </div>
    <section id="sceneOutline" class="outliner-tree"></section>
    <section id="detailPanel" class="detail-panel" hidden></section>
  </aside>
  <input id="glbImportInput" class="import-file-input" type="file" accept=".glb,model/gltf-binary" />
  <div id="status" class="status">Loading scene...</div>
  <div id="shareOverlay" class="share-overlay" aria-modal="true" role="dialog">
    <div id="shareWechatGuide" class="share-wechat-guide" hidden>
      <div class="guide-arrow">↗</div>
      <div class="guide-text">点击右上角「···」<br />选择「转发给朋友」<br />即可生成微信卡片</div>
    </div>
    <div id="shareQrPopup" class="share-qr-popup" hidden>
      <canvas id="shareQrCanvas" aria-label="QR code"></canvas>
      <p>扫码分享</p>
      <button id="shareQrClose" class="share-qr-close" type="button">关闭</button>
    </div>
  </div>
  <div id="frameOverlay" class="frame-overlay">
    <div class="frame-overlay-content">
      <header class="frame-overlay-header">
        <h2>性能统计</h2>
        <button id="frameOverlayClose" class="frame-overlay-close" type="button">&times;</button>
      </header>
      <div id="frameGrid" class="frame-grid"></div>
    </div>
  </div>
`
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
  status: requireElement<HTMLDivElement>('#status', 'Status'),
  shareActions: requireElement<HTMLElement>('.share-actions', 'Share actions'),
  shareWechatButton: requireElement<HTMLButtonElement>('#shareWechat', 'Share button'),
  shareOverlay: requireElement<HTMLDivElement>('#shareOverlay', 'Share overlay'),
  shareWechatGuide: requireElement<HTMLDivElement>('#shareWechatGuide', 'Share guide'),
  shareQrPopup: requireElement<HTMLDivElement>('#shareQrPopup', 'Share QR popup'),
  shareQrCanvas: requireElement<HTMLCanvasElement>('#shareQrCanvas', 'Share QR canvas'),
  shareQrClose: requireElement<HTMLButtonElement>('#shareQrClose', 'Share close button'),
  sceneTabs: requireElement<HTMLElement>('#sceneTabs', 'Scene tabs'),
  outlinerPanel: requireElement<HTMLElement>('#outlinerPanel', 'Outliner panel'),
  panelCollapseToggle: requireElement<HTMLButtonElement>('#panelCollapseToggle', 'Panel collapse toggle'),
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
})

