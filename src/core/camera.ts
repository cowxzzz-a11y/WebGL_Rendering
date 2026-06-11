import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
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

const getWheelDeltaPercentage = (controlRadius: number) => {
  if (controlRadius <= 1.5) {
    return 0.025
  }

  if (controlRadius <= 8) {
    return 0.035
  }

  return 0.045
}

const getPinchDeltaPercentage = (controlRadius: number) => {
  if (controlRadius <= 1.5) {
    return 0.008
  }

  if (controlRadius <= 8) {
    return 0.012
  }

  return 0.014
}

const getScaledPanSpeed = (controlRadius: number) => {
  return clamp(controlRadius / 180, 0.06, 1)
}

export const createViewerCamera = ({ canvas, scene }: CreateViewerCameraOptions) => {
  const camera = new ArcRotateCamera('Camera', -Math.PI / 2.15, Math.PI / 2.62, 8, new Vector3(0, 1.5, 0), scene)

  camera.fov = 0.72
  camera.wheelPrecision = 8
  camera.wheelDeltaPercentage = 0.06
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

  camera.lowerRadiusLimit = Math.max(controlRadius * 0.02, 0.03)
  camera.upperRadiusLimit = Math.max(controlRadius * 12, 8)
  camera.wheelDeltaPercentage = getWheelDeltaPercentage(controlRadius)
  camera.pinchDeltaPercentage = getPinchDeltaPercentage(controlRadius)
  camera.panningSensibility = defaultPanningSensibility
  camera.panningInertia = 0.35
  camera.panningDistanceLimit = Math.max(controlRadius * 1.25, 1.5)
  camera.panningOriginTarget.copyFrom(sceneCenter ?? camera.target)
  camera.movement.panSpeed = getScaledPanSpeed(controlRadius)
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
  pointersInput.panningSensibility = defaultPanningSensibility
  pointersInput.angularSensibilityX = isMobileViewport() ? 780 : 1000
  pointersInput.angularSensibilityY = isMobileViewport() ? 780 : 1000
}
