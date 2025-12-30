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
} from 'antd-mobile'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, PencilLine, Trash2 } from 'lucide-react'
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
import { useNavigate } from 'react-router-dom'

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
  const [duration, setDuration] = useState('')
  const [content, setContent] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [savingCheckin, setSavingCheckin] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState(null)
  const [editingTask, setEditingTask] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const feedbackPollingRef = useRef(false)
  const [aiDecomposeOpen, setAiDecomposeOpen] = useState(false)
  const [aiGoal, setAiGoal] = useState('')
  const [aiConstraints, setAiConstraints] = useState('')
  const [aiGeneratedTasks, setAiGeneratedTasks] = useState([])
  const [aiWorking, setAiWorking] = useState(false)

  const todayLog = useMemo(
    () => logs.find((log) => log.date === todayKey),
    [logs, todayKey]
  )
  const completedCount = tasks.filter((task) => task.isDone).length

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
      const task = await createTask(user.id, title)
      setTasks((prev) => [...prev, task])
      setTaskOrder((prev) => {
        const next = [...prev.filter((id) => id !== task.id), task.id]
        saveTaskOrder(user.id, next)
        return next
      })
      setTaskOpen(false)
      setTaskTitle('')
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
  }

  const handleSaveEdit = async () => {
    const title = editingTitle.trim()
    if (!editingTask || !title) {
      Toast.show({ content: '请输入任务内容' })
      return
    }
    setUpdatingTaskId(editingTask.id)
    try {
      const updated = await updateTask(user.id, editingTask.id, { title })
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setEditingTask(null)
      setEditingTitle('')
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
          <Tag color={todayLog ? 'success' : 'warning'} fill="outline">
            {completedCount}/{tasks.length} done
          </Tag>
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
        title="Task Radar"
        extra={
          <div className="flex items-center gap-2">
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
            {!manageTasks ? (
              <List>
                {activeTasks.map((task) => (
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
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={activeTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  <List>
                    {activeTasks.map((task) => (
                      <SortableTaskItem
                        key={task.id}
                        task={task}
                        disabled={updatingTaskId === task.id}
                        onToggle={handleToggleTask}
                      />
                    ))}
                  </List>
                </SortableContext>
              </DndContext>
            )}

            {showDoneTasks && doneTasks.length > 0 ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Completed
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
          <Button block color="primary" size="large" onClick={() => setCheckinOpen(true)}>
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
          }
        }}
        content={
          <Input
            placeholder="任务内容"
            value={editingTitle}
            onChange={setEditingTitle}
            clearable
          />
        }
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
          <Input
            placeholder="例如：复盘算法笔记"
            value={taskTitle}
            onChange={setTaskTitle}
            clearable
          />
        }
      />
    </div>
  )
}

export default Today
