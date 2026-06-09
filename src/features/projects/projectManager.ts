import type { ProjectEntry } from './projectAssets'

export type ProjectManagerOptions = {
  root: HTMLElement
  projects: ProjectEntry[]
  onProjectSelect?: (project: ProjectEntry) => void
}

export const renderProjectManager = ({
  root,
  projects,
}: ProjectManagerOptions) => {
  root.textContent = ''
  root.hidden = false

  const shell = document.createElement('div')
  shell.className = 'project-manager-shell'

  const header = document.createElement('header')
  header.className = 'project-manager-header'

  const title = document.createElement('h1')
  title.textContent = '项目管理'
  const subtitle = document.createElement('p')
  subtitle.textContent = '选择一个已配置项目进入 3D 场景'
  header.append(title, subtitle)

  const grid = document.createElement('div')
  grid.className = 'project-grid'

  if (projects.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'project-empty'
    empty.textContent = 'assets 下没有找到带 project.json 的项目文件夹'
    grid.append(empty)
  }

  projects.forEach((project) => {
    const projectUrl = new URL(window.location.href)
    projectUrl.searchParams.set('project', project.id)

    const card = document.createElement('a')
    card.className = 'project-card'
    card.href = `${projectUrl.pathname}${projectUrl.search}${projectUrl.hash}`

    const name = document.createElement('strong')
    name.textContent = project.title

    const path = document.createElement('span')
    path.textContent = project.basePath

    const meta = document.createElement('em')
    meta.textContent = `${project.models.length} 个模型 / ${project.lightmaps.length} 张光照贴图`

    card.append(name, path, meta)
    grid.append(card)
  })

  shell.append(header, grid)
  root.append(shell)
}
