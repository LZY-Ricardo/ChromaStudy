import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, DotLoading, TabBar } from 'antd-mobile'
import { CalendarDays, Home, MessageCircle, Settings as SettingsIcon } from 'lucide-react'
import Today from './pages/Today.jsx'
import Calendar from './pages/Calendar.jsx'
import Chat from './pages/Chat.jsx'
import Settings from './pages/Settings.jsx'
import { login } from './services/api.js'
import { loadUser, saveUser } from './utils/storage.js'

const tabs = [
  { key: '/', title: 'Today', icon: <Home size={18} /> },
  { key: '/calendar', title: 'Calendar', icon: <CalendarDays size={18} /> },
  { key: '/chat', title: 'Coach', icon: <MessageCircle size={18} /> },
  { key: '/settings', title: 'Settings', icon: <SettingsIcon size={18} /> },
]

function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = tabs.find((tab) => tab.key === location.pathname)?.key ?? '/'
  const bootstrappedRef = useRef(false)
  const [user, setUser] = useState(() => loadUser())
  const [status, setStatus] = useState(user?.id ? 'ready' : 'loading')
  const [error, setError] = useState('')

  const bootstrapUser = async () => {
    try {
      setStatus('loading')
      setError('')
      const profile = await login('demo', 'demo')
      saveUser(profile)
      setUser(profile)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError('无法连接后端服务，请确认后端已启动。')
    }
  }

  useEffect(() => {
    if (user?.id) {
      setStatus('ready')
      return
    }
    if (bootstrappedRef.current) {
      return
    }
    bootstrappedRef.current = true
    setStatus('loading')
    bootstrapUser()
  }, [user])

  if (status === 'loading') {
    return (
      <div className="app-shell">
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>正在初始化学习空间</span>
            <DotLoading color="primary" />
          </div>
        </Card>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-shell">
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="space-y-3 text-sm text-slate-600">
            <p className="text-base font-semibold text-slate-900">连接失败</p>
            <p>{error}</p>
            <Button color="primary" onClick={() => bootstrapUser()}>
              重试连接
            </Button>
          </div>
        </Card>
      </div>
    )
  }

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
          <Route path="/chat" element={<Chat user={user} />} />
          <Route path="/settings" element={<Settings user={user} />} />
        </Routes>
      </main>

      <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-[env(safe-area-inset-bottom)]">
        <div className="w-full max-w-[430px] bg-white/95 px-6 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <TabBar activeKey={activeKey} onChange={(key) => navigate(key)}>
            {tabs.map((tab) => (
              <TabBar.Item key={tab.key} icon={tab.icon} title={tab.title} />
            ))}
          </TabBar>
        </div>
      </div>
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
