import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { OutlineNode, PanelTab } from '../shared/types'

type OutlineRendererOptions = {
  getActiveDetailId: () => string | null
  getMeshFromDetailId: (detailId: string | undefined) => AbstractMesh | null
  onDetailSelect: (detailId: string | undefined) => void
  onFocusTarget: (target: AbstractMesh | TransformNode) => void
  onMeshSelect: (mesh: AbstractMesh) => void
  onVisibilityToggle: (node: OutlineNode) => void
}

const makeOutlineRow = (
  node: OutlineNode,
  {
    getActiveDetailId,
    getMeshFromDetailId,
    onDetailSelect,
    onFocusTarget,
    onMeshSelect,
    onVisibilityToggle,
  }: OutlineRendererOptions,
) => {
  const row = document.createElement('div')
  const icon = node.visibilityTarget ? document.createElement('button') : document.createElement('span')
  const name = document.createElement('span')

  row.className = 'outliner-row'
  row.dataset.detailActive = String(node.detailId === getActiveDetailId())
  icon.className = 'outliner-icon'
  icon.dataset.kind = node.kind

  if (node.visibilityTarget) {
    const button = icon as HTMLButtonElement
    button.type = 'button'
    icon.classList.add('outliner-visibility')
    icon.dataset.visible = String(node.visibilityTarget.getVisible())
    icon.ariaLabel = node.visibilityTarget.getVisible() ? 'Hide object' : 'Show object'
    icon.addEventListener('click', (event) => {
      event.stopPropagation()
      node.visibilityTarget!.setVisible(!node.visibilityTarget!.getVisible())
      onVisibilityToggle(node)
    })
  }

  name.className = 'outliner-name'
  name.textContent = node.name
  row.append(icon, name)

  if (node.detailId) {
    row.tabIndex = 0
    row.role = 'button'

    const selectNode = () => {
      const mesh = getMeshFromDetailId(node.detailId)
      if (mesh) {
        onMeshSelect(mesh)
        return
      }

      onDetailSelect(node.detailId)
    }

    row.addEventListener('click', (event) => {
      event.stopPropagation()
      selectNode()
    })
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectNode()
      }
    })
  }

  if (node.focusTarget) {
    row.tabIndex = 0
    row.addEventListener('dblclick', (event) => {
      const target = node.focusTarget
      if (!target) {
        return
      }

      event.stopPropagation()
      if (target instanceof AbstractMesh) {
        onMeshSelect(target)
      }
      onFocusTarget(target)
    })
  }

  return row
}

export const makeOutlineBranch = (node: OutlineNode, options: OutlineRendererOptions): HTMLElement => {
  if (!node.children?.length) {
    const leaf = document.createElement('div')
    leaf.className = 'outliner-leaf'
    leaf.append(makeOutlineRow(node, options))
    return leaf
  }

  const branch = document.createElement('div')
  const header = document.createElement('div')
  const children = document.createElement('div')
  const row = makeOutlineRow(node, options)
  const toggle = document.createElement('button')
  const setExpanded = (expanded: boolean) => {
    node.open = expanded
    branch.dataset.open = String(expanded)
    children.hidden = !expanded
    toggle.ariaLabel = expanded ? `Collapse ${node.name}` : `Expand ${node.name}`
    toggle.ariaExpanded = String(expanded)
  }

  branch.className = 'outliner-branch'
  header.className = 'outliner-branch-header'
  toggle.type = 'button'
  toggle.className = 'outliner-toggle'
  toggle.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    setExpanded(node.open !== true)
  })
  row.prepend(toggle)
  header.append(row)
  children.className = 'outliner-children'
  node.children.forEach((child) => children.append(makeOutlineBranch(child, options)))
  branch.append(header, children)
  setExpanded(node.open ?? false)

  return branch
}

export const createPanelTabsRenderer = (
  sceneTabs: HTMLElement,
  getActiveTabId: () => string,
  setActiveTabId: (tabId: string) => void,
  onChange: () => void,
) => {
  let cachedTabsContainer: HTMLElement | null = null

  return (tabs: PanelTab[]) => {
    let container = cachedTabsContainer
    const activeTabId = getActiveTabId()

    if (!container || !sceneTabs.contains(container)) {
      sceneTabs.textContent = ''

      container = document.createElement('div')
      container.className = 'tabs'

      tabs.forEach((tab) => {
        const input = document.createElement('input')
        input.type = 'radio'
        input.id = `tab-${tab.id}`
        input.name = 'tabs'
        input.checked = tab.id === activeTabId
        input.addEventListener('change', () => {
          if (input.checked) {
            setActiveTabId(tab.id)
            onChange()
          }
        })

        const label = document.createElement('label')
        label.className = 'tab'
        label.htmlFor = `tab-${tab.id}`
        label.textContent = tab.label
        container!.append(input, label)
      })

      const glider = document.createElement('span')
      glider.className = 'glider'
      container.append(glider)

      sceneTabs.append(container)
      cachedTabsContainer = container
    }

    const nextActiveTabId = getActiveTabId()
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    tabs.forEach((tab, i) => {
      radios[i].checked = tab.id === nextActiveTabId
    })

    const updateGlider = () => {
      const labels = container.querySelectorAll<HTMLLabelElement>('.tab')
      const glider = container.querySelector<HTMLSpanElement>('.glider')!
      const activeIndex = tabs.findIndex((tab) => tab.id === getActiveTabId())
      const activeLabel = labels[activeIndex]
      if (activeLabel) {
        glider.style.width = `${activeLabel.offsetWidth}px`
        glider.style.transform = `translateX(${activeLabel.offsetLeft}px)`
      }
    }

    requestAnimationFrame(updateGlider)
  }
}
