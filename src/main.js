import { DEFAULT_HDR_PATH, MATERIAL_PRESET_OPTIONS } from "./config.js";
import { createDOMRefs } from "./dom.js";
import { createAssetsModule } from "./modules/assets.js";
import { createInspectorsModule } from "./modules/inspectors.js";
import { createLightsModule } from "./modules/lights.js";
import { createMaterialsModule } from "./modules/materials.js";
import { createNavigationModule } from "./modules/navigation.js";
import { createObjectManagerModule } from "./modules/objectManager.js";
import { createRenderPipelineModule } from "./modules/renderPipeline.js";
import { createSelectionModule } from "./modules/selection.js";
import { createSceneRuntime } from "./scene/runtime.js";

const dom = createDOMRefs();
const runtime = createSceneRuntime(dom.app);

const app = {
  dom,
  runtime,
  config: {
    DEFAULT_HDR_PATH,
    MATERIAL_PRESET_OPTIONS,
  },
  state: {
    fallbackGroup: null,
    currentRoot: null,
    selectedObject: null,
    moveModeEnabled: true,
    currentModelObjectURL: null,
    currentHDRObjectURL: null,
    currentHDRTexture: null,
    currentEnvironmentTarget: null,
    lightSettings: {
      autoFitShadowToModel: true,
      shadowFitPadding: 1.6,
    },
    renderSettings: {
      accumulationEnabled: true,
      interactiveScale: 0.58,
      staticScale: 1,
      idleDelayMs: 420,
      maxSamples: 48,
    },
    environmentSettings: {
      autoSunFromHDR: true,
      sunBoost: 1,
      sunDistanceFactor: 5.8,
      environmentIntensity: 1.2,
      backgroundIntensity: 0.65,
    },
    viewSettings: {
      moveSpeed: 4.0,
    },
  },
  status: {
    setModel(text) {
      dom.statusModelEl?.replaceChildren(document.createTextNode(`模型: ${text}`));
    },
    setHDR(text) {
      dom.statusHDREl?.replaceChildren(document.createTextNode(`HDR: ${text}`));
    },
    setSelection(text) {
      dom.statusSelectionEl?.replaceChildren(
        document.createTextNode(`当前选中: ${text}`)
      );
    },
    setRender(text) {
      dom.statusRenderEl?.replaceChildren(document.createTextNode(`渲染: ${text}`));
    },
  },
};

app.renderPipeline = createRenderPipelineModule(app);
app.materials = createMaterialsModule(app);
app.objectManager = createObjectManagerModule(app);
app.selection = createSelectionModule(app);
app.lights = createLightsModule(app);
app.inspectors = createInspectorsModule(app);
app.assets = createAssetsModule(app);
app.navigation = createNavigationModule(app);

function syncRenderSettingsUI() {
  const {
    interactiveScale,
    staticScale,
    idleDelayMs,
    maxSamples,
  } = app.state.renderSettings;

  if (dom.interactiveScaleRange) {
    dom.interactiveScaleRange.value = interactiveScale.toFixed(2);
  }
  if (dom.interactiveScaleValueEl) {
    dom.interactiveScaleValueEl.textContent = `${Math.round(interactiveScale * 100)}%`;
  }

  if (dom.staticScaleRange) {
    dom.staticScaleRange.value = staticScale.toFixed(2);
  }
  if (dom.staticScaleValueEl) {
    dom.staticScaleValueEl.textContent = `${Math.round(staticScale * 100)}%`;
  }

  if (dom.idleDelayRange) {
    dom.idleDelayRange.value = String(idleDelayMs);
  }
  if (dom.idleDelayValueEl) {
    dom.idleDelayValueEl.textContent = `${idleDelayMs}ms`;
  }

  if (dom.maxSamplesRange) {
    dom.maxSamplesRange.value = String(maxSamples);
  }
  if (dom.maxSamplesValueEl) {
    dom.maxSamplesValueEl.textContent = String(maxSamples);
  }
}

app.inspectors.bindTabs();
app.selection.syncMoveModeButton();
app.navigation.bind();
syncRenderSettingsUI();

function setPanelCollapsed(side, collapsed) {
  const shell =
    side === "left" ? dom.leftPanelShell : dom.rightPanelShell;
  const button =
    side === "left" ? dom.leftPanelToggleBtn : dom.rightPanelToggleBtn;

  if (!shell || !button) {
    return;
  }

  shell.classList.toggle("is-collapsed", collapsed);

  if (side === "left") {
    button.textContent = collapsed ? ">" : "<";
    button.setAttribute(
      "aria-label",
      collapsed ? "展开左侧面板" : "收起左侧面板"
    );
    return;
  }

  button.textContent = collapsed ? "<" : ">";
  button.setAttribute(
    "aria-label",
    collapsed ? "展开右侧面板" : "收起右侧面板"
  );
}

function bindPanelToggles() {
  dom.leftPanelToggleBtn?.addEventListener("click", () => {
    const nextCollapsed = !dom.leftPanelShell.classList.contains("is-collapsed");
    setPanelCollapsed("left", nextCollapsed);
  });

  dom.rightPanelToggleBtn?.addEventListener("click", () => {
    const nextCollapsed = !dom.rightPanelShell.classList.contains("is-collapsed");
    setPanelCollapsed("right", nextCollapsed);
  });
}

