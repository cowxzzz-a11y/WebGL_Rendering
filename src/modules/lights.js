import * as THREE from "three";

const SHADOW_MAP_TYPES = {
  basic: THREE.BasicShadowMap,
  pcf: THREE.PCFShadowMap,
  pcfSoft: THREE.PCFSoftShadowMap,
  vsm: THREE.VSMShadowMap,
};

export function createLightsModule(app) {
  function markShadowDirty() {
    app.runtime.renderer.shadowMap.needsUpdate = true;
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

  function updateHelpers() {
    app.runtime.dirLightHelper.update();
    app.runtime.fillLightHelper.update();
    app.runtime.shadowCameraHelper.update();
  }

  function setHelpersVisible({
    mainHelper = app.runtime.dirLightHelper.visible,
    fillHelper = app.runtime.fillLightHelper.visible,
    shadowHelper = app.runtime.shadowCameraHelper.visible,
  } = {}) {
    app.runtime.dirLightHelper.visible = mainHelper;
    app.runtime.fillLightHelper.visible = fillHelper;
    app.runtime.shadowCameraHelper.visible = shadowHelper;
    updateHelpers();
  }

  function fitShadowToObject(root) {
    if (!root || !app.state.lightSettings.autoFitShadowToModel) {
      updateHelpers();
      return;
    }

    root.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.6);
    const padding = app.state.lightSettings.shadowFitPadding;
    const range = radius * padding;

    app.runtime.dirLight.target.position.copy(sphere.center);
    app.runtime.fillLight.target.position.copy(sphere.center);

    app.runtime.dirLight.shadow.camera.left = -range;
    app.runtime.dirLight.shadow.camera.right = range;
    app.runtime.dirLight.shadow.camera.top = range;
    app.runtime.dirLight.shadow.camera.bottom = -range;
    app.runtime.dirLight.shadow.camera.near = 0.1;
    app.runtime.dirLight.shadow.camera.far = Math.max(radius * 10, 18);
    app.runtime.dirLight.shadow.camera.updateProjectionMatrix();

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

  function attachFillLight() {
    app.selection.selectObject(app.runtime.fillLight);
    app.inspectors.switchInspectorTab("lights");
  }

  function attachFillTarget() {
    app.selection.selectObject(app.runtime.fillLight.target);
    app.inspectors.switchInspectorTab("lights");
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
    attachFillLight,
    attachFillTarget,
  };
}
