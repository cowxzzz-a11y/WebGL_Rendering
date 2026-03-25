import {
  DEFAULT_HDR_PATH,
  DEFAULT_SCENE_PATH,
  DEFAULT_TEA_PATH,
  MATERIAL_PRESET_OPTIONS,
} from "./config.js";
import { createDOMRefs } from "./dom.js";
import { createSceneRuntime } from "./scene/runtime.js";
import { createAssetsModule } from "./modules/assets.js";
import { createInspectorsModule } from "./modules/inspectors.js";
import { createLightsModule } from "./modules/lights.js";
import { createMaterialsModule } from "./modules/materials.js";
import { createObjectManagerModule } from "./modules/objectManager.js";
import { createSelectionModule } from "./modules/selection.js";

const dom = createDOMRefs();
const runtime = createSceneRuntime(dom.app);

const app = {
  dom,
  runtime,
  config: {
    DEFAULT_HDR_PATH,
    DEFAULT_SCENE_PATH,
    DEFAULT_TEA_PATH,
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
  },
  status: {
    setModel(text) {
      dom.statusModelEl.textContent = `模型状态：${text}`;
    },
    setHDR(text) {
      dom.statusHDREl.textContent = `HDR 状态：${text}`;
    },
    setSelection(text) {
      dom.statusSelectionEl.textContent = `当前选中：${text}`;
    },
  },
};

app.materials = createMaterialsModule(app);
app.objectManager = createObjectManagerModule(app);
app.selection = createSelectionModule(app);
app.lights = createLightsModule(app);
app.inspectors = createInspectorsModule(app);
app.assets = createAssetsModule(app);

app.inspectors.bindTabs();
app.selection.syncMoveModeButton();

runtime.renderer.domElement.addEventListener(
  "pointerdown",
  app.selection.handlePointerDown
);

dom.loadSceneBtn.addEventListener("click", () => {
  app.assets.loadGLBFromURL(DEFAULT_SCENE_PATH, "assets/scene.glb");
});

dom.loadTeaBtn.addEventListener("click", () => {
  app.assets.loadGLBFromURL(DEFAULT_TEA_PATH, "assets/tea.glb");
});

dom.pickGLBBtn.addEventListener("click", () => {
  dom.glbInput.click();
});

dom.showFallbackBtn.addEventListener("click", () => {
  app.assets.showFallbackDemo();
});

dom.loadDefaultHDRBtn.addEventListener("click", () => {
  app.assets.loadHDRFromURL(DEFAULT_HDR_PATH, "assets/studio_small_09_4k.hdr");
});

dom.pickHDRBtn.addEventListener("click", () => {
  dom.hdrInput.click();
});

dom.resetViewBtn.addEventListener("click", () => {
  const root = app.objectManager.getActiveRoot();
  if (root) {
    app.assets.frameModel(root);
  }
});

dom.clearSelectionBtn.addEventListener("click", () => {
  app.selection.clearSelection();
});

dom.toggleMoveBtn.addEventListener("click", () => {
  app.selection.toggleMoveMode();
});

dom.showAllBtn.addEventListener("click", () => {
  app.objectManager.showAllObjects();
});

dom.glbInput.addEventListener("change", () => {
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

dom.hdrInput.addEventListener("change", () => {
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

app.assets.loadHDRFromURL(DEFAULT_HDR_PATH, "assets/studio_small_09_4k.hdr");
app.assets.loadGLBFromURL(DEFAULT_SCENE_PATH, "assets/scene.glb");
app.inspectors.renderInspectors();

function animate() {
  runtime.controls.update();
  app.materials.updateCustomShaderMaterials(app.objectManager.getActiveRoot());
  app.lights.updateHelpers();
  runtime.renderer.render(runtime.scene, runtime.camera);
  window.requestAnimationFrame(animate);
}

animate();

window.addEventListener("resize", () => {
  runtime.camera.aspect = window.innerWidth / window.innerHeight;
  runtime.camera.updateProjectionMatrix();
  runtime.renderer.setSize(window.innerWidth, window.innerHeight);
  runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
