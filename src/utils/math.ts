export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export const degreesToRadians = (value: number) => (value * Math.PI) / 180

export const radiansToDegrees = (value: number) => (value * 180) / Math.PI

