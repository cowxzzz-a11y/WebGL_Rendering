import type { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import type { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { Texture } from '@babylonjs/core/Materials/Textures/texture'

export type OutlineNode = {
  name: string
  kind: string
  detailId?: string
  focusTarget?: AbstractMesh | TransformNode
  visibilityTarget?: {
    getVisible: () => boolean
    setVisible: (visible: boolean) => void
  }
  open?: boolean
  children?: OutlineNode[]
}

export type PanelTab = {
  id: string
  label: string
  nodes: OutlineNode[]
}

export type DetailItem =
  | {
      type: 'number'
      label: string
      value: number
      min?: number
      max?: number
      step?: number
      onChange: (value: number) => void
    }
  | {
      type: 'color'
      label: string
      value: Color3 | Color4
      onChange: (value: Color3) => void
    }
  | {
      type: 'checkbox'
      label: string
      value: boolean
      onChange: (value: boolean) => void
    }
  | {
      type: 'text'
      label: string
      value: string
    }
  | {
      type: 'select'
      label: string
      value: string
      options: Array<{
        label: string
        value: string
      }>
      onChange: (value: string) => void
    }

export type DetailSection = {
  title: string
  items: DetailItem[]
}

export type DetailDescriptor = {
  title: string
  kind: string
  sections: DetailSection[]
}

export type BillboardBinding = {
  profileId: string
  mesh: AbstractMesh
  material: StandardMaterial
  texture: Texture
  originalMaterial: AbstractMesh['material']
  originalReceiveShadows: boolean
  originalBillboardMode: number
  originalRotation: Vector3
  originalRotationQuaternion: Quaternion | null
  originalHorizontalNormal: Vector3
}

export type DefaultModel = {
  url: string
  fileName: string
}

export type EnvironmentOption = {
  key: string
  label: string
  loadUrl: () => Promise<string>
  resolvedUrl: string | null
}

export type QRCodeInstance = {
  addData: (text: string) => void
  make: () => void
  getModuleCount: () => number
  isDark: (row: number, col: number) => boolean
}

export type QRCodeFactory = (typeNumber: number, errorCorrectionLevel: string) => QRCodeInstance

export type WindowWithQRCode = Window & { qrcode?: QRCodeFactory }

export type ArcRotateTouchInput = {
  angularSensibilityX: number
  angularSensibilityY: number
  multiTouchPanAndZoom: boolean
  multiTouchPanning: boolean
  panningSensibility: number
  pinchDeltaPercentage: number
  pinchPrecision: number
  pinchZoom: boolean
  useNaturalPinchZoom: boolean
}

export type BakeTargetGroup = {
  id: string
  label: string
  meshes: AbstractMesh[]
}
