export function createSelectionModule(app) {
  function clearSelection() {
    app.state.selectedObject = null;
    app.runtime.transformControls.detach();
    app.runtime.transformControls.visible = false;
    app.status.setSelection("无");
    app.objectManager.refreshObjectManager();
    app.inspectors.renderInspectors();
  }

  function selectObject(object) {
    if (!object) {
      clearSelection();
      return;
    }

    app.state.selectedObject = object;
    app.status.setSelection(app.objectManager.getDisplayName(object));

    if (app.state.moveModeEnabled) {
      app.runtime.transformControls.attach(object);
      app.runtime.transformControls.visible = true;
    } else {
      app.runtime.transformControls.detach();
      app.runtime.transformControls.visible = false;
    }

    app.objectManager.refreshObjectManager();
    app.inspectors.renderInspectors();
  }

  function syncMoveModeButton() {
    const { toggleMoveBtn } = app.dom;

    if (app.state.moveModeEnabled) {
      toggleMoveBtn.textContent = "移动模式开启";
      toggleMoveBtn.classList.add("active");

      if (app.state.selectedObject) {
        app.runtime.transformControls.attach(app.state.selectedObject);
        app.runtime.transformControls.visible = true;
      }

      return;
    }

    toggleMoveBtn.textContent = "移动模式关闭";
    toggleMoveBtn.classList.remove("active");
    app.runtime.transformControls.detach();
    app.runtime.transformControls.visible = false;
  }

  function toggleMoveMode() {
    app.state.moveModeEnabled = !app.state.moveModeEnabled;
    syncMoveModeButton();
  }

  function handlePointerDown(event) {
    if (!app.state.moveModeEnabled) {
      return;
    }

    const root = app.objectManager.getActiveRoot();
    if (!root) {
      return;
    }

    const rect = app.runtime.renderer.domElement.getBoundingClientRect();
    app.runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    app.runtime.pointer.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    app.runtime.raycaster.setFromCamera(app.runtime.pointer, app.runtime.camera);

    const hits = app.runtime.raycaster.intersectObjects(
      app.objectManager.collectMeshes(root),
      false
    );

    if (hits.length === 0) {
      return;
    }

    const object = app.objectManager.findSelectableObject(hits[0].object, root);
    selectObject(object);
  }

  return {
    clearSelection,
    selectObject,
    syncMoveModeButton,
    toggleMoveMode,
    handlePointerDown,
  };
}
