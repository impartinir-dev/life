import { describe, expect, it } from 'vitest'
import { acknowledge, enqueue, isPermanentError, overlay, type PendingWrite } from './queue'
import type { BaseRow } from './types'

const row = (id: string, updated_at: string, extra: object = {}): BaseRow =>
  ({ id, household_id: 'h', created_by: null, created_at: 't0', updated_at, deleted_at: null, ...extra }) as BaseRow

describe('enqueue', () => {
  it('replaces an earlier write for the same row without moving it', () => {
    let q: PendingWrite[] = []
    q = enqueue(q, { table: 'lists', row: row('L', '1', { name: 'Shop' }) })
    q = enqueue(q, { table: 'list_items', row: row('I', '2') })
    q = enqueue(q, { table: 'lists', row: row('L', '3', { name: 'Groceries' }) })
    expect(q.map((w) => [w.table, w.row.id, w.row.updated_at])).toEqual([
      ['lists', 'L', '3'],
      ['list_items', 'I', '2'],
    ])
  })

  it('treats the same id in different tables as different rows', () => {
    const q = enqueue(enqueue([], { table: 'lists', row: row('X', '1') }), { table: 'todos', row: row('X', '1') })
    expect(q).toHaveLength(2)
  })
})

describe('acknowledge', () => {
  it('drops the write that was sent', () => {
    const w = { table: 'todos' as const, row: row('T', '1') }
    expect(acknowledge([w], w)).toEqual([])
  })

  it('keeps a newer write that replaced it during the request', () => {
    const sent = { table: 'todos' as const, row: row('T', '1') }
    const newer = { table: 'todos' as const, row: row('T', '2') }
    expect(acknowledge([newer], sent)).toEqual([newer])
  })
})

describe('overlay', () => {
  it('shows unsynced local changes on top of server data', () => {
    const server = [row('A', '1', { name: 'server' }), row('B', '1')]
    const q = [{ table: 'lists' as const, row: row('A', '2', { name: 'local' }) }, { table: 'lists' as const, row: row('C', '2') }]
    const rows = overlay(server, q, 'lists')
    expect((rows.get('A') as any).name).toBe('local')
    expect([...rows.keys()].sort()).toEqual(['A', 'B', 'C'])
  })
})

describe('isPermanentError', () => {
  it('retries network failures and expired logins', () => {
    expect(isPermanentError({ code: '' })).toBe(false)
    expect(isPermanentError({ code: 'PGRST301' })).toBe(false)
    expect(isPermanentError(null)).toBe(false)
  })

  it('gives up on rows the server rejects', () => {
    expect(isPermanentError({ code: '42501' })).toBe(true)
    expect(isPermanentError({ code: '23503' })).toBe(true)
  })
})
