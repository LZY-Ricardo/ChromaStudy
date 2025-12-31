import { useMemo, useRef, useState } from 'react'
import { ActionSheet, Button, Card, Dialog, Input, List, Selector, Switch, TextArea, Toast } from 'antd-mobile'
import { pingAi } from '../services/api.js'
import {
  deleteAiProfile,
  loadAiConfig,
  loadAiState,
  saveAiConfig,
  saveAiState,
} from '../utils/storage.js'
import {
  detectOpenAiCompatPresetId,
  getOpenAiCompatPreset,
  ollamaLinks,
  openAiCompatPresets,
  normalizeBaseUrl,
} from '../utils/aiPresets.js'
import { loadWeeklyGoal, saveWeeklyGoal } from '../utils/habit.js'
import {
  clearPendingOps,
  getPendingOps,
  getPendingOpsCount,
  bumpOpToEnd,
  removeOpsById,
  updateOpById,
} from '../utils/syncQueue.js'

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
  const initialAiState = useMemo(() => {
    const state = loadAiState()
    if (state) return state
    const presetId = detectOpenAiCompatPresetId(defaultAiConfig.openai.baseUrl)
    return {
      version: 2,
      activeProfileId: 'local',
      profiles: [
        {
          id: 'local',
          name: '本地 Ollama',
          provider: defaultAiConfig.provider,
          ollama: { ...defaultAiConfig.ollama },
          openai: { ...defaultAiConfig.openai, presetId },
          health: null,
        },
      ],
    }
  }, [])
  const [aiState, setAiState] = useState(initialAiState)
  const activeProfile =
    aiState.profiles.find((profile) => profile.id === aiState.activeProfileId) ?? aiState.profiles[0]
  const stored = activeProfile
  const initialOpenaiPresetId =
    stored?.openai?.presetId ??
    detectOpenAiCompatPresetId(stored?.openai?.baseUrl ?? defaultAiConfig.openai.baseUrl)
  const fileInputRef = useRef(null)
  const [, bumpLocalRender] = useState(0)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [detailOp, setDetailOp] = useState(null)
  const [detailDraft, setDetailDraft] = useState(null)
  const [detailAdvanced, setDetailAdvanced] = useState(false)
  const [detailPayloadText, setDetailPayloadText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importCandidate, setImportCandidate] = useState(null)
  const [importOptions, setImportOptions] = useState(null)
  const [importWorking, setImportWorking] = useState(false)

  const [provider, setProvider] = useState(stored?.provider ?? defaultAiConfig.provider)
  const [openaiPresetId, setOpenaiPresetId] = useState(initialOpenaiPresetId)
  const [openaiAdvanced, setOpenaiAdvanced] = useState(() => initialOpenaiPresetId === 'custom')
  const [aiTesting, setAiTesting] = useState(false)
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
  const openaiPreset = getOpenAiCompatPreset(openaiPresetId)
  const [weeklyGoal, setWeeklyGoal] = useState(() => loadWeeklyGoal(user?.id))
  const pendingCount = getPendingOpsCount(user?.id)
  const pendingOps = user?.id
    ? getPendingOps(user.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    : []
  const blockedOpId = lastSync?.blockedOp?.id
  const blockedOp =
    blockedOpId && pendingOps.length
      ? pendingOps.find((op) => op?.id === blockedOpId) ?? lastSync?.blockedOp
      : lastSync?.blockedOp
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

  const makeDetailDraft = (op) => {
    const type = op?.type
    const payload = op?.payload || {}

    if (type === 'checkin') {
      const mode = payload?.mode === 'increment' ? 'increment' : 'replace'
      const generateFeedback =
        typeof payload?.generateFeedback === 'boolean' ? payload.generateFeedback : mode === 'replace'

      return {
        type: 'checkin',
        date: payload?.date ? String(payload.date) : '',
        mode,
        duration: payload?.duration != null ? String(payload.duration) : '',
        content: payload?.content != null ? String(payload.content) : '',
        generateFeedback,
      }
    }

    if (type === 'task_create') {
      return {
        type: 'task_create',
        title: payload?.title != null ? String(payload.title) : '',
      }
    }

    if (type === 'task_update') {
      const updates = payload?.updates && typeof payload.updates === 'object' ? payload.updates : {}
      const isDone =
        typeof updates.isDone === 'boolean' ? (updates.isDone ? 'done' : 'todo') : 'keep'
      return {
        type: 'task_update',
        id: payload?.id != null ? String(payload.id) : '',
        title: typeof updates.title === 'string' ? updates.title : '',
        isDone,
      }
    }

    if (type === 'task_delete') {
      return {
        type: 'task_delete',
        id: payload?.id != null ? String(payload.id) : '',
      }
    }

    return { type: type || 'unknown' }
  }

  const openOpDetail = (op) => {
    if (!op) return
    setDetailOp(op)
    setDetailDraft(makeDetailDraft(op))
    setDetailAdvanced(false)
    try {
      setDetailPayloadText(JSON.stringify(op?.payload ?? {}, null, 2))
    } catch {
      setDetailPayloadText('{}')
    }
  }

  const closeOpDetail = () => {
    if (syncing) return
    setDetailOp(null)
    setDetailDraft(null)
    setDetailAdvanced(false)
    setDetailPayloadText('')
  }

  const buildUpdatedPayload = () => {
    if (!detailOp || !detailDraft) return null
    const type = detailOp.type
    const original = detailOp.payload && typeof detailOp.payload === 'object' ? detailOp.payload : {}

    if (detailAdvanced) {
      let parsed
      try {
        parsed = JSON.parse(String(detailPayloadText || ''))
      } catch {
        Toast.show({ content: 'payload JSON 解析失败' })
        return null
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        Toast.show({ content: 'payload 必须是 JSON 对象' })
        return null
      }

      if (type === 'checkin') {
        const next = { ...parsed, userId: detailOp.userId }
        const date = typeof next.date === 'string' ? next.date.trim() : ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          Toast.show({ content: '日期格式需要为 YYYY-MM-DD' })
          return null
        }
        const mode = next.mode === 'increment' ? 'increment' : 'replace'
        const minutes = Number.parseInt(String(next.duration ?? ''), 10)
        if (!Number.isInteger(minutes)) {
          Toast.show({ content: '时长需要是整数（分钟）' })
          return null
        }
        if (mode === 'increment' && minutes <= 0) {
          Toast.show({ content: '累计模式下时长必须 > 0' })
          return null
        }
        if (mode === 'replace' && minutes < 0) {
          Toast.show({ content: '覆盖模式下时长必须 >= 0' })
          return null
        }
        const content = typeof next.content === 'string' ? next.content.trim() : ''
        if (mode === 'replace' && !content) {
          Toast.show({ content: '覆盖模式下内容必填' })
          return null
        }
        return { ...next, date, mode, duration: minutes, content }
      }

      if (type === 'task_create') {
        const existingTempId = original?.tempId
        const tempId = Number.isFinite(parsed.tempId)
          ? parsed.tempId
          : Number.isFinite(existingTempId)
            ? existingTempId
            : NaN
        const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
        if (!Number.isFinite(tempId) || !title) {
          Toast.show({ content: 'task_create 需要 tempId + title' })
          return null
        }
        return { ...parsed, tempId, title }
      }

      if (type === 'task_update') {
        const id = Number.parseInt(String(parsed.id ?? ''), 10)
        if (!Number.isFinite(id)) {
          Toast.show({ content: 'task_update.id 需要是整数' })
          return null
        }
        const updates = parsed.updates && typeof parsed.updates === 'object' ? parsed.updates : null
        if (!updates || Array.isArray(updates) || Object.keys(updates).length === 0) {
          Toast.show({ content: 'task_update.updates 必须是非空对象' })
          return null
        }
        return { ...parsed, id, updates }
      }

      if (type === 'task_delete') {
        const id = Number.parseInt(String(parsed.id ?? ''), 10)
        if (!Number.isFinite(id)) {
          Toast.show({ content: 'task_delete.id 需要是整数' })
          return null
        }
        return { ...parsed, id }
      }

      Toast.show({ content: '暂不支持编辑该类型' })
      return null
    }

    if (type === 'checkin') {
      const date = String(detailDraft.date ?? '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        Toast.show({ content: '日期格式需要为 YYYY-MM-DD' })
        return null
      }

      const mode = detailDraft.mode === 'increment' ? 'increment' : 'replace'
      const minutes = Number.parseInt(String(detailDraft.duration ?? ''), 10)
      if (!Number.isInteger(minutes)) {
        Toast.show({ content: '时长需要是整数（分钟）' })
        return null
      }
      if (mode === 'increment' && minutes <= 0) {
        Toast.show({ content: '累计模式下时长必须 > 0' })
        return null
      }
      if (mode === 'replace' && minutes < 0) {
        Toast.show({ content: '覆盖模式下时长必须 >= 0' })
        return null
      }

      const content = String(detailDraft.content ?? '').trim()
      if (mode === 'replace' && !content) {
        Toast.show({ content: '覆盖模式下内容必填' })
        return null
      }

      return {
        ...original,
        userId: detailOp.userId,
        date,
        duration: minutes,
        content,
        mode,
        generateFeedback: Boolean(detailDraft.generateFeedback),
      }
    }

    if (type === 'task_create') {
      const title = String(detailDraft.title ?? '').trim()
      if (!title) {
        Toast.show({ content: '任务标题不能为空' })
        return null
      }
      return { ...original, title }
    }

    if (type === 'task_update') {
      const nextId = Number.parseInt(String(detailDraft.id ?? ''), 10)
      if (!Number.isFinite(nextId)) {
        Toast.show({ content: '任务 ID 需要是整数' })
        return null
      }

      const currentUpdates =
        original?.updates && typeof original.updates === 'object' ? original.updates : {}
      const nextUpdates = {}

      const title = String(detailDraft.title ?? '').trim()
      if (title) {
        nextUpdates.title = title
      } else if (typeof currentUpdates.title === 'string') {
        nextUpdates.title = currentUpdates.title
      }

      if (detailDraft.isDone === 'done') {
        nextUpdates.isDone = true
      } else if (detailDraft.isDone === 'todo') {
        nextUpdates.isDone = false
      } else if (typeof currentUpdates.isDone === 'boolean') {
        nextUpdates.isDone = currentUpdates.isDone
      }

      if (Object.keys(nextUpdates).length === 0) {
        Toast.show({ content: '该条更新没有可同步字段' })
        return null
      }

      return { ...original, id: nextId, updates: nextUpdates }
    }

    if (type === 'task_delete') {
      const nextId = Number.parseInt(String(detailDraft.id ?? ''), 10)
      if (!Number.isFinite(nextId)) {
        Toast.show({ content: '任务 ID 需要是整数' })
        return null
      }
      return { ...original, id: nextId }
    }

    Toast.show({ content: '暂不支持编辑该类型' })
    return null
  }

  const saveOpEdits = async ({ syncAfter }) => {
    if (!detailOp?.id) return
    const payload = buildUpdatedPayload()
    if (!payload) return

    const updated = updateOpById(detailOp.id, { payload })
    if (!updated) {
      Toast.show({ content: '保存失败：队列中未找到该条' })
      return
    }

    setDetailOp(updated)
    setDetailDraft(makeDetailDraft(updated))
    try {
      setDetailPayloadText(JSON.stringify(updated?.payload ?? {}, null, 2))
    } catch {
      // ignore
    }
    bumpLocalRender((v) => v + 1)
    Toast.show({ content: '已保存修改' })

    if (syncAfter) {
      closeOpDetail()
      onSyncNow?.()
    }
  }

  const moveOpToEnd = (op) => {
    if (!op?.id) return
    const updated = bumpOpToEnd(op.id)
    if (!updated) {
      Toast.show({ content: '移动失败' })
      return
    }
    if (detailOp?.id === updated.id) {
      setDetailOp(updated)
      setDetailDraft(makeDetailDraft(updated))
      try {
        setDetailPayloadText(JSON.stringify(updated?.payload ?? {}, null, 2))
      } catch {
        // ignore
      }
    }
    bumpLocalRender((v) => v + 1)
    Toast.show({ content: '已移到队列末尾' })
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

    const scrubAiSecrets = (value) => {
      if (!value || typeof value !== 'object') return value
      const next = copy(value)

      if (Array.isArray(next?.profiles)) {
        next.profiles = next.profiles.map((profile) => {
          if (!profile || typeof profile !== 'object') return profile
          const nextProfile = copy(profile)
          if (nextProfile?.openai && typeof nextProfile.openai === 'object') {
            nextProfile.openai.apiKey = ''
          }
          return nextProfile
        })
        return next
      }

      if (next?.openai && typeof next.openai === 'object') {
        next.openai.apiKey = ''
      }

      return next
    }

    const aiConfig = scrubAiSecrets(loadAiState() ?? loadAiConfig())

    const userId = user.id
    const tasksCacheKey = `chroma_cache_tasks_${userId}`
    const logsCacheKey = `chroma_cache_studyLogs_${userId}`
    const weeklyGoalKey = `chroma_weekly_goal_${userId}`
    const taskOrderKey = `chroma_task_order_${userId}`
    const queueKey = 'chroma_sync_queue_v1'
    const reviewPrefix = `chroma_review_${userId}_`
    const reviewCardsKey = `chroma_review_cards_v1_${userId}`

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

    const reviewCards = safeParse(window.localStorage.getItem(reviewCardsKey))

    const rawQueue = safeParse(window.localStorage.getItem(queueKey))
    const scrubAi = scrubAiSecrets

    const scrubOp = (op) => {
      const next = copy(op)
      if (next?.payload?.ai) {
        next.payload.ai = scrubAi(next.payload.ai)
      }
      return next
    }

    const pendingOps = Array.isArray(rawQueue)
      ? rawQueue.filter((op) => op?.userId === userId).map(scrubOp)
      : []

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
        reviewCards: Array.isArray(reviewCards) ? reviewCards : [],
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
    const reviewCardsCount = Array.isArray(data?.reviewCards) ? data.reviewCards.length : 0
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
    const hasReviewCards = Object.prototype.hasOwnProperty.call(data, 'reviewCards')

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
        reviewCardsCount,
        opsCount,
        sameUser,
        hasAiConfig,
        hasWeeklyGoal,
        hasTaskOrder,
        hasTaskCache,
        hasStudyLogCache,
        hasReviews,
        hasReviewCards,
      },
    })

    setImportOptions({
      aiConfig: hasAiConfig,
      weeklyGoal: hasWeeklyGoal,
      taskOrder: hasTaskOrder,
      tasksCache: hasTaskCache,
      studyLogsCache: hasStudyLogCache,
      reviews: hasReviews,
      reviewCards: hasReviewCards,
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
    const reviewCardsKey = `chroma_review_cards_v1_${userId}`

    setImportWorking(true)
    try {
      if (importOptions.aiConfig) {
        const incomingAi = data.aiConfig && typeof data.aiConfig === 'object' ? data.aiConfig : null
        if (incomingAi) {
          const existingState = loadAiState()
          const existing = loadAiConfig()
          const nextAi = JSON.parse(JSON.stringify(incomingAi))

          if (Array.isArray(nextAi?.profiles)) {
            const byId = new Map(
              (Array.isArray(existingState?.profiles) ? existingState.profiles : [])
                .filter((p) => p?.id)
                .map((p) => [p.id, p])
            )
            const byName = new Map()
            const duplicateNames = new Set()
            for (const p of Array.isArray(existingState?.profiles) ? existingState.profiles : []) {
              const name = String(p?.name || '').trim()
              if (!name) continue
              if (byName.has(name)) {
                duplicateNames.add(name)
                byName.set(name, null)
              } else {
                byName.set(name, p)
              }
            }

            nextAi.profiles = nextAi.profiles.map((profile) => {
              if (!profile || typeof profile !== 'object') return profile
              const id = String(profile?.id || '').trim()
              const name = String(profile?.name || '').trim()
              const matched =
                (id && byId.get(id)) || (!duplicateNames.has(name) ? byName.get(name) : null)
              if (!matched) return profile
              if (
                profile?.openai &&
                typeof profile.openai === 'object' &&
                !String(profile.openai.apiKey || '').trim()
              ) {
                const apiKey = String(matched?.openai?.apiKey || '').trim()
                if (apiKey) {
                  profile.openai.apiKey = apiKey
                }
              }
              return profile
            })

            saveAiState(nextAi)
          } else {
            const existingKey =
              typeof existing?.openai?.apiKey === 'string' ? existing.openai.apiKey : ''
            if (nextAi?.openai && typeof nextAi.openai === 'object') {
              nextAi.openai.apiKey = existingKey
            } else if (existingKey) {
              nextAi.openai = { ...(nextAi.openai || {}), apiKey: existingKey }
            }

            saveAiConfig(nextAi)
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

      if (importOptions.reviewCards) {
        const incoming = Object.prototype.hasOwnProperty.call(data, 'reviewCards') ? data.reviewCards : undefined
        if (incoming === undefined) {
          // keep existing
        } else if (incoming === null) {
          window.localStorage.removeItem(reviewCardsKey)
        } else {
          setOrRemoveJson(reviewCardsKey, Array.isArray(incoming) ? incoming : [])
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
            let payload = op?.payload
            if (payload && typeof payload === 'object') {
              try {
                payload = JSON.parse(JSON.stringify(payload))
              } catch {
                payload = op?.payload
              }
            }
            if (payload?.ai?.openai && typeof payload.ai.openai === 'object') {
              payload.ai.openai.apiKey = ''
            }
            return {
              id: typeof op?.id === 'string' && op.id ? op.id : normalizeId(),
              type,
              userId,
              payload,
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

  const buildAiDraftConfig = () => ({
    provider,
    ollama: {
      host: ollamaHost.trim(),
      model: ollamaModel.trim(),
    },
    openai: {
      baseUrl: normalizeBaseUrl(openaiBaseUrl),
      model: openaiModel.trim(),
      apiKey: openaiApiKey.trim(),
      presetId: openaiPresetId,
    },
  })

  const buildProfileConfig = (profile) => ({
    provider: profile?.provider ?? defaultAiConfig.provider,
    ollama: {
      host: String(profile?.ollama?.host ?? defaultAiConfig.ollama.host),
      model: String(profile?.ollama?.model ?? defaultAiConfig.ollama.model),
    },
    openai: {
      baseUrl: normalizeBaseUrl(profile?.openai?.baseUrl ?? defaultAiConfig.openai.baseUrl),
      model: String(profile?.openai?.model ?? defaultAiConfig.openai.model),
      apiKey: String(profile?.openai?.apiKey ?? ''),
      presetId: String(profile?.openai?.presetId ?? ''),
    },
  })

  const isAiDraftDirty = () => {
    const draft = buildAiDraftConfig()
    const saved = buildProfileConfig(activeProfile)
    try {
      return JSON.stringify(draft) !== JSON.stringify(saved)
    } catch {
      return true
    }
  }

  const applyProfileToForm = (profile) => {
    const next = profile || {}
    setProvider(next?.provider ?? defaultAiConfig.provider)
    setOllamaHost(next?.ollama?.host ?? defaultAiConfig.ollama.host)
    setOllamaModel(next?.ollama?.model ?? defaultAiConfig.ollama.model)
    setOpenaiBaseUrl(next?.openai?.baseUrl ?? defaultAiConfig.openai.baseUrl)
    setOpenaiModel(next?.openai?.model ?? defaultAiConfig.openai.model)
    setOpenaiApiKey(next?.openai?.apiKey ?? '')

    const presetId =
      next?.openai?.presetId ||
      detectOpenAiCompatPresetId(next?.openai?.baseUrl ?? defaultAiConfig.openai.baseUrl)
    const normalizedPresetId = presetId || 'custom'
    setOpenaiPresetId(normalizedPresetId)
    setOpenaiAdvanced(normalizedPresetId === 'custom')
  }

  const promptProfileName = async (title, defaultValue) => {
    let draft = String(defaultValue ?? '').trim()
    return new Promise((resolve) => {
      Dialog.show({
        title,
        content: (
          <Input
            placeholder="例如：本地 / OpenAI / DeepSeek"
            defaultValue={draft}
            onChange={(value) => {
              draft = value
            }}
            clearable
          />
        ),
        closeOnAction: true,
        actions: [
          [
            { key: 'cancel', text: '取消', onClick: () => resolve(null) },
            {
              key: 'ok',
              text: '确定',
              bold: true,
              onClick: () => resolve(String(draft || '').trim() || null),
            },
          ],
        ],
      })
    })
  }

  const uniqueProfileName = (seed) => {
    const base = String(seed || '').trim() || '新配置'
    const exists = new Set(aiState.profiles.map((p) => String(p?.name || '').trim()).filter(Boolean))
    if (!exists.has(base)) return base
    let i = 2
    while (exists.has(`${base} ${i}`)) {
      i += 1
    }
    return `${base} ${i}`
  }

  const newProfileId = () => {
    if (typeof crypto !== 'undefined' && crypto?.randomUUID) {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const switchProfile = async (nextId) => {
    const id = String(nextId || '').trim()
    if (!id || id === aiState.activeProfileId) return
    const next = aiState.profiles.find((profile) => profile.id === id)
    if (!next) return

    if (isAiDraftDirty()) {
      const confirmed = await Dialog.confirm({
        title: '切换配置？',
        content: '当前配置未保存，切换会丢失未保存的修改。',
        confirmText: '继续切换',
      })
      if (!confirmed) return
    }

    const nextState = { ...aiState, activeProfileId: id }
    setAiState(nextState)
    saveAiState(nextState)
    applyProfileToForm(next)
  }

  const createProfile = () => {
    const actions = [
      { key: 'ollama', text: '本地：Ollama（默认）' },
      ...openAiCompatPresets
        .filter((preset) => preset.id !== 'custom')
        .map((preset) => ({
          key: `openai:${preset.id}`,
          text: `云端：${preset.label}`,
        })),
    ]

    ActionSheet.show({
      actions,
      cancelText: '取消',
      closeOnAction: true,
      onAction: (action) => {
        const key = String(action?.key ?? '')
        if (!key) return
        window.setTimeout(async () => {
          const id = newProfileId()
          if (key === 'ollama') {
            const name = await promptProfileName('新建配置', uniqueProfileName('本地 Ollama'))
            if (!name) return
            const presetId = detectOpenAiCompatPresetId(defaultAiConfig.openai.baseUrl)
            const profile = {
              id,
              name,
              provider: 'ollama',
              ollama: { ...defaultAiConfig.ollama },
              openai: { ...defaultAiConfig.openai, presetId },
              health: null,
            }
            const next = {
              ...aiState,
              activeProfileId: id,
              profiles: [...aiState.profiles, profile],
            }
            setAiState(next)
            saveAiState(next)
            applyProfileToForm(profile)
            return
          }

          if (key.startsWith('openai:')) {
            const presetId = key.slice('openai:'.length)
            const preset = getOpenAiCompatPreset(presetId)
            if (!preset) return
            const name = await promptProfileName('新建配置', uniqueProfileName(preset.label))
            if (!name) return
            const profile = {
              id,
              name,
              provider: 'openai',
              ollama: { ...defaultAiConfig.ollama },
              openai: {
                baseUrl: preset.baseUrl,
                model: preset.defaultModel,
                apiKey: '',
                presetId: preset.id,
              },
              health: null,
            }
            const next = {
              ...aiState,
              activeProfileId: id,
              profiles: [...aiState.profiles, profile],
            }
            setAiState(next)
            saveAiState(next)
            applyProfileToForm(profile)
          }
        }, 0)
      },
    })
  }

  const duplicateProfile = async () => {
    const id = newProfileId()
    const name = await promptProfileName('复制当前配置', uniqueProfileName(`${activeProfile?.name || '配置'} 副本`))
    if (!name) return
    const draft = buildAiDraftConfig()
    const profile = {
      id,
      name,
      ...draft,
      health: null,
    }
    const next = {
      ...aiState,
      activeProfileId: id,
      profiles: [...aiState.profiles, profile],
    }
    setAiState(next)
    saveAiState(next)
    applyProfileToForm(profile)
  }

  const renameProfile = async () => {
    const currentName = String(activeProfile?.name || '').trim() || '配置'
    const nextName = await promptProfileName('重命名配置', currentName)
    if (!nextName) return
    const nextState = {
      ...aiState,
      profiles: aiState.profiles.map((p) => (p.id === activeProfile.id ? { ...p, name: nextName } : p)),
    }
    setAiState(nextState)
    saveAiState(nextState)
  }

  const removeProfile = async () => {
    if (aiState.profiles.length <= 1) {
      Toast.show({ content: '至少保留一个配置' })
      return
    }
    const confirmed = await Dialog.confirm({
      title: '删除配置？',
      content: `将删除「${activeProfile?.name || activeProfile?.id}」`,
      confirmText: '删除',
    })
    if (!confirmed) return

    const ok = deleteAiProfile(activeProfile.id)
    if (!ok) {
      Toast.show({ content: '删除失败' })
      return
    }

    const latest = loadAiState()
    if (!latest) return
    setAiState(latest)
    const next = latest.profiles.find((p) => p.id === latest.activeProfileId) ?? latest.profiles[0]
    applyProfileToForm(next)
  }

  const applyOpenaiPreset = (nextId) => {
    const id = String(nextId || '').trim() || 'openai'
    setOpenaiPresetId(id)

    if (id === 'custom') {
      setOpenaiAdvanced(true)
      return
    }

    const preset = getOpenAiCompatPreset(id)
    if (!preset) return

    setOpenaiBaseUrl(preset.baseUrl)
    setOpenaiModel(preset.defaultModel)
    setOpenaiAdvanced(false)
  }

  const persist = () => {
    const config = buildAiDraftConfig()

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

    const updatedProfile = { ...activeProfile, ...config }
    const nextState = {
      ...aiState,
      profiles: aiState.profiles.map((p) => (p.id === activeProfile.id ? updatedProfile : p)),
    }

    setAiState(nextState)
    saveAiState(nextState)
    Toast.show({ content: '设置已保存' })
  }

  const testAiConnection = async () => {
    const config = buildAiDraftConfig()

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

    setAiTesting(true)
    try {
      const result = await pingAi(config)

      let toastContent = '连接正常'
      if (result?.provider === 'ollama' && result?.hasModel === false) {
        toastContent = `连接正常，但未发现模型：${config.ollama.model}（可先在 Ollama 执行：ollama pull ${config.ollama.model}）`
      } else if (result?.provider === 'openai' && Number.isFinite(result?.modelCount)) {
        toastContent = `连接正常（可用模型数：${result.modelCount}）`
      }

      const nextState = {
        ...aiState,
        profiles: aiState.profiles.map((p) =>
          p.id === activeProfile.id
            ? { ...p, health: { ok: true, at: Date.now(), message: toastContent } }
            : p
        ),
      }
      setAiState(nextState)
      saveAiState(nextState)
      Toast.show({ content: toastContent })
    } catch (error) {
      const message = error?.response?.data?.error ?? error?.message ?? '连接失败，请检查配置/网络'
      const nextState = {
        ...aiState,
        profiles: aiState.profiles.map((p) =>
          p.id === activeProfile.id
            ? { ...p, health: { ok: false, at: Date.now(), message: String(message) } }
            : p
        ),
      }
      setAiState(nextState)
      saveAiState(nextState)
      Toast.show({ content: String(message) })
    } finally {
      setAiTesting(false)
    }
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
              {lastSync.blocked === 'conflict' && blockedOp ? (
                <p className="text-xs text-amber-600">
                  阻塞项：{formatOpTitle(blockedOp)} {formatOpSummary(blockedOp)}{' '}
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
            disabled={syncing || (pendingCount <= 0 && !blockedOp)}
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
            配置档案
          </div>
          <Selector
            options={aiState.profiles.map((p) => ({ label: p.name || p.id, value: p.id }))}
            value={[aiState.activeProfileId]}
            onChange={(values) => switchProfile(values[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="mini" fill="outline" onClick={createProfile}>
              新建
            </Button>
            <Button size="mini" fill="outline" onClick={duplicateProfile}>
              复制
            </Button>
            <Button size="mini" fill="outline" onClick={renameProfile}>
              重命名
            </Button>
            <Button
              size="mini"
              color="danger"
              fill="outline"
              disabled={aiState.profiles.length <= 1}
              onClick={removeProfile}
            >
              删除
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            最近测试：
            {activeProfile?.health?.at
              ? `${activeProfile.health.ok ? '通过' : '失败'} · ${(() => {
                  try {
                    return new Date(activeProfile.health.at).toLocaleString()
                  } catch {
                    return ''
                  }
                })()}`
              : '未测试'}
          </p>
        </div>

        <div className="mt-4 space-y-3">
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

        {provider === 'openai' ? (
          <div className="mt-3 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Cloud Preset
            </div>
            <Selector
              options={openAiCompatPresets.map((item) => ({ label: item.label, value: item.id }))}
              value={[openaiPresetId]}
              onChange={(values) => applyOpenaiPreset(values[0] ?? 'openai')}
            />
            {openaiPreset?.links?.home || openaiPreset?.links?.console || openaiPreset?.links?.docs ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {openaiPreset?.links?.home ? (
                  <a
                    className="text-blue-600"
                    href={openaiPreset.links.home}
                    target="_blank"
                    rel="noreferrer"
                  >
                    官网
                  </a>
                ) : null}
                {openaiPreset?.links?.console ? (
                  <a
                    className="text-blue-600"
                    href={openaiPreset.links.console}
                    target="_blank"
                    rel="noreferrer"
                  >
                    控制台/Key
                  </a>
                ) : null}
                {openaiPreset?.links?.docs ? (
                  <a
                    className="text-blue-600"
                    href={openaiPreset.links.docs}
                    target="_blank"
                    rel="noreferrer"
                  >
                    文档
                  </a>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-slate-400">
              常用只需粘贴 API Key；Base URL/Model 可在“高级设置”里调整。
            </p>
            <div className="text-xs text-slate-500">
              当前：{normalizeBaseUrl(openaiBaseUrl) || '-'} / {openaiModel || '-'}
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <a className="text-blue-600" href={ollamaLinks.home} target="_blank" rel="noreferrer">
              Ollama 官网
            </a>
            <a className="text-blue-600" href={ollamaLinks.library} target="_blank" rel="noreferrer">
              模型库
            </a>
            <a className="text-blue-600" href={ollamaLinks.docs} target="_blank" rel="noreferrer">
              文档
            </a>
          </div>
        )}

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
                  type="password"
                  placeholder="API Key（仅存本地浏览器）"
                  value={openaiApiKey}
                  onChange={setOpenaiApiKey}
                  clearable
                />
              </List.Item>
              <List.Item
                extra={
                  <Switch
                    checked={openaiAdvanced}
                    onChange={(value) => setOpenaiAdvanced(Boolean(value))}
                  />
                }
              >
                高级设置（Base URL / Model）
              </List.Item>
              {openaiAdvanced ? (
                <>
                  <List.Item>
                    <Input
                      placeholder="Base URL，例如：https://api.openai.com/v1"
                      value={openaiBaseUrl}
                      onChange={(value) => {
                        setOpenaiBaseUrl(value)
                        if (openaiPresetId !== 'custom') {
                          setOpenaiPresetId('custom')
                        }
                      }}
                      clearable
                    />
                  </List.Item>
                  <List.Item>
                    <Input
                      placeholder="Model，例如：gpt-4o-mini / deepseek-chat"
                      value={openaiModel}
                      onChange={(value) => {
                        setOpenaiModel(value)
                        if (openaiPresetId !== 'custom') {
                          setOpenaiPresetId('custom')
                        }
                      }}
                      clearable
                    />
                  </List.Item>
                </>
              ) : null}
            </>
          )}
        </List>

        <div className="mt-4 space-y-2">
          <Button block fill="outline" loading={aiTesting} onClick={testAiConnection}>
            测试连接
          </Button>
          <Button block color="primary" onClick={persist} disabled={aiTesting}>
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
            导出包含：任务/打卡缓存、复盘、答题复习题卡、本地设置、待同步队列；默认不导出云端 API Key。导入会覆盖本地数据。
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
                  {importCandidate.meta.reviewsCount} · 题卡 {importCandidate.meta.reviewCardsCount} · 待同步{' '}
                  {importCandidate.meta.opsCount}
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
                      checked={Boolean(importOptions.reviewCards)}
                      disabled={!importCandidate.meta.hasReviewCards}
                      onChange={(value) =>
                        setImportOptions((prev) => (prev ? { ...prev, reviewCards: value } : prev))
                      }
                    />
                  }
                >
                  答题复习题卡（本地）
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
            {lastSync?.blocked === 'conflict' && blockedOp ? (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-semibold">同步被阻断</div>
                <div className="mt-1 text-xs">
                  {formatOpTitle(blockedOp)} {formatOpSummary(blockedOp)}
                </div>
                {lastSync.blockedError ? (
                  <div className="mt-1 break-words text-xs">{lastSync.blockedError}</div>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <Button size="small" fill="outline" onClick={() => openOpDetail(blockedOp)}>
                    查看/处理阻塞项
                  </Button>
                  <Button size="small" color="primary" onClick={() => onSyncNow?.()} disabled={syncing}>
                    再试一次
                  </Button>
                  <Button
                    size="small"
                    fill="outline"
                    disabled={syncing}
                    onClick={() => {
                      moveOpToEnd(blockedOp)
                      onSyncNow?.()
                    }}
                  >
                    跳过阻塞项继续同步
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
                        <Button size="small" fill="outline" onClick={() => openOpDetail(op)}>
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
        onClose={closeOpDetail}
        actions={[
          { key: 'close', text: '关闭', disabled: syncing },
          { key: 'save', text: '保存', disabled: syncing || !detailDraft },
          { key: 'save_sync', text: '保存并继续同步', bold: true, disabled: syncing || !detailDraft },
        ]}
        onAction={(action) => {
          if (!detailOp) return
          if (action.key === 'save') {
            saveOpEdits({ syncAfter: false })
            return
          }
          if (action.key === 'save_sync') {
            saveOpEdits({ syncAfter: true })
            return
          }
          closeOpDetail()
        }}
        content={
          !detailOp ? null : (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  {formatOpTitle(detailOp)} {formatOpSummary(detailOp)}
                </p>
                <p className="mt-1">
                  opId：{detailOp.id}
                  {detailOp?.createdAt ? ` · ${new Date(detailOp.createdAt).toLocaleString()}` : ''}
                </p>
              </div>

              <List>
                <List.Item
                  extra={
                    <Switch
                      checked={detailAdvanced}
                      disabled={syncing}
                      onChange={(value) => setDetailAdvanced(Boolean(value))}
                    />
                  }
                >
                  高级：直接编辑 payload JSON
                </List.Item>
              </List>

              {detailAdvanced ? (
                <TextArea
                  placeholder="请输入 payload JSON（对象）"
                  value={detailPayloadText}
                  onChange={setDetailPayloadText}
                  rows={8}
                  showCount
                  maxLength={4000}
                />
              ) : null}

            {detailDraft?.type === 'checkin' ? (
              <div className="space-y-3">
                <List>
                  <List.Item>
                    <Input
                      placeholder="日期（YYYY-MM-DD）"
                      value={detailDraft.date}
                      onChange={(value) => setDetailDraft((prev) => ({ ...prev, date: value }))}
                      clearable
                    />
                  </List.Item>
                  <List.Item>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="时长（分钟）"
                      value={detailDraft.duration}
                      onChange={(value) => setDetailDraft((prev) => ({ ...prev, duration: value }))}
                      clearable
                    />
                  </List.Item>
                </List>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Mode
                  </div>
                  <Selector
                    options={[
                      { label: '覆盖', value: 'replace' },
                      { label: '累计', value: 'increment' },
                    ]}
                    value={[detailDraft.mode]}
                    onChange={(values) =>
                      setDetailDraft((prev) => ({ ...prev, mode: values[0] ?? 'replace' }))
                    }
                  />
                </div>

                <TextArea
                  placeholder="内容（覆盖模式必填）"
                  value={detailDraft.content}
                  onChange={(value) => setDetailDraft((prev) => ({ ...prev, content: value }))}
                  rows={4}
                  showCount
                  maxLength={500}
                />

                <List>
                  <List.Item
                    extra={
                      <Switch
                        checked={Boolean(detailDraft.generateFeedback)}
                        onChange={(value) =>
                          setDetailDraft((prev) => ({ ...prev, generateFeedback: value }))
                        }
                      />
                    }
                  >
                    同步后生成 AI 点评
                  </List.Item>
                </List>
              </div>
            ) : null}

            {detailDraft?.type === 'task_create' ? (
              <List>
                <List.Item>
                  <Input
                    placeholder="任务标题"
                    value={detailDraft.title}
                    onChange={(value) => setDetailDraft((prev) => ({ ...prev, title: value }))}
                    clearable
                  />
                </List.Item>
              </List>
            ) : null}

            {detailDraft?.type === 'task_update' ? (
              <div className="space-y-3">
                <List>
                  <List.Item>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="任务 ID（允许把 - 临时 id 改成真实 id）"
                      value={detailDraft.id}
                      onChange={(value) => setDetailDraft((prev) => ({ ...prev, id: value }))}
                      clearable
                    />
                  </List.Item>
                  <List.Item>
                    <Input
                      placeholder="标题（留空表示不改/沿用原值）"
                      value={detailDraft.title}
                      onChange={(value) => setDetailDraft((prev) => ({ ...prev, title: value }))}
                      clearable
                    />
                  </List.Item>
                </List>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    isDone
                  </div>
                  <Selector
                    options={[
                      { label: '不修改', value: 'keep' },
                      { label: '完成', value: 'done' },
                      { label: '未完成', value: 'todo' },
                    ]}
                    value={[detailDraft.isDone]}
                    onChange={(values) =>
                      setDetailDraft((prev) => ({ ...prev, isDone: values[0] ?? 'keep' }))
                    }
                  />
                </div>
              </div>
            ) : null}

            {detailDraft?.type === 'task_delete' ? (
              <List>
                <List.Item>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="任务 ID"
                    value={detailDraft.id}
                    onChange={(value) => setDetailDraft((prev) => ({ ...prev, id: value }))}
                    clearable
                  />
                </List.Item>
              </List>
            ) : null}

              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  fill="outline"
                  disabled={syncing}
                  onClick={() => moveOpToEnd(detailOp)}
                >
                  移到队列末尾
                </Button>
                <Button
                  size="small"
                  fill="outline"
                  color="warning"
                  disabled={syncing}
                  onClick={() => discardOp(detailOp)}
                >
                  丢弃该条
                </Button>
                <Button
                  size="small"
                  fill="outline"
                  color="warning"
                  disabled={syncing}
                  onClick={() => discardOp(detailOp, { syncAfter: true })}
                >
                  丢弃并继续同步
                </Button>
              </div>
          </div>
          )
        }
      />
    </div>
  )
}

export default Settings
