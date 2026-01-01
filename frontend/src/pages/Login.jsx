import { Button, Card, Input, Toast } from 'antd-mobile'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/api.js'

function Login({ onLoggedIn }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    const u = username.trim()
    const p = password.trim()
    if (!u || !p) {
      Toast.show({ content: '请输入用户名和密码' })
      return
    }
    setLoading(true)
    try {
      const profile = await login(u, p)
      onLoggedIn?.(profile)
    } catch (error) {
      const message = error?.response?.data?.error
      Toast.show({ content: message ? `登录失败：${message}` : '登录失败，请稍后重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell space-y-4">
      {/* Hero Section with Bento-style decorative card */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">ChromaStudy</p>
        <h1 className="display-font text-2xl font-bold text-slate-900">
          Focus. Log. Level up.
        </h1>
        <p className="text-sm text-slate-500">
          记录学习时光，培养良好习惯
        </p>
      </div>

      {/* Decorative Welcome Card */}
      <Card className="bento-card bento-card-primary !border-0 !shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">欢迎回来</p>
            <p className="text-xs text-white/70 truncate">继续你的学习之旅</p>
          </div>
        </div>
      </Card>

      {/* Login Form Card */}
      <Card className="bento-card">
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 pb-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">登录账号</p>
          </div>

          <div className="px-3 pb-3 space-y-3">
            <Input
              placeholder="用户名"
              value={username}
              onChange={setUsername}
              clearable
              disabled={loading}
            />
            <Input
              type="password"
              placeholder="密码"
              value={password}
              onChange={setPassword}
              clearable
              disabled={loading}
            />
            <Button
              block
              color="primary"
              size="large"
              loading={loading}
              onClick={handleLogin}
              className="!rounded-full"
            >
              {loading ? '登录中...' : '进入'}
            </Button>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>没有账号？</span>
              <button
                type="button"
                className="text-violet-600 font-medium transition-colors hover:text-violet-700"
                onClick={() => navigate('/register')}
                disabled={loading}
              >
                去注册
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tips Card */}
      <Card className="bento-card bento-card-compact !p-3">
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            数据存储在本地浏览器中，支持离线使用，可随时导出备份
          </p>
        </div>
      </Card>
    </div>
  )
}

export default Login
