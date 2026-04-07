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
    hdrPaused: false,
    hdrBackgroundVisible: false,
    currentModelObjectURL: null,
    currentHDRObjectURL: null,
    currentHDRTexture: null,
    currentEnvironmentTarget: null,
    defaultSceneBackground:
      runtime.scene.background?.clone?.() ?? runtime.scene.background ?? null,
    defaultSceneBackgroundBlurriness: runtime.scene.backgroundBlurriness,
    defaultSceneBackgroundIntensity: runtime.scene.backgroundIntensity,
    defaultSceneEnvironmentIntensity: runtime.scene.environmentIntensity,
    lightSettings: {
      autoFitShadowToModel: true,
      shadowFitPadding: 1.6,
    },
    renderSettings: {
      accumulationEnabled: true,
      interactiveScale: 0.58,
      staticScale: 1,
      idleDelayMs: 420,
      maxSamples: 96,
      bounces: 6,
      transmissiveBounces: 8,
      filterGlossyFactor: 0.6,
    },
    environmentSettings: {
      autoSunFromHDR: true,
      hdrStrength: 0.95,
      hdrRotation: 0,
      sunBoost: 0.35,
      sunDistanceFactor: 5.8,
      environmentIntensity: 0.9,
      backgroundIntensity: 0.35,
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
    bounces,
    transmissiveBounces,
    filterGlossyFactor,
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

  if (dom.bouncesRange) {
    dom.bouncesRange.value = String(bounces);
  }
  if (dom.bouncesValueEl) {
    dom.bouncesValueEl.textContent = String(bounces);
  }

  if (dom.transmissiveBouncesRange) {
    dom.transmissiveBouncesRange.value = String(transmissiveBounces);
  }
  if (dom.transmissiveBouncesValueEl) {
    dom.transmissiveBouncesValueEl.textContent = String(transmissiveBounces);
  }

  if (dom.glossyFilterRange) {
    dom.glossyFilterRange.value = filterGlossyFactor.toFixed(2);
  }
  if (dom.glossyFilterValueEl) {
    dom.glossyFilterValueEl.textContent = `${Math.round(filterGlossyFactor * 100)}%`;
  }
}

function syncEnvironmentSettingsUI() {
  const { hdrStrength, hdrRotation } = app.state.environmentSettings;

  if (dom.hdrStrengthRange) {
    dom.hdrStrengthRange.value = hdrStrength.toFixed(2);
  }

  if (dom.hdrStrengthValueEl) {
    dom.hdrStrengthValueEl.textContent = `${Math.round(hdrStrength * 100)}%`;
  }

  if (dom.hdrRotationRange) {
    dom.hdrRotationRange.value = String(Math.round(hdrRotation));
  }

  if (dom.hdrRotationValueEl) {
    dom.hdrRotationValueEl.textContent = `${Math.round(hdrRotation)}°`;
  }
}

function syncRotationDegreeLabel() {
  if (!dom.hdrRotationValueEl) {
    return;
  }

  dom.hdrRotationValueEl.textContent = `${Math.round(app.state.environmentSettings.hdrRotation)}°`;
}

