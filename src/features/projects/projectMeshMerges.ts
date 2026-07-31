import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { ProjectMeshMergeRuleConfig } from './projectAssets'

export type ProjectMeshMergeResult = {
  root: TransformNode
  mergedMesh: Mesh
  sourceMeshes: Mesh[]
}

export const applyProjectMeshMergeRules = ({
  rules,
  modelRoots,
  modelFileNames,
  getMeshesForRoot,
}: {
  rules: ProjectMeshMergeRuleConfig[]
  modelRoots: TransformNode[]
  modelFileNames: string[]
  getMeshesForRoot: (root: TransformNode) => AbstractMesh[]
}) => {
  const results: ProjectMeshMergeResult[] = []

  rules.forEach((rule) => {
    modelRoots.forEach((root, modelIndex) => {
      const modelFileName = modelFileNames[modelIndex] ?? root.name
      if (rule.model && modelFileName.toLocaleLowerCase() !== rule.model.toLocaleLowerCase()) {
        return
      }

      const sourceMeshes = getMeshesForRoot(root)
        .filter((mesh): mesh is Mesh =>
          mesh instanceof Mesh
          &&
          !mesh.isDisposed()
          && Boolean(mesh.geometry)
          && mesh.name.includes(rule.meshIncludes)
        )

      if (sourceMeshes.length === 0) {
        return
      }

      if (sourceMeshes.length === 1) {
        sourceMeshes[0].name = rule.name
        sourceMeshes[0].id = rule.name
        return
      }

      const receiveShadows = sourceMeshes.some((mesh) => mesh.receiveShadows)
      const mergedMesh = Mesh.MergeMeshes(
        sourceMeshes,
        true,
        true,
        undefined,
        true,
        true,
      )

      if (!mergedMesh) {
        console.warn(`Project mesh merge failed: ${modelFileName}/${rule.meshIncludes}`)
        return
      }

      mergedMesh.name = rule.name
      mergedMesh.id = rule.name
      mergedMesh.parent = root
      mergedMesh.receiveShadows = receiveShadows
      mergedMesh.isPickable = true
      mergedMesh.computeWorldMatrix(true)
      mergedMesh.refreshBoundingInfo(true, false)

      results.push({
        root,
        mergedMesh,
        sourceMeshes,
      })
    })
  })

  return results
}
