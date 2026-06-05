import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { DetailDescriptor } from '../../shared/types'
import {
  checkboxItem,
  colorItem,
  numberItem,
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
          refreshImportedRenderingState()
        }),
        numberItem('Metallic', material.metallic ?? 0, 0, 1, 0.01, (value) => {
          material.metallic = value
        }),
        numberItem('Roughness', material.roughness ?? 0.5, 0, 1, 0.01, (value) => {
          material.roughness = value
        }),
        colorItem('Albedo', material.albedoColor, (value) => {
          material.albedoColor = value
        }),
        colorItem('Emissive', material.emissiveColor, (value) => {
          material.emissiveColor = value
        }),
        checkboxItem('\u53cc\u9762\u6e32\u67d3', !material.backFaceCulling, (value) => {
          material.backFaceCulling = !value
          refreshImportedRenderingState()
        }),
      ],
    },
    {
      title: '\u5149\u7167',
      items: [
        numberItem('Direct', material.directIntensity, 0, 2, 0.01, (value) => {
          material.directIntensity = value
        }),
        numberItem('Environment', material.environmentIntensity, 0, 5, 0.01, (value) => {
          material.environmentIntensity = value
        }),
        numberItem('Specular', material.specularIntensity, 0, 2, 0.01, (value) => {
          material.specularIntensity = value
        }),
        numberItem('Max Lights', material.maxSimultaneousLights, 0, 8, 1, (value) => {
          material.maxSimultaneousLights = Math.round(value)
        }),
      ],
    },
    {
      title: '\u900f\u5c04 / \u6b21\u8868\u9762',
      items: [
        checkboxItem('\u900f\u5c04', material.subSurface.isRefractionEnabled, (value) => {
          material.subSurface.isRefractionEnabled = value
          refreshImportedRenderingState()
        }),
        numberItem('\u900f\u5c04\u5f3a\u5ea6', material.subSurface.refractionIntensity, 0, 1, 0.01, (value) => {
          material.subSurface.refractionIntensity = value
        }),
        checkboxItem('\u6b21\u8868\u9762\u534a\u900f\u660e', material.subSurface.isTranslucencyEnabled, (value) => {
          material.subSurface.isTranslucencyEnabled = value
          refreshImportedRenderingState()
        }),
        numberItem('\u6b21\u8868\u9762\u5f3a\u5ea6', material.subSurface.translucencyIntensity, 0, 1, 0.01, (value) => {
          material.subSurface.translucencyIntensity = value
        }),
        checkboxItem('\u6b21\u8868\u9762\u6563\u5c04', material.subSurface.isScatteringEnabled, (value) => {
          material.subSurface.isScatteringEnabled = value
        }),
        numberItem('IOR', material.subSurface.indexOfRefraction, 1, 2.5, 0.01, (value) => {
          material.subSurface.indexOfRefraction = value
        }),
      ],
    },
  ],
})
