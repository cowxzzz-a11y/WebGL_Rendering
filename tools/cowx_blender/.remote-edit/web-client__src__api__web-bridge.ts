import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import store from '@renderer/store'
import { updateItemProcessingStatus } from '@renderer/store/knowledge'
import { performLogout } from '@renderer/utils/logout'

// Mock types needed
type SpanContext = any

// Dynamically resolve API base from current browser origin
// In dev mode (Vite proxy), use relative path; in production, use same origin
const API_BASE = '/v1'

// Add auth token to all axios requests
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses: clear auth and redirect to login
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const hasToken = !!localStorage.getItem('auth_token')
      if (hasToken && !window.location.hash?.includes('/login')) {
        performLogout()
      }
    }
    return Promise.reject(error)
  }
)

// Global storage for pending files (File objects)
// @ts-ignore
window.__pendingFiles = window.__pendingFiles || new Map<string, File>()

const getPendingFile = (path: string): File | undefined => {
  if (path.startsWith('pending://')) {
    const rest = path.replace('pending://', '')
    const id = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest
    // @ts-ignore
    return window.__pendingFiles.get(id)
  }
  return undefined
}

const createPendingPath = (id: string, filename: string) => {
  const safeName = filename?.replaceAll('\\', '/').split('/').pop() || 'file'
  return `pending://${id}/${safeName}`
}

const createFileMetadata = (file: File) => {
  const id = uuidv4()
  // @ts-ignore
  window.__pendingFiles.set(id, file)
  const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
  return {
    id,
    name: file.name,
    origin_name: file.name,
    path: createPendingPath(id, file.name),
    size: file.size,
    ext: ext.toLowerCase(),
    count: 1,
    type: 'file',
    created_at: new Date().toISOString()
  }
}

type UploadProcessingStatus = {
  stage: 'parsing' | 'text-extraction' | 'ocr' | 'embedding' | 'completed' | 'failed'
  page?: number
  total?: number
  failedPages?: number[]
  message?: string
}

const getUploadStatusDisplay = (status: UploadProcessingStatus): { message: string; progress: number } | null => {
  switch (status.stage) {
    case 'parsing':
      return { message: '正在解析文档…', progress: 2 }
    case 'text-extraction':
      return { message: '常规解析未提取到内容，正在检测 PDF 文字层…', progress: 5 }
    case 'ocr': {
      const hasPageProgress = Number.isFinite(status.page) && Number.isFinite(status.total) && status.total! > 0
      const progress = hasPageProgress ? 10 + Math.round((Math.min(status.page!, status.total!) / status.total!) * 80) : 10
      const pageText = hasPageProgress ? `（第 ${status.page}/${status.total} 页）` : ''
      const failedText = status.failedPages?.length ? `，已跳过 ${status.failedPages.length} 个异常页` : ''
      return {
        message: `文档为扫描件，正在 OCR${pageText}${failedText}。文件较大，请耐心等待，请勿关闭页面。`,
        progress
      }
    }
    case 'embedding':
      return { message: '文字提取完成，正在写入知识库…', progress: 95 }
    default:
      return null
  }
}

