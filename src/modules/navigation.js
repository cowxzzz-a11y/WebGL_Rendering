import * as THREE from "three";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const MOVE = new THREE.Vector3();

export function createNavigationModule(app) {
  const pressedKeys = new Set();
  const state = {
    flyActive: false,
    viewportActive: false,
    pointerId: null,
    yaw: 0,
    pitch: 0,
  };

  const { camera, controls, renderer, transformControls } = app.runtime;
  const domElement = renderer.domElement;
  controls.userData = controls.userData || {};

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    );
  }

  function syncControlsAvailability() {
    controls.userData.flyActive = state.flyActive;
    controls.enabled = !state.flyActive && !transformControls.dragging;
    domElement.classList.toggle("is-fly-look", state.flyActive);
  }

  function isMoveKey(code) {
    return (
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD" ||
      code === "KeyQ" ||
      code === "KeyE" ||
      code === "ShiftLeft" ||
      code === "ShiftRight"
    );
  }

  function syncFromCamera() {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    state.pitch = THREE.MathUtils.clamp(
      euler.x,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01
    );
    state.yaw = euler.y;
  }

  function syncOrbitTarget(distance = 4) {
    FORWARD.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    controls.target.copy(camera.position).addScaledVector(FORWARD, distance);
  }

  function setMoveSpeed(value) {
    const clampedValue = THREE.MathUtils.clamp(value, 0.5, 20);
    const rounded = Number(clampedValue.toFixed(1));
    app.state.viewSettings.moveSpeed = rounded;

    if (app.dom.moveSpeedRange) {
      app.dom.moveSpeedRange.value = String(rounded);
    }

    if (app.dom.moveSpeedValueEl) {
      app.dom.moveSpeedValueEl.textContent = rounded.toFixed(1);
    }
  }

  function updateCameraRotation() {
    camera.quaternion.setFromEuler(
      new THREE.Euler(state.pitch, state.yaw, 0, "YXZ")
    );
    syncOrbitTarget();
  }

  function handlePointerDown(event) {
    domElement.focus();
    state.viewportActive = true;

    if (event.button !== 2) {
      return;
    }

    event.preventDefault();
    syncFromCamera();
    state.pointerId = event.pointerId;
    domElement.setPointerCapture?.(event.pointerId);
    state.flyActive = true;
    syncControlsAvailability();
  }

  function handlePointerUp(event) {
    if (event.button !== 2) {
      return;
    }

    if (state.pointerId !== null) {
      domElement.releasePointerCapture?.(state.pointerId);
    }

    state.pointerId = null;
    state.flyActive = false;
    syncControlsAvailability();
  }

  function handlePointerMove(event) {
    if (!state.flyActive) {
      return;
    }

    state.yaw -= event.movementX * 0.0026;
    state.pitch = THREE.MathUtils.clamp(
      state.pitch - event.movementY * 0.0022,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01
    );

    updateCameraRotation();
  }

  function handleWheel(event) {
    if (!state.flyActive) {
      return;
    }

    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setMoveSpeed(app.state.viewSettings.moveSpeed * factor);
  }

  function handleKeyDown(event) {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (isMoveKey(event.code)) {
      state.viewportActive = true;
      event.preventDefault();
    }

    if (event.code === "KeyF") {
      const target = app.objectManager.getActiveRoot();
      if (target) {
        app.assets.frameModel(target);
        event.preventDefault();
      }
      return;
    }

    pressedKeys.add(event.code);
  }

  function handleKeyUp(event) {
    pressedKeys.delete(event.code);
  }

  function resetInputState() {
    pressedKeys.clear();
    state.flyActive = false;
    state.viewportActive = false;
    state.pointerId = null;
    syncControlsAvailability();
  }

  function bind() {
    domElement.tabIndex = 0;
    domElement.style.outline = "none";

    domElement.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    domElement.addEventListener("pointerdown", handlePointerDown);
    domElement.addEventListener("wheel", handleWheel, { passive: false });

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", resetInputState);

    setMoveSpeed(app.state.viewSettings.moveSpeed);
    syncFromCamera();
    syncOrbitTarget();
    syncControlsAvailability();
  }

  function update(delta) {
    MOVE.set(0, 0, 0);

    if (pressedKeys.has("KeyW")) {
      MOVE.z -= 1;
    }

    if (pressedKeys.has("KeyS")) {
      MOVE.z += 1;
    }

    if (pressedKeys.has("KeyA")) {
      MOVE.x -= 1;
    }

    if (pressedKeys.has("KeyD")) {
      MOVE.x += 1;
    }

    if (pressedKeys.has("KeyE")) {
      MOVE.y += 1;
    }

    if (pressedKeys.has("KeyQ")) {
      MOVE.y -= 1;
    }

    if (MOVE.lengthSq() === 0) {
      return;
    }

    if (!state.viewportActive && !state.flyActive) {
      return;
    }

    FORWARD.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    RIGHT.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

    const translation = new THREE.Vector3();
    translation
      .addScaledVector(RIGHT, MOVE.x)
      .addScaledVector(WORLD_UP, MOVE.y)
      .addScaledVector(FORWARD, -MOVE.z)
      .normalize()
      .multiplyScalar(app.state.viewSettings.moveSpeed * delta);

    if (pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")) {
      translation.multiplyScalar(3);
    }

    camera.position.add(translation);
    syncOrbitTarget();
  }

  return {
    bind,
    update,
    setMoveSpeed,
    syncFromCamera,
    isFlyActive() {
      return state.flyActive;
    },
    syncControlsAvailability,
  };
}
