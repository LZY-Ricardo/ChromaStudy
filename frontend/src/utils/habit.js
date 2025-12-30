const WEEKLY_GOAL_PREFIX = 'chroma_weekly_goal_'
const DEFAULT_WEEKLY_GOAL = 300

export function loadWeeklyGoal(userId) {
  if (typeof window === 'undefined') return DEFAULT_WEEKLY_GOAL
  try {
    const raw = window.localStorage.getItem(`${WEEKLY_GOAL_PREFIX}${userId}`)
    const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_WEEKLY_GOAL
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WEEKLY_GOAL
    return parsed
  } catch {
    return DEFAULT_WEEKLY_GOAL
  }
}

export function saveWeeklyGoal(userId, minutes) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${WEEKLY_GOAL_PREFIX}${userId}`, String(minutes))
  } catch {
    // ignore
  }
}

