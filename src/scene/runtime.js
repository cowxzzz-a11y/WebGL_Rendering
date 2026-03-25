import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export function createSceneRuntime(appElement) {
  // 渲染器负责把 Three.js 场景真正画到浏览器里。
  // antialias 开启后，模型边缘会平滑一些。
  const renderer = new THREE.WebGLRenderer({ antialias: true });

  // 先让渲染尺寸铺满整个窗口。
  renderer.setSize(window.innerWidth, window.innerHeight);

  // 限制像素比，避免高分屏下性能开销过大。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 开启阴影。
  renderer.shadowMap.enabled = true;

  // 这里默认用更柔和、兼容性也比较稳的 PCFSoftShadowMap。
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 输出颜色空间使用 sRGB，避免颜色发灰。
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // HDR 场景常用的色调映射和曝光。
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  appElement.appendChild(renderer.domElement);

  // Scene 是整个 3D 世界的根容器。
  const scene = new THREE.Scene();

  // HDR 还没加载前先给一个纯色背景。
  scene.background = new THREE.Color("#dbeafe");

  // 透视相机：FOV、宽高比、近裁剪面、远裁剪面。
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.01,
    200
  );
  camera.position.set(4, 3, 6);

  // 鼠标轨道控制器：左键旋转、滚轮缩放、右键平移。
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.8, 0);
  controls.minDistance = 0.2;
  controls.maxDistance = 60;

  // 物体移动 gizmo。
  const transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.setMode("translate");
  transformControls.enabled = true;
  transformControls.visible = false;
  scene.add(transformControls);

  // 拖动物体时先临时关闭 OrbitControls，避免抢输入。
  transformControls.addEventListener("dragging-changed", (event) => {
    controls.enabled = !event.value;
  });

  // 半球光负责整体基础补光，防止背光面死黑。
  const hemiLight = new THREE.HemisphereLight("#ffffff", "#8090a0", 0.35);
  hemiLight.name = "主半球光";
  scene.add(hemiLight);

  // 主平行光：负责主要明暗关系和阴影。
  const dirLight = new THREE.DirectionalLight("#ffffff", 2.2);
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

  // 辅助平行光：默认关闭，用来从另一侧补一点轮廓光或层次。
  const fillLight = new THREE.DirectionalLight("#dbeafe", 0.8);
  fillLight.name = "辅助平行光";
  fillLight.position.set(-3.5, 4.5, -2.5);
  fillLight.castShadow = false;
  fillLight.visible = false;
  fillLight.target.name = "辅助平行光目标";
  fillLight.target.position.set(0, 0.6, 0);
  scene.add(fillLight);
  scene.add(fillLight.target);

  // 帮助线默认隐藏，需要时再打开。
  const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 0.8, "#f59e0b");
  dirLightHelper.visible = false;
  scene.add(dirLightHelper);

  const fillLightHelper = new THREE.DirectionalLightHelper(fillLight, 0.7, "#38bdf8");
  fillLightHelper.visible = false;
  scene.add(fillLightHelper);

  const shadowCameraHelper = new THREE.CameraHelper(dirLight.shadow.camera);
  shadowCameraHelper.visible = false;
  scene.add(shadowCameraHelper);

  // PMREMGenerator 会把 HDR 转成适合 PBR 材质采样的环境贴图。
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  return {
    THREE,
    renderer,
    scene,
    camera,
    controls,
    transformControls,
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
