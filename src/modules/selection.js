export function createSelectionModule(app) {
  function updateSelectionBox() {
    const { selectionBox } = app.runtime;
    const object = app.state.selectedObject;

    if (!selectionBox) {
      return;
    }

    if (!object || !object.visible) {
      selectionBox.visible = false;
      return;
    }

    selectionBox.setFromObject(object);
    selectionBox.visible = true;
  }

  function clearSelection() {
    app.state.selectedObject = null;
    app.runtime.transformControls.detach();
    app.runtime.transformControls.visible = false;
    app.runtime.selectionBox.visible = false;
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

    updateSelectionBox();
    app.objectManager.refreshObjectManager();
    app.inspectors.renderInspectors();
  }

  function syncMoveModeButton() {
    const { toggleMoveBtn } = app.dom;

    if (!toggleMoveBtn) {
      return;
    }

    if (app.state.moveModeEnabled) {
      toggleMoveBtn.textContent = "物体移动已开";
      toggleMoveBtn.classList.add("active");

      if (app.state.selectedObject) {
        app.runtime.transformControls.attach(app.state.selectedObject);
        app.runtime.transformControls.visible = true;
      }

      return;
    }

    toggleMoveBtn.textContent = "物体移动已关";
    toggleMoveBtn.classList.remove("active");
    app.runtime.transformControls.detach();
    app.runtime.transformControls.visible = false;
  }

  function toggleMoveMode() {
    app.state.moveModeEnabled = !app.state.moveModeEnabled;
    syncMoveModeButton();
  }

  function handlePointerDown(event) {
    const root = app.objectManager.getActiveRoot();
    if (!root || event.button !== 0 || app.navigation?.isFlyActive()) {
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
    updateSelectionBox,
  };
}
