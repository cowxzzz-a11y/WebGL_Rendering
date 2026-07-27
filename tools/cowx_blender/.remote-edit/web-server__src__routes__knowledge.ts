import express from 'express'
import multer from 'multer'
import { knowledgeBaseStore } from '../store/KnowledgeBaseStore'
import knowledgeService, { type KnowledgeProcessingProgress, type KnowledgeProcessingStage } from '../services/KnowledgeService'
import { fileStorage } from '../services/FileStorage'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { getProviderById } from '../utils/api-utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { knowledgeGraphJobService } from '../services/KnowledgeGraphJobService'

const router = express.Router()
const MAX_KNOWLEDGE_FILE_SIZE_BYTES = 80 * 1024 * 1024
const MAX_KNOWLEDGE_FILE_SIZE_LABEL = '80MB'
type UploadProcessingStatus = Omit<KnowledgeProcessingProgress, 'stage'> & {
  stage: KnowledgeProcessingStage | 'completed' | 'failed'
  message?: string
  updatedAt: number
}
const uploadProcessingStatuses = new Map<string, UploadProcessingStatus>()
const uploadStatusKey = (userId: string, baseId: string, taskId: string) => `${userId}:${baseId}:${taskId}`
const activeUploadControllers = new Map<string, AbortController>()
const activeUploadKey = (baseId: string, taskId: string) => `${baseId}:${taskId}`
const uploadStatusCleanup = setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [key, status] of uploadProcessingStatuses) {
    if (status.updatedAt < cutoff) uploadProcessingStatuses.delete(key)
  }
}, 60 * 60 * 1000)
uploadStatusCleanup.unref()
const upload = multer({
  dest: path.join(process.cwd(), 'storage', 'uploads'),
  limits: { fileSize: MAX_KNOWLEDGE_FILE_SIZE_BYTES }
})
const uploadKnowledgeFile = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File is too large. Knowledge base uploads are limited to ${MAX_KNOWLEDGE_FILE_SIZE_LABEL}.` })
    }
    if (error) return next(error)
    return next()
  })
}

// All knowledge base routes require authentication
router.use(requireAuth as any)

router.get('/:id/upload-status/:taskId', (req: AuthenticatedRequest, res) => {
  const { id, taskId } = req.params as { id: string; taskId: string }
  const key = uploadStatusKey(req.user!.id, id, taskId)
  const status = uploadProcessingStatuses.get(key)
  if (!status) {
    const item = (knowledgeBaseStore.get(id) as any)?.items?.find(
      (candidate: any) => candidate?.id === taskId && candidate?.serverManaged
    )
    if (!item?.processingStage) return res.status(404).json({ error: 'Upload task status not found' })
    return res.json({
      stage: item.processingStage,
      page: item.processingPage,
      total: item.processingTotal,
      failedPages: item.processingFailedPages,
      message: item.processingError || item.processingMessage,
      updatedAt: item.updated_at
    })
  }
  res.json(status)
})

function normalizeProviderId(base: any): string | undefined {
  if (typeof base?.embedApiClient?.provider === 'string') return base.embedApiClient.provider
  if (typeof base?.model?.provider === 'string') return base.model.provider
  if (base?.model?.provider && typeof base.model.provider === 'object' && typeof base.model.provider.id === 'string')
    return base.model.provider.id
  const p = base?.embeddingModel?.provider
  if (typeof p === 'string') return p
  if (p && typeof p === 'object' && typeof p.id === 'string') return p.id
  return undefined
}

function normalizeEmbeddingModelId(base: any, providerId?: string): string | undefined {
  const direct =
    (typeof base?.embedApiClient?.model === 'string' && base.embedApiClient.model) ||
    (typeof base?.model?.id === 'string' && base.model.id) ||
    (typeof base?.embeddingModel?.id === 'string' && base.embeddingModel.id) ||
    undefined

  if (!direct) return undefined

  if (providerId && direct.startsWith(providerId + '-')) {
    return direct.slice(providerId.length + 1)
  }

  if (direct.includes(':')) {
    const parts = direct.split(':')
    if (parts[0]) return parts.slice(1).join(':')
  }

  return direct
}

function normalizeRerankProviderId(base: any): string | undefined {
  if (typeof base?.rerankApiClient?.provider === 'string') return base.rerankApiClient.provider
  if (typeof base?.rerankModel?.provider === 'string') return base.rerankModel.provider
  if (
    base?.rerankModel?.provider &&
    typeof base.rerankModel.provider === 'object' &&
    typeof base.rerankModel.provider.id === 'string'
  )
    return base.rerankModel.provider.id
  return undefined
}

function normalizeRerankModelId(base: any, providerId?: string): string | undefined {
  const direct =
    (typeof base?.rerankApiClient?.model === 'string' && base.rerankApiClient.model) ||
    (typeof base?.rerankModel?.id === 'string' && base.rerankModel.id) ||
    undefined

  if (!direct) return undefined

  if (providerId && direct.startsWith(providerId + '-')) {
    return direct.slice(providerId.length + 1)
  }

  if (direct.includes(':')) {
    const parts = direct.split(':')
    if (parts[0]) return parts.slice(1).join(':')
  }

  return direct
}

function ensureApiVersion(baseURL: string): string {
  const VERSION_REGEX = /\/v\d+(?:alpha|beta)?(?=\/|$)/i
  if (baseURL && !VERSION_REGEX.test(baseURL) && !baseURL.includes('/openai')) {
    return baseURL.replace(/\/$/, '') + '/v1'
  }
  return baseURL
}

function usableClientKey(key: unknown): string {
  if (typeof key !== 'string') return ''
  const trimmed = key.trim()
  return trimmed && trimmed !== 'secret' ? trimmed : ''
}

async function getKnowledgeBaseParams(base: any) {
  const providerId = normalizeProviderId(base) || 'openai'
  const provider = await getProviderById(providerId)

  // Use nullish-aware checks: empty string '' is falsy but should NOT fall through
  // to defaults if the client explicitly sent it. Use explicit non-empty checks.
  const clientBaseURL = base?.embedApiClient?.baseURL
  const clientApiKey = base?.embedApiClient?.apiKey

  let baseURL =
    (typeof clientBaseURL === 'string' && clientBaseURL.trim()) ||
    provider?.apiHost ||
    process.env.OPENAI_API_HOST ||
    'https://api.openai.com/v1'

  // Ensure baseURL has API version path (e.g. /v1) for OpenAI-compatible providers.
  // Many providers store apiHost without /v1 (e.g. 'https://api.siliconflow.cn'),
  // but the OpenAI SDK needs the full path to construct correct API endpoints.
  baseURL = ensureApiVersion(baseURL)

  // In web mode the browser may send stale, masked, or placeholder keys in baseParams.
  // Keep real credentials authoritative on the server.
  const apiKey = provider?.apiKey || usableClientKey(clientApiKey) || process.env.OPENAI_API_KEY || ''
  const model = normalizeEmbeddingModelId(base, providerId) || 'text-embedding-3-small'

  const rerankProviderId = normalizeRerankProviderId(base)
  const rerankProvider = rerankProviderId ? await getProviderById(rerankProviderId) : undefined
  const rerankModel = normalizeRerankModelId(base, rerankProviderId)
  const rerankApiClient =
    rerankProviderId || rerankModel
      ? {
          model: rerankModel || '',
          provider: rerankProviderId || '',
          apiKey:
            rerankProvider?.apiKey ||
            usableClientKey(base?.rerankApiClient?.apiKey) ||
            (rerankProviderId === providerId ? apiKey : '') ||
            '',
          baseURL: ensureApiVersion(
            (typeof base?.rerankApiClient?.baseURL === 'string' && base.rerankApiClient.baseURL.trim()) ||
              rerankProvider?.apiHost ||
              ''
          )
        }
      : undefined

  return {
    id: base.id,
    embedApiClient: {
      model,
      provider: providerId,
      apiKey,
      baseURL
    },
    dimensions: base.dimensions,
    chunkSize: base.chunkSize,
    chunkOverlap: base.chunkOverlap,
    documentCount: Number(base.documentCount) > 0 ? Number(base.documentCount) : undefined,
    model: base.model,
    rerankModel: base.rerankModel,
    rerankApiClient,
    preprocessProvider: base.preprocessProvider
  }
}

// List all knowledge bases
router.get('/', (req: AuthenticatedRequest, res) => {
  const bases = knowledgeBaseStore.getAll()
  res.json(bases)
})

// Create knowledge base
router.post('/', async (req: AuthenticatedRequest, res) => {
  const base = req.body
  const user = req.user!
  if (!base.id) base.id = uuidv4()

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to create knowledge bases' })
  }

  try {
    const baseParams = await getKnowledgeBaseParams(base)
    if (!baseParams.embedApiClient?.apiKey || baseParams.embedApiClient.apiKey === 'secret') {
      knowledgeBaseStore.add({ ...(base as any), id: base.id, items: base.items || [] } as any)
      return res.status(200).json({
        ...base,
        warning: 'Missing embedding apiKey. Knowledge base created without RAG initialization.'
      })
    }
    await knowledgeService.create(null, baseParams)
    knowledgeBaseStore.add({ ...(base as any), id: base.id, items: base.items || [] } as any)
    res.json(base)
  } catch (error) {
    const message = (error as Error).message || 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// Update knowledge base metadata
router.put('/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const updates = req.body
  const user = req.user!

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to modify this knowledge base' })
  }

  const existing = knowledgeBaseStore.get(id)
  if (!existing) return res.status(404).json({ error: 'Knowledge base not found' })

  try {
    const merged = { ...existing, ...updates, id, updated_at: Date.now() } as any
    // Preserve items from store (client may send stale/empty items)
    if (!Array.isArray(updates.items)) {
      merged.items = (existing as any).items || []
    }
    knowledgeBaseStore.update(merged)
    res.json(merged)
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

// Delete knowledge base
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const user = req.user!

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to delete this knowledge base' })
  }

  try {
    knowledgeGraphJobService.stop(id)

    // Delete physical files of all file items in this KB
    const existing = knowledgeBaseStore.get(id)
    if (existing && Array.isArray((existing as any).items)) {
      for (const item of (existing as any).items) {
        if (item.type === 'file' && item.content?.path) {
          const filePath = item.content.path
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath)
              console.log(`[KnowledgeDelete] Deleted physical file: ${filePath}`)
            } catch (err) {
              console.error(`[KnowledgeDelete] Failed to delete physical file: ${filePath}`, err)
            }
          }
        }
      }
    }

    // Best-effort vector DB cleanup; ignore errors (e.g. missing API key)
    try {
      await knowledgeService.delete(null, id)
    } catch (ragError) {
      console.warn(`[KnowledgeDelete] Vector DB cleanup failed (non-fatal) for KB ${id}:`, (ragError as Error).message)
    }
    knowledgeBaseStore.delete(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

// Upload file to knowledge base
router.post('/:id/upload', uploadKnowledgeFile, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const user = req.user!
  const file = req.file

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to upload to this knowledge base' })
  }

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  if (file.size > MAX_KNOWLEDGE_FILE_SIZE_BYTES) {
    await fs.promises.unlink(file.path).catch(() => undefined)
    return res.status(413).json({ error: `File is too large. Knowledge base uploads are limited to ${MAX_KNOWLEDGE_FILE_SIZE_LABEL}.` })
  }

  // Fix multer Latin-1 encoding issue: browsers send filenames as UTF-8 bytes
  // but multer's Content-Disposition parser interprets them as Latin-1, causing mojibake.
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')

  const bodyBase = (() => {
    const raw = (req as any).body?.base
    if (!raw) return undefined
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  })()

  const base = knowledgeBaseStore.get(id) || bodyBase
  if (!base) return res.status(404).json({ error: 'Knowledge base not found' })

  const clientTaskId =
    typeof (req as any).body?.clientTaskId === 'string' ? (req as any).body.clientTaskId.slice(0, 128) : ''
  const statusKey = clientTaskId ? uploadStatusKey(user.id, id, clientTaskId) : ''
  let persistedItem: any = null
  let uploadController: AbortController | null = null
  let controllerKey = ''
  const persistBase = () => {
    if (knowledgeBaseStore.get(id)) {
      knowledgeBaseStore.update(base)
    } else {
      knowledgeBaseStore.add({ ...(base as any), id } as any)
    }
  }
  const setUploadStatus = (status: Omit<UploadProcessingStatus, 'updatedAt'>) => {
    if (statusKey) {
      const previous = uploadProcessingStatuses.get(statusKey)
      uploadProcessingStatuses.set(statusKey, { ...previous, ...status, updatedAt: Date.now() })
    }
    if (persistedItem) {
      const itemStillStored = Array.isArray((base as any).items)
        && (base as any).items.some((candidate: any) => candidate?.id === persistedItem.id)
      if (!itemStillStored) return
      const page = Number.isFinite(status.page) ? Number(status.page) : persistedItem.processingPage
      const total = Number.isFinite(status.total) ? Number(status.total) : persistedItem.processingTotal
      let progress = 2
      let message = '正在解析文档…'
      if (status.stage === 'text-extraction') {
        progress = 5
        message = '常规解析未提取到内容，正在检测 PDF 文字层…'
      } else if (status.stage === 'ocr') {
        progress = page && total ? 10 + Math.round((Math.min(page, total) / total) * 80) : 10
        const pageText = page && total ? `（第 ${page}/${total} 页）` : ''
        const failedText = status.failedPages?.length ? `，已跳过 ${status.failedPages.length} 个异常页` : ''
        message = `文档为扫描件，正在 OCR${pageText}${failedText}。文件较大，可关闭页面，服务器会继续处理。`
      } else if (status.stage === 'embedding') {
        progress = 95
        message = '文字提取完成，正在写入知识库…'
      } else if (status.stage === 'completed') {
        progress = 100
        message = '处理完成'
      } else if (status.stage === 'failed') {
        message = status.message || '处理失败'
      }

      Object.assign(persistedItem, {
        processingStatus:
          status.stage === 'completed' ? 'completed' : status.stage === 'failed' ? 'failed' : 'processing',
        processingProgress: progress,
        processingMessage: message,
        processingError: status.stage === 'failed' ? status.message || '处理失败' : undefined,
        processingStage: status.stage,
        processingPage: page,
        processingTotal: total,
        processingFailedPages: status.failedPages || persistedItem.processingFailedPages,
        serverManaged: true,
        updated_at: Date.now()
      })
      persistBase()
    }
  }
  setUploadStatus({ stage: 'parsing' })

  try {
    // Move file to storage
    const storageDir = fileStorage.getStorageDir()
    const ext = path.extname(originalName)
    const fileId = uuidv4()
    const destPath = path.join(storageDir, fileId + ext)

    await fs.promises.rename(file.path, destPath)

    const fileMetadata = {
      id: fileId,
      name: originalName,
      origin_name: originalName,
      path: destPath,
      size: file.size,
      ext: ext,
      type: 'file', // TODO: determine type
      created_at: new Date().toISOString()
    }

    const item = {
      id: clientTaskId || uuidv4(),
      type: 'file',
      content: fileMetadata,
      created_at: Date.now(),
      updated_at: Date.now(),
      uniqueId: fileId,
      uniqueIds: [fileId],
      processingStatus: 'processing',
      processingProgress: 2,
      processingMessage: '正在解析文档…',
      processingStage: 'parsing',
      serverManaged: true
    }

    // Persist the record before parsing/OCR starts. The task is owned by the
    // server from this point and remains visible after the browser disconnects.
    if (!Array.isArray((base as any).items)) (base as any).items = []
    const existingItemIndex = (base as any).items.findIndex((candidate: any) => candidate?.id === item.id)
    if (existingItemIndex >= 0) {
      ;(base as any).items[existingItemIndex] = item
    } else {
      ;(base as any).items.push(item)
    }
    persistedItem = item
    persistBase()
    setUploadStatus({ stage: 'parsing' })
    uploadController = new AbortController()
    controllerKey = activeUploadKey(id, item.id)
    activeUploadControllers.set(controllerKey, uploadController)

    // Add to RAG
    const baseParams = await getKnowledgeBaseParams(bodyBase || base)
    console.log(
      '[KnowledgeUpload] baseParams:',
      JSON.stringify({
        id: baseParams.id,
        model: baseParams.embedApiClient?.model,
        provider: baseParams.embedApiClient?.provider,
        baseURL: baseParams.embedApiClient?.baseURL,
        hasApiKey: !!baseParams.embedApiClient?.apiKey && baseParams.embedApiClient.apiKey !== 'secret',
        dimensions: baseParams.dimensions
      })
    )
    if (!baseParams.embedApiClient?.apiKey || baseParams.embedApiClient.apiKey === 'secret') {
      setUploadStatus({ stage: 'failed', message: 'Embedding apiKey is required for uploading documents' })
      return res.status(400).json({ error: 'Embedding apiKey is required for uploading documents' })
    }
    const loaderReturn = await knowledgeService.add(null, {
      base: baseParams,
      item: item as any,
      onProgress: setUploadStatus,
      signal: uploadController.signal
    })

    if (uploadController.signal.aborted) {
      return res.status(499).json({ error: 'Upload cancelled' })
    }

    // Check if embedding actually succeeded
    if (loaderReturn && loaderReturn.status === 'failed') {
      console.error(
        '[KnowledgeUpload] Embedding failed:',
        loaderReturn.message,
        'source:',
        (loaderReturn as any).messageSource
      )
      setUploadStatus({ stage: 'failed', message: loaderReturn.message || 'Unknown embedding error' })
      return res.status(500).json({
        error: `Embedding failed: ${loaderReturn.message || 'Unknown embedding error'}`,
        messageSource: (loaderReturn as any).messageSource,
        item
      })
    }
    if (loaderReturn) {
      console.log(
        '[KnowledgeUpload] Embedding result:',
        JSON.stringify({
          entriesAdded: loaderReturn.entriesAdded,
          uniqueId: loaderReturn.uniqueId,
          loaderType: loaderReturn.loaderType,
          status: loaderReturn.status
        })
      )
      if (!loaderReturn.entriesAdded || loaderReturn.entriesAdded <= 0) {
        console.error(
          '[KnowledgeUpload] Embedding produced no entries:',
          JSON.stringify({
            file: originalName,
            ext,
            uniqueId: loaderReturn.uniqueId,
            loaderType: loaderReturn.loaderType
          })
        )
        setUploadStatus({ stage: 'failed', message: 'Embedding produced no searchable chunks' })
        return res.status(500).json({
          error: 'Embedding produced no searchable chunks. Please check the document parser and loader dependencies.',
          item,
          loaderReturn
        })
      }

      item.uniqueId = loaderReturn.uniqueId || fileId
      item.uniqueIds =
        Array.isArray(loaderReturn.uniqueIds) && loaderReturn.uniqueIds.length > 0
          ? loaderReturn.uniqueIds
          : [item.uniqueId]
    }

    const graphAutoStartAt = ext.toLowerCase() === '.docx' ? knowledgeGraphJobService.scheduleAutoStart(id) : null

    setUploadStatus({ stage: 'completed' })
    res.json({ ...item, loaderReturn, graphAutoStartAt })
  } catch (error) {
    const cancelled = uploadController?.signal.aborted
    if (!cancelled) setUploadStatus({ stage: 'failed', message: (error as Error).message })
    res.status(cancelled ? 499 : 500).json({ error: cancelled ? 'Upload cancelled' : (error as Error).message })
  } finally {
    if (controllerKey && activeUploadControllers.get(controllerKey) === uploadController) {
      activeUploadControllers.delete(controllerKey)
    }
  }
})

// Add non-file item (url, sitemap, note, directory) to knowledge base
router.post('/:id/items', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const { item, base: requestBase, userId = '' } = req.body || {}
  const user = req.user!

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to modify this knowledge base' })
  }

  if (!item?.type) {
    return res.status(400).json({ error: 'Knowledge item is required' })
  }

  const base = knowledgeBaseStore.get(id) || requestBase
  if (!base) return res.status(404).json({ error: 'Knowledge base not found' })

  try {
    const baseParams = await getKnowledgeBaseParams(requestBase || base)
    if (!baseParams.embedApiClient?.apiKey || baseParams.embedApiClient.apiKey === 'secret') {
      return res.status(400).json({ error: 'Embedding apiKey is required for adding knowledge items' })
    }

    const loaderReturn = await knowledgeService.add(null, {
      base: baseParams,
      item: item as any,
      userId
    })

    if (loaderReturn && loaderReturn.status === 'failed') {
      return res.status(500).json({
        error: `Embedding failed: ${loaderReturn.message || 'Unknown embedding error'}`,
        messageSource: (loaderReturn as any).messageSource,
        item
      })
    }

    if (!loaderReturn.entriesAdded || loaderReturn.entriesAdded <= 0) {
      return res.status(500).json({
        error: 'Embedding produced no searchable chunks. Please check the item content and loader dependencies.',
        item,
        loaderReturn
      })
    }

    const storedItem = {
      ...(item as any),
      uniqueId: loaderReturn.uniqueId || (item as any).uniqueId,
      uniqueIds:
        Array.isArray(loaderReturn.uniqueIds) && loaderReturn.uniqueIds.length > 0
          ? loaderReturn.uniqueIds
          : [loaderReturn.uniqueId || (item as any).uniqueId].filter(Boolean)
    }

    if (!Array.isArray((base as any).items)) (base as any).items = []
    const existingIndex = (base as any).items.findIndex((existing: any) => existing.id === storedItem.id)
    if (existingIndex >= 0) {
      ;(base as any).items[existingIndex] = storedItem
    } else {
      ;(base as any).items.push(storedItem)
    }
    if (knowledgeBaseStore.get(id)) {
      knowledgeBaseStore.update(base)
    } else {
      knowledgeBaseStore.add({ ...(base as any), id } as any)
    }

    res.json({ ...storedItem, loaderReturn })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to add knowledge item' })
  }
})

// Remove item from knowledge base (delete vectors + remove from store)
router.post('/:id/remove', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const { uniqueId, uniqueIds, base: requestBase } = req.body
  const user = req.user!

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to modify this knowledge base' })
  }

  if (!uniqueId && (!uniqueIds || !Array.isArray(uniqueIds) || uniqueIds.length === 0)) {
    return res.status(400).json({ error: 'uniqueId or uniqueIds is required' })
  }

  const base = knowledgeBaseStore.get(id) || requestBase
  if (!base) return res.status(404).json({ error: 'Knowledge base not found' })

  const idsToRemove = new Set(uniqueIds || [uniqueId])
  const activeItems = Array.isArray((base as any).items)
    ? (base as any).items.filter(
        (item: any) => idsToRemove.has(item.uniqueId) && item.serverManaged && item.processingStatus === 'processing'
      )
    : []
  for (const item of activeItems) {
    activeUploadControllers.get(activeUploadKey(id, item.id))?.abort(new Error('Cancelled by user'))
    uploadProcessingStatuses.delete(uploadStatusKey(user.id, id, item.id))
  }

  // Try to remove vectors from RAG, but don't fail if embedding API is unavailable.
  // This allows deleting items that were never successfully embedded (e.g. missing API key).
  if (activeItems.length === 0) {
    try {
      const baseParams = await getKnowledgeBaseParams(base || requestBase)
      await knowledgeService.remove(null, {
        uniqueId: uniqueId || '',
        uniqueIds: uniqueIds || [uniqueId],
        base: baseParams
      })
    } catch (ragError) {
      console.warn(`[KnowledgeRemove] Vector removal failed (non-fatal) for KB ${id}:`, (ragError as Error).message)
    }
  }

  // Always remove the item from the KB store, regardless of vector deletion result
  try {
    let shouldSyncGraph = false
    const storedBase = knowledgeBaseStore.get(id)
    if (storedBase && Array.isArray((storedBase as any).items)) {
      shouldSyncGraph = (storedBase as any).items.some((item: any) => {
        if (!idsToRemove.has(item.uniqueId)) return false
        const ext = String(item?.content?.ext || '').toLowerCase()
        return ext === '.docx'
      })
      // Delete physical files of the items being removed
      for (const item of (storedBase as any).items) {
        if (idsToRemove.has(item.uniqueId) && item.type === 'file' && item.content?.path) {
          const filePath = item.content.path
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath)
              console.log(`[KnowledgeRemove] Deleted physical file: ${filePath}`)
            } catch (err) {
              console.error(`[KnowledgeRemove] Failed to delete physical file: ${filePath}`, err)
            }
          }
        }
      }

      ;(storedBase as any).items = (storedBase as any).items.filter((item: any) => !idsToRemove.has(item.uniqueId))
      knowledgeBaseStore.update(storedBase)
    }

    if (shouldSyncGraph && knowledgeGraphJobService.getLatestRunInfo(id)) {
      await knowledgeGraphJobService.syncAfterDocumentRemoval(id)
    }

    res.json({ success: true })
  } catch (error) {
    console.error(`[KnowledgeRemove] Failed to update store for KB ${id}:`, (error as Error).message)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Knowledge graph generation status
router.get('/graph/types', (_req: AuthenticatedRequest, res) => {
  res.json({ items: knowledgeGraphJobService.listGraphTypes() })
})

router.get('/:id/graph/status', (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  if (!knowledgeBaseStore.canAccess(id)) {
    return res.status(404).json({ error: 'Knowledge base not found' })
  }

  res.json(knowledgeGraphJobService.getStatus(id))
})

// Start knowledge graph entity extraction through GeoKnowledge/GeoStructor.
router.post('/:id/graph/generate', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const { graphType = 'geostructor' } = req.body || {}
  const user = req.user!

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to generate knowledge graphs' })
  }

  try {
    const status = await knowledgeGraphJobService.start(id, String(graphType || 'geostructor'))
    res.json(status)
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ error: error?.message || 'Failed to start knowledge graph generation' })
  }
})

// Stop knowledge graph entity extraction.
router.post('/:id/graph/stop', (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const user = req.user!

  if (!knowledgeBaseStore.canModify(user.id, user.role, user.canEditKB)) {
    return res.status(403).json({ error: 'You do not have permission to stop knowledge graph generation' })
  }

  res.json(knowledgeGraphJobService.stop(id))
})

// Search
router.post('/:id/search', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const { query, base: requestBase } = req.body
  const user = req.user!

  if (!knowledgeBaseStore.canAccess(id)) {
    return res.status(404).json({ error: 'Knowledge base not found' })
  }

  const base = knowledgeBaseStore.get(id) || requestBase
  if (!base) {
    return res.status(404).json({ error: 'Knowledge base not found' })
  }

  try {
    const baseParams = await getKnowledgeBaseParams(base || requestBase)
    console.log(
      '[KnowledgeSearch] baseParams:',
      JSON.stringify({
        id: baseParams.id,
        model: baseParams.embedApiClient?.model,
        provider: baseParams.embedApiClient?.provider,
        baseURL: baseParams.embedApiClient?.baseURL,
        hasApiKey: !!baseParams.embedApiClient?.apiKey && baseParams.embedApiClient.apiKey !== 'secret',
        dimensions: baseParams.dimensions,
        documentCount: baseParams.documentCount
      })
    )
    if (!baseParams.embedApiClient?.apiKey || baseParams.embedApiClient.apiKey === 'secret') {
      return res.status(400).json({ error: 'Embedding apiKey is required for searching knowledge base' })
    }
    const results = await knowledgeService.search(null, {
      base: baseParams,
      search: query
    })

    // Enrich search results with file metadata from knowledge base items.
    // The embedding DB stores UUID-based file paths as metadata.source,
    // but the client needs original filenames for display.
    // Build a map from file UUID to its FileMetadata stored in the knowledge base.
    const fileIdToMetadataMap = new Map<string, any>()
    if (base.items && Array.isArray(base.items)) {
      for (const item of base.items) {
        if (item.type === 'file' && item.content && typeof item.content === 'object' && !Array.isArray(item.content)) {
          const content = item.content as Record<string, any>
          if (content.id) {
            fileIdToMetadataMap.set(content.id, content)
          }
        }
      }
    }

    const enrichedResults = results.map((result: any) => {
      const metadataSource = result.metadata?.source
      if (typeof metadataSource === 'string' && metadataSource) {
        const source = metadataSource.replace(/\\/g, '/')
        const lastSegment = source.split('/').pop() || ''
        const fileId = lastSegment.split('.')[0]
        const fileMetadata = fileIdToMetadataMap.get(fileId)
        if (fileMetadata) {
          result.file = fileMetadata
        }
      }
      return result
    })

    res.json(enrichedResults)
  } catch (error: any) {
    const errMsg = error?.message || 'Unknown error'
    const errDetail = error?.response?.data || error?.cause || ''
    console.error(`[KnowledgeSearch] Search failed for KB ${id}, query="${query}": ${errMsg}`, errDetail)
    console.error('[KnowledgeSearch] Full error:', error)
    res
      .status(500)
      .json({ error: errMsg, detail: typeof errDetail === 'object' ? JSON.stringify(errDetail) : String(errDetail) })
  }
})

// Rerank
router.post('/:id/rerank', async (req: AuthenticatedRequest, res) => {
  const { id } = req.params as { id: string }
  const { search, query, base: requestBase, results, searchResults: requestSearchResults } = req.body || {}
  const user = req.user!

  if (!knowledgeBaseStore.canAccess(id)) {
    return res.status(404).json({ error: 'Knowledge base not found' })
  }

  const base = knowledgeBaseStore.get(id) || requestBase
  if (!base) return res.status(404).json({ error: 'Knowledge base not found' })

  const searchResults = Array.isArray(results) ? results : Array.isArray(requestSearchResults) ? requestSearchResults : []
  const rerankSearch =
    (typeof search === 'string' && search.trim()) || (typeof query === 'string' && query.trim()) || ''

  if (!rerankSearch) {
    return res.status(400).json({ error: 'Search query is required for reranking' })
  }

  try {
    const baseParams = await getKnowledgeBaseParams(base || requestBase)

    if (!baseParams.embedApiClient?.apiKey || baseParams.embedApiClient.apiKey === 'secret') {
      return res.status(400).json({ error: 'Embedding apiKey is required for reranking' })
    }
    if (!baseParams.rerankApiClient) {
      return res.status(400).json({ error: 'Rerank model is required' })
    }

    const reranked = await knowledgeService.rerank(null, {
      search: rerankSearch,
      base: baseParams,
      results: searchResults
    })
    res.json(reranked)
  } catch (error) {
    console.error(`[KnowledgeRerank] Rerank failed for KB ${id}:`, error)
    if (searchResults.length > 0) {
      return res.json(searchResults)
    }
    res.status(500).json({ error: (error as Error).message })
  }
})

// Test embedding configuration (diagnostic endpoint)
router.post('/test-embedding', async (req: AuthenticatedRequest, res) => {
  const { base: requestBase } = req.body
  if (!requestBase?.embedApiClient) {
    return res.status(400).json({ error: 'embedApiClient is required' })
  }
  try {
    const baseParams = await getKnowledgeBaseParams(requestBase)
    console.log(
      '[KnowledgeTest] Testing embedding with:',
      JSON.stringify({
        model: baseParams.embedApiClient?.model,
        provider: baseParams.embedApiClient?.provider,
        baseURL: baseParams.embedApiClient?.baseURL,
        hasApiKey: !!baseParams.embedApiClient?.apiKey && baseParams.embedApiClient.apiKey !== 'secret',
        dimensions: baseParams.dimensions
      })
    )

    if (!baseParams.embedApiClient?.apiKey || baseParams.embedApiClient.apiKey === 'secret') {
      return res.status(400).json({ error: 'Embedding apiKey is required' })
    }

    const ragApplication = await knowledgeService.create(null, baseParams)
    // Try a test embedding
    const testResult = await knowledgeService.search(null, {
      base: baseParams,
      search: 'test'
    })
    res.json({ success: true, resultCount: testResult.length, message: 'Embedding API is working correctly' })
  } catch (error: any) {
    console.error('[KnowledgeTest] Embedding test failed:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
      detail: error?.response?.data || error?.cause || ''
    })
  }
})

export default router
