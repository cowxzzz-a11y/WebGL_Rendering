export function createObjectManagerModule(app) {
  function getDisplayName(object) {
    if (!object) {
      return "无";
    }

    const baseName =
      object.name && object.name.trim() ? object.name : "未命名对象";
    return `${baseName} (${object.type})`;
  }

  function getActiveRoot() {
    if (app.state.currentRoot) {
      return app.state.currentRoot;
    }

    return app.state.fallbackGroup;
  }

  function collectMeshes(root) {
    const meshList = [];

    if (!root) {
      return meshList;
    }

    root.traverse((child) => {
      if (child.isMesh && child.visible) {
        meshList.push(child);
      }
    });

    return meshList;
  }

  function findSelectableObject(clickedObject, root) {
    if (!clickedObject || !root) {
      return null;
    }

    let current = clickedObject;

    while (current.parent && current.parent !== root) {
      current = current.parent;
    }

    return current;
  }

  function buildObjectRows(root, depth = 0, rows = []) {
    if (!root) {
      return rows;
    }

    if (
      root !== app.runtime.transformControls &&
      root.type !== "TransformControls"
    ) {
      rows.push({ object: root, depth });
    }

    root.children.forEach((child) => {
      buildObjectRows(child, depth + 1, rows);
    });

    return rows;
  }

  function refreshObjectManager() {
    const { objectListEl } = app.dom;
    objectListEl.innerHTML = "";

    const root = getActiveRoot();

    if (!root) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "当前还没有可管理的对象。";
      objectListEl.appendChild(empty);
      return;
    }

    const rows = buildObjectRows(root);

    rows.forEach(({ object, depth }) => {
      const row = document.createElement("div");
      row.className = "tree-item";
      row.style.marginLeft = `${depth * 10}px`;

      if (object === app.state.selectedObject) {
        row.classList.add("selected");
      }

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = object.visible;
      checkbox.addEventListener("change", () => {
        object.visible = checkbox.checked;

        if (!object.visible && object === app.state.selectedObject) {
          app.selection.clearSelection();
          return;
        }

        refreshObjectManager();
        app.inspectors.renderInspectors();
      });

      const label = document.createElement("div");
      label.className = "tree-label";
      label.textContent =
        object.name && object.name.trim() ? object.name : "未命名对象";

      const type = document.createElement("span");
      type.className = "tree-type";
      type.textContent = object.type;
      label.appendChild(type);

      const selectBtn = document.createElement("button");
      selectBtn.className = "secondary";
      selectBtn.textContent =
        object === app.state.selectedObject ? "已选中" : "选中";
      selectBtn.addEventListener("click", () => {
        app.selection.selectObject(object);
      });

      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(selectBtn);
      objectListEl.appendChild(row);
    });
  }

  function showAllObjects() {
    const root = getActiveRoot();
    if (!root) {
      return;
    }

    root.traverse((child) => {
      child.visible = true;
    });

    refreshObjectManager();
    app.inspectors.renderInspectors();
  }

  return {
    getDisplayName,
    getActiveRoot,
    collectMeshes,
    findSelectableObject,
    buildObjectRows,
    refreshObjectManager,
    showAllObjects,
  };
}
