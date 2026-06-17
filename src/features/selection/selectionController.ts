import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import { clamp } from '../../utils/math'

type FocusTarget = AbstractMesh | TransformNode

type FocusAnimation = {
  elapsed: number
  duration: number
  from: Vector3
  to: Vector3
  fromRadius: number
  toRadius: number
  target: FocusTarget
}

type SelectionControllerOptions = {
  canvas: HTMLCanvasElement
  scene: Scene
  camera: ArcRotateCamera
  getImportedMeshes: () => AbstractMesh[]
  getDeltaTime: () => number
  getSingleTouchPanMode?: () => boolean
  onSelectDetail: (detailId: string) => void
  onClearDetail: () => void
  onOutlineChanged: () => void
  getSelectionMode?: () => 'part' | 'model'
  getModelRootForMesh?: (mesh: AbstractMesh) => TransformNode | null
}

const selectionClickMaxDistance = 5
const pinchZoomClearDistance = 8

const getSelectionBoxLines = (mesh: AbstractMesh) => {
  mesh.computeWorldMatrix(true)
  mesh.refreshBoundingInfo(true, false)

  const boundingBox = mesh.getBoundingInfo().boundingBox
  const min = boundingBox.minimumWorld
  const max = boundingBox.maximumWorld
  const corners = [
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
    new Vector3(min.x, max.y, max.z),
  ]

  return [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
    [corners[4], corners[5]],
    [corners[5], corners[6]],
    [corners[6], corners[7]],
    [corners[7], corners[4]],
    [corners[0], corners[4]],
    [corners[1], corners[5]],
    [corners[2], corners[6]],
    [corners[3], corners[7]],
  ]
}

const getFocusBoundsForMeshes = (meshes: AbstractMesh[]) => {
  const validMeshes = meshes.filter((mesh) => !mesh.isDisposed())
  if (validMeshes.length === 0) {
    return null
  }

  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)

  validMeshes.forEach((mesh) => {
    mesh.computeWorldMatrix(true)
    mesh.refreshBoundingInfo(true, false)
    const bounds = mesh.getBoundingInfo().boundingBox
    min.minimizeInPlace(bounds.minimumWorld)
    max.maximizeInPlace(bounds.maximumWorld)
  })

  const center = min.add(max).scale(0.5)
  const radius = Math.max(max.subtract(min).length() * 0.58, 0.5)

  return { center, radius, min, max }
}

const getSelectionBoxLinesForBounds = (min: Vector3, max: Vector3) => {
  const corners = [
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
    new Vector3(min.x, max.y, max.z),
  ]

  return [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
    [corners[4], corners[5]],
    [corners[5], corners[6]],
    [corners[6], corners[7]],
    [corners[7], corners[4]],
    [corners[0], corners[4]],
    [corners[1], corners[5]],
    [corners[2], corners[6]],
    [corners[3], corners[7]],
  ]
}

const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2

