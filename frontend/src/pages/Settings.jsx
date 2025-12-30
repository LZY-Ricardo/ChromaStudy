import { useMemo, useRef, useState } from 'react'
import { Button, Card, Dialog, Input, List, Selector, Switch, Toast } from 'antd-mobile'
import { loadAiConfig, saveAiConfig } from '../utils/storage.js'
import { loadWeeklyGoal, saveWeeklyGoal } from '../utils/habit.js'
import { clearPendingOps, getPendingOps, getPendingOpsCount, removeOpsById } from '../utils/syncQueue.js'

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
  const fileInputRef = useRef(null)
  const [, bumpLocalRender] = useState(0)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [detailOp, setDetailOp] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importCandidate, setImportCandidate] = useState(null)
  const [importOptions, setImportOptions] = useState(null)
  const [importWorking, setImportWorking] = useState(false)

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
  const pendingOps = user?.id
    ? getPendingOps(user.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    : []
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
    bumpLocalRender((v) => v + 1)
    Toast.show({ content: '已清空待同步队列' })
  }

  const formatOpTitle = (op) => {
    const type = op?.type
    if (type === 'checkin') return '打卡'
    if (type === 'task_create') return '新增任务'
    if (type === 'task_update') return '更新任务'
    if (type === 'task_delete') return '删除任务'
    return type || 'unknown'
  }

  const formatOpSummary = (op) => {
    const type = op?.type
    const payload = op?.payload || {}

    if (type === 'checkin') {
      const mode = payload?.mode === 'increment' ? '累计' : '覆盖'
      const date = payload?.date ? String(payload.date) : ''
      const minutes = Number(payload?.duration) || 0
      return `${date} · ${mode} ${minutes}m`
    }

    if (type === 'task_create') {
      const title = payload?.title ? String(payload.title) : ''
      return title ? `“${title}”` : ''
    }

    if (type === 'task_update') {
      const id = payload?.id
      const updates = payload?.updates || {}
      const parts = []
      if (typeof updates.title === 'string') parts.push('title')
      if (typeof updates.isDone === 'boolean') parts.push(`isDone=${updates.isDone}`)
      return `#${id}${parts.length ? ` · ${parts.join(', ')}` : ''}`
    }

    if (type === 'task_delete') {
      return `#${payload?.id}`
    }

    return ''
  }

  const discardOp = async (op, { syncAfter } = { syncAfter: false }) => {
    if (!op?.id) return
    const confirmed = await Dialog.confirm({
      title: '丢弃该条待同步',
      content: '该操作会丢弃本地更改，并且不会再同步到服务器。',
      confirmText: syncAfter ? '丢弃并继续同步' : '确认丢弃',
    })
    if (!confirmed) return

    removeOpsById([op.id])
    bumpLocalRender((v) => v + 1)
    Toast.show({ content: '已丢弃该条待同步' })

    if (syncAfter) {
      onSyncNow?.()
    }
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

  const prepareImportFile = async (file) => {
    if (typeof window === 'undefined') return
    if (!user?.id) return
    if (!file) return
    if (importWorking) return

    let parsed
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      Toast.show({ content: '文件不是有效 JSON' })
      return
    }

    if (!parsed || parsed.app !== 'ChromaStudy') {
      Toast.show({ content: '不是 ChromaStudy 备份文件' })
      return
    }

    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : null
    if (!data) {
      Toast.show({ content: '备份内容缺失' })
      return
    }

    const fileUserId = Number(parsed?.user?.id)
    const fileUsername = String(parsed?.user?.username ?? '').trim()
    const exportedAt = String(parsed?.exportedAt ?? '').trim()

    const tasksCount = Array.isArray(data?.caches?.tasks) ? data.caches.tasks.length : 0
    const logsCount = Array.isArray(data?.caches?.studyLogs) ? data.caches.studyLogs.length : 0
    const reviewsCount =
      data?.reviews && typeof data.reviews === 'object' ? Object.keys(data.reviews).length : 0
    const opsCount = Array.isArray(data?.pendingOps) ? data.pendingOps.length : 0

    const sameUser = !Number.isFinite(fileUserId) || fileUserId === user.id

    const hasAiConfig = Object.prototype.hasOwnProperty.call(data, 'aiConfig')
    const hasWeeklyGoal = Object.prototype.hasOwnProperty.call(data, 'weeklyGoal')
    const hasTaskOrder = Object.prototype.hasOwnProperty.call(data, 'taskOrder')
    const hasTaskCache =
      data?.caches && typeof data.caches === 'object'
        ? Object.prototype.hasOwnProperty.call(data.caches, 'tasks')
        : false
    const hasStudyLogCache =
      data?.caches && typeof data.caches === 'object'
        ? Object.prototype.hasOwnProperty.call(data.caches, 'studyLogs')
        : false
    const hasReviews = data?.reviews && typeof data.reviews === 'object'

    setImportCandidate({
      fileName: file.name,
      data,
      meta: {
        fileUserId,
        fileUsername,
        exportedAt,
        tasksCount,
        logsCount,
        reviewsCount,
        opsCount,
        sameUser,
        hasAiConfig,
        hasWeeklyGoal,
        hasTaskOrder,
        hasTaskCache,
        hasStudyLogCache,
        hasReviews,
      },
    })

    setImportOptions({
      aiConfig: hasAiConfig,
      weeklyGoal: hasWeeklyGoal,
      taskOrder: hasTaskOrder,
      tasksCache: hasTaskCache,
      studyLogsCache: hasStudyLogCache,
      reviews: hasReviews,
      pendingOps: sameUser && opsCount > 0,
      pendingOpsMode: 'replace', // replace | merge
    })

    setImportOpen(true)
  }

  const applyImport = async () => {
    if (typeof window === 'undefined') return
    if (!user?.id) return
    if (importWorking) return
    if (!importCandidate || !importOptions) return

    const { data, meta } = importCandidate
    const userId = user.id

    if (importOptions.pendingOps && !meta.sameUser) {
      const confirmed = await Dialog.confirm({
        title: '确认导入待同步队列',
        content: '备份账号不一致仍导入待同步队列，可能导致误同步到当前账号。建议只在你明确知道后果时开启。',
        confirmText: '仍要导入',
      })
      if (!confirmed) return
    }

    const safeStringify = (value) => {
      try {
        return JSON.stringify(value)
      } catch {
        return ''
      }
    }

    const setOrRemoveJson = (key, value) => {
      if (value === undefined) return
      if (value === null) {
        window.localStorage.removeItem(key)
        return
      }
      const raw = safeStringify(value)
      if (!raw) return
      window.localStorage.setItem(key, raw)
    }

    const setOrRemoveRaw = (key, value) => {
      if (value === undefined) return
      if (value === null || value === '') {
        window.localStorage.removeItem(key)
        return
      }
      window.localStorage.setItem(key, String(value))
    }

    const queueKey = 'chroma_sync_queue_v1'
    const tasksCacheKey = `chroma_cache_tasks_${userId}`
    const logsCacheKey = `chroma_cache_studyLogs_${userId}`
    const weeklyGoalKey = `chroma_weekly_goal_${userId}`
    const taskOrderKey = `chroma_task_order_${userId}`
    const reviewPrefix = `chroma_review_${userId}_`

    setImportWorking(true)
    try {
      if (importOptions.aiConfig) {
        const incomingAi = data.aiConfig && typeof data.aiConfig === 'object' ? data.aiConfig : null
        if (incomingAi) {
          const existing = loadAiConfig()
          if (
            existing?.openai?.apiKey &&
            (!incomingAi?.openai || !incomingAi.openai.apiKey)
          ) {
            incomingAi.openai = { ...(incomingAi.openai || {}), apiKey: existing.openai.apiKey }
          }
          const rawAi = safeStringify(incomingAi)
          if (rawAi) {
            window.localStorage.setItem('chroma_ai', rawAi)
          }
        }
      }

      if (importOptions.weeklyGoal) {
        setOrRemoveRaw(weeklyGoalKey, data.weeklyGoal ?? null)
      }
      if (importOptions.taskOrder) {
        setOrRemoveJson(taskOrderKey, data.taskOrder)
      }
      if (importOptions.tasksCache) {
        setOrRemoveJson(tasksCacheKey, data?.caches?.tasks)
      }
      if (importOptions.studyLogsCache) {
        setOrRemoveJson(logsCacheKey, data?.caches?.studyLogs)
      }

      if (importOptions.reviews) {
        try {
          const keysToRemove = []
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i)
            if (!key || !key.startsWith(reviewPrefix)) continue
            keysToRemove.push(key)
          }
          keysToRemove.forEach((key) => window.localStorage.removeItem(key))
        } catch {
          // ignore
        }

        if (data.reviews && typeof data.reviews === 'object') {
          for (const [date, review] of Object.entries(data.reviews)) {
            if (!date) continue
            setOrRemoveJson(`${reviewPrefix}${date}`, review)
          }
        }
      }

      if (importOptions.pendingOps) {
        const safeParse = (raw) => {
          try {
            return raw ? JSON.parse(raw) : null
          } catch {
            return null
          }
        }

        const normalizeId = () => {
          if (typeof crypto !== 'undefined' && crypto?.randomUUID) return crypto.randomUUID()
          return `${Date.now()}-${Math.random().toString(16).slice(2)}`
        }

        const existingQueue = safeParse(window.localStorage.getItem(queueKey))
        const preservedOtherUsers = Array.isArray(existingQueue)
          ? existingQueue.filter((op) => op?.userId !== userId)
          : []
        const existingForUser = Array.isArray(existingQueue)
          ? existingQueue.filter((op) => op?.userId === userId)
          : []

        const imported = Array.isArray(data.pendingOps) ? data.pendingOps : []
        const sanitized = imported
          .map((op) => {
            const type = typeof op?.type === 'string' ? op.type : ''
            if (!type) return null
            return {
              id: typeof op?.id === 'string' && op.id ? op.id : normalizeId(),
              type,
              userId,
              payload: op?.payload,
              createdAt: Number(op?.createdAt) || Date.now(),
            }
          })
          .filter(Boolean)

        const base =
          importOptions.pendingOpsMode === 'merge'
            ? [...preservedOtherUsers, ...existingForUser]
            : preservedOtherUsers

        const ids = new Set(base.map((op) => op?.id).filter(Boolean))
        const merged = [...base]
        for (const op of sanitized) {
          if (!op?.id || ids.has(op.id)) continue
          ids.add(op.id)
          merged.push(op)
        }

        merged.sort((a, b) => (a?.createdAt || 0) - (b?.createdAt || 0))
        const rawQueue = safeStringify(merged)
        if (rawQueue) {
          window.localStorage.setItem(queueKey, rawQueue)
        }
      }

      bumpLocalRender((v) => v + 1)
      Toast.show({ content: '导入完成，正在刷新…' })
      setImportOpen(false)
      setImportCandidate(null)
      setImportOptions(null)
      window.setTimeout(() => window.location.reload(), 300)
    } catch {
      Toast.show({ content: '导入失败' })
    } finally {
      setImportWorking(false)
    }
  }

  const closeImportDialog = () => {
    if (importWorking) return
    setImportOpen(false)
    setImportCandidate(null)
    setImportOptions(null)
  }

  const handleImportFileChange = async (event) => {
    const input = event?.target
    const file = input?.files?.[0]
    if (input) {
      input.value = ''
    }
    if (!file) return
    await prepareImportFile(file)
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
            <div className="space-y-1">
              <p className="text-xs text-slate-400">
                上次同步：{lastSyncLabel || '未知'} · 成功 {lastSync.succeeded}/{lastSync.processed} · 失败{' '}
                {lastSync.failed}
                {lastSync.blocked === 'conflict'
                  ? ' · 已暂停：需要处理冲突'
                  : lastSync.blocked === 'network'
                    ? ' · 已暂停：网络不可用'
                    : ''}
              </p>
              {lastSync.blocked === 'conflict' && lastSync?.blockedOp ? (
                <p className="text-xs text-amber-600">
                  阻塞项：{formatOpTitle(lastSync.blockedOp)} {formatOpSummary(lastSync.blockedOp)}{' '}
                  {lastSync.blockedError ? `· ${lastSync.blockedError}` : ''}
                </p>
              ) : null}
            </div>
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
            disabled={syncing || (pendingCount <= 0 && !lastSync?.blockedOp)}
            onClick={() => setPendingOpen(true)}
          >
            查看待同步详情
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
          <Button
            block
            color="primary"
            onClick={() => fileInputRef.current?.click?.()}
          >
            导入本地数据（JSON）
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFileChange}
            style={{ display: 'none' }}
          />
          <p className="text-xs text-slate-400">
            导出包含：任务/打卡缓存、复盘、本地设置、待同步队列；默认不导出云端 API Key。导入会覆盖本地数据。
          </p>
        </div>
      </Card>

      <Dialog
        visible={importOpen}
        title="导入备份"
        closeOnMaskClick={!importWorking}
        closeOnAction={false}
        onClose={closeImportDialog}
        actions={[
          { key: 'cancel', text: '取消', disabled: importWorking },
          { key: 'import', text: importWorking ? '导入中...' : '开始导入', bold: true, disabled: importWorking },
        ]}
        onAction={(action) => {
          if (action.key === 'import') {
            applyImport()
            return
          }
          closeImportDialog()
        }}
        content={
          importCandidate && importOptions ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">{importCandidate.fileName}</p>
                <p className="mt-1">
                  备份用户：
                  {Number.isFinite(importCandidate.meta.fileUserId)
                    ? `#${importCandidate.meta.fileUserId}`
                    : '未知'}
                  {importCandidate.meta.fileUsername ? `（${importCandidate.meta.fileUsername}）` : ''}{' '}
                  {importCandidate.meta.exportedAt ? `· ${importCandidate.meta.exportedAt}` : ''}
                </p>
                <p className="mt-1">
                  内容：任务缓存 {importCandidate.meta.tasksCount} · 打卡缓存 {importCandidate.meta.logsCount} · 复盘{' '}
                  {importCandidate.meta.reviewsCount} · 待同步 {importCandidate.meta.opsCount}
                </p>
                <p className="mt-2 text-amber-600">
                  提示：导入只覆盖你勾选的模块；云端 API Key 默认保留不覆盖。
                </p>
                {!importCandidate.meta.sameUser ? (
                  <p className="mt-2 text-amber-600">
                    当前账号为 #{user.id}，备份账号不一致；导入待同步队列可能误同步到当前账号。
                  </p>
                ) : null}
              </div>

              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Import Options
              </div>
              <List>
                <List.Item
                  extra={
                    <Switch
                      checked={Boolean(importOptions.aiConfig)}
                      disabled={!importCandidate.meta.hasAiConfig}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, aiConfig: value } : prev))
                      }
                    />
                  }
                >
                  AI 设置
                </List.Item>
                <List.Item
                  extra={
                    <Switch
                      checked={Boolean(importOptions.weeklyGoal)}
                      disabled={!importCandidate.meta.hasWeeklyGoal}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, weeklyGoal: value } : prev))
                      }
                    />
                  }
                >
                  周目标
                </List.Item>
                <List.Item
                  extra={
                    <Switch
                      checked={Boolean(importOptions.taskOrder)}
                      disabled={!importCandidate.meta.hasTaskOrder}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, taskOrder: value } : prev))
                      }
                    />
                  }
                >
                  Task 排序
                </List.Item>
                <List.Item
                  extra={
                    <Switch
                      checked={Boolean(importOptions.tasksCache)}
                      disabled={!importCandidate.meta.hasTaskCache}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, tasksCache: value } : prev))
                      }
                    />
                  }
                >
                  任务缓存
                </List.Item>
                <List.Item
                  extra={
                    <Switch
                      checked={Boolean(importOptions.studyLogsCache)}
                      disabled={!importCandidate.meta.hasStudyLogCache}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, studyLogsCache: value } : prev))
                      }
                    />
                  }
                >
                  打卡缓存
                </List.Item>
                <List.Item
                  extra={
                    <Switch
                      checked={Boolean(importOptions.reviews)}
                      disabled={!importCandidate.meta.hasReviews}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, reviews: value } : prev))
                      }
                    />
                  }
                >
                  AI 复盘（本地）
                </List.Item>
                <List.Item
                  extra={
                    <Switch
                      checked={Boolean(importOptions.pendingOps)}
                      disabled={importCandidate.meta.opsCount <= 0}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, pendingOps: value } : prev))
                      }
                    />
                  }
                >
                  待同步队列（离线更改）
                </List.Item>
              </List>

              {importOptions.pendingOps ? (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>合并到现有队列</span>
                    <Switch
                      checked={importOptions.pendingOpsMode === 'merge'}
                      onChange={(value) =>
                        setImportOptions((prev) =>
                          prev
                            ? { ...prev, pendingOpsMode: value ? 'merge' : 'replace' }
                            : prev
                        )
                      }
                    />
                  </div>
                  <p className="mt-2">
                    {importOptions.pendingOpsMode === 'merge'
                      ? '会把备份队列追加到当前队列（按 id 去重）。'
                      : '会覆盖当前账号的待同步队列（保留其它账号的队列）。'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600">请选择一个备份文件</p>
          )
        }
      />

      <Dialog
        visible={pendingOpen}
        title="待同步详情"
        closeOnMaskClick
        closeOnAction
        onClose={() => setPendingOpen(false)}
        actions={[{ key: 'close', text: '关闭' }]}
        content={
          <div className="space-y-3">
            {lastSync?.blocked === 'conflict' && lastSync?.blockedOp ? (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-semibold">同步被阻断</div>
                <div className="mt-1 text-xs">
                  {formatOpTitle(lastSync.blockedOp)} {formatOpSummary(lastSync.blockedOp)}
                </div>
                {lastSync.blockedError ? (
                  <div className="mt-1 break-words text-xs">{lastSync.blockedError}</div>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <Button size="small" fill="outline" onClick={() => setDetailOp(lastSync.blockedOp)}>
                    查看/处理阻塞项
                  </Button>
                  <Button size="small" color="primary" onClick={() => onSyncNow?.()} disabled={syncing}>
                    再试一次
                  </Button>
                </div>
              </div>
            ) : null}

            {pendingOps.length ? (
              <List>
                {pendingOps.map((op) => (
                  <List.Item
                    key={op.id}
                    extra={
                      <div className="flex items-center gap-2">
                        <Button size="small" fill="outline" onClick={() => setDetailOp(op)}>
                          详情
                        </Button>
                        <Button
                          size="small"
                          fill="outline"
                          color="warning"
                          onClick={() => discardOp(op)}
                        >
                          丢弃
                        </Button>
                      </div>
                    }
                  >
                    <div className="space-y-1">
                      <div className="text-sm text-slate-900">{formatOpTitle(op)}</div>
                      <div className="text-xs text-slate-500">
                        {formatOpSummary(op)}
                        {op?.createdAt ? ` · ${new Date(op.createdAt).toLocaleString()}` : ''}
                      </div>
                    </div>
                  </List.Item>
                ))}
              </List>
            ) : (
              <p className="text-sm text-slate-500">暂无待同步项目</p>
            )}
          </div>
        }
      />

      <Dialog
        visible={Boolean(detailOp)}
        title="待同步项"
        closeOnMaskClick={!syncing}
        closeOnAction={false}
        onClose={() => setDetailOp(null)}
        actions={[
          { key: 'close', text: '关闭' },
          { key: 'discard', text: '丢弃该条', disabled: syncing },
          { key: 'discard_sync', text: '丢弃并继续同步', bold: true, disabled: syncing },
        ]}
        onAction={(action) => {
          if (!detailOp) return
          if (action.key === 'discard') {
            discardOp(detailOp).finally(() => setDetailOp(null))
            return
          }
          if (action.key === 'discard_sync') {
            discardOp(detailOp, { syncAfter: true }).finally(() => setDetailOp(null))
            return
          }
          setDetailOp(null)
        }}
        content={
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              {formatOpTitle(detailOp)} {formatOpSummary(detailOp)}
            </p>
            <pre className="max-h-[40vh] overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
              {JSON.stringify(detailOp, null, 2)}
            </pre>
          </div>
        }
      />
    </div>
  )
}

export default Settings
