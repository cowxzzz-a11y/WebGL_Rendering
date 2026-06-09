import type { ProjectEntry } from './projectAssets'

export type ProjectManagerOptions = {
  root: HTMLElement
  projects: ProjectEntry[]
  onProjectSelect: (project: ProjectEntry) => void
}

export const renderProjectManager = ({
  root,
  projects,
  onProjectSelect,
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
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'project-card'

    const name = document.createElement('strong')
    name.textContent = project.title

    const path = document.createElement('span')
    path.textContent = project.basePath

    const meta = document.createElement('em')
    meta.textContent = `${project.models.length} 个模型 / ${project.lightmaps.length} 张光照贴图`

    button.append(name, path, meta)

    let pointerDownPosition: { x: number; y: number } | null = null
    let handledPointerSelection = false
    const selectProject = () => onProjectSelect(project)

    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        pointerDownPosition = null
        return
      }

      handledPointerSelection = false
      pointerDownPosition = { x: event.clientX, y: event.clientY }
    })

    button.addEventListener('pointerup', (event) => {
      if (!pointerDownPosition || event.button !== 0) {
        return
      }

      const distance = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y)
      pointerDownPosition = null

      if (distance > 10) {
        return
      }

      handledPointerSelection = true
      selectProject()
    })

    button.addEventListener('pointercancel', () => {
      pointerDownPosition = null
      handledPointerSelection = false
    })

    button.addEventListener('click', () => {
      if (handledPointerSelection) {
        handledPointerSelection = false
        return
      }

      selectProject()
    })
    grid.append(button)
  })

  shell.append(header, grid)
  root.append(shell)
}
