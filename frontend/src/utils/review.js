const REVIEW_PREFIX = 'chroma_review_'

export function loadReview(userId, date) {
  if (typeof window === 'undefined') return null
  if (!userId || !date) return null
  try {
    const raw = window.localStorage.getItem(`${REVIEW_PREFIX}${userId}_${date}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveReview(userId, date, review) {
  if (typeof window === 'undefined') return
  if (!userId || !date) return
  try {
    window.localStorage.setItem(`${REVIEW_PREFIX}${userId}_${date}`, JSON.stringify(review))
  } catch {
    // ignore
  }
}

