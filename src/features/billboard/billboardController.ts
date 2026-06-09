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

type BillboardProfile = {
  id: string
  name: string
  sheetUrl: string
  sheetFileName: string
  sheetWidth: number
  sheetHeight: number
  columns: number
  rows: number
  directions: number
  startFrame: number
  angleOffset: number
  pitchSplit: number
  removeBlack: boolean
  alphaThreshold: number
  alphaFeather: number
  lockY: boolean
  autoFrame: boolean
  rotateMesh: boolean
  doubleSided: boolean
  sheetSourceFile: File | null
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
  let modelFilter = '__all__'
  let profileSequence = 1
  const createProfile = (name = `广告牌组 ${profileSequence}`): BillboardProfile => ({
    id: `billboard-profile-${profileSequence++}`,
    name,
    sheetUrl: '',
    sheetFileName: '',
    sheetWidth: 0,
    sheetHeight: 0,
    columns: 16,
    rows: 2,
    directions: 16,
    startFrame: 1,
    angleOffset: 0,
    pitchSplit: 25,
    removeBlack: false,
    alphaThreshold: 8,
    alphaFeather: 12,
    lockY: true,
    autoFrame: true,
    rotateMesh: true,
    doubleSided: true,
    sheetSourceFile: null,
  })
  const profiles = new Map<string, BillboardProfile>()
  const firstProfile = createProfile()
  profiles.set(firstProfile.id, firstProfile)
  let activeProfileId = firstProfile.id
  const bindings = new Map<number, BillboardBinding>()

  const getActiveProfile = () => profiles.get(activeProfileId) ?? firstProfile

  const getBindingProfile = (binding: BillboardBinding) =>
    profiles.get(binding.profileId) ?? getActiveProfile()

  const getTargetMeshes = () =>
    getSelectableMeshes().filter((mesh) => selectedMeshIds.has(String(mesh.uniqueId)))

  const normalizeFrameIndex = (profile: BillboardProfile, index: number) => {
    const totalFrames = Math.max(1, profile.columns * profile.rows)
    return ((index % totalFrames) + totalFrames) % totalFrames
  }

  const applyFrame = (binding: BillboardBinding, profile: BillboardProfile, frameIndex: number) => {
    const col = frameIndex % profile.columns
    const row = Math.floor(frameIndex / profile.columns)

    binding.texture.uScale = 1 / Math.max(1, profile.columns)
    binding.texture.vScale = 1 / Math.max(1, profile.rows)
    binding.texture.uOffset = col / Math.max(1, profile.columns)
    binding.texture.vOffset = row / Math.max(1, profile.rows)
  }

  const getFrameForMesh = (mesh: AbstractMesh, profile: BillboardProfile) => {
    if (!profile.autoFrame) {
      return normalizeFrameIndex(profile, profile.startFrame - 1)
    }

    const meshPosition = mesh.getAbsolutePosition()
    const cameraPosition = camera.position
    const dx = cameraPosition.x - meshPosition.x
    const dz = cameraPosition.z - meshPosition.z
    const horizontalDistance = Math.hypot(dx, dz)
    const elevation = radiansToDegrees(Math.atan2(cameraPosition.y - meshPosition.y, horizontalDistance))
    const angle = Math.atan2(dx, dz)
    const step = (Math.PI * 2) / Math.max(1, profile.directions)
    const offset = degreesToRadians(profile.angleOffset)
    const directionIndex = ((Math.round((angle + offset) / step) % profile.directions) + profile.directions) % profile.directions
    const columnIndex = directionIndex % Math.max(1, profile.columns)
    const rowIndex = Math.max(1, profile.rows) > 1 && elevation >= profile.pitchSplit ? 0 : Math.max(0, profile.rows - 1)

    return normalizeFrameIndex(profile, rowIndex * Math.max(1, profile.columns) + columnIndex + profile.startFrame - 1)
  }

  const update = () => {
    bindings.forEach((binding) => {
      const profile = getBindingProfile(binding)
      binding.mesh.billboardMode = AbstractMesh.BILLBOARDMODE_NONE
      binding.material.backFaceCulling = !profile.doubleSided

      if (profile.lockY && profile.rotateMesh) {
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

      applyFrame(binding, profile, getFrameForMesh(binding.mesh, profile))
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

  const applyToMesh = (mesh: AbstractMesh, profile = getActiveProfile()) => {
    if (!profile.sheetUrl) return

    removeFromMesh(mesh)

    const texture = new Texture(profile.sheetUrl, scene, false, false)
    texture.name = profile.sheetFileName || '\u5e7f\u544a\u724c\u96ea\u78a7\u56fe'
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
    material.backFaceCulling = !profile.doubleSided
    material.transparencyMode = Material.MATERIAL_ALPHATEST
    material.alphaCutOff = 0.01
    material.needDepthPrePass = false
    material.forceDepthWrite = true

    const binding: BillboardBinding = {
      profileId: profile.id,
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
    applyFrame(binding, profile, getFrameForMesh(mesh, profile))
  }

  const applyToTargets = () => {
    const profile = getActiveProfile()
    getTargetMeshes().forEach((mesh) => applyToMesh(mesh, profile))
    onSceneCacheInvalidated()
  }

  const createBlackMaskedUrl = (image: HTMLImageElement, profile: BillboardProfile) =>
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
      const threshold = Math.max(0, profile.alphaThreshold)
      const feather = Math.max(1, profile.alphaFeather)
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

  const loadSheetFile = (profile: BillboardProfile, file: File, onReady?: () => void) => {
    if (profile.sheetUrl) {
      URL.revokeObjectURL(profile.sheetUrl)
    }

    const url = URL.createObjectURL(file)
    profile.sheetSourceFile = file
    profile.sheetUrl = ''
    profile.sheetFileName = file.name
    profile.sheetWidth = 0
    profile.sheetHeight = 0

    const image = new Image()
    image.onload = async () => {
      profile.sheetWidth = image.naturalWidth
      profile.sheetHeight = image.naturalHeight
      profile.sheetUrl = profile.removeBlack ? await createBlackMaskedUrl(image, profile) : url

      if (profile.sheetUrl !== url) {
        URL.revokeObjectURL(url)
      }

      onReady?.()
    }
    image.onerror = () => {
      profile.sheetUrl = url
      onReady?.()
    }
    image.src = url
  }

  const reloadSheetProcessing = (profile: BillboardProfile, onReady?: () => void) => {
    if (!profile.sheetSourceFile) {
      onReady?.()
      return
    }

    const appliedMeshes = Array.from(bindings.values())
      .filter((binding) => binding.profileId === profile.id)
      .map((binding) => binding.mesh)
      .filter((mesh) => !mesh.isDisposed())

    loadSheetFile(profile, profile.sheetSourceFile, () => {
      appliedMeshes.forEach((mesh) => applyToMesh(mesh, profile))
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
    const activeProfile = getActiveProfile()

    const profileCard = document.createElement('section')
    profileCard.className = 'bake-card'
    const profileTitle = document.createElement('div')
    profileTitle.className = 'bake-card-title'
    profileTitle.innerHTML = '<strong>\u5e7f\u544a\u724c\u7ec4</strong><span>\u6bcf\u7ec4\u53ef\u4f7f\u7528\u72ec\u7acb\u96ea\u78a7\u56fe\u548c\u5e03\u5c40</span>'
    const profileToolbar = document.createElement('div')
    profileToolbar.className = 'billboard-profile-toolbar'
    const profileSelect = document.createElement('select')
    profileSelect.className = 'tech-select'
    Array.from(profiles.values()).forEach((profile) => {
      const option = document.createElement('option')
      option.value = profile.id
      option.textContent = profile.name
      profileSelect.append(option)
    })
    profileSelect.value = activeProfile.id
    const profileNameInput = document.createElement('input')
    profileNameInput.type = 'text'
    profileNameInput.value = activeProfile.name
    profileNameInput.placeholder = '\u5e7f\u544a\u724c\u7ec4\u540d\u79f0'
    const addProfileBtn = document.createElement('button')
    addProfileBtn.type = 'button'
    addProfileBtn.textContent = '\u65b0\u589e'
    const duplicateProfileBtn = document.createElement('button')
    duplicateProfileBtn.type = 'button'
    duplicateProfileBtn.textContent = '\u590d\u5236'
    const deleteProfileBtn = document.createElement('button')
    deleteProfileBtn.type = 'button'
    deleteProfileBtn.textContent = '\u5220\u9664'
    deleteProfileBtn.disabled = profiles.size <= 1
    profileToolbar.append(profileSelect, addProfileBtn, duplicateProfileBtn, deleteProfileBtn, profileNameInput)
    profileSelect.addEventListener('change', () => {
      activeProfileId = profileSelect.value
      renderPanel(panel)
    })
    profileNameInput.addEventListener('change', () => {
      const name = profileNameInput.value.trim()
      activeProfile.name = name || activeProfile.name
      renderPanel(panel)
    })
    addProfileBtn.addEventListener('click', () => {
      const profile = createProfile()
      profiles.set(profile.id, profile)
      activeProfileId = profile.id
      renderPanel(panel)
    })
    duplicateProfileBtn.addEventListener('click', () => {
      const source = getActiveProfile()
      const profile = createProfile(`${source.name} \u526f\u672c`)
      Object.assign(profile, {
        columns: source.columns,
        rows: source.rows,
        directions: source.directions,
        startFrame: source.startFrame,
        angleOffset: source.angleOffset,
        pitchSplit: source.pitchSplit,
        removeBlack: source.removeBlack,
        alphaThreshold: source.alphaThreshold,
        alphaFeather: source.alphaFeather,
        lockY: source.lockY,
        autoFrame: source.autoFrame,
        rotateMesh: source.rotateMesh,
        doubleSided: source.doubleSided,
      })
      profiles.set(profile.id, profile)
      activeProfileId = profile.id
      if (source.sheetSourceFile) {
        loadSheetFile(profile, source.sheetSourceFile, () => renderPanel(panel))
      }
      renderPanel(panel)
    })
    deleteProfileBtn.addEventListener('click', () => {
      if (profiles.size <= 1) return
      Array.from(bindings.values())
        .filter((binding) => binding.profileId === activeProfile.id)
        .forEach((binding) => removeFromMesh(binding.mesh))
      if (activeProfile.sheetUrl) {
        URL.revokeObjectURL(activeProfile.sheetUrl)
      }
      profiles.delete(activeProfile.id)
      activeProfileId = Array.from(profiles.keys())[0] ?? firstProfile.id
      onSceneCacheInvalidated()
      renderPanel(panel)
    })
    profileCard.append(profileTitle, profileToolbar)

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
        const existingBinding = bindings.get(mesh.uniqueId)
        const existingProfile = existingBinding ? profiles.get(existingBinding.profileId) : null
        const row = document.createElement('div')
        row.className = 'billboard-mesh-row bake-mesh-row'
        row.classList.toggle('selected', selectedMeshIds.has(id))
        row.classList.toggle('applied', Boolean(existingBinding))
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
        icon.textContent = existingBinding ? '\u25c8' : '\u25a1'
        const nameWrap = document.createElement('span')
        nameWrap.className = 'billboard-mesh-name'
        const name = document.createElement('strong')
        name.textContent = mesh.name || `Mesh ${mesh.uniqueId}`
        const model = document.createElement('small')
        model.textContent = existingProfile
          ? `${getModelNameForMesh(mesh)} / ${existingProfile.name}`
          : getModelNameForMesh(mesh)
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
    sheetName.textContent = activeProfile.sheetFileName || '\u672a\u4e0a\u4f20'
    const sheetMeta = document.createElement('span')
    sheetMeta.textContent =
      activeProfile.sheetWidth > 0 && activeProfile.sheetHeight > 0
        ? `${activeProfile.sheetWidth} \u00d7 ${activeProfile.sheetHeight}`
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
      loadSheetFile(activeProfile, file, () => {
        applyToTargets()
        renderPanel(panel)
      })
    })
    sheetCard.append(sheetTitle, sheetInfo, uploadBtn, fileInput)

    const layoutBody: HTMLElement[] = []
    layoutBody.push(createNumberInput('\u5217\u6570', activeProfile.columns, 1, 16, 1, (value) => {
      activeProfile.columns = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createNumberInput('\u884c\u6570', activeProfile.rows, 1, 16, 1, (value) => {
      activeProfile.rows = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createNumberInput('\u65b9\u5411\u6570', activeProfile.directions, 1, 32, 1, (value) => {
      activeProfile.directions = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createNumberInput('\u8d77\u59cb\u683c', activeProfile.startFrame, 1, 64, 1, (value) => {
      activeProfile.startFrame = Math.max(1, Math.round(value))
      update()
    }))
    layoutBody.push(createSlider('\u89d2\u5ea6\u504f\u79fb', activeProfile.angleOffset, -180, 180, 1, (value) => {
      activeProfile.angleOffset = value
      update()
    }))
    layoutBody.push(createSlider('\u4fef\u89c6\u884c\u9608\u503c', activeProfile.pitchSplit, 0, 80, 1, (value) => {
      activeProfile.pitchSplit = value
      update()
    }))
    layoutBody.push(createCheckbox('\u6309\u80cc\u666f\u8272\u62a0\u900f\u660e', activeProfile.removeBlack, (value) => {
      activeProfile.removeBlack = value
      reloadSheetProcessing(activeProfile, () => renderPanel(panel))
    }))
    layoutBody.push(createSlider('\u9ed1\u5e95\u9608\u503c', activeProfile.alphaThreshold, 0, 80, 1, (value) => {
      activeProfile.alphaThreshold = value
      reloadSheetProcessing(activeProfile, () => renderPanel(panel))
    }))
    layoutBody.push(createSlider('\u906e\u7f69\u7fbd\u5316', activeProfile.alphaFeather, 1, 120, 1, (value) => {
      activeProfile.alphaFeather = value
      reloadSheetProcessing(activeProfile, () => renderPanel(panel))
    }))

    const orientBody: HTMLElement[] = []
    orientBody.push(createCheckbox('\u9501\u5b9a Y \u8f74\u9762\u5411\u76f8\u673a', activeProfile.lockY, (value) => {
      activeProfile.lockY = value
      update()
    }))
    orientBody.push(createCheckbox('\u81ea\u52a8\u6309\u76f8\u673a\u89d2\u5ea6\u5207\u683c', activeProfile.autoFrame, (value) => {
      activeProfile.autoFrame = value
      update()
    }))
    orientBody.push(createCheckbox('\u65cb\u8f6c\u9762\u7247', activeProfile.rotateMesh, (value) => {
      activeProfile.rotateMesh = value
      update()
    }))
    orientBody.push(createCheckbox('\u6750\u8d28\u53cc\u9762\u663e\u793a', activeProfile.doubleSided, (value) => {
      activeProfile.doubleSided = value
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
    applyBtn.disabled = !activeProfile.sheetUrl || selectedMeshIds.size === 0
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

    root.append(profileCard, meshCard, sheetCard, createModule('\u5e03\u5c40', layoutBody), createModule('\u671d\u5411', orientBody), actionsCard)
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
