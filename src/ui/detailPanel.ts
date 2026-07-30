import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import type { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { DetailDescriptor, DetailItem } from '../shared/types'
import { colorToHex, hexToColor3 } from '../utils/color'
import { clamp } from '../utils/math'

export const renderDetailDescriptor = (
  detailPanel: HTMLElement,
  descriptor: DetailDescriptor,
  onClose?: () => void,
) => {
  detailPanel.textContent = ''
  detailPanel.hidden = false

  const header = document.createElement('header')
  const title = document.createElement('div')
  const eyebrow = document.createElement('span')
  const name = document.createElement('strong')

  header.className = 'detail-header'
  title.className = 'detail-title'
  eyebrow.className = 'detail-kind'
  eyebrow.textContent = descriptor.kind
  name.textContent = descriptor.title
  title.append(eyebrow, name)

  if (onClose) {
    const closeButton = document.createElement('button')

    closeButton.className = 'detail-close'
    closeButton.type = 'button'
    closeButton.textContent = '\u00d7'
    closeButton.ariaLabel = '\u5173\u95ed\u5c5e\u6027\u9762\u677f'
    closeButton.addEventListener('click', onClose)
    header.append(title, closeButton)
  } else {
    header.append(title)
  }

  detailPanel.append(header)

  const renderSections = (sections: DetailDescriptor['sections'], target: HTMLElement) => {
    sections.forEach((section) => {
    const sectionElement = document.createElement('section')
    const sectionTitle = document.createElement('h3')

    sectionElement.className = 'detail-section'
    sectionTitle.textContent = section.title
    sectionElement.append(sectionTitle)

    section.items.forEach((item) => {
      const row = document.createElement('label')
      const label = document.createElement('span')

      row.className = 'detail-field'
      label.textContent = item.label
      row.append(label)

      if (item.type === 'number') {
        const controlGroup = document.createElement('div')
        const slider = document.createElement('input')
        const input = document.createElement('input')
        const min = item.min ?? 0
        const max = item.max ?? 1
        const step = item.step ?? 0.01

        controlGroup.className = 'detail-number'
        slider.type = 'range'
        slider.min = String(min)
        slider.max = String(max)
        slider.step = String(step)
        slider.value = String(clamp(item.value, min, max))
        input.type = 'number'
        input.min = String(min)
        input.max = String(max)
        input.step = String(step)
        input.value = String(Number(item.value.toFixed(4)))
        let lastCommittedValue = clamp(item.value, min, max)

        const applyValue = (value: number, syncNumberInput: boolean) => {
          const nextValue = clamp(value, min, max)

          slider.value = String(nextValue)
          if (syncNumberInput) {
            input.value = String(Number(nextValue.toFixed(4)))
          }
          if (nextValue !== lastCommittedValue) {
            lastCommittedValue = nextValue
            item.onChange(nextValue)
          }
        }

        slider.addEventListener('input', () => applyValue(Number.parseFloat(slider.value), true))
        input.addEventListener('input', () => {
          const value = Number.parseFloat(input.value)

          // Keep incomplete editing states such as "", "0", or "0." intact.
          // The value is normalized only when the user commits the field.
          if (Number.isNaN(value) || value < min || value > max) {
            return
          }

          applyValue(value, false)
        })
        input.addEventListener('change', () => {
          const value = Number.parseFloat(input.value)

          if (Number.isNaN(value)) {
            input.value = String(Number(lastCommittedValue.toFixed(4)))
            return
          }

          applyValue(value, true)
        })
        controlGroup.append(slider, input)
        row.append(controlGroup)
      }

      if (item.type === 'color') {
        const input = document.createElement('input')

        input.type = 'color'
        input.value = colorToHex(item.value)
        input.addEventListener('input', () => item.onChange(hexToColor3(input.value)))
        row.append(input)
      }

      if (item.type === 'checkbox') {
        const input = document.createElement('input')

        input.type = 'checkbox'
        input.checked = item.value
        input.addEventListener('change', () => item.onChange(input.checked))
        row.append(input)
      }

      if (item.type === 'text') {
        const value = document.createElement('output')

        value.textContent = item.value
        row.append(value)
      }

      if (item.type === 'select') {
        const select = document.createElement('select')

        select.className = 'tech-select'
        item.options.forEach((option) => {
          const optionElement = document.createElement('option')

          optionElement.value = option.value
          optionElement.textContent = option.label
          optionElement.selected = option.value === item.value
          select.append(optionElement)
        })
        select.addEventListener('change', () => item.onChange(select.value))
        row.append(select)
      }

      if (item.type === 'vector3') {
        const control = document.createElement('div')
        const axes = ['X', 'Y', 'Z'] as const
        const min = item.min ?? Number.NEGATIVE_INFINITY
        const max = item.max ?? Number.POSITIVE_INFINITY
        const step = item.step ?? 0.01

        control.className = 'detail-vector3'
        axes.forEach((axis, index) => {
          const axisField = document.createElement('label')
          const axisLabel = document.createElement('span')
          const input = document.createElement('input')

          axisField.className = 'detail-axis'
          axisLabel.textContent = axis
          axisLabel.dataset.axis = axis.toLowerCase()
          input.type = 'number'
          input.step = String(step)
          if (Number.isFinite(min)) input.min = String(min)
          if (Number.isFinite(max)) input.max = String(max)
          input.value = String(Number(item.value[index].toFixed(4)))
          input.addEventListener('change', () => {
            const parsed = Number.parseFloat(input.value)
            if (Number.isNaN(parsed)) return
            const value = clamp(parsed, min, max)
            input.value = String(Number(value.toFixed(4)))
            item.onChange(index as 0 | 1 | 2, value)
          })
          axisField.append(axisLabel, input)
          control.append(axisField)
        })
        row.classList.add('detail-field-vector')
        row.append(control)
      }

      if (item.type === 'texture') {
        const control = document.createElement('div')
        const preview = document.createElement('span')
        const meta = document.createElement('span')
        const buttons = document.createElement('span')
        const upload = document.createElement('button')
        const clear = document.createElement('button')
        const input = document.createElement('input')

        control.className = 'detail-texture'
        preview.className = 'detail-texture-preview'
        if (item.previewUrl) {
          preview.style.backgroundImage = `url("${item.previewUrl}")`
        } else {
          preview.dataset.empty = 'true'
        }
        meta.className = 'detail-texture-meta'
        meta.textContent = item.fileName ?? '未设置贴图'
        buttons.className = 'detail-texture-actions'
        upload.type = 'button'
        upload.textContent = item.fileName ? '替换' : '上传'
        clear.type = 'button'
        clear.textContent = '清除'
        clear.disabled = !item.fileName
        input.type = 'file'
        input.accept = item.accept ?? '.png,.jpg,.jpeg,.webp,.avif,.ktx2'
        input.hidden = true
        upload.addEventListener('click', () => input.click())
        clear.addEventListener('click', () => {
          item.onClear()
          preview.style.backgroundImage = ''
          preview.dataset.empty = 'true'
          meta.textContent = '未设置贴图'
          clear.disabled = true
          upload.textContent = '上传'
        })
        input.addEventListener('change', async () => {
          const file = input.files?.[0]
          if (!file) return
          await item.onSelect(file)
          if (file.type.startsWith('image/')) {
            const reader = new FileReader()
            reader.addEventListener('load', () => {
              preview.style.backgroundImage = `url("${String(reader.result)}")`
              delete preview.dataset.empty
            })
            reader.readAsDataURL(file)
          } else {
            preview.style.backgroundImage = ''
            preview.dataset.empty = 'true'
          }
          meta.textContent = file.name
          clear.disabled = false
          upload.textContent = '替换'
          input.value = ''
        })
        buttons.append(upload, clear)
        control.append(preview, meta, buttons, input)
        row.classList.add('detail-field-texture')
        row.append(control)
      }

      sectionElement.append(row)
    })

      target.append(sectionElement)
    })
  }

  renderSections(descriptor.sections, detailPanel)

  if (descriptor.tabs?.length) {
    const region = document.createElement('div')
    const tabs = descriptor.tabs
    const owner = `${descriptor.kind}:${descriptor.title}`
    const previousOwner = detailPanel.dataset.tabOwner
    const previousTab = previousOwner === owner ? detailPanel.dataset.activeMaterialTab : undefined
    let activeId = tabs.some((tab) => tab.id === previousTab) ? previousTab! : tabs[0].id
    const nav = document.createElement('div')
    const content = document.createElement('div')

    region.className = 'detail-material-region'
    nav.className = 'detail-material-tabs'
    content.className = 'detail-material-content'

    const renderActive = () => {
      const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
      content.textContent = ''
      const heading = document.createElement('div')
      const label = document.createElement('strong')
      const kind = document.createElement('span')
      heading.className = 'detail-material-heading'
      label.textContent = active.label
      kind.textContent = active.kind ?? '材质'
      heading.append(label, kind)
      content.append(heading)
      renderSections(active.sections, content)
      nav.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        button.dataset.active = String(button.dataset.tabId === activeId)
      })
      detailPanel.dataset.tabOwner = owner
      detailPanel.dataset.activeMaterialTab = activeId
    }

    if (tabs.length > 1) {
      tabs.forEach((tab, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.tabId = tab.id
        button.textContent = tab.label || `材质 ${index + 1}`
        button.addEventListener('click', () => {
          activeId = tab.id
          renderActive()
        })
        nav.append(button)
      })
      region.append(nav)
    }
    region.append(content)
    detailPanel.append(region)
    renderActive()
  }
}

