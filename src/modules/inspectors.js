import * as THREE from "three";

export function createInspectorsModule(app) {
  let currentInspectorTarget = app.dom.materialInspectorEl;

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

  function clearMaterialInspector(message) {
    clearPanel(app.dom.materialInspectorEl, message);
  }

  function clearBasicInfoInspector(message) {
    clearPanel(app.dom.basicInfoInspectorEl, message);
  }

  function clearLightInspector(message) {
    clearPanel(app.dom.lightInspectorEl, message);
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
    });

    createNumberControl(`${prefix} Y`, vector.y, min, max, step, (value) => {
      vector.y = value;
      onAfterChange?.();
    });

    createNumberControl(`${prefix} Z`, vector.z, min, max, step, (value) => {
      vector.z = value;
      onAfterChange?.();
    });
  }

  function renderBasicInfoInspector() {
    const info = getSelectedMaterialInfo();

    if (!info) {
      clearBasicInfoInspector("当前没有选中对象。");
      return;
    }

    const { object, material, isArrayMaterial } = info;

    app.dom.basicInfoInspectorEl.innerHTML = "";
    currentInspectorTarget = app.dom.basicInfoInspectorEl;

    createInspectorSectionTitle("对象信息");
    createInfoRow("对象名称", object.name || "未命名对象");
    createInfoRow("对象类型", object.type);
    createInfoRow("对象可见", object.visible ? "是" : "否");

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
    });

    if ("castShadow" in object) {
      createBooleanControl("投射阴影", object.castShadow, (value) => {
        object.castShadow = value;
        renderBasicInfoInspector();
      });
    }

    if ("receiveShadow" in object) {
      createBooleanControl("接收阴影", object.receiveShadow, (value) => {
        object.receiveShadow = value;
        renderBasicInfoInspector();
      });
    }

    if (object.isLight) {
      createInspectorSectionTitle("灯光信息");
      createInfoRow("灯光颜色", `#${object.color.getHexString()}`);
      createInfoRow("灯光强度", object.intensity.toFixed(2));
      if ("castShadow" in object) {
        createInfoRow("灯光投影", object.castShadow ? "开启" : "关闭");
      }
      createInfoRow("提示", "更多灯光和阴影参数请切到灯光页签。");
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
    createInfoRow("粗糙度贴图", material.roughnessMap ? "有" : "无");
    createInfoRow("金属度贴图", material.metalnessMap ? "有" : "无");
    createInfoRow("环境贴图", material.envMap ? "有" : "无");

    if (isArrayMaterial) {
      createInfoRow("多材质提示", "当前只编辑第一个材质。");
    }
  }

  function renderMaterialInspector() {
    const info = getSelectedMaterialInfo();

    if (!info) {
      clearMaterialInspector("当前没有选中对象。");
      return;
    }

    if (!info.object.isMesh) {
      clearMaterialInspector("当前选中的是非 Mesh 对象。请先选中具体 Mesh。");
      return;
    }

    if (!info.material) {
      clearMaterialInspector("当前选中的 Mesh 没有可编辑材质。");
      return;
    }

    const { material } = info;
    const currentPreset = material.userData?.materialPreset || "original";

    app.dom.materialInspectorEl.innerHTML = "";
    currentInspectorTarget = app.dom.materialInspectorEl;

    createInspectorSectionTitle("材质类型");
    createSelectControl(
      "切换 Three.js 预制材质 / 自定义 Shader",
      currentPreset,
      app.config.MATERIAL_PRESET_OPTIONS,
      (value) => {
        app.materials.replaceSelectedMaterial(value);
      }
    );

    createInspectorSectionTitle("材质参数");
    createInfoRow("当前材质类型", material.type || "未知");
    createInfoRow(
      "当前模式",
      currentPreset === "original"
        ? "正在使用 GLB 原材质。"
        : "正在使用替换后的 Three.js 材质。"
    );

    if ("transparent" in material) {
      createBooleanControl("开启透明 transparent", !!material.transparent, (value) => {
        material.transparent = value;
        material.needsUpdate = true;
        renderBasicInfoInspector();
      });
    }

    if ("depthWrite" in material) {
      createBooleanControl("写入深度 depthWrite", !!material.depthWrite, (value) => {
        material.depthWrite = value;
        material.needsUpdate = true;
      });
    }

    if ("depthTest" in material) {
      createBooleanControl("深度测试 depthTest", !!material.depthTest, (value) => {
        material.depthTest = value;
        material.needsUpdate = true;
      });
    }

    if ("side" in material) {
      createSelectControl(
        "渲染面 side",
        String(material.side),
        [
          { value: String(THREE.FrontSide), label: "正面 FrontSide" },
          { value: String(THREE.BackSide), label: "背面 BackSide" },
          { value: String(THREE.DoubleSide), label: "双面 DoubleSide" },
        ],
        (value) => {
          material.side = Number(value);
          material.needsUpdate = true;
        }
      );
    }

    if ("flatShading" in material) {
      createBooleanControl("平面着色 flatShading", !!material.flatShading, (value) => {
        material.flatShading = value;
        material.needsUpdate = true;
      });
    }

    if ("toneMapped" in material) {
      createBooleanControl("参与色调映射 toneMapped", !!material.toneMapped, (value) => {
        material.toneMapped = value;
        material.needsUpdate = true;
      });
    }

    if ("fog" in material) {
      createBooleanControl("参与雾 fog", !!material.fog, (value) => {
        material.fog = value;
        material.needsUpdate = true;
      });
    }

    if ("dithering" in material) {
      createBooleanControl("抖动 dithering", !!material.dithering, (value) => {
        material.dithering = value;
        material.needsUpdate = true;
      });
    }

    if ("visible" in material) {
      createBooleanControl("材质可见", !!material.visible, (value) => {
        material.visible = value;
        material.needsUpdate = true;
      });
    }

    if ("wireframe" in material) {
      createBooleanControl("线框显示 wireframe", !!material.wireframe, (value) => {
        material.wireframe = value;
        material.needsUpdate = true;
      });
    }

    if ("alphaTest" in material) {
      createNumberControl("透明裁切 alphaTest", material.alphaTest, 0, 1, 0.01, (value) => {
        material.alphaTest = value;
        material.needsUpdate = true;
      });
    }

    if (material.color) {
      createColorControl("基础颜色", `#${material.color.getHexString()}`, (value) => {
        material.color.set(value);
      });
    }

    if ("roughness" in material) {
      createNumberControl("粗糙度 roughness", material.roughness, 0, 1, 0.01, (value) => {
        material.roughness = value;
      });
    }

    if ("metalness" in material) {
      createNumberControl("金属度 metalness", material.metalness, 0, 1, 0.01, (value) => {
        material.metalness = value;
      });
    }

    if ("envMapIntensity" in material) {
      createNumberControl(
        "环境反射 envMapIntensity",
        material.envMapIntensity,
        0,
        10,
        0.01,
        (value) => {
          material.envMapIntensity = value;
        }
      );
    }

    if ("reflectivity" in material) {
      createNumberControl("反射 reflectivity", material.reflectivity, 0, 1, 0.01, (value) => {
        material.reflectivity = value;
      });
    }

    if ("shininess" in material) {
      createNumberControl("高光 shininess", material.shininess, 0, 200, 1, (value) => {
        material.shininess = value;
      });
    }

    if ("specular" in material) {
      createColorControl("高光颜色 specular", `#${material.specular.getHexString()}`, (value) => {
        material.specular.set(value);
      });
    }

    if ("opacity" in material) {
      createNumberControl("透明度 opacity", material.opacity, 0, 1, 0.01, (value) => {
        material.opacity = value;
        material.transparent = value < 1 || material.transparent;
        material.needsUpdate = true;
        renderBasicInfoInspector();
      });
    }

    if ("clearcoat" in material) {
      createNumberControl("清漆 clearcoat", material.clearcoat, 0, 1, 0.01, (value) => {
        material.clearcoat = value;
      });
    }

    if ("clearcoatRoughness" in material) {
      createNumberControl(
        "清漆粗糙度 clearcoatRoughness",
        material.clearcoatRoughness,
        0,
        1,
        0.01,
        (value) => {
          material.clearcoatRoughness = value;
        }
      );
    }

    if ("transmission" in material) {
      createNumberControl("透射 transmission", material.transmission, 0, 1, 0.01, (value) => {
        material.transmission = value;
      });
    }

    if ("ior" in material) {
      createNumberControl("折射率 ior", material.ior, 1, 2.5, 0.01, (value) => {
        material.ior = value;
      });
    }

    if ("refractionRatio" in material) {
      createNumberControl(
        "折射比 refractionRatio",
        material.refractionRatio,
        0,
        1,
        0.01,
        (value) => {
          material.refractionRatio = value;
        }
      );
    }

    if ("thickness" in material) {
      createNumberControl("厚度 thickness", material.thickness, 0, 10, 0.01, (value) => {
        material.thickness = value;
      });
    }

    if ("normalScale" in material) {
      createNumberControl("法线强度 X", material.normalScale.x, -5, 5, 0.01, (value) => {
        material.normalScale.set(value, material.normalScale.y);
      });
      createNumberControl("法线强度 Y", material.normalScale.y, -5, 5, 0.01, (value) => {
        material.normalScale.set(material.normalScale.x, value);
      });
    }

    if ("bumpScale" in material) {
      createNumberControl("凹凸强度 bumpScale", material.bumpScale, 0, 5, 0.01, (value) => {
        material.bumpScale = value;
      });
    }

    if ("displacementScale" in material) {
      createNumberControl(
        "位移强度 displacementScale",
        material.displacementScale,
        0,
        5,
        0.01,
        (value) => {
          material.displacementScale = value;
        }
      );
    }

    if ("aoMapIntensity" in material) {
      createNumberControl("AO 强度 aoMapIntensity", material.aoMapIntensity, 0, 5, 0.01, (value) => {
        material.aoMapIntensity = value;
      });
    }

    if (material.emissive) {
      createColorControl("自发光 emissive", `#${material.emissive.getHexString()}`, (value) => {
        material.emissive.set(value);
      });
    }

    if ("emissiveIntensity" in material) {
      createNumberControl(
        "自发光强度 emissiveIntensity",
        material.emissiveIntensity,
        0,
        10,
        0.01,
        (value) => {
          material.emissiveIntensity = value;
        }
      );
    }

    if (material.userData?.materialPreset === "shader-ripple" && material.uniforms) {
      createInspectorSectionTitle("自定义 Shader 参数");

      createColorControl("颜色 A", `#${material.uniforms.uColorA.value.getHexString()}`, (value) => {
        material.uniforms.uColorA.value.set(value);
      });

      createColorControl("颜色 B", `#${material.uniforms.uColorB.value.getHexString()}`, (value) => {
        material.uniforms.uColorB.value.set(value);
      });

      createNumberControl("波纹密度 uWaveScale", material.uniforms.uWaveScale.value, 1, 30, 0.1, (value) => {
        material.uniforms.uWaveScale.value = value;
      });

      createNumberControl("流动速度 uSpeed", material.uniforms.uSpeed.value, 0, 10, 0.01, (value) => {
        material.uniforms.uSpeed.value = value;
      });

      createNumberControl(
        "菲涅耳强度 uFresnelPower",
        material.uniforms.uFresnelPower.value,
        0,
        8,
        0.01,
        (value) => {
          material.uniforms.uFresnelPower.value = value;
        }
      );

      createNumberControl("高光发光 uGlow", material.uniforms.uGlow.value, 0, 2, 0.01, (value) => {
        material.uniforms.uGlow.value = value;
      });
    }
  }

  function renderLightInspector() {
    if (!app.dom.lightInspectorEl) {
      return;
    }

    app.dom.lightInspectorEl.innerHTML = "";
    currentInspectorTarget = app.dom.lightInspectorEl;

    const { dirLight, fillLight, dirLightHelper, fillLightHelper, shadowCameraHelper } =
      app.runtime;

    createInspectorSectionTitle("主平行光");
    createButtonRow("场景里直接拖动", [
      { label: "选中主光源", onClick: () => app.lights.attachMainLight() },
      { label: "选中主光目标", onClick: () => app.lights.attachMainTarget() },
    ]);

    createBooleanControl("主光可见", dirLight.visible, (value) => {
      dirLight.visible = value;
      app.lights.updateHelpers();
    });

    createBooleanControl("主光投影", dirLight.castShadow, (value) => {
      dirLight.castShadow = value;
      app.runtime.renderer.shadowMap.needsUpdate = true;
      app.lights.updateHelpers();
    });

    createColorControl("主光颜色", `#${dirLight.color.getHexString()}`, (value) => {
      dirLight.color.set(value);
      app.lights.updateHelpers();
    });

    createNumberControl("主光强度", dirLight.intensity, 0, 12, 0.01, (value) => {
      dirLight.intensity = value;
      app.lights.updateHelpers();
    });

    createVector3Controls("主光位置", dirLight.position, {
      min: -20,
      max: 20,
      step: 0.01,
      onAfterChange: () => app.lights.updateHelpers(),
    });

    createVector3Controls("主光目标", dirLight.target.position, {
      min: -10,
      max: 10,
      step: 0.01,
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
      }
    );

    createNumberControl(
      "贴合范围倍率",
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
      }
    );

    createNumberControl("阴影软化 radius", dirLight.shadow.radius, 0, 8, 0.01, (value) => {
      dirLight.shadow.radius = value;
      app.runtime.renderer.shadowMap.needsUpdate = true;
    });

    createNumberControl("阴影 bias", dirLight.shadow.bias, -0.01, 0.01, 0.00001, (value) => {
      dirLight.shadow.bias = value;
      app.runtime.renderer.shadowMap.needsUpdate = true;
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
      }
    );

    createNumberControl("shadow near", dirLight.shadow.camera.near, 0.01, 10, 0.01, (value) => {
      dirLight.shadow.camera.near = value;
      dirLight.shadow.camera.updateProjectionMatrix();
      app.lights.updateHelpers();
    });

    createNumberControl("shadow far", dirLight.shadow.camera.far, 1, 100, 0.1, (value) => {
      dirLight.shadow.camera.far = value;
      dirLight.shadow.camera.updateProjectionMatrix();
      app.lights.updateHelpers();
    });

    createNumberControl("shadow left", dirLight.shadow.camera.left, -20, 0, 0.01, (value) => {
      dirLight.shadow.camera.left = value;
      dirLight.shadow.camera.updateProjectionMatrix();
      app.lights.updateHelpers();
    });

    createNumberControl("shadow right", dirLight.shadow.camera.right, 0, 20, 0.01, (value) => {
      dirLight.shadow.camera.right = value;
      dirLight.shadow.camera.updateProjectionMatrix();
      app.lights.updateHelpers();
    });

    createNumberControl("shadow top", dirLight.shadow.camera.top, 0, 20, 0.01, (value) => {
      dirLight.shadow.camera.top = value;
      dirLight.shadow.camera.updateProjectionMatrix();
      app.lights.updateHelpers();
    });

    createNumberControl(
      "shadow bottom",
      dirLight.shadow.camera.bottom,
      -20,
      0,
      0.01,
      (value) => {
        dirLight.shadow.camera.bottom = value;
        dirLight.shadow.camera.updateProjectionMatrix();
        app.lights.updateHelpers();
      }
    );

    createInspectorSectionTitle("灯光辅助线");

    createBooleanControl("主光辅助线", dirLightHelper.visible, (value) => {
      app.lights.setHelpersVisible({ mainHelper: value });
    });

    createBooleanControl("辅助光辅助线", fillLightHelper.visible, (value) => {
      app.lights.setHelpersVisible({ fillHelper: value });
    });

    createBooleanControl("阴影相机辅助线", shadowCameraHelper.visible, (value) => {
      app.lights.setHelpersVisible({ shadowHelper: value });
    });

    createInspectorSectionTitle("辅助平行光");
    createButtonRow("场景里直接拖动", [
      { label: "选中辅助光", onClick: () => app.lights.attachFillLight() },
      { label: "选中辅助光目标", onClick: () => app.lights.attachFillTarget() },
    ]);

    createBooleanControl("辅助光可见", fillLight.visible, (value) => {
      fillLight.visible = value;
      app.lights.updateHelpers();
    });

    createColorControl("辅助光颜色", `#${fillLight.color.getHexString()}`, (value) => {
      fillLight.color.set(value);
      app.lights.updateHelpers();
    });

    createNumberControl("辅助光强度", fillLight.intensity, 0, 12, 0.01, (value) => {
      fillLight.intensity = value;
      app.lights.updateHelpers();
    });

    createVector3Controls("辅助光位置", fillLight.position, {
      min: -20,
      max: 20,
      step: 0.01,
      onAfterChange: () => app.lights.updateHelpers(),
    });

    createVector3Controls("辅助光目标", fillLight.target.position, {
      min: -10,
      max: 10,
      step: 0.01,
      onAfterChange: () => app.lights.updateHelpers(),
    });

    createInfoRow("说明", "辅助光默认不投影，适合补侧光、轮廓光和层次。");
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
