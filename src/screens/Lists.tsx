import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useHousehold } from '../auth/AuthProvider'
import { Avatar, BackButton, Header, Sheet } from '../components/Layout'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { useData, useEngine } from '../data/DataProvider'
import type { List, ListItem } from '../data/types'
import { useI18n } from '../i18n'
import { parseItemInput, rankSuggestions } from '../lib/suggest'

const now = () => new Date().toISOString()

export function ListsScreen() {
  const { t } = useI18n()
  const { profile } = useHousehold()
  const { lists, list_items, loaded } = useData()
  const engine = useEngine()
  const navigate = useNavigate()
  const [name, setName] = useState('')

  const sorted = useMemo(() => [...lists].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [lists])
  const openCount = (id: string) => list_items.filter((i) => i.list_id === id && !i.checked).length

  function create(listName: string) {
    const list: List = { ...engine.newRow(profile.id), name: listName.trim(), position: lists.length }
    engine.write('lists', list)
    return list
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    create(name)
    setName('')
  }

  return (
    <>
      <Header title={t('lists.title')} />
      <main className="content">
        <ul className="card-list">
          {sorted.map((list) => {
            const open = openCount(list.id)
            return (
              <li key={list.id}>
                <Link to={`/lists/${list.id}`} className="list-link">
                  <span className="list-name">{list.name}</span>
                  <span className={open ? 'pill' : 'muted small'}>{open ? t('lists.open', { count: open }) : t('lists.allDone')}</span>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            )
          })}
        </ul>

        {loaded && lists.length === 0 && (
          <div className="empty">
            <p>{t('lists.empty')}</p>
            <button className="primary" onClick={() => navigate(`/lists/${create(t('lists.starterName')).id}`)}>
              {t('lists.starter')}
            </button>
          </div>
        )}

        <form className="add-bar" onSubmit={submit}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('lists.new')} enterKeyHint="done" />
          <button className="icon-button primary" aria-label={t('common.add')} disabled={!name.trim()}>
            <Icon name="plus" />
          </button>
        </form>
      </main>
    </>
  )
}

