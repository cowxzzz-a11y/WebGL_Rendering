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

  descriptor.sections.forEach((section) => {
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

        const update = (rawValue: string) => {
          const value = Number.parseFloat(rawValue)

          if (Number.isNaN(value)) {
            return
          }

          const nextValue = clamp(value, min, max)
          slider.value = String(nextValue)
          input.value = String(Number(nextValue.toFixed(4)))
          item.onChange(nextValue)
        }

        slider.addEventListener('input', () => update(slider.value))
        input.addEventListener('input', () => update(input.value))
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

      sectionElement.append(row)
    })

    detailPanel.append(sectionElement)
  })
}

export const renderDetailPlaceholder = (detailPanel: HTMLElement) => {
  detailPanel.textContent = ''
  detailPanel.hidden = false

  const empty = document.createElement('div')
  const title = document.createElement('strong')
  const text = document.createElement('span')

  empty.className = 'detail-empty'
  title.textContent = '属性'
  text.textContent = '从上方大纲选择对象或材质'
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