export const createSelectionController = ({
  canvas,
  scene,
  camera,
  getImportedMeshes,
  getDeltaTime,
  getSingleTouchPanMode = () => false,
  onSelectDetail,
  onClearDetail,
  onOutlineChanged,
  getSelectionMode,
  getModelRootForMesh,
}: SelectionControllerOptions) => {
  let selectedMesh: AbstractMesh | null = null
  let selectedModel: TransformNode | null = null
  let selectionBox: LinesMesh | null = null
  let focusAnimation: FocusAnimation | null = null
  let pointerSelectionState:
    | {
        x: number
        y: number
        button: number
        dragged: boolean
      }
    | null = null
  const activeTouchPointers = new Map<number, { x: number, y: number }>()
  let pinchStartDistance: number | null = null
  let pinchSelectionCleared = false

  const getMeshesForRoot = (root: TransformNode) =>
    getImportedMeshes().filter((mesh) => {
      let parent = mesh.parent

      while (parent) {
        if (parent === root) {
          return true
        }

        parent = parent.parent
      }

      return false
    })

  const getMeshFromDetailId = (detailId: string | undefined) => {
    const match = detailId?.match(/^mesh:(\d+)$/)
    if (!match) {
      return null
    }

    const meshId = Number.parseInt(match[1], 10)
    return getImportedMeshes().find((mesh) => mesh.uniqueId === meshId && !mesh.isDisposed()) ?? null
  }

  const getFocusBoundsForTarget = (target: FocusTarget) => {
    if (target instanceof AbstractMesh) {
      return getFocusBoundsForMeshes([target])
    }

    return getFocusBoundsForMeshes(getMeshesForRoot(target))
  }

  const updateSelectionBox = () => {
    if (!selectedMesh && !selectedModel) {
      selectionBox?.dispose()
      selectionBox = null
      return
    }

    let lines: Vector3[][]
    if (selectedMesh) {
      lines = getSelectionBoxLines(selectedMesh)
    } else {
      const bounds = getFocusBoundsForMeshes(getMeshesForRoot(selectedModel!))
      if (!bounds) {
        selectionBox?.dispose()
        selectionBox = null
        return
      }
      lines = getSelectionBoxLinesForBounds(bounds.min, bounds.max)
    }

    if (!selectionBox) {
      selectionBox = MeshBuilder.CreateLineSystem(
        'SelectionBoundingBox',
        {
          lines,
          updatable: true,
        },
        scene,
      )
      selectionBox.color = new Color3(1, 0.86, 0.08)
      selectionBox.isPickable = false
      selectionBox.renderingGroupId = 2
      return
    }

    MeshBuilder.CreateLineSystem('SelectionBoundingBox', { lines, instance: selectionBox })
  }

  const clearSelection = () => {
    if (selectedMesh) {
      selectedMesh.showBoundingBox = false
      selectedMesh = null
    }
    selectedModel = null

    selectionBox?.dispose()
    selectionBox = null
    focusAnimation = null
    onClearDetail()
    onOutlineChanged()
  }

  const clearSelectionForZoom = () => {
    if (!selectedMesh && !selectedModel && !selectionBox) {
      return
    }

    clearSelection()
  }

  const getTouchPinchDistance = () => {
    const [first, second] = [...activeTouchPointers.values()]
    if (!first || !second) {
      return null
    }

    return Math.hypot(second.x - first.x, second.y - first.y)
  }

  const selectMesh = (mesh: AbstractMesh) => {
    if (selectedMesh && selectedMesh !== mesh) {
      selectedMesh.showBoundingBox = false
    }
    selectedModel = null

    selectedMesh = mesh
    updateSelectionBox()
    onSelectDetail(`mesh:${mesh.uniqueId}`)
  }

  const selectModel = (root: TransformNode) => {
    if (selectedMesh) {
      selectedMesh.showBoundingBox = false
      selectedMesh = null
    }
    selectedModel = root
    updateSelectionBox()
    onSelectDetail(`model:${root.uniqueId}`)
  }

  const startSelectedFocusAnimation = () => {
    const target = selectedMesh || selectedModel
    if (!target || focusAnimation?.target === target) {
      return
    }

    const bounds = getFocusBoundsForTarget(target)
    if (!bounds) {
      return
    }

    focusAnimation = {
      elapsed: 0,
      duration: 0.55,
      from: camera.target.clone(),
      to: bounds.center,
      fromRadius: camera.radius,
      toRadius: Math.max(bounds.radius * 2.8, 2),
      target,
    }
  }

  const startFocusAnimationForTarget = (target: FocusTarget) => {
    const bounds = getFocusBoundsForTarget(target)
    if (!bounds) {
      return
    }

    focusAnimation = {
      elapsed: 0,
      duration: 0.55,
      from: camera.target.clone(),
      to: bounds.center,
      fromRadius: camera.radius,
      toRadius: Math.max(bounds.radius * 2.8, 2),
      target,
    }
  }

  const updateFocusAnimation = () => {
    if (!focusAnimation) {
      return
    }

    focusAnimation.elapsed += getDeltaTime() / 1000
    const progress = clamp(focusAnimation.elapsed / focusAnimation.duration, 0, 1)
    const easedProgress = easeInOutCubic(progress)
    const nextTarget = Vector3.Lerp(focusAnimation.from, focusAnimation.to, easedProgress)

    camera.setTarget(nextTarget, false, true, true)
    camera.radius = focusAnimation.fromRadius + (focusAnimation.toRadius - focusAnimation.fromRadius) * easedProgress

    if (progress >= 1) {
      focusAnimation = null
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (activeTouchPointers.size >= 2) {
        pointerSelectionState = null
        pinchStartDistance = getTouchPinchDistance()
        pinchSelectionCleared = false
        return
      }

      if (getSingleTouchPanMode()) {
        pointerSelectionState = null
        return
      }
    }

    if (event.button === 2) {
      clearSelection()
      return
    }

    if (event.button !== 0) {
      return
    }

    pointerSelectionState = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      dragged: false,
    }
  })

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' && activeTouchPointers.has(event.pointerId)) {
      activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (activeTouchPointers.size >= 2) {
        pointerSelectionState = null
        const nextPinchDistance = getTouchPinchDistance()

        if (pinchStartDistance !== null && nextPinchDistance !== null && !pinchSelectionCleared) {
          const pinchDelta = Math.abs(nextPinchDistance - pinchStartDistance)

          if (pinchDelta >= pinchZoomClearDistance) {
            clearSelectionForZoom()
            pinchSelectionCleared = true
          }
        }

        return
      }

      if (getSingleTouchPanMode()) {
        pointerSelectionState = null
        return
      }
    }

    if (!pointerSelectionState || pointerSelectionState.button !== 0) {
      return
    }

    const distance = Math.hypot(event.clientX - pointerSelectionState.x, event.clientY - pointerSelectionState.y)

    if (distance <= selectionClickMaxDistance) {
      return
    }

    pointerSelectionState.dragged = true
    startSelectedFocusAnimation()
  })

  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') {
      activeTouchPointers.delete(event.pointerId)

      if (activeTouchPointers.size < 2) {
        pinchStartDistance = null
        pinchSelectionCleared = false
      } else {
        pinchStartDistance = getTouchPinchDistance()
      }

      if (getSingleTouchPanMode()) {
        pointerSelectionState = null
        return
      }
    }

    if (!pointerSelectionState || pointerSelectionState.button !== 0) {
      pointerSelectionState = null
      return
    }

    const distance = Math.hypot(event.clientX - pointerSelectionState.x, event.clientY - pointerSelectionState.y)
    const shouldSelect = !pointerSelectionState.dragged && distance <= selectionClickMaxDistance

    pointerSelectionState = null

    if (!shouldSelect) {
      return
    }

    const pickInfo = scene.pick(scene.pointerX, scene.pointerY, (mesh) => getImportedMeshes().includes(mesh))

    if (pickInfo?.hit && pickInfo.pickedMesh) {
      if (getSelectionMode && getSelectionMode() === 'model' && getModelRootForMesh) {
        const root = getModelRootForMesh(pickInfo.pickedMesh)
        if (root) {
          selectModel(root)
        } else {
          selectMesh(pickInfo.pickedMesh)
        }
      } else {
        selectMesh(pickInfo.pickedMesh)
      }
    }
  })

  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerType !== 'touch') {
      return
    }

    activeTouchPointers.delete(event.pointerId)

    if (activeTouchPointers.size < 2) {
      pinchStartDistance = null
      pinchSelectionCleared = false
    }

    pointerSelectionState = null
  })

  canvas.addEventListener('wheel', (event) => {
    if (event.deltaY === 0) {
      return
    }

    clearSelectionForZoom()
  }, { passive: true })

  return {
    clearSelection,
    getMeshFromDetailId,
    getMeshesForRoot,
    getSelectedMesh: () => selectedMesh,
    getSelectedModel: () => selectedModel,
    selectMesh,
    selectModel,
    startFocusAnimationForTarget,
    updateFocusAnimation,
    updateSelectionBox,
  }
}

export type SelectionController = ReturnType<typeof createSelectionController>
