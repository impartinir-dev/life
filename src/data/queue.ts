// Pure helpers for the offline write queue. Every write is a full row upsert, so replaying
// a queued write is idempotent and a newer write for the same row simply replaces the older one.
import type { BaseRow, TableName } from './types'

export interface PendingWrite {
  table: TableName
  row: BaseRow
}

/**
 * Adds a write, replacing any queued write for the same row *in place*.
 * Keeping the original position matters: a list created offline must still be
 * sent before the items added to it, even if the list is renamed afterwards.
 */
export function enqueue(queue: PendingWrite[], write: PendingWrite): PendingWrite[] {
  const i = queue.findIndex((w) => w.table === write.table && w.row.id === write.row.id)
  if (i === -1) return [...queue, write]
  const next = queue.slice()
  next[i] = write
  return next
}

/** Removes a sent write, unless it was replaced by a newer one while the request was in flight. */
export function acknowledge(queue: PendingWrite[], sent: PendingWrite): PendingWrite[] {
  return queue.filter((w) => !(w.table === sent.table && w.row.id === sent.row.id && w.row.updated_at === sent.row.updated_at))
}

/** Lays queued (not yet synced) writes over rows fetched from the server. */
export function overlay<T extends BaseRow>(server: T[], queue: PendingWrite[], table: TableName): Map<string, T> {
  const rows = new Map(server.map((r) => [r.id, r]))
  for (const w of queue) if (w.table === table) rows.set(w.row.id, w.row as T)
  return rows
}

export function isPending(queue: PendingWrite[], table: TableName, id: string): boolean {
  return queue.some((w) => w.table === table && w.row.id === id)
}

/** PostgREST/Postgres error codes mean the server rejected the row; anything else is treated as a network problem worth retrying. */
export function isPermanentError(error: { code?: string } | null): boolean {
  const code = error?.code ?? ''
  if (code === 'PGRST301' || code === 'PGRST303') return false // expired login, retried after refresh
  return /^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST')
}
