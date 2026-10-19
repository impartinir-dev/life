import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { TabBar } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { DataProvider } from './data/DataProvider'
import { I18nProvider } from './i18n'
import { isConfigured } from './lib/supabase'
import { Login, NotConfigured, PasswordRecovery } from './screens/Auth'
import { ListDetailScreen, ListsScreen } from './screens/Lists'
import { Onboarding } from './screens/Onboarding'
import { SettingsScreen } from './screens/Settings'
import { TodosScreen } from './screens/Todos'

function Shell() {
  const { status, household } = useAuth()

  if (status === 'loading') return <div className="splash" aria-busy="true" />
  if (status === 'signedOut') return <Login />
  if (status === 'recovery') return <PasswordRecovery />
  if (status === 'noHousehold' || !household) return <Onboarding />

  return (
    // Keyed by household so switching households never mixes their data.
    <DataProvider householdId={household.id} key={household.id}>
      <HashRouter>
        <div className="app">
          <Routes>
            <Route path="/lists" element={<ListsScreen />} />
            <Route path="/lists/:id" element={<ListDetailScreen />} />
            <Route path="/todos" element={<TodosScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/lists" replace />} />
          </Routes>
          <TabBar />
        </div>
      </HashRouter>
    </DataProvider>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        {isConfigured ? (
          <AuthProvider>
            <Shell />
          </AuthProvider>
        ) : (
          <NotConfigured />
        )}
      </ToastProvider>
    </I18nProvider>
  )
}
