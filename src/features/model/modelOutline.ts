import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { OutlineNode } from '../../shared/types'

export const getImportedDisplayName = (currentFileName: string, importedFileNames: string[]) => {
  if (importedFileNames.length === 0) {
    return currentFileName
  }

  if (importedFileNames.length === 1) {
    return importedFileNames[0]
  }

  return `${importedFileNames.length} \u4e2a GLB`
}

export const makeMeshOutlineNodes = (meshes: AbstractMesh[]): OutlineNode[] =>
  meshes.filter((mesh) => mesh.name !== '_root' && mesh.name !== '__root__').map((mesh) => ({
    name: mesh.name || `Mesh ${mesh.uniqueId}`,
    kind: 'mesh',
    detailId: `mesh:${mesh.uniqueId}`,
    focusTarget: mesh,
    visibilityTarget: {
      getVisible: () => mesh.isVisible,
      setVisible: (visible) => {
        mesh.isVisible = visible
      },
    },
    open: false,
  }))

export const makeModelOutlineNode = (fileName: string, root: TransformNode, meshes: AbstractMesh[]): OutlineNode => ({
  name: fileName,
  kind: 'model',
  detailId: `model:${root.uniqueId}`,
  focusTarget: root,
  visibilityTarget: {
    getVisible: () => root.isEnabled(false),
    setVisible: (visible) => {
      root.setEnabled(visible)
    },
  },
  open: false,
  children: makeMeshOutlineNodes(meshes),
})
