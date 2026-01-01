import { Button, Card, Input, Toast } from 'antd-mobile'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { register } from '../services/api.js'

function Register({ onRegistered }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    const u = username.trim()
    const p = password.trim()
    const c = confirmPassword.trim()

    if (!u) {
      Toast.show({ content: '请输入用户名' })
      return
    }
    if (u.length < 3 || u.length > 32) {
      Toast.show({ content: '用户名长度需为 3-32 个字符' })
      return
    }
    if (!p) {
      Toast.show({ content: '请输入密码' })
      return
    }
    if (p.length < 6) {
      Toast.show({ content: '密码至少 6 位' })
      return
    }
    if (!c) {
      Toast.show({ content: '请再次输入密码' })
      return
    }
    if (p !== c) {
      Toast.show({ content: '两次输入的密码不一致' })
      return
    }

    setLoading(true)
    try {
      const profile = await register(u, p)
      onRegistered?.(profile)
    } catch (error) {
      const message = error?.response?.data?.error
      Toast.show({ content: message ? `注册失败：${message}` : '注册失败，请稍后重试' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell space-y-4">
      {/* Hero Section */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">ChromaStudy</p>
        <h1 className="display-font text-2xl font-bold text-slate-900">
          开启学习之旅
        </h1>
        <p className="text-sm text-slate-500">
          创建账号，记录每一天的进步
        </p>
      </div>

      {/* Decorative Welcome Card */}
      <Card className="bento-card bento-card-success !border-0 !shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">创建新账号</p>
            <p className="text-xs text-white/70 truncate">只需几秒即可开始</p>
          </div>
        </div>
      </Card>

      {/* Register Form Card */}
      <Card className="bento-card">
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 pb-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">注册账号</p>
          </div>

          <div className="px-3 pb-3 space-y-3">
            <Input
              placeholder="用户名（3-32 个字符）"
              value={username}
              onChange={setUsername}
              clearable
              disabled={loading}
            />
            <Input
              type="password"
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={setPassword}
              clearable
              disabled={loading}
            />
            <Input
              type="password"
              placeholder="确认密码"
              value={confirmPassword}
              onChange={setConfirmPassword}
              clearable
              disabled={loading}
            />
            <Button
              block
              color="primary"
              size="large"
              loading={loading}
              onClick={handleRegister}
              className="!rounded-full"
            >
              {loading ? '注册中...' : '创建账号'}
            </Button>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>已有账号？</span>
              <button
                type="button"
                className="text-violet-600 font-medium transition-colors hover:text-violet-700"
                onClick={() => navigate('/login')}
                disabled={loading}
              >
                去登录
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tips Card */}
      <Card className="bento-card bento-card-compact !p-3">
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            注册后将获得登录会话，数据安全存储在本地
          </p>
        </div>
      </Card>
    </div>
  )
}

export default Register

