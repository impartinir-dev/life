// Keeps a local copy of one household's data, writes changes locally first, and syncs them
// to Supabase in the background. Works offline: the copy and the queue of unsent writes live
// in IndexedDB, so the app opens instantly with the last known data, even without signal.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { get, set } from 'idb-keyval'
import { supabase } from '../lib/supabase'
import { acknowledge, enqueue, isPending, isPermanentError, overlay, type PendingWrite } from './queue'
import { TABLES, type BaseRow, type TableName, type Tables } from './types'

export interface SyncStatus {
  online: boolean
  pending: number
  /** Set when the server rejected a change; the change is dropped and the data reloaded. */
  rejected: boolean
}

export interface Snapshot {
  lists: Tables['lists'][]
  list_items: Tables['list_items'][]
  todos: Tables['todos'][]
  /** Names of items ever added to a list, newest first, for suggestions. */
  history: string[]
  status: SyncStatus
  loaded: boolean
}

type Maps = { [K in TableName]: Map<string, Tables[K]> }

const HISTORY_LIMIT = 2000

export class SyncEngine {
  private maps: Maps = { lists: new Map(), list_items: new Map(), todos: new Map() }
  private history: string[] = []
  private queue: PendingWrite[] = []
  private rejected = false
  private loaded = false
  private flushing = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private retryDelay = 2000
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private channel: RealtimeChannel | undefined
  private listeners = new Set<() => void>()
  private snapshot: Snapshot
  private disposed = false
  private readonly householdId: string

  constructor(householdId: string) {
    this.householdId = householdId
    this.snapshot = this.buildSnapshot()
  }

  // ── public API ──

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  async start() {
    const [cache, queue] = await Promise.all([
      get<{ tables: { [K in TableName]: Tables[K][] }; history: string[] }>(this.key('cache')),
      get<PendingWrite[]>(this.key('queue')),
    ])
    if (this.disposed) return
    this.queue = queue ?? []
    if (cache) {
      for (const t of TABLES) this.setTable(t, overlay(cache.tables[t] as BaseRow[], this.queue, t) as Maps[typeof t])
      this.history = cache.history
      this.loaded = true
    }
    this.emit()

    window.addEventListener('online', this.onOnline)
    window.addEventListener('offline', this.emit)
    document.addEventListener('visibilitychange', this.onVisible)
    this.subscribeRealtime()
    await this.flush()
    await this.refresh()
  }

