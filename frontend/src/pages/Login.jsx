import { useEffect, useState } from 'react'
import { Button, Card, Input, List, Toast } from 'antd-mobile'
import { getUsers, login } from '../services/api.js'

function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('demo')
  const [password, setPassword] = useState('demo')
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getUsers()
        setUsers(Array.isArray(data) ? data : [])
      } catch {
        setUsers([])
      }
    }
    load()
  }, [])

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
        <p className="text-sm text-slate-500">本地账号（无 token），用于区分数据。</p>
      </header>

      <Card title="登录 / 注册" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
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
          <p className="text-xs text-slate-400">
            若用户名不存在会自动创建（明文密码，仅本地自用）。
          </p>
        </div>
      </Card>

      {users.length > 0 ? (
        <Card
          title="本地已有用户"
          className="rounded-2xl border border-slate-100 bg-white shadow-sm"
        >
          <List>
            {users.map((user) => (
              <List.Item
                key={user.id}
                clickable
                onClick={() => {
                  setUsername(user.username)
                }}
              >
                {user.username}
              </List.Item>
            ))}
          </List>
        </Card>
      ) : null}
    </div>
  )
}

export default Login

