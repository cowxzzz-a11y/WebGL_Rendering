import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { SelectionOutlineLayer } from '@babylonjs/core/Layers/selectionOutlineLayer'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
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
}

const selectionClickMaxDistance = 5

const selectionOutlineColor = new Color3(1, 1, 1)

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
}: SelectionControllerOptions) => {
  let selectedMesh: AbstractMesh | null = null
  const selectionOutlineLayer = new SelectionOutlineLayer('selectionOutline', scene, {
    mainTextureRatio: 1,
    mainTextureSamples: 1,
    useDepthOcclusion: true,
  })
  selectionOutlineLayer.outlineColor = selectionOutlineColor
  selectionOutlineLayer.outlineThickness = 2
  selectionOutlineLayer.occlusionStrength = 1
  let focusAnimation: FocusAnimation | null = null
  let lastFocusedTarget: FocusTarget | null = null
  let pointerSelectionState:
    | {
        x: number
        y: number
        button: number
        dragged: boolean
      }
    | null = null
  const activeTouchPointers = new Map<number, { x: number, y: number }>()

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

  const clearSelection = () => {
    if (selectedMesh) {
      selectionOutlineLayer.clearSelection()
      selectedMesh = null
    }
    lastFocusedTarget = null

    focusAnimation = null
    onClearDetail()
    onOutlineChanged()
  }

  const selectMesh = (mesh: AbstractMesh) => {
    if (!mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0 || !mesh.isPickable) {
      return
    }

    if (selectedMesh && selectedMesh !== mesh) {
      selectionOutlineLayer.clearSelection()
      lastFocusedTarget = null
    }
    if (selectedMesh === null) {
      lastFocusedTarget = null
    }

    selectedMesh = mesh
    if (mesh instanceof Mesh) {
      // SelectionOutlineLayer produces only a silhouette contour, so DTAA's
      // transparent interior stays visible instead of being filled by the
      // replacement shader used by HighlightLayer.
      selectionOutlineLayer.clearSelection()
      selectionOutlineLayer.addSelection(mesh)
    }
    onSelectDetail(`mesh:${mesh.uniqueId}`)
  }

  const getFocusRadius = (bounds: { center: Vector3, radius: number }, forceResetZoom: boolean) => {
    const currentRadius = camera.radius
    const idealRadius = Math.max(bounds.radius * 2.5, camera.lowerRadiusLimit ?? 0.1)
    
    if (forceResetZoom) {
      return idealRadius
    }

    if (selectedMesh) {
      // Always preserve the current radius when focusing/rotating a single mesh/part
      return currentRadius
    }
    
    return idealRadius
  }

  const startSelectedFocusAnimation = () => {
    const target = selectedMesh
    if (!target || lastFocusedTarget === target) {
      return
    }

    const bounds = getFocusBoundsForTarget(target)
    if (!bounds) {
      return
    }

    lastFocusedTarget = target
    focusAnimation = {
      elapsed: 0,
      duration: 0.55,
      from: camera.target.clone(),
      to: bounds.center,
      fromRadius: camera.radius,
      toRadius: getFocusRadius(bounds, false),
      target,
    }
  }

  const startFocusAnimationForTarget = (target: FocusTarget) => {
    const bounds = getFocusBoundsForTarget(target)
    if (!bounds) {
      return
    }

    lastFocusedTarget = target
    focusAnimation = {
      elapsed: 0,
      duration: 0.55,
      from: camera.target.clone(),
      to: bounds.center,
      fromRadius: camera.radius,
      toRadius: getFocusRadius(bounds, true),
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

    const pickInfo = scene.pick(
      scene.pointerX,
      scene.pointerY,
      (mesh) =>
        getImportedMeshes().includes(mesh) &&
        mesh.isEnabled() &&
        mesh.isVisible &&
        mesh.visibility > 0 &&
        mesh.isPickable,
    )

    if (pickInfo?.hit && pickInfo.pickedMesh) {
      selectMesh(pickInfo.pickedMesh)
    }
  })

  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerType !== 'touch') {
      return
    }

    activeTouchPointers.delete(event.pointerId)

    pointerSelectionState = null
  })

  return {
    clearSelection,
    getMeshFromDetailId,
    getMeshesForRoot,
    getSelectedMesh: () => selectedMesh,
    selectMesh,
    startFocusAnimationForTarget,
    updateFocusAnimation,
  }
}

export type SelectionController = ReturnType<typeof createSelectionController>
