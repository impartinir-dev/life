import type { Todo } from '../data/types'

export type TodoView = 'today' | 'upcoming' | 'mine' | 'all'

/** Open to-dos for a view, soonest first; to-dos without a date go last. */
export function filterTodos(todos: Todo[], view: TodoView, me: string, today: string): Todo[] {
  const open = todos.filter((t) => !t.done)
  const picked = open.filter((t) => {
    switch (view) {
      case 'today':
        return t.due_date !== null && t.due_date <= today
      case 'upcoming':
        return t.due_date === null || t.due_date > today
      case 'mine':
        return t.assignee === me || t.assignee === null
      case 'all':
        return true
    }
  })
  return picked.sort(
    (a, b) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at),
  )
}
