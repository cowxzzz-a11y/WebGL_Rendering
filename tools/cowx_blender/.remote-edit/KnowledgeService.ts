
import * as fs from 'fs'
import path from 'path'

import type { RAGApplication } from '@cherrystudio/embedjs'
import { RAGApplicationBuilder, TextLoader } from '@cherrystudio/embedjs'
import { LibSqlDb } from '@cherrystudio/embedjs-libsql'
import { SitemapLoader } from '@cherrystudio/embedjs-loader-sitemap'
import { WebLoader } from '@cherrystudio/embedjs-loader-web'
import { loggerService } from '@logger'
import Embeddings from '@main/knowledge/embedjs/embeddings/Embeddings'
import { addFileLoader } from '@main/knowledge/embedjs/loader'
import { NoteLoader } from '@main/knowledge/embedjs/loader/noteLoader'
import PreprocessProvider from '@main/knowledge/preprocess/PreprocessProvider'
import Reranker from '@main/knowledge/reranker/Reranker'
import { fileStorage } from '@main/services/FileStorage'
import { windowService } from '@main/services/WindowService'
import { getDataPath } from '@main/utils'
import { getAllFiles, sanitizeFilename } from '@main/utils/file'
import { TraceMethod } from '@mcp-trace/trace-core'
import { MB } from '@shared/config/constant'
import type { LoaderReturn } from '@shared/config/types'
import { IpcChannel } from '@shared/IpcChannel'
import type { FileMetadata, KnowledgeBaseParams, KnowledgeItem, KnowledgeSearchResult } from '@types'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { v4 as uuidv4 } from 'uuid'

const logger = loggerService.withContext('MainKnowledgeService')

const DEEPSEEK_OCR2_DEFAULT_BASE_URL = 'http://127.0.0.1:30004'
const DEEPSEEK_OCR2_DEFAULT_TIMEOUT_MS = 12 * 60 * 60 * 1000
const PDF_FALLBACK_MIN_TEXT_CHARS = 32

type DeepSeekOcrPage = {
  clean_text?: unknown
  text?: unknown
  error?: unknown
  page?: unknown
  total?: unknown
  recoverable?: unknown
  heartbeat?: unknown
}

type DeepSeekOcrResult = {
  text: string
  pageCount: number
  characterCount: number
  failedPages?: number[]
}

type PdfTextExtractionResult = DeepSeekOcrResult

export type KnowledgeProcessingStage = 'parsing' | 'text-extraction' | 'ocr' | 'embedding'

export type KnowledgeProcessingProgress = {
  stage: KnowledgeProcessingStage
  page?: number
  total?: number
  failedPages?: number[]
}

export interface KnowledgeBaseAddItemOptions {
  base: KnowledgeBaseParams
  item: KnowledgeItem
  forceReload?: boolean
  userId?: string
  onProgress?: (progress: KnowledgeProcessingProgress) => void
  signal?: AbortSignal
}

interface KnowledgeBaseAddItemOptionsNonNullableAttribute {
  base: KnowledgeBaseParams
  item: KnowledgeItem
  forceReload: boolean
  userId: string
  onProgress: (progress: KnowledgeProcessingProgress) => void
  signal?: AbortSignal
}

interface EvaluateTaskWorkload {
  workload: number
}

type LoaderDoneReturn = LoaderReturn | null

enum LoaderTaskItemState {
  PENDING,
  PROCESSING,
  DONE
}

interface LoaderTaskItem {
  state: LoaderTaskItemState
  task: () => Promise<unknown>
  evaluateTaskWorkload: EvaluateTaskWorkload
}

interface LoaderTask {
  loaderTasks: Set<LoaderTaskItem>
  loaderDoneReturn: LoaderDoneReturn
  sequential?: boolean
}

interface QueueTaskItem {
  taskPromise: () => Promise<unknown>
  resolve: () => void
  evaluateTaskWorkload: EvaluateTaskWorkload
}

class KnowledgeService {
  private storageDir = path.join(getDataPath(), 'KnowledgeBase')
  private pendingDeleteFile = path.join(this.storageDir, 'knowledge_pending_delete.json')
  // Byte based
  private workload = 0
  private processingItemCount = 0
  private knowledgeItemProcessingQueueMappingPromise: Map<LoaderTask, () => void> = new Map()
  private ragApplications: Map<string, RAGApplication> = new Map()
  private dbInstances: Map<string, LibSqlDb> = new Map()
  private static MAXIMUM_WORKLOAD = 80 * MB
  private static MAXIMUM_PROCESSING_ITEM_COUNT = 30
  private static ERROR_LOADER_RETURN: LoaderReturn = {
    entriesAdded: 0,
    uniqueId: '',
    uniqueIds: [''],
    loaderType: '',
    status: 'failed'
  }

