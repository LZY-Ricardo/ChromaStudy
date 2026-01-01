import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ActionSheet, TabBar, Toast } from 'antd-mobile'
import { BarChart3, CalendarDays, Home, MessageCircle, Settings as SettingsIcon } from 'lucide-react'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Today from './pages/Today.jsx'
import Calendar from './pages/Calendar.jsx'
import Chat from './pages/Chat.jsx'
import Settings from './pages/Settings.jsx'
import DayDetail from './pages/DayDetail.jsx'
import Stats from './pages/Stats.jsx'
import Focus from './pages/Focus.jsx'
import Review from './pages/Review.jsx'
import {
  loadAiConfig,
  loadAiState,
  setActiveAiProfile,
} from './utils/storage.js'
import { syncPendingOps, getMe, logout as apiLogout } from './services/api.js'
import { getPendingOpsCount } from './utils/syncQueue.js'
import { detectOpenAiCompatPresetId, getOpenAiCompatPreset } from './utils/aiPresets.js'
import { loadAuthedUser } from './utils/authStorage.js'

const tabs = [
  { key: '/', title: 'Today', icon: <Home size={18} /> },
  { key: '/calendar', title: 'Calendar', icon: <CalendarDays size={18} /> },
  { key: '/stats', title: 'Stats', icon: <BarChart3 size={18} /> },
  { key: '/chat', title: 'Mate', icon: <MessageCircle size={18} /> },
  { key: '/settings', title: 'Settings', icon: <SettingsIcon size={18} /> },
]

