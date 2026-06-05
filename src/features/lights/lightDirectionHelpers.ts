import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'

type LightDirectionHelperId = 'hemi' | 'sun'

type LightDirectionHelperOptions = {
  scene: Scene
  getSceneCenter: () => Vector3
  getSceneRadius: () => number
}

const getArrowGeometry = (direction: Vector3, sceneCenter: Vector3, sceneRadius: number) => {
  const normalized = direction.lengthSquared() > 0.0001 ? direction.normalizeToNew() : new Vector3(0, -1, 0)
  const length = Math.max(sceneRadius * 1.15, 7)
  const start = sceneCenter.subtract(normalized.scale(length * 0.5))
  const end = sceneCenter.add(normalized.scale(length * 0.5))
  const headLength = length * 0.18
  const shaftLength = length - headLength
  const shaftDiameter = Math.max(sceneRadius * 0.018, 0.08)
  const headDiameter = Math.max(sceneRadius * 0.085, 0.36)
  const headBase = end.subtract(normalized.scale(headLength))

  return {
    normalized,
    shaftCenter: start.add(headBase).scale(0.5),
    shaftDiameter,
    shaftLength,
    headCenter: headBase.add(normalized.scale(headLength * 0.5)),
    headDiameter,
    headLength,
  }
}

export const createLightDirectionHelperController = ({
  scene,
  getSceneCenter,
  getSceneRadius,
}: LightDirectionHelperOptions) => {
  const helpers = new Map<LightDirectionHelperId, TransformNode>()

  const setHelper = (id: LightDirectionHelperId, direction: Vector3, color: Color3, visible: boolean) => {
    const currentHelper = helpers.get(id)

    if (!visible) {
      currentHelper?.dispose(false, true)
      helpers.delete(id)
      return
    }

    currentHelper?.dispose(false, true)

    const geometry = getArrowGeometry(direction, getSceneCenter(), getSceneRadius())
    const rotation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), geometry.normalized, new Quaternion())
    const root = new TransformNode(`${id}LightDirectionHelper`, scene)
    const material = new StandardMaterial(`${id}LightDirectionHelperMaterial`, scene)

    material.diffuseColor = color
    material.emissiveColor = color
    material.disableLighting = true
    material.disableDepthWrite = true

    const shaft = MeshBuilder.CreateCylinder(
      `${id}LightDirectionHelperShaft`,
      {
        height: geometry.shaftLength,
        diameter: geometry.shaftDiameter,
        tessellation: 18,
      },
      scene,
    )
    shaft.position.copyFrom(geometry.shaftCenter)
    shaft.rotationQuaternion = rotation.clone()
    shaft.material = material
    shaft.parent = root

    const head = MeshBuilder.CreateCylinder(
      `${id}LightDirectionHelperHead`,
      {
        height: geometry.headLength,
        diameterTop: 0,
        diameterBottom: geometry.headDiameter,
        tessellation: 24,
      },
      scene,
    )
    head.position.copyFrom(geometry.headCenter)
    head.rotationQuaternion = rotation.clone()
    head.material = material
    head.parent = root

    ;[shaft, head].forEach((mesh) => {
      mesh.isPickable = false
      mesh.alwaysSelectAsActiveMesh = true
      mesh.renderingGroupId = 3
    })

    helpers.set(id, root)
  }

  return {
    dispose: () => {
      helpers.forEach((helper) => helper.dispose(false, true))
      helpers.clear()
    },
    setHelper,
  }
}

export type LightDirectionHelperController = ReturnType<typeof createLightDirectionHelperController>
