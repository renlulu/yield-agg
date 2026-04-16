import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppConfig } from './config.js'
import { buildEarnFeed } from './feed.js'
import type { EarnFeedSnapshot, SyncStatus } from './types.js'

type SyncReason = 'startup' | 'interval' | 'manual' | 'bootstrap'

export class FeedStore {
  private snapshot: EarnFeedSnapshot | null = null

  private syncStatus: SyncStatus

  private timer: NodeJS.Timeout | null = null

  private syncInFlight: Promise<boolean> | null = null

  constructor(private readonly config: AppConfig) {
    this.syncStatus = {
      isSyncing: false,
      lastAttemptedSyncAt: null,
      lastSuccessfulSyncAt: null,
      nextScheduledSyncAt: null,
      lastError: null,
      syncIntervalMs: config.feedSyncIntervalMs,
      snapshotPath: path.resolve(process.cwd(), config.snapshotPath),
    }
  }

  async initialize() {
    await this.loadSnapshotFromDisk()
    this.scheduleNextSync()
    void this.triggerSync('startup')
  }

  getSnapshot() {
    if (!this.snapshot) {
      return null
    }

    return {
      ...this.snapshot,
      sync: this.syncStatus,
    }
  }

  getHealth() {
    return {
      sync: this.syncStatus,
      hasSnapshot: Boolean(this.snapshot),
      campaigns: this.snapshot?.campaigns.length ?? 0,
      generatedAt: this.snapshot?.generatedAt ?? null,
    }
  }

  async ensureSnapshot() {
    if (this.snapshot) {
      return this.getSnapshot()
    }

    await this.triggerSync('bootstrap')
    return this.getSnapshot()
  }

  async triggerSync(reason: SyncReason) {
    if (this.syncInFlight) {
      return this.syncInFlight
    }

    this.syncInFlight = this.runSync(reason)
    const result = await this.syncInFlight
    this.syncInFlight = null
    return result
  }

  private async runSync(reason: SyncReason) {
    this.syncStatus.isSyncing = true
    this.syncStatus.lastAttemptedSyncAt = new Date().toISOString()

    try {
      const feed = await buildEarnFeed(this.config)
      const snapshot: EarnFeedSnapshot = {
        ...feed,
        sync: {
          ...this.syncStatus,
          isSyncing: false,
          lastAttemptedSyncAt: this.syncStatus.lastAttemptedSyncAt,
          lastSuccessfulSyncAt: new Date().toISOString(),
          nextScheduledSyncAt: this.computeNextSyncAt(),
          lastError: reason === 'manual' ? null : null,
        },
      }

      this.snapshot = snapshot
      this.syncStatus = snapshot.sync
      await this.writeSnapshotToDisk(snapshot)
      return true
    } catch (error) {
      this.syncStatus = {
        ...this.syncStatus,
        isSyncing: false,
        nextScheduledSyncAt: this.computeNextSyncAt(),
        lastError: error instanceof Error ? error.message : 'Unknown sync error',
      }
      return false
    } finally {
      this.scheduleNextSync()
    }
  }

  private scheduleNextSync() {
    if (this.timer) {
      clearTimeout(this.timer)
    }

    this.syncStatus.nextScheduledSyncAt = this.computeNextSyncAt()
    this.timer = setTimeout(() => {
      void this.triggerSync('interval')
    }, this.config.feedSyncIntervalMs)
  }

  private computeNextSyncAt() {
    return new Date(Date.now() + this.config.feedSyncIntervalMs).toISOString()
  }

  private async loadSnapshotFromDisk() {
    try {
      const raw = await fs.readFile(this.syncStatus.snapshotPath, 'utf8')
      const parsed = JSON.parse(raw) as EarnFeedSnapshot

      if (!Array.isArray(parsed.campaigns) || !Array.isArray(parsed.sources)) {
        return
      }

      this.snapshot = parsed
      this.syncStatus = {
        ...this.syncStatus,
        lastAttemptedSyncAt: parsed.sync?.lastAttemptedSyncAt ?? parsed.generatedAt,
        lastSuccessfulSyncAt:
          parsed.sync?.lastSuccessfulSyncAt ?? parsed.generatedAt,
        lastError: parsed.sync?.lastError ?? null,
      }
    } catch {
      // No snapshot yet is acceptable.
    }
  }

  private async writeSnapshotToDisk(snapshot: EarnFeedSnapshot) {
    const dirname = path.dirname(this.syncStatus.snapshotPath)
    await fs.mkdir(dirname, { recursive: true })
    await fs.writeFile(
      this.syncStatus.snapshotPath,
      JSON.stringify(snapshot, null, 2),
      'utf8',
    )
  }
}
