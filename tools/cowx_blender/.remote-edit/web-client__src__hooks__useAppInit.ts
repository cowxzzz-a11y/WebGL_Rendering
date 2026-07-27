import { loggerService } from '@logger'
import { isEmbeddingModel, isRerankModel, isTextToImageModel } from '@renderer/config/models'
import { isMac } from '@renderer/config/constant'
import { isLocalAi } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import db from '@renderer/databases'
import i18n, { setDayjsLocale } from '@renderer/i18n'
import KnowledgeQueue from '@renderer/queue/KnowledgeQueue'
import MemoryService from '@renderer/services/MemoryService'
import { handleSaveData, useAppDispatch, useAppSelector } from '@renderer/store'
import store from '@renderer/store'
import { selectMemoryConfig } from '@renderer/store/memory'
import { updateProviders } from '@renderer/store/llm'
import { updateAssistants, updateDefaultAssistant } from '@renderer/store/assistants'
import { setAvatar, setFilesPath, setResourcesPath, setUpdateState } from '@renderer/store/runtime'
import { updateBases } from '@renderer/store/knowledge'
import { selectIsAdmin, selectIsAuthenticated } from '@renderer/store/authStore'
import {
  type ToolPermissionRequestPayload,
  type ToolPermissionResultPayload,
  toolPermissionsActions
} from '@renderer/store/toolPermissions'
import { delay, runAsyncFunction } from '@renderer/utils'
import { checkDataLimit } from '@renderer/utils'
import { defaultLanguage } from '@shared/config/constant'
import { IpcChannel } from '@shared/IpcChannel'
import { useLiveQuery } from 'dexie-react-hooks'
import { debounce } from 'lodash'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useDefaultModel } from './useAssistant'
import useFullScreenNotice from './useFullScreenNotice'
import { useRuntime } from './useRuntime'
import { useNavbarPosition, useSettings } from './useSettings'
import useUpdateHandler from './useUpdateHandler'
import type { Model, Provider } from '@renderer/types'

const logger = loggerService.withContext('useAppInit')

const isManagedTextModel = (model: Model) => !isEmbeddingModel(model) && !isRerankModel(model) && !isTextToImageModel(model)

function normalizeAdminProvider(provider: any): Provider | null {
  const id = typeof provider?.id === 'string' && provider.id ? provider.id : provider?.provider
  const type = typeof provider?.type === 'string' && provider.type ? provider.type : 'openai'
  if (typeof id !== 'string' || !id || typeof type !== 'string' || !type) {
    return null
  }

  const models = Array.isArray(provider.models)
    ? provider.models
        .map((model: any) => {
          if (typeof model === 'string') {
            return { id: model, name: model, provider: id }
          }
          if (model && typeof model.id === 'string' && model.id) {
            return {
              ...model,
              name: typeof model.name === 'string' && model.name ? model.name : model.id,
              provider: id
            }
          }
          return null
        })
        .filter(Boolean)
    : []

  return {
    id,
    type,
    name: typeof provider?.name === 'string' && provider.name ? provider.name : id,
    apiKey: provider?.apiKey || provider?.api_key || '',
    apiHost: provider?.apiHost || provider?.baseURL || '',
    models,
    enabled: true,
    isSystem: provider?.isSystem
  } as Provider
}

function reconcileWebProviders(existingProviders: Provider[], adminProviders: any[] | undefined): Provider[] {
  const managedProviders = (adminProviders || []).map(normalizeAdminProvider).filter(Boolean) as Provider[]
  const managedProviderMap = new Map(managedProviders.map((provider) => [provider.id, provider]))

  const reconciledProviders: Provider[] = existingProviders
    .map((provider) => {
      const managedProvider = managedProviderMap.get(provider.id)
      if (managedProvider) {
        return {
          ...provider,
          ...managedProvider,
          enabled: true
        }
      }

      if (provider.isSystem) {
        return {
          ...provider,
          apiKey: '',
          apiHost: '',
          enabled: false
        }
      }

      return null
    })
    .filter(Boolean) as Provider[]

  for (const managedProvider of managedProviders) {
    if (!reconciledProviders.some((provider) => provider.id === managedProvider.id)) {
      reconciledProviders.push(managedProvider)
    }
  }

  return reconciledProviders
}

