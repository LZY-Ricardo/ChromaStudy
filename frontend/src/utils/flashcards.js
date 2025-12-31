import dayjs from 'dayjs'

const REVIEW_CARDS_PREFIX = 'chroma_review_cards_v1_'
const DEFAULT_EASE_FACTOR = 2.5
const MIN_EASE_FACTOR = 1.3

function storageKey(userId) {
  return `${REVIEW_CARDS_PREFIX}${userId}`
}

function normalizeDateKey(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  return text
}

function todayKey() {
  return dayjs().format('YYYY-MM-DD')
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto?.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function loadReviewCards(userId) {
  if (typeof window === 'undefined') return []
  if (!userId) return []
  const data = safeParse(window.localStorage.getItem(storageKey(userId)))
  return Array.isArray(data) ? data : []
}

export function saveReviewCards(userId, cards) {
  if (typeof window === 'undefined') return
  if (!userId) return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(Array.isArray(cards) ? cards : []))
  } catch {
    // ignore
  }
}

export function makeReviewCard({ type, front, back, sourceDate, createdAt }) {
  const now = Number.isFinite(createdAt) ? createdAt : Date.now()
  const normalizedFront = String(front || '').trim()
  const normalizedBack = String(back || '').trim()
  const date = normalizeDateKey(sourceDate) || todayKey()

  return {
    id: newId(),
    type: typeof type === 'string' && type.trim() ? type.trim() : 'short_answer',
    front: normalizedFront,
    back: normalizedBack,
    source: date ? { date } : {},
    srs: {
      repetition: 0,
      intervalDays: 0,
      easeFactor: DEFAULT_EASE_FACTOR,
      dueDate: date || todayKey(),
      lastReviewedAt: null,
      lastGrade: null,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function addReviewCards(existingCards, cardsToAdd) {
  const list = Array.isArray(existingCards) ? existingCards : []
  const incoming = Array.isArray(cardsToAdd) ? cardsToAdd : []
  if (incoming.length === 0) return list

  const map = new Map(list.map((card) => [card?.id, card]).filter(([id]) => id))
  for (const card of incoming) {
    if (!card?.id) continue
    map.set(card.id, card)
  }
  return Array.from(map.values()).filter(Boolean)
}

export function updateReviewCard(existingCards, nextCard) {
  if (!nextCard?.id) return Array.isArray(existingCards) ? existingCards : []
  const list = Array.isArray(existingCards) ? existingCards : []
  return list.map((card) => (card?.id === nextCard.id ? nextCard : card))
}

export function removeReviewCard(existingCards, cardId) {
  const list = Array.isArray(existingCards) ? existingCards : []
  const targetId = String(cardId || '')
  if (!targetId) return list
  return list.filter((card) => card?.id !== targetId)
}

export function getDueReviewCards(existingCards, dateKey = todayKey()) {
  const key = normalizeDateKey(dateKey) || todayKey()
  const list = Array.isArray(existingCards) ? existingCards : []
  return list
    .filter((card) => {
      const dueDate = normalizeDateKey(card?.srs?.dueDate)
      if (!dueDate) return true
      return dueDate <= key
    })
    .sort((a, b) => String(a?.srs?.dueDate || '').localeCompare(String(b?.srs?.dueDate || '')))
}

export function countDueReviewCards(userId, dateKey = todayKey()) {
  const cards = loadReviewCards(userId)
  return getDueReviewCards(cards, dateKey).length
}

export function applySm2Grade(card, grade, dateKey = todayKey()) {
  const today = normalizeDateKey(dateKey) || todayKey()
  const srs = card?.srs && typeof card.srs === 'object' ? card.srs : {}

  const repetition = Number.isFinite(srs.repetition) ? srs.repetition : 0
  const intervalDays = Number.isFinite(srs.intervalDays) ? srs.intervalDays : 0
  const easeFactor = Number.isFinite(srs.easeFactor) ? srs.easeFactor : DEFAULT_EASE_FACTOR

  const q =
    grade === 'again'
      ? 1
      : grade === 'hard'
        ? 3
        : grade === 'easy'
          ? 5
          : 4

  let nextRepetition = repetition
  let nextInterval = intervalDays
  let nextEase = easeFactor

  if (q < 3) {
    nextRepetition = 0
    nextInterval = 1
  } else {
    if (repetition === 0) {
      nextInterval = 1
    } else if (repetition === 1) {
      nextInterval = 6
    } else {
      nextInterval = Math.round(Math.max(1, intervalDays) * easeFactor)
    }

    const diff = 5 - q
    nextEase = easeFactor + (0.1 - diff * (0.08 + diff * 0.02))
    nextEase = Math.max(MIN_EASE_FACTOR, Number(nextEase.toFixed(2)))
    nextRepetition = repetition + 1
  }

  const dueDate = dayjs(today).add(nextInterval, 'day').format('YYYY-MM-DD')

  return {
    ...card,
    srs: {
      repetition: nextRepetition,
      intervalDays: nextInterval,
      easeFactor: nextEase,
      dueDate,
      lastReviewedAt: Date.now(),
      lastGrade: grade,
    },
    updatedAt: Date.now(),
  }
}

