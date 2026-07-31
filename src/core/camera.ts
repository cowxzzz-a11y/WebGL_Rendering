import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { ArcRotateCameraMouseWheelInput } from '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { ArcRotateTouchInput } from '../shared/types'

type CreateViewerCameraOptions = {
  canvas: HTMLCanvasElement
  scene: Scene
}

type TuneTouchCameraControlsOptions = {
  camera: ArcRotateCamera
  sceneCenter?: Vector3
  sceneRadius?: number
}

const defaultSceneControlRadius = 8
const minimumSceneControlRadius = 0.75
const defaultPanningSensibility = 11

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const getControlRadius = (sceneRadius: number | undefined) =>
  Math.max(sceneRadius ?? defaultSceneControlRadius, minimumSceneControlRadius)

const getPinchDeltaPercentage = (controlRadius: number) => {
  if (controlRadius <= 1.5) {
    return 0.008
  }

  if (controlRadius <= 8) {
    return 0.012
  }

  return 0.014
}

const getPanWorldUnitsPerPixel = (camera: ArcRotateCamera, controlRadius: number) => {
  const viewportHeight = Math.max(camera.getEngine().getRenderHeight(), 1)
  return clamp((controlRadius * 0.34) / viewportHeight, 0.00002, 32)
}

const getZoomWorldUnitsPerWheelUnit = (radius: number) =>
  Math.max(radius / 150, 0.0001)

export const createViewerCamera = ({ canvas, scene }: CreateViewerCameraOptions) => {
  const camera = new ArcRotateCamera('Camera', -Math.PI / 2.15, Math.PI / 2.62, 8, new Vector3(0, 1.5, 0), scene)

  camera.fov = 0.72
  camera.wheelPrecision = 2
  camera.wheelDeltaPercentage = 0
  camera.pinchPrecision = 28
  camera.pinchDeltaPercentage = 0.012
  camera.useNaturalPinchZoom = true
  camera.panningInertia = 0.35
  camera.lowerRadiusLimit = 0.35
  camera.upperRadiusLimit = 500
  camera.lowerBetaLimit = 0.18
  camera.upperBetaLimit = Math.PI / 2.02
  camera.panningSensibility = defaultPanningSensibility
  camera.panningDistanceLimit = null
  camera.attachControl(canvas, true)

  return camera
}

export const isMobileViewport = () => window.matchMedia('(pointer: coarse), (max-width: 760px)').matches

export const clearCameraInertia = (camera: ArcRotateCamera) => {
  camera.inertialAlphaOffset = 0
  camera.inertialBetaOffset = 0
  camera.inertialRadiusOffset = 0
  camera.inertialPanningX = 0
  camera.inertialPanningY = 0
  camera.movement.resetPanVelocity()
}

export const setSinglePointerPanMode = (camera: ArcRotateCamera, enabled: boolean) => {
  camera.movement.input.setInteraction('pointer', { button: 0, modifiers: {} }, enabled ? 'pan' : 'rotate')
  clearCameraInertia(camera)
}

export const tuneTouchCameraControls = ({
  camera,
  sceneCenter,
  sceneRadius,
}: TuneTouchCameraControlsOptions) => {
  const controlRadius = getControlRadius(sceneRadius)
  const pointersInput = camera.inputs.attached.pointers as Partial<ArcRotateTouchInput> | undefined
  const mouseWheelInput = camera.inputs.attached.mousewheel as ArcRotateCameraMouseWheelInput | undefined

  const panningSens = clamp(defaultPanningSensibility * (8 / controlRadius), 2, 2000)
  const panWorldUnitsPerPixel = getPanWorldUnitsPerPixel(camera, controlRadius)

  camera.lowerRadiusLimit = Math.max(controlRadius * 0.02, 0.03)
  camera.upperRadiusLimit = Math.max(controlRadius * 12, 8)
  // Keep percentage zoom disabled so Babylon actually uses wheelPrecision.
  camera.wheelDeltaPercentage = 0
  camera.pinchDeltaPercentage = getPinchDeltaPercentage(controlRadius)
  camera.panningSensibility = panningSens
  camera.panningInertia = 0.35
  camera.panningDistanceLimit = Math.max(controlRadius * 1.25, 1.5)
  camera.panningOriginTarget.copyFrom(sceneCenter ?? camera.target)
  // The pointer input already divides by panningSensibility. Multiplying by
  // panningSens here would cancel the user's setting and make the slider inert.
  camera.movement.panSpeed = panWorldUnitsPerPixel
  // Babylon 9 applies wheelPrecision before movement.zoomSpeed. Scale that
  // world-space speed with the current camera distance while keeping each
  // project's wheelPrecision active.
  camera.movement.zoomSpeed = getZoomWorldUnitsPerWheelUnit(camera.radius)
  if (mouseWheelInput) {
    mouseWheelInput.customComputeDeltaFromMouseWheel = (wheelDelta, input) => {
      camera.movement.zoomSpeed = getZoomWorldUnitsPerWheelUnit(camera.radius)
      return wheelDelta / (Math.max(input.wheelPrecision, 0.01) * 40)
    }
  }
  camera.movement.resetPanVelocity()

  if (!pointersInput) {
    return
  }

  pointersInput.multiTouchPanning = true
  pointersInput.multiTouchPanAndZoom = true
  pointersInput.pinchZoom = true
  pointersInput.useNaturalPinchZoom = true
  pointersInput.pinchPrecision = isMobileViewport() ? 22 : 28
  pointersInput.pinchDeltaPercentage = getPinchDeltaPercentage(controlRadius)
  pointersInput.panningSensibility = panningSens
  pointersInput.angularSensibilityX = isMobileViewport() ? 780 : 1000
  pointersInput.angularSensibilityY = isMobileViewport() ? 780 : 1000
}
