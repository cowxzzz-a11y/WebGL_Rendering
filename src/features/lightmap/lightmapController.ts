import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Material } from '@babylonjs/core/Materials/material'
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import { createSlider } from '../../ui/controls'

type BakeTargetGroup = {
  id: string
  name: string
  modelName: string
  meshes: AbstractMesh[]
}

type LightmapTextureMeta = {
  url: string
  fileName: string
  fileSize: number
  uvChannel: number
}

type LightmapControllerOptions = {
  scene: Scene
  getImportedMeshes: () => AbstractMesh[]
  getGroupParentKeyForMesh: (mesh: AbstractMesh, baseName: string) => string
  getModelKeyForMesh: (mesh: AbstractMesh) => string
  getModelNameForMesh: (mesh: AbstractMesh) => string
  getSelectableMeshes: () => AbstractMesh[]
}

export type ProjectLightmapMapping = {
  target: string
  targetType: 'mesh' | 'material'
  url: string
  fileName: string
  uv: number
  invertY: boolean
  level: number
}

const getPrimitiveBaseName = (name: string) => {
  const match = name.match(/^(.*?)(?:[_\-. ]?primitive\d+)$/i)
  return match?.[1]?.trim() || ''
}

const waitForTextureReady = (texture: Texture) =>
  new Promise<boolean>((resolve) => {
    if (texture.isReady()) {
      resolve(true)
      return
    }

    let settled = false
    const finish = (ready: boolean) => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      resolve(ready)
    }
    const timeoutId = window.setTimeout(() => finish(texture.isReady()), 8000)

    texture.onLoadObservable.addOnce(() => finish(true))
  })

