import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import type { Scene } from '@babylonjs/core/scene'

type FrameMetricsOptions = {
  engine: AbstractEngine
  scene: Scene
  frameGrid: HTMLDivElement
  frameOverlay: HTMLDivElement
  frameOverlayClose: HTMLButtonElement
  frameToggle: HTMLButtonElement
  getImportedMeshes: () => AbstractMesh[]
}

const getImportedTriangleCount = (meshes: AbstractMesh[]) =>
  meshes.reduce((total, mesh) => {
    if (mesh.isDisposed()) {
      return total
    }

    const indices = mesh.getTotalIndices()
    if (indices > 0) {
      return total + Math.floor(indices / 3)
    }

    const positions = mesh.getVerticesData('position')
    return total + Math.floor((positions?.length ?? 0) / 9)
  }, 0)

export const createFrameMetricsController = ({
  engine,
  scene,
  frameGrid,
  frameOverlay,
  frameOverlayClose,
  frameToggle,
  getImportedMeshes,
}: FrameMetricsOptions) => {
  let sceneInstrumentation: SceneInstrumentation | undefined

  try {
    sceneInstrumentation = new SceneInstrumentation(scene)
    sceneInstrumentation.captureFrameTime = true
  } catch {
    // Scene instrumentation may be unavailable in some runtime modes.
  }

  let frameOverlayVisible = false
  let frameUpdateTimer = 0
  const frameUpdateIntervalMs = 800

  const metrics: { label: string; get: () => string }[] = [
    { label: 'FPS', get: () => String(Math.round(engine.getFps())) },
    { label: 'Draw Calls', get: () => String(sceneInstrumentation?.drawCallsCounter.current ?? 0) },
    { label: 'Model Triangles', get: () => String(getImportedTriangleCount(getImportedMeshes())) },
    { label: 'Rendered Indices', get: () => String(scene.getActiveIndices() ?? 0) },
    { label: 'Meshes', get: () => String(scene.getActiveMeshes().length) + ' / ' + String(scene.meshes.length) },
  ]

  const updateFrameGrid = () => {
    frameGrid.textContent = ''
    for (const metric of metrics) {
      const row = document.createElement('div')
      row.className = 'frame-metric'
      const label = document.createElement('span')
      label.className = 'frame-metric-label'
      label.textContent = metric.label
      const value = document.createElement('span')
      value.className = 'frame-metric-value'
      value.textContent = metric.get()
      row.append(label, value)
      frameGrid.append(row)
    }
  }

  frameToggle.addEventListener('click', () => {
    frameOverlayVisible = !frameOverlayVisible
    frameOverlay.classList.toggle('frame-overlay-open', frameOverlayVisible)
    frameToggle.classList.toggle('frame-toggle-active', frameOverlayVisible)
    if (frameOverlayVisible) updateFrameGrid()
  })

  frameOverlayClose.addEventListener('click', () => {
    frameOverlayVisible = false
    frameOverlay.classList.remove('frame-overlay-open')
    frameToggle.classList.remove('frame-toggle-active')
  })

  return {
    update(deltaMs: number) {
      if (!frameOverlayVisible) {
        return
      }

      frameUpdateTimer += deltaMs
      if (frameUpdateTimer >= frameUpdateIntervalMs) {
        frameUpdateTimer = 0
        updateFrameGrid()
      }
    },
  }
}
