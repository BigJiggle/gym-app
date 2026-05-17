import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useUserStore } from './store/userStore'
import { useSettingsStore } from './store/settingsStore'
import AppShell from './components/Layout/AppShell'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Training from './pages/Training'
import Diet from './pages/Diet'
import CheckIn from './pages/CheckIn'
import Progress from './pages/Progress'
import Settings from './pages/Settings'
import Education from './pages/Education'

function AppRoutes() {
  const { user, loading } = useUserStore()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/training" element={<Training />} />
        <Route path="/diet" element={<Diet />} />
        <Route path="/checkin" element={<CheckIn />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/education" element={<Education />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  const { loadUser } = useUserStore()
  const { loadSettings } = useSettingsStore()

  useEffect(() => {
    loadSettings()
    loadUser()
  }, [])

  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
