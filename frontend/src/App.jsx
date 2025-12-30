import { useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { TabBar } from 'antd-mobile'
import { BarChart3, CalendarDays, Home, MessageCircle, Settings as SettingsIcon } from 'lucide-react'
import Login from './pages/Login.jsx'
import Today from './pages/Today.jsx'
import Calendar from './pages/Calendar.jsx'
import Chat from './pages/Chat.jsx'
import Settings from './pages/Settings.jsx'
import DayDetail from './pages/DayDetail.jsx'
import Stats from './pages/Stats.jsx'
import Focus from './pages/Focus.jsx'
import { clearUser, loadUser, saveUser } from './utils/storage.js'

const tabs = [
  { key: '/', title: 'Today', icon: <Home size={18} /> },
  { key: '/calendar', title: 'Calendar', icon: <CalendarDays size={18} /> },
  { key: '/stats', title: 'Stats', icon: <BarChart3 size={18} /> },
  { key: '/chat', title: 'Coach', icon: <MessageCircle size={18} /> },
  { key: '/settings', title: 'Settings', icon: <SettingsIcon size={18} /> },
]

function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = tabs.find((tab) => tab.key === location.pathname)?.key ?? '/'
  const [user, setUser] = useState(() => loadUser())

  if (!user?.id) {
    return (
      <Login
        onLoggedIn={(profile) => {
          saveUser(profile)
          setUser(profile)
        }}
      />
    )
  }

  const logout = () => {
    clearUser()
    setUser(null)
  }

  const hideTabBar = location.pathname.startsWith('/day/') || location.pathname === '/focus'

  return (
    <div className="app-shell">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">ChromaStudy</p>
          <h1 className="display-font text-2xl font-semibold text-slate-900">
            Focus. Log. Level up.
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Local AI ready
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Today user={user} />} />
          <Route path="/calendar" element={<Calendar user={user} />} />
          <Route path="/stats" element={<Stats user={user} />} />
          <Route path="/chat" element={<Chat user={user} />} />
          <Route path="/settings" element={<Settings user={user} onLogout={logout} />} />
          <Route path="/day/:date" element={<DayDetail user={user} />} />
          <Route path="/focus" element={<Focus user={user} />} />
        </Routes>
      </main>

      {!hideTabBar ? (
        <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-[env(safe-area-inset-bottom)]">
          <div className="w-full max-w-[430px] bg-white/95 px-6 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <TabBar activeKey={activeKey} onChange={(key) => navigate(key)}>
              {tabs.map((tab) => (
                <TabBar.Item key={tab.key} icon={tab.icon} title={tab.title} />
              ))}
            </TabBar>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}

export default App
