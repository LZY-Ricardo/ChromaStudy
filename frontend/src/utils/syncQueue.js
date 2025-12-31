const QUEUE_KEY = 'chroma_sync_queue_v1'

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function readAll() {
  if (typeof window === 'undefined') return []
  const parsed = safeParse(window.localStorage.getItem(QUEUE_KEY))
  return Array.isArray(parsed) ? parsed : []
}

function writeAll(queue) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // ignore
  }
}

export function getPendingOps(userId) {
  const id = Number(userId)
  if (!Number.isFinite(id) || id <= 0) return []
  return readAll().filter((op) => op?.userId === id)
}

export function getPendingOpsCount(userId) {
  return getPendingOps(userId).length
}

export function enqueueOp(op) {
  if (typeof window === 'undefined') return null
  const next = {
    id: op?.id,
    type: op?.type,
    userId: op?.userId,
    payload: op?.payload,
    createdAt: op?.createdAt ?? Date.now(),
  }

  if (!next.id || !next.type || !Number.isFinite(next.userId) || next.userId <= 0) {
    return null
  }

  const queue = readAll()
  queue.push(next)
  writeAll(queue)
  return next
}

export function removeOpsById(ids) {
  if (typeof window === 'undefined') return
  const set = new Set(ids)
  if (set.size === 0) return
  const queue = readAll().filter((op) => !set.has(op?.id))
  writeAll(queue)
}

export function updateOpById(id, updates) {
  if (typeof window === 'undefined') return null
  if (!id || !updates || typeof updates !== 'object') return null

  const queue = readAll()
  let updated = null

  const next = queue.map((op) => {
    if (op?.id !== id) return op

    updated = {
      ...op,
      ...updates,
      id: op.id,
      type: op.type,
      userId: op.userId,
      createdAt: op.createdAt,
    }

    return updated
  })

  if (!updated) return null
  writeAll(next)
  return updated
}

export function bumpOpToEnd(id) {
  if (typeof window === 'undefined') return null
  if (!id) return null

  const queue = readAll()
  const index = queue.findIndex((op) => op?.id === id)
  if (index < 0) return null

  const target = queue[index]
  const updated = { ...target, createdAt: Date.now() }
  const next = [...queue.slice(0, index), ...queue.slice(index + 1), updated]

  writeAll(next)
  return updated
}

export function replaceQueuedTaskId(userId, tempId, actualId) {
  if (typeof window === 'undefined') return
  const id = Number(userId)
  if (!Number.isFinite(id) || id <= 0) return

  const from = Number(tempId)
  const to = Number(actualId)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return

  const queue = readAll().map((op) => {
    if (op?.userId !== id) return op

    if (op?.type === 'task_update' && op?.payload?.id === from) {
      return { ...op, payload: { ...op.payload, id: to } }
    }

    if (op?.type === 'task_delete' && op?.payload?.id === from) {
      return { ...op, payload: { ...op.payload, id: to } }
    }

    return op
  })

  writeAll(queue)
}

export function clearPendingOps(userId) {
  if (typeof window === 'undefined') return
  const id = Number(userId)
  if (!Number.isFinite(id) || id <= 0) return
  const queue = readAll().filter((op) => op?.userId !== id)
  writeAll(queue)
}
