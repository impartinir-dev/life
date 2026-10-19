import { useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useData, useEngine } from '../data/DataProvider'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import { useToast } from './Toast'

export function SyncBadge() {
  const { t } = useI18n()
  const { status } = useData()
  const engine = useEngine()
  const toast = useToast()

  useEffect(() => {
    if (status.rejected) {
      toast(t('sync.rejected'))
      engine.clearRejected()
    }
  }, [status.rejected, engine, toast, t])

  if (!status.online) {
    return (
      <span className="sync-badge offline">
        <Icon name="cloudOff" size={14} />
        {status.pending ? t('sync.offlinePending', { count: status.pending }) : t('sync.offline')}
      </span>
    )
  }
  if (status.pending) return <span className="sync-badge">{t('sync.pending', { count: status.pending })}</span>
  return null
}

export function Header({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="header">
      <div className="header-side">{left}</div>
      <h1 className="header-title">{title}</h1>
      <div className="header-side right">
        <SyncBadge />
        {right}
      </div>
    </header>
  )
}

export function TabBar() {
  const { t } = useI18n()
  return (
    <nav className="tabbar">
      <NavLink to="/lists" className="tab">
        <Icon name="list" />
        <span>{t('tabs.lists')}</span>
      </NavLink>
      <NavLink to="/todos" className="tab">
        <Icon name="todo" />
        <span>{t('tabs.todos')}</span>
      </NavLink>
      <NavLink to="/settings" className="tab">
        <Icon name="more" />
        <span>{t('tabs.settings')}</span>
      </NavLink>
    </nav>
  )
}

/** Small coloured initial showing who added or owns something. */
export function Avatar({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.5 }} title={name}>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

export function BackButton({ to }: { to: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <button className="icon-button" onClick={() => navigate(to)} aria-label={t('common.back')}>
      <Icon name="back" />
    </button>
  )
}

/** Bottom sheet used for editors; tapping outside closes it. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
