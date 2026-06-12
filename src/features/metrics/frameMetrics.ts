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
  let frameMsAverage = 0
  const frameUpdateIntervalMs = 250

  const metrics: { label: string; get: () => string }[] = [
    { label: 'FPS', get: () => String(Math.round(engine.getFps())) },
    { label: 'Frame ms', get: () => `${engine.getDeltaTime().toFixed(2)} / avg ${frameMsAverage.toFixed(2)}` },
    { label: 'Draw Calls', get: () => String(sceneInstrumentation?.drawCallsCounter.current ?? 0) },
    { label: 'Active Triangles', get: () => String(Math.floor((scene.getActiveIndices() ?? 0) / 3)) },
    { label: 'Total Triangles', get: () => String(getImportedTriangleCount(getImportedMeshes())) },
    { label: 'Active Meshes', get: () => String(scene.getActiveMeshes().length) + ' / ' + String(scene.meshes.length) },
    { label: 'Materials', get: () => String(scene.materials.length) },
    { label: 'Textures', get: () => String(scene.textures.length) },
    { label: 'Render Size', get: () => `${engine.getRenderWidth()} x ${engine.getRenderHeight()}` },
    { label: 'Hardware Scale', get: () => engine.getHardwareScalingLevel().toFixed(2) },
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
      frameMsAverage = frameMsAverage === 0 ? deltaMs : frameMsAverage * 0.9 + deltaMs * 0.1

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