export function ListDetailScreen() {
  const { id } = useParams()
  const { t } = useI18n()
  const { profile, members } = useHousehold()
  const { lists, list_items, history } = useData()
  const engine = useEngine()
  const toast = useToast()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<ListItem | null>(null)

  const list = lists.find((l) => l.id === id)
  const items = useMemo(() => list_items.filter((i) => i.list_id === id), [list_items, id])
  const open = items.filter((i) => !i.checked).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const done = items.filter((i) => i.checked).sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''))
  const suggestions = useMemo(
    () => rankSuggestions(history, parseItemInput(text).name, open.map((i) => i.name)),
    [history, text, open],
  )

  if (!list) {
    return (
      <>
        <Header title="" left={<BackButton to="/lists" />} />
        <main className="content">
          <p className="empty">{t('lists.notFound')}</p>
        </main>
      </>
    )
  }

  function add(input: string) {
    const { name, quantity } = parseItemInput(input)
    if (!name) return
    // Re-adding something that's already checked off just un-checks it.
    const existing = done.find((i) => i.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      engine.write('list_items', { ...existing, checked: false, checked_at: null, quantity: quantity ?? existing.quantity })
    } else {
      engine.write('list_items', {
        ...engine.newRow(profile.id),
        list_id: list!.id,
        name,
        quantity,
        checked: false,
        checked_at: null,
      })
    }
    setText('')
  }

  function toggle(item: ListItem) {
    engine.write('list_items', { ...item, checked: !item.checked, checked_at: item.checked ? null : now() })
  }

  function remove(item: ListItem) {
    engine.write('list_items', { ...item, deleted_at: now() })
    toast(t('lists.itemDeleted', { name: item.name }), { undo: () => engine.write('list_items', { ...item, deleted_at: null }) })
  }

  function clearDone() {
    const cleared = done
    const stamp = now()
    cleared.forEach((i) => engine.write('list_items', { ...i, deleted_at: stamp }))
    toast(t('lists.cleared', { count: cleared.length }), {
      undo: () => cleared.forEach((i) => engine.write('list_items', { ...i, deleted_at: null })),
    })
  }

  function rename() {
    const name = window.prompt(t('common.rename'), list!.name)?.trim()
    if (name) engine.write('lists', { ...list!, name })
  }

  function deleteList() {
    if (!window.confirm(t('lists.deleteConfirm', { name: list!.name }))) return
    const snapshot = list!
    engine.write('lists', { ...snapshot, deleted_at: now() })
    navigate('/lists')
    toast(t('lists.listDeleted', { name: snapshot.name }), { undo: () => engine.write('lists', { ...snapshot, deleted_at: null }) })
  }

  const member = (uid: string | null) => members.find((m) => m.id === uid)

  return (
    <>
      <Header
        title={list.name}
        left={<BackButton to="/lists" />}
        right={
          <>
            <button className="icon-button" onClick={rename} aria-label={t('common.rename')}>
              <Icon name="edit" size={20} />
            </button>
            <button className="icon-button" onClick={deleteList} aria-label={t('lists.deleteList')}>
              <Icon name="trash" size={20} />
            </button>
          </>
        }
      />
      <main className="content">
        <form
          className="add-bar top"
          onSubmit={(e) => {
            e.preventDefault()
            add(text)
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('lists.addItem')}
            enterKeyHint="enter"
            autoCapitalize="sentences"
          />
          <button className="icon-button primary" aria-label={t('common.add')} disabled={!text.trim()}>
            <Icon name="plus" />
          </button>
        </form>
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map((s) => {
              const { quantity } = parseItemInput(text)
              return (
                <button key={s} className="chip" onClick={() => add(quantity ? `${quantity}x ${s}` : s)}>
                  {s}
                </button>
              )
            })}
          </div>
        )}

        {open.length === 0 && done.length === 0 && <p className="empty">{t('lists.emptyList')}</p>}

        <ul className="items">
          {open.map((item) => (
            <ItemRow key={item.id} item={item} by={member(item.created_by)} onToggle={toggle} onRemove={remove} onEdit={setEditing} />
          ))}
        </ul>

        {done.length > 0 && (
          <>
            <div className="section-head">
              <span>{t('lists.inCart', { count: done.length })}</span>
              <button className="link" onClick={clearDone}>
                {t('lists.clear')}
              </button>
            </div>
            <ul className="items done">
              {done.map((item) => (
                <ItemRow key={item.id} item={item} by={member(item.created_by)} onToggle={toggle} onRemove={remove} onEdit={setEditing} />
              ))}
            </ul>
          </>
        )}
      </main>
      {editing && (
        <ItemEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            engine.write('list_items', item)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function ItemRow({
  item,
  by,
  onToggle,
  onRemove,
  onEdit,
}: {
  item: ListItem
  by?: { display_name: string; color: string }
  onToggle: (i: ListItem) => void
  onRemove: (i: ListItem) => void
  onEdit: (i: ListItem) => void
}) {
  const { t } = useI18n()
  return (
    <li className="item">
      <button className={`check ${item.checked ? 'on' : ''}`} onClick={() => onToggle(item)} aria-pressed={item.checked} aria-label={item.name}>
        {item.checked && <Icon name="check" size={16} />}
      </button>
      <button className="item-body" onClick={() => onEdit(item)}>
        <span className="item-name">{item.name}</span>
        {item.quantity && <span className="qty">{item.quantity}×</span>}
      </button>
      {by && (
        <span title={t('lists.addedBy', { name: by.display_name })}>
          <Avatar name={by.display_name} color={by.color} size={20} />
        </span>
      )}
      <button className="icon-button subtle" onClick={() => onRemove(item)} aria-label={t('common.delete')}>
        <Icon name="close" size={18} />
      </button>
    </li>
  )
}

function ItemEditor({ item, onClose, onSave }: { item: ListItem; onClose: () => void; onSave: (i: ListItem) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  return (
    <Sheet onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSave({ ...item, name: name.trim(), quantity: quantity.trim() || null })
        }}
      >
        <label>
          {t('lists.itemName')}
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          {t('lists.quantity')}
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="text" />
        </label>
        <div className="row-end">
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary">{t('common.save')}</button>
        </div>
      </form>
    </Sheet>
  )
}
