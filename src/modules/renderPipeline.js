import { NoBlending } from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { WebGLPathTracer } from "../../案例——请抄袭它两/three-gpu-pathtracer/src/index.js";
import { ClampedInterpolationMaterial } from "../../案例——请抄袭它两/three-gpu-pathtracer/src/materials/fullscreen/ClampedInterpolationMaterial.js";

export function createRenderPipelineModule(app) {
  const { renderer, scene, camera } = app.runtime;
  const pathTracer = new WebGLPathTracer(renderer);
  const pathTracerComposite = new FullScreenQuad(
    new ClampedInterpolationMaterial({
      map: null,
      transparent: true,
      blending: NoBlending,
      premultipliedAlpha: renderer.getContextAttributes().premultipliedAlpha,
    })
  );

  pathTracer.renderToCanvas = false;
  pathTracer.dynamicLowRes = true;
  pathTracer.lowResScale = app.state.renderSettings.interactiveScale;
  pathTracer.renderScale = app.state.renderSettings.staticScale;
  pathTracer.renderDelay = app.state.renderSettings.idleDelayMs;
  pathTracer.minSamples = 1;
  pathTracer.fadeDuration = 220;
  pathTracer.tiles.set(2, 2);
  pathTracer.bounces = 6;
  pathTracer.transmissiveBounces = 8;
  pathTracer.filterGlossyFactor = 0.6;
  pathTracer.multipleImportanceSampling = true;

  const state = {
    dirty: true,
    lastInteractionTime: performance.now(),
    sampleCount: 0,
    needsPathTracerSync: true,
    pathTracerReady: false,
    pathTracerFailed: false,
  };

  function getIsInteractive() {
    return (
      performance.now() - state.lastInteractionTime <
      app.state.renderSettings.idleDelayMs
    );
  }

  function applyPathTracerSettings() {
    const {
      accumulationEnabled,
      interactiveScale,
      staticScale,
      idleDelayMs,
      maxSamples,
      bounces,
      transmissiveBounces,
      filterGlossyFactor,
    } = app.state.renderSettings;

    pathTracer.enablePathTracing = accumulationEnabled;
    pathTracer.lowResScale = interactiveScale;
    pathTracer.renderScale = staticScale;
    pathTracer.renderDelay = idleDelayMs;
    pathTracer.bounces = bounces;
    pathTracer.transmissiveBounces = transmissiveBounces;
    pathTracer.filterGlossyFactor = filterGlossyFactor;
    pathTracer.pausePathTracing = !accumulationEnabled || pathTracer.samples >= maxSamples;
  }

  function prepareRendererForSceneRender() {
    renderer.setRenderTarget(null);
    renderer.resetState?.();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
    renderer.setScissor(0, 0, renderer.domElement.width, renderer.domElement.height);
  }

  function withPathTracingSceneState(callback) {
    const hiddenState = new Map();
    const previousEnvironment = scene.environment;
    const rawHDRTexture = app.state.currentHDRTexture;
    const pmremTexture = app.state.currentEnvironmentTarget?.texture ?? null;
    const hideRasterSunInGI =
      rawHDRTexture &&
      !app.state.hdrPaused &&
      app.state.environmentSettings.autoSunFromHDR;

    for (const object of app.runtime.pathTracingExcludedObjects ?? []) {
      hiddenState.set(object, object.visible);
      object.visible = false;
    }

    if (hideRasterSunInGI) {
      for (const object of [app.runtime.hemiLight, app.runtime.dirLight]) {
        hiddenState.set(object, object.visible);
        object.visible = false;
      }
    }

    if (rawHDRTexture && pmremTexture && previousEnvironment === pmremTexture) {
      scene.environment = rawHDRTexture;
    }

    try {
      return callback();
    } finally {
      scene.environment = previousEnvironment;

      for (const [object, visible] of hiddenState) {
        object.visible = visible;
      }
    }
  }

  function syncPathTracerScene() {
    if (state.pathTracerFailed) {
      return;
    }

    try {
      withPathTracingSceneState(() => {
        pathTracer.setScene(scene, camera);
      });

      state.needsPathTracerSync = false;
      state.pathTracerReady = true;
    } catch (error) {
      state.pathTracerFailed = true;
      state.pathTracerReady = false;
      console.error("Path tracer sync failed.", error);
    }
  }

  function renderOverlay() {
    const overlayLayer = app.runtime.overlayLayer;
    if (overlayLayer == null) {
      return;
    }

    prepareRendererForSceneRender();

    const previousMask = camera.layers.mask;
    const previousAutoClear = renderer.autoClear;
    const previousBackground = scene.background;
    camera.layers.set(overlayLayer);
    scene.background = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = previousAutoClear;
    scene.background = previousBackground;
    camera.layers.mask = previousMask;
  }

  function renderRasterFallback() {
    prepareRendererForSceneRender();

    const previousMask = camera.layers.mask;
    const previousAutoClear = renderer.autoClear;
    camera.layers.set(0);
    renderer.autoClear = true;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.autoClear = previousAutoClear;
    camera.layers.mask = previousMask;
    renderOverlay();
  }

  function renderPathTracingResult() {
    prepareRendererForSceneRender();

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.clear();
    pathTracerComposite.material.map = pathTracer.target.texture;
    pathTracerComposite.material.opacity = 1;
    pathTracerComposite.render(renderer);
    pathTracerComposite.material.map = null;
    renderer.autoClear = previousAutoClear;
    renderOverlay();
  }

  function updateStatus() {
    const interactive = getIsInteractive();
    const scale = interactive
      ? app.state.renderSettings.interactiveScale
      : app.state.renderSettings.staticScale;

    if (state.pathTracerFailed) {
      app.status.setRender(`直出预览 · ${Math.round(scale * 100)}% · 光追初始化失败`);
      return;
    }

    if (interactive) {
      app.status.setRender(`实时预览 · ${Math.round(scale * 100)}% · 光追低清预览`);
      return;
    }

    const maxSamples = app.state.renderSettings.maxSamples;
    app.status.setRender(
      `路径追踪 · ${Math.round(scale * 100)}% · ${Math.floor(pathTracer.samples)}/${maxSamples} spp`
    );
  }

  function requestPathTracerSync() {
    state.needsPathTracerSync = true;
    state.pathTracerFailed = false;
    state.pathTracerReady = false;
  }

  function syncEnvironmentAndLights({ interaction = false } = {}) {
    state.dirty = true;
    state.sampleCount = 0;

    if (interaction) {
      state.lastInteractionTime = performance.now();
    }

    if (!state.pathTracerReady || state.pathTracerFailed || state.needsPathTracerSync) {
      requestPathTracerSync();
      return;
    }

    try {
      withPathTracingSceneState(() => {
        pathTracer.updateEnvironment();
        pathTracer.updateLights();
      });
      pathTracer.reset();
    } catch (error) {
      console.error("Path tracer environment refresh failed.", error);
      requestPathTracerSync();
    }
  }

  function markDirty({ interaction = false, rebuildPathTracer = !interaction } = {}) {
    state.dirty = true;
    state.sampleCount = 0;

    if (rebuildPathTracer) {
      requestPathTracerSync();
    }

    if (interaction) {
      state.lastInteractionTime = performance.now();

      if (state.pathTracerReady && !state.pathTracerFailed) {
        pathTracer.updateCamera();
      }

      return;
    }

    if (state.pathTracerReady && !state.pathTracerFailed && !rebuildPathTracer) {
      pathTracer.reset();
    }
  }

  function notifyInteraction() {
    markDirty({ interaction: true, rebuildPathTracer: false });
  }

  function render() {
    applyPathTracerSettings();

    if (state.needsPathTracerSync) {
      syncPathTracerScene();
    }

    if (!state.pathTracerReady || state.pathTracerFailed) {
      renderRasterFallback();
      updateStatus();
      state.dirty = false;
      return;
    }

    if (pathTracer.isCompiling) {
      renderRasterFallback();
      state.sampleCount = pathTracer.samples;
      state.dirty = false;
      updateStatus();
      return;
    }

    pathTracer.pausePathTracing =
      !pathTracer.enablePathTracing ||
      pathTracer.samples >= app.state.renderSettings.maxSamples;
    pathTracer.renderSample();

    if (pathTracer.isCompiling || pathTracer.samples < pathTracer.minSamples) {
      renderRasterFallback();
    } else {
      renderPathTracingResult();
    }

    state.sampleCount = pathTracer.samples;
    state.dirty = false;
    updateStatus();
  }

  function dispose() {
    pathTracerComposite.dispose();
    pathTracerComposite.material.dispose();
    pathTracer.dispose();
  }

  return {
    markDirty,
    notifyInteraction,
    syncEnvironmentAndLights,
    render,
    dispose,
    requestPathTracerSync,
    getDebugInfo() {
      return {
        pathTracerReady: state.pathTracerReady,
        pathTracerFailed: state.pathTracerFailed,
        dirty: state.dirty,
        sampleCount: state.sampleCount,
        samples: pathTracer.samples,
        isCompiling: pathTracer.isCompiling,
        enablePathTracing: pathTracer.enablePathTracing,
        pausePathTracing: pathTracer.pausePathTracing,
        dynamicLowRes: pathTracer.dynamicLowRes,
        lowResScale: pathTracer.lowResScale,
        renderScale: pathTracer.renderScale,
        minSamples: pathTracer.minSamples,
        fadeDuration: pathTracer.fadeDuration,
      };
    },
    getSampleCount() {
      return state.pathTracerFailed ? 0 : pathTracer.samples;
    },
  };
}
