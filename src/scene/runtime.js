import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export function createSceneRuntime(appElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  appElement.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d8d6d3");

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.01,
    200
  );
  camera.position.set(4.2, 2.8, 5.8);

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
  scene.add(transformControls);

  const selectionBox = new THREE.BoxHelper();
  selectionBox.visible = false;
  selectionBox.renderOrder = 999;
  selectionBox.material.depthTest = false;
  selectionBox.material.transparent = true;
  selectionBox.material.opacity = 1;
  selectionBox.material.color.set("#ffd54a");
  scene.add(selectionBox);

  transformControls.addEventListener("dragging-changed", (event) => {
    controls.enabled = !event.value && !controls.userData.flyActive;
  });

  const hemiLight = new THREE.HemisphereLight("#ffffff", "#8b97a8", 0.42);
  hemiLight.name = "主半球光";
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight("#ffffff", 2.1);
  dirLight.name = "主平行光";
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
  dirLight.target.name = "主平行光目标";
  dirLight.target.position.set(0, 0.6, 0);
  scene.add(dirLight);
  scene.add(dirLight.target);

  const fillLight = new THREE.DirectionalLight("#e6edf6", 0.7);
  fillLight.name = "辅助平行光";
  fillLight.position.set(-3.5, 4.5, -2.5);
  fillLight.castShadow = false;
  fillLight.visible = false;
  fillLight.target.name = "辅助平行光目标";
  fillLight.target.position.set(0, 0.6, 0);
  scene.add(fillLight);
  scene.add(fillLight.target);

  const dirLightHelper = new THREE.DirectionalLightHelper(
    dirLight,
    0.8,
    "#f59e0b"
  );
  dirLightHelper.visible = false;
  scene.add(dirLightHelper);

  const fillLightHelper = new THREE.DirectionalLightHelper(
    fillLight,
    0.7,
    "#38bdf8"
  );
  fillLightHelper.visible = false;
  scene.add(fillLightHelper);

  const shadowCameraHelper = new THREE.CameraHelper(dirLight.shadow.camera);
  shadowCameraHelper.visible = false;
  scene.add(shadowCameraHelper);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  return {
    THREE,
    renderer,
    scene,
    camera,
    controls,
    transformControls,
    selectionBox,
    hemiLight,
    dirLight,
    fillLight,
    dirLightHelper,
    fillLightHelper,
    shadowCameraHelper,
    pmremGenerator,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
  };
}
