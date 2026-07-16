/* global BABYLON */
(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const scoreElement = document.getElementById('score');
  const intro = document.getElementById('intro');
  const complete = document.getElementById('complete');
  const motionButton = document.getElementById('motionButton');
  const startButton = document.getElementById('startButton');
  const restartButton = document.getElementById('restartButton');
  const againButton = document.getElementById('againButton');
  const recenterButton = document.getElementById('recenterButton');
  const autoPlayButton = document.getElementById('autoPlayButton');
  const touchHint = document.getElementById('touchHint');
  const renderError = document.getElementById('renderError');

  const BOARD_RADIUS = 5.65;
  const BALL_RADIUS = 0.32;
  const TARGET_RADIUS = 0.31;
  const physics = {
    acceleration: 8.0,
    damping: 0.3,
    maxSpeed: 7.0,
    edgeRestitution: 0.58,
    targetRestitution: 0.42,
  };
  const engine = new BABYLON.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.035, 0.027, 0.022, 1);
  scene.ambientColor = new BABYLON.Color3(0.28, 0.22, 0.16);

  // A top-down orthographic view keeps the compass perfectly circular on every screen ratio.
  const camera = new BABYLON.ArcRotateCamera('camera', -Math.PI / 2, 0.001, 20.6, new BABYLON.Vector3(0, 0, 0), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.lowerRadiusLimit = camera.upperRadiusLimit = 20.6;
  camera.lowerBetaLimit = camera.upperBetaLimit = 0.001;
  camera.lowerAlphaLimit = camera.upperAlphaLimit = -Math.PI / 2;
  camera.inputs.clear();
  camera.attachControl(canvas, false);

  function fitCameraToViewport() {
    const aspect = Math.max(engine.getRenderWidth() / Math.max(engine.getRenderHeight(), 1), .1);
    // Landscape reserves room for both control rails; portrait still remains playable.
    const verticalSize = aspect >= 1 ? 15.4 : 13.2 / aspect;
    const horizontalSize = verticalSize * aspect;
    camera.orthoLeft = -horizontalSize / 2;
    camera.orthoRight = horizontalSize / 2;
    camera.orthoTop = verticalSize / 2;
    camera.orthoBottom = -verticalSize / 2;
  }
  fitCameraToViewport();

  const shadowGenerator = new BABYLON.ShadowGenerator(1024, new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.25, -1, 0.32), scene));
  shadowGenerator.getLight().position = new BABYLON.Vector3(3, 8, -4);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurKernel = 24;
  shadowGenerator.darkness = 0.35;

  const fill = new BABYLON.HemisphericLight('fill', new BABYLON.Vector3(0, 1, 0), scene);
  fill.intensity = 1.1;
  fill.diffuse = new BABYLON.Color3(0.76, 0.62, 0.46);
  fill.groundColor = new BABYLON.Color3(0.08, 0.055, 0.035);

  const createPbr = (name, color, metallic, roughness) => {
    const material = new BABYLON.PBRMaterial(name, scene);
    material.albedoColor = color;
    material.metallic = metallic;
    material.roughness = roughness;
    material.environmentIntensity = 0.5;
    return material;
  };

  const brass = createPbr('aged brass', new BABYLON.Color3(0.24, 0.18, 0.11), 0.76, 0.44);
  const brassLight = createPbr('edge brass', new BABYLON.Color3(0.47, 0.33, 0.17), 0.79, 0.33);
  const ink = createPbr('ink', new BABYLON.Color3(0.09, 0.067, 0.052), 0.25, 0.64);
  const playerMaterial = createPbr('silver spirit', new BABYLON.Color3(0.49, 0.52, 0.52), 0.76, 0.2);
  playerMaterial.clearCoat.isEnabled = true;
  playerMaterial.clearCoat.intensity = 0.55;

  function makeRing(name, diameter, height, y, material) {
    const ring = BABYLON.MeshBuilder.CreateTorus(name, { diameter, thickness: height, tessellation: 96 }, scene);
    ring.position.y = y;
    ring.material = material;
    ring.receiveShadows = true;
    return ring;
  }

  const base = BABYLON.MeshBuilder.CreateCylinder('compass base', { diameter: BOARD_RADIUS * 2, height: 0.34, tessellation: 96 }, scene);
  base.position.y = -0.22;
  base.material = brass;
  base.receiveShadows = true;
  makeRing('outer raised rim', 11.32, 0.18, 0.02, brassLight);
  makeRing('outer inner rim', 10.6, 0.10, 0.045, ink);
  makeRing('character rim 1', 8.85, 0.055, 0.025, brassLight);
  makeRing('character rim 2', 7.5, 0.055, 0.025, brassLight);
  makeRing('central rim', 4.3, 0.16, 0.06, brassLight);
  makeRing('central rim dark', 3.88, 0.1, 0.075, ink);

  const disc = BABYLON.MeshBuilder.CreateDisc('engraved compass', { radius: 5.18, tessellation: 128 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 0.005;
  disc.material = createCompassTexture();
  disc.receiveShadows = true;

  const centerDisc = BABYLON.MeshBuilder.CreateCylinder('center plate', { diameter: 3.55, height: 0.07, tessellation: 72 }, scene);
  centerDisc.position.y = 0.065;
  centerDisc.material = createPbr('center plate', new BABYLON.Color3(0.16, 0.135, 0.1), 0.59, 0.4);
  centerDisc.receiveShadows = true;
  createCenterMarks();

  const player = BABYLON.MeshBuilder.CreateSphere('spirit orb', { diameter: BALL_RADIUS * 2, segments: 32 }, scene);
  player.material = playerMaterial;
  player.position.y = BALL_RADIUS + 0.07;
  shadowGenerator.addShadowCaster(player);

  const playerHalo = BABYLON.MeshBuilder.CreateTorus('spirit halo', { diameter: 0.84, thickness: 0.028, tessellation: 40 }, scene);
  playerHalo.position.y = 0.1;
  const haloMaterial = new BABYLON.StandardMaterial('spirit halo material', scene);
  haloMaterial.emissiveColor = new BABYLON.Color3(0.45, 0.48, 0.44);
  haloMaterial.alpha = 0.45;
  playerHalo.material = haloMaterial;

  const glow = new BABYLON.GlowLayer('glow', scene, { blurKernelSize: 32 });
  glow.intensity = 0.46;
  const targets = [];
  const velocity = new BABYLON.Vector2(0, 0);
  let tilt = new BABYLON.Vector2(0, 0);
  let tiltBaseline = new BABYLON.Vector2(0, 0);
  let usingMotion = false;
  let motionCalibrated = false;
  let calibrationPending = false;
  let touchActive = false;
  let touchTarget = null;
  let autoPlaying = new URLSearchParams(window.location.search).get('autoplay') === '1';
  let started = false;
  let wakeCount = 0;
  let lastTime = performance.now();

  const parameterBindings = [
    ['tiltForce', 'tiltForceValue', 'acceleration'],
    ['rollingDamping', 'rollingDampingValue', 'damping'],
    ['maxSpeed', 'maxSpeedValue', 'maxSpeed'],
    ['edgeBounce', 'edgeBounceValue', 'edgeRestitution'],
    ['targetBounce', 'targetBounceValue', 'targetRestitution'],
  ];
  parameterBindings.forEach(([inputId, outputId, property]) => {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    input.addEventListener('input', () => {
      physics[property] = Number(input.value);
      output.value = input.value;
      output.textContent = input.value;
    });
  });

  function createCompassTexture() {
    const texture = new BABYLON.DynamicTexture('compass inscriptions', { width: 2048, height: 2048 }, scene, false);
    const ctx = texture.getContext();
    const size = 2048;
    const c = size / 2;
    const r = (value) => value * size / 11.6;
    ctx.clearRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(c, c, r(1), c, c, r(5.2));
    gradient.addColorStop(0, '#2c251b');
    gradient.addColorStop(.68, '#1b1612');
    gradient.addColorStop(1, '#251d15');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(c, c, r(5.18), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(168,130,68,.38)'; ctx.lineWidth = 3;
    [1.85, 2.36, 3.74, 4.43, 5.04].forEach((radius) => { ctx.beginPath(); ctx.arc(c, c, r(radius), 0, Math.PI * 2); ctx.stroke(); });
    const drawTicks = (count, radius, length, opacity) => {
      ctx.strokeStyle = `rgba(179,141,75,${opacity})`; ctx.lineWidth = 3;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r(radius - length), c + Math.sin(a) * r(radius - length));
        ctx.lineTo(c + Math.cos(a) * r(radius), c + Math.sin(a) * r(radius));
        ctx.stroke();
      }
    };
    drawTicks(64, 4.96, .16, .5); drawTicks(24, 4.22, .37, .42); drawTicks(12, 3.46, .84, .46);
    const labels = ['乾', '坎', '艮', '震', '巽', '离', '坤', '兑', '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < labels.length; i++) {
      const a = (i / labels.length) * Math.PI * 2 - Math.PI / 2;
      const radius = i < 8 ? 3.08 : (i % 2 ? 4.6 : 4.12);
      ctx.save(); ctx.translate(c + Math.cos(a) * r(radius), c + Math.sin(a) * r(radius)); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = i < 8 ? 'rgba(193,151,80,.48)' : 'rgba(167,130,72,.42)';
      ctx.font = i < 8 ? '42px serif' : '31px serif'; ctx.fillText(labels[i], 0, 0); ctx.restore();
    }
    ctx.fillStyle = 'rgba(112,81,42,.35)'; ctx.font = '27px serif';
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; ctx.fillText(['天', '地', '玄', '黄'][i % 4], c + Math.cos(a) * r(4.72), c + Math.sin(a) * r(4.72)); }
    texture.hasAlpha = true; texture.update();
    const material = new BABYLON.StandardMaterial('compass texture material', scene);
    material.diffuseTexture = texture; material.specularColor = new BABYLON.Color3(0.12, 0.09, 0.05); material.emissiveColor = new BABYLON.Color3(0.04, 0.031, 0.02);
    return material;
  }

  function createCenterMarks() {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const mark = BABYLON.MeshBuilder.CreateBox(`center glyph ${i}`, { width: .10, height: .035, depth: .46 }, scene);
      mark.position.set(Math.cos(angle) * 1.22, .12, Math.sin(angle) * 1.22);
      mark.rotation.y = -angle;
      const material = new BABYLON.StandardMaterial(`glyph material ${i}`, scene);
      material.emissiveColor = new BABYLON.Color3(0.72, 0.42, 0.08);
      material.diffuseColor = new BABYLON.Color3(0.45, 0.24, 0.04);
      mark.material = material;
    }
  }

  function createTarget(index, position) {
    const orb = BABYLON.MeshBuilder.CreateSphere(`star ${index}`, { diameter: TARGET_RADIUS * 2, segments: 28 }, scene);
    orb.position.set(position.x, TARGET_RADIUS + 0.075, position.z);
    // Each target owns its material so waking one target cannot light all four.
    orb.material = createPbr(`sleeping star material ${index}`, new BABYLON.Color3(0.64, 0.4, 0.075), 0.79, 0.28);
    shadowGenerator.addShadowCaster(orb);
    const ring = BABYLON.MeshBuilder.CreateTorus(`star ring ${index}`, { diameter: .86, thickness: .025, tessellation: 40 }, scene);
    ring.position.set(position.x, .095, position.z);
    ring.material = createPbr(`ring ${index}`, new BABYLON.Color3(.33, .22, .08), .62, .33);
    targets.push({ orb, ring, active: false, pulse: Math.random() * Math.PI * 2 });
  }

  function randomPositions() {
    const positions = [];
    const minDistance = 1.8;
    while (positions.length < 4) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.2 + Math.sqrt(Math.random()) * 2.45;
      const candidate = new BABYLON.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      const farEnough = candidate.length() > 1.8 && positions.every((item) => BABYLON.Vector3.Distance(item, candidate) > minDistance);
      if (farEnough) positions.push(candidate);
    }
    return positions;
  }

  function resetGame() {
    targets.splice(0).forEach(({ orb, ring }) => { orb.dispose(); ring.dispose(); });
    randomPositions().forEach((position, index) => createTarget(index, position));
    player.position.set(0, BALL_RADIUS + .07, 0);
    playerHalo.position.set(0, .1, 0);
    velocity.set(0, 0);
    wakeCount = 0;
    scoreElement.textContent = '0 / 4';
    complete.hidden = true;
  }

  function wake(target) {
    if (target.active) return;
    target.active = true;
    wakeCount += 1;
    scoreElement.textContent = `${wakeCount} / 4`;
    const material = target.orb.material;
    material.albedoColor = new BABYLON.Color3(1.0, .67, .12);
    material.emissiveColor = new BABYLON.Color3(.78, .31, .015);
    target.ring.material.emissiveColor = new BABYLON.Color3(.92, .5, .06);
    target.ring.scaling.setAll(1.2);
    BABYLON.Animation.CreateAndStartAnimation('ring settle', target.ring, 'scaling', 60, 22, BABYLON.Vector3.One().scale(1.75), BABYLON.Vector3.One(), BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    if (wakeCount === 4) {
      autoPlaying = false;
      updateAutoPlayButton();
      setTimeout(() => { complete.hidden = false; }, 550);
    }
  }

  function updateAutoPlayButton() {
    autoPlayButton.classList.toggle('is-active', autoPlaying);
    autoPlayButton.setAttribute('aria-pressed', String(autoPlaying));
    autoPlayButton.title = autoPlaying ? '停止自动演示' : '自动演示';
  }

  function setAutoPlay(enabled) {
    autoPlaying = enabled;
    if (enabled) {
      if (!started) activateGame(false);
      usingMotion = false;
      touchActive = false;
      touchTarget = null;
      touchHint.hidden = true;
    }
    updateAutoPlayButton();
  }

  function autoPilotForce() {
    const target = targets
      .filter((item) => !item.active)
      .sort((a, b) => {
        const aDistance = BABYLON.Vector3.DistanceSquared(a.orb.position, player.position);
        const bDistance = BABYLON.Vector3.DistanceSquared(b.orb.position, player.position);
        return aDistance - bDistance;
      })[0];
    if (!target) return BABYLON.Vector2.Zero();

    const offset = new BABYLON.Vector2(target.orb.position.x - player.position.x, target.orb.position.z - player.position.z);
    const distance = offset.length();
    if (distance < .001) return BABYLON.Vector2.Zero();

    const direction = offset.scale(1 / distance);
    const desiredSpeed = Math.min(physics.maxSpeed * .65, Math.max(.5, distance * 2.35));
    const desiredVelocity = direction.scale(desiredSpeed);
    // A proportional velocity controller acts like a person tilting toward the
    // target, then leaning back early enough to brake before contact.
    return desiredVelocity.subtract(velocity).scale(2.6 / Math.max(physics.acceleration, .1));
  }

  function activateGame(motion) {
    started = true;
    usingMotion = motion;
    intro.hidden = true;
    touchHint.hidden = motion;
    if (motion) {
      motionCalibrated = false;
      calibrationPending = true;
      document.getElementById('sensorHint').textContent = '正在校准重力感应；保持当前自然手持姿势即可。';
    }
  }

  async function enableMotion() {
    try {
      const permissionRequests = [window.DeviceOrientationEvent, window.DeviceMotionEvent]
        .filter((source) => source && typeof source.requestPermission === 'function')
        .map((source) => source.requestPermission());
      if (permissionRequests.length) {
        const results = await Promise.all(permissionRequests);
        if (results.some((permission) => permission !== 'granted')) throw new Error('permission denied');
      }
      activateGame(true);
    } catch (error) {
      document.getElementById('sensorHint').textContent = '未获得重力感应权限，已切换到触控操作。';
      activateGame(false);
    }
  }

  const requestCalibration = () => {
    if (!usingMotion) return;
    motionCalibrated = false;
    calibrationPending = true;
  };

  function sensorTilt(beta, gamma) {
    // Cyber Orb's proven mobile-game mapping: gamma is side-to-side and beta is
    // front-to-back.  Do not rotate these values with screen.orientation: iOS
    // reports that value inconsistently while orientation lock is enabled.
    return new BABYLON.Vector2(gamma, -beta);
  }

  window.addEventListener('deviceorientation', (event) => {
    if (event.beta == null || event.gamma == null) return;
    const transformed = sensorTilt(event.beta, event.gamma);
    tilt.x = transformed.x;
    tilt.y = transformed.y;
    if (calibrationPending) {
      tiltBaseline = tilt.clone();
      calibrationPending = false;
      motionCalibrated = true;
      document.getElementById('sensorHint').textContent = '重力感应已校准；倾斜手机操控灵珠。';
    }
  }, true);
  window.addEventListener('orientationchange', requestCalibration);
  screen.orientation?.addEventListener?.('change', requestCalibration);

  function screenToBoard(clientX, clientY) {
    const ray = scene.createPickingRay(clientX, clientY, BABYLON.Matrix.Identity(), camera);
    const plane = new BABYLON.Plane(0, 1, 0, -.08);
    const distance = ray.intersectsPlane(plane);
    return distance == null ? null : ray.origin.add(ray.direction.scale(distance));
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!started || usingMotion) return;
    touchActive = true;
    touchTarget = screenToBoard(event.clientX, event.clientY);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!touchActive || usingMotion) return;
    touchTarget = screenToBoard(event.clientX, event.clientY);
  });
  const stopTouch = () => { touchActive = false; touchTarget = null; };
  canvas.addEventListener('pointerup', stopTouch); canvas.addEventListener('pointercancel', stopTouch);

  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, .04);
    lastTime = now;
    if (!started) return;
    let force = BABYLON.Vector2.Zero();
    if (autoPlaying) {
      force = autoPilotForce();
    } else if (usingMotion && motionCalibrated) {
      force = tilt.subtract(tiltBaseline).scale(1 / 18);
    } else if (touchActive && touchTarget) {
      force = new BABYLON.Vector2(touchTarget.x - player.position.x, touchTarget.z - player.position.z).scale(.72);
    }
    force.x = BABYLON.Scalar.Clamp(force.x, -1, 1);
    force.y = BABYLON.Scalar.Clamp(force.y, -1, 1);
    velocity.addInPlace(force.scale(physics.acceleration * dt));
    velocity.scaleInPlace(Math.max(0, 1 - physics.damping * dt));
    if (velocity.length() > physics.maxSpeed) velocity.normalize().scaleInPlace(physics.maxSpeed);
    player.position.x += velocity.x * dt;
    player.position.z += velocity.y * dt;
    const limit = BOARD_RADIUS - BALL_RADIUS - .28;
    const distance = Math.hypot(player.position.x, player.position.z);
    if (distance > limit) {
      const nx = player.position.x / distance; const nz = player.position.z / distance;
      player.position.x = nx * limit; player.position.z = nz * limit;
      const outward = velocity.x * nx + velocity.y * nz;
      if (outward > 0) {
        velocity.x -= (1 + physics.edgeRestitution) * outward * nx;
        velocity.y -= (1 + physics.edgeRestitution) * outward * nz;
      }
    }
    player.rotation.x += velocity.y * dt * 3.0;
    player.rotation.z -= velocity.x * dt * 3.0;
    playerHalo.position.x = player.position.x; playerHalo.position.z = player.position.z;
    playerHalo.scaling.setAll(1 + Math.sin(now * .008) * .035);
    targets.forEach((target) => {
      target.pulse += dt;
      if (!target.active) target.orb.position.y = TARGET_RADIUS + .075 + Math.sin(target.pulse * 1.6) * .018;
      const dx = player.position.x - target.orb.position.x;
      const dz = player.position.z - target.orb.position.z;
      const collisionDistance = BALL_RADIUS + TARGET_RADIUS;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < collisionDistance ** 2) {
        wake(target);
        const distance = Math.max(Math.sqrt(distanceSquared), .001);
        const normalX = dx / distance;
        const normalZ = dz / distance;
        const overlap = collisionDistance - distance;
        player.position.x += normalX * overlap;
        player.position.z += normalZ * overlap;
        const normalVelocity = velocity.x * normalX + velocity.y * normalZ;
        if (normalVelocity < 0) {
          velocity.x -= (1 + physics.targetRestitution) * normalVelocity * normalX;
          velocity.y -= (1 + physics.targetRestitution) * normalVelocity * normalZ;
        }
      }
    });
  });

  motionButton.addEventListener('click', enableMotion);
  startButton.addEventListener('click', () => activateGame(false));
  restartButton.addEventListener('click', () => { resetGame(); if (!started) activateGame(false); });
  againButton.addEventListener('click', () => resetGame());
  autoPlayButton.addEventListener('click', () => setAutoPlay(!autoPlaying));
  recenterButton.addEventListener('click', requestCalibration);
  window.addEventListener('resize', () => { engine.resize(); fitCameraToViewport(); });
  resetGame();
  setAutoPlay(autoPlaying);
  engine.resize();
  fitCameraToViewport();
  engine.runRenderLoop(() => {
    scene.render();
    if (renderError) renderError.hidden = true;
  });
})();
