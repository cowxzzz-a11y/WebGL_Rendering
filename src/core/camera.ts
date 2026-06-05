import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { ArcRotateTouchInput } from '../shared/types'

type CreateViewerCameraOptions = {
  canvas: HTMLCanvasElement
  scene: Scene
  desktopPanningSensibility: number
}

type TuneTouchCameraControlsOptions = {
  camera: ArcRotateCamera
  desktopPanningSensibility: number
  mobilePanningSensibility: number
}

export const createViewerCamera = ({ canvas, scene, desktopPanningSensibility }: CreateViewerCameraOptions) => {
  const camera = new ArcRotateCamera('Camera', -Math.PI / 2.15, Math.PI / 2.62, 8, new Vector3(0, 1.5, 0), scene)

  camera.fov = 0.72
  camera.wheelPrecision = 8
  camera.wheelDeltaPercentage = 0.06
  camera.pinchPrecision = 28
  camera.pinchDeltaPercentage = 0.012
  camera.useNaturalPinchZoom = true
  camera.lowerRadiusLimit = 0.35
  camera.upperRadiusLimit = 500
  camera.lowerBetaLimit = 0.18
  camera.upperBetaLimit = Math.PI / 2.02
  camera.panningSensibility = desktopPanningSensibility
  camera.panningDistanceLimit = null
  camera.attachControl(canvas, true)

  return camera
}

export const isMobileViewport = () => window.matchMedia('(pointer: coarse), (max-width: 760px)').matches

export const tuneTouchCameraControls = ({
  camera,
  desktopPanningSensibility,
  mobilePanningSensibility,
}: TuneTouchCameraControlsOptions) => {
  const panningSensibility = isMobileViewport() ? mobilePanningSensibility : desktopPanningSensibility
  const pointersInput = camera.inputs.attached.pointers as Partial<ArcRotateTouchInput> | undefined

  camera.panningSensibility = panningSensibility

  if (!pointersInput) {
    return
  }

  pointersInput.multiTouchPanning = true
  pointersInput.multiTouchPanAndZoom = true
  pointersInput.pinchZoom = true
  pointersInput.useNaturalPinchZoom = true
  pointersInput.pinchPrecision = isMobileViewport() ? 22 : 28
  pointersInput.pinchDeltaPercentage = isMobileViewport() ? 0.016 : 0.012
  pointersInput.panningSensibility = panningSensibility
  pointersInput.angularSensibilityX = isMobileViewport() ? 780 : 1000
  pointersInput.angularSensibilityY = isMobileViewport() ? 780 : 1000
}