function markInteractiveRenderUpdate() {
  app.renderPipeline.notifyInteraction();
}

function markStaticRenderUpdate() {
  app.renderPipeline.markDirty();
}

function bindRenderControls() {
  dom.interactiveScaleRange?.addEventListener("input", () => {
    app.state.renderSettings.interactiveScale = Number(dom.interactiveScaleRange.value);
    syncRenderSettingsUI();
    markInteractiveRenderUpdate();
  });

  dom.staticScaleRange?.addEventListener("input", () => {
    app.state.renderSettings.staticScale = Number(dom.staticScaleRange.value);
    syncRenderSettingsUI();
    markStaticRenderUpdate();
  });

  dom.idleDelayRange?.addEventListener("input", () => {
    app.state.renderSettings.idleDelayMs = Number(dom.idleDelayRange.value);
    syncRenderSettingsUI();
    markStaticRenderUpdate();
  });

  dom.maxSamplesRange?.addEventListener("input", () => {
    app.state.renderSettings.maxSamples = Number(dom.maxSamplesRange.value);
    syncRenderSettingsUI();
    markStaticRenderUpdate();
  });
}

bindPanelToggles();
bindRenderControls();
setPanelCollapsed("left", false);
setPanelCollapsed("right", false);

runtime.controls.addEventListener("change", markInteractiveRenderUpdate);
runtime.transformControls.addEventListener("change", markInteractiveRenderUpdate);
runtime.transformControls.addEventListener("objectChange", markInteractiveRenderUpdate);

runtime.renderer.domElement.addEventListener(
  "pointerdown",
  app.selection.handlePointerDown
);

dom.showDemoBtn?.addEventListener("click", () => {
  app.assets.showFallbackDemo();
});

dom.pickGLBBtn?.addEventListener("click", () => {
  dom.glbInput.click();
});

dom.loadDefaultHDRBtn?.addEventListener("click", () => {
  app.assets.loadHDRFromURL(DEFAULT_HDR_PATH, "assets/studio_small_09_4k.hdr");
});

dom.pickHDRBtn?.addEventListener("click", () => {
  dom.hdrInput.click();
});

dom.resetViewBtn?.addEventListener("click", () => {
  const target = app.objectManager.getActiveRoot();
  if (target) {
    app.assets.frameModel(target);
  }
});

dom.clearSelectionBtn?.addEventListener("click", () => {
  app.selection.clearSelection();
});

dom.toggleMoveBtn?.addEventListener("click", () => {
  app.selection.toggleMoveMode();
});

dom.showAllBtn?.addEventListener("click", () => {
  app.objectManager.showAllObjects();
});

dom.moveSpeedRange?.addEventListener("input", () => {
  app.navigation.setMoveSpeed(Number(dom.moveSpeedRange.value));
});

dom.glbInput?.addEventListener("change", () => {
  const file = dom.glbInput.files?.[0];
  if (!file) {
    return;
  }

  app.assets.revokeModelObjectURL();
  const objectURL = URL.createObjectURL(file);
  app.state.currentModelObjectURL = objectURL;
  app.assets.loadGLBFromURL(objectURL, file.name, true);
  dom.glbInput.value = "";
});

dom.hdrInput?.addEventListener("change", () => {
  const file = dom.hdrInput.files?.[0];
  if (!file) {
    return;
  }

  app.assets.revokeHDRObjectURL();
  const objectURL = URL.createObjectURL(file);
  app.state.currentHDRObjectURL = objectURL;
  app.assets.loadHDRFromURL(objectURL, file.name, true);
  dom.hdrInput.value = "";
});

app.status.setModel("等待加载");
app.status.setHDR("等待加载");
app.status.setSelection("无");
app.status.setRender("准备中");

app.assets.showFallbackDemo();
app.assets.loadHDRFromURL(DEFAULT_HDR_PATH, "assets/studio_small_09_4k.hdr");
app.inspectors.renderInspectors();

let lastFrameTime = performance.now();

function animate(now) {
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  const navMoved = app.navigation.update(delta);
  const controlsChanged = runtime.controls.update() || false;
  const customShaderUpdated = app.materials.updateCustomShaderMaterials(
    app.objectManager.getActiveRoot()
  );

  if (navMoved || controlsChanged) {
    markInteractiveRenderUpdate();
  }

  if (customShaderUpdated) {
    markStaticRenderUpdate();
  }

  app.selection.updateSelectionBox();
  app.lights.updateHelpers();
  app.renderPipeline.render();
  window.requestAnimationFrame(animate);
}

window.requestAnimationFrame(animate);

window.addEventListener("resize", () => {
  runtime.camera.aspect = window.innerWidth / window.innerHeight;
  runtime.camera.updateProjectionMatrix();
  runtime.renderer.setSize(window.innerWidth, window.innerHeight);
  runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  app.renderPipeline.notifyInteraction();
});