function hasProviderModel(model: Model | null | undefined, providers: Provider[]): boolean {
  if (!model?.provider || !model.id) {
    return false
  }

  const provider = providers.find((item) => item.id === model.provider)
  return !!provider?.models.some((item) => item.id === model.id)
}

function findFirstModel(providers: Provider[], predicate: (model: Model) => boolean): Model | null {
  for (const provider of providers) {
    const matchedModel = provider.models.find(predicate)
    if (matchedModel) {
      return matchedModel
    }
  }

  return null
}

function resolveManagedModel(
  model: Model | null | undefined,
  providers: Provider[],
  predicate: (model: Model) => boolean,
  fallback?: Model | null
): Model | null {
  if (model && hasProviderModel(model, providers) && predicate(model)) {
    return model
  }

  return fallback ?? findFirstModel(providers, predicate)
}

function sameModel(left: Model | null | undefined, right: Model | null | undefined): boolean {
  return !!left && !!right && left.id === right.id && left.provider === right.provider
}

function forceAssistantModel(assistant: any, model: Model): any {
  if (sameModel(assistant?.model, model) && sameModel(assistant?.defaultModel, model)) {
    return assistant
  }

  return {
    ...assistant,
    model,
    defaultModel: model
  }
}

export function useAppInit() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const {
    proxyUrl,
    proxyBypassRules,
    language,
    windowStyle,
    autoCheckUpdate,
    proxyMode,
    customCss,
    enableDataCollection
  } = useSettings()
  const { isLeftNavbar } = useNavbarPosition()
  const { minappShow } = useRuntime()
  const { setDefaultModel, setQuickModel, setTranslateModel, setDefaultEmbeddingModel, setDefaultRerankModel } = useDefaultModel()
  const avatar = useLiveQuery(() => db.settings.get('image://avatar'))
  const { theme } = useTheme()
  const memoryConfig = useAppSelector(selectMemoryConfig)
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const isAdmin = useAppSelector(selectIsAdmin)
  const providers = useAppSelector((state) => state.llm.providers)
  const defaultModel = useAppSelector((state) => state.llm.defaultModel)
  const quickModel = useAppSelector((state) => state.llm.quickModel)
  const translateModel = useAppSelector((state) => state.llm.translateModel)
  const defaultEmbeddingModel = useAppSelector((state) => state.llm.defaultEmbeddingModel)
  const defaultRerankModel = useAppSelector((state) => state.llm.defaultRerankModel)
  const defaultAssistant = useAppSelector((state) => state.assistants.defaultAssistant)
  const assistants = useAppSelector((state) => state.assistants.assistants)

  useEffect(() => {
    document.getElementById('spinner')?.remove()
    // eslint-disable-next-line no-restricted-syntax
    console.timeEnd('init')

    // Initialize MemoryService after app is ready
    MemoryService.getInstance()
  }, [])

  useEffect(() => {
    window.api.getDataPathFromArgs().then((dataPath) => {
      if (dataPath) {
        window.navigate('/settings/data', { replace: true })
      }
    })
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on(IpcChannel.App_SaveData, async () => {
      await handleSaveData()
    })
  }, [])

  useUpdateHandler()
  useFullScreenNotice()

  useEffect(() => {
    avatar?.value && dispatch(setAvatar(avatar.value))
  }, [avatar, dispatch])

  useEffect(() => {
    const checkForUpdates = async () => {
      const { isPackaged } = await window.api.getAppInfo()

      if (!isPackaged || !autoCheckUpdate) {
        return
      }

      const { updateInfo } = await window.api.checkForUpdate()
      dispatch(setUpdateState({ info: updateInfo }))
    }

    // Initial check with delay
    runAsyncFunction(async () => {
      const { isPackaged } = await window.api.getAppInfo()
      if (isPackaged && autoCheckUpdate) {
        await delay(2)
        await checkForUpdates()
      }
    })

    // Set up 4-hour interval check
    const FOUR_HOURS = 4 * 60 * 60 * 1000
    const intervalId = setInterval(checkForUpdates, FOUR_HOURS)

    return () => clearInterval(intervalId)
  }, [dispatch, autoCheckUpdate])

  useEffect(() => {
    if (proxyMode === 'system') {
      window.api.setProxy('system', undefined)
    } else if (proxyMode === 'custom') {
      proxyUrl && window.api.setProxy(proxyUrl, proxyBypassRules)
    } else {
      // set proxy to none for direct mode
      window.api.setProxy('', undefined)
    }
  }, [proxyUrl, proxyMode, proxyBypassRules])

  useEffect(() => {
    const currentLanguage = language || navigator.language || defaultLanguage
    i18n.changeLanguage(currentLanguage)
    setDayjsLocale(currentLanguage)
  }, [language])

  useEffect(() => {
    const isMacTransparentWindow = windowStyle === 'transparent' && isMac

    if (minappShow && isLeftNavbar) {
      window.root.style.background = isMacTransparentWindow ? 'var(--color-background)' : 'var(--navbar-background)'
      return
    }

    window.root.style.background = isMacTransparentWindow ? 'var(--navbar-background-mac)' : 'var(--navbar-background)'
  }, [windowStyle, minappShow, theme, isLeftNavbar])

  useEffect(() => {
    if (isLocalAi) {
      const model = JSON.parse(import.meta.env.VITE_RENDERER_INTEGRATED_MODEL)
      setDefaultModel(model)
      setQuickModel(model)
      setTranslateModel(model)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // set files path
    window.api.getAppInfo().then((info) => {
      dispatch(setFilesPath(info.filesPath))
      dispatch(setResourcesPath(info.resourcesPath))
    })
  }, [dispatch])

  // Web mode: sync knowledge bases and providers from server on init
  useEffect(() => {
    const isRealElectron = typeof window.electron?.process?.platform === 'string'
    if (isRealElectron || !isAuthenticated) return

    const syncFromServer = async () => {
      try {
        const bases = await window.api.knowledgeBase.getAll()
        if (Array.isArray(bases) && bases.length > 0) {
          dispatch(updateBases(bases))
        }
      } catch (e) {
        console.error('[WebInit] Failed to sync knowledge bases from server:', e)
      }

      try {
        const adminConfig = await window.api.adminConfig.get()
        const currentProviders = store.getState().llm.providers
        const reconciledProviders = reconcileWebProviders(currentProviders, adminConfig?.providers)
        dispatch(updateProviders(reconciledProviders))

        const resolvedDefaultModel = resolveManagedModel(adminConfig?.defaultModel, reconciledProviders, isManagedTextModel)
        const resolvedQuickModel = resolveManagedModel(
          adminConfig?.quickModel,
          reconciledProviders,
          isManagedTextModel,
          resolvedDefaultModel
        )
        const resolvedTranslateModel = resolveManagedModel(
          adminConfig?.translateModel,
          reconciledProviders,
          isManagedTextModel,
          resolvedDefaultModel
        )
        const resolvedEmbeddingModel = resolveManagedModel(adminConfig?.embeddingModel, reconciledProviders, isEmbeddingModel)
        const resolvedRerankModel = resolveManagedModel(adminConfig?.rerankModel, reconciledProviders, isRerankModel)

        if (resolvedDefaultModel) {
          setDefaultModel(resolvedDefaultModel)

          // In managed web mode, keep every user's per-browser assistants aligned
          // with the server admin default so stale cached assistant models do not
          // keep sending removed model IDs.
          const nextDefaultAssistant = forceAssistantModel(defaultAssistant, resolvedDefaultModel)
          if (nextDefaultAssistant !== defaultAssistant) {
            dispatch(updateDefaultAssistant({ assistant: nextDefaultAssistant }))
          }

          const nextAssistants = assistants.map((assistant) => forceAssistantModel(assistant, resolvedDefaultModel))
          if (nextAssistants.some((assistant, index) => assistant !== assistants[index])) {
            dispatch(updateAssistants(nextAssistants))
          }
        }
        if (resolvedQuickModel) {
          setQuickModel(resolvedQuickModel)
        }
        if (resolvedTranslateModel) {
          setTranslateModel(resolvedTranslateModel)
        }
        setDefaultEmbeddingModel(resolvedEmbeddingModel)
        setDefaultRerankModel(resolvedRerankModel)
      } catch (e) {
        console.error('[WebInit] Failed to sync providers from server:', e)
      }
    }

    syncFromServer()
  }, [dispatch, isAuthenticated, defaultAssistant, assistants])

  // Server-managed uploads continue after the browser closes. Refresh only while
  // such a task is active so reopening the page restores its durable progress.
  useEffect(() => {
    const isRealElectron = typeof window.electron?.process?.platform === 'string'
    if (isRealElectron || !isAuthenticated) return

    let refreshing = false
    const refreshServerManagedUploads = async () => {
      const hasActiveUpload = store
        .getState()
        .knowledge.bases.some((base) =>
          base.items.some((item) => item.serverManaged && item.processingStatus === 'processing')
        )
      if (!hasActiveUpload || refreshing) return

      refreshing = true
      try {
        const bases = await window.api.knowledgeBase.getAll()
        if (Array.isArray(bases)) dispatch(updateBases(bases))
      } catch (e) {
        console.warn('[WebInit] Failed to refresh background uploads:', e)
      } finally {
        refreshing = false
      }
    }

    const timer = window.setInterval(refreshServerManagedUploads, 3000)
    return () => window.clearInterval(timer)
  }, [dispatch, isAuthenticated])

  // Admin: auto-sync provider config to server when providers change
  const isInitialMount = useRef(true)
  useEffect(() => {
    const isRealElectron = typeof window.electron?.process?.platform === 'string'
    if (isRealElectron || !isAdmin) return

    // Skip the first render (initial load / sync from server)
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    const syncProvidersToServer = debounce(async () => {
      try {
        const currentConfig = (await window.api.adminConfig.get()) || {}
        const enabledProviders = providers
          .filter((p) => p.enabled && p.apiKey && p.id !== 'cherryai')
          .map((p) => ({
            id: p.id,
            type: p.type,
            name: p.name,
            provider: p.id,
            apiKey: p.apiKey,
            apiHost: p.apiHost,
            models: p.models.map((m) => ({ id: m.id, name: m.name, provider: m.provider, group: m.group }))
          }))

        const resolvedDefaultModel = resolveManagedModel(defaultModel, enabledProviders, isManagedTextModel)
        const resolvedQuickModel = resolveManagedModel(quickModel, enabledProviders, isManagedTextModel, resolvedDefaultModel)
        const resolvedTranslateModel = resolveManagedModel(
          translateModel,
          enabledProviders,
          isManagedTextModel,
          resolvedDefaultModel
        )
        const resolvedEmbeddingModel = resolveManagedModel(defaultEmbeddingModel, enabledProviders, isEmbeddingModel)
        const resolvedRerankModel = resolveManagedModel(defaultRerankModel, enabledProviders, isRerankModel)

        await window.api.adminConfig.save({
          ...currentConfig,
          providers: enabledProviders,
          defaultModel: resolvedDefaultModel,
          quickModel: resolvedQuickModel,
          translateModel: resolvedTranslateModel,
          embeddingModel: resolvedEmbeddingModel,
          rerankModel: resolvedRerankModel
        })
        logger.info('[WebInit] Admin config synced to server')
      } catch (e) {
        console.error('[WebInit] Failed to sync admin config to server:', e)
      }
    }, 2000)

    syncProvidersToServer()
    return () => syncProvidersToServer.cancel()
  }, [isAdmin, providers, defaultModel, quickModel, translateModel, defaultEmbeddingModel, defaultRerankModel])


  useEffect(() => {
    KnowledgeQueue.checkAllBases()
  }, [])

  useEffect(() => {
    let customCssElement = document.getElementById('user-defined-custom-css') as HTMLStyleElement
    if (customCssElement) {
      customCssElement.remove()
    }

    if (customCss) {
      customCssElement = document.createElement('style')
      customCssElement.id = 'user-defined-custom-css'
      customCssElement.textContent = customCss
      document.head.appendChild(customCssElement)
    }
  }, [customCss])

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return

    const requestListener = async (_event: Electron.IpcRendererEvent, payload: ToolPermissionRequestPayload) => {
      logger.debug('Renderer received tool permission request', {
        requestId: payload.requestId,
        toolName: payload.toolName,
        expiresAt: payload.expiresAt,
        suggestionCount: payload.suggestions.length,
        autoApprove: payload.autoApprove
      })

      if (payload.autoApprove) {
        logger.debug('Auto-approving tool permission request', {
          requestId: payload.requestId,
          toolName: payload.toolName
        })

        try {
          const response = await window.api.agentTools.respondToPermission({
            requestId: payload.requestId,
            behavior: 'allow',
            updatedInput: payload.input,
            updatedPermissions: payload.suggestions
          })

          if (!response?.success) {
            throw new Error('Auto-approval response rejected by main process')
          }

          logger.debug('Auto-approval acknowledged by main process', {
            requestId: payload.requestId,
            toolName: payload.toolName
          })
        } catch (error) {
          logger.error('Failed to send auto-approval response', error as Error)
          // Fall through to add to store for manual approval
          dispatch(toolPermissionsActions.requestReceived(payload))
        }
        return
      }

      dispatch(toolPermissionsActions.requestReceived(payload))
    }

    const resultListener = (_event: Electron.IpcRendererEvent, payload: ToolPermissionResultPayload) => {
      logger.debug('Renderer received tool permission result', {
        requestId: payload.requestId,
        behavior: payload.behavior,
        reason: payload.reason
      })
      dispatch(toolPermissionsActions.requestResolved(payload))

      if (payload.behavior === 'deny') {
        const message =
          payload.reason === 'timeout'
            ? (payload.message ?? t('agent.toolPermission.toast.timeout'))
            : (payload.message ?? t('agent.toolPermission.toast.denied'))

        if (payload.reason === 'no-window') {
          logger.debug('Displaying deny toast for tool permission', {
            requestId: payload.requestId,
            behavior: payload.behavior,
            reason: payload.reason
          })
          window.toast?.error?.(message)
        } else if (payload.reason === 'timeout') {
          logger.debug('Displaying timeout toast for tool permission', {
            requestId: payload.requestId
          })
          window.toast?.warning?.(message)
        } else {
          logger.debug('Displaying info toast for tool permission deny', {
            requestId: payload.requestId,
            reason: payload.reason
          })
          window.toast?.info?.(message)
        }
      }
    }

    const removeListeners = [
      window.electron.ipcRenderer.on(IpcChannel.AgentToolPermission_Request, requestListener),
      window.electron.ipcRenderer.on(IpcChannel.AgentToolPermission_Result, resultListener)
    ]

    return () => removeListeners.forEach((removeListener) => removeListener())
  }, [dispatch, t])

  useEffect(() => {
    // TODO: init data collection
  }, [enableDataCollection])

  // Update memory service configuration when it changes
  useEffect(() => {
    const memoryService = MemoryService.getInstance()
    memoryService.updateConfig().catch((error) => logger.error('Failed to update memory config:', error))
  }, [memoryConfig])

  useEffect(() => {
    checkDataLimit()
  }, [])
}