const formatFileSize = (size: number) => {
  if (size <= 0) return '\u672a\u77e5\u5927\u5c0f'
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

export const createLightmapController = ({
  scene,
  getImportedMeshes,
  getGroupParentKeyForMesh,
  getModelKeyForMesh,
  getModelNameForMesh,
  getSelectableMeshes,
}: LightmapControllerOptions) => {
  let selectedTargetIds = new Set<string>()
  let selectedUVChannel = 1
  let lightmapInvertY = false
  let lastLightmapUrl = ''
  let lastLightmapBuffer: ArrayBuffer | null = null
  let lastLightmapMimeType: string | undefined
  let lastLightmapForcedExtension: string | undefined
  let lastLightmapFileName = ''
  let lastLightmapFileSize = 0
  const lightmapTextureMeta = new WeakMap<Texture, LightmapTextureMeta>()

  const getTargetGroupInfo = (mesh: AbstractMesh) => {
    const modelKey = getModelKeyForMesh(mesh)
    const modelName = getModelNameForMesh(mesh)
    const baseName = getPrimitiveBaseName(mesh.name)

    if (baseName) {
      const parentKey = getGroupParentKeyForMesh(mesh, baseName)
      return {
        id: `model:${modelKey}:${parentKey}`,
        name: baseName,
        modelName,
      }
    }

    return {
      id: `mesh:${mesh.uniqueId}`,
      name: mesh.name || `Mesh ${mesh.uniqueId}`,
      modelName,
    }
  }

  const getSelectableTargets = () => {
    const groups = new Map<string, BakeTargetGroup>()

    getSelectableMeshes().forEach((mesh) => {
      const info = getTargetGroupInfo(mesh)
      const existing = groups.get(info.id)

      if (existing) {
        existing.meshes.push(mesh)
        return
      }

      groups.set(info.id, {
        id: info.id,
        name: info.name,
        modelName: info.modelName,
        meshes: [mesh],
      })
    })

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  const getTargetMeshes = () => {
    const meshes = new Set<AbstractMesh>()

    getSelectableTargets().forEach((target) => {
      if (selectedTargetIds.has(target.id)) {
        target.meshes.forEach((mesh) => meshes.add(mesh))
      }
    })

    return [...meshes]
  }

  const getMeshLightmapTexture = (mesh: AbstractMesh) => {
    if (mesh.material instanceof MultiMaterial) {
      for (const sm of mesh.material.subMaterials) {
        if (sm instanceof PBRMaterial && sm.lightmapTexture) {
          return sm.lightmapTexture
        }
      }

      return null
    }

    if (mesh.material instanceof PBRMaterial) {
      return mesh.material.lightmapTexture
    }

    return null
  }

  const getMaterialUsageCount = (material: Material) =>
    getImportedMeshes().reduce((count, mesh) => {
      if (mesh.material === material) return count + 1

      if (mesh.material instanceof MultiMaterial && mesh.material.subMaterials.includes(material)) {
        return count + 1
      }

      return count
    }, 0)

  const ensureUniqueBakeMaterial = (mesh: AbstractMesh) => {
    if (mesh.material instanceof PBRMaterial) {
      if (getMaterialUsageCount(mesh.material) > 1) {
        mesh.material = mesh.material.clone(`${mesh.material.name}_bake_${mesh.uniqueId}`)
      }

      return
    }

    if (mesh.material instanceof MultiMaterial) {
      const source = mesh.material
      const cloned = new MultiMaterial(`${source.name}_bake_${mesh.uniqueId}`, scene)
      cloned.subMaterials = source.subMaterials.map((sm) => {
        if (sm instanceof PBRMaterial) {
          return sm.clone(`${sm.name}_bake_${mesh.uniqueId}`)
        }

        return sm
      })
      mesh.material = cloned
    }
  }

  const normalizeTargetName = (name: string) => name.trim().toLowerCase()

  const getMeshNameCandidates = (mesh: AbstractMesh) => {
    const candidates = new Set<string>()
    const push = (name: string | null | undefined) => {
      const trimmed = name?.trim()
      if (trimmed) {
        candidates.add(normalizeTargetName(trimmed))
      }
    }

    push(mesh.name)
    push(mesh.id)
    let parent: TransformNode | AbstractMesh | null =
      mesh.parent instanceof AbstractMesh || mesh.parent?.getClassName?.() === 'TransformNode'
        ? mesh.parent as TransformNode | AbstractMesh
        : null

    while (parent) {
      push(parent.name)
      parent = parent.parent instanceof AbstractMesh || parent.parent?.getClassName?.() === 'TransformNode'
        ? parent.parent as TransformNode | AbstractMesh
        : null
    }

    if (mesh.material instanceof MultiMaterial) {
      mesh.material.subMaterials.forEach((material) => push(material?.name))
    } else {
      push(mesh.material?.name)
    }

    return candidates
  }

  const getMaterialNameCandidates = (mesh: AbstractMesh) => {
    const candidates = new Set<string>()
    const push = (name: string | null | undefined) => {
      const trimmed = name?.trim()
      if (trimmed) {
        candidates.add(normalizeTargetName(trimmed))
      }
    }

    if (mesh.material instanceof MultiMaterial) {
      mesh.material.subMaterials.forEach((material) => push(material?.name))
    } else {
      push(mesh.material?.name)
    }

    return candidates
  }

  const getMeshesForProjectMapping = (mapping: ProjectLightmapMapping) => {
    const target = normalizeTargetName(mapping.target)

    return getSelectableMeshes().filter((mesh) => {
      const candidates = mapping.targetType === 'material'
        ? getMaterialNameCandidates(mesh)
        : getMeshNameCandidates(mesh)

      return candidates.has(target)
    })
  }

  const createLightmapTextureFromCurrent = () => {
    if (!lastLightmapUrl && !lastLightmapBuffer) return null

    const texture = new Texture(
      lastLightmapBuffer ? lastLightmapFileName : lastLightmapUrl,
      scene,
      {
        invertY: lightmapInvertY,
        buffer: lastLightmapBuffer,
        mimeType: lastLightmapMimeType,
        forcedExtension: lastLightmapForcedExtension,
      },
    )
    texture.coordinatesIndex = selectedUVChannel
    lightmapTextureMeta.set(texture, {
      url: lastLightmapUrl,
      fileName: lastLightmapFileName,
      fileSize: lastLightmapFileSize,
      uvChannel: selectedUVChannel,
    })

    return texture
  }

  const applyLightmapToMesh = (mesh: AbstractMesh, texture: Texture) => {
    ensureUniqueBakeMaterial(mesh)

    if (mesh.material instanceof MultiMaterial) {
      mesh.material.subMaterials.forEach((sm) => {
        if (sm instanceof PBRMaterial) {
          sm.lightmapTexture = texture
          sm.useLightmapAsShadowmap = true
          sm.markAsDirty(Material.TextureDirtyFlag)
        }
      })
    } else if (mesh.material instanceof PBRMaterial) {
      mesh.material.lightmapTexture = texture
      mesh.material.useLightmapAsShadowmap = true
      mesh.material.markAsDirty(Material.TextureDirtyFlag)
    }
  }

  const applyProjectLightmaps = async (mappings: ProjectLightmapMapping[]) => {
    let applied = 0
    const missing: string[] = []

    for (const mapping of mappings) {
      const meshes = getMeshesForProjectMapping(mapping)

      if (meshes.length === 0) {
        missing.push(mapping.target)
        continue
      }

      const texture = new Texture(mapping.url, scene, {
        invertY: mapping.invertY,
      })
      texture.coordinatesIndex = mapping.uv
      texture.level = mapping.level
      const textureReady = await waitForTextureReady(texture)
      if (!textureReady) {
        texture.dispose()
        missing.push(`${mapping.target} (${mapping.fileName} not ready)`)
        continue
      }

      lightmapTextureMeta.set(texture, {
        url: mapping.url,
        fileName: mapping.fileName,
        fileSize: 0,
        uvChannel: mapping.uv,
      })

      meshes.forEach((mesh) => applyLightmapToMesh(mesh, texture))
      applied += meshes.length
    }

    return {
      applied,
      missing,
    }
  }

  const clearLightmapFromMesh = (mesh: AbstractMesh) => {
    if (mesh.material instanceof MultiMaterial) {
      mesh.material.subMaterials.forEach((sm) => {
        if (sm instanceof PBRMaterial) {
          sm.lightmapTexture = null
          sm.useLightmapAsShadowmap = false
          sm.markAsDirty(Material.TextureDirtyFlag)
        }
      })
    } else if (mesh.material instanceof PBRMaterial) {
      mesh.material.lightmapTexture = null
      mesh.material.useLightmapAsShadowmap = false
      mesh.material.markAsDirty(Material.TextureDirtyFlag)
    }
  }

  const applyLightmapToTarget = () => {
    getSelectableTargets().forEach((target) => {
      if (!selectedTargetIds.has(target.id)) {
        return
      }

      const texture = createLightmapTextureFromCurrent()
      if (texture) {
        target.meshes.forEach((mesh) => applyLightmapToMesh(mesh, texture))
      }
    })
  }

  const setLightmapLevelForTarget = (level: number) => {
    const targets = getTargetMeshes()
    if (targets.length > 0) {
      targets.forEach((mesh) => {
        if (mesh.material instanceof MultiMaterial) {
          mesh.material.subMaterials.forEach((sm) => {
            if (sm instanceof PBRMaterial && sm.lightmapTexture) {
              sm.lightmapTexture.level = level
            }
          })
        } else if (mesh.material instanceof PBRMaterial && mesh.material.lightmapTexture) {
          mesh.material.lightmapTexture.level = level
        }
      })
    } else {
      scene.materials.forEach((mat) => {
        if (mat instanceof PBRMaterial && mat.lightmapTexture) {
          mat.lightmapTexture.level = level
        }
      })
    }
  }

  const updateSelectionCount = (root: HTMLElement) => {
    const count = root.querySelector<HTMLElement>('.bake-selection-count')
    if (count) {
      count.textContent = `\u5df2\u9009 ${selectedTargetIds.size} / ${getSelectableTargets().length}`
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
    meshTitle.innerHTML = '<strong>\u9009\u62e9\u76ee\u6807\u5bf9\u8c61</strong><span>\u652f\u6301\u591a\u9009</span>'

    const toolbar = document.createElement('div')
    toolbar.className = 'bake-toolbar'
    const selectAllBtn = document.createElement('button')
    selectAllBtn.type = 'button'
    selectAllBtn.textContent = '\u5168\u9009'
    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.textContent = '\u6e05\u7a7a'
    const searchWrap = document.createElement('label')
    searchWrap.className = 'bake-search'
    const searchInput = document.createElement('input')
    searchInput.type = 'search'
    searchInput.placeholder = '\u641c\u7d22\u5bf9\u8c61\u540d\u79f0...'
    searchWrap.append(searchInput)
    const selectionCount = document.createElement('span')
    selectionCount.className = 'bake-selection-count'
    toolbar.append(selectAllBtn, clearBtn, searchWrap, selectionCount)

    const list = document.createElement('div')
    list.className = 'bake-mesh-list'

    const syncRows = () => {
      const query = searchInput.value.trim().toLowerCase()
      const targets = getSelectableTargets()
      selectedTargetIds = new Set([...selectedTargetIds].filter((id) => targets.some((target) => target.id === id)))
      list.textContent = ''

      const filteredTargets = targets.filter((target) => {
        const haystack = `${target.name} ${target.modelName}`.toLowerCase()
        return haystack.includes(query)
      })
      if (filteredTargets.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'bake-empty'
        empty.textContent = targets.length === 0 ? '\u8bf7\u5148\u52a0\u8f7d\u6a21\u578b' : '\u6ca1\u6709\u5339\u914d\u7684\u5bf9\u8c61'
        list.append(empty)
      }

      filteredTargets.forEach((target) => {
        const id = target.id
        const row = document.createElement('div')
        row.className = 'bake-mesh-row'
        row.classList.toggle('selected', selectedTargetIds.has(id))
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = selectedTargetIds.has(id)
        cb.addEventListener('click', (event) => {
          event.stopPropagation()
        })
        cb.addEventListener('change', () => {
          if (cb.checked) {
            selectedTargetIds.add(id)
          } else {
            selectedTargetIds.delete(id)
          }
          row.classList.toggle('selected', cb.checked)
          updateSelectionCount(root)
          renderLightmapSummary()
        })
        row.addEventListener('click', () => {
          selectedTargetIds = new Set([id])
          syncRows()
          renderLightmapSummary()
        })
        const icon = document.createElement('span')
        icon.className = 'bake-mesh-icon'
        icon.textContent = '\u25a1'
        const name = document.createElement('span')
        name.className = 'bake-mesh-name'
        name.textContent = target.name
        row.append(cb, icon, name)
        list.append(row)
      })

      updateSelectionCount(root)
    }

    selectAllBtn.addEventListener('click', () => {
      getSelectableTargets().forEach((target) => selectedTargetIds.add(target.id))
      syncRows()
      renderLightmapSummary()
    })
    clearBtn.addEventListener('click', () => {
      selectedTargetIds.clear()
      syncRows()
      renderLightmapSummary()
    })
    searchInput.addEventListener('input', syncRows)
    meshCard.append(meshTitle, toolbar, list)

    const uvRow = document.createElement('div')
    uvRow.className = 'tech-row'
    const uvLabel = document.createElement('span')
    uvLabel.className = 'tech-label'
    uvLabel.textContent = 'UV \u901a\u9053'
    const uvToggle = document.createElement('div')
    uvToggle.className = 'tech-uv-toggle'
    ;['UV1', 'UV2'].forEach((label) => {
      const btn = document.createElement('button')
      btn.className = 'tech-uv-btn'
      btn.textContent = label
      const idx = label === 'UV2' ? 1 : 0
      if (idx === selectedUVChannel) btn.classList.add('active')
      btn.addEventListener('click', () => {
        selectedUVChannel = idx
        uvToggle.querySelectorAll('.tech-uv-btn').forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')
      })
      uvToggle.append(btn)
    })
    uvRow.append(uvLabel, uvToggle)

    const invYRow = document.createElement('label')
    invYRow.className = 'tech-row tech-row-checkbox'
    const invYCb = document.createElement('input')
    invYCb.type = 'checkbox'
    invYCb.checked = lightmapInvertY
    invYCb.addEventListener('change', () => {
      lightmapInvertY = invYCb.checked
    })
    const invYSpan = document.createElement('span')
    invYSpan.textContent = '\u53cd\u8f6c Y \u8f74 (Invert Y)'
    invYRow.append(invYCb, invYSpan)

    const lightmapCard = document.createElement('section')
    lightmapCard.className = 'bake-card'
    const lightmapTitle = document.createElement('div')
    lightmapTitle.className = 'bake-card-title'
    lightmapTitle.innerHTML = '<strong>\u5149\u7167\u8d34\u56fe</strong><span>\u5355\u5f20\u8d34\u56fe\u5c06\u5e94\u7528\u5230\u6240\u6709\u5df2\u9009\u5bf9\u8c61</span>'
    const lightmapGrid = document.createElement('div')
    lightmapGrid.className = 'bake-lightmap-grid'
    const lightmapInfo = document.createElement('div')
    lightmapInfo.className = 'bake-lightmap-info'
    const uploadDrop = document.createElement('button')
    uploadDrop.type = 'button'
    uploadDrop.className = 'bake-upload-drop'
    uploadDrop.innerHTML = '<strong>\u4e0a\u4f20\u5149\u7167\u8d34\u56fe</strong><span>\u652f\u6301 PNG / JPG / TGA / EXR</span>'
    const uploadBtn = document.createElement('button')
    uploadBtn.type = 'button'
    uploadBtn.className = 'bake-action-primary'
    uploadBtn.textContent = '\u5e94\u7528\u5230\u5df2\u9009\u5bf9\u8c61'
    const deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'bake-action-danger'
    deleteBtn.textContent = '\u5220\u9664\u5149\u7167\u7eb9\u7406'
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.png,.jpg,.jpeg,.tga,.exr,.hdr,.ktx2'
    fileInput.hidden = true
    uploadDrop.addEventListener('click', () => fileInput.click())
    uploadBtn.addEventListener('click', () => {
      if (lastLightmapUrl) {
        applyLightmapToTarget()
        renderLightmapSummary()
      } else {
        fileInput.click()
      }
    })
    deleteBtn.addEventListener('click', () => {
      getTargetMeshes().forEach(clearLightmapFromMesh)
      renderLightmapSummary()
    })
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]
      if (!file) return
      const isKtx2 = file.name.toLowerCase().endsWith('.ktx2')
      lastLightmapBuffer = isKtx2 ? await file.arrayBuffer() : null
      lastLightmapMimeType = isKtx2 ? 'image/ktx2' : undefined
      lastLightmapForcedExtension = isKtx2 ? '.ktx2' : undefined
      lastLightmapUrl = isKtx2 ? '' : URL.createObjectURL(file)
      lastLightmapFileName = file.name
      lastLightmapFileSize = file.size
      applyLightmapToTarget()
      renderLightmapSummary()
      fileInput.value = ''
    })

    function renderLightmapSummary() {
      const targets = getTargetMeshes()
      const textures = targets.map(getMeshLightmapTexture).filter((texture): texture is Texture => Boolean(texture))
      const textureSet = new Set(textures)
      const firstTexture = textures[0] ?? null
      const firstMeta = firstTexture ? lightmapTextureMeta.get(firstTexture) : null
      lightmapInfo.textContent = ''

      const preview = document.createElement('div')
      preview.className = 'bake-lightmap-preview'
      const meta = document.createElement('div')
      meta.className = 'bake-lightmap-meta'
      const title = document.createElement('strong')
      const detail = document.createElement('span')
      const status = document.createElement('em')

      if (firstTexture) {
        if (firstMeta?.url) {
          preview.style.backgroundImage = `url("${firstMeta.url}")`
        }
        title.textContent = textureSet.size > 1 ? '\u591a\u4e2a\u5149\u7167\u8d34\u56fe' : firstMeta?.fileName || firstTexture.name || '\u5df2\u52a0\u8f7d\u5149\u7167\u8d34\u56fe'
        detail.textContent = [
          firstMeta ? formatFileSize(firstMeta.fileSize) : '\u5df2\u5e94\u7528',
          (firstMeta?.uvChannel ?? firstTexture.coordinatesIndex) === 1 ? 'UV2' : 'UV1',
        ].join('  |  ')
        status.textContent = targets.length > 0 ? '\u53ef\u7528' : '\u672a\u9009\u62e9\u5bf9\u8c61'
      } else {
        title.textContent = targets.length > 0 ? '\u672a\u5e94\u7528\u5149\u7167\u8d34\u56fe' : '\u8bf7\u9009\u62e9\u76ee\u6807\u5bf9\u8c61'
        detail.textContent = '\u4e0a\u4f20\u6216\u9009\u62e9\u8d34\u56fe\u540e\uff0c\u53ef\u7edf\u4e00\u5e94\u7528\u5230\u5df2\u9009\u5bf9\u8c61'
        status.textContent = targets.length > 0 ? '\u7b49\u5f85\u8d34\u56fe' : '\u65e0\u76ee\u6807'
      }

      meta.append(title, detail, status)
      lightmapInfo.append(preview, meta)
      uploadBtn.disabled = selectedTargetIds.size === 0
      deleteBtn.disabled = selectedTargetIds.size === 0 || textureSet.size === 0
      updateSelectionCount(root)
    }

    const actionRow = document.createElement('div')
    actionRow.className = 'bake-action-row'
    actionRow.append(uploadBtn, deleteBtn)
    lightmapGrid.append(lightmapInfo, uploadDrop)
    lightmapCard.append(lightmapTitle, lightmapGrid, actionRow, fileInput)

    const optionsCard = document.createElement('section')
    optionsCard.className = 'bake-card bake-options-card'
    const optionsTitle = document.createElement('div')
    optionsTitle.className = 'bake-card-title'
    optionsTitle.innerHTML = '<strong>UV \u901a\u9053</strong>'
    const strength = createSlider('\u5149\u7167\u8d34\u56fe\u5f3a\u5ea6', 1, 0, 2, 0.01, (v) => {
      setLightmapLevelForTarget(v)
    })
    optionsCard.append(optionsTitle, uvRow, invYRow, strength)

    root.append(meshCard, lightmapCard, optionsCard)
    panel.append(root)
    syncRows()
    renderLightmapSummary()
  }

  const pruneMesh = (mesh: AbstractMesh) => {
    selectedTargetIds.delete(getTargetGroupInfo(mesh).id)
  }

  return {
    applyProjectLightmaps,
    pruneMesh,
    renderPanel,
  }
}

export type LightmapController = ReturnType<typeof createLightmapController>
