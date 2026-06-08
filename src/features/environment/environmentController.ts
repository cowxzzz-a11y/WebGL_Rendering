import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture'
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { EnvironmentOption } from '../../shared/types'
import { degreesToRadians } from '../../utils/math'

export type EnvironmentState = {
  selectedEnvironmentKey: string
  environmentBackgroundEnabled: boolean
  environmentRotationY: number
  globalEnvironmentIntensity: number
}

type SetEnvironmentTextureOptions = {
  force?: boolean
  showLoadingStatus?: boolean
  refreshOutline?: boolean
}

type EnvironmentControllerOptions = {
  scene: Scene
  environmentOptions: EnvironmentOption[]
  defaultEnvironmentKey: string
  initialIntensity: number
  setStatus: (message: string | null) => void
  refreshOutline: () => void
  onEnvironmentTextureChanged?: () => void
}

export type EnvironmentController = ReturnType<typeof createEnvironmentController>

export const createEnvironmentController = ({
  scene,
  environmentOptions,
  defaultEnvironmentKey,
  initialIntensity,
  setStatus,
  refreshOutline,
  onEnvironmentTextureChanged,
}: EnvironmentControllerOptions) => {
  let selectedEnvironmentKey = defaultEnvironmentKey
  let environmentBackgroundEnabled = false
  let environmentRotationY = 0
  let globalEnvironmentIntensity = initialIntensity
  let environmentSkybox: AbstractMesh | null = null
  let environmentLoadToken = 0

  const getSelectedOption = () => environmentOptions.find((option) => option.key === selectedEnvironmentKey) ?? null

  const getState = (): EnvironmentState => ({
    selectedEnvironmentKey,
    environmentBackgroundEnabled,
    environmentRotationY,
    globalEnvironmentIntensity,
  })

  const getCurrentLabel = () => getSelectedOption()?.label ?? 'environment.env'

  const getCurrentUrl = () => getSelectedOption()?.resolvedUrl ?? 'Lazy loaded'

  const resolveEnvironmentUrl = async (option: EnvironmentOption) => {
    option.resolvedUrl ??= await option.loadUrl()
    return option.resolvedUrl
  }

  const applyEnvironmentRotation = () => {
    const rotation = degreesToRadians(environmentRotationY)
    const environmentTexture = scene.environmentTexture as (BaseTexture & { rotationY?: number }) | null

    if (environmentTexture && typeof environmentTexture.rotationY === 'number') {
      environmentTexture.rotationY = rotation
    }

    const skyboxTexture = (environmentSkybox?.material as { reflectionTexture?: BaseTexture } | null | undefined)
      ?.reflectionTexture as (BaseTexture & { rotationY?: number }) | null | undefined

    if (skyboxTexture && typeof skyboxTexture.rotationY === 'number') {
      skyboxTexture.rotationY = rotation
    }
  }

  const updateEnvironmentBackground = () => {
    environmentSkybox?.dispose()
    environmentSkybox = null

    if (!environmentBackgroundEnabled || !scene.environmentTexture) {
      return
    }

    environmentSkybox = scene.createDefaultSkybox(scene.environmentTexture, true, 1000, 0, false)
    applyEnvironmentRotation()
  }

  const setEnvironmentBackgroundEnabled = (value: boolean) => {
    environmentBackgroundEnabled = value
  }

  const setEnvironmentRotationY = (value: number) => {
    environmentRotationY = value
  }

  const setGlobalEnvironmentIntensity = (value: number) => {
    globalEnvironmentIntensity = value
    scene.environmentIntensity = value
  }

  const setSceneEnvironmentTexture = async (
    environmentKey: string,
    {
      force = false,
      showLoadingStatus = true,
      refreshOutline: shouldRefreshOutline = true,
    }: SetEnvironmentTextureOptions = {},
  ) => {
    if (!force && selectedEnvironmentKey === environmentKey) {
      return
    }

    const option = environmentOptions.find((entry) => entry.key === environmentKey)

    if (!option) {
      return
    }

    selectedEnvironmentKey = option.key
    const loadToken = ++environmentLoadToken

    if (showLoadingStatus) {
      setStatus(`Loading environment: ${option.label}`)
    }

    try {
      const previousTexture = scene.environmentTexture
      const url = await resolveEnvironmentUrl(option)

      if (loadToken !== environmentLoadToken) {
        return
      }

      const nextTexture = new HDRCubeTexture(
        url,
        scene,
        256,
        false,
        true,
        false,
        true,
        () => {
          if (loadToken === environmentLoadToken) {
            setStatus(null)
            if (shouldRefreshOutline) {
              refreshOutline()
            }
          }
        },
        (message, exception) => {
          if (loadToken === environmentLoadToken) {
            console.error('Environment texture load failed', message, exception)
            setStatus(`Environment load failed: ${option.label}`)
          }
        },
      )

      nextTexture.rotationY = degreesToRadians(environmentRotationY)
      scene.environmentTexture = nextTexture
      scene.environmentIntensity = globalEnvironmentIntensity
      updateEnvironmentBackground()
      onEnvironmentTextureChanged?.()

      if (previousTexture && previousTexture !== nextTexture) {
        previousTexture.dispose()
      }
    } catch (error) {
      if (loadToken === environmentLoadToken) {
        console.error('Environment texture resolve failed', error)
        setStatus(`Environment load failed: ${option.label}`)
      }
      return
    }

    if (shouldRefreshOutline) {
      refreshOutline()
    }
  }

  return {
    getState,
    getCurrentLabel,
    getCurrentUrl,
    setEnvironmentBackgroundEnabled,
    setEnvironmentRotationY,
    setGlobalEnvironmentIntensity,
    setSceneEnvironmentTexture,
    updateEnvironmentBackground,
    applyEnvironmentRotation,
  }
}
