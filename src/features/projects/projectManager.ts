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

    let downPosition: { x: number; y: number } | null = null
    let handledDirectSelection = false
    const selectProject = () => onProjectSelect(project)
    const shouldSelectFromPosition = (x: number, y: number) => {
      if (!downPosition) {
        return false
      }

      const distance = Math.hypot(x - downPosition.x, y - downPosition.y)
      downPosition = null
      return distance <= 10
    }
    const selectProjectOnce = () => {
      if (handledDirectSelection) {
        return
      }

      handledDirectSelection = true
      selectProject()
    }

    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        downPosition = null
        return
      }

      handledDirectSelection = false
      downPosition = { x: event.clientX, y: event.clientY }
    })

    button.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return
      }

      if (shouldSelectFromPosition(event.clientX, event.clientY)) {
        selectProjectOnce()
      }
    })

    button.addEventListener('pointercancel', () => {
      downPosition = null
      handledDirectSelection = false
    })

    button.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0]
      if (!touch) {
        return
      }

      handledDirectSelection = false
      downPosition = { x: touch.clientX, y: touch.clientY }
    })

    button.addEventListener('touchend', (event) => {
      const touch = event.changedTouches[0]
      if (!touch || !shouldSelectFromPosition(touch.clientX, touch.clientY)) {
        return
      }

      event.preventDefault()
      selectProjectOnce()
    })

    button.addEventListener('touchcancel', () => {
      downPosition = null
      handledDirectSelection = false
    })

    button.addEventListener('click', () => {
      if (handledDirectSelection) {
        handledDirectSelection = false
        return
      }

      selectProject()
    })
    grid.append(button)
  })

  shell.append(header, grid)
  root.append(shell)
}
