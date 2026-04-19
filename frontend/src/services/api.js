import axios from 'axios'
import { enqueueOp, getPendingOps, removeOpsById, replaceQueuedTaskId } from '../utils/syncQueue.js'
import { replaceTaskIdInOrder } from '../utils/taskOrder.js'
import { clearAuth, loadAccessToken, loadRefreshToken, saveAuth } from '../utils/authStorage.js'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
})

let refreshPromise = null

function applyAuthPayload(payload) {
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : null
  const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : ''
  const refreshToken = typeof payload?.refreshToken === 'string' ? payload.refreshToken : ''

  if (user && accessToken && refreshToken) {
    saveAuth({ user, accessToken, refreshToken })
    return { user, accessToken, refreshToken }
  }
  return null
}

async function refreshSession() {
  const refreshToken = loadRefreshToken()
  if (!refreshToken) {
    throw new Error('missing refresh token')
  }

  const { data } = await api.post(
    '/api/refresh',
    { refreshToken },
    { skipAuthRefresh: true }
  )

  const applied = applyAuthPayload(data)
  if (!applied?.accessToken) {
    throw new Error('refresh failed')
  }
  return applied
}

api.interceptors.request.use(
  (config) => {
    const token = loadAccessToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status
    const original = error?.config

    if (status !== 401 || !original || original.skipAuthRefresh) {
      return Promise.reject(error)
    }

    if (original._retry) {
      return Promise.reject(error)
    }
    original._retry = true

    try {
      if (!loadRefreshToken()) {
        return Promise.reject(error)
      }
      if (!refreshPromise) {
        refreshPromise = refreshSession().finally(() => {
          refreshPromise = null
        })
      }
      const refreshed = await refreshPromise
      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${refreshed.accessToken}`
      return api(original)
    } catch (refreshError) {
      if (refreshError?.response?.status === 401) {
        clearAuth()
      }
      return Promise.reject(error)
    }
  }
)

function opId() {
  if (typeof crypto !== 'undefined' && crypto?.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isNetworkError(error) {
  return !error?.response
}

function decodeEscapedUnicodeText(value) {
  if (typeof value !== 'string') return value
  if (!/\\u[0-9a-fA-F]{4}/.test(value)) return value
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16))
  )
}

function normalizeTaskTextFields(task) {
  if (!task || typeof task !== 'object') return task
  return {
    ...task,
    title: decodeEscapedUnicodeText(task.title),
    description: decodeEscapedUnicodeText(task.description),
    category: decodeEscapedUnicodeText(task.category),
    labels: Array.isArray(task.labels)
      ? task.labels.map((item) => decodeEscapedUnicodeText(item))
      : task.labels,
  }
}

function cacheKey(prefix, userId) {
  return `chroma_cache_${prefix}_${userId}`
}

function loadCache(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCache(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / serialization errors
  }
}

function mergeStudyLogsWithCache(userId, serverLogs) {
  const pendingDates = new Set(
    getPendingOps(userId)
      .filter((op) => op?.type === 'checkin')
      .map((op) => op?.payload?.date)
      .filter(Boolean)
  )

  const key = cacheKey('studyLogs', userId)
  const cached = loadCache(key)
  const map = new Map(
    (Array.isArray(serverLogs) ? serverLogs : []).map((log) => [log?.date, log])
  )

  if (Array.isArray(cached)) {
    for (const log of cached) {
      if (!log?.date) continue
      if (log?._offline || pendingDates.has(log.date)) {
        map.set(log.date, log)
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => String(a?.date).localeCompare(String(b?.date)))
}

function mergeTasksWithCache(userId, serverTasks) {
  const pending = getPendingOps(userId)
  const pendingUpdateIds = new Set(
    pending
      .filter((op) => op?.type === 'task_update')
      .map((op) => op?.payload?.id)
      .filter((id) => Number.isFinite(id))
  )
  const pendingDeleteIds = new Set(
    pending
      .filter((op) => op?.type === 'task_delete')
      .map((op) => op?.payload?.id)
      .filter((id) => Number.isFinite(id))
  )

  const key = cacheKey('tasks', userId)
  const cached = loadCache(key)
  const map = new Map(
    (Array.isArray(serverTasks) ? serverTasks : []).map((task) => {
      const normalized = normalizeTaskTextFields(task)
      return [normalized?.id, normalized]
    })
  )

  if (Array.isArray(cached)) {
    for (const task of cached) {
      if (!task || !Number.isFinite(task.id)) continue
      if (task.id <= 0 || task?._offline || pendingUpdateIds.has(task.id)) {
        map.set(task.id, normalizeTaskTextFields(task))
      }
    }
  }

  for (const id of pendingDeleteIds) {
    map.delete(id)
  }

  return Array.from(map.values()).sort((a, b) => (a?.id || 0) - (b?.id || 0))
}

function appendTaskCache(userId, task) {
  const key = cacheKey('tasks', userId)
  const cached = loadCache(key)
  const list = Array.isArray(cached) ? cached : []
  saveCache(
    key,
    [...list.filter((item) => item?.id !== task?.id), task].filter(Boolean)
  )
}

function replaceTaskInCache(userId, tempId, task) {
  const key = cacheKey('tasks', userId)
  const cached = loadCache(key)
  const list = Array.isArray(cached) ? cached : []
  const exists = list.some((item) => item?.id === tempId)
  const next = exists ? list.map((item) => (item?.id === tempId ? task : item)) : [...list, task]
  saveCache(key, next.filter(Boolean))
}

export async function login(username, password) {
  const { data } = await api.post('/api/login', { username, password }, { skipAuthRefresh: true })
  const applied = applyAuthPayload(data)
  if (!applied?.user) {
    throw new Error('invalid login response')
  }
  return applied.user
}

export async function register(username, password) {
  const { data } = await api.post('/api/register', { username, password }, { skipAuthRefresh: true })
  const applied = applyAuthPayload(data)
  if (!applied?.user) {
    throw new Error('invalid register response')
  }
  return applied.user
}

export async function logout() {
  const refreshToken = loadRefreshToken()
  try {
    if (refreshToken) {
      await api.post('/api/logout', { refreshToken }, { skipAuthRefresh: true })
    }
  } finally {
    clearAuth()
  }
}

export async function getMe() {
  const { data } = await api.get('/api/me')
  return data?.user || null
}

export async function getStudyLogs(userId) {
  const key = cacheKey('studyLogs', userId)
  try {
    const { data } = await api.get('/api/study-logs', { params: { userId } })
    const merged = mergeStudyLogsWithCache(userId, data)
    saveCache(key, merged)
    return merged
  } catch (error) {
    const cached = loadCache(key)
    if (cached) return cached
    throw error
  }
}

export async function getStudyLogByDate(userId, date) {
  const key = cacheKey('studyLogs', userId)
  try {
    const { data } = await api.get(`/api/study-logs/${date}`, { params: { userId } })
    if (data) {
      applyStudyLogCache(userId, data)
    }
    return data
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error
    }

    const cached = loadCache(key)
    if (Array.isArray(cached)) {
      return cached.find((item) => item?.date === date) ?? null
    }
    throw error
  }
}

export async function generateAiFeedback(userId, date, ai) {
  const { data } = await api.post(`/api/study-logs/${date}/ai-feedback`, { userId, ai })

  const key = cacheKey('studyLogs', userId)
  const cached = loadCache(key)
  if (Array.isArray(cached)) {
    const exists = cached.find((item) => item?.date === data?.date)
    const next = exists
      ? cached.map((item) => (item?.date === data?.date ? data : item))
      : [...cached, data]
    saveCache(key, next)
  }

  return data
}

async function postCheckinNetwork(payload) {
  const { data } = await api.post('/api/checkin', payload)
  return data
}

function applyStudyLogCache(userId, log) {
  const key = cacheKey('studyLogs', userId)
  const cached = loadCache(key)
  if (Array.isArray(cached)) {
    const exists = cached.find((item) => item?.date === log?.date)
    const next = exists
      ? cached.map((item) => (item?.date === log?.date ? log : item))
      : [...cached, log]
    saveCache(key, next)
  }
}

export async function checkin(payload) {
  try {
    const data = await postCheckinNetwork(payload)

    const userId = payload?.userId
    if (userId) {
      applyStudyLogCache(userId, data)
    }

    return data
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error
    }

    const userId = payload?.userId
    const date = payload?.date
    if (!userId || !date) {
      throw error
    }

    enqueueOp({
      id: opId(),
      type: 'checkin',
      userId,
      payload,
      createdAt: Date.now(),
    })

    const key = cacheKey('studyLogs', userId)
    const cached = loadCache(key)
    const list = Array.isArray(cached) ? cached : []
    const existing = list.find((item) => item?.date === date)
    const mode = payload?.mode === 'increment' ? 'increment' : 'replace'
    const minutes = Number.parseInt(String(payload?.duration), 10)
    const content = String(payload?.content ?? '').trim()
    const wantsFeedback =
      typeof payload?.generateFeedback === 'boolean'
        ? payload.generateFeedback
        : mode === 'replace'

    const offline = existing
      ? {
          ...existing,
          duration:
            mode === 'increment'
              ? (Number(existing.duration) || 0) + (Number(minutes) || 0)
              : Number(minutes) || 0,
          content:
            mode === 'increment'
              ? content
                ? `${existing.content}\n${content}`.trim()
                : existing.content
              : content,
          aiFeedback: wantsFeedback ? '' : existing.aiFeedback ?? '',
        }
      : {
          id: Date.now(),
          userId,
          date,
          duration: mode === 'increment' ? Number(minutes) || 0 : Number(minutes) || 0,
          content: content || (mode === 'increment' ? `番茄钟专注 ${minutes} 分钟` : ''),
          aiFeedback: wantsFeedback ? '' : '',
          _offline: true,
        }

    const next = existing
      ? list.map((item) => (item?.date === date ? offline : item))
      : [...list, offline]
    saveCache(key, next)

    return offline
  }
}

export async function getTasks(userId) {
  const key = cacheKey('tasks', userId)
  try {
    const { data } = await api.get('/api/tasks', { params: { userId } })
    const merged = mergeTasksWithCache(userId, data)
    saveCache(key, merged)
    return merged
  } catch (error) {
    const cached = loadCache(key)
    if (cached) {
      return Array.isArray(cached) ? cached.map((item) => normalizeTaskTextFields(item)) : cached
    }
    throw error
  }
}

export async function getTaskOccurrences(userId, start, end) {
  const params = { userId }
  if (start) params.start = start
  if (end) params.end = end
  const { data } = await api.get('/api/task-occurrences', { params })
  return Array.isArray(data?.items)
    ? data.items.map((item) => normalizeTaskTextFields(item))
    : []
}

export async function createTask(userId, payload) {
  const taskPayload =
    payload && typeof payload === 'object'
      ? payload
      : { title: typeof payload === 'string' ? payload : '' }
  try {
    const { data } = await api.post('/api/tasks', { userId, ...taskPayload })
    const normalized = normalizeTaskTextFields(data)
    appendTaskCache(userId, normalized)
    return normalized
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error
    }

    const tempId = -Math.floor(Date.now() + Math.random() * 1000)
    const offline = {
      id: tempId,
      userId,
      isDone: false,
      ...taskPayload,
      _offline: true,
    }

    enqueueOp({
      id: opId(),
      type: 'task_create',
      userId,
      payload: { tempId, data: taskPayload },
      createdAt: Date.now(),
    })

    appendTaskCache(userId, offline)
    return offline
  }
}

async function patchTaskNetwork(id, updates) {
  const { data } = await api.patch(`/api/tasks/${id}`, updates)
  return data
}

function applyTaskCache(userId, task) {
  const key = cacheKey('tasks', userId)
  const cached = loadCache(key)
  if (Array.isArray(cached)) {
    saveCache(
      key,
      cached.map((item) => (item?.id === task?.id ? task : item))
    )
  }
}

export async function updateTask(userId, id, updates) {
  const normalizedId = Number(id)
  if (!Number.isFinite(normalizedId)) {
    throw new Error('invalid task id')
  }

  if (normalizedId <= 0) {
    enqueueOp({
      id: opId(),
      type: 'task_update',
      userId,
      payload: { id: normalizedId, updates },
      createdAt: Date.now(),
    })

    const key = cacheKey('tasks', userId)
    const cached = loadCache(key)
    const list = Array.isArray(cached) ? cached : []
    const existing = list.find((item) => item?.id === normalizedId)
    const offline = existing
      ? { ...existing, ...updates }
      : { id: normalizedId, userId, ...updates, _offline: true }
    const next = existing
      ? list.map((item) => (item?.id === normalizedId ? offline : item))
      : [...list, offline]
    saveCache(key, next)
    return offline
  }

  try {
    const data = await patchTaskNetwork(normalizedId, updates)
    const normalized = normalizeTaskTextFields(data)
    applyTaskCache(userId, normalized)
    return normalized
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error
    }

    enqueueOp({
      id: opId(),
      type: 'task_update',
      userId,
      payload: { id: normalizedId, updates },
      createdAt: Date.now(),
    })

    const key = cacheKey('tasks', userId)
    const cached = loadCache(key)
    const list = Array.isArray(cached) ? cached : []
    const existing = list.find((item) => item?.id === normalizedId)
    const offline = existing
      ? { ...existing, ...updates }
      : { id: normalizedId, userId, ...updates, _offline: true }
    const next = existing
      ? list.map((item) => (item?.id === normalizedId ? offline : item))
      : list
    saveCache(key, next)
    return offline
  }
}

export async function updateTaskOccurrence(userId, taskId, occurrenceDate, updates) {
  const normalizedTaskId = Number(taskId)
  if (!Number.isFinite(normalizedTaskId) || normalizedTaskId <= 0) {
    throw new Error('invalid task id')
  }
  if (!occurrenceDate || typeof occurrenceDate !== 'string') {
    throw new Error('invalid occurrence date')
  }
  const { data } = await api.patch('/api/task-occurrences', {
    userId,
    taskId: normalizedTaskId,
    occurrenceDate,
    updates,
  })
  return data?.item ? normalizeTaskTextFields(data.item) : null
}

async function deleteTaskNetwork(userId, id) {
  await api.delete(`/api/tasks/${id}`, { params: { userId } })
}

function removeTaskCache(userId, id) {
  const key = cacheKey('tasks', userId)
  const cached = loadCache(key)
  if (Array.isArray(cached)) {
    saveCache(
      key,
      cached.filter((item) => item?.id !== id)
    )
  }
}

export async function deleteTask(userId, id) {
  const normalizedId = Number(id)
  if (!Number.isFinite(normalizedId)) {
    throw new Error('invalid task id')
  }

  if (normalizedId <= 0) {
    const pending = getPendingOps(userId)
    const related = pending
      .filter((op) => {
        if (!op?.id) return false
        if (op?.type === 'task_create' && op?.payload?.tempId === normalizedId) return true
        if (op?.type === 'task_update' && op?.payload?.id === normalizedId) return true
        if (op?.type === 'task_delete' && op?.payload?.id === normalizedId) return true
        return false
      })
      .map((op) => op.id)

    if (related.length) {
      removeOpsById(related)
    }

    removeTaskCache(userId, normalizedId)
    return { ok: true, queued: true, localOnly: true }
  }

  try {
    await deleteTaskNetwork(userId, normalizedId)
    removeTaskCache(userId, normalizedId)
    return { ok: true }
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error
    }

    enqueueOp({
      id: opId(),
      type: 'task_delete',
      userId,
      payload: { id: normalizedId },
      createdAt: Date.now(),
    })

    removeTaskCache(userId, normalizedId)
    return { ok: true, queued: true }
  }
}

export async function getPushPublicKey() {
  const { data } = await api.get('/api/push/vapid-public-key')
  return data?.publicKey || ''
}

export async function subscribePush(userId, subscription) {
  const { data } = await api.post('/api/push/subscribe', { userId, subscription })
  return data
}

export async function unsubscribePush(userId, endpoint) {
  const { data } = await api.post('/api/push/unsubscribe', { userId, endpoint })
  return data
}

export async function syncPendingOps(userId) {
  const ops = getPendingOps(userId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  if (ops.length === 0) {
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

  const completedIds = []
  let succeeded = 0
  let failed = 0
  let blocked = null
  let blockedOp = null
  let blockedError = ''
  const tempTaskIdMap = new Map()

  for (const op of ops) {
    try {
      if (op.type === 'checkin') {
        const data = await postCheckinNetwork(op.payload)
        applyStudyLogCache(userId, data)
        completedIds.push(op.id)
        succeeded += 1
        continue
      }

      if (op.type === 'task_create') {
        const { tempId, title, plannedDate, data: payloadData } = op.payload || {}
        const taskPayload =
          payloadData && typeof payloadData === 'object'
            ? payloadData
            : { title, plannedDate }
        if (!Number.isFinite(tempId) || !taskPayload?.title) {
          completedIds.push(op.id)
          failed += 1
          continue
        }

        const { data } = await api.post('/api/tasks', { userId, ...taskPayload })
        const normalized = normalizeTaskTextFields(data)
        replaceTaskInCache(userId, tempId, normalized)
        replaceTaskIdInOrder(userId, tempId, normalized.id)
        replaceQueuedTaskId(userId, tempId, normalized.id)
        tempTaskIdMap.set(tempId, normalized.id)

        completedIds.push(op.id)
        succeeded += 1
        continue
      }

      if (op.type === 'task_update') {
        const { id, updates } = op.payload || {}
        const actualId = tempTaskIdMap.get(id) ?? id
        const data = await patchTaskNetwork(actualId, updates)
        applyTaskCache(userId, normalizeTaskTextFields(data))
        completedIds.push(op.id)
        succeeded += 1
        continue
      }

      if (op.type === 'task_delete') {
        const { id } = op.payload || {}
        const actualId = tempTaskIdMap.get(id) ?? id
        if (!Number.isFinite(actualId) || actualId <= 0) {
          completedIds.push(op.id)
          succeeded += 1
          continue
        }
        await deleteTaskNetwork(userId, actualId)
        removeTaskCache(userId, actualId)
        completedIds.push(op.id)
        succeeded += 1
        continue
      }

      completedIds.push(op.id)
      failed += 1
    } catch (error) {
      if (isNetworkError(error)) {
        blocked = 'network'
        blockedOp = op
        blockedError = String(error?.message ?? 'network error')
        break
      }
      failed += 1
      blocked = 'conflict'
      blockedOp = op
      if (error?.response) {
        const status = error.response.status
        const data = error.response.data
        const detail =
          typeof data === 'string'
            ? data
            : typeof data?.error === 'string'
              ? data.error
              : data
                ? JSON.stringify(data)
                : ''
        blockedError = `${status}${detail ? ` ${detail}` : ''}`.trim()
      } else {
        blockedError = String(error?.message ?? 'request failed')
      }
      break
    }
  }

  removeOpsById(completedIds)

  return { ok: true, processed: succeeded + failed, succeeded, failed, blocked, blockedOp, blockedError }
}

export async function decomposeTasks(goal, constraints, ai) {
  const { data } = await api.post('/api/ai/tasks/decompose', { goal, constraints, ai })
  return data?.tasks ?? []
}

export async function generateReviewQuestions(userId, date, ai) {
  const { data } = await api.post('/api/ai/review', { userId, date, ai })
  return data?.questions ?? []
}

export async function generateFlashcards(userId, date, count, ai) {
  const { data } = await api.post('/api/ai/flashcards', { userId, date, count, ai })
  return data?.cards ?? []
}

export async function pingAi(ai) {
  const { data } = await api.post('/api/ai/ping', { ai })
  return data
}

export async function listAiModels(ai, query, limit, refresh) {
  const payload = { ai }
  const q = typeof query === 'string' ? query.trim() : ''
  if (q) {
    payload.q = q
  }
  if (Number.isFinite(limit) && limit > 0) {
    payload.limit = limit
  }
  if (refresh === true) {
    payload.refresh = true
  }
  const { data } = await api.post('/api/ai/models', payload)
  return {
    models: Array.isArray(data?.models) ? data.models : [],
    total: Number(data?.total) || 0,
    cachedAt: Number(data?.cachedAt) || 0,
  }
}

export async function generateReport(userId, payload) {
  const { data } = await api.post('/api/ai/report', { userId, ...payload })
  return data
}
