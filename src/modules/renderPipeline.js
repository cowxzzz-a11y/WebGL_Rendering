export function createRenderPipelineModule(app) {
  const { renderer, scene, camera } = app.runtime;

  const state = {
    dirty: true,
    lastInteractionTime: performance.now(),
    sampleCount: 1,
  };

  function getIsInteractive() {
    return performance.now() - state.lastInteractionTime < app.state.renderSettings.idleDelayMs;
  }

  function updateStatus() {
    const interactive = getIsInteractive();
    const scale = interactive
      ? app.state.renderSettings.interactiveScale
      : app.state.renderSettings.staticScale;
    const modeLabel = interactive ? "实时预览" : "静止观察";
    app.status.setRender(`${modeLabel} · ${Math.round(scale * 100)}% · 直出渲染`);
  }

  function markDirty({ interaction = false } = {}) {
    state.dirty = true;
    state.sampleCount = 1;

    if (interaction) {
      state.lastInteractionTime = performance.now();
    }
  }

  function notifyInteraction() {
    markDirty({ interaction: true });
  }

  function render() {
    renderer.render(scene, camera);
    updateStatus();
    state.dirty = false;
  }

  function dispose() {}

  return {
    markDirty,
    notifyInteraction,
    render,
    dispose,
    getSampleCount() {
      return state.sampleCount;
    },
  };
}
