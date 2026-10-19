import { describe, expect, it } from 'vitest'
import type { Todo } from '../data/types'
import { filterTodos } from './todos'

const todo = (title: string, extra: Partial<Todo> = {}): Todo => ({
  id: title,
  household_id: 'h',
  created_by: 'me',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
  title,
  notes: null,
  due_date: null,
  assignee: null,
  repeat_unit: null,
  repeat_every: 1,
  done: false,
  done_at: null,
  done_by: null,
  ...extra,
})

const today = '2026-10-19'
const all = [
  todo('overdue', { due_date: '2026-10-10', assignee: 'wife' }),
  todo('today', { due_date: today, assignee: 'me' }),
  todo('later', { due_date: '2026-11-01' }),
  todo('someday'),
  todo('finished', { due_date: today, done: true }),
]
const titles = (ts: Todo[]) => ts.map((t) => t.title)

describe('filterTodos', () => {
  it('Today includes overdue items, soonest first', () => {
    expect(titles(filterTodos(all, 'today', 'me', today))).toEqual(['overdue', 'today'])
  })

  it('Upcoming has future and undated items, undated last', () => {
    expect(titles(filterTodos(all, 'upcoming', 'me', today))).toEqual(['later', 'someday'])
  })

  it('Mine includes things assigned to both of us', () => {
    expect(titles(filterTodos(all, 'mine', 'me', today))).toEqual(['today', 'later', 'someday'])
  })

  it('never shows done items', () => {
    expect(titles(filterTodos(all, 'all', 'me', today))).not.toContain('finished')
  })
})
