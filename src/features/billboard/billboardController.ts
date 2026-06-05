import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { BillboardBinding } from '../../shared/types'
import { createCheckbox, createModule, createNumberInput, createSlider } from '../../ui/controls'
import { clamp, degreesToRadians, radiansToDegrees } from '../../utils/math'

type BillboardControllerOptions = {
  camera: ArcRotateCamera
  scene: Scene
  getModelIndexForMesh: (mesh: AbstractMesh) => number
  getModelNameForMesh: (mesh: AbstractMesh) => string
  getModelNames: () => string[]
  getSelectableMeshes: () => AbstractMesh[]
  onRenderStateChanged: () => void
  onSceneCacheInvalidated: () => void
}

const getBillboardLocalNormal = (mesh: AbstractMesh) => {
  const positions = mesh.getVerticesData('position')

  if (!positions || positions.length < 3) {
    return Vector3.Forward()
  }

  const indices = mesh.getIndices()
  const getPosition = (vertexIndex: number) =>
    new Vector3(
      positions[vertexIndex * 3] ?? 0,
      positions[vertexIndex * 3 + 1] ?? 0,
      positions[vertexIndex * 3 + 2] ?? 0,
    )
  const getTriangleNormal = (a: number, b: number, c: number) => {
    const p0 = getPosition(a)
    const p1 = getPosition(b)
    const p2 = getPosition(c)
    const normal = Vector3.Cross(p1.subtract(p0), p2.subtract(p0))

    if (normal.lengthSquared() < 0.000001) {
      return null
    }

    return normal.normalize()
  }

  if (indices && indices.length >= 3) {
    for (let i = 0; i < indices.length - 2; i += 3) {
      const normal = getTriangleNormal(Number(indices[i]), Number(indices[i + 1]), Number(indices[i + 2]))

      if (normal) {
        return normal
      }
    }
  }

  for (let i = 0; i < positions.length / 3 - 2; i += 3) {
    const normal = getTriangleNormal(i, i + 1, i + 2)

    if (normal) {
      return normal
    }
  }

  return Vector3.Forward()
}

const getBillboardWorldHorizontalNormal = (mesh: AbstractMesh) => {
  mesh.computeWorldMatrix(true)
  const horizontal = Vector3.TransformNormal(getBillboardLocalNormal(mesh), mesh.getWorldMatrix())
  horizontal.y = 0

  if (horizontal.lengthSquared() < 0.000001) {
    return Vector3.Forward()
  }

  return horizontal.normalize()
}

