import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  ActionSheet,
  Button,
  Card,
  Dialog,
  Input,
  List,
  Selector,
  SwipeAction,
  Switch,
  Tag,
  TextArea,
  Toast,
  DatePicker,
} from 'antd-mobile'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, PencilLine, Trash2, Share2, Calendar, AlertCircle, Clock, ListTodo } from 'lucide-react'
import {
  checkin,
  createTask,
  deleteTask,
  decomposeTasks,
  generateAiFeedback,
  getTaskOccurrences,
  getStudyLogs,
  getTasks,
  getStudyLogByDate,
  updateTaskOccurrence,
  updateTask,
} from '../services/api.js'
import { loadAiConfig } from '../utils/storage.js'
import { loadTaskOrder, saveTaskOrder, sortByOrder, sortByTaskOrder } from '../utils/taskOrder.js'
import { loadWeeklyGoal } from '../utils/habit.js'
import { countDueReviewCards } from '../utils/flashcards.js'
import { useNavigate } from 'react-router-dom'
import ShareDialog from '../components/ShareCard.jsx'
import { ensurePushSubscription } from '../utils/push.js'

function SortableTaskItem({ task, disabled, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-60' : ''}>
      <List.Item
        extra={
          <div className="flex items-center gap-2">
            <Switch
              checked={task.isDone}
              disabled={disabled}
              onChange={(value) => onToggle?.(task, value)}
            />
            <button
              type="button"
              disabled={disabled}
              className="rounded-lg p-1 text-slate-400"
              aria-label="Drag"
              {...attributes}
              {...listeners}
            >
              <GripVertical size={18} />
            </button>
          </div>
        }
      >
        <span className={task.isDone ? 'line-through text-slate-400' : 'text-slate-900'}>
          {task.title}
        </span>
      </List.Item>
    </div>
  )
}

