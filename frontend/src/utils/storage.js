const USER_KEY = 'chroma_user'
const AI_KEY = 'chroma_ai'
const AI_EVENT = 'chroma_ai_changed'

function buildDefaultAiState() {
  return {
    version: 2,
    activeProfileId: 'local',
    profiles: [
      {
        id: 'local',
        name: '本地 Ollama',
        provider: 'ollama',
        ollama: { host: 'http://localhost:11434', model: 'llama3' },
        openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '', presetId: '' },
        health: null,
      },
    ],
  }
}

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

function normalizeProvider(value) {
  return value === 'openai' ? 'openai' : 'ollama'
}

function normalizeAiConfig(config) {
  const provider = normalizeProvider(config?.provider)
  const ollama = {
    host: normalizeString(config?.ollama?.host).trim(),
    model: normalizeString(config?.ollama?.model).trim(),
  }
  const openai = {
    baseUrl: normalizeString(config?.openai?.baseUrl).trim(),
    model: normalizeString(config?.openai?.model).trim(),
    apiKey: normalizeString(config?.openai?.apiKey).trim(),
    presetId: normalizeString(config?.openai?.presetId).trim(),
  }

  return { provider, ollama, openai }
}

function normalizeProfile(profile) {
  const id = normalizeString(profile?.id).trim()
  const name = normalizeString(profile?.name).trim()
  const config = normalizeAiConfig(profile)
  const health = profile?.health && typeof profile.health === 'object' ? profile.health : null

  return {
    id,
    name,
    provider: config.provider,
    ollama: config.ollama,
    openai: config.openai,
    health: health
      ? {
          ok: Boolean(health.ok),
          at: Number(health.at) || 0,
          message: normalizeString(health.message).trim(),
        }
      : null,
  }
}

function normalizeAiState(raw) {
  const activeProfileId = normalizeString(raw?.activeProfileId).trim()
  const profiles = Array.isArray(raw?.profiles) ? raw.profiles.map(normalizeProfile) : []
  const normalizedProfiles = profiles.filter((p) => p.id)

  if (normalizedProfiles.length === 0) {
    return null
  }

  const activeId =
    activeProfileId && normalizedProfiles.some((p) => p.id === activeProfileId)
      ? activeProfileId
      : normalizedProfiles[0].id

  return {
    version: 2,
    activeProfileId: activeId,
    profiles: normalizedProfiles,
  }
}

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

export function loadAiState() {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = safeParse(window.localStorage.getItem(AI_KEY))
  if (!raw) return buildDefaultAiState()

  const state = normalizeAiState(raw)
  if (state) return state

  if (typeof raw === 'object' && raw) {
    const config = normalizeAiConfig(raw)
    const id = 'default'
    return {
      version: 2,
      activeProfileId: id,
      profiles: [
        {
          id,
          name: '默认',
          ...config,
          health: null,
        },
      ],
    }
  }

  return buildDefaultAiState()
}

export function loadAiConfig() {
  if (typeof window === 'undefined') {
    return null
  }
  const state = loadAiState()
  if (!state) return null
  const active = state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0]
  return active ? normalizeAiConfig(active) : null
}

export function saveAiState(state) {
  if (typeof window === 'undefined') {
    return
  }
  const normalized = normalizeAiState(state)
  if (!normalized) {
    return
  }
  window.localStorage.setItem(AI_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(AI_EVENT))
}

export function saveAiConfig(config) {
  const existing = loadAiState()
  if (!existing) {
    saveAiState({
      version: 2,
      activeProfileId: 'default',
      profiles: [{ id: 'default', name: '默认', ...normalizeAiConfig(config), health: null }],
    })
    return
  }

  const nextConfig = normalizeAiConfig(config)
  const profiles = existing.profiles.map((p) =>
    p.id === existing.activeProfileId ? { ...p, ...nextConfig } : p
  )
  saveAiState({ ...existing, profiles })
}

export function setActiveAiProfile(profileId) {
  const state = loadAiState()
  const id = normalizeString(profileId).trim()
  if (!state || !id) return false
  if (!state.profiles.some((p) => p.id === id)) return false
  if (state.activeProfileId === id) return true
  saveAiState({ ...state, activeProfileId: id })
  return true
}

export function upsertAiProfile(profile) {
  const state = loadAiState()
  const normalized = normalizeProfile(profile)
  if (!normalized.id) return false

  const next = state ?? { version: 2, activeProfileId: normalized.id, profiles: [] }
  const exists = next.profiles.some((p) => p.id === normalized.id)
  const profiles = exists
    ? next.profiles.map((p) => (p.id === normalized.id ? { ...p, ...normalized } : p))
    : [...next.profiles, normalized]

  saveAiState({
    ...next,
    activeProfileId: next.activeProfileId || normalized.id,
    profiles,
  })

  return true
}

export function deleteAiProfile(profileId) {
  const state = loadAiState()
  const id = normalizeString(profileId).trim()
  if (!state || !id) return false
  if (state.profiles.length <= 1) return false
  if (!state.profiles.some((p) => p.id === id)) return false

  const profiles = state.profiles.filter((p) => p.id !== id)
  const activeProfileId =
    state.activeProfileId === id ? profiles[0]?.id ?? state.activeProfileId : state.activeProfileId

  saveAiState({ ...state, activeProfileId, profiles })
  return true
}

export function clearAiConfig() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(AI_KEY)
  window.dispatchEvent(new Event(AI_EVENT))
}
