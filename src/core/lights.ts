import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'

export const createSceneLights = (scene: Scene) => {
  const hemiLight = new HemisphericLight('HemiLight', new Vector3(0, 1, 0), scene)
  hemiLight.intensity = 0.25
  hemiLight.diffuse = new Color3(0.9, 0.94, 1)
  hemiLight.groundColor = new Color3(0.12, 0.13, 0.14)

  const sunLight = new DirectionalLight('SunLight', new Vector3(-0.52, -0.82, -0.28), scene)
  sunLight.intensity = 3
  sunLight.diffuse = new Color3(1, 0.965, 0.91)
  sunLight.specular = new Color3(0.65, 0.62, 0.58)
  sunLight.position = new Vector3(8, 10, 6)

  return { hemiLight, sunLight }
}