export const createBillboardController = ({
  camera,
  scene,
  getModelIndexForMesh,
  getModelNameForMesh,
  getModelNames,
  getSelectableMeshes,
  onRenderStateChanged,
  onSceneCacheInvalidated,
}: BillboardControllerOptions) => {
  let selectedMeshIds = new Set<string>()
  let sheetUrl = ''
  let sheetFileName = ''
  let sheetWidth = 0
  let sheetHeight = 0
  let columns = 16
  let rows = 2
  let directions = 16
  let startFrame = 1
  let angleOffset = 0
  let pitchSplit = 25
  let removeBlack = false
  let alphaThreshold = 8
  let alphaFeather = 12
  let lockY = true
  let autoFrame = true
  let rotateMesh = true
  let doubleSided = true
  let modelFilter = '__all__'
  let sheetSourceFile: File | null = null
  const bindings = new Map<number, BillboardBinding>()

  const getTargetMeshes = () =>
    getSelectableMeshes().filter((mesh) => selectedMeshIds.has(String(mesh.uniqueId)))

  const normalizeFrameIndex = (index: number) => {
    const totalFrames = Math.max(1, columns * rows)
    return ((index % totalFrames) + totalFrames) % totalFrames
  }

  const applyFrame = (binding: BillboardBinding, frameIndex: number) => {
    const col = frameIndex % columns
    const row = Math.floor(frameIndex / columns)

    binding.texture.uScale = 1 / Math.max(1, columns)
    binding.texture.vScale = 1 / Math.max(1, rows)
    binding.texture.uOffset = col / Math.max(1, columns)
    binding.texture.vOffset = row / Math.max(1, rows)
  }

  const getFrameForMesh = (mesh: AbstractMesh) => {
    if (!autoFrame) {
      return normalizeFrameIndex(startFrame - 1)
    }

    const meshPosition = mesh.getAbsolutePosition()
    const cameraPosition = camera.position
    const dx = cameraPosition.x - meshPosition.x
    const dz = cameraPosition.z - meshPosition.z
    const horizontalDistance = Math.hypot(dx, dz)
    const elevation = radiansToDegrees(Math.atan2(cameraPosition.y - meshPosition.y, horizontalDistance))
    const angle = Math.atan2(dx, dz)
    const step = (Math.PI * 2) / Math.max(1, directions)
    const offset = degreesToRadians(angleOffset)
    const directionIndex = ((Math.round((angle + offset) / step) % directions) + directions) % directions
    const columnIndex = directionIndex % Math.max(1, columns)
    const rowIndex = Math.max(1, rows) > 1 && elevation >= pitchSplit ? 0 : Math.max(0, rows - 1)

    return normalizeFrameIndex(rowIndex * Math.max(1, columns) + columnIndex + startFrame - 1)
  }

  const update = () => {
    bindings.forEach((binding) => {
      binding.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_NONE
      binding.material.backFaceCulling = !doubleSided

      if (lockY && rotateMesh) {
        const toCamera = camera.position.subtract(binding.mesh.getAbsolutePosition())
        toCamera.y = 0

        if (toCamera.lengthSquared() > 0.000001) {
          toCamera.normalize()
          const cross = Vector3.Cross(binding.originalHorizontalNormal, toCamera)
          const dot = Vector3.Dot(binding.originalHorizontalNormal, toCamera)
          const yaw = Math.atan2(cross.y, dot)
          const yawRotation = Quaternion.RotationAxis(Vector3.Up(), yaw)
          const originalRotation = binding.originalRotationQuaternion ?? Quaternion.FromEulerAngles(
            binding.originalRotation.x,
            binding.originalRotation.y,
            binding.originalRotation.z,
          )
          binding.mesh.rotationQuaternion = yawRotation.multiply(originalRotation)
        }
      } else if (binding.originalRotationQuaternion) {
        binding.mesh.rotationQuaternion = binding.originalRotationQuaternion.clone()
      } else {
        binding.mesh.rotationQuaternion = null
        binding.mesh.rotation.copyFrom(binding.originalRotation)
      }

      applyFrame(binding, getFrameForMesh(binding.mesh))
    })
  }

  const removeFromMesh = (mesh: AbstractMesh) => {
    const binding = bindings.get(mesh.uniqueId)

    if (!binding) return

    mesh.material = binding.originalMaterial
    mesh.receiveShadows = binding.originalReceiveShadows
    mesh.billboardMode = binding.originalBillboardMode
    if (binding.originalRotationQuaternion) {
      mesh.rotationQuaternion = binding.originalRotationQuaternion.clone()
    } else {
      mesh.rotationQuaternion = null
      mesh.rotation.copyFrom(binding.originalRotation)
    }
    binding.texture.dispose()
    binding.material.dispose()
    bindings.delete(mesh.uniqueId)
    onRenderStateChanged()
  }

  const clearAll = () => {
    Array.from(bindings.values()).forEach((binding) => removeFromMesh(binding.mesh))
  }

  const applyToMesh = (mesh: AbstractMesh) => {
    if (!sheetUrl) return

    removeFromMesh(mesh)

    const texture = new Texture(sheetUrl, scene, false, false)
    texture.name = sheetFileName || '\u5e7f\u544a\u724c\u96ea\u78a7\u56fe'
    texture.hasAlpha = true
    texture.wrapU = Texture.CLAMP_ADDRESSMODE
    texture.wrapV = Texture.CLAMP_ADDRESSMODE

    const material = new StandardMaterial(`Billboard_${mesh.name || mesh.uniqueId}`, scene)
    material.diffuseTexture = texture
    material.diffuseColor = Color3.White()
    material.specularColor = Color3.Black()
    material.emissiveColor = Color3.White()
    material.disableLighting = true
    material.useAlphaFromDiffuseTexture = true
    material.backFaceCulling = !doubleSided
    material.transparencyMode = Material.MATERIAL_ALPHATEST
    material.alphaCutOff = 0.01
    material.needDepthPrePass = false
    material.forceDepthWrite = true

    const binding: BillboardBinding = {
      mesh,
      material,
      texture,
      originalMaterial: mesh.material,
      originalReceiveShadows: mesh.receiveShadows,
      originalBillboardMode: mesh.billboardMode,
      originalRotation: mesh.rotation.clone(),
      originalRotationQuaternion: mesh.rotationQuaternion?.clone() ?? null,
      originalHorizontalNormal: getBillboardWorldHorizontalNormal(mesh),
    }

    mesh.material = material
    mesh.receiveShadows = false
    mesh.billboardMode = AbstractMesh.BILLBOARDMODE_NONE
    bindings.set(mesh.uniqueId, binding)
    onRenderStateChanged()
    update()
    applyFrame(binding, getFrameForMesh(mesh))
  }

  const applyToTargets = () => {
    getTargetMeshes().forEach(applyToMesh)
    onSceneCacheInvalidated()
  }

  const createBlackMaskedUrl = (image: HTMLImageElement) =>
    new Promise<string>((resolve) => {
      const maskCanvas = document.createElement('canvas')
      const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })

      if (!maskContext) {
        resolve(image.src)
        return
      }

      maskCanvas.width = image.naturalWidth
      maskCanvas.height = image.naturalHeight
      maskContext.drawImage(image, 0, 0)

      const imageData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
      const data = imageData.data
      const threshold = Math.max(0, alphaThreshold)
      const feather = Math.max(1, alphaFeather)
      const cornerIndexes = [
        0,
        (maskCanvas.width - 1) * 4,
        (maskCanvas.width * (maskCanvas.height - 1)) * 4,
        (maskCanvas.width * maskCanvas.height - 1) * 4,
      ]
      const background = cornerIndexes.reduce(
        (acc, index) => {
          acc.r += data[index]
          acc.g += data[index + 1]
          acc.b += data[index + 2]
          return acc
        },
        { r: 0, g: 0, b: 0 },
      )
      background.r /= cornerIndexes.length
      background.g /= cornerIndexes.length
      background.b /= cornerIndexes.length

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const originalAlpha = data[i + 3]
        const distance = Math.hypot(r - background.r, g - background.g, b - background.b)
        const alphaFactor = clamp((distance - threshold) / feather, 0, 1)

        data[i + 3] = Math.round(originalAlpha * alphaFactor)
      }

      maskContext.putImageData(imageData, 0, 0)
      maskCanvas.toBlob((blob) => {
        resolve(blob ? URL.createObjectURL(blob) : image.src)
      }, 'image/png')
    })

  const loadSheetFile = (file: File, onReady?: () => void) => {
    if (sheetUrl) {
      URL.revokeObjectURL(sheetUrl)
    }

    const url = URL.createObjectURL(file)
    sheetSourceFile = file
    sheetUrl = ''
    sheetFileName = file.name
    sheetWidth = 0
    sheetHeight = 0

    const image = new Image()
    image.onload = async () => {
      sheetWidth = image.naturalWidth
      sheetHeight = image.naturalHeight
      sheetUrl = removeBlack ? await createBlackMaskedUrl(image) : url

      if (sheetUrl !== url) {
        URL.revokeObjectURL(url)
      }

      onReady?.()
    }
    image.onerror = () => {
      sheetUrl = url
      onReady?.()
    }
    image.src = url
  }

  const reloadSheetProcessing = (onReady?: () => void) => {
    if (!sheetSourceFile) {
      onReady?.()
      return
    }

    const appliedMeshes = Array.from(bindings.values())
      .map((binding) => binding.mesh)
      .filter((mesh) => !mesh.isDisposed())

    loadSheetFile(sheetSourceFile, () => {
      appliedMeshes.forEach(applyToMesh)
      onSceneCacheInvalidated()
      onReady?.()
    })
  }

  const updateSelectionCount = (root: HTMLElement) => {
    const count = root.querySelector<HTMLElement>('.bake-selection-count')
    if (count) {
      count.textContent = `\u5df2\u9009 ${selectedMeshIds.size} / ${getSelectableMeshes().length}`
    }
  }

  const renderPanel = (panel: HTMLElement) => {
    panel.textContent = ''

    const root = document.createElement('div')
    root.className = 'bake-panel'

    const meshCard = document.createElement('section')
    meshCard.className = 'bake-card'
    const meshTitle = document.createElement('div')
    meshTitle.className = 'bake-card-title'
    meshTitle.innerHTML = '<strong>\u5e7f\u544a\u724c\u5bf9\u8c61</strong><span>\u9009\u62e9 GLB \u5185\u7684\u9762\u7247\u7f51\u683c</span>'

    const toolbar = document.createElement('div')
    toolbar.className = 'billboard-toolbar'

    const modelSelect = document.createElement('select')
    modelSelect.className = 'tech-select'
    const allOption = document.createElement('option')
    allOption.value = '__all__'
    allOption.textContent = '\u5168\u90e8 GLB'
    modelSelect.append(allOption)
    getModelNames().forEach((name, index) => {
      const option = document.createElement('option')
      option.value = String(index)
      option.textContent = name
      modelSelect.append(option)
    })
    modelSelect.value = modelFilter

    const selectVisibleBtn = document.createElement('button')
    selectVisibleBtn.type = 'button'
    selectVisibleBtn.textContent = '\u5168\u9009'
    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.textContent = '\u53d6\u6d88\u5168\u9009'
    const searchWrap = document.createElement('label')
    searchWrap.className = 'bake-search'
    const searchInput = document.createElement('input')
    searchInput.type = 'search'
    searchInput.placeholder = '\u641c\u7d22\u5bf9\u8c61\u540d\u79f0...'
    searchWrap.append(searchInput)
    const selectionCount = document.createElement('span')
    selectionCount.className = 'bake-selection-count'
    toolbar.append(modelSelect, selectVisibleBtn, clearBtn, searchWrap, selectionCount)

    const list = document.createElement('div')
    list.className = 'bake-mesh-list'

    const getFilteredMeshes = () => {
      const query = searchInput.value.trim().toLowerCase()
      return getSelectableMeshes().filter((mesh) => {
        const modelIndex = getModelIndexForMesh(mesh)
        const modelMatches = modelFilter === '__all__' || String(modelIndex) === modelFilter
        const nameMatches = mesh.name.toLowerCase().includes(query)
        return modelMatches && nameMatches
      })
    }

    const syncRows = () => {
      const meshes = getSelectableMeshes()
      selectedMeshIds = new Set([...selectedMeshIds].filter((id) => meshes.some((mesh) => String(mesh.uniqueId) === id)))
      list.textContent = ''

      const filteredMeshes = getFilteredMeshes()
      if (filteredMeshes.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'bake-empty'
        empty.textContent = meshes.length === 0 ? '\u8bf7\u5148\u52a0\u8f7d\u6a21\u578b' : '\u6ca1\u6709\u5339\u914d\u7684\u5bf9\u8c61'
        list.append(empty)
      }

      filteredMeshes.forEach((mesh) => {
        const id = String(mesh.uniqueId)
        const row = document.createElement('div')
        row.className = 'billboard-mesh-row bake-mesh-row'
        row.classList.toggle('selected', selectedMeshIds.has(id))
        row.classList.toggle('applied', bindings.has(mesh.uniqueId))
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = selectedMeshIds.has(id)
        cb.addEventListener('click', (event) => event.stopPropagation())
        cb.addEventListener('change', () => {
          if (cb.checked) {
            selectedMeshIds.add(id)
          } else {
            selectedMeshIds.delete(id)
          }
          row.classList.toggle('selected', cb.checked)
          updateSelectionCount(root)
        })

        row.addEventListener('click', () => {
          selectedMeshIds = new Set([id])
          syncRows()
        })

        const icon = document.createElement('span')
        icon.className = 'bake-mesh-icon'
        icon.textContent = bindings.has(mesh.uniqueId) ? '\u25c8' : '\u25a1'
        const nameWrap = document.createElement('span')
        nameWrap.className = 'billboard-mesh-name'
        const name = document.createElement('strong')
        name.textContent = mesh.name || `Mesh ${mesh.uniqueId}`
        const model = document.createElement('small')
        model.textContent = getModelNameForMesh(mesh)
        nameWrap.append(name, model)
        row.append(cb, icon, nameWrap)
        list.append(row)
      })

      updateSelectionCount(root)
    }

    modelSelect.addEventListener('change', () => {
      modelFilter = modelSelect.value
      syncRows()
    })
    searchInput.addEventListener('input', syncRows)
    selectVisibleBtn.addEventListener('click', () => {
      getFilteredMeshes().forEach((mesh) => selectedMeshIds.add(String(mesh.uniqueId)))
      syncRows()
    })
    clearBtn.addEventListener('click', () => {
      getFilteredMeshes().forEach((mesh) => selectedMeshIds.delete(String(mesh.uniqueId)))
      syncRows()
    })
    meshCard.append(meshTitle, toolbar, list)

    const sheetCard = document.createElement('section')
    sheetCard.className = 'bake-card'
    const sheetTitle = document.createElement('div')
    sheetTitle.className = 'bake-card-title'
    sheetTitle.innerHTML = '<strong>\u96ea\u78a7\u56fe</strong><span>\u4e00\u5f20\u56fe\u5305\u542b\u6240\u6709\u89d2\u5ea6</span>'
    const sheetInfo = document.createElement('div')
    sheetInfo.className = 'billboard-sheet-info'
    const sheetName = document.createElement('strong')
    sheetName.textContent = sheetFileName || '\u672a\u4e0a\u4f20'
    const sheetMeta = document.createElement('span')
    sheetMeta.textContent =
      sheetWidth > 0 && sheetHeight > 0
        ? `${sheetWidth} \u00d7 ${sheetHeight}`
        : '\u652f\u6301 PNG / JPG / WEBP'
    sheetInfo.append(sheetName, sheetMeta)

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.png,.jpg,.jpeg,.webp,.bmp'
    fileInput.hidden = true
    const uploadBtn = document.createElement('button')
    uploadBtn.type = 'button'
    uploadBtn.className = 'tech-upload-btn'
    uploadBtn.textContent = '\u4e0a\u4f20\u96ea\u78a7\u56fe'
    uploadBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (!file) return
      loadSheetFile(file, () => {
        applyToTargets()
        renderPanel(panel)
      })
    })
    sheetCard.append(sheetTitle, sheetInfo, uploadBtn, fileInput)

    const layoutBody: HTMLElement[] = []
    layoutBody.push(createNumberInput('\u5217\u6570', columns, 1, 16, 1, (value) => {
      columns = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createNumberInput('\u884c\u6570', rows, 1, 16, 1, (value) => {
      rows = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createNumberInput('\u65b9\u5411\u6570', directions, 1, 32, 1, (value) => {
      directions = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createNumberInput('\u8d77\u59cb\u683c', startFrame, 1, 64, 1, (value) => {
      startFrame = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createSlider('\u89d2\u5ea6\u504f\u79fb', angleOffset, -180, 180, 1, (value) => {
      angleOffset = value
      update()
    }))
    layoutBody.push(createSlider('\u4fef\u89c6\u884c\u9608\u503c', pitchSplit, 0, 80, 1, (value) => {
      pitchSplit = value
      update()
    }))
    layoutBody.push(createCheckbox('\u6309\u80cc\u666f\u8272\u62a0\u900f\u660e', removeBlack, (value) => {
      removeBlack = value
      reloadSheetProcessing(() => renderPanel(panel))
    }))
    layoutBody.push(createSlider('\u9ed1\u5e95\u9608\u503c', alphaThreshold, 0, 80, 1, (value) => {
      alphaThreshold = value
      reloadSheetProcessing(() => renderPanel(panel))
    }))
    layoutBody.push(createSlider('\u906e\u7f69\u7fbd\u5316', alphaFeather, 1, 120, 1, (value) => {
      alphaFeather = value
      reloadSheetProcessing(() => renderPanel(panel))
    }))

    const orientBody: HTMLElement[] = []
    orientBody.push(createCheckbox('\u9501\u5b9a Y \u8f74\u9762\u5411\u76f8\u673a', lockY, (value) => {
      lockY = value
      update()
    }))
    orientBody.push(createCheckbox('\u81ea\u52a8\u6309\u76f8\u673a\u89d2\u5ea6\u5207\u683c', autoFrame, (value) => {
      autoFrame = value
      update()
    }))
    orientBody.push(createCheckbox('\u65cb\u8f6c\u9762\u7247', rotateMesh, (value) => {
      rotateMesh = value
      update()
    }))
    orientBody.push(createCheckbox('\u6750\u8d28\u53cc\u9762\u663e\u793a', doubleSided, (value) => {
      doubleSided = value
      update()
    }))

    const actionsCard = document.createElement('section')
    actionsCard.className = 'bake-card'
    const actions = document.createElement('div')
    actions.className = 'bake-lightmap-grid'
    const applyBtn = document.createElement('button')
    applyBtn.type = 'button'
    applyBtn.className = 'bake-action-primary'
    applyBtn.textContent = '\u5e94\u7528\u5230\u5df2\u9009\u5bf9\u8c61'
    applyBtn.disabled = !sheetUrl || selectedMeshIds.size === 0
    applyBtn.addEventListener('click', () => {
      applyToTargets()
      renderPanel(panel)
    })
    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'bake-action-danger'
    removeBtn.textContent = '\u79fb\u9664\u5df2\u9009\u5e7f\u544a\u724c'
    removeBtn.disabled = selectedMeshIds.size === 0
    removeBtn.addEventListener('click', () => {
      getTargetMeshes().forEach(removeFromMesh)
      renderPanel(panel)
    })
    actions.append(applyBtn, removeBtn)
    actionsCard.append(actions)

    root.append(meshCard, sheetCard, createModule('\u5e03\u5c40', layoutBody), createModule('\u671d\u5411', orientBody), actionsCard)
    panel.append(root)
    syncRows()
  }

  return {
    clearAll,
    hasBillboard: (mesh: AbstractMesh) => bindings.has(mesh.uniqueId),
    pruneMesh: (mesh: AbstractMesh) => {
      selectedMeshIds.delete(String(mesh.uniqueId))
      removeFromMesh(mesh)
    },
    removeFromMesh,
    renderPanel,
    update,
  }
}

export type BillboardController = ReturnType<typeof createBillboardController>
