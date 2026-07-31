import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import {
  applyDitherFadeMaterial,
  applyRiverWaterMaterial,
  applyStandardPbrMaterial,
  applyWaterfallMaterial,
} from '../content/materials'
import type { ProjectMaterialRuleConfig } from './projectAssets'

export const applyProjectMaterialRules = ({
  scene,
  camera,
  sunLight,
  rules,
  modelRoots,
  modelFileNames,
  getMeshesForRoot,
}: {
  scene: Scene
  camera: ArcRotateCamera
  sunLight: DirectionalLight
  rules: ProjectMaterialRuleConfig[]
  modelRoots: TransformNode[]
  modelFileNames: string[]
  getMeshesForRoot: (root: TransformNode) => AbstractMesh[]
}) => {
  let applied = 0

  rules.forEach((rule) => {
    modelRoots.forEach((root, modelIndex) => {
      const modelFileName = modelFileNames[modelIndex] ?? root.name
      if (rule.model && modelFileName.toLocaleLowerCase() !== rule.model.toLocaleLowerCase()) {
        return
      }

      getMeshesForRoot(root)
        .filter((mesh) => mesh.name.includes(rule.meshIncludes))
        .forEach((mesh) => {
          if (rule.material === 'riverWater') {
            applyRiverWaterMaterial({
              scene,
              camera,
              sunLight,
              mesh,
              waveScale: rule.waveScale,
            })
          } else if (rule.material === 'waterfall') {
            applyWaterfallMaterial({
              scene,
              camera,
              sunLight,
              mesh,
            })
          } else if (rule.material === 'dtaa') {
            applyDitherFadeMaterial({ scene, camera, sunLight, mesh })
          } else {
            applyStandardPbrMaterial({ scene, mesh })
          }
          applied += 1
        })
    })
  })

  return applied
}
