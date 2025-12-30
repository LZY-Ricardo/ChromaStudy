const USER_KEY = 'chroma_user'
const AI_KEY = 'chroma_ai'

export function loadUser() {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveUser(user) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearUser() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(USER_KEY)
}

export function loadAiConfig() {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(AI_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveAiConfig(config) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(AI_KEY, JSON.stringify(config))
}

export function clearAiConfig() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(AI_KEY)
}
