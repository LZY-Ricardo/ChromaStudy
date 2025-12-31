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

export function sortByTaskOrder(items, order) {
  const index = new Map(order.map((id, idx) => [id, idx]))
  return [...items].sort((a, b) => {
    const aKey = Number.isFinite(a?.taskId) ? a.taskId : a.id
    const bKey = Number.isFinite(b?.taskId) ? b.taskId : b.id
    const aIndex = index.has(aKey) ? index.get(aKey) : Number.MAX_SAFE_INTEGER
    const bIndex = index.has(bKey) ? index.get(bKey) : Number.MAX_SAFE_INTEGER
    if (aIndex !== bIndex) return aIndex - bIndex
    const aDate = String(a?.plannedDate || '')
    const bDate = String(b?.plannedDate || '')
    return aDate.localeCompare(bDate)
  })
}
