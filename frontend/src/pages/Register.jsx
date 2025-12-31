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
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">ChromaStudy</p>
        <h1 className="display-font text-2xl font-semibold text-slate-900">创建账号</h1>
        <p className="text-sm text-slate-500">注册后将获得登录会话（JWT）</p>
      </header>

      <Card title="注册" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
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
          <Button block color="primary" size="large" loading={loading} onClick={handleRegister}>
            {loading ? '注册中...' : '创建账号'}
          </Button>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>已有账号？</span>
            <button
              type="button"
              className="text-sky-600"
              onClick={() => navigate('/login')}
              disabled={loading}
            >
              去登录
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default Register

