import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RectAreaLightHelper } from "three/addons/helpers/RectAreaLightHelper.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { PhysicalSpotLight } from "../../案例——请抄袭它两/three-gpu-pathtracer/src/objects/PhysicalSpotLight.js";

export function createSceneRuntime(appElement) {
  RectAreaLightUniformsLib.init();
  const overlayLayer = 31;

  function assignOverlayLayer(object) {
    if (!object) {
      return;
    }

    if (typeof object.traverse === "function") {
      object.traverse((child) => {
        child.layers.set(overlayLayer);
      });
      return;
    }

    object.layers?.set?.(overlayLayer);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.autoClear = true;

  appElement.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d8d6d3");
  scene.backgroundIntensity = 0.35;
  scene.backgroundBlurriness = 0.82;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.01,
    200
  );
  camera.position.set(4.2, 2.8, 5.8);
  camera.layers.enable(overlayLayer);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableRotate = false;
  controls.enableZoom = true;
  controls.target.set(0, 0.8, 0);
  controls.minDistance = 0.01;
  controls.maxDistance = 60;
  controls.zoomSpeed = 1.1;
  controls.rotateSpeed = 0.65;
  controls.mouseButtons.LEFT = null;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = null;

  const transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setMode("translate");
  transformControls.enabled = true;
  transformControls.visible = false;
  const transformControlsHelper = transformControls.getHelper();
  transformControlsHelper.visible = false;
  assignOverlayLayer(transformControlsHelper);
  scene.add(transformControlsHelper);

  const selectionBox = new THREE.BoxHelper();
  selectionBox.visible = false;
  selectionBox.renderOrder = 999;
  selectionBox.material.depthTest = false;
  selectionBox.material.transparent = true;
  selectionBox.material.opacity = 1;
  selectionBox.material.color.set("#ffd54a");
  assignOverlayLayer(selectionBox);
  scene.add(selectionBox);

  transformControls.addEventListener("dragging-changed", (event) => {
    controls.enabled = !event.value && !controls.userData.flyActive;
  });

  const hemiLight = new THREE.HemisphereLight("#ffffff", "#8b97a8", 0.08);
  hemiLight.name = "环境半球光";
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight("#ffffff", 1.2);
  dirLight.name = "HDR 主方向光";
  dirLight.position.set(4.5, 7.5, 6);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(4096, 4096);
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 24;
  dirLight.shadow.camera.left = -3.5;
  dirLight.shadow.camera.right = 3.5;
  dirLight.shadow.camera.top = 3.5;
  dirLight.shadow.camera.bottom = -3.5;
  dirLight.shadow.bias = -0.00015;
  dirLight.shadow.normalBias = 0.015;
  dirLight.shadow.radius = 1.4;
  dirLight.target.name = "HDR 主方向光目标";
  dirLight.target.position.set(0, 0.6, 0);
  scene.add(dirLight);
  scene.add(dirLight.target);

  const areaLightTarget = new THREE.Object3D();
  areaLightTarget.name = "主面光目标";
  areaLightTarget.position.set(0, 1, 0);
  scene.add(areaLightTarget);

  const areaLight = new THREE.RectAreaLight("#ffe0b5", 6, 2.8, 2.4);
  areaLight.name = "主面光";
  areaLight.position.set(2.8, 2.35, 1.6);
  areaLight.lookAt(areaLightTarget.position);
  areaLight.visible = false;
  scene.add(areaLight);

  const fillLight = new PhysicalSpotLight(
    "#e6edf6",
    5.5,
    18,
    Math.PI / 5.5,
    0.42,
    2
  );
  fillLight.name = "辅助方向光";
  fillLight.position.set(-2.4, 3.25, 2.75);
  fillLight.angle = Math.PI / 5.5;
  fillLight.penumbra = 0.42;
  fillLight.distance = 18;
  fillLight.decay = 2;
  fillLight.radius = 0.08;
  fillLight.castShadow = false;
  fillLight.visible = false;
  fillLight.target.name = "辅助方向光目标";
  fillLight.target.position.set(-0.15, 0.95, 0.15);
  scene.add(fillLight);
  scene.add(fillLight.target);

  const dirLightHelper = new THREE.DirectionalLightHelper(
    dirLight,
    0.8,
    "#f59e0b"
  );
  dirLightHelper.visible = false;
  assignOverlayLayer(dirLightHelper);
  scene.add(dirLightHelper);

  const areaLightHelper = new RectAreaLightHelper(areaLight, "#f97316");
  areaLightHelper.visible = false;
  assignOverlayLayer(areaLightHelper);
  scene.add(areaLightHelper);

  const fillLightHelper = new THREE.SpotLightHelper(fillLight, "#38bdf8");
  fillLightHelper.visible = false;
  assignOverlayLayer(fillLightHelper);
  scene.add(fillLightHelper);

  const shadowCameraHelper = new THREE.CameraHelper(dirLight.shadow.camera);
  shadowCameraHelper.visible = false;
  assignOverlayLayer(shadowCameraHelper);
  scene.add(shadowCameraHelper);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  return {
    THREE,
    renderer,
    scene,
    camera,
    overlayLayer,
    controls,
    transformControls,
    transformControlsHelper,
    selectionBox,
    hemiLight,
    dirLight,
    areaLight,
    areaLightTarget,
    fillLight,
    dirLightHelper,
    areaLightHelper,
    fillLightHelper,
    shadowCameraHelper,
    pathTracingExcludedObjects: [
      transformControlsHelper,
      selectionBox,
      dirLightHelper,
      areaLightHelper,
      fillLightHelper,
      shadowCameraHelper,
    ],
    pmremGenerator,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
  };
}
