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
    controls.update();
    app.navigation?.syncFromCamera();

    app.lights.fitShadowToObject(root);

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
    app.navigation?.syncFromCamera();
  }

  function createSimpleDemo() {
    const demoGroup = new THREE.Group();
    demoGroup.name = "内置立方体示例";

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshStandardMaterial({
        color: "#d7d2cb",
        roughness: 0.94,
        metalness: 0.01,
      })
    );
    ground.name = "地面";
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    demoGroup.add(ground);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhysicalMaterial({
        color: "#c98b4a",
        roughness: 0.38,
        metalness: 0.04,
        clearcoat: 0.18,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1,
      })
    );
    cube.name = "立方体";
    cube.position.set(0, 0.5, 0);
    cube.rotation.set(0, Math.PI * 0.18, 0);
    cube.castShadow = true;
    cube.receiveShadow = true;
    demoGroup.add(cube);

    app.materials.prepareModel(demoGroup);
    ground.castShadow = false;

    return {
      demoGroup,
      focusObject: cube,
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
    app.status.setModel("已加载内置立方体示例");
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

    app.runtime.scene.environment = envTarget.texture;
    app.runtime.scene.background = texture;
    app.runtime.scene.backgroundBlurriness = 0.85;
    app.runtime.scene.backgroundIntensity = 0.55;

    app.status.setHDR(`已加载 ${label}`);
    app.inspectors.renderInspectors();
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
    removeCurrentModel,
    showFallbackDemo,
    applyHDRTexture,
    loadHDRFromURL,
    loadGLBFromURL,
  };
}
