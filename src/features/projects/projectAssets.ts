import type { ViewerProjectConfigInput } from '../config/viewerConfig'

export type ProjectLightmapConfig = {
  mesh?: string
  material?: string
  texture: string
  model?: string
  uv?: number
  invertY?: boolean
  level?: number
}

export type ProjectPbrTextureSetConfig = {
  id: string
  albedo: string
  normal?: string
  arm?: string
}

export type ProjectPbrTextureRuleConfig = {
  model?: string
  meshIncludes: string
  textureSets: string[]
  distribution?: 'stableRandom' | 'alternating'
  seed?: number
  uvScaleU?: number
  uvScaleV?: number
}

export type ProjectConfig = {
  id?: string
  title?: string
  models?: Array<string | { url: string; name?: string }>
  model?: string
  config?: ViewerProjectConfigInput
  lightmaps?: ProjectLightmapConfig[]
  material?: 'pbr' | 'dtaa' | 'riverWater'
  pbrTextureSets?: ProjectPbrTextureSetConfig[]
  pbrTextureRules?: ProjectPbrTextureRuleConfig[]
  camera?: {
    alpha?: number
    beta?: number
    radius?: number
    target?: [number, number, number]
    position?: [number, number, number]
  }
}

export type ResolvedProjectModel = {
  url: string
  fileName: string
}

export type ResolvedProjectLightmap = {
  target: string
  targetType: 'mesh' | 'material'
  url: string
  fileName: string
  model?: string
  uv: number
  invertY: boolean
  level: number
}

export type ResolvedProjectPbrTextureSet = {
  id: string
  albedoUrl: string
  albedoFileName: string
  normalUrl?: string
  normalFileName?: string
  armUrl?: string
  armFileName?: string
}

export type ResolvedProjectPbrTextureRule = {
  model?: string
  meshIncludes: string
  textureSets: ResolvedProjectPbrTextureSet[]
  distribution: 'stableRandom' | 'alternating'
  seed: number
  uvScaleU: number
  uvScaleV: number
}

export type ProjectEntry = {
  id: string
  routeId: string
  title: string
  basePath: string
  config: ProjectConfig
  models: ResolvedProjectModel[]
  lightmaps: ResolvedProjectLightmap[]
  pbrTextureRules: ResolvedProjectPbrTextureRule[]
}

const projectConfigs = import.meta.glob<ProjectConfig>('../../../assets/*/project.json', {
  eager: true,
  import: 'default',
})

const projectAssetUrls = import.meta.glob<string>([
  '../../../assets/*/*.{glb,png,jpg,jpeg,ktx2,PNG,JPG,JPEG,KTX2}',
  '../../../assets/*/PBR岩性图/沉积岩/{白云岩,角砾岩,页岩,泥岩}/*.{png,jpg,jpeg,ktx2,PNG,JPG,JPEG,KTX2}',
  '../../../assets/*/PBR岩性图/变质岩/片麻岩/*.{png,jpg,jpeg,ktx2,PNG,JPG,JPEG,KTX2}',
], {
  eager: true,
  query: '?url',
  import: 'default',
})

const getProjectIdFromConfigPath = (path: string) => {
  const match = path.match(/\/assets\/([^/]+)\/project\.json$/)
  return match ? decodeURIComponent(match[1]) : null
}

const getAssetPath = (projectId: string, relativePath: string) =>
  `../../../assets/${projectId}/${relativePath.replace(/^\/+/, '')}`

const resolveProjectAssetUrl = (projectId: string, relativePath: string) => {
  const exactPath = getAssetPath(projectId, relativePath)
  const exact = projectAssetUrls[exactPath]
  if (exact) return exact

  const matched = Object.entries(projectAssetUrls).find(([key]) =>
    key.replace(/\\/g, '/').endsWith(`/${projectId}/${relativePath.replace(/^\/+/, '')}`)
  )
  return matched?.[1] ?? null
}

const getFileName = (path: string) => path.split('/').pop() ?? path

export const getProjectRouteId = (id: string) => encodeURIComponent(id)

