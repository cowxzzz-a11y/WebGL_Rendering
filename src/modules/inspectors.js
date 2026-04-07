import * as THREE from "three";

export function createInspectorsModule(app) {
  let currentInspectorTarget = app.dom.materialInspectorEl;

  function markDirty({ interaction = false } = {}) {
    if (interaction) {
      app.renderPipeline?.notifyInteraction();
      return;
    }

    app.renderPipeline?.markDirty();
  }

  function switchInspectorTab(tabName) {
    app.dom.tabButtons.forEach((button) => {
      const isActive = button.dataset.tabTarget === tabName;
      button.classList.toggle("is-active", isActive);
    });

    app.dom.tabPanels.forEach((panel) => {
      const isActive = panel.dataset.tabPanel === tabName;
      panel.classList.toggle("is-active", isActive);
    });
  }

  function bindTabs() {
    app.dom.tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        switchInspectorTab(button.dataset.tabTarget);
      });
    });
  }

  function clearPanel(target, message) {
    target.innerHTML = "";

    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = message;
    target.appendChild(empty);
  }

  function getSelectedMaterialInfo() {
    const { selectedObject } = app.state;

    if (!selectedObject) {
      return null;
    }

    if (!selectedObject.isMesh) {
      return {
        object: selectedObject,
        material: null,
        isArrayMaterial: false,
      };
    }

    if (Array.isArray(selectedObject.material)) {
      return {
        object: selectedObject,
        material: selectedObject.material[0] || null,
        isArrayMaterial: true,
      };
    }

    return {
      object: selectedObject,
      material: selectedObject.material || null,
      isArrayMaterial: false,
    };
  }

  function createInspectorSectionTitle(text) {
    const title = document.createElement("h3");
    title.textContent = text;
    title.style.marginTop = "14px";
    title.style.marginBottom = "8px";
    title.style.fontSize = "13px";
    currentInspectorTarget.appendChild(title);
  }

  function createInfoRow(labelText, valueText) {
    const row = document.createElement("div");
    row.className = "tree-item";

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = labelText;

    const value = document.createElement("div");
    value.className = "tree-label";
    value.style.textAlign = "right";
    value.textContent = valueText;

    row.appendChild(label);
    row.appendChild(value);
    currentInspectorTarget.appendChild(row);
  }

  function createBooleanControl(labelText, checked, onChange) {
    const row = document.createElement("div");
    row.className = "tree-item";

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => {
      onChange(input.checked);
    });

    row.appendChild(label);
    row.appendChild(input);
    currentInspectorTarget.appendChild(row);
  }

  function createColorControl(labelText, colorValue, onChange) {
    const row = document.createElement("div");
    row.className = "tree-item";

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "color";
    input.value = colorValue;
    input.addEventListener("input", () => {
      onChange(input.value);
    });

    row.appendChild(label);
    row.appendChild(input);
    currentInspectorTarget.appendChild(row);
  }

  function createNumberControl(labelText, value, min, max, step, onChange) {
    const row = document.createElement("div");
    row.className = "tree-item";
    row.style.alignItems = "stretch";
    row.style.flexDirection = "column";

    const top = document.createElement("div");
    top.style.display = "flex";
    top.style.alignItems = "center";
    top.style.gap = "8px";

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = labelText;

    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.min = String(min);
    numberInput.max = String(max);
    numberInput.step = String(step);
    numberInput.value = String(value);
    numberInput.style.width = "96px";

    top.appendChild(label);
    top.appendChild(numberInput);

    const rangeInput = document.createElement("input");
    rangeInput.type = "range";
    rangeInput.min = String(min);
    rangeInput.max = String(max);
    rangeInput.step = String(step);
    rangeInput.value = String(value);

    const syncValue = (nextValue) => {
      const parsed = Number(nextValue);
      if (!Number.isFinite(parsed)) {
        return;
      }

      numberInput.value = String(parsed);
      rangeInput.value = String(parsed);
      onChange(parsed);
    };

    numberInput.addEventListener("input", () => {
      syncValue(numberInput.value);
    });

    rangeInput.addEventListener("input", () => {
      syncValue(rangeInput.value);
    });

    row.appendChild(top);
    row.appendChild(rangeInput);
    currentInspectorTarget.appendChild(row);
  }

  function createSelectControl(labelText, value, options, onChange) {
    const row = document.createElement("div");
    row.className = "tree-item";
    row.style.alignItems = "stretch";
    row.style.flexDirection = "column";

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = labelText;

    const select = document.createElement("select");
    select.style.marginTop = "8px";
    select.style.padding = "8px 10px";
    select.style.borderRadius = "10px";
    select.style.border = "0";
    select.style.background = "rgba(255, 255, 255, 0.1)";
    select.style.color = "#f8fafc";
    select.style.colorScheme = "dark";

    options.forEach((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      element.style.color = "#0f172a";
      element.style.backgroundColor = "#ffffff";
      if (option.value === value) {
        element.selected = true;
      }
      select.appendChild(element);
    });

    select.addEventListener("change", () => {
      onChange(select.value);
    });

    row.appendChild(label);
    row.appendChild(select);
    currentInspectorTarget.appendChild(row);
  }

  function createButtonRow(labelText, buttons) {
    const row = document.createElement("div");
    row.className = "tree-item";
    row.style.alignItems = "stretch";
    row.style.flexDirection = "column";

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = labelText;

    const buttonWrap = document.createElement("div");
    buttonWrap.className = "button-row";

    buttons.forEach((buttonConfig) => {
      const button = document.createElement("button");
      button.textContent = buttonConfig.label;
      if (buttonConfig.secondary !== false) {
        button.className = "secondary";
      }
      button.addEventListener("click", buttonConfig.onClick);
      buttonWrap.appendChild(button);
    });

    row.appendChild(label);
    row.appendChild(buttonWrap);
    currentInspectorTarget.appendChild(row);
  }

  function createVector3Controls(prefix, vector, config = {}) {
    const {
      min = -20,
      max = 20,
      step = 0.01,
      onAfterChange = null,
    } = config;

    createNumberControl(`${prefix} X`, vector.x, min, max, step, (value) => {
      vector.x = value;
      onAfterChange?.();
      markDirty({ interaction: true });
    });

    createNumberControl(`${prefix} Y`, vector.y, min, max, step, (value) => {
      vector.y = value;
      onAfterChange?.();
      markDirty({ interaction: true });
    });

    createNumberControl(`${prefix} Z`, vector.z, min, max, step, (value) => {
      vector.z = value;
      onAfterChange?.();
      markDirty({ interaction: true });
    });
  }

  function renderBasicInfoInspector() {
    const info = getSelectedMaterialInfo();

    if (!info) {
      clearPanel(app.dom.basicInfoInspectorEl, "当前没有选中对象。");
      return;
    }

    const { object, material, isArrayMaterial } = info;

    app.dom.basicInfoInspectorEl.innerHTML = "";
    currentInspectorTarget = app.dom.basicInfoInspectorEl;

    createInspectorSectionTitle("对象信息");
    createInfoRow("对象名称", object.name || "未命名对象");
    createInfoRow("对象类型", object.type);
    createInfoRow("当前可见", object.visible ? "是" : "否");

    if ("castShadow" in object) {
      createInfoRow("投射阴影", object.castShadow ? "是" : "否");
    }

    if ("receiveShadow" in object) {
      createInfoRow("接收阴影", object.receiveShadow ? "是" : "否");
    }

    createInspectorSectionTitle("对象开关");
    createBooleanControl("对象可见", object.visible, (value) => {
      object.visible = value;
      if (!value && object === app.state.selectedObject) {
        app.selection.clearSelection();
        return;
      }
      app.objectManager.refreshObjectManager();
      renderBasicInfoInspector();
      markDirty();
    });

    if ("castShadow" in object) {
      createBooleanControl("投射阴影", object.castShadow, (value) => {
        object.castShadow = value;
        renderBasicInfoInspector();
        markDirty();
      });
    }

    if ("receiveShadow" in object) {
      createBooleanControl("接收阴影", object.receiveShadow, (value) => {
        object.receiveShadow = value;
        renderBasicInfoInspector();
        markDirty();
      });
    }

    if (object.isLight) {
      createInspectorSectionTitle("灯光信息");
      createInfoRow("灯光颜色", `#${object.color.getHexString()}`);
      createInfoRow("灯光强度", object.intensity.toFixed(2));
      createInfoRow("提示", "更多灯光参数请切换到灯光页签。");
      return;
    }

    if (!object.isMesh) {
      createInspectorSectionTitle("材质说明");
      createInfoRow("当前状态", "这是一个非 Mesh 对象，请在对象页签里选中具体 Mesh。");
      return;
    }

    if (!material) {
      createInspectorSectionTitle("材质说明");
      createInfoRow("当前状态", "当前 Mesh 没有可编辑材质。");
      return;
    }

    const currentPreset = material.userData?.materialPreset || "original";

    createInspectorSectionTitle("材质概览");
    createInfoRow("材质类型", material.type || "未知");
    createInfoRow("材质预设", currentPreset);
    createInfoRow("颜色贴图", material.map ? "有" : "无");
    createInfoRow("法线贴图", material.normalMap ? "有" : "无");
    createInfoRow("环境反射", "envMapIntensity" in material ? "可调" : "不支持");

    if (isArrayMaterial) {
      createInfoRow("提示", "当前只编辑第一个材质槽位。");
    }
  }

  function renderMaterialInspector() {
    const info = getSelectedMaterialInfo();

    if (!info) {
      clearPanel(app.dom.materialInspectorEl, "当前没有选中对象。");
      return;
    }

    if (!info.object.isMesh) {
      clearPanel(app.dom.materialInspectorEl, "当前选中的是非 Mesh 对象，请先选中具体 Mesh。");
      return;
    }

    if (!info.material) {
      clearPanel(app.dom.materialInspectorEl, "当前 Mesh 没有可编辑材质。");
      return;
    }

    const { material } = info;
    const currentPreset = material.userData?.materialPreset || "original";

    app.dom.materialInspectorEl.innerHTML = "";
    currentInspectorTarget = app.dom.materialInspectorEl;

    createInspectorSectionTitle("材质类型");
    createSelectControl(
      "切换 Three.js 材质 / 自定义 Shader",
      currentPreset,
      app.config.MATERIAL_PRESET_OPTIONS,
      (value) => {
        app.materials.replaceSelectedMaterial(value);
        markDirty();
      }
    );

    createInspectorSectionTitle("基础参数");
    createInfoRow("当前材质", material.type || "未知");

    if (material.color) {
      createColorControl("基础颜色", `#${material.color.getHexString()}`, (value) => {
        material.color.set(value);
        markDirty();
      });
    }

    if ("roughness" in material) {
      createNumberControl("粗糙度", material.roughness, 0, 1, 0.01, (value) => {
        material.roughness = value;
        markDirty();
      });
    }

    if ("metalness" in material) {
      createNumberControl("金属度", material.metalness, 0, 1, 0.01, (value) => {
        material.metalness = value;
        markDirty();
      });
    }

    if ("envMapIntensity" in material) {
      createNumberControl("环境反射", material.envMapIntensity, 0, 10, 0.01, (value) => {
        material.envMapIntensity = value;
        markDirty();
      });
    }

    if ("opacity" in material) {
      createNumberControl("透明度", material.opacity, 0, 1, 0.01, (value) => {
        material.opacity = value;
        material.transparent = value < 1 || material.transparent;
        material.needsUpdate = true;
        markDirty();
      });
    }

    if ("clearcoat" in material) {
      createNumberControl("清漆", material.clearcoat, 0, 1, 0.01, (value) => {
        material.clearcoat = value;
        markDirty();
      });
    }

    if ("clearcoatRoughness" in material) {
      createNumberControl(
        "清漆粗糙度",
        material.clearcoatRoughness,
        0,
        1,
        0.01,
        (value) => {
          material.clearcoatRoughness = value;
          markDirty();
        }
      );
    }

    if ("transmission" in material) {
      createNumberControl("透射", material.transmission, 0, 1, 0.01, (value) => {
        material.transmission = value;
        markDirty();
      });
    }

    if ("ior" in material) {
      createNumberControl("折射率", material.ior, 1, 2.5, 0.01, (value) => {
        material.ior = value;
        markDirty();
      });
    }

    if (material.emissive) {
      createColorControl("自发光", `#${material.emissive.getHexString()}`, (value) => {
        material.emissive.set(value);
        markDirty();
      });
    }

    if ("emissiveIntensity" in material) {
      createNumberControl("自发光强度", material.emissiveIntensity, 0, 10, 0.01, (value) => {
        material.emissiveIntensity = value;
        markDirty();
      });
    }

    if ("wireframe" in material) {
      createBooleanControl("线框显示", !!material.wireframe, (value) => {
        material.wireframe = value;
        material.needsUpdate = true;
        markDirty();
      });
    }
  }

  function renderLightInspector() {
    app.dom.lightInspectorEl.innerHTML = "";
    currentInspectorTarget = app.dom.lightInspectorEl;

    const {
      dirLight,
      areaLight,
      areaLightTarget,
      fillLight,
      dirLightHelper,
      areaLightHelper,
      fillLightHelper,
      shadowCameraHelper,
    } = app.runtime;

    createInspectorSectionTitle("HDR 主方向光");
    createButtonRow("快速选中", [
      { label: "选中主光", onClick: () => app.lights.attachMainLight() },
      { label: "选中目标", onClick: () => app.lights.attachMainTarget() },
    ]);

    createBooleanControl("主方向光可见", dirLight.visible, (value) => {
      dirLight.visible = value;
      app.lights.updateHelpers();
      markDirty();
    });

    createBooleanControl("主方向光投影", dirLight.castShadow, (value) => {
      dirLight.castShadow = value;
      app.runtime.renderer.shadowMap.needsUpdate = true;
      app.lights.updateHelpers();
      markDirty();
    });

    createColorControl("主方向光颜色", `#${dirLight.color.getHexString()}`, (value) => {
      dirLight.color.set(value);
      app.lights.updateHelpers();
      markDirty();
    });

    createNumberControl("主方向光强度", dirLight.intensity, 0, 12, 0.01, (value) => {
      dirLight.intensity = value;
      markDirty();
    });

    createVector3Controls("主方向光位置", dirLight.position, {
      onAfterChange: () => app.lights.updateHelpers(),
    });
    createVector3Controls("主方向光目标", dirLight.target.position, {
      min: -10,
      max: 10,
      onAfterChange: () => app.lights.updateHelpers(),
    });

    createInspectorSectionTitle("主面光");
    createButtonRow("快速选中", [
      { label: "选中面光", onClick: () => app.lights.attachAreaLight() },
      { label: "选中目标", onClick: () => app.lights.attachAreaTarget() },
    ]);

    createBooleanControl("主面光可见", areaLight.visible, (value) => {
      areaLight.visible = value;
      app.lights.updateHelpers();
      markDirty();
    });

    createColorControl("主面光颜色", `#${areaLight.color.getHexString()}`, (value) => {
      areaLight.color.set(value);
      markDirty();
    });

    createNumberControl("主面光强度", areaLight.intensity, 0, 40, 0.1, (value) => {
      areaLight.intensity = value;
      markDirty();
    });

    createNumberControl("主面光宽度", areaLight.width, 0.2, 8, 0.01, (value) => {
      areaLight.width = value;
      app.lights.updateHelpers();
      markDirty();
    });

    createNumberControl("主面光高度", areaLight.height, 0.2, 8, 0.01, (value) => {
      areaLight.height = value;
      app.lights.updateHelpers();
      markDirty();
    });

    createVector3Controls("主面光位置", areaLight.position, {
      onAfterChange: () => app.lights.updateHelpers(),
    });
    createVector3Controls("主面光目标", areaLightTarget.position, {
      min: -10,
      max: 10,
      onAfterChange: () => app.lights.updateHelpers(),
    });

    createInspectorSectionTitle("阴影质量");

    createBooleanControl(
      "自动贴合模型阴影范围",
      app.state.lightSettings.autoFitShadowToModel,
      (value) => {
        app.state.lightSettings.autoFitShadowToModel = value;
        const root = app.objectManager.getActiveRoot();
        if (root) {
          app.lights.fitShadowToObject(root);
        }
        markDirty();
      }
    );

    createNumberControl(
      "阴影贴合倍率",
      app.state.lightSettings.shadowFitPadding,
      1,
      4,
      0.05,
      (value) => {
        app.state.lightSettings.shadowFitPadding = value;
        const root = app.objectManager.getActiveRoot();
        if (root) {
          app.lights.fitShadowToObject(root);
        }
        markDirty();
      }
    );

    createSelectControl(
      "阴影算法",
      app.lights.getShadowMapTypeValue(),
      [
        { value: "basic", label: "BasicShadowMap" },
        { value: "pcf", label: "PCFShadowMap" },
        { value: "pcfSoft", label: "PCFSoftShadowMap" },
        { value: "vsm", label: "VSMShadowMap" },
      ],
      (value) => {
        app.lights.setShadowMapType(value);
        markDirty();
      }
    );

    createSelectControl(
      "阴影贴图尺寸",
      String(dirLight.shadow.mapSize.x),
      [
        { value: "1024", label: "1024" },
        { value: "2048", label: "2048" },
        { value: "4096", label: "4096" },
        { value: "8192", label: "8192" },
      ],
      (value) => {
        app.lights.setLightMapSize(dirLight, Number(value));
        markDirty();
      }
    );

    createNumberControl("阴影 radius", dirLight.shadow.radius, 0, 8, 0.01, (value) => {
      dirLight.shadow.radius = value;
      app.runtime.renderer.shadowMap.needsUpdate = true;
      markDirty();
    });

    createNumberControl("阴影 bias", dirLight.shadow.bias, -0.01, 0.01, 0.00001, (value) => {
      dirLight.shadow.bias = value;
      app.runtime.renderer.shadowMap.needsUpdate = true;
      markDirty();
    });

    createNumberControl(
      "阴影 normalBias",
      dirLight.shadow.normalBias,
      0,
      0.2,
      0.0001,
      (value) => {
        dirLight.shadow.normalBias = value;
        app.runtime.renderer.shadowMap.needsUpdate = true;
        markDirty();
      }
    );

    createInspectorSectionTitle("辅助线");
    createBooleanControl("主方向光辅助线", dirLightHelper.visible, (value) => {
      app.lights.setHelpersVisible({ mainHelper: value });
      markDirty();
    });

    createBooleanControl("主面光辅助线", areaLightHelper.visible, (value) => {
      app.lights.setHelpersVisible({ areaHelper: value });
      markDirty();
    });

    createBooleanControl("辅助方向光辅助线", fillLightHelper.visible, (value) => {
      app.lights.setHelpersVisible({ fillHelper: value });
      markDirty();
    });

    createBooleanControl("阴影相机辅助线", shadowCameraHelper.visible, (value) => {
      app.lights.setHelpersVisible({ shadowHelper: value });
      markDirty();
    });

    createInspectorSectionTitle("辅助方向光");
    createButtonRow("快速选中", [
      { label: "选中辅助光", onClick: () => app.lights.attachFillLight() },
      { label: "选中目标", onClick: () => app.lights.attachFillTarget() },
    ]);

    createBooleanControl("辅助光可见", fillLight.visible, (value) => {
      fillLight.visible = value;
      app.lights.updateHelpers();
      markDirty();
    });

    createColorControl("辅助光颜色", `#${fillLight.color.getHexString()}`, (value) => {
      fillLight.color.set(value);
      app.lights.updateHelpers();
      markDirty();
    });

    createNumberControl("辅助光强度", fillLight.intensity, 0, 12, 0.01, (value) => {
      fillLight.intensity = value;
      markDirty();
    });

    createVector3Controls("辅助光位置", fillLight.position, {
      onAfterChange: () => app.lights.updateHelpers(),
    });
    createVector3Controls("辅助光目标", fillLight.target.position, {
      min: -10,
      max: 10,
      onAfterChange: () => app.lights.updateHelpers(),
    });
  }

  function renderInspectors() {
    renderBasicInfoInspector();
    renderMaterialInspector();
    renderLightInspector();
  }

  return {
    bindTabs,
    renderInspectors,
    renderBasicInfoInspector,
    renderMaterialInspector,
    renderLightInspector,
    getSelectedMaterialInfo,
    switchInspectorTab,
  };
}
