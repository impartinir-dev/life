import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'

interface ToastOptions {
  /** Shows an "Undo" button that runs this. */
  undo?: () => void
}

type Show = (message: string, options?: ToastOptions) => void

const ToastContext = createContext<Show>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [toast, setToast] = useState<{ id: number; message: string; undo?: () => void } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = useCallback<Show>((message, options) => {
    clearTimeout(timer.current)
    const id = Date.now()
    setToast({ id, message, undo: options?.undo })
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), options?.undo ? 6000 : 3000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                className="toast-action"
                onClick={() => {
                  toast.undo?.()
                  setToast(null)
                }}
              >
                {t('common.undo')}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
