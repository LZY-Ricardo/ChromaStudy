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

