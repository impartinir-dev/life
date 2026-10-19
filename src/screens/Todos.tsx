import { useMemo, useState, type FormEvent } from 'react'
import { useHousehold } from '../auth/AuthProvider'
import { Icon } from '../components/Icon'
import { Avatar, Header, Sheet } from '../components/Layout'
import { useToast } from '../components/Toast'
import { useData, useEngine } from '../data/DataProvider'
import type { Profile, Todo } from '../data/types'
import { useI18n } from '../i18n'
import { addPeriod, nextDueDate, todayISO, type RepeatUnit } from '../lib/dates'
import { filterTodos, type TodoView } from '../lib/todos'

const VIEWS: TodoView[] = ['today', 'upcoming', 'mine', 'all']
const VIEW_KEY = 'life:todoView'

function useDateLabel() {
  const { t, locale } = useI18n()
  return (iso: string, today: string) => {
    if (iso === today) return t('todos.dueToday')
    if (iso === addPeriod(today, 'day', 1)) return t('todos.dueTomorrow')
    if (iso === addPeriod(today, 'day', -1)) return t('todos.dueYesterday')
    const [y, m, d] = iso.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const sameYear = y === Number(today.slice(0, 4))
    return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  }
}

export function TodosScreen() {
  const { t } = useI18n()
  const { profile, members } = useHousehold()
  const { todos } = useData()
  const engine = useEngine()
  const toast = useToast()
  const dateLabel = useDateLabel()
  const [view, setViewState] = useState<TodoView>(() => (localStorage.getItem(VIEW_KEY) as TodoView) || 'today')
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<Todo | 'new' | null>(null)
  const [showDone, setShowDone] = useState(false)
  const today = todayISO()

  const setView = (v: TodoView) => {
    localStorage.setItem(VIEW_KEY, v)
    setViewState(v)
  }

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v, filterTodos(todos, v, profile.id, today).length])) as Record<TodoView, number>,
    [todos, profile.id, today],
  )
  const visible = useMemo(() => filterTodos(todos, view, profile.id, today), [todos, view, profile.id, today])
  const done = useMemo(
    () =>
      todos
        .filter((td) => td.done)
        .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
        .slice(0, 30),
    [todos],
  )

  function blank(): Todo {
    return {
      ...engine.newRow(profile.id),
      title: '',
      notes: null,
      due_date: view === 'today' ? today : null,
      assignee: view === 'mine' ? profile.id : null,
      repeat_unit: null,
      repeat_every: 1,
      done: false,
      done_at: null,
      done_by: null,
    }
  }

  function quickAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    engine.write('todos', { ...blank(), title: title.trim() })
    setTitle('')
  }

  function complete(todo: Todo) {
    if (todo.done) {
      engine.write('todos', { ...todo, done: false, done_at: null, done_by: null })
      return
    }
    const finished = { ...todo, done: true, done_at: new Date().toISOString(), done_by: profile.id }
    engine.write('todos', finished)
    if (!todo.repeat_unit) {
      toast(t('todos.completed'), { undo: () => engine.write('todos', { ...todo }) })
      return
    }
    const next: Todo = {
      ...todo,
      ...engine.newRow(profile.id),
      due_date: nextDueDate(todo.due_date, todo.repeat_unit, todo.repeat_every, today),
    }
    engine.write('todos', next)
    toast(t('todos.completedNext', { date: dateLabel(next.due_date!, today) }), {
      undo: () => {
        engine.write('todos', { ...next, deleted_at: new Date().toISOString() })
        engine.write('todos', { ...todo })
      },
    })
  }

  function remove(todo: Todo) {
    engine.write('todos', { ...todo, deleted_at: new Date().toISOString() })
    setEditing(null)
    toast(t('todos.deleted', { title: todo.title }), { undo: () => engine.write('todos', { ...todo, deleted_at: null }) })
  }

  return (
    <>
      <Header
        title={t('todos.title')}
        right={
          <button className="icon-button" onClick={() => setEditing('new')} aria-label={t('todos.new')}>
            <Icon name="plus" />
          </button>
        }
      />
      <main className="content">
        <div className="segmented" role="tablist">
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {t(`todos.${v}`)}
              {counts[v] > 0 && <span className="count">{counts[v]}</span>}
            </button>
          ))}
        </div>

        <form className="add-bar top" onSubmit={quickAdd}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(view === 'today' ? 'todos.addToday' : 'todos.add')}
            enterKeyHint="enter"
            autoCapitalize="sentences"
          />
          <button className="icon-button primary" aria-label={t('common.add')} disabled={!title.trim()}>
            <Icon name="plus" />
          </button>
        </form>

        {visible.length === 0 && <p className="empty">{t(view === 'today' ? 'todos.emptyToday' : 'todos.empty')}</p>}

        <ul className="items">
          {visible.map((todo) => (
            <TodoRow key={todo.id} todo={todo} today={today} members={members} onToggle={complete} onOpen={setEditing} dateLabel={dateLabel} />
          ))}
        </ul>

        {view === 'all' && done.length > 0 && (
          <>
            <div className="section-head">
              <button className="link" onClick={() => setShowDone(!showDone)}>
                {t('todos.done', { count: done.length })} {showDone ? '▾' : '▸'}
              </button>
            </div>
            {showDone && (
              <ul className="items done">
                {done.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} today={today} members={members} onToggle={complete} onOpen={setEditing} dateLabel={dateLabel} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {editing && (
        <TodoEditor
          todo={editing === 'new' ? blank() : editing}
          isNew={editing === 'new'}
          members={members}
          myId={profile.id}
          onClose={() => setEditing(null)}
          onSave={(todo) => {
            engine.write('todos', todo)
            setEditing(null)
          }}
          onDelete={remove}
        />
      )}
    </>
  )
}

function useRepeatLabel() {
  const { t } = useI18n()
  return (unit: RepeatUnit, n: number) => (n === 1 ? t(`todos.repeatOne.${unit}`) : t(`todos.repeatLabel.${unit}`, { n }))
}

function TodoRow({
  todo,
  today,
  members,
  onToggle,
  onOpen,
  dateLabel,
}: {
  todo: Todo
  today: string
  members: Profile[]
  onToggle: (t: Todo) => void
  onOpen: (t: Todo) => void
  dateLabel: (iso: string, today: string) => string
}) {
  const { t } = useI18n()
  const repeatLabel = useRepeatLabel()
  const overdue = !todo.done && todo.due_date !== null && todo.due_date < today
  const assignee = members.find((m) => m.id === todo.assignee)
  return (
    <li className="item">
      <button className={`check round ${todo.done ? 'on' : ''}`} onClick={() => onToggle(todo)} aria-pressed={todo.done} aria-label={todo.title}>
        {todo.done && <Icon name="check" size={16} />}
      </button>
      <button className="item-body column" onClick={() => onOpen(todo)}>
        <span className="item-name">{todo.title}</span>
        {(todo.due_date || todo.repeat_unit) && (
          <span className={`meta ${overdue ? 'overdue' : ''}`}>
            {todo.due_date && (
              <>
                <Icon name="calendar" size={13} /> {overdue ? `${t('todos.overdue')} · ` : ''}
                {dateLabel(todo.due_date, today)}
              </>
            )}
            {todo.repeat_unit && (
              <>
                {' '}
                <Icon name="repeat" size={13} /> {repeatLabel(todo.repeat_unit, todo.repeat_every)}
              </>
            )}
          </span>
        )}
      </button>
      {assignee && <Avatar name={assignee.display_name} color={assignee.color} size={24} />}
    </li>
  )
}

function TodoEditor({
  todo,
  isNew,
  members,
  myId,
  onClose,
  onSave,
  onDelete,
}: {
  todo: Todo
  isNew: boolean
  members: Profile[]
  myId: string
  onClose: () => void
  onSave: (t: Todo) => void
  onDelete: (t: Todo) => void
}) {
  const { t } = useI18n()
  const repeatLabel = useRepeatLabel()
  const [draft, setDraft] = useState(todo)
  const update = (patch: Partial<Todo>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Sheet onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.title.trim()) onSave({ ...draft, title: draft.title.trim(), notes: draft.notes?.trim() || null })
        }}
      >
        <h2>{t(isNew ? 'todos.new' : 'todos.edit')}</h2>
        <input
          className="big"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t('todos.fieldTitle')}
          required
          autoFocus={isNew}
        />

        <label>
          {t('todos.fieldDue')}
          <div className="row">
            <input type="date" value={draft.due_date ?? ''} onChange={(e) => update({ due_date: e.target.value || null })} />
            {draft.due_date && (
              <button type="button" className="link" onClick={() => update({ due_date: null })}>
                {t('todos.clearDate')}
              </button>
            )}
          </div>
        </label>

        <div className="field">
          <span>{t('todos.fieldAssignee')}</span>
          <div className="segmented">
            <button type="button" className={draft.assignee === null ? 'active' : ''} onClick={() => update({ assignee: null })}>
              {t('todos.both')}
            </button>
            {[...members]
              .sort((a, b) => Number(b.id === myId) - Number(a.id === myId))
              .map((m) => (
                <button key={m.id} type="button" className={draft.assignee === m.id ? 'active' : ''} onClick={() => update({ assignee: m.id })}>
                  <Avatar name={m.display_name} color={m.color} size={18} /> {m.display_name}
                </button>
              ))}
          </div>
        </div>

        <label>
          {t('todos.fieldRepeat')}
          <div className="row">
            <select
              value={draft.repeat_unit ?? ''}
              onChange={(e) => update({ repeat_unit: (e.target.value || null) as RepeatUnit | null })}
            >
              <option value="">{t('todos.repeatNone')}</option>
              {(['day', 'week', 'month', 'year'] as const).map((u) => (
                <option key={u} value={u}>
                  {repeatLabel(u, draft.repeat_every)}
                </option>
              ))}
            </select>
            {draft.repeat_unit && (
              <input
                type="number"
                min={1}
                max={365}
                className="narrow"
                value={draft.repeat_every}
                onChange={(e) => update({ repeat_every: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                aria-label={t('todos.repeatEvery')}
              />
            )}
          </div>
        </label>

        <label>
          {t('todos.fieldNotes')}
          <textarea rows={3} value={draft.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} />
        </label>

        <div className="row-between">
          {!isNew ? (
            <button type="button" className="danger" onClick={() => onDelete(todo)}>
              <Icon name="trash" size={18} /> {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="primary">{t('common.save')}</button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}
