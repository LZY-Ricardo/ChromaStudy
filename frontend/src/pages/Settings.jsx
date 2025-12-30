import { useMemo, useState } from 'react'
import { Button, Card, Dialog, Input, List, Selector, Toast } from 'antd-mobile'
import { loadAiConfig, saveAiConfig } from '../utils/storage.js'
import { loadWeeklyGoal, saveWeeklyGoal } from '../utils/habit.js'
import { clearPendingOps, getPendingOpsCount } from '../utils/syncQueue.js'

const defaultAiConfig = {
  provider: 'ollama',
  ollama: {
    host: 'http://localhost:11434',
    model: 'llama3',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
  },
}

function Settings({ user, onLogout, syncing, lastSync, onSyncNow }) {
  const stored = useMemo(() => loadAiConfig(), [])

  const [provider, setProvider] = useState(stored?.provider ?? defaultAiConfig.provider)
  const [ollamaHost, setOllamaHost] = useState(
    stored?.ollama?.host ?? defaultAiConfig.ollama.host
  )
  const [ollamaModel, setOllamaModel] = useState(
    stored?.ollama?.model ?? defaultAiConfig.ollama.model
  )
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(
    stored?.openai?.baseUrl ?? defaultAiConfig.openai.baseUrl
  )
  const [openaiModel, setOpenaiModel] = useState(
    stored?.openai?.model ?? defaultAiConfig.openai.model
  )
  const [openaiApiKey, setOpenaiApiKey] = useState(stored?.openai?.apiKey ?? '')
  const [weeklyGoal, setWeeklyGoal] = useState(() => loadWeeklyGoal(user?.id))
  const pendingCount = getPendingOpsCount(user?.id)
  let lastSyncLabel = ''
  if (lastSync?.at) {
    try {
      lastSyncLabel = new Date(lastSync.at).toLocaleString()
    } catch {
      lastSyncLabel = ''
    }
  }

  const clearQueue = async () => {
    if (!user?.id) return
    if (pendingCount <= 0) return

    const confirmed = await Dialog.confirm({
      title: '丢弃未同步更改',
      content: '这会清空待同步队列，离线期间的新增/编辑/删除将不会再同步到服务器。',
      confirmText: '确认丢弃',
    })

    if (!confirmed) return
    clearPendingOps(user.id)
    Toast.show({ content: '已清空待同步队列' })
  }

  const exportLocalData = () => {
    if (typeof window === 'undefined') return
    if (!user?.id) return

    const safeParse = (raw) => {
      try {
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }

    const copy = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value)

    const aiConfig = copy(loadAiConfig())
    if (aiConfig?.openai && typeof aiConfig.openai === 'object') {
      aiConfig.openai.apiKey = ''
    }

    const userId = user.id
    const tasksCacheKey = `chroma_cache_tasks_${userId}`
    const logsCacheKey = `chroma_cache_studyLogs_${userId}`
    const weeklyGoalKey = `chroma_weekly_goal_${userId}`
    const taskOrderKey = `chroma_task_order_${userId}`
    const queueKey = 'chroma_sync_queue_v1'
    const reviewPrefix = `chroma_review_${userId}_`

    const reviews = {}
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (!key || !key.startsWith(reviewPrefix)) continue
        const date = key.slice(reviewPrefix.length)
        reviews[date] = safeParse(window.localStorage.getItem(key))
      }
    } catch {
      // ignore
    }

    const rawQueue = safeParse(window.localStorage.getItem(queueKey))
    const pendingOps = Array.isArray(rawQueue) ? rawQueue.filter((op) => op?.userId === userId) : []

    const payload = {
      app: 'ChromaStudy',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { id: userId, username: user?.username ?? '' },
      data: {
        aiConfig,
        weeklyGoal: window.localStorage.getItem(weeklyGoalKey) ?? null,
        taskOrder: safeParse(window.localStorage.getItem(taskOrderKey)),
        caches: {
          tasks: safeParse(window.localStorage.getItem(tasksCacheKey)),
          studyLogs: safeParse(window.localStorage.getItem(logsCacheKey)),
        },
        pendingOps,
        reviews,
      },
      notes: {
        openaiApiKeyExported: false,
      },
    }

    const filenameSafeTime = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `chromastudy-backup-u${userId}-${filenameSafeTime}.json`

    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      Toast.show({ content: '已导出本地数据' })
    } catch {
      Toast.show({ content: '导出失败' })
    }
  }

  const persist = () => {
    const config = {
      provider,
      ollama: {
        host: ollamaHost.trim(),
        model: ollamaModel.trim(),
      },
      openai: {
        baseUrl: openaiBaseUrl.trim().replace(/\/+$/, ''),
        model: openaiModel.trim(),
        apiKey: openaiApiKey.trim(),
      },
    }

    if (config.provider === 'openai') {
      if (!config.openai.baseUrl || !config.openai.model || !config.openai.apiKey) {
        Toast.show({ content: '请补全 Base URL / Model / API Key' })
        return
      }
    }

    if (config.provider === 'ollama') {
      if (!config.ollama.host || !config.ollama.model) {
        Toast.show({ content: '请补全 Ollama Host / Model' })
        return
      }
    }

    saveAiConfig(config)
    Toast.show({ content: '设置已保存' })
  }

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      Toast.show({ content: '当前环境不支持通知' })
      return
    }
    const result = await window.Notification.requestPermission()
    Toast.show({ content: result === 'granted' ? '通知已开启' : '通知未授权' })
  }

  const sendTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      Toast.show({ content: '当前环境不支持通知' })
      return
    }
    if (window.Notification.permission !== 'granted') {
      Toast.show({ content: '请先开启通知权限' })
      return
    }

    const payload = {
      body: '测试提醒：今天也要稳稳推进。',
      icon: '/icons/icon-192.png',
    }

    try {
      const registration = await navigator.serviceWorker?.getRegistration?.()
      if (registration?.showNotification) {
        await registration.showNotification('ChromaStudy', payload)
        return
      }
    } catch {
      // ignore and fallback
    }

    try {
      new window.Notification('ChromaStudy', payload)
    } catch {
      Toast.show({ content: '通知发送失败' })
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Profile" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">用户：{user?.username ?? 'unknown'}</p>
          <Button
            block
            color="warning"
            fill="outline"
            onClick={() => {
              onLogout?.()
              Toast.show({ content: '已退出登录' })
            }}
          >
            退出登录 / 切换账号
          </Button>
        </div>
      </Card>

      <Card title="Sync" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
          <div className="text-sm text-slate-600">
            待同步：{pendingCount} 项
            {typeof navigator !== 'undefined' && !navigator.onLine ? '（离线）' : ''}
          </div>
          {lastSync ? (
            <p className="text-xs text-slate-400">
              上次同步：{lastSyncLabel || '未知'} · 成功 {lastSync.succeeded}/{lastSync.processed} · 失败{' '}
              {lastSync.failed}
            </p>
          ) : (
            <p className="text-xs text-slate-400">尚未执行过同步</p>
          )}

          <Button
            block
            color="primary"
            disabled={syncing || pendingCount <= 0}
            onClick={() => onSyncNow?.()}
          >
            {syncing ? '同步中...' : pendingCount > 0 ? '立即同步' : '暂无待同步'}
          </Button>
          <Button
            block
            fill="outline"
            color="warning"
            disabled={syncing || pendingCount <= 0}
            onClick={clearQueue}
          >
            丢弃未同步更改
          </Button>
        </div>
      </Card>

      <Card
        title="Habit"
        className="rounded-2xl border border-slate-100 bg-white shadow-sm"
      >
        <List>
          <List.Item>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="周目标分钟数（默认 300）"
              value={String(weeklyGoal ?? '')}
              onChange={(value) => setWeeklyGoal(value)}
              clearable
            />
          </List.Item>
        </List>
        <div className="mt-3">
          <Button
            block
            fill="outline"
            onClick={() => {
              const minutes = Number.parseInt(String(weeklyGoal), 10)
              if (!Number.isFinite(minutes) || minutes <= 0) {
                Toast.show({ content: '请输入有效的周目标分钟数' })
                return
              }
              saveWeeklyGoal(user?.id, minutes)
              Toast.show({ content: '周目标已保存' })
            }}
          >
            保存周目标
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            首次默认 300 分钟/周，可随时调整。
          </p>
        </div>
      </Card>

      <Card title="AI Provider" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Provider
          </div>
          <Selector
            options={[
              { label: 'Ollama（本地）', value: 'ollama' },
              { label: '云端（OpenAI兼容）', value: 'openai' },
            ]}
            value={[provider]}
            onChange={(values) => setProvider(values[0] ?? 'ollama')}
          />
        </div>

        <List className="mt-3">
          {provider === 'ollama' ? (
            <>
              <List.Item>
                <Input
                  placeholder="Ollama Host，例如：http://localhost:11434"
                  value={ollamaHost}
                  onChange={setOllamaHost}
                  clearable
                />
              </List.Item>
              <List.Item>
                <Input
                  placeholder="Ollama Model，例如：llama3 / deepseek-r1"
                  value={ollamaModel}
                  onChange={setOllamaModel}
                  clearable
                />
              </List.Item>
            </>
          ) : (
            <>
              <List.Item>
                <Input
                  placeholder="Base URL，例如：https://api.openai.com/v1"
                  value={openaiBaseUrl}
                  onChange={setOpenaiBaseUrl}
                  clearable
                />
              </List.Item>
              <List.Item>
                <Input
                  placeholder="Model，例如：gpt-4o-mini / deepseek-chat"
                  value={openaiModel}
                  onChange={setOpenaiModel}
                  clearable
                />
              </List.Item>
              <List.Item>
                <Input
                  type="password"
                  placeholder="API Key（仅存本地浏览器）"
                  value={openaiApiKey}
                  onChange={setOpenaiApiKey}
                  clearable
                />
              </List.Item>
            </>
          )}
        </List>

        <div className="mt-4">
          <Button block color="primary" onClick={persist}>
            保存 AI 设置
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            云端模式会把 Key 发送到你的后端用于转发请求；请仅在可信环境使用。
          </p>
        </div>
      </Card>

      <Card
        title="Notifications (PWA)"
        className="rounded-2xl border border-slate-100 bg-white shadow-sm"
      >
        <div className="space-y-3">
          <Button block fill="outline" onClick={requestNotificationPermission}>
            开启通知权限
          </Button>
          <Button block onClick={sendTestNotification}>
            发送测试通知
          </Button>
          <p className="text-xs text-slate-400">
            PWA 通知更适合“尽力提醒”；若需要严格定时/重复提醒，后续可升级系统级通知。
          </p>
        </div>
      </Card>

      <Card title="Export" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="space-y-3">
          <Button block fill="outline" onClick={exportLocalData}>
            导出本地数据（JSON）
          </Button>
          <p className="text-xs text-slate-400">
            包含：任务/打卡缓存、复盘、本地设置、待同步队列；默认不导出云端 API Key。
          </p>
        </div>
      </Card>
    </div>
  )
}

export default Settings
