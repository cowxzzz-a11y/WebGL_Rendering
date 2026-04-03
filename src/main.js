import { DEFAULT_HDR_PATH, MATERIAL_PRESET_OPTIONS } from "./config.js";
import { createDOMRefs } from "./dom.js";
import { createAssetsModule } from "./modules/assets.js";
import { createInspectorsModule } from "./modules/inspectors.js";
import { createLightsModule } from "./modules/lights.js";
import { createMaterialsModule } from "./modules/materials.js";
import { createNavigationModule } from "./modules/navigation.js";
import { createObjectManagerModule } from "./modules/objectManager.js";
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
    viewSettings: {
      moveSpeed: 4.0,
    },
  },
  status: {
    setModel(text) {
      dom.statusModelEl?.replaceChildren(document.createTextNode(`模型状态: ${text}`));
    },
    setHDR(text) {
      dom.statusHDREl?.replaceChildren(document.createTextNode(`HDR 状态: ${text}`));
    },
    setSelection(text) {
      dom.statusSelectionEl?.replaceChildren(
        document.createTextNode(`当前选中: ${text}`)
      );
    },
  },
};

app.materials = createMaterialsModule(app);
app.objectManager = createObjectManagerModule(app);
app.selection = createSelectionModule(app);
app.lights = createLightsModule(app);
app.inspectors = createInspectorsModule(app);
app.assets = createAssetsModule(app);
app.navigation = createNavigationModule(app);

app.inspectors.bindTabs();
app.selection.syncMoveModeButton();
app.navigation.bind();

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

bindPanelToggles();
setPanelCollapsed("left", false);
setPanelCollapsed("right", false);

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

app.assets.showFallbackDemo();
app.assets.loadHDRFromURL(DEFAULT_HDR_PATH, "assets/studio_small_09_4k.hdr");
app.inspectors.renderInspectors();

let lastFrameTime = performance.now();

function animate(now) {
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  app.navigation.update(delta);
  runtime.controls.update();
  app.selection.updateSelectionBox();
  app.materials.updateCustomShaderMaterials(app.objectManager.getActiveRoot());
  app.lights.updateHelpers();
  runtime.renderer.render(runtime.scene, runtime.camera);
  window.requestAnimationFrame(animate);
}

window.requestAnimationFrame(animate);

window.addEventListener("resize", () => {
  runtime.camera.aspect = window.innerWidth / window.innerHeight;
  runtime.camera.updateProjectionMatrix();
  runtime.renderer.setSize(window.innerWidth, window.innerHeight);
  runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