const resolveConfiguredModels = (projectId: string, config: ProjectConfig): ResolvedProjectModel[] => {
  const configuredModels = config.models ?? (config.model ? [config.model] : ['target.glb'])

  return configuredModels.flatMap((model) => {
    const relativePath = typeof model === 'string' ? model : model.url
    const url = resolveProjectAssetUrl(projectId, relativePath)

    if (!url) {
      console.warn(`Project asset was not found: ${projectId}/${relativePath}`)
      return []
    }

    return [{
      url,
      fileName: typeof model === 'string' ? relativePath : model.name ?? getFileName(relativePath),
    }]
  })
}

const resolveConfiguredLightmaps = (projectId: string, config: ProjectConfig): ResolvedProjectLightmap[] => {
  const configured = config.lightmaps ?? []

  return configured.flatMap((lightmap) => {
    const url = resolveProjectAssetUrl(projectId, lightmap.texture)

    if (!url) {
      console.warn(`Project lightmap was not found: ${projectId}/${lightmap.texture}`)
      return []
    }

    const target = lightmap.mesh ?? lightmap.material
    if (!target) {
      return []
    }

    return [{
      target,
      targetType: lightmap.material ? 'material' : 'mesh',
      url,
      fileName: getFileName(lightmap.texture),
      model: lightmap.model,
      uv: lightmap.uv ?? 1,
      invertY: lightmap.invertY ?? false,
      level: lightmap.level ?? 1,
    }]
  })
}

const resolveConfiguredPbrTextureRules = (
  projectId: string,
  config: ProjectConfig,
): ResolvedProjectPbrTextureRule[] => {
  const resolvedSets = new Map<string, ResolvedProjectPbrTextureSet>()

  ;(config.pbrTextureSets ?? []).forEach((textureSet) => {
    const albedoUrl = resolveProjectAssetUrl(projectId, textureSet.albedo)
    if (!albedoUrl) {
      console.warn(`Project PBR albedo texture was not found: ${projectId}/${textureSet.albedo}`)
      return
    }

    const normalUrl = textureSet.normal
      ? resolveProjectAssetUrl(projectId, textureSet.normal) ?? undefined
      : undefined
    const armUrl = textureSet.arm
      ? resolveProjectAssetUrl(projectId, textureSet.arm) ?? undefined
      : undefined

    if (textureSet.normal && !normalUrl) {
      console.warn(`Project PBR normal texture was not found: ${projectId}/${textureSet.normal}`)
    }
    if (textureSet.arm && !armUrl) {
      console.warn(`Project PBR ARM texture was not found: ${projectId}/${textureSet.arm}`)
    }

    resolvedSets.set(textureSet.id, {
      id: textureSet.id,
      albedoUrl,
      albedoFileName: getFileName(textureSet.albedo),
      normalUrl,
      normalFileName: textureSet.normal ? getFileName(textureSet.normal) : undefined,
      armUrl,
      armFileName: textureSet.arm ? getFileName(textureSet.arm) : undefined,
    })
  })

  return (config.pbrTextureRules ?? []).flatMap((rule) => {
    const textureSets = rule.textureSets.flatMap((id) => {
      const textureSet = resolvedSets.get(id)
      if (!textureSet) {
        console.warn(`Project PBR texture set was not found: ${projectId}/${id}`)
        return []
      }
      return [textureSet]
    })

    if (textureSets.length === 0) return []

    return [{
      model: rule.model,
      meshIncludes: rule.meshIncludes,
      textureSets,
      distribution: rule.distribution ?? 'stableRandom',
      seed: rule.seed ?? 0,
      uvScaleU: Math.max(0.01, rule.uvScaleU ?? 1),
      uvScaleV: Math.max(0.01, rule.uvScaleV ?? 1),
    }]
  })
}

export const getProjectEntries = (): ProjectEntry[] =>
  Object.entries(projectConfigs)
    .flatMap(([path, config]) => {
      const id = config.id ?? getProjectIdFromConfigPath(path)

      if (!id) {
        return []
      }

      return [{
        id,
        routeId: getProjectRouteId(id),
        title: config.title ?? id,
        basePath: `assets/${id}`,
        config,
        models: resolveConfiguredModels(id, config),
        lightmaps: resolveConfiguredLightmaps(id, config),
        pbrTextureRules: resolveConfiguredPbrTextureRules(id, config),
      }]
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))

export const getProjectById = (id: string) =>
  getProjectEntries().find((project) => project.id === id || project.routeId === id) ?? null