  dispose() {
    this.disposed = true
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.emit)
    document.removeEventListener('visibilitychange', this.onVisible)
    clearTimeout(this.retryTimer)
    clearTimeout(this.saveTimer)
    if (this.channel) void supabase.removeChannel(this.channel)
  }

  /** Saves a complete row locally and queues it for the server. */
  write<K extends TableName>(table: K, row: Tables[K]) {
    const stamped = { ...row, updated_at: new Date().toISOString() }
    const isNew = !this.maps[table].has(stamped.id)
    ;(this.maps[table] as Map<string, Tables[K]>).set(stamped.id, stamped)
    if (table === 'list_items' && isNew) this.history = [(stamped as Tables['list_items']).name, ...this.history].slice(0, HISTORY_LIMIT)
    this.queue = enqueue(this.queue, { table, row: stamped })
    void set(this.key('queue'), this.queue)
    this.emit()
    void this.flush()
  }

  /** Builds a new row with the shared columns filled in. */
  newRow(createdBy: string): BaseRow {
    const now = new Date().toISOString()
    return {
      id: crypto.randomUUID(),
      household_id: this.householdId,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }
  }

  /** Reloads everything from the server. Unsynced local changes stay on top. */
  async refresh() {
    if (!navigator.onLine || this.disposed) return
    const results = await Promise.all([
      ...TABLES.map((t) => supabase.from(t).select('*').eq('household_id', this.householdId).is('deleted_at', null)),
      supabase
        .from('list_items')
        .select('name')
        .eq('household_id', this.householdId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
    ])
    if (this.disposed || results.some((r) => r.error)) return
    TABLES.forEach((t, i) => this.setTable(t, overlay(results[i].data as BaseRow[], this.queue, t) as Maps[typeof t]))
    this.history = (results[TABLES.length].data as { name: string }[]).map((r) => r.name)
    this.loaded = true
    this.emit()
  }

  /** Everything the household has stored, including deleted rows, for the export button. */
  async exportAll(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), household_id: this.householdId }
    for (const t of TABLES) {
      const { data, error } = await supabase.from(t).select('*').eq('household_id', this.householdId)
      out[t] = error ? [...this.maps[t].values()] : data
    }
    return out
  }

  // ── sync ──

  private async flush() {
    if (this.flushing || this.disposed) return
    this.flushing = true
    try {
      while (this.queue.length && navigator.onLine && !this.disposed) {
        const write = this.queue[0]
        const { error } = await supabase.from(write.table).upsert(write.row)
        if (error && !isPermanentError(error)) {
          this.scheduleRetry()
          return
        }
        if (error) {
          console.warn('Change rejected by server', write, error)
          this.rejected = true
          // Drop every queued write for that row, then show the server's version again.
          this.queue = this.queue.filter((w) => !(w.table === write.table && w.row.id === write.row.id))
          void this.refresh()
        } else {
          this.queue = acknowledge(this.queue, write)
        }
        this.retryDelay = 2000
        await set(this.key('queue'), this.queue)
        this.emit()
      }
    } finally {
      this.flushing = false
    }
  }

  private scheduleRetry() {
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => void this.flush(), this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000)
  }

  private subscribeRealtime() {
    let channel = supabase.channel(`household:${this.householdId}`)
    for (const t of TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: t, filter: `household_id=eq.${this.householdId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id
            if (id && !isPending(this.queue, t, id)) this.maps[t].delete(id)
          } else {
            const row = payload.new as Tables[typeof t]
            // Our own unsent change is newer than whatever the server is echoing back.
            if (isPending(this.queue, t, row.id)) return
            const isNew = !this.maps[t].has(row.id)
            ;(this.maps[t] as Map<string, BaseRow>).set(row.id, row)
            if (t === 'list_items' && isNew) {
              this.history = [(row as Tables['list_items']).name, ...this.history].slice(0, HISTORY_LIMIT)
            }
          }
          this.emit()
        },
      )
    }
    this.channel = channel.subscribe()
  }

  private onOnline = () => {
    this.emit()
    void this.flush().then(() => this.refresh())
  }

  private onVisible = () => {
    // Phones suspend background tabs, so live updates may have been missed.
    if (document.visibilityState === 'visible') void this.flush().then(() => this.refresh())
  }

  // ── state ──

  private setTable<K extends TableName>(t: K, rows: Maps[K]) {
    this.maps[t] = rows
  }

  private key(kind: 'cache' | 'queue') {
    return `life:${kind}:${this.householdId}`
  }

  private buildSnapshot(): Snapshot {
    const live = <K extends TableName>(t: K) => [...this.maps[t].values()].filter((r) => !r.deleted_at)
    return {
      lists: live('lists'),
      list_items: live('list_items'),
      todos: live('todos'),
      history: this.history,
      loaded: this.loaded,
      status: { online: navigator.onLine, pending: this.queue.length, rejected: this.rejected },
    }
  }

  private emit = () => {
    this.snapshot = this.buildSnapshot()
    this.listeners.forEach((l) => l())
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      const tables = Object.fromEntries(TABLES.map((t) => [t, [...this.maps[t].values()].filter((r) => !r.deleted_at)]))
      void set(this.key('cache'), { tables, history: this.history })
    }, 300)
  }

  clearRejected() {
    this.rejected = false
    this.emit()
  }
}
