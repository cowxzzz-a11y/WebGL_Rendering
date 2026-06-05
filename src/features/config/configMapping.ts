import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { ColorConfig, VectorConfig } from './viewerConfig'

export const vectorToConfig = (vector: Vector3): VectorConfig => [vector.x, vector.y, vector.z]

export const colorToConfig = (color: Color3 | Color4): ColorConfig => [color.r, color.g, color.b]

export const assignVector = (target: Vector3, config: VectorConfig) => {
  target.x = config[0]
  target.y = config[1]
  target.z = config[2]
}

export const assignColor3 = (target: Color3, config: ColorConfig) => {
  target.r = config[0]
  target.g = config[1]
  target.b = config[2]
}