const api = {
  // Knowledge Base
  knowledgeBase: {
    getAll: async () => {
      const res = await axios.get(`${API_BASE}/knowledge-bases`)
      return res.data
    },
    create: async (base: any) => {
      const res = await axios.post(`${API_BASE}/knowledge-bases`, base)
      return res.data
    },
    reset: async () => {},
    delete: async (id: string) => {
      await axios.delete(`${API_BASE}/knowledge-bases/${id}`)
    },
    update: async (base: any) => {
      const res = await axios.put(`${API_BASE}/knowledge-bases/${base.id}`, base)
      return res.data
    },
    add: async ({ base, item, userId }: any) => {
      const normalizeAddResult = (data: any) => ({
        ...(data?.loaderReturn || data || {}),
        uniqueId: data?.uniqueId || data?.loaderReturn?.uniqueId,
        uniqueIds: data?.uniqueIds || data?.loaderReturn?.uniqueIds,
        content: data?.content,
        item: data
      })

      try {
        console.log('[WebBridge] knowledgeBase.add called, item type:', item?.type)
        if (item?.type === 'file') {
          const file = getPendingFile(item.content?.path || '')
          if (!file) {
            console.error('[WebBridge] No pending file found for path:', item.content?.path)
            return null
          }
          console.log('[WebBridge] Found pending file:', file.name, 'size:', file.size)
          const formData = new FormData()
          formData.append('file', file)
          formData.append('base', JSON.stringify(base))
          formData.append('clientTaskId', item.id)
          if (userId) formData.append('userId', userId)
          console.log('[WebBridge] Uploading to server:', `${API_BASE}/knowledge-bases/${base.id}/upload`)
          const pollUploadStatus = async () => {
            try {
              const statusResponse = await axios.get<UploadProcessingStatus>(
                `${API_BASE}/knowledge-bases/${base.id}/upload-status/${encodeURIComponent(item.id)}`
              )
              const display = getUploadStatusDisplay(statusResponse.data)
              if (display) {
                store.dispatch(
                  updateItemProcessingStatus({
                    baseId: base.id,
                    itemId: item.id,
                    status: 'processing',
                    progress: display.progress,
                    message: display.message,
                    retryCount: item.retryCount,
                    serverManaged: true
                  })
                )
              }
            } catch (error: any) {
              if (error?.response?.status !== 404) {
                console.warn('[WebBridge] Failed to poll upload status:', error?.message)
              }
            }
          }
          const statusPollTimer = window.setInterval(pollUploadStatus, 1500)
          const res = await (async () => {
            try {
              return await axios.post(`${API_BASE}/knowledge-bases/${base.id}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              })
            } finally {
              window.clearInterval(statusPollTimer)
            }
          })()
          console.log('[WebBridge] Upload success:', res.data)
          if (res.data?.loaderReturn?.status === 'failed') {
            console.error('[WebBridge] Embedding failed for uploaded file:', res.data.loaderReturn.message)
          }
          return normalizeAddResult(res.data)
        }

        const res = await axios.post(`${API_BASE}/knowledge-bases/${base.id}/items`, { base, item, userId })
        console.log('[WebBridge] Knowledge item add success:', res.data)
        return normalizeAddResult(res.data)
      } catch (error: any) {
        const serverError = error?.response?.data?.error || error?.response?.data?.detail || error?.message
        console.error('[WebBridge] Failed to add knowledge base item:', error?.response?.data || error.message)
        throw new Error(serverError || '知识库上传失败')
      }
    },
    remove: async ({ uniqueId, uniqueIds, base }: any) => {
      try {
        const res = await axios.post(`${API_BASE}/knowledge-bases/${base.id}/remove`, {
          uniqueId,
          uniqueIds,
          base
        })
        return res.data
      } catch (error: any) {
        console.error('[WebBridge] Failed to remove KB item:', error?.response?.data || error.message)
        throw error
      }
    },
    search: async ({ search, base }: any) => {
      try {
        const res = await axios.post(`${API_BASE}/knowledge-bases/${base.id}/search`, { query: search, base })
        return res.data
      } catch (error: any) {
        const serverError = error?.response?.data?.error || error?.response?.data?.detail || ''
        console.error('[WebBridge] Knowledge search failed:', serverError || error.message, error?.response?.data)
        throw error
      }
    },
    rerank: async ({ search, base, results }: any) => {
      const res = await axios.post(`${API_BASE}/knowledge-bases/${base.id}/rerank`, { search, base, results })
      return res.data
    },
    graphStatus: async (baseId: string) => {
      const res = await axios.get(`${API_BASE}/knowledge-bases/${baseId}/graph/status`)
      return res.data
    },
    graphTypes: async () => {
      const res = await axios.get(`${API_BASE}/knowledge-bases/graph/types`)
      return res.data
    },
    generateGraph: async (baseId: string, graphType = 'geostructor') => {
      const res = await axios.post(`${API_BASE}/knowledge-bases/${baseId}/graph/generate`, { graphType })
      return res.data
    },
    stopGraph: async (baseId: string) => {
      const res = await axios.post(`${API_BASE}/knowledge-bases/${baseId}/graph/stop`)
      return res.data
    }
  },

  // File
  file: {
    select: async (options?: any) => {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.style.position = 'fixed'
        input.style.left = '-9999px'
        const props: string[] = options?.properties || []
        input.multiple = props.includes('multiSelections')
        const extensions: string[] | undefined = options?.filters?.[0]?.extensions
        if (extensions && extensions.length > 0 && !extensions.includes('*')) {
          input.accept = extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)).join(',')
        }
        document.body.appendChild(input)

        let settled = false
        const cleanup = () => {
          try {
            window.removeEventListener('focus', onFocus, true)
          } catch {}
          try {
            input.remove()
          } catch {}
        }
        const finish = (v: any) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(v)
        }

        // Use 'cancel' event (modern browsers) for reliable cancellation detection.
        // Fall back to 'focus' event with a generous delay to avoid race conditions
        // where focus fires before change on Windows.
        input.addEventListener('cancel', () => {
          console.log('[WebBridge] file.select: cancel event fired')
          finish(null)
        })

        const onFocus = () => {
          // Use 500ms delay to ensure 'change' event has time to fire first.
          // On Windows, 'focus' can fire in a separate event loop iteration before 'change'.
          setTimeout(() => {
            if (!settled) {
              console.log('[WebBridge] file.select: focus-based cancel detection triggered')
            }
            finish(null)
          }, 500)
        }

        input.onchange = (e: any) => {
          const list: File[] = Array.from(e.target.files || [])
          console.log('[WebBridge] file.select: onchange fired, files:', list.length)
          if (list.length === 0) return finish(null)
          const result = list.map(createFileMetadata)
          console.log('[WebBridge] file.select: returning', result.length, 'file(s)')
          finish(result)
        }

        window.addEventListener('focus', onFocus, true)
        input.click()
      })
    },
    read: async () => '',
    get: async () => null,
    isTextFile: async () => true,
    getPathForFile: (file: File) => {
      const meta = createFileMetadata(file)
      return meta.path
    },
    upload: async (file: any) => file,
    openFileWithRelativePath: async (file: any) => {
      const pending = typeof file?.path === 'string' ? getPendingFile(file.path) : undefined
      if (!pending) return
      const url = URL.createObjectURL(pending)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    },
    delete: async () => {},
    onFileChange: () => () => {}
  },

  // Config (LocalStorage)
  config: {
    get: async (key: string) => {
      const val = localStorage.getItem(`config:${key}`)
      try {
        return val ? JSON.parse(val) : undefined
      } catch {
        return val
      }
    },
    set: async (key: string, value: any) => {
      localStorage.setItem(`config:${key}`, JSON.stringify(value))
    }
  },

  // App / System (Mocks)
  getAppInfo: async () => ({ name: 'Cherry Studio Web', version: '1.0.0', notesPath: '' }),
  getDiskInfo: async () => ({ free: 1024 * 1024 * 1024 * 100, size: 1024 * 1024 * 1024 * 500 }),
  getDataPathFromArgs: async () => undefined,
  getIpCountry: async () => '',
  setProxy: async () => {},
  reload: () => window.location.reload(),
  quit: () => {},
  openWebsite: (url: string) => window.open(url, '_blank'),

  // Chat / API Server
  apiServer: {
    getStatus: async () => ({ running: true }),
    start: async () => ({ success: true }),
    restart: async () => ({ success: true }),
    stop: async () => ({ success: true }),
    onReady: (cb: any) => {
      cb()
      return () => {}
    }
  },

  // Theme
  setTheme: (theme: string) => document.documentElement.setAttribute('data-theme', theme),

  isFullScreen: async () => false,

  // Shell
  shell: {
    openExternal: (url: string) => window.open(url, '_blank')
  },

  // Proxies for undefined
  window: {
    getSize: async () => [window.innerWidth, window.innerHeight],
    setMinimumSize: async () => {},
    resetMinimumSize: async () => {}
  },

  windowControls: {
    isMaximized: async () => false,
    isMinimized: async () => false,
    minimize: async () => {},
    maximize: async () => {},
    unmaximize: async () => {},
    close: async () => {},
    onMaximizedChange: () => () => {},
    onMinimizedChange: () => () => {}
  },

  protocol: {
    onReceiveData: () => () => {}
  },

  storeSync: {
    onUpdate: () => () => {},
    subscribe: () => {},
    unsubscribe: () => {}
  },

  mcp: {
    onServerLog: () => () => {}
  },

  localTransfer: {
    onServicesUpdated: () => () => {},
    onClientEvent: () => () => {}
  },

  analytics: {
    trackTokenUsage: async () => {},
    trackEvent: async () => {}
  },

  cherryin: {
    hasToken: async () => false
  },

  cherryai: {
    generateSignature: async () => ({})
  },

  // Trace (Mock)
  trace: {
    saveData: async () => {},
    getData: async () => [],
    openWindow: async () => {}
  },

  // Admin Config (fetch from server)
  adminConfig: {
    get: async () => {
      try {
        const res = await axios.get(`${API_BASE}/admin/config`)
        return res.data
      } catch {
        return null
      }
    },
    save: async (config: any) => {
      try {
        const res = await axios.put(`${API_BASE}/admin/config`, config)
        return res.data
      } catch {
        return null
      }
    }
  }
}

// Create a proxy to handle undefined methods gracefully
const handler = {
  get: (target: any, prop: string) => {
    if (prop in target) return target[prop]
    // Return a mock object/function that logs warning and returns promise (as most APIs are async)
    console.warn(`[WebBridge] Accessing unimplemented API: ${prop}`)
    return new Proxy(() => Promise.resolve(), {
      get: (subTarget, subProp) => {
        console.warn(`[WebBridge] Accessing unimplemented API: ${prop}.${String(subProp)}`)
        return () => Promise.resolve()
      }
    })
  }
}

export const webBridge = new Proxy(api, handler)