function Shell({ user, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = tabs.find((tab) => tab.key === location.pathname)?.key ?? '/'
  const [aiState, setAiState] = useState(() => loadAiState())
  const [aiConfig, setAiConfig] = useState(() => loadAiConfig())
  const [syncTick, setSyncTick] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const [lastSync, setLastSync] = useState(null)

  const logout = useCallback(async () => {
    try {
      await onLogout?.()
    } finally {
      navigate('/login', { replace: true })
    }
  }, [navigate, onLogout])

  const runSync = useCallback(
    async (reason = 'manual') => {
      const userId = user?.id
      if (!userId) return null
      if (syncingRef.current) return null

      const pending = getPendingOpsCount(userId)
      if (pending === 0 && reason !== 'startup') {
        return {
          ok: true,
          processed: 0,
          succeeded: 0,
          failed: 0,
          blocked: null,
          blockedOp: null,
          blockedError: '',
        }
      }

      syncingRef.current = true
      setSyncing(true)
      try {
        const result = await syncPendingOps(userId)
        setLastSync({ at: Date.now(), ...result })

        if (result.succeeded > 0) {
          setSyncTick(Date.now())
        }

        if (result.processed > 0) {
          const suffix =
            result.blocked === 'conflict'
              ? '（已暂停：冲突）'
              : result.blocked === 'network'
                ? '（已暂停：网络）'
                : ''
          Toast.show({
            content: `已同步 ${result.succeeded}/${result.processed}，失败 ${result.failed}${suffix}`,
          })
        } else if (pending > 0 && result.blocked === 'network' && reason === 'manual') {
          Toast.show({ content: '当前网络不可用，待同步更改已保留' })
        }

        return result
      } catch {
        Toast.show({ content: '同步失败，请稍后重试' })
        return null
      } finally {
        syncingRef.current = false
        setSyncing(false)
      }
    },
    [user?.id]
  )

  useEffect(() => {
    if (!user?.id) return
    runSync('startup')
  }, [runSync, user?.id])

  useEffect(() => {
    const handler = () => {
      setAiState(loadAiState())
      setAiConfig(loadAiConfig())
    }
    window.addEventListener('chroma_ai_changed', handler)
    return () => window.removeEventListener('chroma_ai_changed', handler)
  }, [])

  useEffect(() => {
    if (!user?.id) return undefined
    const handler = () => runSync('online')
    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [runSync, user?.id])

  const hideTabBar =
    location.pathname.startsWith('/day/') ||
    location.pathname === '/focus' ||
    location.pathname.startsWith('/review')

  const shellClassName = hideTabBar ? 'app-shell app-shell--no-tabbar' : 'app-shell app-shell--tabbar'

  const activeAiProfile =
    aiState?.profiles?.find((profile) => profile.id === aiState.activeProfileId) ??
    aiState?.profiles?.[0] ??
    null

  const aiProvider = aiConfig?.provider ?? null
  const aiModel =
    aiProvider === 'openai'
      ? aiConfig?.openai?.model
      : aiProvider === 'ollama'
        ? aiConfig?.ollama?.model
        : ''

  let aiVendorLabel = 'AI'
  if (aiProvider === 'openai') {
    const presetId =
      aiConfig?.openai?.presetId || detectOpenAiCompatPresetId(aiConfig?.openai?.baseUrl)
    const preset = getOpenAiCompatPreset(presetId)
    aiVendorLabel = preset?.label || '云端'
  } else if (aiProvider === 'ollama') {
    aiVendorLabel = 'Ollama'
  }

  const aiPillTitle = activeAiProfile?.name || aiVendorLabel
  const aiPillLabel = aiProvider ? (aiModel ? `${aiPillTitle} · ${aiModel}` : aiPillTitle) : 'AI 未配置'
  const aiDotClass = activeAiProfile?.health?.at
    ? activeAiProfile.health.ok
      ? 'bg-emerald-400'
      : 'bg-rose-400'
    : 'bg-slate-300'
  const aiHealthy = Boolean(activeAiProfile?.health?.at && activeAiProfile.health.ok)

  const formatProfileDescription = (profile) => {
    if (!profile) return ''
    if (profile.provider === 'openai') {
      const presetId =
        profile?.openai?.presetId || detectOpenAiCompatPresetId(profile?.openai?.baseUrl)
      const preset = getOpenAiCompatPreset(presetId)
      const vendor = preset?.label || '云端'
      const model = profile?.openai?.model || '-'
      return `${vendor} · ${model}`
    }
    const model = profile?.ollama?.model || '-'
    return `Ollama · ${model}`
  }

  const openAiSwitcher = () => {
    const state = loadAiState() ?? aiState
    if (!state?.profiles?.length) {
      navigate('/settings')
      return
    }

    const actions = [
      ...state.profiles.map((profile) => ({
        key: profile.id,
        text: profile.name || profile.id,
        description: formatProfileDescription(profile),
        bold: profile.id === state.activeProfileId,
        onClick: () => {
          const ok = setActiveAiProfile(profile.id)
          if (ok) {
            Toast.show({ content: `已切换到：${profile.name || profile.id}` })
          } else {
            Toast.show({ content: '切换失败' })
          }
        },
      })),
      {
        key: '__settings',
        text: '管理 AI 设置',
        onClick: () => navigate('/settings'),
      },
    ]

    ActionSheet.show({
      actions,
      cancelText: '取消',
      closeOnAction: true,
    })
  }

  return (
    <div className={shellClassName}>
      {/* Bento-style Header */}
      <header className="bento-card bento-card-compact p-3">
        <div className="flex items-center justify-between">
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">ChromaStudy</p>
            <h1 className="display-font text-lg font-bold text-slate-900">
              Focus. Log. Level up.
            </h1>
          </div>
          <button
            type="button"
            className="icon-btn !w-auto !rounded-full px-3 gap-2 !text-xs"
            onClick={openAiSwitcher}
          >
            <span className="relative flex h-2 w-2 flex-shrink-0">
              {aiHealthy ? (
                <span
                  className={`absolute inline-flex h-full w-full rounded-full ${aiDotClass} opacity-60 animate-ping motion-reduce:animate-none`}
                />
              ) : null}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${aiDotClass}`} />
            </span>
            <span className="truncate">{aiPillLabel}</span>
          </button>
        </div>
      </header>

      <main className="app-main flex-1 min-h-0">
        <Routes>
          <Route path="/" element={<Today user={user} syncTick={syncTick} />} />
          <Route path="/calendar" element={<Calendar user={user} syncTick={syncTick} />} />
          <Route path="/stats" element={<Stats user={user} syncTick={syncTick} />} />
          <Route path="/chat" element={<Chat user={user} />} />
          <Route
            path="/settings"
            element={
              <Settings
                user={user}
                onLogout={logout}
                syncTick={syncTick}
                syncing={syncing}
                lastSync={lastSync}
                onSyncNow={() => runSync('manual')}
              />
            }
          />
          <Route path="/day/:date" element={<DayDetail user={user} syncTick={syncTick} />} />
          <Route path="/focus" element={<Focus user={user} syncTick={syncTick} />} />
          <Route path="/review" element={<Review user={user} syncTick={syncTick} />} />
        </Routes>
      </main>

      {!hideTabBar ? (
        <div className="fixed bottom-0 left-0 right-0 flex justify-center pb-[env(safe-area-inset-bottom)]">
          <div className="w-full max-w-107.5 bg-white/90 px-4 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md border-t border-slate-100/50">
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

function RequireAuth({ user, children }) {
  const location = useLocation()
  if (user?.id) return children
  return <Navigate to="/login" replace state={{ from: location }} />
}

function App() {
  const [user, setUser] = useState(() => loadAuthedUser())

  useEffect(() => {
    const handler = () => setUser(loadAuthedUser())
    window.addEventListener('chroma_auth_changed', handler)
    return () => window.removeEventListener('chroma_auth_changed', handler)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const bootstrap = async () => {
      try {
        const me = await getMe()
        if (!cancelled && me?.id) {
          setUser(me)
        }
      } catch {
        // ignore (interceptor will clear auth on refresh failure)
      }
    }
    bootstrap()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user?.id ? (
              <Navigate to="/" replace />
            ) : (
              <Login
                onLoggedIn={(profile) => {
                  setUser(profile)
                }}
              />
            )
          }
        />
        <Route
          path="/register"
          element={
            user?.id ? (
              <Navigate to="/" replace />
            ) : (
              <Register
                onRegistered={(profile) => {
                  setUser(profile)
                }}
              />
            )
          }
        />
        <Route
          path="/*"
          element={
            <RequireAuth user={user}>
              <Shell user={user} onLogout={handleLogout} />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
