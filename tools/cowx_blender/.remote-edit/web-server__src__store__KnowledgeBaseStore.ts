import fs from 'fs-extra'
import path from 'path'
import type { KnowledgeBase } from '@types'

const DB_FILE = path.join(process.cwd(), 'storage', 'knowledge_bases.json')

export class KnowledgeBaseStore {
  private bases: KnowledgeBase[] = []

  constructor() {
    this.load()
  }

  load() {
    if (fs.existsSync(DB_FILE)) {
      try {
        this.bases = fs.readJsonSync(DB_FILE)
      } catch (e) {
        console.error('Failed to load knowledge bases', e)
        this.bases = []
      }
    }

    // Migrate: normalize model field for all bases
    let needsSave = false
    this.bases = this.bases.map((b) => {
      const entry = b as any

      // Migrate old embeddingModel field to model field
      if (entry.embeddingModel && !entry.model) {
        const em = entry.embeddingModel
        const provRaw = typeof em === 'string' ? 'openai' : em.provider
        entry.model = {
          id: typeof em === 'string' ? em : em.id || 'text-embedding-3-small',
          provider: provRaw && typeof provRaw === 'object' ? provRaw.id || 'openai' : provRaw || 'openai',
          name: typeof em === 'string' ? em : em.name || em.id || 'text-embedding-3-small'
        }
        delete entry.embeddingModel
        needsSave = true
      }

      // Normalize model.provider from object to string
      if (entry.model?.provider && typeof entry.model.provider === 'object') {
        entry.model.provider = entry.model.provider.id || 'openai'
        needsSave = true
      }

      // Strip provider prefix from model.id (e.g. 'openai-text-embedding-3-small' → 'text-embedding-3-small')
      if (entry.model?.id && entry.model?.provider && typeof entry.model.id === 'string') {
        const prefix = entry.model.provider + '-'
        if (entry.model.id.startsWith(prefix)) {
          entry.model.id = entry.model.id.slice(prefix.length)
          needsSave = true
        }
      }

      return b
    })
    // Migrate: fix garbled file names caused by multer Latin-1 encoding issue.
    // Multer reads UTF-8 filenames as Latin-1, producing mojibake like 'ä¸æ°´åºå' instead of '上水库坝'.
    // Detect by checking for Latin-1 supplement characters (U+00C0–U+00FF) which appear in mojibake
    // but never in real Chinese/Japanese/Korean filenames. Fix by reversing the Latin-1→UTF-8 round-trip.
    this.bases = this.bases.map((b) => {
      const entry = b as any
      if (Array.isArray(entry.items)) {
        for (const item of entry.items) {
          if (item?.content && typeof item.content === 'object' && !Array.isArray(item.content)) {
            const c = item.content
            for (const field of ['name', 'origin_name']) {
              if (typeof c[field] === 'string' && c[field].length > 0) {
                // Check if string contains Latin-1 supplement chars (ä å æ ç è é etc.)
                // These are telltale signs of UTF-8 bytes misread as Latin-1
                const hasLatin1Mojibake = /[\u00C0-\u00FF]/.test(c[field])
                if (hasLatin1Mojibake) {
                  try {
                    const fixed = Buffer.from(c[field], 'latin1').toString('utf8')
                    // Verify the result contains actual CJK or other valid multi-byte chars
                    if (fixed.length < c[field].length && !fixed.includes('\ufffd')) {
                      c[field] = fixed
                      needsSave = true
                    }
                  } catch {
                    /* ignore conversion errors */
                  }
                }
              }
            }
          }
        }
      }
      return b
    })

    // In-memory workers cannot survive a server restart. Never leave a durable
    // upload looking active when no worker owns it anymore.
    this.bases = this.bases.map((b) => {
      const entry = b as any
      if (Array.isArray(entry.items)) {
        for (const item of entry.items) {
          if (item?.serverManaged && item.processingStatus === 'processing') {
            item.processingStatus = 'failed'
            item.processingStage = 'failed'
            item.processingMessage = '服务器重启，任务已中断，请重新上传。'
            item.processingError = '服务器重启，任务已中断，请重新上传。'
            item.updated_at = Date.now()
            needsSave = true
          }
        }
      }
      return b
    })

    if (needsSave) this.save()
  }

  save() {
    fs.outputJsonSync(DB_FILE, this.bases, { spaces: 2 })
  }

  /** Return all knowledge bases (shared by all users) */
  getAll() {
    return this.bases
  }

  /**
   * Check if a user can access (read) a specific knowledge base.
   * All authenticated users can read all knowledge bases.
   */
  canAccess(baseId: string): boolean {
    return !!this.get(baseId)
  }

  /**
   * Check if a user can modify (update/delete) a specific knowledge base.
   * Admins can always modify; regular users need canEditKB permission.
   */
  canModify(userId: string, role: 'admin' | 'user', canEditKB?: boolean): boolean {
    if (role === 'admin') return true
    return canEditKB === true
  }

  add(base: KnowledgeBase) {
    this.bases.push(base)
    this.save()
  }

  update(base: KnowledgeBase) {
    const index = this.bases.findIndex((b) => b.id === base.id)
    if (index !== -1) {
      this.bases[index] = base
      this.save()
    }
  }

  delete(id: string) {
    this.bases = this.bases.filter((b) => b.id !== id)
    this.save()
  }

  get(id: string) {
    return this.bases.find((b) => b.id === id)
  }
}

export const knowledgeBaseStore = new KnowledgeBaseStore()
