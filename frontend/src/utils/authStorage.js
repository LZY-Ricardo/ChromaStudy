const AUTH_KEY = 'chroma_auth'
const AUTH_EVENT = 'chroma_auth_changed'

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = Number(raw.id)
  const username = normalizeString(raw.username).trim()
  if (!Number.isFinite(id) || id <= 0 || !username) return null
  return { id, username }
}

function normalizeAuth(raw) {
  if (!raw || typeof raw !== 'object') return null
  const user = normalizeUser(raw.user)
  const accessToken = normalizeString(raw.accessToken).trim()
  const refreshToken = normalizeString(raw.refreshToken).trim()
  if (!user || !accessToken || !refreshToken) return null
  return { user, accessToken, refreshToken }
}

function emitAuthChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUTH_EVENT))
}

export function loadAuth() {
  if (typeof window === 'undefined') return null
  const raw = safeParse(window.localStorage.getItem(AUTH_KEY))
  return normalizeAuth(raw)
}

export function saveAuth(next) {
  if (typeof window === 'undefined') return
  const normalized = normalizeAuth(next)
  if (!normalized) return
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(normalized))
  emitAuthChanged()
}

export function clearAuth() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_KEY)
  emitAuthChanged()
}

export function loadAccessToken() {
  return loadAuth()?.accessToken || ''
}

export function loadRefreshToken() {
  return loadAuth()?.refreshToken || ''
}

export function loadAuthedUser() {
  return loadAuth()?.user || null
}

