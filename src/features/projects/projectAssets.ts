import type { ViewerConfig } from '../config/viewerConfig'

export type ProjectLightmapConfig = {
  mesh?: string
  material?: string
  texture: string
  uv?: number
  invertY?: boolean
  level?: number
}

export type ProjectConfig = {
  id?: string
  title?: string
  models?: Array<string | { url: string; name?: string }>
  model?: string
  mode?: 'baked' | 'realtime'
  config?: ViewerConfig
  lightmaps?: ProjectLightmapConfig[]
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
  uv: number
  invertY: boolean
  level: number
}

export type ProjectEntry = {
  id: string
  routeId: string
  title: string
  basePath: string
  config: ProjectConfig
  models: ResolvedProjectModel[]
  lightmaps: ResolvedProjectLightmap[]
}

const projectConfigs = import.meta.glob<ProjectConfig>('../../../assets/*/project.json', {
  eager: true,
  import: 'default',
})

const projectAssetUrls = import.meta.glob<string>('../../../assets/*/*.{glb,png,jpg,jpeg,ktx2}', {
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

const resolveProjectAssetUrl = (projectId: string, relativePath: string) =>
  projectAssetUrls[getAssetPath(projectId, relativePath)] ?? null

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
      uv: lightmap.uv ?? 1,
      invertY: lightmap.invertY ?? false,
      level: lightmap.level ?? 1,
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
      }]
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))

export const getProjectById = (id: string) =>
  getProjectEntries().find((project) => project.id === id || project.routeId === id) ?? null
