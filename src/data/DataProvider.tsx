import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { SyncEngine, type Snapshot } from './engine'

const EngineContext = createContext<SyncEngine | null>(null)

export function DataProvider({ householdId, children }: { householdId: string; children: ReactNode }) {
  const [engine] = useState(() => new SyncEngine(householdId))
  useEffect(() => {
    void engine.start()
    return () => engine.dispose()
  }, [engine])
  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
}

export function useEngine(): SyncEngine {
  const engine = useContext(EngineContext)
  if (!engine) throw new Error('useEngine outside DataProvider')
  return engine
}

export function useData(): Snapshot {
  const engine = useEngine()
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot)
}