  constructor() {
    this.initStorageDir()
    this.cleanupOnStartup()
  }

  private initStorageDir = (): void => {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true })
    }
  }

  /**
   * Clean up knowledge base resources (RAG applications and database connections in memory)
   */
  private cleanupKnowledgeResources = async (id: string): Promise<void> => {
    try {
      // Remove RAG application instance
      if (this.ragApplications.has(id)) {
        const ragApp = this.ragApplications.get(id)!
        await ragApp.reset()
        this.ragApplications.delete(id)
        logger.debug(`Cleaned up RAG application for id: ${id}`)
      }

      // Remove database instance reference
      if (this.dbInstances.has(id)) {
        this.dbInstances.delete(id)
        logger.debug(`Removed database instance reference for id: ${id}`)
      }
    } catch (error) {
      logger.warn(`Failed to cleanup resources for id: ${id}`, error as Error)
    }
  }

  private getDbPath = (id: string): string => {
    // 消除网络搜索requestI d中的特殊字符
    return path.join(this.storageDir, sanitizeFilename(id, '_'))
  }

  /**
   * Delete knowledge base file
   */
  private deleteKnowledgeFile = (id: string): boolean => {
    const dbPath = this.getDbPath(id)
    if (fs.existsSync(dbPath)) {
      try {
        fs.rmSync(dbPath, { recursive: true })
        logger.debug(`Deleted knowledge base file with id: ${id}`)
        return true
      } catch (error) {
        logger.warn(`Failed to delete knowledge base file with id: ${id}: ${error}`)
        return false
      }
    }
    return true // File does not exist, consider deletion successful
  }

  /**
   * Manage persistent deletion list
   */
  private pendingDeleteManager = {
    load: (): string[] => {
      try {
        if (fs.existsSync(this.pendingDeleteFile)) {
          return JSON.parse(fs.readFileSync(this.pendingDeleteFile, 'utf-8')) as string[]
        }
      } catch (error) {
        logger.warn('Failed to load pending delete IDs:', error as Error)
      }
      return []
    },

    save: (ids: string[]): void => {
      try {
        fs.writeFileSync(this.pendingDeleteFile, JSON.stringify(ids, null, 2))
        logger.debug(`Total ${ids.length} knowledge bases pending delete`)
      } catch (error) {
        logger.warn('Failed to save pending delete IDs:', error as Error)
      }
    },

    add: (id: string): void => {
      const existingIds = this.pendingDeleteManager.load()
      const allIds = [...new Set([...existingIds, id])]
      this.pendingDeleteManager.save(allIds)
    },

    clear: (): void => {
      try {
        if (fs.existsSync(this.pendingDeleteFile)) {
          fs.unlinkSync(this.pendingDeleteFile)
        }
      } catch (error) {
        logger.warn('Failed to clear pending delete file:', error as Error)
      }
    }
  }

  /**
   * Clean up databases marked for deletion on startup
   */
  private cleanupOnStartup = (): void => {
    const pendingDeleteIds = this.pendingDeleteManager.load()
    if (pendingDeleteIds.length === 0) return

    logger.info(`Found ${pendingDeleteIds.length} knowledge bases pending deletion from previous session`)

    let deletedCount = 0
    pendingDeleteIds.forEach((id) => {
      if (this.deleteKnowledgeFile(id)) {
        deletedCount++
      } else {
        logger.warn(`Failed to delete knowledge base ${id}, please delete it manually`)
      }
    })

    this.pendingDeleteManager.clear()
    logger.info(`Startup cleanup completed: ${deletedCount}/${pendingDeleteIds.length} knowledge bases deleted`)
  }

  private getRagApplication = async ({
    id,
    embedApiClient,
    dimensions,
    documentCount
  }: KnowledgeBaseParams): Promise<RAGApplication> => {
    if (this.ragApplications.has(id)) {
      return this.ragApplications.get(id)!
    }

    let ragApplication: RAGApplication
    const embeddings = new Embeddings({
      embedApiClient,
      dimensions
    })
    try {
      const dbPath = this.getDbPath(id)
      const libSqlDb = new LibSqlDb({ path: dbPath })
      // Save database instance for later closing
      this.dbInstances.set(id, libSqlDb)

      ragApplication = await new RAGApplicationBuilder()
        .setModel('NO_MODEL')
        .setEmbeddingModel(embeddings)
        .setVectorDatabase(libSqlDb)
        .setSearchResultCount(documentCount || 30)
        .build()
      this.ragApplications.set(id, ragApplication)
    } catch (e) {
      logger.error('Failed to create RAGApplication:', e as Error)
      throw new Error(`Failed to create RAGApplication: ${e}`)
    }

    return ragApplication
  }

  public create = async (_: any, base: KnowledgeBaseParams): Promise<void> => {
    await this.getRagApplication(base)
  }

  public reset = async (_: any, base: KnowledgeBaseParams): Promise<void> => {
    const ragApplication = await this.getRagApplication(base)
    await ragApplication.reset()
  }

  public async delete(_: any, id: string): Promise<void> {
    logger.debug(`delete id: ${id}`)

    await this.cleanupKnowledgeResources(id)

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Try to delete database file immediately
    if (!this.deleteKnowledgeFile(id)) {
      logger.debug(`Will delete knowledge base ${id} on next startup`)
      this.pendingDeleteManager.add(id)
    }
  }

  private maximumLoad() {
    return (
      this.processingItemCount >= KnowledgeService.MAXIMUM_PROCESSING_ITEM_COUNT ||
      this.workload >= KnowledgeService.MAXIMUM_WORKLOAD
    )
  }

  private reportProgress = (
    onProgress: (progress: KnowledgeProcessingProgress) => void,
    progress: KnowledgeProcessingProgress
  ): void => {
    try {
      onProgress(progress)
    } catch (error) {
      logger.warn('Knowledge processing progress callback failed:', error as Error)
    }
  }

  private fileTask(
    ragApplication: RAGApplication,
    options: KnowledgeBaseAddItemOptionsNonNullableAttribute
  ): LoaderTask {
    const { base, item, forceReload, userId, onProgress, signal } = options
    const file = item.content as FileMetadata

    const loaderTask: LoaderTask = {
      loaderTasks: new Set([
        {
          state: LoaderTaskItemState.PENDING,
          task: async () => {
            signal?.throwIfAborted()
            this.reportProgress(onProgress, { stage: 'parsing' })
            let primaryResult: LoaderReturn | null = null
            let fileToProcess: FileMetadata = file
            try {
              fileToProcess = await this.preprocessing(file, base, item, userId)
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error)
              logger.error(`Primary document preprocessing failed for ${file.name}: ${message}`)
              primaryResult = {
                ...KnowledgeService.ERROR_LOADER_RETURN,
                message,
                messageSource: 'preprocess'
              }
            }

            if (!primaryResult) {
              try {
                primaryResult = await addFileLoader(ragApplication, fileToProcess, base, forceReload)
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error)
                logger.error(`Primary document embedding failed for ${file.name}: ${message}`)
                primaryResult = {
                  ...KnowledgeService.ERROR_LOADER_RETURN,
                  message,
                  messageSource: 'embedding'
                }
              }
            }

            if (this.shouldUsePdfFallback(file, primaryResult)) {
              signal?.throwIfAborted()
              logger.info(
                `Primary PDF task completed without searchable chunks for ${file.name}; queueing an independent text extraction task`
              )
              loaderTask.loaderDoneReturn = primaryResult
              this.reportProgress(onProgress, { stage: 'text-extraction' })
              loaderTask.loaderTasks.add(
                this.createPdfTextExtractionTask(loaderTask, ragApplication, file, base, forceReload, onProgress, signal)
              )
              return primaryResult
            }

            loaderTask.loaderDoneReturn = primaryResult
            return primaryResult
          },
          evaluateTaskWorkload: { workload: file.size }
        }
      ]),
      loaderDoneReturn: null,
      sequential: true
    }

    return loaderTask
  }
  private directoryTask(
    ragApplication: RAGApplication,
    options: KnowledgeBaseAddItemOptionsNonNullableAttribute
  ): LoaderTask {
    const { base, item, forceReload } = options
    const directory = item.content as string
    const files = getAllFiles(directory)
    const totalFiles = files.length
    let processedFiles = 0

    const sendDirectoryProcessingPercent = (totalFiles: number, processedFiles: number) => {
      const mainWindow = windowService.getMainWindow()
      mainWindow?.webContents.send(IpcChannel.DirectoryProcessingPercent, {
        itemId: item.id,
        percent: (processedFiles / totalFiles) * 100
      })
    }

    const loaderDoneReturn: LoaderDoneReturn = {
      entriesAdded: 0,
      uniqueId: `DirectoryLoader_${uuidv4()}`,
      uniqueIds: [],
      loaderType: 'DirectoryLoader'
    }
    const loaderTasks = new Set<LoaderTaskItem>()
    for (const file of files) {
      loaderTasks.add({
        state: LoaderTaskItemState.PENDING,
        task: () =>
          addFileLoader(ragApplication, file, base, forceReload)
            .then((result) => {
              loaderDoneReturn.entriesAdded += 1
              processedFiles += 1
              sendDirectoryProcessingPercent(totalFiles, processedFiles)
              loaderDoneReturn.uniqueIds.push(result.uniqueId)
              return result
            })
            .catch((err) => {
              logger.error('Failed to add dir loader:', err)
              return {
                ...KnowledgeService.ERROR_LOADER_RETURN,
                message: `Failed to add dir loader: ${err.message}`,
                messageSource: 'embedding'
              }
            }),
        evaluateTaskWorkload: { workload: file.size }
      })
    }

    return {
      loaderTasks,
      loaderDoneReturn
    }
  }

  private urlTask(
    ragApplication: RAGApplication,
    options: KnowledgeBaseAddItemOptionsNonNullableAttribute
  ): LoaderTask {
    const { base, item, forceReload } = options
    const content = item.content as string

    const loaderTask: LoaderTask = {
      loaderTasks: new Set([
        {
          state: LoaderTaskItemState.PENDING,
          task: () => {
            const loaderReturn = ragApplication.addLoader(
              new WebLoader({
                urlOrContent: content,
                chunkSize: base.chunkSize,
                chunkOverlap: base.chunkOverlap
              }),
              forceReload
            ) as Promise<LoaderReturn>

            return loaderReturn
              .then((result) => {
                const { entriesAdded, uniqueId, loaderType } = result
                loaderTask.loaderDoneReturn = {
                  entriesAdded: entriesAdded,
                  uniqueId: uniqueId,
                  uniqueIds: [uniqueId],
                  loaderType: loaderType
                }
                return result
              })
              .catch((err) => {
                logger.error('Failed to add url loader:', err)
                return {
                  ...KnowledgeService.ERROR_LOADER_RETURN,
                  message: `Failed to add url loader: ${err.message}`,
                  messageSource: 'embedding'
                }
              })
          },
          evaluateTaskWorkload: { workload: 2 * MB }
        }
      ]),
      loaderDoneReturn: null
    }
    return loaderTask
  }

  private sitemapTask(
    ragApplication: RAGApplication,
    options: KnowledgeBaseAddItemOptionsNonNullableAttribute
  ): LoaderTask {
    const { base, item, forceReload } = options
    const content = item.content as string

    const loaderTask: LoaderTask = {
      loaderTasks: new Set([
        {
          state: LoaderTaskItemState.PENDING,
          task: () =>
            ragApplication
              .addLoader(
                new SitemapLoader({ url: content, chunkSize: base.chunkSize, chunkOverlap: base.chunkOverlap }) as any,
                forceReload
              )
              .then((result) => {
                const { entriesAdded, uniqueId, loaderType } = result
                loaderTask.loaderDoneReturn = {
                  entriesAdded: entriesAdded,
                  uniqueId: uniqueId,
                  uniqueIds: [uniqueId],
                  loaderType: loaderType
                }
                return result
              })
              .catch((err) => {
                logger.error('Failed to add sitemap loader:', err)
                return {
                  ...KnowledgeService.ERROR_LOADER_RETURN,
                  message: `Failed to add sitemap loader: ${err.message}`,
                  messageSource: 'embedding'
                }
              }),
          evaluateTaskWorkload: { workload: 20 * MB }
        }
      ]),
      loaderDoneReturn: null
    }
    return loaderTask
  }

  private noteTask(
    ragApplication: RAGApplication,
    options: KnowledgeBaseAddItemOptionsNonNullableAttribute
  ): LoaderTask {
    const { base, item, forceReload } = options
    const content = item.content as string
    const sourceUrl = (item as any).sourceUrl

    const encoder = new TextEncoder()
    const contentBytes = encoder.encode(content)
    const loaderTask: LoaderTask = {
      loaderTasks: new Set([
        {
          state: LoaderTaskItemState.PENDING,
          task: () => {
            const loaderReturn = ragApplication.addLoader(
              new NoteLoader({
                text: content,
                sourceUrl,
                chunkSize: base.chunkSize,
                chunkOverlap: base.chunkOverlap
              }),
              forceReload
            ) as Promise<LoaderReturn>

            return loaderReturn
              .then(({ entriesAdded, uniqueId, loaderType }) => {
                loaderTask.loaderDoneReturn = {
                  entriesAdded: entriesAdded,
                  uniqueId: uniqueId,
                  uniqueIds: [uniqueId],
                  loaderType: loaderType
                }
              })
              .catch((err) => {
                logger.error('Failed to add note loader:', err)
                return {
                  ...KnowledgeService.ERROR_LOADER_RETURN,
                  message: `Failed to add note loader: ${err.message}`,
                  messageSource: 'embedding'
                }
              })
          },
          evaluateTaskWorkload: { workload: contentBytes.length }
        }
      ]),
      loaderDoneReturn: null
    }
    return loaderTask
  }

  private processingQueueHandle() {
    const getSubtasksUntilMaximumLoad = (): QueueTaskItem[] => {
      const queueTaskList: QueueTaskItem[] = []
      that: for (const [task, resolve] of this.knowledgeItemProcessingQueueMappingPromise) {
        if (
          task.sequential &&
          Array.from(task.loaderTasks).some((item) => item.state === LoaderTaskItemState.PROCESSING)
        ) {
          continue
        }
        for (const item of task.loaderTasks) {
          if (this.maximumLoad()) {
            break that
          }

          const { state, task: taskPromise, evaluateTaskWorkload } = item

          if (state !== LoaderTaskItemState.PENDING) {
            continue
          }

          const { workload } = evaluateTaskWorkload
          this.workload += workload
          this.processingItemCount += 1
          item.state = LoaderTaskItemState.PROCESSING
          queueTaskList.push({
            taskPromise: async () => {
              try {
                await taskPromise()
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error)
                logger.error(`Unhandled knowledge queue task failure: ${message}`)
                task.loaderDoneReturn = {
                  ...KnowledgeService.ERROR_LOADER_RETURN,
                  message,
                  messageSource: 'embedding'
                }
              } finally {
                this.workload -= workload
                this.processingItemCount -= 1
                task.loaderTasks.delete(item)
                if (task.loaderTasks.size === 0) {
                  this.knowledgeItemProcessingQueueMappingPromise.delete(task)
                  resolve()
                }
                this.processingQueueHandle()
              }
            },
            resolve: () => {},
            evaluateTaskWorkload
          })
        }
      }
      return queueTaskList
    }
    const subTasks = getSubtasksUntilMaximumLoad()
    if (subTasks.length > 0) {
      const subTaskPromises = subTasks.map(({ taskPromise }) => taskPromise())
      Promise.all(subTaskPromises).then(() => {
        subTasks.forEach(({ resolve }) => resolve())
      })
    }
  }

  private appendProcessingQueue(task: LoaderTask): Promise<LoaderReturn> {
    return new Promise((resolve) => {
      this.knowledgeItemProcessingQueueMappingPromise.set(task, () => {
        resolve(task.loaderDoneReturn!)
      })
    })
  }

  public add = (_: any, options: KnowledgeBaseAddItemOptions): Promise<LoaderReturn> => {
    return new Promise((resolve) => {
      const { base, item, forceReload = false, userId = '', onProgress = () => undefined, signal } = options
      const optionsNonNullableAttribute = { base, item, forceReload, userId, onProgress, signal }
      this.getRagApplication(base)
        .then((ragApplication) => {
          const task = (() => {
            switch (item.type) {
              case 'file':
                return this.fileTask(ragApplication, optionsNonNullableAttribute)
              case 'directory':
                return this.directoryTask(ragApplication, optionsNonNullableAttribute)
              case 'url':
                return this.urlTask(ragApplication, optionsNonNullableAttribute)
              case 'sitemap':
                return this.sitemapTask(ragApplication, optionsNonNullableAttribute)
              case 'note':
                return this.noteTask(ragApplication, optionsNonNullableAttribute)
              default:
                return null
            }
          })()

          if (task) {
            this.appendProcessingQueue(task).then(() => {
              resolve(task.loaderDoneReturn!)
            })
            this.processingQueueHandle()
          } else {
            resolve({
              ...KnowledgeService.ERROR_LOADER_RETURN,
              message: 'Unsupported item type',
              messageSource: 'embedding'
            })
          }
        })
        .catch((err) => {
          logger.error('Failed to add item:', err)
          resolve({
            ...KnowledgeService.ERROR_LOADER_RETURN,
            message: `Failed to add item: ${err.message}`,
            messageSource: 'embedding'
          })
        })
    })
  }

  @TraceMethod({ spanName: 'remove', tag: 'Knowledge' })
  public async remove(
    _: any,
    { uniqueId, uniqueIds, base }: { uniqueId: string; uniqueIds: string[]; base: KnowledgeBaseParams }
  ): Promise<void> {
    const ragApplication = await this.getRagApplication(base)
    logger.debug(`Remove Item UniqueId: ${uniqueId}`)
    for (const id of uniqueIds) {
      await ragApplication.deleteLoader(id)
    }
  }

  @TraceMethod({ spanName: 'RagSearch', tag: 'Knowledge' })
  public async search(
    _: any,
    { search, base }: { search: string; base: KnowledgeBaseParams }
  ): Promise<KnowledgeSearchResult[]> {
    const ragApplication = await this.getRagApplication(base)
    return await ragApplication.search(search)
  }

  @TraceMethod({ spanName: 'rerank', tag: 'Knowledge' })
  public async rerank(
    _: any,
    { search, base, results }: { search: string; base: KnowledgeBaseParams; results: KnowledgeSearchResult[] }
  ): Promise<KnowledgeSearchResult[]> {
    if (results.length === 0) {
      return results
    }
    return await new Reranker(base).rerank(search, results)
  }

  /**
   * Close all open database connections and clear cached instances.
   * Used during factory reset and backup restore to release file handles.
   */
  public closeAll = async (): Promise<void> => {
    const failed: string[] = []

    for (const [id, db] of this.dbInstances) {
      try {
        // LibSqlDb's client is private; upstream should add a close() method.
        // TODO: Remove this cast once LibSqlDb exposes close() natively.
        const client = (db as any).client
        if (client && typeof client.close === 'function') {
          client.close()
          logger.debug(`Closed database instance for id: ${id}`)
        } else {
          logger.error(`Cannot close database instance for id: ${id} — client not accessible`)
          failed.push(id)
        }
      } catch (error) {
        logger.error(`Failed to close database instance for id: ${id}`, error as Error)
        failed.push(id)
      }
    }

    this.dbInstances.clear()
    this.ragApplications.clear()

    if (failed.length > 0) {
      throw new Error(`Failed to close KnowledgeBase connections: ${failed.join(', ')}`)
    }

    logger.info('All KnowledgeBase connections closed')
  }

  public getStorageDir = (): string => {
    return this.storageDir
  }

  private shouldUsePdfFallback = (file: FileMetadata, result: LoaderReturn): boolean => {
    if (process.env.DEEPSEEK_OCR2_FALLBACK_ENABLED?.trim().toLowerCase() === 'false') return false
    return (
      file.ext.toLowerCase() === '.pdf' &&
      (result.status === 'failed' || !result.entriesAdded || result.entriesAdded <= 0)
    )
  }

  private countUsefulCharacters = (text: string): number => text.replace(/\s/g, '').length

  private createFallbackError = (
    message: string,
    messageSource: NonNullable<LoaderReturn['messageSource']> = 'preprocess'
  ): LoaderReturn => ({
    ...KnowledgeService.ERROR_LOADER_RETURN,
    message,
    messageSource
  })

  private createPdfTextExtractionTask = (
    loaderTask: LoaderTask,
    ragApplication: RAGApplication,
    file: FileMetadata,
    base: KnowledgeBaseParams,
    forceReload: boolean,
    onProgress: (progress: KnowledgeProcessingProgress) => void,
    signal?: AbortSignal
  ): LoaderTaskItem => ({
    state: LoaderTaskItemState.PENDING,
    evaluateTaskWorkload: { workload: file.size },
    task: async () => {
      signal?.throwIfAborted()
      let extracted: PdfTextExtractionResult
      try {
        extracted = await this.extractTextWithPdfJs(file)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn(`Independent PDF text extraction failed for ${file.name}: ${message}; queueing DeepSeek OCR`)
        loaderTask.loaderTasks.add(
          this.createDeepSeekOcrTask(loaderTask, ragApplication, file, base, forceReload, onProgress, signal)
        )
        return this.createFallbackError(message)
      }

      if (extracted.characterCount >= PDF_FALLBACK_MIN_TEXT_CHARS) {
        try {
          signal?.throwIfAborted()
          this.reportProgress(onProgress, { stage: 'embedding' })
          const result = await this.addFallbackText(
            ragApplication,
            file,
            base,
            forceReload,
            extracted,
            'PDF.js text extraction'
          )
          loaderTask.loaderDoneReturn = result
          logger.info(
            `Independent PDF text extraction task completed for ${file.name}: pages=${extracted.pageCount}, chars=${extracted.characterCount}, entries=${result.entriesAdded}`
          )
          return result
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`Embedding PDF.js text failed for ${file.name}: ${message}`)
          const errorResult = this.createFallbackError(message, 'embedding')
          loaderTask.loaderDoneReturn = errorResult
          return errorResult
        }
      }

      logger.info(
        `Independent PDF text extraction task completed for ${file.name} with no usable text; queueing a new DeepSeek OCR task`
      )
      loaderTask.loaderTasks.add(
        this.createDeepSeekOcrTask(loaderTask, ragApplication, file, base, forceReload, onProgress, signal)
      )
      return extracted
    }
  })

  private createDeepSeekOcrTask = (
    loaderTask: LoaderTask,
    ragApplication: RAGApplication,
    file: FileMetadata,
    base: KnowledgeBaseParams,
    forceReload: boolean,
    onProgress: (progress: KnowledgeProcessingProgress) => void,
    signal?: AbortSignal
  ): LoaderTaskItem => ({
    state: LoaderTaskItemState.PENDING,
    evaluateTaskWorkload: { workload: file.size },
    task: async () => {
      signal?.throwIfAborted()
      let ocr: DeepSeekOcrResult
      try {
        this.reportProgress(onProgress, { stage: 'ocr', page: 0 })
        ocr = await this.extractTextWithDeepSeekOcr(file, onProgress, signal)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Independent DeepSeek OCR extraction task failed for ${file.name}: ${message}`)
        const errorResult = this.createFallbackError(
          `Document parser and text extractor produced no searchable text; DeepSeek OCR failed: ${message}`
        )
        loaderTask.loaderDoneReturn = errorResult
        return errorResult
      }

      try {
        signal?.throwIfAborted()
        this.reportProgress(onProgress, { stage: 'embedding' })
        const result = await this.addFallbackText(ragApplication, file, base, forceReload, ocr, 'DeepSeek OCR')
        const resultWithWarnings = {
          ...result,
          ocrFailedPages: ocr.failedPages || []
        } as LoaderReturn
        loaderTask.loaderDoneReturn = resultWithWarnings
        logger.info(
          `Independent DeepSeek OCR task completed for ${file.name}: pages=${ocr.pageCount}, chars=${ocr.characterCount}, failedPages=${ocr.failedPages?.join(',') || 'none'}, entries=${result.entriesAdded}`
        )
        return resultWithWarnings
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Embedding DeepSeek OCR text failed for ${file.name}: ${message}`)
        const errorResult = this.createFallbackError(`DeepSeek OCR succeeded, but embedding failed: ${message}`, 'embedding')
        loaderTask.loaderDoneReturn = errorResult
        return errorResult
      }
    }
  })

  private extractTextWithPdfJs = async (file: FileMetadata): Promise<PdfTextExtractionResult> => {
    const filePath = file.path || fileStorage.getFilePathById(file)
    const fileBuffer = await fs.promises.readFile(filePath)
    const loadingTask = getDocument({ data: new Uint8Array(fileBuffer) })

    try {
      const document = await loadingTask.promise
      const pages: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const text = content.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' ')
          .trim()
        if (text) pages.push(text)
        page.cleanup()
      }
      const text = pages.join('\n\n').trim()
      return {
        text,
        pageCount: document.numPages,
        characterCount: this.countUsefulCharacters(text)
      }
    } finally {
      await loadingTask.destroy()
    }
  }

  private getDeepSeekOcrTimeoutMs = (): number => {
    const configured = Number(process.env.DEEPSEEK_OCR2_TIMEOUT_MS)
    return Number.isFinite(configured) && configured >= 60_000
      ? Math.floor(configured)
      : DEEPSEEK_OCR2_DEFAULT_TIMEOUT_MS
  }

  private extractTextWithDeepSeekOcr = async (
    file: FileMetadata,
    onProgress: (progress: KnowledgeProcessingProgress) => void = () => undefined,
    signal?: AbortSignal
  ): Promise<DeepSeekOcrResult> => {
    const filePath = file.path || fileStorage.getFilePathById(file)
    const fileBuffer = await fs.promises.readFile(filePath)
    const apiBase = (process.env.DEEPSEEK_OCR2_API_BASE || DEEPSEEK_OCR2_DEFAULT_BASE_URL).replace(/\/+$/, '')
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), this.getDeepSeekOcrTimeoutMs())
    const cancelOcr = () => abortController.abort(signal?.reason || new Error('Upload cancelled'))
    if (signal?.aborted) cancelOcr()
    signal?.addEventListener('abort', cancelOcr, { once: true })

    try {
      logger.info(`Starting DeepSeek OCR fallback for ${file.name} via ${apiBase}`)
      const pages = new Map<number, string>()
      const failedPages: number[] = []
      let reportedTotal = 0
      let lastProcessedPage = 0
      let fatalPayloadError = false
      const consumeLine = (rawLine: string) => {
        if (!rawLine.trim()) return
        let payload: DeepSeekOcrPage
        try {
          payload = JSON.parse(rawLine) as DeepSeekOcrPage
        } catch {
          throw new Error(`OCR API returned malformed NDJSON: ${rawLine.slice(0, 200)}`)
        }
        const page = Number(payload.page)
        const total = Number(payload.total)
        if (Number.isFinite(total) && total > 0) reportedTotal = Math.floor(total)
        if (typeof payload.error === 'string' && payload.error.trim()) {
          if (payload.recoverable === true && Number.isFinite(page) && page > 0) {
            const failedPage = Math.floor(page)
            if (!failedPages.includes(failedPage)) failedPages.push(failedPage)
            logger.warn(`DeepSeek OCR skipped page ${failedPage} for ${file.name}: ${payload.error}`)
          } else {
            fatalPayloadError = true
            throw new Error(payload.error)
          }
        }
        if (Number.isFinite(page) && page >= 0) {
          lastProcessedPage = Math.max(lastProcessedPage, Math.floor(page))
          this.reportProgress(onProgress, {
            stage: 'ocr',
            page: Math.floor(page),
            total: reportedTotal || undefined,
            failedPages: [...failedPages]
          })
        }
        if (payload.heartbeat === true) return
        if (typeof payload.error === 'string' && payload.error.trim()) return
        const pageText =
          typeof payload.clean_text === 'string'
            ? payload.clean_text.trim()
            : typeof payload.text === 'string'
              ? payload.text.trim()
              : ''
        if (pageText) pages.set(Number.isFinite(page) && page > 0 ? Math.floor(page) : pages.size + 1, pageText)
      }

      const maxStreamAttempts = 3
      for (let attempt = 1; attempt <= maxStreamAttempts; attempt++) {
        try {
          const form = new FormData()
          form.set('file', new Blob([fileBuffer], { type: 'application/pdf' }), file.name || 'upload.pdf')
          // Knowledge ingestion needs searchable characters. The OCR service's markdown/crop
          // prompt can be orders of magnitude slower on scanned engineering PDFs.
          form.set('mode', 'plain')
          form.set('start_page', String(lastProcessedPage + 1))
          const response = await fetch(`${apiBase}/upload`, { method: 'POST', body: form, signal: abortController.signal })
          if (!response.ok) {
            const body = await response.text()
            throw new Error(`OCR API returned HTTP ${response.status}: ${body.slice(0, 500)}`)
          }
          if (!response.body) throw new Error('OCR API returned an empty response stream')

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (true) {
            const { done, value } = await reader.read()
            buffer += decoder.decode(value, { stream: !done })
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() || ''
            for (const line of lines) consumeLine(line)
            if (done) break
          }
          if (buffer.trim()) consumeLine(buffer)
          break
        } catch (error: unknown) {
          if (abortController.signal.aborted || fatalPayloadError || attempt === maxStreamAttempts) throw error
          const message = error instanceof Error ? error.message : String(error)
          logger.warn(
            `DeepSeek OCR stream interrupted for ${file.name} after page ${lastProcessedPage}; retrying from page ${lastProcessedPage + 1} (${attempt + 1}/${maxStreamAttempts}): ${message}`
          )
        }
      }

      const text = [...pages.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, pageText]) => pageText)
        .join('\n\n')
        .trim()
      const characterCount = this.countUsefulCharacters(text)
      if (characterCount < PDF_FALLBACK_MIN_TEXT_CHARS) {
        throw new Error(`OCR returned too little text (${characterCount} non-whitespace characters across ${pages.size} pages)`)
      }
      return { text, pageCount: reportedTotal || pages.size, characterCount, failedPages }
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', cancelOcr)
    }
  }

  private addFallbackText = async (
    ragApplication: RAGApplication,
    file: FileMetadata,
    base: KnowledgeBaseParams,
    forceReload: boolean,
    extracted: PdfTextExtractionResult,
    source: string
  ): Promise<LoaderReturn> => {
    if (extracted.characterCount < PDF_FALLBACK_MIN_TEXT_CHARS) {
      throw new Error(`${source} did not produce enough text to embed`)
    }
    const sourceText = `Source PDF: ${file.name}\nExtraction: ${source}\n\n${extracted.text}`
    const result = (await ragApplication.addLoader(
      new TextLoader({ text: sourceText, chunkSize: base.chunkSize, chunkOverlap: base.chunkOverlap }) as any,
      forceReload
    )) as LoaderReturn

    if (!result.entriesAdded || result.entriesAdded <= 0) {
      throw new Error(`${source} produced text but no searchable chunks were embedded`)
    }
    return {
      ...result,
      uniqueIds:
        Array.isArray(result.uniqueIds) && result.uniqueIds.length > 0
          ? result.uniqueIds
          : [result.uniqueId].filter(Boolean)
    }
  }

  private preprocessing = async (
    file: FileMetadata,
    base: KnowledgeBaseParams,
    item: KnowledgeItem,
    userId: string
  ): Promise<FileMetadata> => {
    let fileToProcess: FileMetadata = file
    if (base.preprocessProvider && file.ext.toLowerCase() === '.pdf') {
      try {
        const provider = new PreprocessProvider(base.preprocessProvider.provider, userId)
        const filePath = fileStorage.getFilePathById(file)
        // Check if file has already been preprocessed
        const alreadyProcessed = await provider.checkIfAlreadyProcessed(file)
        if (alreadyProcessed) {
          logger.debug(`File already preprocess processed, using cached result: ${filePath}`)
          return alreadyProcessed
        }

        // Execute preprocessing
        logger.debug(`Starting preprocess processing for scanned PDF: ${filePath}`)
        const { processedFile } = await provider.parseFile(item.id, file)
        fileToProcess = processedFile
        const mainWindow = windowService.getMainWindow()
        mainWindow?.webContents.send('file-preprocess-finished', {
          itemId: item.id
        })
      } catch (err) {
        logger.error(`Preprocess processing failed: ${err}`)
        // If preprocessing fails, use original file
        // fileToProcess = file
        throw new Error(`Preprocess processing failed: ${err}`)
      }
    }

    return fileToProcess
  }
}

export default new KnowledgeService()
