import axios from 'axios'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
})

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

export async function login(username, password) {
  const { data } = await api.post('/api/login', { username, password })
  return data.user
}

export async function getUsers() {
  const { data } = await api.get('/api/users')
  return data
}

export async function getStudyLogs(userId) {
  const key = cacheKey('studyLogs', userId)
  try {
    const { data } = await api.get('/api/study-logs', { params: { userId } })
    saveCache(key, data)
    return data
  } catch (error) {
    const cached = loadCache(key)
    if (cached) return cached
    throw error
  }
}

export async function getStudyLogByDate(userId, date) {
  const { data } = await api.get(`/api/study-logs/${date}`, { params: { userId } })
  return data
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

export async function checkin(payload) {
  const { data } = await api.post('/api/checkin', payload)

  const userId = payload?.userId
  if (userId) {
    const key = cacheKey('studyLogs', userId)
    const cached = loadCache(key)
    if (Array.isArray(cached)) {
      const exists = cached.find((item) => item?.date === data?.date)
      const next = exists
        ? cached.map((item) => (item?.date === data?.date ? data : item))
        : [...cached, data]
      saveCache(key, next)
    }
  }

  return data
}

export async function getTasks(userId) {
  const key = cacheKey('tasks', userId)
  try {
    const { data } = await api.get('/api/tasks', { params: { userId } })
    saveCache(key, data)
    return data
  } catch (error) {
    const cached = loadCache(key)
    if (cached) return cached
    throw error
  }
}

export async function createTask(userId, title) {
  const { data } = await api.post('/api/tasks', { userId, title })

  const key = cacheKey('tasks', userId)
  const cached = loadCache(key)
  if (Array.isArray(cached)) {
    saveCache(key, [...cached, data])
  }

  return data
}

export async function updateTask(id, updates) {
  const { data } = await api.patch(`/api/tasks/${id}`, updates)
  const userId = data?.userId
  if (userId) {
    const key = cacheKey('tasks', userId)
    const cached = loadCache(key)
    if (Array.isArray(cached)) {
      saveCache(
        key,
        cached.map((item) => (item?.id === data?.id ? data : item))
      )
    }
  }
  return data
}

export async function deleteTask(userId, id) {
  await api.delete(`/api/tasks/${id}`, { params: { userId } })

  const key = cacheKey('tasks', userId)
  const cached = loadCache(key)
  if (Array.isArray(cached)) {
    saveCache(
      key,
      cached.filter((item) => item?.id !== id)
    )
  }

  return { ok: true }
}

export async function decomposeTasks(goal, constraints, ai) {
  const { data } = await api.post('/api/ai/tasks/decompose', { goal, constraints, ai })
  return data?.tasks ?? []
}

export async function generateReviewQuestions(userId, date, ai) {
  const { data } = await api.post('/api/ai/review', { userId, date, ai })
  return data?.questions ?? []
}

export async function generateReport(userId, payload) {
  const { data } = await api.post('/api/ai/report', { userId, ...payload })
  return data
}
