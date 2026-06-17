import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { DetailDescriptor } from '../../shared/types'
import {
  checkboxItem,
  colorItem,
  numberItem,
  textItem,
  vectorItems,
} from '../../ui/detailPanel'

type MeshDetailOptions = {
  mesh: AbstractMesh
  getReceiveSsao: (mesh: AbstractMesh) => boolean
  setReceiveSsao: (mesh: AbstractMesh, value: boolean) => void
}

export const createMeshDetail = ({
  mesh,
  getReceiveSsao,
  setReceiveSsao,
}: MeshDetailOptions): DetailDescriptor => ({
  title: mesh.name,
  kind: '\u7f51\u683c',
  sections: [
    {
      title: '\u663e\u793a',
      items: [
        numberItem('\u900f\u660e\u5ea6', mesh.visibility, 0, 1, 0.01, (value) => {
          mesh.visibility = value
        }),
        checkboxItem('\u63a5\u6536\u9634\u5f71', mesh.receiveShadows, (value) => {
          mesh.receiveShadows = value
        }),
        checkboxItem('\u63a5\u6536 SSAO', getReceiveSsao(mesh), (value) => {
          setReceiveSsao(mesh, value)
        }),
      ],
    },
    {
      title: '\u4f4d\u7f6e',
      items: vectorItems(mesh.position, ['X', 'Y', 'Z'], -200, 200, 0.01),
    },
    {
      title: '\u65cb\u8f6c',
      items: vectorItems(mesh.rotation, ['X', 'Y', 'Z'], -Math.PI, Math.PI, 0.01),
    },
    {
      title: '\u7f29\u653e',
      items: vectorItems(mesh.scaling, ['X', 'Y', 'Z'], 0.01, 10, 0.01),
    },
  ],
})

type MaterialDetailOptions = {
  material: PBRMaterial
  refreshImportedRenderingState: () => void
}

export const createMaterialDetail = ({
  material,
  refreshImportedRenderingState,
}: MaterialDetailOptions): DetailDescriptor => ({
  title: material.name,
  kind: '\u6750\u8d28',
  sections: [
    {
      title: '\u57fa\u7840',
      items: [
        numberItem('Alpha', material.alpha, 0, 1, 0.01, (value) => {
          material.alpha = value
          material.markAsDirty(Material.MiscDirtyFlag)
          refreshImportedRenderingState()
        }),
        numberItem('Metallic', material.metallic ?? 0, 0, 1, 0.01, (value) => {
          material.metallic = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        numberItem('Roughness', material.roughness ?? 0.5, 0, 1, 0.01, (value) => {
          material.roughness = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        colorItem('Albedo', material.albedoColor, (value) => {
          material.albedoColor = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        colorItem('Emissive', material.emissiveColor, (value) => {
          material.emissiveColor = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        checkboxItem('\u53cc\u9762\u6e32\u67d3', !material.backFaceCulling, (value) => {
          material.backFaceCulling = !value
          material.markAsDirty(Material.MiscDirtyFlag)
          refreshImportedRenderingState()
        }),
      ],
    },
    {
      title: '\u5149\u7167',
      items: [
        numberItem('Direct', material.directIntensity, 0, 2, 0.01, (value) => {
          material.directIntensity = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        numberItem('Environment', material.environmentIntensity, 0, 5, 0.01, (value) => {
          material.environmentIntensity = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        numberItem('Specular', material.specularIntensity, 0, 2, 0.01, (value) => {
          material.specularIntensity = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        numberItem('Max Lights', material.maxSimultaneousLights, 0, 8, 1, (value) => {
          material.maxSimultaneousLights = Math.round(value)
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
      ],
    },
    {
      title: '\u900f\u5c04 / \u6b21\u8868\u9762',
      items: [
        checkboxItem('\u900f\u5c04', material.subSurface.isRefractionEnabled, (value) => {
          material.subSurface.isRefractionEnabled = value
          material.markAsDirty(Material.MiscDirtyFlag)
          refreshImportedRenderingState()
        }),
        numberItem('\u900f\u5c04\u5f3a\u5ea6', material.subSurface.refractionIntensity, 0, 1, 0.01, (value) => {
          material.subSurface.refractionIntensity = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        checkboxItem('\u6b21\u8868\u9762\u534a\u900f\u660e', material.subSurface.isTranslucencyEnabled, (value) => {
          material.subSurface.isTranslucencyEnabled = value
          material.markAsDirty(Material.MiscDirtyFlag)
          refreshImportedRenderingState()
        }),
        numberItem('\u6b21\u8868\u9762\u5f3a\u5ea6', material.subSurface.translucencyIntensity, 0, 1, 0.01, (value) => {
          material.subSurface.translucencyIntensity = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        checkboxItem('\u6b21\u8868\u9762\u6563\u5c04', material.subSurface.isScatteringEnabled, (value) => {
          material.subSurface.isScatteringEnabled = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
        numberItem('IOR', material.subSurface.indexOfRefraction, 1, 2.5, 0.01, (value) => {
          material.subSurface.indexOfRefraction = value
          material.markAsDirty(Material.MiscDirtyFlag)
        }),
      ],
    },
  ],
})

type ModelDetailOptions = {
  root: TransformNode
  meshes: AbstractMesh[]
  onExplosionChange: (value: number) => void
}

export const createModelDetail = ({
  root,
  meshes,
  onExplosionChange,
}: ModelDetailOptions): DetailDescriptor => {
  root.metadata = root.metadata || {}
  const intensity = root.metadata.explosionIntensity ?? 0

  return {
    title: root.name.replace(/Root$/i, ''),
    kind: '模型',
    sections: [
      {
        title: '基本信息',
        items: [
          textItem('零件数量', String(meshes.length)),
        ],
      },
      {
        title: '结构炸开',
        items: [
          numberItem('炸开力度', intensity, 0, 1, 0.01, (value) => {
            onExplosionChange(value)
          }),
        ],
      },
      {
        title: '位置',
        items: vectorItems(root.position, ['X', 'Y', 'Z'], -200, 200, 0.01),
      },
      {
        title: '旋转',
        items: vectorItems(root.rotation, ['X', 'Y', 'Z'], -Math.PI, Math.PI, 0.01),
      },
      {
        title: '缩放',
        items: vectorItems(root.scaling, ['X', 'Y', 'Z'], 0.01, 10, 0.01),
      },
    ],
  }
}

