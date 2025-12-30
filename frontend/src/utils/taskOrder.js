const ORDER_PREFIX = 'chroma_task_order_'

export function loadTaskOrder(userId) {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(`${ORDER_PREFIX}${userId}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTaskOrder(userId, order) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(`${ORDER_PREFIX}${userId}`, JSON.stringify(order))
  } catch {
    // ignore
  }
}

export function replaceTaskIdInOrder(userId, fromId, toId) {
  const id = Number(userId)
  if (!Number.isFinite(id) || id <= 0) return []

  const from = Number(fromId)
  const to = Number(toId)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return loadTaskOrder(id)

  const order = loadTaskOrder(id)
  const seen = new Set()
  const next = []

  for (const item of order) {
    const value = item === from ? to : item
    if (seen.has(value)) continue
    seen.add(value)
    next.push(value)
  }

  saveTaskOrder(id, next)
  return next
}

export function sortByOrder(items, order) {
  const map = new Map(items.map((item) => [item.id, item]))
  const sorted = []
  for (const id of order) {
    const hit = map.get(id)
    if (!hit) continue
    sorted.push(hit)
    map.delete(id)
  }
  const rest = Array.from(map.values()).sort((a, b) => a.id - b.id)
  return [...sorted, ...rest]
}
