const USER_KEY = 'chroma_user'

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
