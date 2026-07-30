type ContentBrowserOptions = {
  button: HTMLButtonElement
  panel: HTMLDivElement
  onAssetActivate?: (kind: string) => void
}

export type ContentBrowserController = {
  setOpen: (open: boolean) => void
  isOpen: () => boolean
}

type ContentAsset = {
  name: string
  description: string
  kind: string
}

type ContentCategory = {
  title: string
  assets: ContentAsset[]
}

const categories: ContentCategory[] = [
  {
    title: '材质',
    assets: [
      {
        name: '\u6807\u51c6PBR\u6750\u8d28',
        description: '\u6807\u51c6GLB PBR\u8868\u9762',
        kind: 'material.pbr',
      },
      {
        name: '河流水材质',
        description: '程序化流动水面',
        kind: 'material.riverWater',
      },
      {
        name: 'DTAA透明材质',
        description: '深度裁剪式可调透明',
        kind: 'material.dtaa',
      },
    ],
  },
  { title: '热点', assets: [] },
  { title: '粒子', assets: [] },
]

const createAssetButton = (asset: ContentAsset, onAssetActivate?: (kind: string) => void) => {
  const item = document.createElement('button')
  item.className = 'content-asset'
  item.type = 'button'
  item.draggable = true
  item.dataset.kind = asset.kind
  item.title = asset.description

  const icon = document.createElement('span')
  icon.className = 'content-asset-icon'
  icon.setAttribute('aria-hidden', 'true')

  const text = document.createElement('span')
  text.className = 'content-asset-text'

  const name = document.createElement('strong')
  name.textContent = asset.name

  const description = document.createElement('span')
  description.textContent = asset.description

  text.append(name, description)
  item.append(icon, text)

  item.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData('application/x-viewer-content', asset.kind)
    event.dataTransfer?.setData('text/plain', asset.name)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy'
    }
  })
  item.addEventListener('click', () => onAssetActivate?.(asset.kind))

  return item
}

const createCategory = (category: ContentCategory, open: boolean, onAssetActivate?: (kind: string) => void) => {
  const details = document.createElement('details')
  details.className = 'content-category'
  details.open = open

  const summary = document.createElement('summary')
  summary.className = 'content-category-summary'

  const title = document.createElement('span')
  title.textContent = category.title

  const count = document.createElement('em')
  count.textContent = String(category.assets.length)

  summary.append(title, count)
  details.append(summary)

  const body = document.createElement('div')
  body.className = 'content-category-body'

  if (category.assets.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'content-empty'
    empty.textContent = '暂未接入'
    body.append(empty)
  } else {
    category.assets.forEach((asset) => body.append(createAssetButton(asset, onAssetActivate)))
  }

  details.append(body)
  return details
}

export const setupContentBrowser = ({ button, panel, onAssetActivate }: ContentBrowserOptions): ContentBrowserController => {
  let open = false

  const setOpen = (value: boolean) => {
    open = value
    button.classList.toggle('content-browser-button-active', open)
    button.setAttribute('aria-expanded', String(open))
    panel.classList.toggle('content-browser-panel-open', open)
    panel.setAttribute('aria-hidden', String(!open))
    panel.style.opacity = open ? '1' : '0'
    panel.style.pointerEvents = open ? 'auto' : 'none'
    panel.style.transform = open ? 'translateX(0)' : 'translateX(calc(-100% - 24px))'
  }

  const header = document.createElement('header')
  header.className = 'content-browser-header'

  const title = document.createElement('div')
  title.className = 'content-browser-title'

  const strong = document.createElement('strong')
  strong.textContent = 'Content'

  const subtitle = document.createElement('span')
  subtitle.textContent = '材质 / 热点 / 粒子'

  title.append(strong, subtitle)
  header.append(title)

  const body = document.createElement('div')
  body.className = 'content-browser-body'
  categories.forEach((category, index) => body.append(createCategory(category, index === 0, onAssetActivate)))

  panel.textContent = ''
  panel.append(header, body)

  setOpen(false)

  return {
    setOpen,
    isOpen: () => open,
  }
}