export const renderDetailPlaceholder = (detailPanel: HTMLElement) => {
  detailPanel.textContent = ''
  detailPanel.hidden = false

  const empty = document.createElement('div')
  const title = document.createElement('strong')
  const text = document.createElement('span')

  empty.className = 'detail-empty'
  title.textContent = '属性'
  text.textContent = '从左侧场景选择一个对象'
  empty.append(title, text)
  detailPanel.append(empty)
}

export const numberItem = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
): DetailItem => ({
  type: 'number',
  label,
  value,
  min,
  max,
  step,
  onChange,
})

export const colorItem = (label: string, value: Color3 | Color4, onChange: (value: Color3) => void): DetailItem => ({
  type: 'color',
  label,
  value,
  onChange,
})

export const checkboxItem = (label: string, value: boolean, onChange: (value: boolean) => void): DetailItem => ({
  type: 'checkbox',
  label,
  value,
  onChange,
})

export const textItem = (label: string, value: string): DetailItem => ({
  type: 'text',
  label,
  value,
})

export const selectItem = (
  label: string,
  value: string,
  options: Array<{
    label: string
    value: string
  }>,
  onChange: (value: string) => void,
): DetailItem => ({
  type: 'select',
  label,
  value,
  options,
  onChange,
})

export const vector3Item = (
  label: string,
  value: [number, number, number],
  min: number,
  max: number,
  step: number,
  onChange: (axis: 0 | 1 | 2, value: number) => void,
): DetailItem => ({
  type: 'vector3',
  label,
  value,
  min,
  max,
  step,
  onChange,
})

export const textureItem = (
  label: string,
  fileName: string | null,
  previewUrl: string | null,
  onSelect: (file: File) => void | Promise<void>,
  onClear: () => void,
): DetailItem => ({
  type: 'texture',
  label,
  fileName,
  previewUrl,
  onSelect,
  onClear,
})

export const vectorItems = (
  vector: Vector3,
  labels: [string, string, string],
  min: number,
  max: number,
  step: number,
  afterChange?: () => void,
): DetailItem[] => [
  numberItem(labels[0], vector.x, min, max, step, (value) => {
    vector.x = value
    afterChange?.()
  }),
  numberItem(labels[1], vector.y, min, max, step, (value) => {
    vector.y = value
    afterChange?.()
  }),
  numberItem(labels[2], vector.z, min, max, step, (value) => {
    vector.z = value
    afterChange?.()
  }),
]