function CategoryPresetChips({ presets, value, onChange, className = '' }) {
  if (!Array.isArray(presets) || presets.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {presets.map((category) => {
        const active = value === category
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={`rounded-full border px-2 py-1 text-[11px] leading-none transition ${
              active
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}

function LabelPresetChips({ presets, value, onChange, className = '' }) {
  if (!Array.isArray(presets) || presets.length === 0) return null
  const current = parseLabelInput(value)
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {presets.map((label) => {
        const active = current.includes(label)
        return (
          <button
            key={label}
            type="button"
            onClick={() => {
              const next = active ? current.filter((item) => item !== label) : [...current, label]
              onChange(next.join(', '))
            }}
            className={`rounded-full border px-2 py-1 text-[11px] leading-none transition ${
              active
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// 任务日期分组辅助函数
function groupTasksByDate(tasks, todayKey) {
  const groups = {
    overdue: [], // 逾期任务（计划日期早于今天且未完成）
    today: [], // 今天任务
    tomorrow: [], // 明天任务
    thisWeek: [], // 本周剩余（后天到周日）
    future: [], // 未来（下周及以后）
    noDate: [], // 无日期
  }

  const today = dayjs(todayKey)
  const tomorrow = today.add(1, 'day')
  const weekEnd = today.endOf('week') // 周日

  for (const task of tasks) {
    if (task.isDone) continue // 已完成任务单独处理

    if (!task.plannedDate) {
      groups.noDate.push(task)
      continue
    }

    const plannedDate = dayjs(task.plannedDate)
    if (plannedDate.isBefore(today, 'day')) {
      groups.overdue.push(task)
    } else if (plannedDate.isSame(today, 'day')) {
      groups.today.push(task)
    } else if (plannedDate.isSame(tomorrow, 'day')) {
      groups.tomorrow.push(task)
    } else if (plannedDate.isBefore(weekEnd.add(1, 'day'), 'day')) {
      groups.thisWeek.push(task)
    } else {
      groups.future.push(task)
    }
  }

  return groups
}

// 日期分组标题配置
const DATE_GROUP_LABELS = {
  overdue: { label: '逾期', color: 'danger', icon: AlertCircle },
  today: { label: '今天', color: 'primary', icon: Clock },
  tomorrow: { label: '明天', color: 'default', icon: Calendar },
  thisWeek: { label: '本周晚些时候', color: 'default', icon: Calendar },
  future: { label: '未来', color: 'default', icon: Calendar },
  noDate: { label: '无日期', color: 'default', icon: null },
}

const PRIORITY_OPTIONS = [
  { label: '低', value: 1 },
  { label: '中', value: 2 },
  { label: '高', value: 3 },
]

const REPEAT_OPTIONS = [
  { label: '不重复', value: 'none' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
]

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const WEEKDAY_OPTIONS = [
  { label: '周一', value: 'MO' },
  { label: '周二', value: 'TU' },
  { label: '周三', value: 'WE' },
  { label: '周四', value: 'TH' },
  { label: '周五', value: 'FR' },
  { label: '周六', value: 'SA' },
  { label: '周日', value: 'SU' },
]
const FUTURE_PREVIEW_LIMIT = 10
const DEFAULT_CATEGORY_PRESETS = ['学习', '复习', '项目', '阅读', '运动', '生活']
const DEFAULT_LABEL_PRESETS = ['重点', '练习', '复盘', '阅读', '输出', '卡片']


function normalizeTimeInput(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null
}

function parseTimeListInput(value) {
  const raw = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (raw.length === 0) {
    return { ok: true, list: [] }
  }
  const list = []
  const seen = new Set()
  for (const item of raw) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item)) {
      return { ok: false, list: [], error: `提醒时间格式错误：${item}` }
    }
    if (seen.has(item)) continue
    seen.add(item)
    list.push(item)
  }
  return { ok: true, list }
}

function parseLabelInput(value) {
  const text = String(value || '').trim()
  if (!text) return []

  const parseJson = (input) => {
    try {
      return JSON.parse(input)
    } catch {
      return null
    }
  }

  const sanitizeLabelToken = (token) =>
    String(token ?? '')
      .trim()
      .replace(/^[\[\(\{"'`]+/g, '')
      .replace(/[\]\)\}"'`]+$/g, '')
      .trim()

  const parsed = parseJson(text)
  if (Array.isArray(parsed)) {
    return parsed.map(sanitizeLabelToken).filter(Boolean)
  }
  if (typeof parsed === 'string') {
    const parsed2 = parseJson(parsed)
    if (Array.isArray(parsed2)) {
      return parsed2.map(sanitizeLabelToken).filter(Boolean)
    }
  }

  return text
    .split(/[,，]/)
    .map(sanitizeLabelToken)
    .filter(Boolean)
}

function formatLabelListInput(value) {
  return String(value || '')
    .replace(/[\s，、]+/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,/, '')
}

function formatTimeInput(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 4)
  if (!digits) return ''
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function formatTimeListInput(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 24)
  if (!digits) return ''
  const chunks = []
  for (let index = 0; index < digits.length; index += 4) {
    chunks.push(digits.slice(index, index + 4))
  }
  return chunks
    .map((chunk) => {
      if (chunk.length <= 2) return chunk
      return `${chunk.slice(0, 2)}:${chunk.slice(2)}`
    })
    .join(',')
}

function parseRepeatRule(rule) {
  const text = String(rule || '').toUpperCase()
  if (!text) return { type: 'none', days: [] }
  if (text.includes('FREQ=DAILY')) return { type: 'daily', days: [] }
  if (text.includes('FREQ=MONTHLY')) return { type: 'monthly', days: [] }
  if (text.includes('FREQ=WEEKLY')) {
    const match = text.match(/BYDAY=([A-Z,]+)/)
    const days = match ? match[1].split(',').filter(Boolean) : []
    return { type: 'weekly', days }
  }
  return { type: 'none', days: [] }
}

function buildRepeatRule({ type, days, plannedDate }) {
  if (!type || type === 'none') {
    return { repeatRule: null, repeatStartDate: null }
  }
  const startDate = plannedDate || dayjs().format('YYYY-MM-DD')
  if (type === 'daily') {
    return { repeatRule: 'FREQ=DAILY', repeatStartDate: startDate }
  }
  if (type === 'weekly') {
    const fallbackDay = WEEKDAY_CODES[dayjs(startDate).day()]
    const byDay = Array.isArray(days) && days.length > 0 ? days : [fallbackDay]
    return { repeatRule: `FREQ=WEEKLY;BYDAY=${byDay.join(',')}`, repeatStartDate: startDate }
  }
  if (type === 'monthly') {
    const byMonthDay = dayjs(startDate).date()
    return {
      repeatRule: `FREQ=MONTHLY;BYMONTHDAY=${byMonthDay}`,
      repeatStartDate: startDate,
    }
  }
  return { repeatRule: null, repeatStartDate: null }
}

function Today({ user, syncTick }) {
  const navigate = useNavigate()
  const todayLabel = dayjs().format('dddd, MMM D')
  const todayKey = dayjs().format('YYYY-MM-DD')
  const [tasks, setTasks] = useState([])
  const [taskItems, setTaskItems] = useState([])
  const [taskOrder, setTaskOrder] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [manageTasks, setManageTasks] = useState(false)
  const [showDoneTasks, setShowDoneTasks] = useState(false)
  const [taskViewMode, setTaskViewMode] = useState('focus') // 'focus' | 'all'
  const [futureExpanded, setFutureExpanded] = useState(false)
  const [duration, setDuration] = useState('')
  const [content, setContent] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPlannedDate, setTaskPlannedDate] = useState(null)
  const [taskDescription, setTaskDescription] = useState('')
  const [taskDueTime, setTaskDueTime] = useState('')
  const [taskPriority, setTaskPriority] = useState(null)
  const [taskCategory, setTaskCategory] = useState('')
  const [taskLabels, setTaskLabels] = useState('')
  const [taskRepeatType, setTaskRepeatType] = useState('none')
  const [taskRepeatDays, setTaskRepeatDays] = useState([])
  const [taskReminderTimes, setTaskReminderTimes] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState(null)
  const [editingTask, setEditingTask] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingPlannedDate, setEditingPlannedDate] = useState(null)
  const [editingDescription, setEditingDescription] = useState('')
  const [editingDueTime, setEditingDueTime] = useState('')
  const [editingPriority, setEditingPriority] = useState(null)
  const [editingCategory, setEditingCategory] = useState('')
  const [editingLabels, setEditingLabels] = useState('')
  const [editingRepeatType, setEditingRepeatType] = useState('none')
  const [editingRepeatDays, setEditingRepeatDays] = useState([])
  const [editingReminderTimes, setEditingReminderTimes] = useState('')
  const [editingScope, setEditingScope] = useState('series')
  const [editDetailOpen, setEditDetailOpen] = useState(false)
  const [showEditDatePicker, setShowEditDatePicker] = useState(false)
  const [showSuggestDialog, setShowSuggestDialog] = useState(false)
  const feedbackPollingRef = useRef(false)
  const [aiDecomposeOpen, setAiDecomposeOpen] = useState(false)
  const [aiGoal, setAiGoal] = useState('')
  const [aiConstraints, setAiConstraints] = useState('')
  const [aiGeneratedTasks, setAiGeneratedTasks] = useState([])
  const [aiAddOpen, setAiAddOpen] = useState(false)
  const [aiTaskDrafts, setAiTaskDrafts] = useState([])
  const [aiSelectedIds, setAiSelectedIds] = useState([])
  const [aiBatchPlannedDate, setAiBatchPlannedDate] = useState(null)
  const [aiBatchDueTime, setAiBatchDueTime] = useState('')
  const [aiBatchPriority, setAiBatchPriority] = useState(null)
  const [aiBatchCategory, setAiBatchCategory] = useState('')
  const [aiBatchLabels, setAiBatchLabels] = useState('')
  const [aiBatchRepeatType, setAiBatchRepeatType] = useState('none')
  const [aiBatchRepeatDays, setAiBatchRepeatDays] = useState([])
  const [aiBatchReminderTimes, setAiBatchReminderTimes] = useState('')
  const [aiEditingDraft, setAiEditingDraft] = useState(null)
  const [showAiBatchDatePicker, setShowAiBatchDatePicker] = useState(false)
  const [showAiEditDatePicker, setShowAiEditDatePicker] = useState(false)
  const [aiWorking, setAiWorking] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [showFillPrompt, setShowFillPrompt] = useState(false)
  const [generatedContent, setGeneratedContent] = useState('')

  const todayLog = useMemo(
    () => logs.find((log) => log.date === todayKey),
    [logs, todayKey]
  )
  const completedCount = taskItems.filter((task) => task.isDone).length

  const occurrenceRange = useMemo(() => {
    const start = dayjs(todayKey).subtract(30, 'day').format('YYYY-MM-DD')
    const end = dayjs(todayKey).add(90, 'day').format('YYYY-MM-DD')
    return { start, end }
  }, [todayKey])

  // 按日期分组任务
  const taskGroups = useMemo(() => {
    const grouped = groupTasksByDate(taskItems, todayKey)
    // 对每个分组内的任务按排序顺序排列
    return Object.fromEntries(
      Object.entries(grouped).map(([key, items]) => [key, sortByTaskOrder(items, taskOrder)])
    )
  }, [taskItems, taskOrder, todayKey])

  const manageGroups = useMemo(() => {
    const grouped = groupTasksByDate(tasks, todayKey)
    return Object.fromEntries(
      Object.entries(grouped).map(([key, items]) => [key, sortByOrder(items, taskOrder)])
    )
  }, [tasks, taskOrder, todayKey])

  const categoryPresets = useMemo(() => {
    const counts = new Map()
    for (const task of tasks) {
      const category = String(task?.category ?? '').trim()
      if (!category) continue
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }

    const fromHistory = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => category)

    const merged = []
    const seen = new Set()
    for (const category of [...fromHistory, ...DEFAULT_CATEGORY_PRESETS]) {
      if (!category) continue
      if (seen.has(category)) continue
      seen.add(category)
      merged.push(category)
    }
    return merged.slice(0, 8)
  }, [tasks])

  const labelPresets = useMemo(() => {
    const counts = new Map()
    for (const task of tasks) {
      const rawLabels = Array.isArray(task?.labels)
        ? task.labels
        : typeof task?.labels === 'string'
          ? parseLabelInput(task.labels)
          : []
      for (const label of rawLabels) {
        const trimmed = String(label || '').trim()
        if (!trimmed) continue
        counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
      }
    }

    const fromHistory = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label)

    const merged = []
    const seen = new Set()
    for (const label of [...fromHistory, ...DEFAULT_LABEL_PRESETS]) {
      if (!label) continue
      if (seen.has(label)) continue
      seen.add(label)
      merged.push(label)
    }
    return merged.slice(0, 8)
  }, [tasks])

  // 今日专注模式：只显示逾期、今天、无日期的任务
  const focusModeGroups = useMemo(() => {
    return {
      overdue: taskGroups.overdue,
      today: taskGroups.today,
      noDate: taskGroups.noDate,
    }
  }, [taskGroups])

  const manageFocusGroups = useMemo(() => {
    return {
      overdue: manageGroups.overdue,
      today: manageGroups.today,
      noDate: manageGroups.noDate,
    }
  }, [manageGroups])

  const displayedManageGroups = taskViewMode === 'focus' ? manageFocusGroups : manageGroups
  const allAiSelected =
    aiTaskDrafts.length > 0 && aiSelectedIds.length === aiTaskDrafts.length

  // 当前显示的分组
  const displayedGroups = taskViewMode === 'focus' ? focusModeGroups : taskGroups

  const weeklyGoalMinutes = loadWeeklyGoal(user?.id)
  const weekRange = useMemo(() => {
    const now = dayjs(todayKey)
    const day = now.day() // 0 (Sun) - 6 (Sat)
    const diff = (day + 6) % 7 // Monday=0
    const start = now.subtract(diff, 'day').format('YYYY-MM-DD')
    const end = now.subtract(diff, 'day').add(6, 'day').format('YYYY-MM-DD')
    return { start, end }
  }, [todayKey])

  const weeklyMinutes = useMemo(() => {
    return logs
      .filter((log) => log.date >= weekRange.start && log.date <= weekRange.end)
      .reduce((sum, log) => sum + (Number(log.duration) || 0), 0)
  }, [logs, weekRange])

  const streakDays = useMemo(() => {
    const map = new Map(logs.map((log) => [log.date, log]))
    let count = 0
    let cursor = dayjs(todayKey)
    while (true) {
      const key = cursor.format('YYYY-MM-DD')
      const log = map.get(key)
      if (!log || !log.duration || log.duration <= 0) {
        break
      }
      count += 1
      cursor = cursor.subtract(1, 'day')
    }
    return count
  }, [logs, todayKey])

  const dueReviewCount = useMemo(() => {
    if (!user?.id) return 0
    return countDueReviewCards(user.id, todayKey)
  }, [todayKey, user?.id])

  const defaultReviewSourceDate = useMemo(() => {
    if (todayLog?.duration > 0 && String(todayLog?.content || '').trim()) {
      return todayKey
    }

    let best = ''
    for (const log of logs) {
      const date = String(log?.date || '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const minutes = Number(log?.duration) || 0
      const content = String(log?.content || '').trim()
      if (minutes <= 0 || !content) continue
      if (!best || date > best) {
        best = date
      }
    }

    return best || todayKey
  }, [logs, todayKey, todayLog?.content, todayLog?.duration])

  useEffect(() => {
    if (!user?.id) {
      return
    }
    const load = async () => {
      setLoading(true)
      try {
        const [taskData, occurrenceData, logData] = await Promise.all([
          getTasks(user.id),
          getTaskOccurrences(user.id, occurrenceRange.start, occurrenceRange.end),
          getStudyLogs(user.id),
        ])
        setTasks(taskData)
        setTaskItems(occurrenceData)
        const storedOrder = loadTaskOrder(user.id)
        const allIds = taskData.map((task) => task.id)
        const mergedOrder = [
          ...storedOrder.filter((id) => allIds.includes(id)),
          ...allIds.filter((id) => !storedOrder.includes(id)),
        ]
        setTaskOrder(mergedOrder)
        saveTaskOrder(user.id, mergedOrder)
        setLogs(logData)
      } catch {
        Toast.show({ content: '数据加载失败，请稍后重试' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [occurrenceRange.end, occurrenceRange.start, syncTick, user?.id])

  useEffect(() => {
    setFutureExpanded(false)
  }, [taskViewMode, manageTasks])

  const pollFeedbackIfNeeded = async () => {
    if (!user?.id) return
    if (feedbackPollingRef.current) return

    const shouldPoll =
      todayLog && todayLog.duration > 0 && todayLog.aiFeedback === null
    if (!shouldPoll) return

    feedbackPollingRef.current = true
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const latest = await getStudyLogByDate(user.id, todayKey)
        if (latest?.aiFeedback && latest.aiFeedback.trim()) {
          setLogs((prev) =>
            prev.map((item) => (item.date === todayKey ? latest : item))
          )
          return
        }
      }
    } catch {
      // ignore
    } finally {
      feedbackPollingRef.current = false
    }
  }

  const refreshTodayLog = async () => {
    if (!user?.id) return
    try {
      const latest = await getStudyLogByDate(user.id, todayKey)
      if (!latest) {
        return
      }
      setLogs((prev) => {
        const exists = prev.find((item) => item.date === todayKey)
        if (!exists) {
          return [...prev, latest]
        }
        return prev.map((item) => (item.date === todayKey ? latest : item))
      })
    } catch {
      Toast.show({ content: '刷新失败' })
    }
  }

  const refreshTaskOccurrences = async () => {
    if (!user?.id) return
    try {
      const data = await getTaskOccurrences(user.id, occurrenceRange.start, occurrenceRange.end)
      setTaskItems(data)
    } catch {
      Toast.show({ content: '浠诲姟鍒楄〃鍔犺浇澶辫触' })
    }
  }

  const buildTaskPayload = (draft) => {
    const title = String(draft?.title || '').trim()
    if (!title) {
      return { ok: false, error: '璇疯緭鍏ヤ换鍔″唴瀹?' }
    }

    const plannedDate = draft?.plannedDate || null
    const dueTime = draft?.dueTime ? normalizeTimeInput(draft.dueTime) : null
    if (draft?.dueTime && !dueTime) {
      return { ok: false, error: '鎴鏃堕棿鏍煎紡闇€瑕佷负 HH:mm' }
    }

    const reminders = parseTimeListInput(draft?.reminderTimes || '')
    if (!reminders.ok) {
      return { ok: false, error: reminders.error }
    }

    const labels = parseLabelInput(draft?.labels || '')
    const category = String(draft?.category || '').trim()
    const description = String(draft?.description || '').trim()
    const priority =
      Number.isFinite(draft?.priority) || typeof draft?.priority === 'number'
        ? draft.priority
        : null

    const repeat = buildRepeatRule({
      type: draft?.repeatType || 'none',
      days: draft?.repeatDays || [],
      plannedDate: plannedDate || todayKey,
    })
    const repeatRule = repeat.repeatRule || null
    const repeatStartDate = repeat.repeatStartDate || null
    const repeatTimeZone = repeatRule ? Intl.DateTimeFormat().resolvedOptions().timeZone : null

    return {
      ok: true,
      payload: {
        title,
        description: description || null,
        plannedDate: plannedDate || repeatStartDate || null,
        dueTime,
        priority,
        category: category || null,
        labels,
        reminderTimes: reminders.list,
        repeatRule,
        repeatStartDate,
        repeatTimeZone,
      },
    }
  }

  const resetEditingState = () => {
    setEditingTask(null)
    setEditingTitle('')
    setEditingDescription('')
    setEditingPlannedDate(null)
    setEditingDueTime('')
    setEditingPriority(null)
    setEditingCategory('')
    setEditingLabels('')
    setEditingRepeatType('none')
    setEditingRepeatDays([])
    setEditingReminderTimes('')
    setEditingScope('series')
    setEditDetailOpen(false)
    setShowEditDatePicker(false)
  }

  const generateTodayFeedback = async () => {
    if (!user?.id) return
    try {
      const updated = await generateAiFeedback(user.id, todayKey, loadAiConfig())
      setLogs((prev) => {
        const exists = prev.find((item) => item.date === todayKey)
        if (!exists) {
          return [...prev, updated]
        }
        return prev.map((item) => (item.date === todayKey ? updated : item))
      })
      Toast.show({ content: updated?.aiFeedback?.trim() ? '点评已生成' : '点评生成失败' })
    } catch {
      Toast.show({ content: '生成点评失败' })
    }
  }

  useEffect(() => {
    pollFeedbackIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayLog?.aiFeedback, todayLog?.duration, user?.id])

  const handleCheckin = async () => {
    const minutes = Number.parseInt(duration, 10)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      Toast.show({ content: '请输入学习时长（分钟）' })
      return
    }
    if (!content.trim()) {
      Toast.show({ content: '请输入学习内容' })
      return
    }
    setSavingCheckin(true)
    try {
      const log = await checkin({
        userId: user.id,
        date: todayKey,
        duration: minutes,
        content: content.trim(),
        ai: loadAiConfig(),
      })
      setLogs((prev) => {
        const exists = prev.find((item) => item.date === log.date)
        if (exists) {
          return prev.map((item) => (item.date === log.date ? log : item))
        }
        return [...prev, log]
      })
      setCheckinOpen(false)
      setDuration('')
      setContent('')
      Toast.show({ content: '打卡完成，AI 点评生成中' })
      pollFeedbackIfNeeded()
    } catch {
      Toast.show({ content: '打卡失败，请稍后重试' })
    } finally {
      setSavingCheckin(false)
    }
  }

  const handleCreateTaskLegacy = async () => {
    const title = taskTitle.trim()
    if (!title) {
      Toast.show({ content: '请输入任务内容' })
      return
    }
    setSavingTask(true)
    try {
      const task = await createTask(user.id, title, taskPlannedDate)
      setTasks((prev) => [...prev, task])
      setTaskOrder((prev) => {
        const next = [...prev.filter((id) => id !== task.id), task.id]
        saveTaskOrder(user.id, next)
        return next
      })
      setTaskOpen(false)
      setTaskTitle('')
      setTaskPlannedDate(null)
      Toast.show({ content: '任务已添加' })
    } catch {
      Toast.show({ content: '新增任务失败' })
    } finally {
      setSavingTask(false)
    }
  }

  const handleCreateTask = async () => {
    const built = buildTaskPayload({
      title: taskTitle,
      description: taskDescription,
      plannedDate: taskPlannedDate,
      dueTime: taskDueTime,
      priority: taskPriority,
      category: taskCategory,
      labels: taskLabels,
      repeatType: taskRepeatType,
      repeatDays: taskRepeatDays,
      reminderTimes: taskReminderTimes,
    })
    if (!built.ok) {
      Toast.show({ content: built.error })
      return
    }

    if (built.payload.reminderTimes?.length) {
      try {
        await ensurePushSubscription(user.id)
        } catch {
          Toast.show({ content: '\u63d0\u9192\u8ba2\u9605\u5931\u8d25\uff0c\u4ecd\u53ef\u7ee7\u7eed\u4fdd\u5b58\u4efb\u52a1' })
        }
    }

    setSavingTask(true)
    try {
      const task = await createTask(user.id, built.payload)
      setTasks((prev) => [...prev, task])
      setTaskOrder((prev) => {
        const next = [...prev.filter((id) => id !== task.id), task.id]
        saveTaskOrder(user.id, next)
        return next
      })
      await refreshTaskOccurrences()
      setTaskOpen(false)
      setTaskTitle('')
      setTaskPlannedDate(null)
      setTaskDescription('')
      setTaskDueTime('')
      setTaskPriority(null)
      setTaskCategory('')
      setTaskLabels('')
      setTaskRepeatType('none')
      setTaskRepeatDays([])
      setTaskReminderTimes('')
      setTaskDetailOpen(false)
      Toast.show({ content: '任务已添加' })
    } catch {
      Toast.show({ content: '新增任务失败' })
    } finally {
      setSavingTask(false)
    }
  }

  const runTaskDecompose = async () => {
    const goal = aiGoal.trim()
    if (!goal) {
      Toast.show({ content: '请先输入目标' })
      return
    }
    setAiWorking(true)
    try {
      const tasks = await decomposeTasks(goal, aiConstraints.trim(), loadAiConfig())
      if (!Array.isArray(tasks) || tasks.length === 0) {
        Toast.show({ content: '未生成任务，请换个描述试试' })
        return
      }
      setAiGeneratedTasks(tasks)
      Toast.show({ content: `已生成 ${tasks.length} 个任务` })
    } catch {
      Toast.show({ content: 'AI 拆解失败，请稍后重试' })
    } finally {
      setAiWorking(false)
    }
  }

  const addGeneratedTasksLegacy = async () => {
    if (!user?.id) return
    if (!aiGeneratedTasks.length) {
      Toast.show({ content: '暂无可添加的任务' })
      return
    }
    setAiWorking(true)
    try {
      const created = []
      for (const item of aiGeneratedTasks) {
        const title = String(item?.title ?? '').trim()
        if (!title) continue
        const minutes = Number.parseInt(String(item?.estimateMinutes ?? ''), 10)
        const finalTitle =
          Number.isFinite(minutes) && minutes > 0 ? `${title}（约${minutes}m）` : title
        const task = await createTask(user.id, finalTitle)
        created.push(task)
      }

      if (created.length === 0) {
        Toast.show({ content: '没有可添加的任务' })
        return
      }

      setTasks((prev) => [...prev, ...created])
      setTaskOrder((prev) => {
        const next = [...prev]
        for (const task of created) {
          next.push(task.id)
        }
        saveTaskOrder(user.id, next)
        return next
      })

      setAiGeneratedTasks([])
      setAiDecomposeOpen(false)
      setAiGoal('')
      setAiConstraints('')
      Toast.show({ content: `已添加 ${created.length} 个任务` })
    } catch {
      Toast.show({ content: '添加任务失败' })
    } finally {
      setAiWorking(false)
    }
  }

  const addGeneratedTasks = () => {
    if (!user?.id) return
    if (!aiGeneratedTasks.length) {
      Toast.show({ content: '鏆傛棤鍙坊鍔犵殑浠诲姟' })
      return
    }

    const drafts = aiGeneratedTasks.map((item, index) => {
      const title = String(item?.title ?? '').trim()
      const estimateMinutes = Number.parseInt(String(item?.estimateMinutes ?? ''), 10)
      const id = `${Date.now()}-${index}`
      return {
        id,
        title,
        estimateMinutes: Number.isFinite(estimateMinutes) ? estimateMinutes : null,
        description: '',
        plannedDate: null,
        dueTime: '',
        priority: null,
        category: '',
        labels: '',
        repeatType: 'none',
        repeatDays: [],
        reminderTimes: '',
      }
    })

    setAiTaskDrafts(drafts)
    setAiSelectedIds(drafts.map((draft) => draft.id))
    setAiBatchPlannedDate(null)
    setAiBatchDueTime('')
    setAiBatchPriority(null)
    setAiBatchCategory('')
    setAiBatchLabels('')
    setAiBatchRepeatType('none')
    setAiBatchRepeatDays([])
    setAiBatchReminderTimes('')
    setAiAddOpen(true)
    setAiDecomposeOpen(false)
  }

  const applyBatchToSelected = (updates) => {
    if (!aiSelectedIds.length) return
    setAiTaskDrafts((prev) =>
      prev.map((draft) =>
        aiSelectedIds.includes(draft.id) ? { ...draft, ...updates } : draft
      )
    )
  }

  const saveAiEditingDraft = () => {
    if (!aiEditingDraft) return
    setAiTaskDrafts((prev) =>
      prev.map((draft) => (draft.id === aiEditingDraft.id ? aiEditingDraft : draft))
    )
    setAiEditingDraft(null)
  }

  const submitGeneratedTasks = async () => {
    if (!user?.id) return
    if (aiWorking) return
    const selected = aiTaskDrafts.filter((draft) => aiSelectedIds.includes(draft.id))
    if (!selected.length) {
      Toast.show({ content: '请先选择要添加的任务' })
      return
    }

    const payloads = []
    for (const draft of selected) {
      const built = buildTaskPayload(draft)
      if (!built.ok) {
        Toast.show({ content: built.error })
        return
      }
      payloads.push(built.payload)
    }
    setAiWorking(true)
    try {
      if (payloads.some((payload) => payload.reminderTimes?.length)) {
        try {
          await ensurePushSubscription(user.id)
        } catch {
          Toast.show({ content: '\u63d0\u9192\u8ba2\u9605\u5931\u8d25\uff0c\u4ecd\u53ef\u7ee7\u7eed\u4fdd\u5b58\u4efb\u52a1' })
        }
      }
      const created = []
      for (const payload of payloads) {
        const task = await createTask(user.id, payload)
        created.push(task)
      }

      if (created.length === 0) {
        Toast.show({ content: '没有可添加的任务' })
        return
      }

      setTasks((prev) => [...prev, ...created])
      setTaskOrder((prev) => {
        const next = [...prev]
        for (const task of created) {
          next.push(task.id)
        }
        saveTaskOrder(user.id, next)
        return next
      })

      await refreshTaskOccurrences()
      setAiTaskDrafts([])
      setAiSelectedIds([])
      setAiAddOpen(false)
      setAiDecomposeOpen(false)
      setAiGeneratedTasks([])
      setAiGoal('')
      setAiConstraints('')
      Toast.show({ content: `已添加 ${created.length} 个任务` })
    } catch {
      Toast.show({ content: '添加任务失败' })
    } finally {
      setAiWorking(false)
    }
  }

  const handleToggleTaskLegacy = async (task, value) => {
    setUpdatingTaskId(task.id)
    try {
      const updated = await updateTask(user.id, task.id, { isDone: value })
      setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)))
    } catch {
      Toast.show({ content: '更新任务状态失败' })
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleToggleTask = async (task, value) => {
    if (!user?.id) return
    setUpdatingTaskId(task.id)
    try {
      if (task.isRecurring) {
        const updated = await updateTaskOccurrence(
          user.id,
          task.taskId,
          task.occurrenceDate,
          { isDone: value }
        )
        if (updated) {
          setTaskItems((prev) => prev.map((item) => (item.id === task.id ? updated : item)))
        } else {
          await refreshTaskOccurrences()
        }
      } else {
        const updated = await updateTask(user.id, task.id, { isDone: value })
        setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)))
        await refreshTaskOccurrences()
      }
    } catch {
      Toast.show({ content: '鏇存柊浠诲姟鐘舵€佸け璐?' })
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleEditTask = (task) => {
    if (!task) return

    const openEditor = (scope) => {
      const repeat = parseRepeatRule(task.repeatRule)
      const hasLabels = Array.isArray(task.labels)
        ? task.labels.length > 0
        : Boolean(task.labels)
      const hasReminders = Array.isArray(task.reminderTimes)
        ? task.reminderTimes.length > 0
        : Boolean(task.reminderTimes)
      const hasDetails =
        Boolean(task.description) ||
        Boolean(task.dueTime) ||
        task.priority != null ||
        Boolean(task.category) ||
        hasLabels ||
        repeat.type !== 'none' ||
        hasReminders
      setEditDetailOpen(hasDetails)
      setEditingScope(scope)
      setEditingTask(task)
      setEditingTitle(task.title || '')
      setEditingDescription(task.description || '')
      setEditingPlannedDate(task.plannedDate || null)
      setEditingDueTime(task.dueTime || '')
      setEditingPriority(task.priority ?? null)
      setEditingCategory(task.category || '')
      setEditingLabels(Array.isArray(task.labels) ? task.labels.join(', ') : '')
      setEditingRepeatType(repeat.type)
      setEditingRepeatDays(repeat.days)
      setEditingReminderTimes(
        Array.isArray(task.reminderTimes) ? task.reminderTimes.join(', ') : ''
      )
    }

    if (task.isRecurring) {
      ActionSheet.show({
        actions: [
          { key: 'single', text: '编辑本次' },
          { key: 'series', text: '编辑整个系列' },
        ],
        cancelText: '取消',
        closeOnAction: true,
        onAction: (action) => {
          if (action.key === 'single') {
            openEditor('single')
          }
          if (action.key === 'series') {
            openEditor('series')
          }
        },
      })
      return
    }

    openEditor('series')
  }

  const handleSaveEditLegacy = async () => {
    const title = editingTitle.trim()
    if (!editingTask || !title) {
      Toast.show({ content: '请输入任务内容' })
      return
    }
    setUpdatingTaskId(editingTask.id)
    try {
      const updates = { title }
      if (editingPlannedDate !== editingTask.plannedDate) {
        updates.plannedDate = editingPlannedDate
      }
      const updated = await updateTask(user.id, editingTask.id, updates)
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setEditingTask(null)
      setEditingTitle('')
      setEditingPlannedDate(null)
      Toast.show({ content: '任务已更新' })
    } catch {
      Toast.show({ content: '更新任务失败' })
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingTask || !user?.id) return

    const built = buildTaskPayload({
      title: editingTitle,
      description: editingDescription,
      plannedDate: editingPlannedDate,
      dueTime: editingDueTime,
      priority: editingPriority,
      category: editingCategory,
      labels: editingLabels,
      repeatType: editingRepeatType,
      repeatDays: editingRepeatDays,
      reminderTimes: editingReminderTimes,
    })
    if (!built.ok) {
      Toast.show({ content: built.error })
      return
    }

    if (built.payload.reminderTimes?.length) {
      try {
        await ensurePushSubscription(user.id)
      } catch {
        Toast.show({ content: '提醒订阅失败，仍可继续保存任务' })
      }
    }

    setUpdatingTaskId(editingTask.id)
    try {
      const baseId = editingTask.taskId ?? editingTask.id
      if (editingScope === 'single' && editingTask.isRecurring) {
        const updates = { ...built.payload }
        delete updates.repeatRule
        delete updates.repeatStartDate
        delete updates.repeatTimeZone
        delete updates.reminderTimes
        const updated = await updateTaskOccurrence(
          user.id,
          baseId,
          editingTask.occurrenceDate,
          updates
        )
        if (updated) {
          setTaskItems((prev) => prev.map((item) => (item.id === editingTask.id ? updated : item)))
        }
      } else {
        const updated = await updateTask(user.id, baseId, built.payload)
        setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      }
      await refreshTaskOccurrences()
      resetEditingState()
      Toast.show({ content: '任务已更新' })
    } catch {
      Toast.show({ content: '更新任务失败' })
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleDeleteTaskLegacy = async (task) => {
    const result = await Dialog.confirm({
      title: '删除任务',
      content: `确定删除「${task.title}」吗？`,
      confirmText: '删除',
    })
    if (!result) return

    setUpdatingTaskId(task.id)
    try {
      await deleteTask(user.id, task.id)
      setTasks((prev) => prev.filter((item) => item.id !== task.id))
      setTaskOrder((prev) => {
        const next = prev.filter((id) => id !== task.id)
        saveTaskOrder(user.id, next)
        return next
      })
      Toast.show({ content: '已删除' })
    } catch {
      Toast.show({ content: '删除失败' })
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleDeleteTask = async (task) => {
    if (!task || !user?.id) return

    const deleteSeries = async () => {
      const baseId = task.taskId ?? task.id
      const confirmed = await Dialog.confirm({
        title: '删除任务',
        content: `确定删除「${task.title}」吗？`,
        confirmText: '删除',
      })
      if (!confirmed) return

      setUpdatingTaskId(task.id)
      try {
        await deleteTask(user.id, baseId)
        setTasks((prev) => prev.filter((item) => item.id !== baseId))
        setTaskOrder((prev) => {
          const next = prev.filter((id) => id !== baseId)
          saveTaskOrder(user.id, next)
          return next
        })
        await refreshTaskOccurrences()
        Toast.show({ content: '已删除' })
      } catch {
        Toast.show({ content: '删除失败' })
      } finally {
        setUpdatingTaskId(null)
      }
    }

    if (task.isRecurring) {
      ActionSheet.show({
        actions: [
          { key: 'single', text: '删除本次' },
          { key: 'series', text: '删除整个系列' },
        ],
        cancelText: '取消',
        closeOnAction: true,
        onAction: async (action) => {
          if (action.key === 'single') {
            setUpdatingTaskId(task.id)
            try {
              await updateTaskOccurrence(user.id, task.taskId, task.occurrenceDate, {
                isCancelled: true,
              })
              await refreshTaskOccurrences()
              Toast.show({ content: '已删除本次' })
            } catch {
              Toast.show({ content: '删除失败' })
            } finally {
              setUpdatingTaskId(null)
            }
          }
          if (action.key === 'series') {
            await deleteSeries()
          }
        },
      })
      return
    }

    await deleteSeries()
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activeTasks = useMemo(
    () => sortByOrder(tasks.filter((task) => !task.isDone), taskOrder),
    [tasks, taskOrder]
  )
  const doneTasks = useMemo(
    () => sortByOrder(tasks.filter((task) => task.isDone), taskOrder),
    [tasks, taskOrder]
  )
  const doneTaskItems = useMemo(
    () => sortByTaskOrder(taskItems.filter((task) => task.isDone), taskOrder),
    [taskItems, taskOrder]
  )

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over) return
    if (active.id === over.id) return

    const activeIds = activeTasks.map((task) => task.id)
    const oldIndex = activeIds.indexOf(active.id)
    const newIndex = activeIds.indexOf(over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const newActiveIds = arrayMove(activeIds, oldIndex, newIndex)
    const allIds = tasks.map((task) => task.id)
    const remaining = taskOrder.filter((id) => !newActiveIds.includes(id) && allIds.includes(id))
    const merged = [...newActiveIds, ...remaining]
    const withNew = [...merged, ...allIds.filter((id) => !merged.includes(id))]

    setTaskOrder(withNew)
    saveTaskOrder(user.id, withNew)
  }

  // 准备分享数据
  const getShareData = () => {
    const completedTasks = taskItems
      .filter((task) => task.isDone && task.plannedDate === todayKey)
      .map((task) => task.title)
    return {
      date: todayKey,
      duration: todayLog?.duration || 0,
      streak: streakDays,
      completedTasks,
      content: todayLog?.content || '',
    }
  }

  const handleShare = () => {
    setShareOpen(true)
  }

  // 生成基于已完成任务的学习总结
  const generateContentFromTasks = () => {
    const completedTasks = taskItems.filter(
      (task) => task.isDone && task.plannedDate === todayKey
    )
    if (completedTasks.length === 0) return ''

    const taskTitles = completedTasks.map((task) => task.title)
    // 移除任务标题中的时间估算部分（如 "约30m"）
    const cleanTitles = taskTitles.map((title) =>
      title.replace(/[（(][^）)]*[约约]\d+\s*[m分][）)]/g, '').trim()
    )

    if (cleanTitles.length === 1) {
      return `今天完成了：${cleanTitles[0]}`
    }

    let summary = '今天完成了以下任务：\n'
    cleanTitles.forEach((title, index) => {
      summary += `${index + 1}. ${title}\n`
    })
    return summary.trim()
  }

  // 打开打卡对话框时检查是否需要预填充提示
  const openCheckinDialog = () => {
    const completedTasks = taskItems.filter(
      (task) => task.isDone && task.plannedDate === todayKey
    )
    if (completedTasks.length > 0 && !content.trim()) {
      const autoContent = generateContentFromTasks()
      setGeneratedContent(autoContent)
      setShowFillPrompt(true)
    } else {
      setCheckinOpen(true)
    }
  }

  // 使用自动生成的内容
  const useGeneratedContent = () => {
    setContent(generatedContent)
    setShowFillPrompt(false)
    setCheckinOpen(true)
  }

  // 手动输入
  const manualInput = () => {
    setShowFillPrompt(false)
    setCheckinOpen(true)
  }

  // 智能建议：将无日期任务添加到今天
  const handleSuggestToDate = async () => {
    const noDateTasks = tasks.filter((t) => !t.isDone && !t.plannedDate)
    if (noDateTasks.length === 0) {
      Toast.show({ content: '暂无无日期任务' })
      return
    }

    setSavingTask(true)
    try {
      const updatePromises = noDateTasks.map((task) =>
        updateTask(user.id, task.id, { plannedDate: todayKey })
      )
      const updated = await Promise.all(updatePromises)
      setTasks((prev) => {
        const updatedMap = new Map(updated.map((t) => [t.id, t]))
        return prev.map((item) => updatedMap.get(item.id) || item)
      })
      await refreshTaskOccurrences()
      setShowSuggestDialog(false)
      Toast.show({ content: `已将 ${noDateTasks.length} 个任务添加到今天` })
    } catch {
      Toast.show({ content: '操作失败' })
    } finally {
      setSavingTask(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Bento Grid Top Section - Today + Week Summary */}
      <div className="bento-grid bento-grid-2-uneven">
        {/* Today Card - Primary */}
        <Card className="bento-card bento-card-primary !border-0 !shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex-1 leading-tight">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-medium">Today</p>
              <p className="display-font text-xl font-semibold text-white">{todayLabel}</p>
              <p className="mt-1.5 text-xs text-white/80">
                {todayLog
                  ? `已学习 ${todayLog.duration} 分钟`
                  : loading
                    ? '正在同步打卡状态'
                    : '今日尚未打卡'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-white/20 text-white text-[11px] font-medium">
                {completedCount}/{taskItems.length}
              </span>
              <Button
                size="small"
                fill="outline"
                onClick={handleShare}
                disabled={!todayLog || todayLog.duration <= 0}
                className="!bg-white/20 !text-white !border-white/30"
              >
                <Share2 size={14} />
              </Button>
            </div>
          </div>
        </Card>

        {/* Week Progress Card */}
        <Card className="bento-card !p-3">
          <div className="text-center leading-none">
            <p className="stat-label text-slate-400 mb-2">本周进度</p>
            <div className="flex items-baseline justify-center gap-0.5">
              <span className="stat-value text-xl">{weeklyMinutes}</span>
              <span className="text-slate-400 text-sm">/{weeklyGoalMinutes}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">连续打卡 {streakDays} 天</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                style={{
                  width: `${Math.min(100, Math.round((weeklyMinutes / weeklyGoalMinutes) * 100))}%`,
                }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Bento Grid Quick Actions */}
      <div className="bento-grid bento-grid-3">
        {/* Focus Timer */}
        <button
          onClick={() => navigate('/focus')}
          className="bento-card bento-card-compact p-3 text-left !border-slate-100 !shadow-sm hover:!shadow-md"
        >
          <div className="flex flex-col gap-1">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 mt-1">专注</p>
            <p className="text-[10px] text-slate-400">番茄钟</p>
          </div>
        </button>

        {/* Review */}
        <button
          onClick={() => navigate('/review')}
          disabled={dueReviewCount === 0}
          className="bento-card bento-card-compact p-3 text-left !border-slate-100 !shadow-sm hover:!shadow-md disabled:opacity-50"
        >
          <div className="flex flex-col gap-1">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 mt-1">复习</p>
            <p className="text-[10px] text-slate-400">{dueReviewCount} 题</p>
          </div>
        </button>

        {/* AI Decompose */}
        <button
          onClick={() => setAiDecomposeOpen(true)}
          className="bento-card bento-card-compact p-3 text-left !border-slate-100 !shadow-sm hover:!shadow-md"
        >
          <div className="flex flex-col gap-1">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 mt-1">AI拆解</p>
            <p className="text-[10px] text-slate-400">任务</p>
          </div>
        </button>
      </div>

      {/* AI Feedback Card - Bento Style */}
      <Card className="bento-card !bg-gradient-to-br from-violet-50 to-indigo-50 !border-violet-100">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">AI 点评</p>
            </div>
            {todayLog?.duration > 0 ? (
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                {todayLog.aiFeedback === null
                  ? '点评生成中…'
                  : todayLog?.aiFeedback?.trim()
                    ? todayLog.aiFeedback
                    : '尚未生成点评（可手动生成）'}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">完成一次打卡后会生成点评。</p>
            )}
          </div>
          <Button
            size="mini"
            onClick={() => navigate(`/day/${todayKey}`)}
            className="!rounded-full"
          >
            详情
          </Button>
        </div>
      </Card>

      {/* Task List - Bento Card */}
      <Card className="bento-card">
        <div className="flex items-center justify-between pt-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="icon-box icon-box-sm rounded-lg bg-gradient-to-br from-slate-600 to-slate-700">
              <svg className="w-3.5 h-3.5 text-white block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">任务列表</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-medium leading-tight">
              {completedCount}/{taskItems.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="mini"
              fill={taskViewMode === 'focus' ? 'solid' : 'outline'}
              color="primary"
              onClick={() => setTaskViewMode('focus')}
              className="!rounded-full"
            >
              今日专注
            </Button>
            <Button
              size="mini"
              fill={taskViewMode === 'all' ? 'solid' : 'outline'}
              onClick={() => setTaskViewMode('all')}
              className="!rounded-full"
            >
              全部
            </Button>
            <Button
              size="mini"
              fill={showDoneTasks ? 'solid' : 'outline'}
              onClick={() => setShowDoneTasks((prev) => !prev)}
              className="!rounded-full"
            >
              已完成
            </Button>
          </div>
        </div>
        {taskItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <ListTodo size={28} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">还没有任务</p>
              <p className="mt-2 text-xs text-slate-500">先添加一个任务，让今天更有方向。</p>
            </div>
            <Button size="small" color="primary" onClick={() => setTaskOpen(true)}>
              添加任务
            </Button>
          </div>
        ) : (
          <>
            {/* 渲染按日期分组的任务 */}
            {Object.entries(displayedGroups).map(([groupKey, groupTasks]) => {
              if (groupTasks.length === 0) return null
              const groupConfig = DATE_GROUP_LABELS[groupKey]
              const Icon = groupConfig.icon

              const isFutureGroup = groupKey === 'future'
              const shouldCollapseFuture = isFutureGroup && !futureExpanded
              const visibleTasks = shouldCollapseFuture
                ? groupTasks.slice(0, FUTURE_PREVIEW_LIMIT)
                : groupTasks
              const hiddenCount = Math.max(groupTasks.length - visibleTasks.length, 0)

              return (
                <div key={groupKey} className="mb-4 last:mb-0">
                  <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.3em] ${
                    groupKey === 'overdue' ? 'text-red-500' :
                    groupKey === 'today' ? 'text-emerald-600' :
                    'text-slate-400'
                  }`}>
                    {Icon && <Icon size={12} />}
                    <span>{groupConfig.label}</span>
                    <span className="ml-1 text-slate-400">({groupTasks.length})</span>
                  </div>
                  <List>
                    {visibleTasks.map((task) => (
                      <SwipeAction
                        key={task.id}
                        closeOnAction
                        rightActions={[
                          {
                            key: 'edit',
                            text: (
                              <span className="inline-flex items-center gap-1">
                                <PencilLine size={16} />
                                编辑
                              </span>
                            ),
                            color: 'primary',
                          },
                          {
                            key: 'delete',
                            text: (
                              <span className="inline-flex items-center gap-1">
                                <Trash2 size={16} />
                                删除
                              </span>
                            ),
                            color: 'danger',
                          },
                        ]}
                        onAction={(action) => {
                          if (action.key === 'edit') {
                            handleEditTask(task)
                          }
                          if (action.key === 'delete') {
                            handleDeleteTask(task)
                          }
                        }}
                      >
                        <List.Item
                          extra={
                            <Switch
                              checked={task.isDone}
                              disabled={updatingTaskId === task.id}
                              onChange={(value) => handleToggleTask(task, value)}
                            />
                          }
                        >
                          <span className="text-slate-900">{task.title}</span>
                        </List.Item>
                      </SwipeAction>
                    ))}
                  </List>
                  {isFutureGroup && groupTasks.length > FUTURE_PREVIEW_LIMIT && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="small"
                        fill="none"
                        onClick={() => setFutureExpanded((prev) => !prev)}
                      >
                        {futureExpanded
                          ? '\u6536\u8d77\u672a\u6765\u4efb\u52a1'
                          : `\u5c55\u5f00\u66f4\u591a (\u5269\u4f59${hiddenCount})`}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}

            {/* 智能建议：无日期任务提示 */}
            {taskViewMode === 'all' && displayedGroups.noDate.length > 0 && !manageTasks && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3">
                <p className="mb-2 text-sm text-amber-800">
                  📌 有 {displayedGroups.noDate.length} 个任务未设置计划日期
                </p>
                <Button
                  size="small"
                  color="warning"
                  fill="outline"
                  onClick={() => setShowSuggestDialog(true)}
                >
                  智能分配到今天
                </Button>
              </div>
            )}

            {/* 管理模式：拖拽排序（仅对当前显示的分组生效） */}
            {manageTasks && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="space-y-3">
                  {Object.entries(displayedManageGroups).map(([groupKey, groupTasks]) => {
                    if (groupTasks.length === 0) return null
                    const groupConfig = DATE_GROUP_LABELS[groupKey]
                    const Icon = groupConfig.icon

                    return (
                      <div key={groupKey}>
                        <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.3em] ${
                          groupKey === 'overdue' ? 'text-red-500' :
                          groupKey === 'today' ? 'text-emerald-600' :
                          'text-slate-400'
                        }`}>
                          {Icon && <Icon size={12} />}
                          <span>{groupConfig.label}</span>
                        </div>
                        <SortableContext items={groupTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                          <List>
                            {groupTasks.map((task) => (
                              <SortableTaskItem
                                key={task.id}
                                task={task}
                                disabled={updatingTaskId === task.id}
                                onToggle={handleToggleTask}
                              />
                            ))}
                          </List>
                        </SortableContext>
                      </div>
                    )
                  })}
                </div>
              </DndContext>
            )}

            {showDoneTasks && doneTaskItems.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  已完成
                </p>
                <List>
                  {doneTaskItems.map((task) => (
                    <SwipeAction
                      key={task.id}
                      closeOnAction
                      rightActions={[
                        {
                          key: 'edit',
                          text: (
                            <span className="inline-flex items-center gap-1">
                              <PencilLine size={16} />
                              编辑
                            </span>
                          ),
                          color: 'primary',
                        },
                        {
                          key: 'delete',
                          text: (
                            <span className="inline-flex items-center gap-1">
                              <Trash2 size={16} />
                              删除
                            </span>
                          ),
                          color: 'danger',
                        },
                      ]}
                      onAction={(action) => {
                        if (action.key === 'edit') {
                          handleEditTask(task)
                        }
                        if (action.key === 'delete') {
                          handleDeleteTask(task)
                        }
                      }}
                    >
                      <List.Item
                        extra={
                          <Switch
                            checked={task.isDone}
                            disabled={updatingTaskId === task.id}
                            onChange={(value) => handleToggleTask(task, value)}
                          />
                        }
                      >
                        <span className="line-through text-slate-400">{task.title}</span>
                      </List.Item>
                    </SwipeAction>
                  ))}
                </List>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Card title="Check-in" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="text-sm text-slate-500">
          记录学习时长与笔记，AI 会给你 50 字内的专属点评。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button block color="primary" size="large" onClick={openCheckinDialog}>
            完成学习
          </Button>
          <Button
            block
            color="default"
            size="large"
            fill="outline"
            onClick={() => {
              setTaskDetailOpen(false)
              setTaskOpen(true)
            }}
          >
            添加任务
          </Button>
        </div>
      </Card>

      <Dialog
        visible={checkinOpen}
        title="完成学习"
        closeOnMaskClick={!savingCheckin}
        closeOnAction={false}
        onClose={() => setCheckinOpen(false)}
        actions={[
          { key: 'cancel', text: '取消' },
          {
            key: 'submit',
            text: savingCheckin ? '提交中...' : '提交',
            bold: true,
            disabled: savingCheckin,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            handleCheckin()
          } else {
            setCheckinOpen(false)
          }
        }}
        content={
          <div className="space-y-3">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="学习时长（分钟）"
              value={duration}
              onChange={setDuration}
              clearable
            />
            <TextArea
              placeholder="今天学习了什么？"
              value={content}
              onChange={setContent}
              rows={4}
              showCount
              maxLength={200}
            />
          </div>
        }
      />

      {/* 智能预填充确认对话框 */}
      <Dialog
        visible={showFillPrompt}
        title="智能预填充"
        closeOnMaskClick
        onClose={() => setShowFillPrompt(false)}
        actions={[
          { key: 'manual', text: '手动输入' },
          {
            key: 'use',
            text: '使用预填充',
            bold: true,
            primary: true,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'use') {
            useGeneratedContent()
          } else {
            manualInput()
          }
        }}
        content={
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              ✨ 检测到你今天完成了 <span className="font-semibold text-emerald-600">
                {taskItems.filter((task) => task.isDone && task.plannedDate === todayKey).length}
              </span> 个任务，已为你生成学习总结模板：
            </p>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <pre className="whitespace-pre-wrap font-sans">{generatedContent}</pre>
            </div>
            <p className="text-xs text-slate-400">
              使用后可继续编辑修改
            </p>
          </div>
        }
      />

      <Dialog
        visible={aiDecomposeOpen}
        title={
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-800">AI 任务拆解</span>
          </div>
        }
        closeOnMaskClick={!aiWorking}
        closeOnAction={false}
        onClose={() => {
          if (aiWorking) return
          setAiDecomposeOpen(false)
        }}
        actions={[
          { key: 'cancel', text: '关闭' },
          { key: 'generate', text: aiWorking ? '生成中...' : '生成', disabled: aiWorking },
          {
            key: 'apply',
            text: '一键加入',
            bold: true,
            disabled: aiWorking || aiGeneratedTasks.length === 0,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'generate') {
            runTaskDecompose()
          }
          if (action.key === 'apply') {
            addGeneratedTasks()
          }
          if (action.key === 'cancel') {
            setAiDecomposeOpen(false)
          }
        }}
        content={
          <div className="space-y-4">
            {/* Input Section */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">学习目标</label>
                <TextArea
                  placeholder="例如：两周内把 React 基础打牢"
                  value={aiGoal}
                  onChange={setAiGoal}
                  rows={3}
                  showCount
                  maxLength={200}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">约束条件（可选）</label>
                <TextArea
                  placeholder="例如：每天 30 分钟，周末 2 小时"
                  value={aiConstraints}
                  onChange={setAiConstraints}
                  rows={2}
                  showCount
                  maxLength={200}
                  className="mt-1.5"
                />
              </div>
            </div>

            {/* Preview Section */}
            {aiGeneratedTasks.length > 0 ? (
              <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-md bg-violet-500 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-violet-700 uppercase tracking-wider">任务预览</span>
                  <span className="ml-auto text-xs text-violet-500">{aiGeneratedTasks.length} 个任务</span>
                </div>
                <div className="space-y-1.5">
                  {aiGeneratedTasks.map((task, index) => (
                    <div key={`${task.title}-${index}`} className="bg-white/80 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="text-sm text-slate-700">
                        {task.title}
                      </span>
                      {task.estimateMinutes && (
                        <span className="text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                          ~{task.estimateMinutes}m
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="text-xs text-slate-400">输入目标后点击"生成"预览任务列表</p>
              </div>
            )}
          </div>
        }
      />

      <Dialog
        visible={aiAddOpen}
        title={
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-800">添加拆解任务</span>
          </div>
        }
        closeOnMaskClick={!aiWorking}
        closeOnAction={false}
        onClose={() => {
          if (aiWorking) return
          setAiAddOpen(false)
        }}
        actions={[
          { key: 'cancel', text: '取消' },
          {
            key: 'submit',
            text: aiWorking ? '添加中...' : '确认添加',
            bold: true,
            disabled: aiWorking,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            submitGeneratedTasks()
            return
          }
          if (!aiWorking) {
            setAiAddOpen(false)
          }
        }}
        content={
          <div className="space-y-4">
            {/* Select All */}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">全选</span>
                <span className="text-xs text-slate-400">({aiSelectedIds.length}/{aiTaskDrafts.length})</span>
              </div>
              <Switch
                checked={allAiSelected}
                onChange={(value) => {
                  setAiSelectedIds(value ? aiTaskDrafts.map((draft) => draft.id) : [])
                }}
              />
            </div>

            {/* Task List */}
            <div className="space-y-2">
              {aiTaskDrafts.map((draft) => {
                const metaParts = []
                if (draft.plannedDate) {
                  metaParts.push(dayjs(draft.plannedDate).format('MM月DD日'))
                }
                if (draft.repeatType && draft.repeatType !== 'none') {
                  const repeatLabel = REPEAT_OPTIONS.find((opt) => opt.value === draft.repeatType)?.label
                  if (repeatLabel) metaParts.push(repeatLabel)
                }
                if (draft.priority) metaParts.push(`P${draft.priority}`)
                const meta = metaParts.join(' · ')
                const isSelected = aiSelectedIds.includes(draft.id)
                return (
                  <div
                    key={draft.id}
                    className={`bento-card bento-card-compact !p-3 transition-all ${isSelected ? '!ring-2 !ring-emerald-400' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <Switch
                        checked={isSelected}
                        onChange={(value) => {
                          setAiSelectedIds((prev) =>
                            value ? [...prev, draft.id] : prev.filter((id) => id !== draft.id)
                          )
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {draft.title}
                        </p>
                        {meta && (
                          <p className="text-xs text-slate-400 mt-0.5">{meta}</p>
                        )}
                        {draft.estimateMinutes && (
                          <span className="inline-block mt-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            约{draft.estimateMinutes}分钟
                          </span>
                        )}
                      </div>
                      <Button
                        size="mini"
                        fill="outline"
                        onClick={() => setAiEditingDraft(draft)}
                        className="!rounded-full flex-shrink-0"
                      >
                        编辑
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Batch Settings */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">批量设置</p>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl px-3 py-2">
                  <p className="text-[10px] text-slate-400 mb-1">计划日期</p>
                  <Button
                    size="small"
                    fill="outline"
                    onClick={() => setShowAiBatchDatePicker(true)}
                    className="!text-xs !h-7"
                  >
                    {aiBatchPlannedDate ? dayjs(aiBatchPlannedDate).format('MM月DD日') : '选择'}
                  </Button>
                </div>
                <div className="bg-white rounded-xl px-3 py-2">
                  <p className="text-[10px] text-slate-400 mb-1">截止时间</p>
                  <Input
                    placeholder="HH:mm"
                    value={aiBatchDueTime}
                    onChange={(value) => {
                      const next = formatTimeInput(value)
                      setAiBatchDueTime(next)
                      applyBatchToSelected({ dueTime: next })
                    }}
                    type="tel"
                    maxLength={5}
                    clearable
                    className="!text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">优先级</p>
                  <Selector
                    options={PRIORITY_OPTIONS}
                    value={aiBatchPriority != null ? [aiBatchPriority] : []}
                    onChange={(val) => {
                      const next = val[0] ?? null
                      setAiBatchPriority(next)
                      applyBatchToSelected({ priority: next })
                    }}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">分类</p>
                  <CategoryPresetChips
                    presets={categoryPresets}
                    value={aiBatchCategory}
                    onChange={(value) => {
                      setAiBatchCategory(value)
                      applyBatchToSelected({ category: value })
                    }}
                    className="mt-1"
                  />
                  <Input
                    placeholder="可选"
                    value={aiBatchCategory}
                    onChange={(value) => {
                      setAiBatchCategory(value)
                      applyBatchToSelected({ category: value })
                    }}
                    clearable
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-400 mb-1">标签</p>
                <LabelPresetChips
                  presets={labelPresets}
                  value={aiBatchLabels}
                  onChange={(value) => {
                    setAiBatchLabels(value)
                    applyBatchToSelected({ labels: value })
                  }}
                  className="mt-1"
                />
                <Input
                  placeholder="输入标签，空格分隔"
                  value={aiBatchLabels}
                  onChange={(value) => {
                    const next = formatLabelListInput(value)
                    setAiBatchLabels(next)
                    applyBatchToSelected({ labels: next })
                  }}
                  clearable
                  className="mt-2"
                />
              </div>

              <div>
                <p className="text-[10px] text-slate-400 mb-1">重复</p>
                <Selector
                  options={REPEAT_OPTIONS}
                  value={[aiBatchRepeatType]}
                  onChange={(val) => {
                    const next = val[0] ?? 'none'
                    setAiBatchRepeatType(next)
                    if (next !== 'weekly') {
                      setAiBatchRepeatDays([])
                    }
                    applyBatchToSelected({ repeatType: next, repeatDays: next === 'weekly' ? aiBatchRepeatDays : [] })
                  }}
                />
              </div>
              {aiBatchRepeatType === 'weekly' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">重复日</p>
                  <Selector
                    options={WEEKDAY_OPTIONS}
                    value={aiBatchRepeatDays}
                    multiple
                    onChange={(val) => {
                      setAiBatchRepeatDays(val)
                      applyBatchToSelected({ repeatDays: val })
                    }}
                  />
                </div>
              )}
              <Input
                placeholder="提醒时间（HH:mm，逗号分隔）"
                value={aiBatchReminderTimes}
                onChange={(value) => {
                  const next = formatTimeListInput(value)
                  setAiBatchReminderTimes(next)
                  applyBatchToSelected({ reminderTimes: next })
                }}
                type="tel"
                clearable
              />
            </div>
          </div>
        }
      />

      <Dialog
        visible={!!aiEditingDraft}
        title={
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-800">编辑任务</span>
          </div>
        }
        closeOnMaskClick
        onClose={() => setAiEditingDraft(null)}
        actions={[
          { key: 'cancel', text: '取消' },
          { key: 'submit', text: '保存', bold: true },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            saveAiEditingDraft()
          } else {
            setAiEditingDraft(null)
          }
        }}
        content={
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">任务内容</label>
              <Input
                placeholder="要做什么"
                value={aiEditingDraft?.title || ''}
                onChange={(value) =>
                  setAiEditingDraft((prev) => (prev ? { ...prev, title: value } : prev))
                }
                clearable
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">描述</label>
              <TextArea
                placeholder="补充说明（可选）"
                value={aiEditingDraft?.description || ''}
                onChange={(value) =>
                  setAiEditingDraft((prev) => (prev ? { ...prev, description: value } : prev))
                }
                rows={2}
                showCount
                maxLength={200}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 mb-1">计划日期</p>
                <Button
                  size="small"
                  fill="outline"
                  onClick={() => setShowAiEditDatePicker(true)}
                  className="!text-xs !h-7 w-full"
                >
                  {aiEditingDraft?.plannedDate
                    ? dayjs(aiEditingDraft.plannedDate).format('MM月DD日')
                    : '选择'}
                </Button>
              </div>
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] text-slate-400 mb-1">截止时间</p>
                <Input
                  placeholder="HH:mm"
                  value={aiEditingDraft?.dueTime || ''}
                  onChange={(value) =>
                    setAiEditingDraft((prev) =>
                      prev ? { ...prev, dueTime: formatTimeInput(value) } : prev
                    )
                  }
                  type="tel"
                  maxLength={5}
                  clearable
                  className="!text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-400 mb-1">优先级</p>
                <Selector
                  options={PRIORITY_OPTIONS}
                  value={aiEditingDraft?.priority != null ? [aiEditingDraft.priority] : []}
                  onChange={(val) =>
                    setAiEditingDraft((prev) =>
                      prev ? { ...prev, priority: val[0] ?? null } : prev
                    )
                  }
                />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-1">分类</p>
                <CategoryPresetChips
                  presets={categoryPresets}
                  value={aiEditingDraft?.category || ''}
                  onChange={(value) =>
                    setAiEditingDraft((prev) => (prev ? { ...prev, category: value } : prev))
                  }
                  className="mt-1"
                />
                <Input
                  placeholder="可选"
                  value={aiEditingDraft?.category || ''}
                  onChange={(value) =>
                    setAiEditingDraft((prev) => (prev ? { ...prev, category: value } : prev))
                  }
                  clearable
                  className="mt-2"
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] text-slate-400 mb-1">标签</p>
              <LabelPresetChips
                presets={labelPresets}
                value={aiEditingDraft?.labels || ''}
                onChange={(value) =>
                  setAiEditingDraft((prev) => (prev ? { ...prev, labels: value } : prev))
                }
                className="mt-1"
              />
              <Input
                placeholder="输入标签，空格分隔"
                value={aiEditingDraft?.labels || ''}
                onChange={(value) =>
                  setAiEditingDraft((prev) =>
                    prev ? { ...prev, labels: formatLabelListInput(value) } : prev
                  )
                }
                clearable
                className="mt-2"
              />
            </div>

            <div>
              <p className="text-[10px] text-slate-400 mb-1">重复</p>
              <Selector
                options={REPEAT_OPTIONS}
                value={[aiEditingDraft?.repeatType || 'none']}
                onChange={(val) =>
                  setAiEditingDraft((prev) => {
                    if (!prev) return prev
                    const next = val[0] ?? 'none'
                    return {
                      ...prev,
                      repeatType: next,
                      repeatDays: next === 'weekly' ? prev.repeatDays : [],
                    }
                  })
                }
              />
            </div>
            {aiEditingDraft?.repeatType === 'weekly' && (
              <div>
                <p className="text-[10px] text-slate-400 mb-1">重复日</p>
                <Selector
                  options={WEEKDAY_OPTIONS}
                  value={aiEditingDraft?.repeatDays || []}
                  multiple
                  onChange={(val) =>
                    setAiEditingDraft((prev) => (prev ? { ...prev, repeatDays: val } : prev))
                  }
                />
              </div>
            )}

            <div>
              <p className="text-[10px] text-slate-400 mb-1">提醒时间</p>
              <Input
                placeholder="HH:mm，逗号分隔"
                value={aiEditingDraft?.reminderTimes || ''}
                onChange={(value) =>
                  setAiEditingDraft((prev) =>
                    prev ? { ...prev, reminderTimes: formatTimeListInput(value) } : prev
                  )
                }
                type="tel"
                clearable
              />
            </div>
          </div>
        }
      />

      <DatePicker
        visible={showAiBatchDatePicker}
        onClose={() => setShowAiBatchDatePicker(false)}
        max={dayjs().add(90, 'day').toDate()}
        onConfirm={(date) => {
          const next = dayjs(date).format('YYYY-MM-DD')
          setAiBatchPlannedDate(next)
          applyBatchToSelected({ plannedDate: next })
          setShowAiBatchDatePicker(false)
        }}
      />

      <DatePicker
        visible={showAiEditDatePicker}
        onClose={() => setShowAiEditDatePicker(false)}
        max={dayjs().add(90, 'day').toDate()}
        onConfirm={(date) => {
          const next = dayjs(date).format('YYYY-MM-DD')
          setAiEditingDraft((prev) => (prev ? { ...prev, plannedDate: next } : prev))
          setShowAiEditDatePicker(false)
        }}
      />

      <Dialog
        visible={!!editingTask}
        title="编辑任务"
        closeOnMaskClick={updatingTaskId == null}
        closeOnAction={false}
        onClose={() => {
          if (updatingTaskId != null) {
            return
          }
          resetEditingState()
        }}
        actions={[
          { key: 'cancel', text: '取消' },
          {
            key: 'submit',
            text: updatingTaskId != null ? '保存中...' : '保存',
            bold: true,
            disabled: updatingTaskId != null,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            handleSaveEdit()
          } else {
            resetEditingState()
          }
        }}
        content={
          <div className="space-y-3">
            <Input
              placeholder="任务内容"
              value={editingTitle}
              onChange={setEditingTitle}
              clearable
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">计划日期</span>
              <Button
                size="small"
                fill="outline"
                onClick={() => setShowEditDatePicker(true)}
              >
                {editingPlannedDate ? dayjs(editingPlannedDate).format('MM月DD日') : '选择日期'}
              </Button>
            </div>
            {editingPlannedDate && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">已选择</span>
                <Button
                  size="mini"
                  fill="none"
                  color="danger"
                  onClick={() => setEditingPlannedDate(null)}
                >
                  清除日期
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-600">{'\u66f4\u591a\u8bbe\u7f6e'}</span>
              <Switch checked={editDetailOpen} onChange={(value) => setEditDetailOpen(value)} />
            </div>
            {editDetailOpen && (
              <div className="space-y-3">
                <TextArea
                  placeholder="\u4efb\u52a1\u63cf\u8ff0\uff08\u53ef\u9009\uff09"
                  value={editingDescription}
                  onChange={setEditingDescription}
                  rows={3}
                  showCount
                  maxLength={200}
                />
                <Input
                  placeholder="\u622a\u6b62\u65f6\u95f4\uff08HH:mm\uff09"
                  value={editingDueTime}
                  onChange={setEditingDueTime}
                  clearable
                />
                <div className="space-y-2">
                  <span className="text-sm text-slate-600">{'\u4f18\u5148\u7ea7'}</span>
                  <Selector
                    options={PRIORITY_OPTIONS}
                    value={editingPriority != null ? [editingPriority] : []}
                    onChange={(val) => setEditingPriority(val[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <CategoryPresetChips
                    presets={categoryPresets}
                    value={editingCategory}
                    onChange={setEditingCategory}
                  />
                  <Input
                    placeholder="\u5206\u7c7b\uff08\u53ef\u9009\uff09"
                    value={editingCategory}
                    onChange={setEditingCategory}
                    clearable
                  />
                </div>
                <Input
                  placeholder="\u6807\u7b7e\uff08\u9017\u53f7\u5206\u9694\uff09"
                  value={editingLabels}
                  onChange={setEditingLabels}
                  clearable
                />
                <div className="space-y-2">
                  <span className="text-sm text-slate-600">{'\u91cd\u590d'}</span>
                  <Selector
                    options={REPEAT_OPTIONS}
                    value={[editingRepeatType]}
                    onChange={(val) => {
                      const next = val[0] ?? 'none'
                      setEditingRepeatType(next)
                      if (next !== 'weekly') {
                        setEditingRepeatDays([])
                      }
                    }}
                  />
                </div>
                {editingRepeatType === 'weekly' && (
                  <Selector
                    options={WEEKDAY_OPTIONS}
                    value={editingRepeatDays}
                    multiple
                    onChange={(val) => setEditingRepeatDays(val)}
                  />
                )}
                <Input
                  placeholder="\u63d0\u9192\u65f6\u95f4\uff08HH:mm\uff0c\u9017\u53f7\u5206\u9694\uff09"
                  value={editingReminderTimes}
                  onChange={setEditingReminderTimes}
                  clearable
                />
              </div>
            )}
          </div>
        }
      />

      {/* 编辑任务日期选择器 */}
      <DatePicker
        visible={showEditDatePicker}
        onClose={() => setShowEditDatePicker(false)}
        max={dayjs().add(90, 'day').toDate()}
        onConfirm={(date) => {
          setEditingPlannedDate(dayjs(date).format('YYYY-MM-DD'))
          setShowEditDatePicker(false)
        }}
      />

      <Dialog
        visible={taskOpen}
        title="新增任务"
        closeOnMaskClick={!savingTask}
        closeOnAction={false}
        onClose={() => {
          setTaskOpen(false)
          setTaskDetailOpen(false)
        }}
        actions={[
          { key: 'cancel', text: '取消' },
          {
            key: 'submit',
            text: savingTask ? '保存中...' : '保存',
            bold: true,
            disabled: savingTask,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'submit') {
            handleCreateTask()
          } else {
            setTaskOpen(false)
            setTaskDetailOpen(false)
          }
        }}
        content={
          <div className="space-y-3">
            <Input
              placeholder="例如：复盘算法笔记"
              value={taskTitle}
              onChange={setTaskTitle}
              clearable
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">计划日期</span>
              <Button
                size="small"
                fill="outline"
                onClick={() => setShowDatePicker(true)}
              >
                {taskPlannedDate ? dayjs(taskPlannedDate).format('MM月DD日') : '选择日期'}
              </Button>
            </div>
            {taskPlannedDate && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">已选择</span>
                <Button
                  size="mini"
                  fill="none"
                  color="danger"
                  onClick={() => setTaskPlannedDate(null)}
                >
                  清除日期
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-600">{'\u66f4\u591a\u8bbe\u7f6e'}</span>
              <Switch checked={taskDetailOpen} onChange={(value) => setTaskDetailOpen(value)} />
            </div>
            {taskDetailOpen && (
              <div className="space-y-3">
                <TextArea
                  placeholder="\u4efb\u52a1\u63cf\u8ff0\uff08\u53ef\u9009\uff09"
                  value={taskDescription}
                  onChange={setTaskDescription}
                  rows={3}
                  showCount
                  maxLength={200}
                />
                <Input
                  placeholder="\u622a\u6b62\u65f6\u95f4\uff08HH:mm\uff09"
                  value={taskDueTime}
                  onChange={setTaskDueTime}
                  clearable
                />
                <div className="space-y-2">
                  <span className="text-sm text-slate-600">{'\u4f18\u5148\u7ea7'}</span>
                  <Selector
                    options={PRIORITY_OPTIONS}
                    value={taskPriority != null ? [taskPriority] : []}
                    onChange={(val) => setTaskPriority(val[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <CategoryPresetChips
                    presets={categoryPresets}
                    value={taskCategory}
                    onChange={setTaskCategory}
                  />
                  <Input
                    placeholder="\u5206\u7c7b\uff08\u53ef\u9009\uff09"
                    value={taskCategory}
                    onChange={setTaskCategory}
                    clearable
                  />
                </div>
                <Input
                  placeholder="\u6807\u7b7e\uff08\u9017\u53f7\u5206\u9694\uff09"
                  value={taskLabels}
                  onChange={setTaskLabels}
                  clearable
                />
                <div className="space-y-2">
                  <span className="text-sm text-slate-600">{'\u91cd\u590d'}</span>
                  <Selector
                    options={REPEAT_OPTIONS}
                    value={[taskRepeatType]}
                    onChange={(val) => {
                      const next = val[0] ?? 'none'
                      setTaskRepeatType(next)
                      if (next !== 'weekly') {
                        setTaskRepeatDays([])
                      }
                    }}
                  />
                </div>
                {taskRepeatType === 'weekly' && (
                  <Selector
                    options={WEEKDAY_OPTIONS}
                    value={taskRepeatDays}
                    multiple
                    onChange={(val) => setTaskRepeatDays(val)}
                  />
                )}
                <Input
                  placeholder="\u63d0\u9192\u65f6\u95f4\uff08HH:mm\uff0c\u9017\u53f7\u5206\u9694\uff09"
                  value={taskReminderTimes}
                  onChange={setTaskReminderTimes}
                  clearable
                />
              </div>
            )}
          </div>
        }
      />

      {/* 日期选择器 */}
      <DatePicker
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        max={dayjs().add(90, 'day').toDate()}
        onConfirm={(date) => {
          setTaskPlannedDate(dayjs(date).format('YYYY-MM-DD'))
          setShowDatePicker(false)
        }}
      />

      {/* 智能建议对话框 */}
      <Dialog
        visible={showSuggestDialog}
        title="智能分配任务"
        closeOnMaskClick={!savingTask}
        closeOnAction={false}
        onClose={() => setShowSuggestDialog(false)}
        actions={[
          { key: 'cancel', text: '取消' },
          {
            key: 'confirm',
            text: savingTask ? '处理中...' : '确认添加到今天',
            bold: true,
            disabled: savingTask,
            primary: true,
          },
        ]}
        onAction={(action) => {
          if (action.key === 'confirm') {
            handleSuggestToDate()
          } else {
            setShowSuggestDialog(false)
          }
        }}
        content={
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              📌 检测到有 <span className="font-semibold text-amber-600">
                {tasks.filter((t) => !t.isDone && !t.plannedDate).length}
              </span> 个任务未设置计划日期
            </p>
            <p className="text-xs text-slate-500">
              是否将这些任务全部设置计划日期为今天（{dayjs().format('MM月DD日')}）？
            </p>
            <div className="max-h-32 overflow-y-auto rounded-xl bg-slate-50 p-2">
              {tasks.filter((t) => !t.isDone && !t.plannedDate).map((task) => (
                <div key={task.id} className="mb-1 truncate text-xs text-slate-600">
                  • {task.title}
                </div>
              ))}
            </div>
          </div>
        }
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        data={getShareData()}
      />
    </div>
  )
}

export default Today
