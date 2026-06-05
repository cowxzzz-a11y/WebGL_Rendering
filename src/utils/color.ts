import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { clamp } from './math'

export const colorToHex = (color: Color3 | Color4) => {
  const channelToHex = (channel: number) => {
    const value = clamp(Math.round(channel * 255), 0, 255)
    return value.toString(16).padStart(2, '0')
  }

  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`
}

export const hexToColor3 = (hex: string) => {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16) / 255
  const g = Number.parseInt(value.slice(2, 4), 16) / 255
  const b = Number.parseInt(value.slice(4, 6), 16) / 255

  return new Color3(r, g, b)
}

