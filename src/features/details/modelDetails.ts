import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Material } from '@babylonjs/core/Materials/material'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { DetailDescriptor } from '../../shared/types'
import {
  checkboxItem,
  colorItem,
  numberItem,
  textItem,
  vector3Item,
} from '../../ui/detailPanel'

type MeshDetailOptions = {
  mesh: AbstractMesh
  getReceiveSsao: (mesh: AbstractMesh) => boolean
  setReceiveSsao: (mesh: AbstractMesh, value: boolean) => void
  createMaterialDetail: (material: Material) => DetailDescriptor
}

const setVectorAxis = (
  vector: { x: number, y: number, z: number },
  axis: 0 | 1 | 2,
  value: number,
) => {
  if (axis === 0) vector.x = value
  if (axis === 1) vector.y = value
  if (axis === 2) vector.z = value
}

export const createMeshDetail = ({
  mesh,
  getReceiveSsao,
  setReceiveSsao,
  createMaterialDetail,
}: MeshDetailOptions): DetailDescriptor => {
  const materials = mesh.material instanceof MultiMaterial
    ? mesh.material.subMaterials.filter((material): material is Material => material instanceof Material)
    : mesh.material instanceof Material
      ? [mesh.material]
      : []
  const materialTabs = materials.map((material, index) => {
    const detail = createMaterialDetail(material)
    return {
      id: String(material.uniqueId),
      label: detail.title || `材质 ${index + 1}`,
      kind: detail.kind,
      sections: detail.sections,
    }
  })
  const rotationDegrees: [number, number, number] = [
    mesh.rotation.x * 180 / Math.PI,
    mesh.rotation.y * 180 / Math.PI,
    mesh.rotation.z * 180 / Math.PI,
  ]

  return {
    title: mesh.name,
    kind: '\u7f51\u683c',
    sections: [
    {
      title: '\u663e\u793a',
      items: [
        checkboxItem('\u63a5\u6536\u9634\u5f71', mesh.receiveShadows, (value) => {
          mesh.receiveShadows = value
        }),
        checkboxItem('\u63a5\u6536 SSAO', getReceiveSsao(mesh), (value) => {
          setReceiveSsao(mesh, value)
        }),
      ],
    },
    {
      title: '\u53d8\u6362',
      items: [
        vector3Item('位置', [mesh.position.x, mesh.position.y, mesh.position.z], -200, 200, 0.01, (axis, value) => {
          setVectorAxis(mesh.position, axis, value)
        }),
        vector3Item('旋转', rotationDegrees, -360, 360, 0.1, (axis, value) => {
          setVectorAxis(mesh.rotation, axis, value * Math.PI / 180)
        }),
        vector3Item('缩放', [mesh.scaling.x, mesh.scaling.y, mesh.scaling.z], 0.01, 100, 0.01, (axis, value) => {
          setVectorAxis(mesh.scaling, axis, value)
        }),
      ],
    },
  ],
    tabs: materialTabs,
  }
}

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
  dtaaOpacity?: number
  dtaaMaterialCount?: number
  onDtaaOpacityChange?: (value: number) => void
}

export const createModelDetail = ({
  root,
  meshes,
  dtaaOpacity,
  dtaaMaterialCount = 0,
  onDtaaOpacityChange,
}: ModelDetailOptions): DetailDescriptor => {
  root.metadata = root.metadata || {}
  const rotationDegrees: [number, number, number] = [
    root.rotation.x * 180 / Math.PI,
    root.rotation.y * 180 / Math.PI,
    root.rotation.z * 180 / Math.PI,
  ]

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
        title: '变换',
        items: [
          vector3Item('位置', [root.position.x, root.position.y, root.position.z], -200, 200, 0.01, (axis, value) => {
            setVectorAxis(root.position, axis, value)
          }),
          vector3Item('旋转', rotationDegrees, -360, 360, 0.1, (axis, value) => {
            setVectorAxis(root.rotation, axis, value * Math.PI / 180)
          }),
          vector3Item('缩放', [root.scaling.x, root.scaling.y, root.scaling.z], 0.01, 100, 0.01, (axis, value) => {
            setVectorAxis(root.scaling, axis, value)
          }),
        ],
      },
      ...(dtaaOpacity !== undefined && onDtaaOpacityChange
        ? [{
            title: 'DTAA 总控',
            items: [
              textItem('子材质数量', String(dtaaMaterialCount)),
              numberItem('统一透明度', dtaaOpacity, 0, 1, 0.01, onDtaaOpacityChange),
            ],
          }]
        : []),
    ],
  }
}

