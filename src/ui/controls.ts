import { Color3 } from '@babylonjs/core/Maths/math.color'
import { colorToHex, hexToColor3 } from '../utils/color'
import { clamp } from '../utils/math'

const formatSliderValue = (value: number, step: number) => {
  const stepText = String(step).toLowerCase()
  const exponentIndex = stepText.indexOf('e-')
  const precision = exponentIndex >= 0
    ? Number.parseInt(stepText.slice(exponentIndex + 2), 10)
    : (stepText.split('.')[1]?.length ?? 0)

  return Number(value.toFixed(Math.min(precision, 4))).toString()
}

export const createSlider = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
  onCommit?: (v: number) => void,
) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const val = document.createElement('span')
  val.className = 'tech-value'
  val.textContent = formatSliderValue(value, step)
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  input.addEventListener('input', () => {
    const v = parseFloat(input.value)
    val.textContent = formatSliderValue(v, step)
    onChange(v)
  })
  input.addEventListener('change', () => {
    const v = parseFloat(input.value)
    val.textContent = formatSliderValue(v, step)
    onCommit?.(v)
  })
  row.append(lbl, input, val)
  return row
}

export const createCheckbox = (label: string, value: boolean, onChange: (v: boolean) => void) => {
  const row = document.createElement('label')
  row.className = 'tech-row tech-row-checkbox'
  const cb = document.createElement('input')
  cb.type = 'checkbox'
  cb.autocomplete = 'off'
  cb.defaultChecked = value
  cb.checked = value
  cb.addEventListener('click', () => onChange(cb.checked))
  const span = document.createElement('span')
  span.textContent = label
  row.append(cb, span)
  ;[0, 100, 500, 1500, 3000].forEach((delay) => {
    window.setTimeout(() => {
      cb.checked = value
    }, delay)
  })
  return row
}

export const createSelect = (label: string, options: string[], value: string, onChange: (v: string) => void) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const sel = document.createElement('select')
  sel.className = 'tech-select'
  options.forEach((opt) => {
    const el = document.createElement('option')
    el.value = opt
    el.textContent = opt
    if (opt === value) el.selected = true
    sel.append(el)
  })
  sel.addEventListener('change', () => onChange(sel.value))
  row.append(lbl, sel)
  return row
}

export const createColorInput = (label: string, color: Color3, onChange: (c: Color3) => void) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const hex = colorToHex(color)
  const input = document.createElement('input')
  input.type = 'color'
  input.value = hex
  input.addEventListener('input', () => {
    onChange(hexToColor3(input.value))
  })
  row.append(lbl, input)
  return row
}

export const createNumberInput = (
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
) => {
  const row = document.createElement('div')
  row.className = 'tech-row'
  const lbl = document.createElement('span')
  lbl.className = 'tech-label'
  lbl.textContent = label
  const input = document.createElement('input')
  input.type = 'number'
  input.className = 'tech-number'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(Number(value.toFixed(4)))
  input.addEventListener('input', () => {
    const nextValue = Number.parseFloat(input.value)
    if (!Number.isNaN(nextValue)) {
      onChange(clamp(nextValue, min, max))
    }
  })
  row.append(lbl, input)
  return row
}

export const createModule = (title: string, bodyContent: HTMLElement[], open = true) => {
  const mod = document.createElement('div')
  mod.className = 'tech-module'
  const header = document.createElement('div')
  header.className = 'tech-module-header'
  header.textContent = title
  const body = document.createElement('div')
  body.className = 'tech-module-body'
  if (!open) body.hidden = true
  bodyContent.forEach((el) => body.append(el))
  header.addEventListener('click', () => {
    body.hidden = !body.hidden
  })
  mod.append(header, body)
  return mod
}
