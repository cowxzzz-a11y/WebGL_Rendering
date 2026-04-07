import * as THREE from "three";

const SHADOW_MAP_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  pcfSoft: THREE.PCFSoftShadowMap,
  vsm: THREE.VSMShadowMap,
};

const TEMP_BOX = new THREE.Box3();
const TEMP_SPHERE = new THREE.Sphere();
const TEMP_CENTER = new THREE.Vector3();

function rgbToLuminance(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function readHDRPixel(data, index, isRGBE) {
  if (isRGBE) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const e = data[index + 3];
    const scale = Math.pow(2, e - 128) / 255;
    return { r: r * scale, g: g * scale, b: b * scale };
  }

  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
  };
}

function directionFromEquirectUV(u, v) {
  const phi = (u - 0.5) * Math.PI * 2;
  const theta = v * Math.PI;
  const sinTheta = Math.sin(theta);

  return new THREE.Vector3(
    sinTheta * Math.cos(phi),
    Math.cos(theta),
    sinTheta * Math.sin(phi)
  ).normalize();
}

export function createLightsModule(app) {
  function markShadowDirty() {
    app.runtime.renderer.shadowMap.needsUpdate = true;
    app.renderPipeline?.markDirty();
  }

  function updateHelpers() {
    app.runtime.dirLightHelper.update();
    app.runtime.areaLight.lookAt(app.runtime.areaLightTarget.position);
    if (app.runtime.areaLightHelper?.updateMatrixWorld) {
      app.runtime.areaLightHelper.updateMatrixWorld(true);
    }
    app.runtime.fillLightHelper.update();
    app.runtime.shadowCameraHelper.update();
  }

  function getSceneFocus(root = app.objectManager.getActiveRoot()) {
    if (!root) {
      return {
        center: new THREE.Vector3(0, 0.8, 0),
        radius: 2.5,
      };
    }

    root.updateWorldMatrix(true, true);
    TEMP_BOX.setFromObject(root);
    TEMP_BOX.getBoundingSphere(TEMP_SPHERE);

    return {
      center: TEMP_SPHERE.center.clone(),
      radius: Math.max(TEMP_SPHERE.radius, 0.8),
    };
  }

  function getShadowMapTypeValue() {
    const currentType = app.runtime.renderer.shadowMap.type;

    for (const [key, value] of Object.entries(SHADOW_MAP_TYPES)) {
      if (value === currentType) {
        return key;
      }
    }

    return "pcfSoft";
  }

  function setShadowMapType(typeKey) {
    app.runtime.renderer.shadowMap.type =
      SHADOW_MAP_TYPES[typeKey] || THREE.PCFSoftShadowMap;
    markShadowDirty();
    updateHelpers();
  }

  function setHelpersVisible({
    mainHelper = app.runtime.dirLightHelper.visible,
    areaHelper = app.runtime.areaLightHelper.visible,
    fillHelper = app.runtime.fillLightHelper.visible,
    shadowHelper = app.runtime.shadowCameraHelper.visible,
  } = {}) {
    app.runtime.dirLightHelper.visible = mainHelper;
    app.runtime.areaLightHelper.visible = areaHelper;
    app.runtime.fillLightHelper.visible = fillHelper;
    app.runtime.shadowCameraHelper.visible = shadowHelper;
    updateHelpers();
    app.renderPipeline?.markDirty();
  }

  function fitShadowToObject(root) {
    if (!root) {
      updateHelpers();
      return;
    }

    const { center, radius } = getSceneFocus(root);
    const padding = app.state.lightSettings.shadowFitPadding;
    const range = radius * padding;

    app.runtime.dirLight.target.position.copy(center);
    app.runtime.fillLight.target.position.copy(center);
    app.runtime.areaLight.lookAt(app.runtime.areaLightTarget.position);

    if (app.state.lightSettings.autoFitShadowToModel) {
      app.runtime.dirLight.shadow.camera.left = -range;
      app.runtime.dirLight.shadow.camera.right = range;
      app.runtime.dirLight.shadow.camera.top = range;
      app.runtime.dirLight.shadow.camera.bottom = -range;
      app.runtime.dirLight.shadow.camera.near = 0.1;
      app.runtime.dirLight.shadow.camera.far = Math.max(radius * 10, 18);
      app.runtime.dirLight.shadow.camera.updateProjectionMatrix();
    }

    updateHelpers();
    markShadowDirty();
  }

  function setLightMapSize(light, size) {
    light.shadow.mapSize.set(size, size);

    if (light.shadow.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
    }

    markShadowDirty();
    updateHelpers();
  }

  function attachMainLight() {
    app.selection.selectObject(app.runtime.dirLight);
    app.inspectors.switchInspectorTab("lights");
  }

  function attachMainTarget() {
    app.selection.selectObject(app.runtime.dirLight.target);
    app.inspectors.switchInspectorTab("lights");
  }

  function attachAreaLight() {
    app.selection.selectObject(app.runtime.areaLight);
    app.inspectors.switchInspectorTab("lights");
  }

  function attachAreaTarget() {
    app.selection.selectObject(app.runtime.areaLightTarget);
    app.inspectors.switchInspectorTab("lights");
  }

  function attachFillLight() {
    app.selection.selectObject(app.runtime.fillLight);
    app.inspectors.switchInspectorTab("lights");
  }

  function attachFillTarget() {
    app.selection.selectObject(app.runtime.fillLight.target);
    app.inspectors.switchInspectorTab("lights");
  }

  function extractDominantDirection(texture) {
    const data = texture?.image?.data;
    const width = texture?.image?.width ?? 0;
    const height = texture?.image?.height ?? 0;

    if (!data || !width || !height) {
      return null;
    }

    const isRGBE =
      texture.type === THREE.UnsignedByteType ||
      data instanceof Uint8Array ||
      data instanceof Uint8ClampedArray;

    let bestDirection = null;
    let bestColor = new THREE.Color("#ffffff");
    let bestLuminance = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const pixel = readHDRPixel(data, index, isRGBE);
        const luminance = rgbToLuminance(pixel.r, pixel.g, pixel.b);

        if (luminance <= bestLuminance) {
          continue;
        }

        bestLuminance = luminance;
        bestDirection = directionFromEquirectUV(
          (x + 0.5) / width,
          (y + 0.5) / height
        );

        const normalizer = Math.max(pixel.r, pixel.g, pixel.b, 1e-6);
        bestColor = new THREE.Color(
          pixel.r / normalizer,
          pixel.g / normalizer,
          pixel.b / normalizer
        );
      }
    }

    if (!bestDirection) {
      return null;
    }

    return {
      direction: bestDirection,
      color: bestColor,
      luminance: bestLuminance,
    };
  }

  function syncEnvironmentLighting(texture) {
    const settings = app.state.environmentSettings;

    app.runtime.scene.environmentIntensity = settings.environmentIntensity;
    app.runtime.scene.backgroundIntensity = settings.backgroundIntensity;

    if (!settings.autoSunFromHDR || !texture) {
      app.renderPipeline?.markDirty();
      return;
    }

    const dominant = extractDominantDirection(texture);
    if (!dominant) {
      app.renderPipeline?.markDirty();
      return;
    }

    const { center, radius } = getSceneFocus();
    const distance = Math.max(radius * settings.sunDistanceFactor, 8);

    app.runtime.dirLight.position.copy(center).addScaledVector(dominant.direction, distance);
    app.runtime.dirLight.target.position.copy(center);
    app.runtime.dirLight.color.copy(dominant.color).lerp(new THREE.Color("#ffffff"), 0.18);
    app.runtime.dirLight.intensity = THREE.MathUtils.clamp(
      (1.2 + Math.log2(dominant.luminance + 1)) * settings.sunBoost,
      0.8,
      10
    );

    TEMP_CENTER.copy(dominant.direction).multiplyScalar(-radius * 0.18);
    app.runtime.areaLightTarget.position.copy(center).add(TEMP_CENTER).setY(center.y + radius * 0.15);

    updateHelpers();
    fitShadowToObject(app.objectManager.getActiveRoot());
    app.renderPipeline?.markDirty();
  }

  return {
    getShadowMapTypeValue,
    setShadowMapType,
    updateHelpers,
    setHelpersVisible,
    fitShadowToObject,
    setLightMapSize,
    attachMainLight,
    attachMainTarget,
    attachAreaLight,
    attachAreaTarget,
    attachFillLight,
    attachFillTarget,
    syncEnvironmentLighting,
  };
}
