import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import {
  Button,
  Card,
  Dialog,
  Input,
  List,
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
import { GripVertical, PencilLine, Trash2, Share2, Calendar, AlertCircle, Clock } from 'lucide-react'
import {
  checkin,
  createTask,
  deleteTask,
  decomposeTasks,
  generateAiFeedback,
  getStudyLogs,
  getTasks,
  getStudyLogByDate,
  updateTask,
} from '../services/api.js'
import { loadAiConfig } from '../utils/storage.js'
import { loadTaskOrder, saveTaskOrder, sortByOrder } from '../utils/taskOrder.js'
import { loadWeeklyGoal } from '../utils/habit.js'
import { countDueReviewCards } from '../utils/flashcards.js'
import { useNavigate } from 'react-router-dom'
import ShareDialog from '../components/ShareCard.jsx'

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

function Today({ user, syncTick }) {
  const navigate = useNavigate()
  const todayLabel = dayjs().format('dddd, MMM D')
  const todayKey = dayjs().format('YYYY-MM-DD')
  const [tasks, setTasks] = useState([])
  const [taskOrder, setTaskOrder] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [manageTasks, setManageTasks] = useState(false)
  const [showDoneTasks, setShowDoneTasks] = useState(false)
  const [taskViewMode, setTaskViewMode] = useState('focus') // 'focus' | 'all'
  const [duration, setDuration] = useState('')
  const [content, setContent] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPlannedDate, setTaskPlannedDate] = useState(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState(null)
  const [editingTask, setEditingTask] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingPlannedDate, setEditingPlannedDate] = useState(null)
  const [showEditDatePicker, setShowEditDatePicker] = useState(false)
  const [showSuggestDialog, setShowSuggestDialog] = useState(false)
  const feedbackPollingRef = useRef(false)
  const [aiDecomposeOpen, setAiDecomposeOpen] = useState(false)
  const [aiGoal, setAiGoal] = useState('')
  const [aiConstraints, setAiConstraints] = useState('')
  const [aiGeneratedTasks, setAiGeneratedTasks] = useState([])
  const [aiWorking, setAiWorking] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [showFillPrompt, setShowFillPrompt] = useState(false)
  const [generatedContent, setGeneratedContent] = useState('')

  const todayLog = useMemo(
    () => logs.find((log) => log.date === todayKey),
    [logs, todayKey]
  )
  const completedCount = tasks.filter((task) => task.isDone).length

  // 按日期分组任务
  const taskGroups = useMemo(() => {
    const grouped = groupTasksByDate(tasks, todayKey)
    // 对每个分组内的任务按排序顺序排列
    return Object.fromEntries(
      Object.entries(grouped).map(([key, tasks]) => [key, sortByOrder(tasks, taskOrder)])
    )
  }, [tasks, taskOrder, todayKey])

  // 今日专注模式：只显示逾期、今天、无日期的任务
  const focusModeGroups = useMemo(() => {
    return {
      overdue: taskGroups.overdue,
      today: taskGroups.today,
      noDate: taskGroups.noDate,
    }
  }, [taskGroups])

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
        const [taskData, logData] = await Promise.all([
          getTasks(user.id),
          getStudyLogs(user.id),
        ])
        setTasks(taskData)
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
  }, [syncTick, user?.id])

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

  const handleCreateTask = async () => {
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

  const addGeneratedTasks = async () => {
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

  const handleToggleTask = async (task, value) => {
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

  const handleEditTask = (task) => {
    setEditingTask(task)
    setEditingTitle(task.title)
    setEditingPlannedDate(task.plannedDate || null)
  }

  const handleSaveEdit = async () => {
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

  const handleDeleteTask = async (task) => {
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activeTasks = useMemo(
    () => sortByOrder(tasks.filter((task) => !task.isDone), taskOrder),
    [tasks, taskOrder]
  )
  const doneTasks = useMemo(
    () => sortByOrder(tasks.filter((task) => task.isDone), taskOrder),
    [tasks, taskOrder]
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
    const completedTasks = tasks.filter((task) => task.isDone).map((task) => task.title)
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
    const completedTasks = tasks.filter((task) => task.isDone)
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
    const completedTasks = tasks.filter((task) => task.isDone)
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
      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Today</p>
            <p className="display-font text-xl font-semibold text-slate-900">{todayLabel}</p>
            <p className="mt-1 text-xs text-slate-500">
              {todayLog
                ? `已学习 ${todayLog.duration} 分钟`
                : loading
                  ? '正在同步打卡状态'
                  : '今日尚未打卡'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tag color={todayLog ? 'success' : 'warning'} fill="outline">
              {completedCount}/{tasks.length} done
            </Tag>
            <Button
              size="small"
              fill="outline"
              onClick={handleShare}
              disabled={!todayLog || todayLog.duration <= 0}
            >
              <Share2 size={16} />
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">This Week</p>
            <p className="display-font text-xl font-semibold text-slate-900">
              {weeklyMinutes}/{weeklyGoalMinutes} min
            </p>
            <p className="mt-1 text-xs text-slate-500">
              连续打卡 {streakDays} 天 · 周区间 {weekRange.start} ~ {weekRange.end}
            </p>
          </div>
          <Tag color={weeklyMinutes >= weeklyGoalMinutes ? 'success' : 'primary'} fill="outline">
            {Math.min(100, Math.round((weeklyMinutes / weeklyGoalMinutes) * 100))}%
          </Tag>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{
              width: `${Math.min(100, Math.round((weeklyMinutes / weeklyGoalMinutes) * 100))}%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">周目标可在 Settings → Habit 修改。</p>
      </Card>

      <Card title="Focus (Pomodoro)" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="text-sm text-slate-500">
          默认 25/5，专注结束可一键记录到今天。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button block color="primary" size="large" onClick={() => navigate('/focus')}>
            开始专注
          </Button>
          <Button block fill="outline" size="large" onClick={() => navigate('/stats')}>
            查看统计
          </Button>
        </div>
      </Card>

      <Card title="答题复习" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="text-sm text-slate-500">
          今日待复习 <span className="font-semibold text-slate-900">{dueReviewCount}</span> 题 ·
          每天 3~10 分钟巩固学习内容。
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button block color="primary" size="large" onClick={() => navigate('/review')} disabled={dueReviewCount === 0}>
            {dueReviewCount ? `开始复习（${dueReviewCount}）` : '暂无到期题卡'}
          </Button>
          <Button
            block
            fill="outline"
            size="large"
            onClick={() => navigate(`/review?date=${defaultReviewSourceDate}`)}
          >
            生成题卡
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-400">复习耗时会计入今天学习时长（用于周目标与 streak）。</p>
      </Card>

      <Card title="AI 任务拆解" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <p className="text-sm text-slate-500">
          给一个目标，让 AI 拆成可执行任务，然后一键加入任务列表。
        </p>
        <div className="mt-4">
          <Button block fill="outline" size="large" onClick={() => setAiDecomposeOpen(true)}>
            拆解目标
          </Button>
        </div>
      </Card>

      <Card title="AI 点评" className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {todayLog?.duration > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              {todayLog.aiFeedback === null
                ? '点评生成中…'
                : todayLog?.aiFeedback?.trim()
                  ? todayLog.aiFeedback
                  : '尚未生成点评（可手动生成）'}
            </p>
            <div className="flex items-center gap-2">
              <Button size="small" fill="outline" onClick={refreshTodayLog} disabled={loading}>
                刷新
              </Button>
              <Button
                size="small"
                fill="outline"
                onClick={generateTodayFeedback}
                disabled={loading}
              >
                生成点评
              </Button>
              <Button
                size="small"
                color="primary"
                onClick={() => navigate(`/day/${todayKey}`)}
              >
                查看详情
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">完成一次打卡后会生成点评。</p>
        )}
      </Card>

      <Card
        title="任务列表"
        extra={
          <div className="flex items-center gap-2">
            <Button
              size="small"
              fill={taskViewMode === 'focus' ? 'solid' : 'outline'}
              color="primary"
              onClick={() => setTaskViewMode('focus')}
            >
              今日专注
            </Button>
            <Button
              size="small"
              fill={taskViewMode === 'all' ? 'solid' : 'outline'}
              onClick={() => setTaskViewMode('all')}
            >
              全部任务
            </Button>
            <Button
              size="small"
              fill={manageTasks ? 'solid' : 'outline'}
              color="primary"
              onClick={() => setManageTasks((prev) => !prev)}
            >
              管理
            </Button>
            <Button
              size="small"
              fill={showDoneTasks ? 'solid' : 'outline'}
              onClick={() => setShowDoneTasks((prev) => !prev)}
            >
              已完成
            </Button>
          </div>
        }
        className="rounded-2xl border border-slate-100 bg-white shadow-sm"
      >
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">还没有任务，先创建一个吧。</p>
        ) : (
          <>
            {/* 渲染按日期分组的任务 */}
            {Object.entries(displayedGroups).map(([groupKey, groupTasks]) => {
              if (groupTasks.length === 0) return null
              const groupConfig = DATE_GROUP_LABELS[groupKey]
              const Icon = groupConfig.icon

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
                    {groupTasks.map((task) => (
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
                  {Object.entries(displayedGroups).map(([groupKey, groupTasks]) => {
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

            {showDoneTasks && doneTasks.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  已完成
                </p>
                <List>
                  {doneTasks.map((task) => (
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
          <Button block color="default" size="large" fill="outline" onClick={() => setTaskOpen(true)}>
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
                {tasks.filter((task) => task.isDone).length}
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
        title="AI 任务拆解"
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
            text: aiWorking ? '添加中...' : '一键加入任务',
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
          <div className="space-y-3">
            <TextArea
              placeholder="目标：例如「两周内把 React 基础打牢」"
              value={aiGoal}
              onChange={setAiGoal}
              rows={3}
              showCount
              maxLength={200}
            />
            <TextArea
              placeholder="约束（可选）：例如「每天 30 分钟，周末 2 小时」"
              value={aiConstraints}
              onChange={setAiConstraints}
              rows={2}
              showCount
              maxLength={200}
            />

            {aiGeneratedTasks.length > 0 ? (
              <div className="rounded-xl bg-slate-50 p-2">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Preview
                </p>
                <List>
                  {aiGeneratedTasks.map((task, index) => (
                    <List.Item key={`${task.title}-${index}`}>
                      <span className="text-slate-700">
                        {task.title}
                        {task.estimateMinutes ? `（约${task.estimateMinutes}m）` : ''}
                      </span>
                    </List.Item>
                  ))}
                </List>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                点击“生成”后会在这里预览任务列表。
              </p>
            )}
          </div>
        }
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
          setEditingTask(null)
          setEditingTitle('')
          setEditingPlannedDate(null)
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
            setEditingTask(null)
            setEditingTitle('')
            setEditingPlannedDate(null)
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
        onClose={() => setTaskOpen(false)}
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
