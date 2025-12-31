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
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">ChromaStudy</p>
        <h1 className="display-font text-2xl font-semibold text-slate-900">欢迎回来</h1>
        <p className="text-sm text-slate-500">本地离线使用，数据存储在浏览器中</p>
      </header>

      <Card title="登录" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
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
          <Button block color="primary" size="large" loading={loading} onClick={handleLogin}>
            {loading ? '登录中...' : '进入'}
          </Button>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>没有账号？</span>
            <button
              type="button"
              className="text-sky-600"
              onClick={() => navigate('/register')}
              disabled={loading}
            >
              去注册
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default Login
