import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'

type KeyboardNavigationOptions = {
  camera: ArcRotateCamera
  getDeltaTime: () => number
  onEscape: () => void
  onDelete: () => boolean
}

const navigationKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'w', 'a', 's', 'd', 'q', 'e'])

const isEditingControl = () => {
  const activeElement = document.activeElement

  return activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement
}

const getNavigationKey = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase()

  if (navigationKeys.has(event.code)) {
    return event.code
  }

  if (navigationKeys.has(key)) {
    return key
  }

  return null
}

export const createKeyboardNavigationController = ({
  camera,
  getDeltaTime,
  onEscape,
  onDelete,
}: KeyboardNavigationOptions) => {
  const pressedKeys = new Set<string>()

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        onEscape()
        return
      }

      if (isEditingControl()) {
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (onDelete()) {
          event.preventDefault()
          return
        }
      }

      const navigationKey = getNavigationKey(event)

      if (navigationKey) {
        event.preventDefault()
        pressedKeys.add(navigationKey)
      }
    },
    true,
  )

  window.addEventListener(
    'keyup',
    (event) => {
      const navigationKey = getNavigationKey(event)

      if (navigationKey) {
        pressedKeys.delete(navigationKey)
      }
    },
    true,
  )

  window.addEventListener('blur', () => {
    pressedKeys.clear()
  })

  const update = () => {
    if (pressedKeys.size === 0) {
      return
    }

    const forward = camera.getForwardRay().direction
    const movingForward = new Vector3(forward.x, 0, forward.z)

    if (movingForward.lengthSquared() < 0.0001) {
      return
    }

    movingForward.normalize()

    const right = Vector3.Cross(Vector3.Up(), movingForward).normalize()
    const movement = Vector3.Zero()

    if (pressedKeys.has('KeyW') || pressedKeys.has('w')) {
      movement.addInPlace(movingForward)
    }
    if (pressedKeys.has('KeyS') || pressedKeys.has('s')) {
      movement.subtractInPlace(movingForward)
    }
    if (pressedKeys.has('KeyD') || pressedKeys.has('d')) {
      movement.addInPlace(right)
    }
    if (pressedKeys.has('KeyA') || pressedKeys.has('a')) {
      movement.subtractInPlace(right)
    }
    if (pressedKeys.has('KeyE') || pressedKeys.has('e')) {
      movement.y += 1
    }
    if (pressedKeys.has('KeyQ') || pressedKeys.has('q')) {
      movement.y -= 1
    }

    if (movement.lengthSquared() < 0.0001) {
      return
    }

    const speedMultiplier = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') ? 3 : 1
    const slowMultiplier = pressedKeys.has('ControlLeft') || pressedKeys.has('ControlRight') ? 0.28 : 1
    const speed = Math.max(camera.radius * 0.72, 3) * speedMultiplier * slowMultiplier
    const deltaSeconds = getDeltaTime() / 1000
    const offset = movement.normalize().scale(speed * deltaSeconds)

    camera.setTarget(camera.target.add(offset), false, true, true)
  }

  return {
    clearPressedKeys: () => pressedKeys.clear(),
    update,
  }
}

export type KeyboardNavigationController = ReturnType<typeof createKeyboardNavigationController>
