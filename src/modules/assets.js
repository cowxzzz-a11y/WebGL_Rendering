import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export function createAssetsModule(app) {
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath("/basis/")
    .detectSupport(app.runtime.renderer);
  const gltfLoader = new GLTFLoader();
  gltfLoader.setKTX2Loader(ktx2Loader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const rgbeLoader = new RGBELoader();

  function revokeModelObjectURL() {
    if (!app.state.currentModelObjectURL) {
      return;
    }

    URL.revokeObjectURL(app.state.currentModelObjectURL);
    app.state.currentModelObjectURL = null;
  }

  function revokeHDRObjectURL() {
    if (!app.state.currentHDRObjectURL) {
      return;
    }

    URL.revokeObjectURL(app.state.currentHDRObjectURL);
    app.state.currentHDRObjectURL = null;
  }

  function frameModel(root) {
    if (!root) {
      return;
    }

    const { camera, controls } = app.runtime;

    root.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    root.position.x -= center.x;
    root.position.y -= box.min.y;
    root.position.z -= center.z;

    root.updateWorldMatrix(true, true);

    const framedBox = new THREE.Box3().setFromObject(root);
    const sphere = framedBox.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.5);
    const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const distance = radius / Math.tan(halfFov);

    const viewOffset = new THREE.Vector3(1.05, 0.72, 1.28)
      .normalize()
      .multiplyScalar(distance * 1.35);

    camera.near = Math.max(radius / 200, 0.01);
    camera.far = Math.max(radius * 40, 200);
    camera.updateProjectionMatrix();

    camera.position.copy(sphere.center).add(viewOffset);
    controls.target.copy(sphere.center);
    controls.minDistance = Math.max(radius * 0.002, 0.002);
    controls.maxDistance = Math.max(radius * 18, 30);
    camera.lookAt(sphere.center);
    controls.update();
    app.navigation?.syncFromCamera();

    app.lights.fitShadowToObject(root);
    app.renderPipeline?.markDirty({ interaction: true });

    console.log("模型尺寸", Math.max(size.x, size.y, size.z));
  }

  function removeCurrentModel() {
    app.selection.clearSelection();

    if (app.state.currentRoot) {
      app.runtime.scene.remove(app.state.currentRoot);
      app.materials.disposeObject3D(app.state.currentRoot);
      app.state.currentRoot = null;
    }

    if (app.state.fallbackGroup) {
      app.runtime.scene.remove(app.state.fallbackGroup);
      app.materials.disposeObject3D(app.state.fallbackGroup);
      app.state.fallbackGroup = null;
    }

    revokeModelObjectURL();
    app.renderPipeline?.markDirty();
  }

  function frameObject(object) {
    if (!object) {
      return;
    }

    object.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.5);
    const halfFov = THREE.MathUtils.degToRad(app.runtime.camera.fov * 0.5);
    const distance = radius / Math.tan(halfFov);

    const viewOffset = new THREE.Vector3(1.1, 0.82, 1.18)
      .normalize()
      .multiplyScalar(distance * 1.2);

    app.runtime.camera.near = Math.max(radius / 200, 0.01);
    app.runtime.camera.far = Math.max(radius * 40, 200);
    app.runtime.camera.updateProjectionMatrix();

    app.runtime.camera.position.copy(sphere.center).add(viewOffset);
    app.runtime.controls.target.copy(sphere.center);
    app.runtime.controls.minDistance = Math.max(radius * 0.4, 0.2);
    app.runtime.controls.maxDistance = Math.max(radius * 18, 20);
    app.runtime.controls.update();
    app.runtime.camera.lookAt(sphere.center);
    app.navigation?.syncFromCamera();
    app.renderPipeline?.markDirty({ interaction: true });
  }

  function createSimpleDemo() {
    const demoGroup = new THREE.Group();
    demoGroup.name = "内置演示场景";

    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.6, 0.28, 48),
      new THREE.MeshStandardMaterial({
        color: "#e7ddd3",
        roughness: 0.88,
        metalness: 0.02,
      })
    );
    stage.name = "展台";
    stage.position.set(0, 0.14, 0);
    stage.receiveShadow = true;
    stage.castShadow = true;
    demoGroup.add(stage);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(5.8, 72),
      new THREE.MeshStandardMaterial({
        color: "#d1cac2",
        roughness: 0.95,
        metalness: 0,
      })
    );
    ground.name = "地面";
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.castShadow = false;
    demoGroup.add(ground);

    const hero = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.82, 4),
      new THREE.MeshPhysicalMaterial({
        color: "#d08a47",
        roughness: 0.28,
        metalness: 0.18,
        clearcoat: 0.55,
        clearcoatRoughness: 0.18,
        envMapIntensity: 1.35,
      })
    );
    hero.name = "主雕塑";
    hero.position.set(0, 1.1, 0);
    hero.castShadow = true;
    hero.receiveShadow = true;
    demoGroup.add(hero);

    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 48, 48),
      new THREE.MeshPhysicalMaterial({
        color: "#d7efff",
        roughness: 0.08,
        transmission: 0.92,
        thickness: 0.6,
        ior: 1.32,
        envMapIntensity: 1.2,
      })
    );
    glass.name = "玻璃球";
    glass.position.set(-0.86, 0.62, 0.54);
    glass.castShadow = true;
    glass.receiveShadow = true;
    demoGroup.add(glass);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 3.8),
      new THREE.MeshStandardMaterial({
        color: "#c8c1b8",
        roughness: 0.92,
        metalness: 0,
      })
    );
    backdrop.name = "背景板";
    backdrop.position.set(0, 1.9, -2.1);
    backdrop.receiveShadow = true;
    demoGroup.add(backdrop);

    app.materials.prepareModel(demoGroup);

    return {
      demoGroup,
      focusObject: hero,
    };
  }

  function showFallbackDemo() {
    removeCurrentModel();

    const { demoGroup, focusObject } = createSimpleDemo();

    app.state.fallbackGroup = demoGroup;
    app.runtime.scene.add(demoGroup);
    frameModel(demoGroup);
    frameObject(focusObject);
    app.objectManager.refreshObjectManager();
    app.selection.selectObject(focusObject);
    app.status.setModel("已加载内置演示场景");
    app.renderPipeline?.markDirty({ interaction: true, rebuildPathTracer: true });
  }

  function cloneDefaultSceneBackground() {
    const background = app.state.defaultSceneBackground;
    return background?.clone?.() ?? background ?? null;
  }

  function syncHDRLightVisibility(hasHDRLoaded, enabled) {
    const { dirLight } = app.runtime;
    const snapshotKey = "__hdrPreviousVisible";

    if (!hasHDRLoaded) {
      if (snapshotKey in dirLight.userData) {
        dirLight.visible = dirLight.userData[snapshotKey];
        delete dirLight.userData[snapshotKey];
      }
      return;
    }

    if (enabled) {
      if (snapshotKey in dirLight.userData) {
        dirLight.visible = dirLight.userData[snapshotKey];
        delete dirLight.userData[snapshotKey];
      }
      return;
    }

    if (!(snapshotKey in dirLight.userData)) {
      dirLight.userData[snapshotKey] = dirLight.visible;
    }

    dirLight.visible = false;
  }

  function syncHDRToggleButton() {
    const { toggleHDRBtn } = app.dom;

    if (!toggleHDRBtn) {
      return;
    }

    const hasHDRLoaded = Boolean(
      app.state.currentHDRTexture && app.state.currentEnvironmentTarget
    );

    toggleHDRBtn.disabled = !hasHDRLoaded;
    toggleHDRBtn.textContent = app.state.hdrPaused ? "恢复 HDR" : "暂停 HDR";
    toggleHDRBtn.classList.toggle("active", hasHDRLoaded && app.state.hdrPaused);
    toggleHDRBtn.classList.toggle("secondary", !hasHDRLoaded || !app.state.hdrPaused);
  }

  function syncHDRBackgroundButton() {
    const { toggleHDRBackgroundBtn } = app.dom;

    if (!toggleHDRBackgroundBtn) {
      return;
    }

    const hasHDRLoaded = Boolean(
      app.state.currentHDRTexture && app.state.currentEnvironmentTarget
    );
    const backgroundEnabled =
      hasHDRLoaded && !app.state.hdrPaused && app.state.hdrBackgroundVisible;

    toggleHDRBackgroundBtn.disabled = !hasHDRLoaded || app.state.hdrPaused;
    toggleHDRBackgroundBtn.textContent = backgroundEnabled
      ? "隐藏 HDR 背景"
      : "显示 HDR 背景";
    toggleHDRBackgroundBtn.classList.toggle("active", backgroundEnabled);
    toggleHDRBackgroundBtn.classList.toggle("secondary", !backgroundEnabled);
  }

  function applyHDRRotation() {
    const rotationRadians = THREE.MathUtils.degToRad(
      app.state.environmentSettings.hdrRotation ?? 0
    );

    if (app.runtime.scene.backgroundRotation) {
      app.runtime.scene.backgroundRotation.y = rotationRadians;
    }

    if (app.runtime.scene.environmentRotation) {
      app.runtime.scene.environmentRotation.y = rotationRadians;
    }
  }

  function applyHDRPresentation() {
    const hasHDRLoaded = Boolean(
      app.state.currentHDRTexture && app.state.currentEnvironmentTarget
    );
    const hdrEnabled = hasHDRLoaded && !app.state.hdrPaused;

    applyHDRRotation();

    if (hdrEnabled) {
      app.runtime.scene.environment = app.state.currentEnvironmentTarget.texture;
      if (app.state.hdrBackgroundVisible) {
        app.runtime.scene.background = app.state.currentHDRTexture;
        app.runtime.scene.backgroundBlurriness = 0;
        app.runtime.scene.backgroundIntensity = app.state.environmentSettings.backgroundIntensity;
      } else {
        app.runtime.scene.background = cloneDefaultSceneBackground();
        app.runtime.scene.backgroundBlurriness = app.state.defaultSceneBackgroundBlurriness;
        app.runtime.scene.backgroundIntensity = app.state.defaultSceneBackgroundIntensity;
      }
      app.lights.syncEnvironmentLighting(app.state.currentHDRTexture);
    } else {
      app.runtime.scene.environment = null;
      app.runtime.scene.background = cloneDefaultSceneBackground();
      app.runtime.scene.backgroundBlurriness = app.state.defaultSceneBackgroundBlurriness;
      app.runtime.scene.backgroundIntensity = app.state.defaultSceneBackgroundIntensity;
      app.runtime.scene.environmentIntensity = app.state.defaultSceneEnvironmentIntensity;
    }

    syncHDRLightVisibility(hasHDRLoaded, hdrEnabled);
    syncHDRToggleButton();
    syncHDRBackgroundButton();
    app.inspectors.renderInspectors();
    app.renderPipeline?.syncEnvironmentAndLights({ interaction: true });
  }

  function toggleHDRPause(forcePaused = !app.state.hdrPaused) {
    app.state.hdrPaused = Boolean(forcePaused);
    applyHDRPresentation();
  }

  function toggleHDRBackgroundVisibility(forceVisible = !app.state.hdrBackgroundVisible) {
    app.state.hdrBackgroundVisible = Boolean(forceVisible);
    applyHDRPresentation();
  }

  function applyHDRTexture(texture, label) {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const envTarget = app.runtime.pmremGenerator.fromEquirectangular(texture);

    if (app.state.currentEnvironmentTarget) {
      app.state.currentEnvironmentTarget.dispose();
    }

    if (app.state.currentHDRTexture) {
      app.state.currentHDRTexture.dispose();
    }

    app.state.currentEnvironmentTarget = envTarget;
    app.state.currentHDRTexture = texture;

    applyHDRPresentation();
    app.status.setHDR(`已加载 ${label}`);
  }

  function loadHDRFromURL(url, label, isObjectURL = false) {
    app.status.setHDR(`正在加载 ${label}...`);

    rgbeLoader.load(
      url,
      (texture) => {
        applyHDRTexture(texture, label);

        if (isObjectURL) {
          revokeHDRObjectURL();
        }
      },
      undefined,
      (error) => {
        console.error(error);
        app.status.setHDR(`加载失败: ${label}`);

        if (isObjectURL) {
          revokeHDRObjectURL();
        }
      }
    );
  }

  function loadGLBFromURL(url, label, isObjectURL = false) {
    app.status.setModel(`正在加载 ${label}...`);

    gltfLoader.load(
      url,
      (gltf) => {
        removeCurrentModel();

        const model = gltf.scene;
        model.name = label;

        app.materials.prepareModel(model);
        app.state.currentRoot = model;
        app.runtime.scene.add(model);
        frameModel(model);
        app.objectManager.refreshObjectManager();
        app.selection.selectObject(model);
        app.status.setModel(`已加载 ${label}`);
        app.renderPipeline?.markDirty({ interaction: true, rebuildPathTracer: true });

        if (isObjectURL) {
          app.state.currentModelObjectURL = url;
        }
      },
      (event) => {
        if (event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          app.status.setModel(`正在加载 ${label}: ${percent}%`);
        }
      },
      (error) => {
        console.error(error);
        app.status.setModel(`加载失败: ${label}`);

        if (isObjectURL) {
          revokeModelObjectURL();
        } else {
          showFallbackDemo();
        }
      }
    );
  }

  return {
    revokeModelObjectURL,
    revokeHDRObjectURL,
    frameModel,
    frameObject,
    removeCurrentModel,
    showFallbackDemo,
    applyHDRTexture,
    applyHDRPresentation,
    loadHDRFromURL,
    loadGLBFromURL,
    syncHDRToggleButton,
    syncHDRBackgroundButton,
    toggleHDRPause,
    toggleHDRBackgroundVisibility,
  };
}
