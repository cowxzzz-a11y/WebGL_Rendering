import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export function createAssetsModule(app) {
  const gltfLoader = new GLTFLoader();
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

    const viewOffset = new THREE.Vector3(1, 0.6, 1.2)
      .normalize()
      .multiplyScalar(distance * 1.35);

    camera.near = Math.max(radius / 200, 0.01);
    camera.far = Math.max(radius * 40, 200);
    camera.updateProjectionMatrix();

    camera.position.copy(sphere.center).add(viewOffset);
    controls.target.copy(sphere.center);
    controls.minDistance = Math.max(radius * 0.08, 0.08);
    controls.maxDistance = Math.max(radius * 12, 30);
    controls.update();

    app.lights.fitShadowToObject(root);

    console.log("模型最大尺寸", Math.max(size.x, size.y, size.z));
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

  function showFallbackDemo() {
    removeCurrentModel();

    const fallbackGroup = new THREE.Group();
    fallbackGroup.name = "内置示例";

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({
        color: "#cbd5e1",
        roughness: 1,
        metalness: 0,
      })
    );
    floor.name = "示例地面";
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    app.materials.rememberOriginalMaterial(floor);
    fallbackGroup.add(floor);

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: "#f97316",
        roughness: 0.45,
        metalness: 0.05,
      })
    );
    cube.name = "示例立方体";
    cube.position.y = 0.5;
    cube.castShadow = true;
    cube.receiveShadow = true;
    app.materials.rememberOriginalMaterial(cube);
    fallbackGroup.add(cube);

    const grid = new THREE.GridHelper(12, 12, "#64748b", "#94a3b8");
    grid.name = "示例网格";
    grid.position.y = 0.001;
    fallbackGroup.add(grid);

    app.state.fallbackGroup = fallbackGroup;
    app.runtime.scene.add(fallbackGroup);
    frameModel(fallbackGroup);
    app.objectManager.refreshObjectManager();
    app.selection.clearSelection();
    app.status.setModel("当前显示的是内置示例。");
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
    app.runtime.scene.backgroundBlurriness = 0.2;
    app.runtime.scene.backgroundIntensity = 1;

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
        app.status.setHDR(`加载失败：${label}`);

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
          app.status.setModel(`正在加载 ${label}：${percent}%`);
        }
      },
      (error) => {
        console.error(error);
        app.status.setModel(`加载失败：${label}`);

        if (isObjectURL) {
          revokeModelObjectURL();
        } else if (label === "assets/scene.glb") {
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
