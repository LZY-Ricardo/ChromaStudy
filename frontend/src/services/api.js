import axios from 'axios'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
})

export async function login(username, password) {
  const { data } = await api.post('/api/login', { username, password })
  return data.user
}

export async function getStudyLogs(userId) {
  const { data } = await api.get('/api/study-logs', { params: { userId } })
  return data
}

export async function checkin(payload) {
  const { data } = await api.post('/api/checkin', payload)
  return data
}

export async function getTasks(userId) {
  const { data } = await api.get('/api/tasks', { params: { userId } })
  return data
}

export async function createTask(userId, title) {
  const { data } = await api.post('/api/tasks', { userId, title })
  return data
}

export async function updateTask(id, updates) {
  const { data } = await api.patch(`/api/tasks/${id}`, updates)
  return data
}