function enhanceRangeHelpTooltips() {
  const helpEntries = [
    [
      dom.hdrStrengthValueEl,
      "同时控制 HDR 环境光和 HDR 自动提取主光的整体强度，方便快速判断整体明暗和材质反射。",
    ],
    [
      dom.hdrRotationValueEl,
      "同步旋转 HDR 环境和自动提取主光方向，方便快速调整主光朝向。默认不再把摄影棚 HDR 直接显示成背景。",
    ],
    [
      dom.interactiveScaleValueEl,
      "相机移动和拖拽物体时优先保证响应速度；数值越低越流畅，越高越清晰。",
    ],
    [
      dom.staticScaleValueEl,
      "镜头停下后切到这个分辨率持续累积；越高越清晰，但单样本耗时也会更高。",
    ],
    [
      dom.idleDelayValueEl,
      "停止操作后等待多久再进入高质量累积。数值低会更快开始收敛，数值高会减少频繁切换。",
    ],
    [
      dom.maxSamplesValueEl,
      "静止后最多继续累积多少个路径追踪样本。越高越干净，但等待时间越长。",
    ],
    [
      dom.bouncesValueEl,
      "控制漫反射全局光照的反弹次数。更高会更自然，但也更慢。",
    ],
    [
      dom.transmissiveBouncesValueEl,
      "控制玻璃、透明材质和折射路径的反弹次数。玻璃多时适当提高会更稳定。",
    ],
    [
      dom.glossyFilterValueEl,
      "使用 glossy filter 压制 fireflies 和高亮噪点。越高越稳，但高光会更柔。",
    ],
    [
      dom.moveSpeedValueEl,
      "控制类 UE 飞行视角移动速度。场景大时可以调高，近距离精修时可以调低。",
    ],
  ];

  for (const [valueEl, helpText] of helpEntries) {
    const labelRow = valueEl?.closest(".range-label");
    if (!labelRow || labelRow.querySelector(".label-with-help")) {
      continue;
    }

    const labelTextEl = Array.from(labelRow.children).find((child) => child !== valueEl);
    if (!labelTextEl) {
      continue;
    }

    const labelWithHelp = document.createElement("span");
    labelWithHelp.className = "label-with-help";
    labelRow.insertBefore(labelWithHelp, labelTextEl);
    labelWithHelp.appendChild(labelTextEl);

    const helpDot = document.createElement("span");
    helpDot.className = "help-dot";
    helpDot.tabIndex = 0;
    helpDot.title = helpText;
    helpDot.textContent = "?";
    labelWithHelp.appendChild(helpDot);
  }
}

app.inspectors.bindTabs();
app.selection.syncMoveModeButton();
app.navigation.bind();
enhanceRangeHelpTooltips();
syncRenderSettingsUI();
syncEnvironmentSettingsUI();
syncRotationDegreeLabel();
app.assets.syncHDRToggleButton();
app.assets.syncHDRBackgroundButton();

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
    button.setAttribute("title", collapsed ? "展开左侧面板" : "收起左侧面板");
    button.setAttribute(
      "aria-label",
      collapsed ? "展开左侧面板" : "收起左侧面板"
    );
    return;
  }

  button.textContent = collapsed ? "<" : ">";
  button.setAttribute("title", collapsed ? "展开右侧面板" : "收起右侧面板");
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

  dom.bouncesRange?.addEventListener("input", () => {
    app.state.renderSettings.bounces = Number(dom.bouncesRange.value);
    syncRenderSettingsUI();
    markStaticRenderUpdate();
  });

  dom.transmissiveBouncesRange?.addEventListener("input", () => {
    app.state.renderSettings.transmissiveBounces = Number(
      dom.transmissiveBouncesRange.value
    );
    syncRenderSettingsUI();
    markStaticRenderUpdate();
  });

  dom.glossyFilterRange?.addEventListener("input", () => {
    app.state.renderSettings.filterGlossyFactor = Number(dom.glossyFilterRange.value);
    syncRenderSettingsUI();
    markStaticRenderUpdate();
  });

  dom.hdrStrengthRange?.addEventListener("input", () => {
    app.state.environmentSettings.hdrStrength = Number(dom.hdrStrengthRange.value);
    syncEnvironmentSettingsUI();
    syncRotationDegreeLabel();
    app.assets.applyHDRPresentation();
  });

  dom.hdrRotationRange?.addEventListener("input", () => {
    app.state.environmentSettings.hdrRotation = Number(dom.hdrRotationRange.value);
    syncEnvironmentSettingsUI();
    syncRotationDegreeLabel();
    app.assets.applyHDRPresentation();
  });
}

bindPanelToggles();
bindRenderControls();
setPanelCollapsed("left", false);
setPanelCollapsed("right", false);

runtime.controls.addEventListener("change", markInteractiveRenderUpdate);
runtime.transformControls.addEventListener("change", markInteractiveRenderUpdate);
runtime.transformControls.addEventListener("objectChange", markInteractiveRenderUpdate);
runtime.transformControls.addEventListener("dragging-changed", (event) => {
  if (!event.value) {
    app.renderPipeline.markDirty({ rebuildPathTracer: true });
  }
});

runtime.renderer.domElement.addEventListener(
  "pointerdown",
  app.selection.handlePointerDown
);

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented) {
    return;
  }

  app.selection.clearSelection();
});

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

dom.toggleHDRBtn?.addEventListener("click", () => {
  app.assets.toggleHDRPause();
});

dom.toggleHDRBackgroundBtn?.addEventListener("click", () => {
  app.assets.toggleHDRBackgroundVisibility();
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
